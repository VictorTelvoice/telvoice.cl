#!/usr/bin/env python3
"""Clean IA automation case hero: checkerboard-safe transparency for white robot."""
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
SRC = ROOT / "assets/telvoice-agent-caso-ia-y-automatizacion-source.png"
OUT_PNG = ROOT / "assets/telvoice-agent-caso-ia-y-automatizacion-hero.png"
OUT_WEBP = ROOT / "assets/telvoice-agent-caso-ia-y-automatizacion-hero.webp"


def flood_border_bg(spread: np.ndarray, avg: np.ndarray, spread_max: float, avg_min: float) -> np.ndarray:
    h, w = spread.shape
    candidate = (spread <= spread_max) & (avg >= avg_min)
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


def remove_small_neutral_islands(
    spread: np.ndarray,
    avg: np.ndarray,
    fg: np.ndarray,
    *,
    spread_max: float,
    avg_min: float,
    max_size: int,
) -> np.ndarray:
    h, w = spread.shape
    cand = fg & (spread <= spread_max) & (avg >= avg_min)
    visited = np.zeros((h, w), dtype=bool)
    remove = np.zeros((h, w), dtype=bool)
    for sy in range(h):
        for sx in range(w):
            if not cand[sy, sx] or visited[sy, sx]:
                continue
            stack = [(sx, sy)]
            visited[sy, sx] = True
            comp = []
            while stack:
                x, y = stack.pop()
                comp.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and cand[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = True
                        stack.append((nx, ny))
            if len(comp) <= max_size:
                for x, y in comp:
                    remove[y, x] = True
    return remove


def build_foreground_mask(spread: np.ndarray, avg: np.ndarray, src: np.ndarray) -> np.ndarray:
    """Hybrid mask: rembg structure + white-body recovery + checkerboard cleanup."""
    h, w = spread.shape
    pre = src.copy()
    border_bg = flood_border_bg(spread, avg, spread_max=25, avg_min=205)
    pre[border_bg, :3] = 255
    pre[border_bg, 3] = 255
    islands_pre = remove_small_neutral_islands(
        spread, avg, ~border_bg, spread_max=18, avg_min=224, max_size=900
    )
    pre[islands_pre, :3] = 255

    cut = np.array(remove(Image.fromarray(pre)))
    rembg_fg = cut[:, :, 3] > 115

    colorful = (spread > 26) | (avg < 188)
    colorful_zone = ndimage.binary_dilation(colorful, iterations=14)
    neutral = (spread <= 30) & (avg >= 175)
    white_near = neutral & ndimage.binary_dilation(colorful_zone, iterations=22)

    fg = rembg_fg | white_near | colorful
    fg = ndimage.binary_fill_holes(fg)

    checker_cand = (~colorful_zone) & (spread <= 17) & (avg >= 223)
    checker_remove = remove_small_neutral_islands(
        spread, avg, checker_cand, spread_max=17, avg_min=223, max_size=3500
    )
    fg &= ~checker_remove

    holo = np.zeros((h, w), dtype=bool)
    holo[250:580, 70:380] = True
    holo_ui = holo & ndimage.binary_dilation(colorful, iterations=10)
    holo_checker = (
        holo
        & (~ndimage.binary_dilation(holo_ui, iterations=5))
        & (spread <= 20)
        & (avg >= 212)
    )
    fg &= ~holo_checker

    struct = np.ones((3, 3), dtype=bool)
    fg = ndimage.binary_fill_holes(fg)
    fg = ndimage.binary_closing(fg, structure=struct, iterations=1)
    fg = ndimage.binary_opening(fg, structure=struct, iterations=1)
    fg = peel_white_fringe(fg, spread, avg)
    fg = ndimage.binary_erosion(fg, iterations=1)
    fg = ndimage.binary_fill_holes(fg)
    return fg


def peel_white_fringe(
    fg: np.ndarray,
    spread: np.ndarray,
    avg: np.ndarray,
    *,
    iterations: int = 12,
) -> np.ndarray:
    """Remove near-white matte pixels attached to the outer silhouette."""
    h, w = fg.shape
    fg = fg.copy()
    peel = (spread <= 18) & (avg >= 236)
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


def apply_alpha(src: np.ndarray, fg: np.ndarray) -> np.ndarray:
    out = src.copy()
    core = ndimage.binary_erosion(fg, iterations=1)
    edge = fg & ~core
    alpha = np.zeros(src.shape[:2], dtype=np.uint8)
    alpha[core] = 255
    alpha[edge] = 210

    rgb = out[:, :, :3].astype(np.int16)
    spread = np.max(rgb, axis=2) - np.min(rgb, axis=2)
    avg = rgb.mean(axis=2)

    # Drop semi-transparent white halos (background bleed on edges).
    halo = (alpha > 0) & (alpha < 250) & (avg >= 236) & (spread <= 22)
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


def clean_caso_ia_hero(src_path: Path = SRC) -> Image.Image:
    src = np.array(Image.open(src_path).convert("RGBA"))
    rgb = src[:, :, :3].astype(np.int16)
    spread = np.max(rgb, axis=2) - np.min(rgb, axis=2)
    avg = rgb.mean(axis=2)
    fg = build_foreground_mask(spread, avg, src)
    out = apply_alpha(src, fg)
    return normalize_canvas(Image.fromarray(out))


def main() -> None:
    clean = clean_caso_ia_hero()
    OUT_PNG.parent.mkdir(parents=True, exist_ok=True)
    clean.save(OUT_PNG, "PNG", optimize=True)
    clean.save(OUT_WEBP, "WEBP", quality=90, method=6)
    print(f"png: {OUT_PNG} ({OUT_PNG.stat().st_size} bytes)")
    print(f"webp: {OUT_WEBP} ({OUT_WEBP.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
