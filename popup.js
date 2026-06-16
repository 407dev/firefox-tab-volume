/*
 * Tab Volume — popup
 *
 * Controls the active tab only. Reads the tab's current level from the
 * background on open, and pushes changes back as the slider moves.
 */
"use strict";

const slider = document.getElementById("slider");
const valueEl = document.getElementById("value");
const readout = document.querySelector(".readout");
const titleEl = document.getElementById("tab-title");
const hintEl = document.getElementById("hint");
const resetBtn = document.getElementById("reset");

let tabId = null;

function render(percent) {
  valueEl.textContent = String(percent);
  readout.classList.toggle("boosted", percent > 100);
}

function setLevel(percent) {
  percent = Math.max(0, Math.min(600, Math.round(percent)));
  slider.value = String(percent);
  render(percent);
  if (tabId == null) return;
  browser.runtime
    .sendMessage({ type: "setGain", tabId, gain: percent / 100 })
    .catch(() => {});
}

async function init() {
  let info = null;
  try {
    info = await browser.runtime.sendMessage({ type: "getActiveTabGain" });
  } catch (_) {
    /* ignore */
  }

  if (!info) {
    titleEl.textContent = "No active tab";
    slider.disabled = true;
    resetBtn.disabled = true;
    return;
  }

  tabId = info.tabId;
  titleEl.textContent = info.title || "Current tab";
  const percent = Math.round((info.gain || 1) * 100);
  slider.value = String(percent);
  render(percent);

  if (!info.audible && percent === 100) {
    hintEl.textContent = "No audio detected yet — works once it plays.";
  }
}

slider.addEventListener("input", () => {
  hintEl.textContent = "";
  setLevel(Number(slider.value));
});

resetBtn.addEventListener("click", () => {
  hintEl.textContent = "";
  setLevel(100);
});

for (const btn of document.querySelectorAll(".presets button")) {
  btn.addEventListener("click", () => {
    hintEl.textContent = "";
    setLevel(Number(btn.dataset.level));
  });
}

init();
