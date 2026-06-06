#!/usr/bin/env python3
"""Clean fintech/growth case hero: remove red studio background safely."""
import sys
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".pydeps"))

import numpy as np
from PIL import Image
from rembg import remove
from scipy import ndimage

CANVAS = 1024
SRC = ROOT / "assets/telvoice-agent-caso-fintech-source.png"
OUT_PNG = ROOT / "assets/telvoice-agent-caso-fintech-hero.png"
OUT_WEBP = ROOT / "assets/telvoice-agent-caso-fintech-hero.webp"


def is_red_bg(r: np.ndarray, g: np.ndarray, b: np.ndarray) -> np.ndarray:
    ri, gi, bi = r.astype(np.int16), g.astype(np.int16), b.astype(np.int16)
    return (ri > gi + 28) & (ri > bi + 28) & (ri > 95)


def flood_red_bg(r: np.ndarray, g: np.ndarray, b: np.ndarray) -> np.ndarray:
    h, w = r.shape
    candidate = is_red_bg(r, g, b)
    bg = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if candidate[y, x]:
                bg[y, x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if candidate[y, x] and not bg[y, x]:
                bg[y, x] = True
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and candidate[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True
                q.append((nx, ny))
    return bg


def peel_red_fringe(fg: np.ndarray, r: np.ndarray, g: np.ndarray, b: np.ndarray, *, iterations: int = 14) -> np.ndarray:
    h, w = fg.shape
    fg = fg.copy()
    peel = is_red_bg(r, g, b) | ((r.astype(np.int16) > g + 18) & (r > 110))
    for _ in range(iterations):
        changed = 0
        remove = np.zeros((h, w), dtype=bool)
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                if not fg[y, x] or not peel[y, x]:
                    continue
                outside = sum(not fg[y + dy, x + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx)
                if outside >= 3:
                    remove[y, x] = True
                    changed += 1
        fg &= ~remove
        if not changed:
            break
    return fg


def build_foreground_mask(src: np.ndarray) -> np.ndarray:
    rgb = src[:, :, :3]
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    spread = np.max(rgb.astype(np.int16), axis=2) - np.min(rgb.astype(np.int16), axis=2)
    avg = rgb.astype(np.int16).mean(axis=2)

    red_bg = flood_red_bg(r, g, b)
    pre = src.copy()
    pre[red_bg, :3] = [0, 180, 90]
    pre[red_bg, 3] = 255

    cut = np.array(remove(Image.fromarray(pre)))
    rembg_fg = cut[:, :, 3] > 115

    colorful = (spread > 24) | (avg < 175) | (~is_red_bg(r, g, b) & (spread > 14))
    colorful_zone = ndimage.binary_dilation(colorful, iterations=12)
    neutral = (spread <= 32) & (avg >= 165)
    white_near = neutral & ndimage.binary_dilation(colorful_zone, iterations=20)

    fg = rembg_fg | white_near | colorful
    fg &= ~red_bg
    fg = ndimage.binary_fill_holes(fg)
    fg = peel_red_fringe(fg, r, g, b)

    struct = np.ones((3, 3), dtype=bool)
    fg = ndimage.binary_closing(fg, structure=struct, iterations=1)
    fg = ndimage.binary_opening(fg, structure=struct, iterations=1)
    fg = ndimage.binary_erosion(fg, iterations=1)
    fg = ndimage.binary_fill_holes(fg)
    fg &= ~is_red_bg(r, g, b)
    return fg


def apply_alpha(src: np.ndarray, fg: np.ndarray) -> np.ndarray:
    out = src.copy()
    core = ndimage.binary_erosion(fg, iterations=1)
    edge = fg & ~core
    alpha = np.zeros(src.shape[:2], dtype=np.uint8)
    alpha[core] = 255
    alpha[edge] = 215

    rgb = out[:, :, :3].astype(np.int16)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    spread = np.max(rgb, axis=2) - np.min(rgb, axis=2)
    red_spill = is_red_bg(r, g, b)
    alpha[red_spill] = 0

    halo = (alpha > 0) & (alpha < 250) & (spread <= 18) & red_spill
    alpha[halo] = 0

    out[:, :, 3] = alpha
    out[alpha == 0, :3] = 0
    return out


def normalize_canvas(img: Image.Image, size: int = CANVAS) -> Image.Image:
    bbox = img.getbbox()
    if not bbox:
        raise RuntimeError("Empty image after background removal")
    pad = int(max(img.size) * 0.02)
    x0, y0, x1, y1 = bbox
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(img.size[0], x1 + pad), min(img.size[1], y1 + pad)
    cropped = img.crop((x0, y0, x1, y1))
    cw, ch = cropped.size
    scale = min((size * 0.92) / cw, (size * 0.92) / ch)
    nw, nh = max(1, int(cw * scale)), max(1, int(ch * scale))
    resized = cropped.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized)
    return canvas


def clean_caso_fintech_hero(src_path: Path = SRC) -> Image.Image:
    src = np.array(Image.open(src_path).convert("RGBA"))
    fg = build_foreground_mask(src)
    out = apply_alpha(src, fg)
    return normalize_canvas(Image.fromarray(out))


def main() -> None:
    clean = clean_caso_fintech_hero()
    OUT_PNG.parent.mkdir(parents=True, exist_ok=True)
    clean.save(OUT_PNG, "PNG", optimize=True)
    clean.save(OUT_WEBP, "WEBP", quality=90, method=6)
    print(f"png: {OUT_PNG} ({OUT_PNG.stat().st_size} bytes)")
    print(f"webp: {OUT_WEBP} ({OUT_WEBP.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
