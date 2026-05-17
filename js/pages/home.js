import { loadManifest } from "../lib/manifest.js";

export async function renderHome(root) {
  let manifest;
  try {
    manifest = await loadManifest();
  } catch (e) {
    root.innerHTML = `
      <div class="empty-state">
        <h2>No content yet</h2>
        <p>${escapeHtml(e.message)}</p>
        <p>From <code>content-gen/</code> run <code>npm run gen</code> then <code>npm run copy</code>.</p>
      </div>`;
    return;
  }
  root.innerHTML = `
    <div class="home-hero">
      <div class="eyebrow">Audio Tour</div>
      <h1>Italia</h1>
      <p>Tap a city to see the sites. Tap a site to start listening.</p>
    </div>
    <div class="city-list">
      ${manifest.cities.map(c => `
        <a class="city-card" href="#/city/${c.id}">
          <div class="city-name">${escapeHtml(c.name)}</div>
          <div class="city-blurb">${escapeHtml(c.blurb || "")}</div>
          <div class="city-meta">${c.sites.length} site${c.sites.length === 1 ? "" : "s"}</div>
        </a>
      `).join("")}
    </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
