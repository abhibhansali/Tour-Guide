// Singleton audio player. Renders into the #player element pinned to the
// bottom of the screen. Tracks playback position per-chapter in localStorage
// so you can resume mid-chapter the next day.

import { get, set } from "./storage.js";

let audio = null;
let current = null; // { siteId, siteName, chapter, queue, queueIndex, autoAdvance }
let el = null;
let onUpdate = null;

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

export function mount(rootEl) {
  el = rootEl;
  audio = new Audio();
  audio.preload = "auto";
  audio.playbackRate = get("playbackRate", 1);
  audio.addEventListener("timeupdate", () => {
    saveProgress();
    render();
  });
  audio.addEventListener("ended", () => {
    if (current) clearProgress();
    if (current?.autoAdvance && current.queueIndex < current.queue.length - 1) {
      playFromQueue(current.queueIndex + 1);
    } else {
      render();
    }
  });
  audio.addEventListener("play", render);
  audio.addEventListener("pause", render);
  audio.addEventListener("loadedmetadata", render);

  setupMediaSession();
}

export function onPlayStateChange(fn) {
  onUpdate = fn;
}

export function getCurrent() {
  return current;
}

export function isPlaying(siteId, chapterId) {
  return !!(current && current.siteId === siteId && current.chapter.id === chapterId && !audio.paused);
}

export function playChapter(site, chapter, queue = null, queueIndex = 0) {
  const autoAdvance = get("autoAdvance", true);
  current = {
    siteId: site.id,
    siteName: site.name,
    chapter,
    queue: queue || [chapter],
    queueIndex,
    autoAdvance,
  };
  audio.src = "content/" + chapter.audio;
  audio.playbackRate = get("playbackRate", 1);
  const saved = get(`pos.${site.id}.${chapter.id}`, 0);
  audio.currentTime = saved > 1 && saved < 1e6 ? saved : 0;
  audio.play().catch(err => console.warn("playback failed", err));
  updateMediaSessionMetadata();
  render();
}

function playFromQueue(i) {
  if (!current) return;
  const chapter = current.queue[i];
  current.chapter = chapter;
  current.queueIndex = i;
  audio.src = "content/" + chapter.audio;
  audio.playbackRate = get("playbackRate", 1);
  audio.currentTime = 0;
  audio.play();
  updateMediaSessionMetadata();
  render();
}

function cycleSpeed() {
  const cur = audio.playbackRate || 1;
  const idx = SPEEDS.findIndex(s => Math.abs(s - cur) < 0.01);
  const next = SPEEDS[(idx + 1) % SPEEDS.length];
  audio.playbackRate = next;
  set("playbackRate", next);
  render();
}

function fmtSpeed(s) {
  return (s % 1 === 0 ? s.toFixed(0) : s.toString()) + "×";
}

function toggle() {
  if (audio.paused) audio.play();
  else audio.pause();
}

function skip(deltaSec) {
  audio.currentTime = Math.max(0, Math.min((audio.duration || 0), audio.currentTime + deltaSec));
}

function next() {
  if (current && current.queueIndex < current.queue.length - 1) {
    playFromQueue(current.queueIndex + 1);
  }
}

function prev() {
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
  } else if (current && current.queueIndex > 0) {
    playFromQueue(current.queueIndex - 1);
  }
}

function close() {
  audio.pause();
  current = null;
  render();
}

function saveProgress() {
  if (!current || !audio.duration) return;
  set(`pos.${current.siteId}.${current.chapter.id}`, audio.currentTime);
}

function clearProgress() {
  if (!current) return;
  set(`pos.${current.siteId}.${current.chapter.id}`, 0);
}

function fmtTime(s) {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function render() {
  if (!el) return;
  if (!current) {
    el.classList.remove("open");
    el.innerHTML = "";
    if (onUpdate) onUpdate();
    return;
  }
  const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
  const playing = !audio.paused;
  el.classList.add("open");
  el.innerHTML = `
    <div class="player-inner">
      <div class="player-top">
        <div class="now-playing">
          <div class="label">${escapeHtml(current.siteName)}</div>
          <div class="title">${escapeHtml(current.chapter.title)}</div>
        </div>
        <button class="close" data-act="close" aria-label="Close">×</button>
      </div>
      <div class="progress" data-act="seek">
        <div class="progress-fill" style="width:${pct}%"></div>
      </div>
      <div class="times">
        <span>${fmtTime(audio.currentTime)}</span>
        <span>${fmtTime(audio.duration)}</span>
      </div>
      <div class="player-controls">
        <button class="ctrl" data-act="prev" aria-label="Previous chapter">⏮</button>
        <button class="ctrl" data-act="back" aria-label="Back 15 seconds">−15</button>
        <button class="ctrl play" data-act="toggle" aria-label="${playing ? "Pause" : "Play"}">${playing ? "❚❚" : "▶"}</button>
        <button class="ctrl" data-act="fwd" aria-label="Forward 30 seconds">+30</button>
        <button class="ctrl" data-act="next" aria-label="Next chapter">⏭</button>
        <button class="ctrl speed" data-act="speed" aria-label="Playback speed">${fmtSpeed(audio.playbackRate || 1)}</button>
      </div>
    </div>`;
  el.querySelector('[data-act="close"]').onclick = close;
  el.querySelector('[data-act="toggle"]').onclick = toggle;
  el.querySelector('[data-act="back"]').onclick = () => skip(-15);
  el.querySelector('[data-act="fwd"]').onclick = () => skip(30);
  el.querySelector('[data-act="next"]').onclick = next;
  el.querySelector('[data-act="prev"]').onclick = prev;
  el.querySelector('[data-act="speed"]').onclick = cycleSpeed;
  el.querySelector('[data-act="seek"]').onclick = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    if (audio.duration) audio.currentTime = ratio * audio.duration;
  };
  if (onUpdate) onUpdate();
}

function setupMediaSession() {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.setActionHandler("play", () => audio.play());
  navigator.mediaSession.setActionHandler("pause", () => audio.pause());
  navigator.mediaSession.setActionHandler("seekbackward", () => skip(-15));
  navigator.mediaSession.setActionHandler("seekforward", () => skip(30));
  navigator.mediaSession.setActionHandler("nexttrack", next);
  navigator.mediaSession.setActionHandler("previoustrack", prev);
}

function updateMediaSessionMetadata() {
  if (!("mediaSession" in navigator) || !current) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: current.chapter.title,
    artist: current.siteName,
    album: "Italy Tour Guide",
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
