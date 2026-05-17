// First-launch content downloader. Registers the service worker, then asks it
// to pre-fetch every audio + photo file listed in manifest.json. Shows a
// progress overlay so you know when it's safe to leave WiFi.

import { get, set } from "./storage.js";

const VERSION_KEY = "contentVersion";

export async function ensureContentCached() {
  if (!("serviceWorker" in navigator)) return;

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  let manifest;
  try {
    const res = await fetch("/content/manifest.json", { cache: "no-cache" });
    if (!res.ok) return; // no content yet — handled by Home page
    manifest = await res.json();
  } catch {
    return;
  }

  const cachedVersion = get(VERSION_KEY);
  if (cachedVersion === manifest.generatedAt) return; // already cached this build

  const urls = collectUrls(manifest);
  await downloadAll(urls, manifest.generatedAt);
}

function collectUrls(manifest) {
  const urls = ["/content/manifest.json"];
  for (const city of manifest.cities) {
    for (const site of city.sites) {
      for (const ch of site.chapters) {
        urls.push(`/content/${ch.audio}`);
        urls.push(`/content/${ch.script}`);
      }
      if (site.tips) urls.push(`/content/${site.tips}`);
      if (site.photo?.file) urls.push(`/content/${site.photo.file}`);
    }
  }
  return urls;
}

async function downloadAll(urls, version) {
  const overlay = createOverlay();
  document.body.appendChild(overlay);
  const fill = overlay.querySelector(".dl-progress-fill");
  const status = overlay.querySelector(".dl-status");

  let done = 0;
  const cache = await caches.open("tg-content-v1");

  // Skip URLs already cached
  const toFetch = [];
  for (const url of urls) {
    if (await cache.match(url)) {
      done++;
    } else {
      toFetch.push(url);
    }
  }
  const total = urls.length;
  updateUi(done, total, fill, status);

  // Fetch in small parallel batches
  const concurrency = 4;
  for (let i = 0; i < toFetch.length; i += concurrency) {
    const batch = toFetch.slice(i, i + concurrency);
    await Promise.all(batch.map(async url => {
      try {
        const res = await fetch(url, { cache: "no-cache" });
        if (res.ok) await cache.put(url, res.clone());
      } catch (e) {
        console.warn("dl fail", url, e);
      }
      done++;
      updateUi(done, total, fill, status);
    }));
  }

  set(VERSION_KEY, version);
  status.textContent = "Ready — works offline now.";
  setTimeout(() => overlay.remove(), 900);
}

function updateUi(done, total, fill, status) {
  const pct = total ? Math.round((done / total) * 100) : 100;
  fill.style.width = pct + "%";
  status.textContent = `Downloading ${done} / ${total} files…`;
}

function createOverlay() {
  const el = document.createElement("div");
  el.className = "dl-overlay";
  el.innerHTML = `
    <div class="dl-card">
      <h3>Preparing your tour</h3>
      <p>Downloading audio and photos so they work without signal. Connect to WiFi for the fastest experience.</p>
      <div class="dl-progress"><div class="dl-progress-fill"></div></div>
      <div class="dl-status">Starting…</div>
    </div>`;
  return el;
}
