/*
 * Tab Volume — background (event page)
 *
 * Owns the source of truth for each tab's gain level, stored in
 * storage.session (in-memory, cleared when the browser closes). Keyed by
 * `gain:<tabId>` and removed when the tab closes, so a level never outlives
 * its tab.
 */
"use strict";

const DEFAULT_GAIN = 1.0;
const keyFor = (tabId) => `gain:${tabId}`;

async function readGain(tabId) {
  if (typeof tabId !== "number") return DEFAULT_GAIN;
  const key = keyFor(tabId);
  const stored = await browser.storage.session.get(key);
  const value = stored[key];
  return typeof value === "number" ? value : DEFAULT_GAIN;
}

async function writeGain(tabId, gain) {
  await browser.storage.session.set({ [keyFor(tabId)]: gain });
}

browser.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || !msg.type) return;

  switch (msg.type) {
    // From a content script: what level should this tab be at?
    case "getGain":
      return readGain(sender.tab && sender.tab.id).then((gain) => ({ gain }));

    // From the popup: report the active tab's current level + metadata.
    case "getActiveTabGain":
      return (async () => {
        const [tab] = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tab) return null;
        const gain = await readGain(tab.id);
        return {
          tabId: tab.id,
          gain,
          title: tab.title || tab.url || "",
          audible: !!tab.audible,
        };
      })();

    // From the popup: set a tab's level (persist + push to its content scripts).
    case "setGain":
      return (async () => {
        const tabId = msg.tabId;
        if (typeof tabId !== "number") return { ok: false };
        // Validate + clamp (0x–6x). `Number(x) || DEFAULT` would turn 0 into 1.
        const n = Number(msg.gain);
        const gain = Number.isFinite(n) ? Math.max(0, Math.min(6, n)) : DEFAULT_GAIN;
        await writeGain(tabId, gain);
        try {
          await browser.tabs.sendMessage(tabId, { type: "applyGain", gain });
        } catch (_) {
          // No content script in that tab (e.g. about: pages). Fine.
        }
        return { ok: true };
      })();
  }
});

// Clean up a tab's stored level when it closes.
browser.tabs.onRemoved.addListener((tabId) => {
  browser.storage.session.remove(keyFor(tabId)).catch(() => {});
});
