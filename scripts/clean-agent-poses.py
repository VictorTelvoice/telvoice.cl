#!/usr/bin/env python3
"""Batch clean Telvoice agent poses -> transparent PNG/WebP."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".pydeps"))

import numpy as np
from PIL import Image
from rembg import remove

ASSETS = ROOT / "assets"
CURSOR_ASSETS = Path(
    "/Users/victor/.cursor/projects/Users-victor-TELVOICE-CHILE/assets"
)
CANVAS = 1024

POSES = [
    ("telvoice-agent-pose-welcome", "ChatGPT_Image_3_jun_2026__06_37_56_p.m.__3_-ab14b577-ac8b-441c-b453-23925a044d11.png"),
    ("telvoice-agent-pose-thumbs", "ChatGPT_Image_3_jun_2026__06_37_57_p.m.__4_-13184435-f79b-4577-8164-cb4da6b2ea07.png"),
    ("telvoice-agent-pose-open", "ChatGPT_Image_3_jun_2026__06_37_58_p.m.__5_-511d3ae2-f9c0-404e-9656-54968ff0197c.png"),
    ("telvoice-agent-pose-listen", "ChatGPT_Image_3_jun_2026__06_37_59_p.m.__6_-78a20237-88f6-4079-845a-3712cb970e4a.png"),
    ("telvoice-agent-pose-think", "ChatGPT_Image_3_jun_2026__06_38_00_p.m.__7_-b89dbe35-216e-4c5a-8b81-58146184dc3e.png"),
]


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
    return Image.fromarray(cleaned)


def defringe(img: Image.Image) -> Image.Image:
    arr = np.array(img.convert("RGBA"), dtype=np.int16)
    rgb = arr[:, :, :3]
    a = arr[:, :, 3]
    lum = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]
    spread = rgb.max(axis=2) - rgb.min(axis=2)
    fringe = (lum > 220) & (spread < 28) & (a > 0) & (a < 245)
    a[fringe] = np.clip(a[fringe] - 120, 0, 255)
    arr[:, :, 3] = a
    return Image.fromarray(arr.astype(np.uint8))


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


def clean_pose(name: str, filename: str) -> None:
    src = CURSOR_ASSETS / filename
    if not src.exists():
        src = ASSETS / filename
    cut = remove(Image.open(src))
    cut = keep_largest_component(cut)
    cut = defringe(cut)
    clean = normalize_canvas(cut)
    png = ASSETS / f"{name}.png"
    webp = ASSETS / f"{name}.webp"
    ASSETS.mkdir(parents=True, exist_ok=True)
    clean.save(png, "PNG", optimize=True)
    clean.save(webp, "WEBP", lossless=True, quality=95, method=6)
    print(f"ok {name} -> {clean.size}")


def main():
    for name, filename in POSES:
        clean_pose(name, filename)
    # Default alias for backward compatibility
    default = ASSETS / "telvoice-agent-pose-welcome.png"
    for alias in ("telvoice-agent-floating-clean.png", "telvoice-agent-floating-clean.webp"):
        target = ASSETS / alias
        if alias.endswith(".png"):
            Image.open(default).save(target, "PNG", optimize=True)
        else:
            Image.open(default).save(target, "WEBP", lossless=True, quality=95, method=6)
    print("aliases updated")


if __name__ == "__main__":
    main()
