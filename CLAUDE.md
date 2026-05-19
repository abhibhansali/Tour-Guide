# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Italy Tour Guide — Claude Code project notes

## What this is

Personal audio + text tour guide PWA for Abhishek and his wife's trip to Italy (Milan, Florence, Rome, Naples / Pompeii). Two users total — no auth, just a public URL.

## Architecture

Intentionally minimal — **two separate halves**:

1. **`content-gen/`** — Python pipeline, run locally before the trip. Reads hand-written tour scripts, runs them through edge-tts for narration, pulls photos from Wikimedia Commons, emits `manifest.json` + MP3s + JPGs.
2. **`app/`** — Plain HTML/CSS/JS PWA. **No build step, no node_modules, no bundler.** ES modules load directly in the browser. Service worker pre-caches everything for offline use.

This split is deliberate: the heavy work happens once, locally. The deployed app is just static files — no backend, no runtime API calls, no keys to leak.

**Scripts are hand-written, not LLM-generated.** Earlier iterations used Google Gemini; that's gone. Abhishek's preference for free + simple drove the pivot, and the LLM-free version is what's in the repo. If you're asked to add a chapter, write the text directly in `content-gen/scripts/`. Site-level chapters live at `scripts/{city}/{site}/{chapter}.txt`; city-level overview chapters live at `scripts/{city}/{chapter}.txt` (no site sub-folder — the `{city}/` directory itself holds them). Tone target lives in `prompts/system.txt` as a reference for *what to imitate*, not as a runtime prompt.

**Two parallel content layers exist in the data model.** Each city has both a `sites` array (individual tour-able locations, with multi-chapter tours, tips, photos) AND a `chapters` array (city-level overview chapters that play on the city page itself) plus an optional city-level `photo` (hero image at the top of the city page). Currently each city has a single `[overview]` chapter (~9 min) covering name origin, history, key people, scientific significance, and modern relevance. The schema is array-shaped so more city-level chapters can be added without re-tooling.

## Tech stack (and why)

- **Python (Anaconda base env)** for content gen — Abhishek already has it. Use `/Users/abhishekbhansali/anaconda3/bin/python3` explicitly; PATH may not have it in non-interactive shells.
- **edge-tts** for TTS — same Microsoft neural voices as Azure Speech but free via the public Edge endpoint. Default voice: `en-US-AndrewMultilingualNeural`.
- **Wikimedia Commons** for photos — filtered to CC / Public Domain licenses. **Photo queries must be 1–2 words** (e.g. `"Pantheon"`, not `"Pantheon Rome interior oculus"`) or the search returns nothing CC-licensed. Photo downloads require a browser-like User-Agent — `upload.wikimedia.org` 403s "generic" UAs. Both gotchas are baked into `generate.py`. **Also disambiguate ambiguous place names** — `"Rome skyline"` returned Rome, Georgia. For cities sharing a name with somewhere else, use a unique landmark or viewpoint (e.g. `"Rome from Janiculum"`) rather than just `"<city> skyline"`. **Watch aspect ratio** — Wikimedia panoramas can be 6:1 or wider, which crop poorly into the 16:10 hero photo box. Verify the photo opens to a normal landscape proportion after generation.
- **Plain HTML + ES modules** for the PWA — no build tool needed. Even though Node is installed (`/opt/homebrew/bin/node`), we don't use it for this project.
- **Netlify Drop / Vercel / GitHub Pages** for deploy — all free tier.

**Total cost: $0.** Stay there. If a future change requires a paid service, push back and look for a free alternative first.

## Common commands

All Python commands use the Anaconda Python explicitly to avoid PATH confusion:

```bash
# Smoke test one site (does NOT write manifest.json — see gotcha below)
cd content-gen
/Users/abhishekbhansali/anaconda3/bin/python3 generate.py --site rome/pantheon

# Generate everything (idempotent, writes manifest.json)
/Users/abhishekbhansali/anaconda3/bin/python3 generate.py

# Force regen
/Users/abhishekbhansali/anaconda3/bin/python3 generate.py --force

# Copy generated content into the repo root for deploy
/Users/abhishekbhansali/anaconda3/bin/python3 copy_to_app.py

# Serve the app locally (from project root)
cd ..
/Users/abhishekbhansali/anaconda3/bin/python3 -m http.server 8000

# Deploy: just push
git add -A && git commit -m "Update content" && git push
```

**`--site` gotcha:** `generate.py --site <id>` only builds the filtered city/site and intentionally skips writing `manifest.json` because the partial result would clobber the canonical full manifest (this bug shipped to production once — `--site rome` stripped all sites from the manifest). Use `--site` for smoke-testing scripts/audio/photos only. To update the deployable manifest, always run the full `generate.py` after iterating.

## File layout (annotated)

```
Tour Guide/
├── content-gen/
│   ├── sites.yaml              # SITE LIST — edit this to add/remove sites or city overviews
│   ├── generate.py             # pipeline: scripts/ → edge-tts → MP3s + Wikimedia photos + manifest
│   ├── copy_to_app.py
│   ├── scripts/                # HAND-WRITTEN CHAPTERS
│   │   ├── {city}/{chapter}.txt        # CITY-LEVEL overview (e.g. rome/overview.txt)
│   │   └── {city}/{site}/{chapter}.txt # SITE-LEVEL chapter (e.g. rome/pantheon/history.txt)
│   ├── prompts/
│   │   ├── system.txt          # TONE REFERENCE (not used at runtime) — imitate this when writing
│   │   ├── chapters.json       # per-chapter titles used by the manifest
│   │   └── tips.txt
│   ├── .env                    # TTS_VOICE, TTS_RATE — gitignored
│   ├── .env.example
│   └── output/                 # generated files, gitignored
# PWA files at repo root (served by GitHub Pages at abhibhansali.github.io/Tour-Guide/)
├── index.html
├── styles.css
├── manifest.webmanifest
├── sw.js                       # service worker (cache-first for /content/*)
├── icons/icon.svg
├── content/                    # populated by copy_to_app.py — committed (GitHub Pages serves it)
├── js/
│   ├── main.js                 # entry; router + boot
│   ├── lib/
│   │   ├── router.js           # tiny hash router
│   │   ├── storage.js          # localStorage helpers, "tg." prefix
│   │   ├── manifest.js         # loads /content/manifest.json
│   │   ├── player.js           # singleton audio player + Media Session + speed control (0.75×–2×)
│   │   └── install.js          # SW registration + bulk content cache
│   └── pages/
│       ├── home.js             # city list
│       ├── city.js             # city hero photo + "About <City>" overview chapter + site grid
│       └── site.js             # chapters + photo + tips + audio player
├── CLAUDE.md                   # this file
└── README.md                   # user-facing docs
```

**Deployment:** the repo is `abhibhansali/Tour-Guide` (a GitHub project-pages repo). GitHub Pages serves the root of the `main` branch at `https://abhibhansali.github.io/Tour-Guide/`. The app uses `<base href="./">` in `index.html` + relative URLs everywhere so it works at any sub-path — don't reintroduce leading-slash absolute URLs. The service worker computes its own `SW_BASE` from `self.location.pathname` for the same reason. Workflow: `git push` = live in ~30 seconds. No build step, no CI.

## Conventions to preserve

- **No build step.** ES modules use `.js` extensions in import paths so browsers can resolve them. Don't add a bundler unless there's a strong reason.
- **No backend.** The deployed app is 100% static.
- **No auth.** Abhishek explicitly removed the passcode gate — the app is open. Don't re-add a login layer (Entra ID, OAuth, passcode) unless he asks for one. The audio is not sensitive.
- **No runtime LLM.** Scripts are hand-written `.txt` files in `content-gen/scripts/`. Don't introduce runtime or build-time LLM calls — they break offline use, add ongoing cost, and reintroduce a dependency Abhishek explicitly removed (free tier issues with his org Google account triggered the pivot).
- **Cache versioning.** `install.js` keys offline cache by `manifest.generatedAt`. When you regenerate content, the version changes and clients re-download. Don't break this.
- **Service worker scope.** SW is at `/sw.js` and handles `/content/*` cache-first, JS/CSS network-first, navigations network-first. The cache name (`tg-shell-vN`) needs bumping when you break wire format. Keep the SW at the root.
- **`?nosw` escape hatch.** `index.html` recognizes `?nosw` in the URL and unregisters any service worker, wipes caches, and reloads. Use this when debugging stuck-cache issues. Don't remove.
- **Idempotent generation.** `generate.py` skips MP3s and photos that exist on disk unless `--force`. Preserve this — it makes iteration fast and avoids rate-limit issues with Wikimedia.

## Things NOT to do

- Don't add `npm install` / `package.json` / `vite.config.js` back. We deliberately stripped them.
- Don't gitignore the `content/` directory at repo root — GitHub Pages can only serve what's in the repo. MP3s, JPGs, `manifest.json` are all committed deliberately (~180 MB). `content-gen/output/` is the working dir and *is* gitignored; `content/` at the root is the deploy artifact and *is not*.
- Don't run `generate.py --site` and expect the manifest to update — see the `--site` gotcha in Common commands.
- Don't switch back to paid Azure / OpenAI services. Free stack is a hard requirement.

## Deploying

**Current setup: GitHub Pages project-pages** at `abhibhansali.github.io/Tour-Guide/`. `git push` triggers a redeploy in ~30 seconds. The app uses `<base href="./">` + relative URLs + a service worker that computes its own `SW_BASE` from `self.location.pathname` so it works at any sub-path. Do not reintroduce leading-slash absolute URLs.

Service workers require HTTPS — GitHub Pages provides it for free. Local dev on `localhost` is allowed without HTTPS.

## Trip dates / status

- Trip cities: Milan, Florence, Rome, Naples / Pompeii
- Ticketed attractions: Colosseum, Vatican Museums, Milan Cathedral (Duomo), Pompeii
- Walking-only stops: Trevi Fountain, Pantheon, Piazza Navona
- Decisions made (see `~/.claude/plans/cheeky-snuggling-torvalds.md` for full plan):
  - Single warm narrator (default: `en-US-AndrewMultilingualNeural`)
  - Multi-chapter format (4–6 chapters per major site, ~15–25 min total)
  - Photos + practical tips for major sites
  - Manual site selection (no GPS)

## When working in this repo

If asked to add features:
- **Adding a site:** add an entry to `content-gen/sites.yaml` under the city's `sites:` list, write the chapter `.txt` files under `content-gen/scripts/{city}/{site}/`, then `python generate.py && python copy_to_app.py`. Photo queries should be 1–2 words.
- **Adding a city-level overview chapter:** add the chapter id to that city's `chapters:` array in `sites.yaml`, write the script at `content-gen/scripts/{city}/{chapter}.txt`, run `python generate.py && python copy_to_app.py`. Current convention is one `[overview]` chapter per city, ~1200–1500 words.
- **Editing wording of an existing chapter:** edit the `.txt` file in `content-gen/scripts/...`, delete the matching `.mp3` in `content-gen/output/...`, re-run full `generate.py`. Only the changed chapter regenerates.
- **Changing voice:** edit `TTS_VOICE` in `content-gen/.env`, then `python generate.py --force` (or delete the `.mp3` files first to keep scripts).
- **Changing tone for new writing:** edit `prompts/system.txt` for your own reference — but you (Claude) are the one writing the new chapters; the file isn't fed to anything at runtime.
- **Visual tweaks:** edit `styles.css` (at repo root). The color palette uses terracotta (`#7a2e1f`) + cream (`#fdf6ec`) + Playfair Display / Inter — Italian-themed, not corporate.

Chapter writing style (lifted from `prompts/system.txt`): 350–450 words for site chapters, 1200–1500 for city overviews. Conversational, present-tense, concrete details, no clichés. Address them as "you". Don't open with "Welcome to" or "step back in time". Don't end with "Enjoy your visit." Spell out numbers under twenty; say "seventy-nine A.D." not "79 AD". **Lean into nerd-friendly detail** — Abhishek is a science-loving reader. Specific dates, named figures, materials science, engineering, astronomy when applicable. Examples already in the corpus: MIT 2023 paper on self-healing Roman concrete in the Rome overview; Cristofori inventing the piano in 1720 in the Florence overview; Pliny the Elder as the first recorded scientific casualty in the Naples overview; Schiaparelli's Mars "canali" mistranslation in the Milan overview.

If asked to add real authentication or move off free services: stop and confirm with Abhishek first. The free + simple constraint is load-bearing.

## Future direction: globe home page (when country #2 is added)

The app is currently Italy-only and the home page is a flat list of four cities. When a second country is added, Abhishek wants the home page to become an interactive world globe where you tap a country to drill into its cities, with available countries visually highlighted. **Don't build this until country #2 exists** — a globe with one country highlighted is overkill and the implementation is cheaper and more obvious once the second country shapes the design.

When the time comes, the planned approach (within our zero-build, zero-dependency constraints):

1. **Data model.** Add a `country` field to each city in `sites.yaml` (ISO 3166 alpha-2 codes: `IT`, `JP`, etc.). `generate.py` groups cities by country in `manifest.json` — new top-level shape: `{ countries: [{ code, name, cities: [...] }] }`.
2. **Routes.** Add `/country/:isoCode` between `/` (now a country selector) and `/city/:cityId`. The existing `/city/:cityId` route stays unchanged — country pages link straight to cities.
3. **Map.** Use a static SVG world map with ISO codes as `id` attributes on each `<path>` (the Wikimedia public-domain `BlankMap-World.svg` is the canonical source; ~150–300 KB after minification). Inline it in `home.js` so click handlers can attach to the path elements directly. CSS rules color countries with content (terracotta fill) versus muted gray for the rest, driven by `data-has-content="true"` set at render time.
4. **Tiny countries.** Vatican, Monaco, Singapore, etc. are unclickable at thumbnail size. Either grow their tap targets at render time (offset overlay), or supplement the map with a scrollable list of available countries below it as a fallback. Decide based on which countries are actually in the app.
5. **No 3D globe library.** `globe.gl`, `three-globe`, and `d3-geo` all add npm dependencies or build complexity. We don't use them. A 2D world map projected statically is enough and keeps the no-build constraint intact.
6. **Cache size.** The SVG map is a one-time download. Add it to the install.js pre-cache list so it stays offline.

Ask Abhishek what country #2 is when he raises this — it shapes the design (continent placement, RTL languages, regional clustering).
