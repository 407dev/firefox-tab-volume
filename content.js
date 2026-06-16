/*
 * Tab Volume — content script
 *
 * Runs in every frame of every page. Holds the current gain level for this
 * page and applies it to all <audio>/<video> elements.
 *
 * Volume model:
 *   - level <= 1.0  : set element.volume directly (no Web Audio, no CORS risk).
 *   - level >  1.0  : route the element through a Web Audio GainNode so we can
 *                     exceed the browser's 100% cap. Once an element is routed,
 *                     it stays routed and the GainNode controls it for all
 *                     levels thereafter.
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

  // Route an element through Web Audio. Returns the GainNode, or null if it
  // could not be routed (e.g. already captured by the page, or no context).
  function routeElement(el) {
    if (gainNodes.has(el)) return gainNodes.get(el);
    if (routed.has(el)) return null; // previously failed; don't retry
    routed.add(el);

    const ctx = getContext();
    if (!ctx) return null;

    try {
      const source = ctx.createMediaElementSource(el);
      const gain = ctx.createGain();
      gain.gain.value = currentGain;
      source.connect(gain);
      gain.connect(ctx.destination);
      // The element's own volume now compounds with the gain node, so pin it.
      try { el.volume = 1.0; } catch (_) {}
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
    const gain = gainNodes.get(el);
    if (gain) {
      gain.gain.value = currentGain;
      resumeContext();
      return;
    }

    if (currentGain <= 1.0) {
      // No boost needed: stay on the simple, CORS-safe path.
      try { el.volume = currentGain; } catch (_) {}
      return;
    }

    // Boost requested: route through Web Audio. If routing fails, clamp the
    // element to full volume (best effort).
    const node = routeElement(el);
    if (node) {
      node.gain.value = currentGain;
    } else {
      try { el.volume = 1.0; } catch (_) {}
    }
  }

  function applyAll() {
    for (const el of known) applyTo(el);
  }

  function track(el) {
    if (known.has(el)) return;
    known.add(el);
    applyTo(el);
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
