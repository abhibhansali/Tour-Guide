#!/usr/bin/env python3
"""Content pipeline for the Italy tour guide PWA.

Scripts are written by hand and live in this repo. This pipeline:
  - reads each chapter's .txt file
  - narrates it with edge-tts (free Microsoft neural voices)
  - pulls a free-license hero photo per site from Wikimedia Commons
  - emits manifest.json consumed by the PWA

Output layout:
  output/{cityId}/{siteId}/{chapterId}.mp3
  output/{cityId}/{siteId}/photo.jpg (+ photo.json)
  output/manifest.json

Scripts must already exist at output/{cityId}/{siteId}/{chapterId}.txt and
output/{cityId}/{siteId}/tips.txt (for sites with `practical_tips: true`).
The pipeline fails loudly with the path of any missing script.

Usage:
  python generate.py                       # process everything
  python generate.py --site rome/pantheon  # one site (smoke test)
  python generate.py --force               # regenerate audio + photos
  python generate.py --skip-photos
  python generate.py --skip-tts
"""
from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import html
import json
import os
import re
import sys
from pathlib import Path

import requests
import yaml
from dotenv import load_dotenv

import edge_tts

HERE = Path(__file__).resolve().parent
OUT_DIR = HERE / "output"
SCRIPTS_DIR = HERE / "scripts"
SITES_FILE = HERE / "sites.yaml"
PROMPTS_DIR = HERE / "prompts"

load_dotenv(HERE / ".env")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--site", help="Generate only this city/site (e.g. rome/pantheon)")
    p.add_argument("--force", action="store_true", help="Regenerate even if files exist")
    p.add_argument("--skip-photos", action="store_true")
    p.add_argument("--skip-tts", action="store_true")
    args = p.parse_args()

    voice = os.environ.get("TTS_VOICE", "en-US-AndrewMultilingualNeural")
    rate = os.environ.get("TTS_RATE", "-5%")

    config = yaml.safe_load(SITES_FILE.read_text())
    chapter_titles = json.loads((PROMPTS_DIR / "chapters.json").read_text())

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    SCRIPTS_DIR.mkdir(parents=True, exist_ok=True)

    manifest = {
        "generatedAt": dt.datetime.utcnow().isoformat() + "Z",
        "voice": voice,
        "cities": [],
    }

    missing: list[str] = []

    for city in config["cities"]:
        city_entry = {
            "id": city["id"],
            "name": city["name"],
            "blurb": city.get("blurb", ""),
            "chapters": [],
            "photo": None,
            "sites": [],
        }
        manifest["cities"].append(city_entry)

        # ---- City-level chapters + hero photo (new) ----
        # Skip if --site is set and doesn't target this city.
        site_filter_targets_this_city = (
            not args.site or args.site.split("/")[0] == city["id"]
        )

        if site_filter_targets_this_city:
            city_out_dir = OUT_DIR / city["id"]
            city_out_dir.mkdir(parents=True, exist_ok=True)
            scripts_city_dir = SCRIPTS_DIR / city["id"]

            for chapter_id in city.get("chapters", []):
                if chapter_id not in chapter_titles:
                    print(f"  ! unknown chapter type '{chapter_id}' — skipping")
                    continue
                src_txt = scripts_city_dir / f"{chapter_id}.txt"
                out_txt = city_out_dir / f"{chapter_id}.txt"
                if src_txt.exists():
                    script = src_txt.read_text()
                    out_txt.write_text(script)
                elif out_txt.exists():
                    script = out_txt.read_text()
                else:
                    missing.append(str(src_txt))
                    print(f"  ! [city-script] {city['id']}/{chapter_id} MISSING — expected at {src_txt}")
                    continue
                mp3_path = city_out_dir / f"{chapter_id}.mp3"
                if not args.skip_tts:
                    if mp3_path.exists() and not args.force:
                        print(f"  ✓ [city-tts] {city['id']}/{chapter_id} cached")
                    else:
                        print(f"  • [city-tts] {city['id']}/{chapter_id}…")
                        asyncio.run(synthesize(script, mp3_path, voice, rate))
                city_entry["chapters"].append({
                    "id": chapter_id,
                    "title": chapter_titles[chapter_id]["title"],
                    "script": rel(out_txt),
                    "audio": rel(mp3_path),
                    "words": len(script.split()),
                })

            if not args.skip_photos and city.get("photo_query"):
                photo_path = city_out_dir / "photo.jpg"
                photo_json_path = city_out_dir / "photo.json"
                if photo_path.exists() and not args.force:
                    print(f"  ✓ [city-photo] {city['id']} cached")
                    credit = json.loads(photo_json_path.read_text())
                    city_entry["photo"] = {"file": rel(photo_path), "credit": credit}
                else:
                    print(f"  • [city-photo] {city['id']} searching Wikimedia for '{city['photo_query']}'…")
                    res = fetch_wikimedia_photo(city["photo_query"])
                    if res:
                        photo_path.write_bytes(res["bytes"])
                        photo_json_path.write_text(json.dumps(res["credit"], indent=2))
                        city_entry["photo"] = {"file": rel(photo_path), "credit": res["credit"]}
                    else:
                        print(f"  ! [city-photo] no result for '{city['photo_query']}'")

        for site in city["sites"]:
            if args.site and args.site != f"{city['id']}/{site['id']}":
                continue

            print(f"\n=== {city['name']} / {site['name']} ===")
            site_dir = OUT_DIR / city["id"] / site["id"]
            site_dir.mkdir(parents=True, exist_ok=True)
            scripts_site_dir = SCRIPTS_DIR / city["id"] / site["id"]

            site_entry = {
                "id": site["id"],
                "name": site["name"],
                "type": site.get("type", "short"),
                "ticketed": bool(site.get("ticketed")),
                "chapters": [],
                "tips": None,
                "photo": None,
            }

            for chapter_id in site["chapters"]:
                if chapter_id not in chapter_titles:
                    print(f"  ! unknown chapter type '{chapter_id}' — skipping")
                    continue

                # Look for the script first in scripts/ (canonical source).
                # Fall back to a script already in output/ (legacy).
                src_txt = scripts_site_dir / f"{chapter_id}.txt"
                out_txt = site_dir / f"{chapter_id}.txt"

                if src_txt.exists():
                    script = src_txt.read_text()
                    out_txt.write_text(script)  # mirror into output/ for the manifest path
                elif out_txt.exists():
                    script = out_txt.read_text()
                else:
                    missing.append(str(src_txt))
                    print(f"  ! [script] {chapter_id} MISSING — expected at {src_txt}")
                    continue

                mp3_path = site_dir / f"{chapter_id}.mp3"
                if not args.skip_tts:
                    if mp3_path.exists() and not args.force:
                        print(f"  ✓ [tts]    {chapter_id} cached")
                    else:
                        print(f"  • [tts]    {chapter_id}…")
                        asyncio.run(synthesize(script, mp3_path, voice, rate))

                site_entry["chapters"].append({
                    "id": chapter_id,
                    "title": chapter_titles[chapter_id]["title"],
                    "script": rel(out_txt),
                    "audio": rel(mp3_path),
                    "words": len(script.split()),
                })

            if site.get("practical_tips"):
                src_tips = scripts_site_dir / "tips.txt"
                out_tips = site_dir / "tips.txt"
                if src_tips.exists():
                    out_tips.write_text(src_tips.read_text())
                    site_entry["tips"] = rel(out_tips)
                elif out_tips.exists():
                    site_entry["tips"] = rel(out_tips)
                else:
                    missing.append(str(src_tips))
                    print(f"  ! [tips]   MISSING — expected at {src_tips}")

            if not args.skip_photos and site.get("photo_query"):
                photo_path = site_dir / "photo.jpg"
                photo_json_path = site_dir / "photo.json"
                if photo_path.exists() and not args.force:
                    print(f"  ✓ [photo]  cached")
                    credit = json.loads(photo_json_path.read_text())
                    site_entry["photo"] = {"file": rel(photo_path), "credit": credit}
                else:
                    print(f"  • [photo]  searching Wikimedia for '{site['photo_query']}'…")
                    res = fetch_wikimedia_photo(site["photo_query"])
                    if res:
                        photo_path.write_bytes(res["bytes"])
                        photo_json_path.write_text(json.dumps(res["credit"], indent=2))
                        site_entry["photo"] = {"file": rel(photo_path), "credit": res["credit"]}
                    else:
                        print(f"  ! [photo]  no result for '{site['photo_query']}'")

            city_entry["sites"].append(site_entry)

    manifest_path = OUT_DIR / "manifest.json"
    if args.site:
        # --site builds a partial manifest (only the filtered city/site). Writing it
        # would overwrite the canonical manifest with stripped data — exactly the bug
        # that shipped Rome's overview without any sites. Skip the write; rerun the
        # full pipeline (no --site) to update the deployable manifest.
        print(f"\n(skipping manifest write — --site is set; run without --site to rebuild manifest.json)")
    else:
        manifest_path.write_text(json.dumps(manifest, indent=2))
        print(f"\n✓ wrote {manifest_path}")

    if missing:
        print(f"\n! {len(missing)} script file(s) missing — fill these in then re-run:")
        for path in missing:
            print(f"  - {path}")
        sys.exit(1)

    print(f"\nNext: copy output/ into ../app/content/")
    print(f"  python copy_to_app.py")


async def synthesize(text: str, out_path: Path, voice: str, rate: str) -> None:
    communicate = edge_tts.Communicate(text, voice=voice, rate=rate)
    await communicate.save(str(out_path))


_WIKI_HEADERS = {
    # upload.wikimedia.org 403s "generic" UAs that look like bots/scrapers.
    # A real browser UA is what their CDN expects for image requests.
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def _http_get(url: str, **kwargs) -> requests.Response | None:
    """GET with retry-on-429. Wikimedia returns 429 for rapid thumb requests."""
    import time
    for attempt in range(5):
        try:
            r = requests.get(url, headers=_WIKI_HEADERS, timeout=30, **kwargs)
            if r.status_code == 429:
                wait = 2 * (attempt + 1)
                print(f"    (429 rate-limited, retry in {wait}s)")
                time.sleep(wait)
                continue
            r.raise_for_status()
            return r
        except requests.exceptions.RequestException as e:
            if attempt == 4:
                print(f"    ! request failed: {e}")
                return None
            time.sleep(1)
    return None


def fetch_wikimedia_photo(query: str) -> dict | None:
    import time

    params = {
        "action": "query",
        "format": "json",
        "generator": "search",
        "gsrsearch": f"{query} filetype:bitmap",
        "gsrnamespace": "6",
        "gsrlimit": "10",
        "prop": "imageinfo",
        "iiprop": "url|extmetadata|size",
        "iiurlwidth": "1200",
    }
    res = _http_get("https://commons.wikimedia.org/w/api.php", params=params)
    if not res:
        return None
    pages = list((res.json().get("query") or {}).get("pages", {}).values())
    # Wikimedia sorts pages by an "index" key; sort by it so we try most relevant first.
    pages.sort(key=lambda p: p.get("index", 999))

    for page in pages:
        info = (page.get("imageinfo") or [None])[0]
        if not info or not info.get("thumburl"):
            continue
        license_ = (info.get("extmetadata") or {}).get("LicenseShortName", {}).get("value", "")
        if not re.match(r"^(CC|Public domain|PD|Attribution)", license_, re.I):
            continue
        # Strip tracking query string from thumburl — sometimes triggers 429s.
        thumb_url = info["thumburl"].split("?")[0]
        time.sleep(1)  # be polite, avoid rate limits
        img = _http_get(thumb_url)
        if not img:
            continue
        # Sanity check: response must actually be image bytes.
        if not img.headers.get("Content-Type", "").startswith("image/"):
            continue
        artist_raw = (info.get("extmetadata") or {}).get("Artist", {}).get("value", "")
        return {
            "bytes": img.content,
            "credit": {
                "title": page.get("title", ""),
                "artist": html.unescape(re.sub(r"<[^>]*>", "", artist_raw)).strip(),
                "license": license_,
                "sourceUrl": info.get("descriptionurl") or f"https://commons.wikimedia.org/wiki/{page.get('title','').replace(' ', '_')}",
            },
        }
    return None


def rel(p: Path) -> str:
    return str(p.relative_to(OUT_DIR)).replace(os.sep, "/")


if __name__ == "__main__":
    main()
