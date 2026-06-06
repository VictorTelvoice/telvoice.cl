#!/usr/bin/env python3
"""Clean Telvoice floating agent: center crop + rembg + largest blob."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".pydeps"))

import numpy as np
from PIL import Image
from rembg import remove

SRC = Path(
    "/Users/victor/.cursor/projects/Users-victor-TELVOICE-CHILE/assets/"
    "ChatGPT_Image_3_jun_2026__06_37_56_p.m.__3_-75eeb790-dae8-43df-b9d9-0902e681bfca.png"
)
CANVAS = 1024
OUT_PNG = ROOT / "assets/telvoice-agent-floating-clean.png"
OUT_WEBP = ROOT / "assets/telvoice-agent-floating-clean.webp"


def normalize_canvas(img: Image.Image, size: int = CANVAS) -> Image.Image:
    bbox = img.getbbox()
    if not bbox:
        raise RuntimeError("Empty image")
    pad = int(max(img.size) * 0.035)
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(img.size[0], x1 + pad)
    y1 = min(img.size[1], y1 + pad)
    cropped = img.crop((x0, y0, x1, y1))
    cw, ch = cropped.size
    scale = min((size * 0.88) / cw, (size * 0.88) / ch)
    nw, nh = max(1, int(cw * scale)), max(1, int(ch * scale))
    resized = cropped.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(resized, ((size - nw) // 2, int((size - nh) * 0.46)), resized)
    return canvas


def keep_largest_component(img: Image.Image) -> Image.Image:
    arr = np.array(img.convert("RGBA"))
    alpha = arr[:, :, 3]
    mask = alpha > 40
    h, w = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    best = []

    for sy in range(h):
        for sx in range(w):
            if not mask[sy, sx] or visited[sy, sx]:
                continue
            stack = [(sx, sy)]
            visited[sy, sx] = True
            comp = []
            while stack:
                x, y = stack.pop()
                comp.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and mask[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = True
                        stack.append((nx, ny))
            if len(comp) > len(best):
                best = comp

    cleaned = np.zeros_like(arr)
    for x, y in best:
        cleaned[y, x] = arr[y, x]
    return Image.fromarray(cleaned, "RGBA")


def defringe(img: Image.Image) -> Image.Image:
    arr = np.array(img.convert("RGBA"), dtype=np.int16)
    rgb = arr[:, :, :3]
    a = arr[:, :, 3]
    lum = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]
    spread = rgb.max(axis=2) - rgb.min(axis=2)
    fringe = (lum > 220) & (spread < 28) & (a > 0) & (a < 245)
    a[fringe] = np.clip(a[fringe] - 120, 0, 255)
    arr[:, :, 3] = a
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def main():
    cut = remove(Image.open(SRC))
    cut = keep_largest_component(cut)
    cut = defringe(cut)
    clean = normalize_canvas(cut)

    OUT_PNG.parent.mkdir(parents=True, exist_ok=True)
    clean.save(OUT_PNG, "PNG", optimize=True)
    clean.save(OUT_WEBP, "WEBP", lossless=True, quality=95, method=6)
    print(f"png: {OUT_PNG} size={clean.size} bytes={OUT_PNG.stat().st_size}")
    print(f"webp: {OUT_WEBP} bytes={OUT_WEBP.stat().st_size}")


if __name__ == "__main__":
    main()
