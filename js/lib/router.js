// Tiny hash-based router. Routes look like #/, #/city/rome, #/site/rome/colosseum.

const routes = [];
let onChange = null;

export function route(pattern, render) {
  const keys = [];
  const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => {
    keys.push(k);
    return "([^/]+)";
  }) + "$");
  routes.push({ re, keys, render });
}

export function navigate(path) {
  window.location.hash = path.startsWith("#") ? path : "#" + path;
}

export function start(handler) {
  onChange = handler;
  window.addEventListener("hashchange", resolve);
  resolve();
}

function resolve() {
  const path = window.location.hash.slice(1) || "/";
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) {
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      onChange({ path, params, render: r.render });
      return;
    }
  }
  onChange({ path, params: {}, render: notFound });
}

function notFound(root) {
  root.innerHTML = `
    <div class="empty-state">
      <h2>Not found</h2>
      <p><a href="#/">Back home</a></p>
    </div>`;
}
