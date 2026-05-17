import { route, start } from "./lib/router.js";
import { mount as mountPlayer } from "./lib/player.js";
import { ensureContentCached } from "./lib/install.js";
import { renderHome } from "./pages/home.js";
import { renderCity } from "./pages/city.js";
import { renderSite } from "./pages/site.js";

const app = document.getElementById("app");

// Player lives outside the routed view so it persists between pages.
const playerEl = document.createElement("div");
playerEl.className = "player";
playerEl.id = "player";
document.body.appendChild(playerEl);
mountPlayer(playerEl);

route("/", root => renderHome(root));
route("/city/:cityId", (root, params) => renderCity(root, params));
route("/site/:cityId/:siteId", (root, params) => renderSite(root, params));

let cachePrimed = false;

start(({ params, render }) => {
  app.scrollTo?.(0, 0);
  window.scrollTo(0, 0);
  render(app, params);

  if (!cachePrimed) {
    cachePrimed = true;
    ensureContentCached().catch(e => console.warn("content cache failed", e));
  }
});
