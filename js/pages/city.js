import { loadManifest, findCity } from "../lib/manifest.js";

export async function renderCity(root, { cityId }) {
  const manifest = await loadManifest();
  const city = findCity(manifest, cityId);
  if (!city) {
    root.innerHTML = `<div class="empty-state"><h2>City not found</h2><p><a href="#/">Back home</a></p></div>`;
    return;
  }
  root.innerHTML = `
    <header class="site-header">
      <a class="back" href="#/" aria-label="Back">‹</a>
      <div class="title">${escapeHtml(city.name)}</div>
    </header>
    <div class="home-hero">
      <h1>${escapeHtml(city.name)}</h1>
      <p>${escapeHtml(city.blurb || "")}</p>
    </div>
    <div class="site-list">
      ${city.sites.map(s => siteCard(city.id, s)).join("")}
    </div>`;
}

function siteCard(cityId, s) {
  const thumb = s.photo?.file ? `style="background-image:url('/content/${s.photo.file}')"` : "";
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
