/*
 * Tab Volume — content script
 *
 * Runs in every frame of every page. Holds the current gain level for this
 * page and applies it to all <audio>/<video> elements.
 *
 * Volume model: the tab level *multiplies* the page's own volume rather than
 * replacing it. A player's slider (e.g. YouTube's) keeps meaning what it
 * says, and the tab level scales on top of it.
 *
 *   - The page sees a virtualized `volume` property: it reads back exactly
 *     what it last set, and our scaling is invisible to it (see
 *     installPageHooks). This avoids fighting players that restore their
 *     own remembered volume, because their writes simply become the "page
 *     volume" we scale.
 *   - level <= 1.0  : element.volume = pageVolume * level (no Web Audio, no
 *                     CORS risk).
 *   - level >  1.0  : route the element through a Web Audio GainNode so we can
 *                     exceed the browser's 100% cap; element.volume stays at
 *                     pageVolume. Once an element is routed, it stays routed
 *                     and the GainNode carries the level thereafter. Media
 *                     Web Audio would silence (cross-origin without CORS,
 *                     DRM) or that the page routes itself is capped at 100%.
 *
 * State lives only in this page, so it is destroyed when the tab/page goes
 * away. The persisted-per-tab level is owned by the background script; we ask
 * for it on load and re-apply it.
 */
(() => {
  "use strict";

  let currentGain = 1.0;
  let audioCtx = null;

  // Elements successfully routed through Web Audio -> their GainNode.
  const gainNodes = new Map();
  // Elements we have attempted to route (so we never call
  // createMediaElementSource twice on the same element, which throws).
  const routed = new WeakSet();
  // Elements we have already seen, so applyAll is idempotent and cheap.
  const known = new Set();
  // The volume each element's page believes it has (what it last set, or the
  // element's volume when we first saw it).
  const pageVolume = new WeakMap();
  // Elements the page itself fed to createMediaElementSource. An element can
  // feed only one source node, so routing it ourselves would break the
  // site's player (e.g. SoundCloud) — these stay on the element.volume path.
  const pageRouted = new WeakSet();

  function getContext() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    return audioCtx;
  }

  function resumeContext() {
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
  }

  function pageVolumeOf(el) {
    let v = pageVolume.get(el);
    if (v === undefined) {
      // First touch: whatever the element has now is the page's volume. Our
      // (Xray) view of el.volume is always the native value.
      v = el.volume;
      pageVolume.set(el, v);
    }
    return v;
  }

  // How much of the tab level is applied via element.volume. Routed elements
  // get the level from their GainNode; a boost that couldn't be routed is
  // clamped to 100% (best effort).
  function volumeFactor(el) {
    return gainNodes.has(el) ? 1 : Math.min(currentGain, 1);
  }

  // Write pageVolume * factor to the element's real volume.
  function syncVolume(el) {
    const target = pageVolumeOf(el) * volumeFactor(el);
    try { if (el.volume !== target) el.volume = target; } catch (_) {}
  }

  // Whether createMediaElementSource on this element will actually carry its
  // audio. Routing is one-way, and for cross-origin media without CORS or
  // DRM (EME) media it permanently outputs silence instead — so only route
  // media whose origin we can vouch for, and otherwise cap at 100%.
  function safeToRoute(el) {
    if (pageRouted.has(el) || el.mediaKeys) return false;
    const src = el.currentSrc;
    // No source yet (retried on loadedmetadata), or a srcObject stream whose
    // origin can't be checked.
    if (!src) return false;
    if (/^(blob|data|mediastream):/.test(src)) return true; // MSE (YouTube etc.)
    try {
      if (new URL(src, location.href).origin === location.origin) return true;
    } catch (_) {
      return false;
    }
    // Loaded with CORS: had the server refused, the element wouldn't play.
    return el.crossOrigin === "anonymous" || el.crossOrigin === "use-credentials";
  }

  // Route an element through Web Audio. Returns the GainNode, or null if it
  // could not be routed (e.g. already captured by the page, or no context).
  function routeElement(el) {
    if (gainNodes.has(el)) return gainNodes.get(el);
    if (routed.has(el)) return null; // previously failed; don't retry
    if (!safeToRoute(el)) return null; // may become safe once it has a source
    routed.add(el);

    const ctx = getContext();
    if (!ctx) return null;

    try {
      const source = ctx.createMediaElementSource(el);
      const gain = ctx.createGain();
      gain.gain.value = currentGain;
      source.connect(gain);
      gain.connect(ctx.destination);
      gainNodes.set(el, gain);
      resumeContext();
      return gain;
    } catch (_) {
      // createMediaElementSource throws if the element is already connected to
      // another source node, or in rare error cases. Fall back to direct
      // volume (boost won't work for this element, but it won't break).
      return null;
    }
  }

  function applyTo(el) {
    // Capture the page's volume before anything below can change it.
    pageVolumeOf(el);
    const gain = gainNodes.get(el);
    if (gain) {
      gain.gain.value = currentGain;
      resumeContext();
    } else if (currentGain > 1.0) {
      routeElement(el);
    }
    syncVolume(el);
  }

  function applyAll() {
    for (const el of known) applyTo(el);
  }

  // Page scripts call our hooks with page objects; normalize them to the
  // same Xray wrapper we get from DOM queries so WeakMap/Set lookups match.
  function toXray(obj) {
    return typeof XPCNativeWrapper === "function" ? XPCNativeWrapper(obj) : obj;
  }

  // Hook a few of the *page's* HTMLMediaElement/AudioContext prototype
  // members (reached via wrappedJSObject, handed back with exportFunction).
  // Our own view of every element is an Xray and keeps using the native
  // members, so there is no recursion. Runs at document_start, before any
  // page script. Firefox-only; a no-op elsewhere.
  function installPageHooks() {
    let pageWindow;
    try {
      pageWindow = window.wrappedJSObject;
      if (!pageWindow || typeof exportFunction !== "function") return;
    } catch (_) {
      return;
    }

    // volume: the page reads back its own volume, and its writes are scaled
    // by the tab level. Players (YouTube) restoring their remembered volume
    // therefore just set the "page volume" instead of fighting us.
    try {
      const native = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "volume");
      const pageProto = pageWindow.HTMLMediaElement.prototype;
      if (native && native.get && native.set) {
        const get = exportFunction(function () {
          const el = toXray(this);
          // Let the native getter reject non-media `this` as usual.
          const real = native.get.call(el);
          const v = pageVolume.get(el);
          return v === undefined ? real : v;
        }, pageWindow);

        const set = exportFunction(function (value) {
          const el = toXray(this);
          const v = Number(value);
          if (!(v >= 0 && v <= 1)) {
            // Let the native setter throw the proper TypeError/IndexSizeError.
            native.set.call(el, value);
            return;
          }
          const before = native.get.call(el);
          const changed = pageVolume.get(el) !== v;
          pageVolume.set(el, v);
          // Also picks up elements never inserted into the DOM (new Audio()).
          track(el);
          syncVolume(el);
          // If the page's volume changed but the real one didn't (e.g. tab
          // level 0%), still give the page the volumechange it expects.
          if (changed && native.get.call(el) === before) {
            Promise.resolve().then(() => el.dispatchEvent(new Event("volumechange")));
          }
        }, pageWindow);

        Object.defineProperty(pageProto, "volume", {
          get,
          set,
          enumerable: native.enumerable,
          configurable: true,
        });
      }
    } catch (_) {}

    // play(): catch media the DOM never shows us (detached new Audio(),
    // closed shadow roots) before it starts playing.
    try {
      const proto = pageWindow.HTMLMediaElement.prototype;
      const originalPlay = proto.play;
      if (typeof originalPlay === "function") {
        proto.play = exportFunction(function (...args) {
          try { track(toXray(this)); } catch (_) {}
          // Reflect.apply keeps `args` in our compartment; passing our array
          // to page code via .apply() fails with a permission error.
          return Reflect.apply(originalPlay, this, args);
        }, pageWindow);
      }
    } catch (_) {}

    // createMediaElementSource(): note elements the page routes itself, so
    // we never take them first and break its audio graph.
    try {
      const proto = pageWindow.AudioContext.prototype;
      const originalCreate = proto.createMediaElementSource;
      if (typeof originalCreate === "function") {
        proto.createMediaElementSource = exportFunction(function (...args) {
          try { if (args[0]) pageRouted.add(toXray(args[0])); } catch (_) {}
          return Reflect.apply(originalCreate, this, args);
        }, pageWindow);
      }
    } catch (_) {}
  }

  installPageHooks();

  function track(el) {
    if (known.has(el)) return;
    known.add(el);
    applyTo(el);
    // A boost can only be routed once the source is known (see safeToRoute),
    // and a new source may change that.
    el.addEventListener("loadedmetadata", () => applyTo(el));
  }

  function scan(root) {
    if (!root || typeof root.querySelectorAll !== "function") return;
    if (root.matches && root.matches("video, audio")) track(root);
    for (const el of root.querySelectorAll("video, audio")) track(el);
  }

  function setGain(level) {
    const n = Number(level);
    // Validate + clamp (0%–600%). Note: `n || 1` would wrongly turn 0 into 1.
    currentGain = Number.isFinite(n) ? Math.max(0, Math.min(6, n)) : 1.0;
    applyAll();
  }

  // --- Discover media elements -------------------------------------------

  scan(document);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => scan(document), { once: true });
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) scan(node);
      }
    }
  });
  observer.observe(document.documentElement || document, {
    childList: true,
    subtree: true,
  });

  // A user gesture lets a suspended AudioContext start producing sound.
  window.addEventListener("pointerdown", resumeContext, { capture: true });
  window.addEventListener("keydown", resumeContext, { capture: true });

  // --- Messaging ----------------------------------------------------------

  browser.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "applyGain") {
      setGain(msg.gain);
    }
  });

  // Ask the background for this tab's stored level and apply it.
  browser.runtime
    .sendMessage({ type: "getGain" })
    .then((res) => {
      if (res && typeof res.gain === "number") setGain(res.gain);
    })
    .catch(() => {});
})();
