#!/usr/bin/env python3
"""Clean fintech/growth case hero: checkerboard-safe transparency for white robot."""
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".pydeps"))

import numpy as np
from PIL import Image

_ia_spec = importlib.util.spec_from_file_location(
    "clean_agent_caso_ia", ROOT / "scripts/clean-agent-caso-ia.py"
)
_ia = importlib.util.module_from_spec(_ia_spec)
_ia_spec.loader.exec_module(_ia)

SRC = ROOT / "assets/telvoice-agent-caso-fintech-source.png"
OUT_PNG = ROOT / "assets/telvoice-agent-caso-fintech-hero.png"
OUT_WEBP = ROOT / "assets/telvoice-agent-caso-fintech-hero.webp"


def clean_caso_fintech_hero(src_path: Path = SRC) -> Image.Image:
    src = np.array(Image.open(src_path).convert("RGBA"))
    rgb = src[:, :, :3].astype(np.int16)
    spread = np.max(rgb, axis=2) - np.min(rgb, axis=2)
    avg = rgb.mean(axis=2)
    fg = _ia.build_foreground_mask(spread, avg, src)
    out = _ia.apply_alpha(src, fg)
    return _ia.normalize_canvas(Image.fromarray(out), size=_ia.CANVAS)


def main() -> None:
    clean = clean_caso_fintech_hero()
    OUT_PNG.parent.mkdir(parents=True, exist_ok=True)
    clean.save(OUT_PNG, "PNG", optimize=True)
    clean.save(OUT_WEBP, "WEBP", quality=90, method=6)
    print(f"png: {OUT_PNG} ({OUT_PNG.stat().st_size} bytes)")
    print(f"webp: {OUT_WEBP} ({OUT_WEBP.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
