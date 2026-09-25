#!/usr/bin/env python3
"""Generate every عامر IPTV (Amer IPTV edition) icon asset from its master artwork.

    python3 tools/brand/amer/generate_amer_icons.py

The master (amer-icon-master.png) is rendered from amer-icon.html by
render_master.mjs. Sizing rules are the same as the Shashtna icons
(tools/brand/generate_icons.py); only the artwork and the output folders differ.

Outputs
  src/variants/amer/assets/amer-iptv-logo.png        in-app logo (import screen, splash, sidebar)
  android/app/src/amer/res/mipmap-*/ic_launcher(_round).png, ic_launcher_foreground.png
  android/app/src/amer/res/drawable-xhdpi/tv_banner.png   Android TV launcher banner
"""
import importlib.util
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
RES = ROOT / 'android/app/src/amer/res'
ASSETS = ROOT / 'src/variants/amer/assets'

spec = importlib.util.spec_from_file_location('shashtna_icons', HERE.parent / 'generate_icons.py')
icons = importlib.util.module_from_spec(spec)
spec.loader.exec_module(icons)


def main():
    art = icons.trimmed_square(Image.open(HERE / 'amer-icon-master.png'))
    ASSETS.mkdir(parents=True, exist_ok=True)
    art.resize((1024, 1024), Image.LANCZOS).save(ASSETS / 'amer-iptv-logo.png', optimize=True)

    for name, scale in icons.DENSITIES.items():
        folder = RES / f'mipmap-{name}'
        folder.mkdir(parents=True, exist_ok=True)
        legacy = icons.fit(art, round(48 * scale), round(46 * scale))
        legacy.save(folder / 'ic_launcher.png', optimize=True)
        legacy.save(folder / 'ic_launcher_round.png', optimize=True)
        icons.fit(art, round(108 * scale), round(74 * scale)).save(folder / 'ic_launcher_foreground.png', optimize=True)

    banner = Image.new('RGBA', (320, 180), icons.CANVAS)
    icon = art.resize((156, 156), Image.LANCZOS)
    banner.alpha_composite(icon, ((320 - 156) // 2, (180 - 156) // 2))
    (RES / 'drawable-xhdpi').mkdir(parents=True, exist_ok=True)
    banner.convert('RGB').save(RES / 'drawable-xhdpi/tv_banner.png', optimize=True)


if __name__ == '__main__':
    main()
