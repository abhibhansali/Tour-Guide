// Loads and caches the content manifest in memory.

let cache = null;

export async function loadManifest() {
  if (cache) return cache;
  const res = await fetch("content/manifest.json", { cache: "no-cache" });
  if (!res.ok) throw new Error("manifest.json missing — generate it from content-gen/ first");
  cache = await res.json();
  return cache;
}

export function findCity(manifest, cityId) {
  return manifest.cities.find(c => c.id === cityId);
}

export function findSite(manifest, cityId, siteId) {
  const city = findCity(manifest, cityId);
  return { city, site: city?.sites.find(s => s.id === siteId) };
}
