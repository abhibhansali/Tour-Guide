# Italy Tour Guide

A personal, offline-first audio + text tour guide PWA for our Italy trip (Milan, Florence, Rome, Naples / Pompeii). **Fully free** to build, generate, and host.

Two pieces:

- **`content-gen/`** — Python script. Uses **Google Gemini** (free tier) for tour scripts, **edge-tts** (free Microsoft neural voices) for narration, and **Wikimedia Commons** (free CC photos). Outputs static MP3s, JPGs, transcripts, and `manifest.json`.
- **`app/`** — Plain HTML/CSS/JS PWA. **No build step, no Node, no bundler.** ES modules in the browser directly. Service worker pre-caches every audio file and photo on first launch so it works in airplane mode.

---

## What you need

- Python (you already have it via Anaconda — `/Users/abhishekbhansali/anaconda3/bin/python3`)
- A free Google Gemini API key — [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (Sign in with any Google account, click "Get API key", copy. No card required. Free tier: 1500 requests/day.)
- A free Netlify or Vercel account for hosting (Netlify Drop needs no install)

Total ongoing cost: **$0**.

---

## One-time setup

### 1. Install the two Python packages

Already done if you ran this once — but for reference:

```bash
/Users/abhishekbhansali/anaconda3/bin/python3 -m pip install edge-tts google-genai
```

`pyyaml`, `requests`, `python-dotenv` are already in your Anaconda base env.

### 2. Configure content-gen

```bash
cd content-gen
cp .env.example .env
# Edit .env, paste your GEMINI_API_KEY
```

`.env` is gitignored — your key never leaves the laptop.

---

## Generating content

### Smoke test one site first (~30 seconds, $0)

```bash
cd content-gen
python generate.py --site rome/pantheon
```

Open the generated files and listen:

```
output/rome/pantheon/arrival.txt    arrival.mp3
output/rome/pantheon/history.txt    history.mp3
output/rome/pantheon/what_to_notice.txt    what_to_notice.mp3
output/rome/pantheon/tips.txt
output/rome/pantheon/photo.jpg      photo.json
```

If the tone or pacing isn't right:

- Edit `prompts/system.txt` (overall voice — calm, conversational, no clichés).
- Edit `prompts/chapters.json` (per-chapter instructions).
- Or just edit a single `.txt` file directly and delete its `.mp3` to regenerate only the audio.
- Re-run with `--force` to overwrite everything.

### Generate everything

```bash
python generate.py        # ~10–15 min total
python copy_to_app.py     # copies output/ → ../app/content/
```

Idempotent — re-running skips files that already exist.

### Editing the site list

Edit `content-gen/sites.yaml`. Add or remove sites, change chapter lists, change `photo_query`. Re-run `python generate.py && python copy_to_app.py`.

---

## Running the PWA locally

From the project root:

```bash
python -m http.server 8000
```

Open `http://localhost:8000` on your laptop.

To test on your phone over WiFi:

```bash
# Find your Mac's IP:
ipconfig getifaddr en0
# Then open http://<that-ip>:8000 on your phone (same WiFi)
```

Note: service workers require HTTPS, **except on localhost**. Local testing on localhost works fine. For phone-via-IP testing, the service worker won't register (no HTTPS) but the app still functions — just not offline. Deploy to get the real offline experience.

---

## Deploying

The project is set up as a GitHub Pages user-pages repo (`abhibhansali.github.io`). Deploys are automatic on push to `main`:

```bash
git add -A
git commit -m "Add Japan, update Pantheon arrival chapter"
git push
```

Live in ~30 seconds at `https://abhibhansali.github.io/`. HTTPS, no build step, no CI.

To add a new place:

```bash
# 1. Edit content-gen/sites.yaml to add the new city + sites
# 2. Write the chapter scripts in content-gen/scripts/<city>/<site>/*.txt
cd content-gen
python generate.py        # generates new MP3s and photos
python copy_to_app.py     # copies into ../content/
cd ..
git add -A && git commit -m "Add <city>" && git push
```

Your phones already have the app installed — they detect the manifest version change on next WiFi connection and silently re-download the new content in the background.

---

## Pre-trip checklist

Do all of this at home before flying:

- [ ] Generate all content
- [ ] Listen to Colosseum, Vatican, and Pompeii chapters end-to-end
- [ ] Deploy to Netlify / Vercel / GitHub Pages
- [ ] On both phones: open the URL, wait for the "Preparing your tour" overlay to finish (~30 sec depending on file sizes)
- [ ] Tap Share → "Add to Home Screen"
- [ ] **Critical test:** put phone in airplane mode, force-quit the app, reopen from home screen, navigate to Colosseum, play a chapter. Photos should render.
- [ ] Test lock-screen controls: start a chapter, lock the phone, use the lock-screen media controls (play/pause/skip-15).

---

## How it stays offline

1. First load (on WiFi) — the install overlay downloads every audio file, photo, transcript, and tips file listed in `manifest.json` into the browser's Cache Storage.
2. The service worker (`/sw.js`) intercepts every `/content/*` fetch and serves from cache before going to the network.
3. Audio uses the Media Session API so the lock-screen / notification-tray controls work and audio keeps playing when the screen is off.
4. Playback position is saved per chapter in `localStorage` — pause mid-chapter at the Colosseum security check, resume after.

---

## Costs

- Google Gemini 2.0 Flash (free tier, 1500 RPD): **$0**
- edge-tts (free Microsoft Edge voices): **$0**
- Wikimedia Commons (free CC photos): **$0**
- Netlify / Vercel / GitHub Pages (free tier): **$0**
- **Total: $0**.

---

## Troubleshooting

**"Missing env vars: GEMINI_API_KEY"**
Copy `content-gen/.env.example` to `content-gen/.env` and paste your key.

**"No content yet" on the home screen**
Run `python generate.py && python copy_to_app.py`. Then refresh the browser.

**edge-tts hangs or 403s**
edge-tts uses a public Microsoft endpoint; if Microsoft rate-limits, wait a minute and re-run — already-generated files are skipped automatically. Try a different voice (`TTS_VOICE` in `.env`) if it persists.

**Service worker doesn't register on phone via local IP**
That's expected — SWs need HTTPS except on localhost. Deploy to Netlify for HTTPS.

**Audio doesn't autoplay on iOS Safari**
First playback must come from a user tap (browser autoplay policy). The UI starts audio only on button presses, so this should be fine.

**Wrong photo for a site**
Edit the `photo_query` in `sites.yaml`, delete the cached `output/<city>/<site>/photo.jpg`, re-run.

---

## File layout

```
abhibhansali.github.io/     ← the git repo
├── content-gen/                # local content pipeline (source)
│   ├── sites.yaml              # site/chapter list — edit to add places
│   ├── generate.py             # edge-tts + Wikimedia pipeline
│   ├── copy_to_app.py          # copies output/ → ../content/
│   ├── scripts/                # hand-written chapter scripts
│   │   └── <city>/<site>/<chapter>.txt
│   ├── prompts/
│   │   ├── system.txt          # tone reference (not runtime)
│   │   └── chapters.json       # chapter titles for manifest
│   ├── .env                    # TTS_VOICE etc — gitignored
│   └── output/                 # generation working dir — gitignored
├── content/                    # what gets served — committed
├── index.html                  # PWA entry
├── styles.css
├── manifest.webmanifest        # PWA manifest
├── sw.js                       # service worker
├── icons/icon.svg
├── js/
│   ├── main.js                 # entry — router + boot
│   ├── lib/                    # router, player, storage, etc.
│   └── pages/                  # home, city, site
├── CLAUDE.md
└── README.md
```
