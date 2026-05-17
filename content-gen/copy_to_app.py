#!/usr/bin/env python3
"""Copy generated content from output/ into ../content/ for the PWA."""
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "output"
DEST = HERE.parent / "content"

if not SRC.exists():
    raise SystemExit(f"No output yet — run `python generate.py` first.")

DEST.mkdir(parents=True, exist_ok=True)

count = 0
for src_path in SRC.rglob("*"):
    if src_path.is_dir():
        continue
    rel = src_path.relative_to(SRC)
    dst_path = DEST / rel
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src_path, dst_path)
    count += 1

print(f"✓ copied {count} files → {DEST}")
