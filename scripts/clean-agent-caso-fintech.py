#!/usr/bin/env python3
"""Clean fintech/growth case hero using the same pipeline as agent poses."""
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".pydeps"))

from PIL import Image
from rembg import remove

_poses_spec = importlib.util.spec_from_file_location(
    "clean_agent_poses", ROOT / "scripts/clean-agent-poses.py"
)
_poses = importlib.util.module_from_spec(_poses_spec)
_poses_spec.loader.exec_module(_poses)

CURSOR_ASSETS = Path("/Users/victor/.cursor/projects/Users-victor-TELVOICE-CHILE/assets")
SRC_NAME = "ChatGPT_Image_6_jun_2026__07_51_39_p.m.__5_-a8b3ae9a-d5ee-4d32-a32e-8d81ae8c0a09.png"
OUT_PNG = ROOT / "assets/telvoice-agent-caso-fintech-hero.png"
OUT_WEBP = ROOT / "assets/telvoice-agent-caso-fintech-hero.webp"


def clean_caso_fintech_hero() -> Image.Image:
    src = CURSOR_ASSETS / SRC_NAME
    if not src.exists():
        src = ROOT / "assets/telvoice-agent-caso-fintech-source.png"
    cut = remove(Image.open(src))
    cut = _poses.keep_largest_component(cut)
    cut = _poses.defringe(cut)
    return _poses.normalize_canvas(cut)


def main() -> None:
    clean = clean_caso_fintech_hero()
    OUT_PNG.parent.mkdir(parents=True, exist_ok=True)
    clean.save(OUT_PNG, "PNG", optimize=True)
    clean.save(OUT_WEBP, "WEBP", lossless=True, quality=95, method=6)
    print(f"png: {OUT_PNG} ({OUT_PNG.stat().st_size} bytes)")
    print(f"webp: {OUT_WEBP} ({OUT_WEBP.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
