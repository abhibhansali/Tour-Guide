import { loadManifest, findCity } from "../lib/manifest.js";
import { playChapter, getCurrent, onPlayStateChange } from "../lib/player.js";

export async function renderCity(root, { cityId }) {
  const manifest = await loadManifest();
  const city = findCity(manifest, cityId);
  if (!city) {
    root.innerHTML = `<div class="empty-state"><h2>City not found</h2><p><a href="#/">Back home</a></p></div>`;
    return;
  }

  const hero = city.photo?.file
    ? `<div class="site-hero" style="background-image:url('content/${city.photo.file}')"></div>`
    : "";
  const credit = city.photo?.credit
    ? `<div class="photo-credit">Photo: ${escapeHtml(city.photo.credit.title || "")} · ${escapeHtml(city.photo.credit.license || "")} · <a href="${city.photo.credit.sourceUrl}" target="_blank" rel="noopener">source</a></div>`
    : "";

  const cityChapters = Array.isArray(city.chapters) ? city.chapters : [];
  const aboutSection = cityChapters.length
    ? `
      <div class="section-heading">About ${escapeHtml(city.name)}</div>
      <div class="chapter-list" id="city-chapters">
        ${cityChapters.map(ch => cityChapterItem(ch)).join("")}
      </div>`
    : "";

  root.innerHTML = `
    <header class="site-header">
      <a class="back" href="#/" aria-label="Back">‹</a>
      <div class="title">${escapeHtml(city.name)}</div>
    </header>
    ${hero}
    <div class="site-content">
      <h1>${escapeHtml(city.name)}</h1>
      ${credit}
      <p>${escapeHtml(city.blurb || "")}</p>
      ${aboutSection}
      <div class="section-heading">Sites</div>
    </div>
    <div class="site-list">
      ${city.sites.map(s => siteCard(city.id, s)).join("")}
    </div>`;

  // Wire up city-chapter taps + highlight currently-playing chapter
  const update = () => {
    const cur = getCurrent();
    root.querySelectorAll("#city-chapters .chapter-item").forEach(it => {
      const id = it.dataset.chapterId;
      it.classList.toggle("playing", !!(cur && cur.siteId === city.id && cur.chapter.id === id));
    });
  };
  onPlayStateChange(update);
  update();

  root.querySelectorAll("#city-chapters .chapter-item").forEach(it => {
    it.onclick = () => {
      const id = it.dataset.chapterId;
      const i = cityChapters.findIndex(c => c.id === id);
      // Pass the city as the "site" — player only reads .id and .name.
      playChapter(city, cityChapters[i], cityChapters, i);
    };
  });
}

function cityChapterItem(ch) {
  const mins = ch.words ? Math.max(1, Math.round(ch.words / 155)) : null;
  return `
    <button class="chapter-item" data-chapter-id="${ch.id}">
      <div class="play-icon">▶</div>
      <div class="meta">
        <div class="title">${escapeHtml(ch.title)}</div>
        ${mins ? `<div class="length">~${mins} min</div>` : ""}
      </div>
    </button>`;
}

function siteCard(cityId, s) {
  const thumb = s.photo?.file ? `style="background-image:url('content/${s.photo.file}')"` : "";
  const badges = [];
  if (s.type === "major") badges.push(`<span class="badge major">Major</span>`);
  if (s.ticketed) badges.push(`<span class="badge ticketed">Ticketed</span>`);
  return `
    <a class="site-card" href="#/site/${cityId}/${s.id}">
      <div class="thumb" ${thumb}></div>
      <div class="body">
        <div class="site-name">${escapeHtml(s.name)}</div>
        <div class="badges">${badges.join("")}</div>
      </div>
    </a>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
