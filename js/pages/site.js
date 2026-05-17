import { loadManifest, findSite } from "../lib/manifest.js";
import { playChapter, getCurrent, onPlayStateChange } from "../lib/player.js";

export async function renderSite(root, { cityId, siteId }) {
  const manifest = await loadManifest();
  const { city, site } = findSite(manifest, cityId, siteId);
  if (!site) {
    root.innerHTML = `<div class="empty-state"><h2>Site not found</h2><p><a href="#/">Back home</a></p></div>`;
    return;
  }

  const tips = site.tips ? await fetchText(`/content/${site.tips}`) : null;
  const scripts = {};
  for (const ch of site.chapters) {
    scripts[ch.id] = await fetchText(`/content/${ch.script}`);
  }

  const hero = site.photo?.file
    ? `<div class="site-hero" style="background-image:url('/content/${site.photo.file}')"></div>`
    : "";
  const credit = site.photo?.credit
    ? `<div class="photo-credit">Photo: ${escapeHtml(site.photo.credit.title || "")} · ${escapeHtml(site.photo.credit.license || "")} · <a href="${site.photo.credit.sourceUrl}" target="_blank" rel="noopener">source</a></div>`
    : "";

  root.innerHTML = `
    <header class="site-header">
      <a class="back" href="#/city/${city.id}" aria-label="Back">‹</a>
      <div class="title">${escapeHtml(site.name)}</div>
    </header>
    ${hero}
    <div class="site-content">
      <h1>${escapeHtml(site.name)}</h1>
      ${credit}

      <div class="section-heading">Chapters</div>
      <div class="chapter-list" id="chapters">
        ${site.chapters.map(ch => chapterItem(ch, scripts[ch.id])).join("")}
      </div>

      ${tips ? `
        <div class="section-heading">Practical tips</div>
        <div class="tips-list">
          <ul>
            ${tips.split("\n").map(l => l.trim()).filter(Boolean).map(l => `<li>${escapeHtml(l)}</li>`).join("")}
          </ul>
        </div>
      ` : ""}
    </div>`;

  const update = () => {
    const cur = getCurrent();
    root.querySelectorAll(".chapter-item").forEach(it => {
      const id = it.dataset.chapterId;
      it.classList.toggle("playing", !!(cur && cur.siteId === site.id && cur.chapter.id === id));
    });
  };
  onPlayStateChange(update);
  update();

  root.querySelectorAll(".chapter-item").forEach(it => {
    it.onclick = () => {
      const id = it.dataset.chapterId;
      const i = site.chapters.findIndex(c => c.id === id);
      playChapter(site, site.chapters[i], site.chapters, i);
    };
  });

  root.querySelectorAll(".script-toggle").forEach(btn => {
    btn.onclick = () => {
      const body = btn.nextElementSibling;
      body.hidden = !body.hidden;
      btn.textContent = body.hidden ? "Show transcript" : "Hide transcript";
    };
  });
}

function chapterItem(ch, script) {
  // Rough length estimate from word count: ~155 wpm narrated.
  const mins = ch.words ? Math.max(1, Math.round(ch.words / 155)) : null;
  return `
    <button class="chapter-item" data-chapter-id="${ch.id}">
      <div class="play-icon">▶</div>
      <div class="meta">
        <div class="title">${escapeHtml(ch.title)}</div>
        ${mins ? `<div class="length">~${mins} min</div>` : ""}
      </div>
    </button>
    <button class="script-toggle" data-chapter-id="${ch.id}">Show transcript</button>
    <div class="script-body" hidden>${escapeHtml(script || "")}</div>`;
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) return "";
  return res.text();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
