#!/usr/bin/env python3
"""Clean Empresas, fintech y growth case hero -> transparent PNG/WebP."""
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".pydeps"))

import numpy as np
from PIL import Image
from rembg import remove

_poses_spec = importlib.util.spec_from_file_location(
    "clean_agent_poses", ROOT / "scripts/clean-agent-poses.py"
)
_poses = importlib.util.module_from_spec(_poses_spec)
_poses_spec.loader.exec_module(_poses)

CANVAS = 1024
SRC = ROOT / "assets/telvoice-agent-caso-empresas-fintech-growth-source.png"
OUT_PNG = ROOT / "assets/telvoice-agent-caso-empresas-fintech-growth-hero.png"
OUT_WEBP = ROOT / "assets/telvoice-agent-caso-empresas-fintech-growth-hero.webp"


def defringe_dark(img: Image.Image) -> Image.Image:
    """Remove near-black background bleed left on the silhouette edge."""
    arr = np.array(img.convert("RGBA"), dtype=np.int16)
    rgb = arr[:, :, :3]
    a = arr[:, :, 3]
    lum = rgb.mean(axis=2)
    spread = rgb.max(axis=2) - rgb.min(axis=2)
    dark_neutral = (lum < 42) & (spread < 30)
    a[dark_neutral] = 0
    arr[:, :, 3] = a
    arr[a == 0, :3] = 0
    return Image.fromarray(arr.astype(np.uint8))


def normalize_canvas(img: Image.Image, size: int = CANVAS) -> Image.Image:
    bbox = img.getbbox()
    if not bbox:
        raise RuntimeError("Empty image after background removal")
    pad = int(max(img.size) * 0.035)
    x0, y0, x1, y1 = bbox
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(img.size[0], x1 + pad), min(img.size[1], y1 + pad)
    cropped = img.crop((x0, y0, x1, y1))
    cw, ch = cropped.size
    scale = min((size * 0.88) / cw, (size * 0.88) / ch)
    nw, nh = max(1, int(cw * scale)), max(1, int(ch * scale))
    resized = cropped.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(resized, ((size - nw) // 2, int((size - nh) * 0.46)), resized)
    return canvas


def clean_caso_fintech_hero(src_path: Path = SRC) -> Image.Image:
    cut = remove(Image.open(src_path))
    cut = _poses.keep_largest_component(cut)
    cut = _poses.defringe(cut)
    cut = defringe_dark(cut)
    return normalize_canvas(cut)


def main() -> None:
    clean = clean_caso_fintech_hero()
    OUT_PNG.parent.mkdir(parents=True, exist_ok=True)
    clean.save(OUT_PNG, "PNG", optimize=True)
    clean.save(OUT_WEBP, "WEBP", lossless=True, quality=95, method=6)
    print(f"png: {OUT_PNG} ({OUT_PNG.stat().st_size} bytes)")
    print(f"webp: {OUT_WEBP} ({OUT_WEBP.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
