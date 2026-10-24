#!/usr/bin/env python3
"""Regenerate Yutario branding: launcher icons, adaptive layers, splash screens.

Run from the repo root:  python3 scripts/generate-icons.py
Requires Pillow (pip install pillow).
"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "android/app/src/main/res")
BRAND = os.path.join(ROOT, "artifacts/branding")
SS = 4  # supersample factor, keeps edges clean at 48dp
WHITE = (255, 255, 255, 255)
BG = (246, 251, 248)
GREEN_DARK = (4, 120, 87)
GREEN_LIGHT = (16, 185, 129)


def gradient(size):
    """Diagonal emerald -> deep green gradient."""
    tile = Image.new("RGB", (48, 48))
    px = tile.load()
    for y in range(48):
        for x in range(48):
            t = (x / 47.0) * 0.55 + (y / 47.0) * 0.45
            px[x, y] = tuple(round(GREEN_LIGHT[i] + (GREEN_DARK[i] - GREEN_LIGHT[i]) * t) for i in range(3))
    return tile.resize((size, size), Image.BICUBIC)


def glow(size):
    """Soft highlight in the top-left corner, for depth."""
    mask = Image.new("L", (size, size), 0)
    r = size * 0.72
    ImageDraw.Draw(mask).ellipse([-size * 0.30, -size * 0.34, -size * 0.30 + r, -size * 0.34 + r * 0.92], fill=46)
    return mask.filter(ImageFilter.GaussianBlur(size * 0.18))


def figure(size, fill=WHITE):
    """Little man wearing headphones, drawn in a 1024 coordinate space."""
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    k = size / 1024.0

    def px(*v):
        return [x * k for x in v]

    d.rounded_rectangle(px(292, 604, 732, 1024), radius=176 * k, fill=fill)  # shoulders
    d.rounded_rectangle(px(468, 512, 556, 660), radius=44 * k, fill=fill)    # neck
    d.ellipse(px(396, 336, 628, 568), fill=fill)                             # head
    d.arc(px(310, 250, 714, 654), start=172, end=368, fill=fill, width=round(44 * k))  # band
    d.rounded_rectangle(px(286, 458, 378, 588), radius=42 * k, fill=fill)    # left cup
    d.rounded_rectangle(px(646, 458, 738, 588), radius=42 * k, fill=fill)    # right cup
    return im


def adaptive_figure(size, scale=0.92):
    """Foreground layer for the 108dp adaptive canvas.

    Launchers only show the inner 72dp, which crops the design down to the
    headband, head, cups and the top of the torso, so no extra scaling is needed.
    """
    if scale == 1.0:
        return figure(size)
    base = figure(size)
    big = base.resize((int(size * scale), int(size * scale)), Image.LANCZOS)
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    off = (size - big.size[0]) // 2
    layer.alpha_composite(big, (off, off))
    return layer


def rounded_mask(size, ratio):
    m = Image.new("L", (size * SS, size * SS), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size * SS - 1, size * SS - 1], radius=int(size * SS * ratio), fill=255)
    return m.resize((size, size), Image.LANCZOS)


def circle_mask(size):
    m = Image.new("L", (size * SS, size * SS), 0)
    ImageDraw.Draw(m).ellipse([0, 0, size * SS - 1, size * SS - 1], fill=255)
    return m.resize((size, size), Image.LANCZOS)


def background(size):
    bg = gradient(size).convert("RGBA")
    tint = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    bg = Image.composite(tint, bg, glow(size).point(lambda v: int(v * 0.55)))
    return bg


def full_icon(size, mask):
    icon = background(size)
    icon.alpha_composite(figure(size))
    icon.putalpha(mask)
    return icon


def adaptive_preview(size):
    """How the icon actually looks once the launcher crops and masks it."""
    s = 432
    icon = background(s)
    icon.alpha_composite(adaptive_figure(s))
    visible = round(s * 72 / 108)
    off = (s - visible) // 2
    icon = icon.crop((off, off, off + visible, off + visible)).resize((size, size), Image.LANCZOS)
    icon.putalpha(circle_mask(size))
    return icon


def splash(width, height):
    canvas = Image.new("RGBA", (width, height), BG + (255,))
    mark = int(min(width, height) * 0.30)
    canvas.alpha_composite(figure(mark, fill=GREEN_DARK + (255,)),
                           ((width - mark) // 2, (height - mark) // 2))
    return canvas


def save(im, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, optimize=True)


def main():
    icons = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    layers = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}

    for density, s in icons.items():
        save(full_icon(s, rounded_mask(s, 0.22)), f"{RES}/mipmap-{density}/ic_launcher.png")
        save(full_icon(s, circle_mask(s)), f"{RES}/mipmap-{density}/ic_launcher_round.png")

    for density, s in layers.items():
        save(adaptive_figure(s), f"{RES}/mipmap-{density}/ic_launcher_foreground.png")
        save(background(s), f"{RES}/mipmap-{density}/ic_launcher_background.png")

    phones = {"mdpi": (320, 480), "hdpi": (480, 800), "xhdpi": (720, 1280),
              "xxhdpi": (960, 1600), "xxxhdpi": (1280, 1920)}
    for density, (w, h) in phones.items():
        save(splash(w, h), f"{RES}/drawable-port-{density}/splash.png")
        save(splash(h, w), f"{RES}/drawable-land-{density}/splash.png")

    # density-independent fallback: plain app background, no stretched artwork
    save(Image.new("RGBA", (1024, 1024), BG + (255,)), f"{RES}/drawable/splash.png")

    save(full_icon(512, rounded_mask(512, 0.22)), f"{BRAND}/app-icon.png")
    save(splash(1024, 1024), f"{BRAND}/splash.png")

    # legibility check sheet: legacy (rounded square) over adaptive (masked) at real sizes
    sizes = (48, 64, 96, 144)
    cell = max(sizes) + 34
    sheet = Image.new("RGBA", (20 + cell * len(sizes), 412), (255, 255, 255, 255))
    d = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=13)
    for i, s in enumerate(sizes):
        x = 20 + i * cell
        sheet.alpha_composite(full_icon(s, rounded_mask(s, 0.22)), (x, 176 - s))
        sheet.alpha_composite(adaptive_preview(s), (x, 372 - s))
        d.text((x, 382), f"{s}px", fill=(70, 80, 75, 255), font=font)
    d.text((20, 12), "legacy", fill=(120, 130, 125, 255), font=font)
    d.text((20, 208), "adaptive (masked)", fill=(120, 130, 125, 255), font=font)
    save(sheet, os.path.join(BRAND, "icon-sizes.png"))

    print("branding regenerated")


if __name__ == "__main__":
    main()
