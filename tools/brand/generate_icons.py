#!/usr/bin/env python3
"""Generate every SHASHTNA icon asset from the one master artwork.

    python3 tools/brand/generate_icons.py [path/to/master.png]

Needs Pillow. The master is used as-is: no redrawing, no recolouring and no
background is ever added behind the artwork. Only resizing and transparent
padding happen here.

Outputs
  src/assets/shashtna-player-logo.png       in-app logo (login, splash, sidebar, home)
  res/mipmap-*/ic_launcher(_round).png      legacy launcher icon (< Android 8)
  res/mipmap-*/ic_launcher_foreground.png   adaptive icon foreground (Android 8+)
  res/drawable-xhdpi/tv_banner.png          Android TV launcher banner
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
RES = ROOT / 'android/app/src/main/res'
MASTER = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name('shashtna-icon-master.png')

# Canvas colour of the app (values/colors.xml → shashtna_canvas).
CANVAS = (0x04, 0x07, 0x0D, 255)
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}


def trimmed_square(img: Image.Image) -> Image.Image:
    """Crop to the visible artwork (drops near-invisible alpha noise) and pad to a square."""
    alpha = img.getchannel('A').point(lambda v: 255 if v >= 4 else 0)
    art = img.crop(alpha.getbbox())
    side = max(art.size)
    square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    square.paste(art, ((side - art.width) // 2, (side - art.height) // 2))
    return square


def fit(art: Image.Image, canvas_px: int, art_px: int, background=(0, 0, 0, 0)) -> Image.Image:
    out = Image.new('RGBA', (canvas_px, canvas_px), background)
    scaled = art.resize((art_px, art_px), Image.LANCZOS)
    offset = (canvas_px - art_px) // 2
    out.alpha_composite(scaled, (offset, offset))
    return out


def main():
    master = Image.open(MASTER)
    if master.mode != 'RGBA':
        raise SystemExit(f'{MASTER} has no alpha channel ({master.mode}); a transparent PNG is required.')
    art = trimmed_square(master)

    art.resize((1024, 1024), Image.LANCZOS).save(ROOT / 'src/assets/shashtna-player-logo.png', optimize=True)

    for name, scale in DENSITIES.items():
        folder = RES / f'mipmap-{name}'
        folder.mkdir(exist_ok=True)
        # Legacy icon: 48dp canvas, artwork 46dp (the artwork carries its own rounded shape).
        legacy = fit(art, round(48 * scale), round(46 * scale))
        legacy.save(folder / 'ic_launcher.png', optimize=True)
        legacy.save(folder / 'ic_launcher_round.png', optimize=True)
        # Adaptive foreground: 108dp layer, of which the launcher shows the central 72dp.
        # Artwork at 74dp: the launcher mask replaces the artwork's own rounded edge, so no
        # second rounded square shows, and the TV, name and wordmark stay inside the
        # 72dp circle.
        fit(art, round(108 * scale), round(74 * scale)).save(folder / 'ic_launcher_foreground.png', optimize=True)

    # Android TV banner: 160x90dp → 320x180px at xhdpi, on the app canvas colour.
    banner = Image.new('RGBA', (320, 180), CANVAS)
    icon = art.resize((156, 156), Image.LANCZOS)
    banner.alpha_composite(icon, ((320 - 156) // 2, (180 - 156) // 2))
    (RES / 'drawable-xhdpi').mkdir(exist_ok=True)
    banner.convert('RGB').save(RES / 'drawable-xhdpi/tv_banner.png', optimize=True)


if __name__ == '__main__':
    main()
