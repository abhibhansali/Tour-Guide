# Travel Audio Tour Guide

A personal, offline-first audio + text tour guide PWA — built for a trip to Italy (Milan, Florence, Rome, Naples / Pompeii) and designed to grow as more places get added. **Fully free** to build, generate, and host.

**Live at:** [abhibhansali.github.io/Tour-Guide](https://abhibhansali.github.io/Tour-Guide/)

Two pieces:

- **`content-gen/`** — Python pipeline. Reads hand-written tour scripts (no LLM), runs them through **edge-tts** for narration (free Microsoft neural voices), pulls hero photos from **Wikimedia Commons** under CC licenses, and emits `manifest.json` + MP3s + JPGs.
- **PWA at repo root** — Plain HTML / CSS / JS. **No build step, no Node, no bundler.** ES modules in the browser directly. Service worker pre-caches every audio file and photo on first launch so it works in airplane mode.

---

## What you need

- Python (you already have it via Anaconda — `/Users/abhishekbhansali/anaconda3/bin/python3`)
- A GitHub account (deploys via GitHub Pages — already configured for `abhibhansali`)

Total ongoing cost: **$0**.

---

## One-time setup

Install the two Python packages needed for generation:

```bash
/Users/abhishekbhansali/anaconda3/bin/python3 -m pip install edge-tts pyyaml
```

`requests` and `python-dotenv` are already in your Anaconda base env.

That's it. There's no API key to obtain, no service to sign up for. Edge-TTS and Wikimedia are both anonymous public endpoints.

---

## Adding a new place

This is the workflow you'll repeat for every new trip:

```bash
# 1. Add the city + sites to content-gen/sites.yaml
#    (chapter types: arrival, history, architecture, stories,
#     what_to_notice, bigger_picture, short)

# 2. Write the chapter scripts as plain .txt files:
#    content-gen/scripts/<city>/<site>/<chapter>.txt
#    Each chapter: 350-450 words, conversational, see prompts/system.txt
#    for the tone reference.

# 3. Generate (idempotent — only new files get processed)
cd content-gen
/Users/abhishekbhansali/anaconda3/bin/python3 generate.py

# 4. Copy generated content into the deploy location
/Users/abhishekbhansali/anaconda3/bin/python3 copy_to_app.py

# 5. Deploy
cd ..
git add -A
git commit -m "Add <city>"
git push
```

Live in ~30 seconds after the push. Phones already have the app installed pick up the new content the next time they're on WiFi.

---

## Generating content

### Smoke-test a single site

```bash
cd content-gen
/Users/abhishekbhansali/anaconda3/bin/python3 generate.py --site rome/pantheon
```

Open the generated MP3 and check the voice / pacing:

```
output/rome/pantheon/arrival.mp3
output/rome/pantheon/history.mp3
output/rome/pantheon/what_to_notice.mp3
output/rome/pantheon/photo.jpg
```

If something's off:
- **Tone wrong?** Edit the `.txt` script directly in `content-gen/scripts/rome/pantheon/`. Delete the matching `.mp3` to force regeneration.
- **Wrong voice?** Change `TTS_VOICE` in `content-gen/.env`. Run with `--force` to regenerate all audio.
- **Wrong speaking rate?** Change `TTS_RATE` in `content-gen/.env` (e.g., `-5%` slows down, `+10%` speeds up).
- **Wrong photo?** Edit the `photo_query` in `sites.yaml` (keep queries short — 1–2 words). Delete the cached `photo.jpg` and re-run.

### Generate everything

```bash
/Users/abhishekbhansali/anaconda3/bin/python3 generate.py        # ~10–15 min for full regen
/Users/abhishekbhansali/anaconda3/bin/python3 copy_to_app.py     # copies output/ → ../content/
```

`generate.py` is idempotent — it skips MP3s and photos that exist on disk unless you pass `--force`.

### Useful flags

```bash
generate.py --site <city>/<site>   # Only one site
generate.py --force                # Regenerate everything
generate.py --skip-tts             # Skip narration (photos + manifest only)
generate.py --skip-photos          # Skip Wikimedia fetch (audio + manifest only)
```

---

## Running locally

From the project root:

```bash
/Users/abhishekbhansali/anaconda3/bin/python3 -m http.server 8000
```

Open `http://localhost:8000` on your laptop.

To test on your phone over WiFi:

```bash
ipconfig getifaddr en0           # your Mac's IP
# Open http://<that-ip>:8000 on your phone (same WiFi)
```

Service workers require HTTPS, **except on localhost**. Local laptop testing works fully. Phone-via-IP testing works for audio + UI but the service worker won't register, so it won't be offline. Deploy to test the real offline experience.

If a cached service worker gets stuck, append `?nosw` to the URL — `index.html` recognizes this flag and clears all SWs and caches, then reloads.

---

## Deploying

Deploys are automatic on every push to `main`:

```bash
git add -A
git commit -m "Update Pantheon what_to_notice"
git push
```

Live in ~30 seconds at https://abhibhansali.github.io/Tour-Guide/. HTTPS for free. No CI to wait on.

---

## Installing on phones (one-time, before traveling)

Do this at home over WiFi:

1. Open https://abhibhansali.github.io/Tour-Guide/ on the phone.
2. Wait for the **"Preparing your tour"** overlay to finish. It downloads ~180 MB of audio and photos into the browser cache. Takes 1–3 min on home WiFi.
3. Tap **Share → Add to Home Screen** (iOS Safari) or **menu → Install app** (Android Chrome).
4. **Critical test:** put the phone in airplane mode, force-quit the app, reopen from the home screen, navigate to any site, play a chapter. Photos and audio should both work.

That's it. The phones are now self-contained for the trip. The laptop stays home.

---

## How it stays offline

1. First load (on WiFi) — `js/lib/install.js` downloads every audio file, photo, transcript, and tips file listed in `manifest.json` into the browser's Cache Storage.
2. The service worker (`/sw.js`) intercepts every `/content/*` fetch and serves from cache before hitting the network.
3. Audio uses the Media Session API so lock-screen / notification-tray controls work, and audio keeps playing when the screen is off.
4. Playback position is saved per chapter in `localStorage` — pause mid-chapter at the Colosseum security check, resume after.
5. When you push new content, the manifest's `generatedAt` timestamp changes. The next time the phone is online, it silently re-downloads in the background.

---

## Costs

- edge-tts (free Microsoft Edge voices): **$0**
- Wikimedia Commons (free CC photos): **$0**
- GitHub Pages (free for public repos): **$0**
- **Total: $0**.

---

## Troubleshooting

**"No content yet" on the home screen**
Run `python generate.py && python copy_to_app.py`, then refresh. If just deployed, give GitHub Pages ~30 seconds to publish.

**edge-tts hangs or 403s**
edge-tts uses a public Microsoft endpoint; if rate-limited, wait a minute and re-run. Already-generated files are skipped automatically. If it persists, try a different voice (`TTS_VOICE` in `.env`).

**Wikimedia photo download fails / no result**
Photo queries must be short (1–2 words). `"Pompeii"` works; `"Pompeii ruins Vesuvius"` doesn't. The `User-Agent` header in `generate.py` is set to look like a browser because `upload.wikimedia.org` 403s "generic" UAs.

**Stuck service worker on phone**
Append `?nosw` to the URL. The page detects it, unregisters any SW, wipes caches, and reloads.

**Service worker doesn't register on phone via local IP**
That's expected — SWs need HTTPS except on localhost. The deployed `https://abhibhansali.github.io/Tour-Guide/` works.

**Audio doesn't autoplay on iOS Safari**
First playback must come from a user tap (browser autoplay policy). The UI only starts audio on button presses, so this is fine.

**Push fails with auth error**
GitHub disabled password auth. Install `gh` (`brew install gh && gh auth login`) — it sets up git credential helper automatically. Future pushes are silent.

---

## File layout

```
Tour-Guide/                     ← the git repo (deployed at /Tour-Guide/)
├── content-gen/                # local content pipeline (source)
│   ├── sites.yaml              # site/chapter list — edit to add places
│   ├── generate.py             # edge-tts + Wikimedia pipeline
│   ├── copy_to_app.py          # copies output/ → ../content/
│   ├── scripts/                # hand-written chapter scripts
│   │   └── <city>/<site>/<chapter>.txt
│   ├── prompts/
│   │   ├── system.txt          # tone reference (not used at runtime)
│   │   └── chapters.json       # chapter titles for manifest
│   ├── .env                    # TTS_VOICE, TTS_RATE — gitignored
│   └── output/                 # generation working dir — gitignored
├── content/                    # what gets served — committed
├── index.html                  # PWA entry
├── styles.css
├── manifest.webmanifest        # PWA manifest
├── sw.js                       # service worker
├── icons/icon.svg
├── js/
│   ├── main.js                 # entry — router + boot
│   ├── lib/                    # router, player, storage, install, manifest
│   └── pages/                  # home, city, site
├── CLAUDE.md                   # notes for future Claude sessions
└── README.md
```
