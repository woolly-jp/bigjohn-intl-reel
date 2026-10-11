#!/usr/bin/env python3
"""見本用の仮画像をつくる(テスト用)。商品写真はサイトと同じ 2:3 の縦長"""
import math
import random
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

SANS = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"
out = sys.argv[1]
random.seed(7)


def label(img, text, fill):
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(SANS, 54)
    w = d.textlength(text, font=f)
    d.text(((img.width - w) / 2, img.height * 0.36), text, font=f, fill=fill)


def twill(w, h, base, amp, step=7):
    """デニムの綾織りのような斜めの縞"""
    img = Image.new("RGB", (w, h), base)
    d = ImageDraw.Draw(img)
    for k in range(-h, w, 3):
        v = int(amp * math.sin(k / step)) + random.randint(-4, 4)
        c = tuple(max(0, min(255, x + v)) for x in base)
        d.line([(k, 0), (k + h, h)], fill=c, width=3)
    return img


# 着用シーン(仮): 屋外の光の中に立つ人のような色面(9:16)
wear = Image.new("RGB", (1200, 2133), (200, 196, 186))
d = ImageDraw.Draw(wear)
for y in range(wear.height):
    k = y / wear.height
    d.line([(0, y), (wear.width, y)], fill=(int(214 - 40 * k), int(208 - 44 * k), int(196 - 50 * k)))
d.ellipse([440, 260, 760, 600], fill=(150, 128, 112))                  # 頭
d.rounded_rectangle([330, 560, 870, 1200], radius=120, fill=(232, 228, 218))  # シャツ
d.rounded_rectangle([360, 1150, 840, 2050], radius=60, fill=(46, 60, 92))     # ジーンズ
d.line([(600, 1250), (600, 2050)], fill=(30, 40, 66), width=10)
wear = wear.filter(ImageFilter.GaussianBlur(18))
label(wear, "WEARING (sample)", (255, 255, 255))
wear.save(f"{out}/wear_placeholder.jpg", quality=92)

# 商品写真(仮): インディゴの綾織り。サイトと同じ 2:3
prod = twill(1000, 1500, (40, 56, 92), 12).filter(ImageFilter.GaussianBlur(0.8))
label(prod, "PRODUCT (sample)", (236, 236, 236))
prod.save(f"{out}/product_placeholder.jpg", quality=92)

# 寄りの写真(仮): ステッチとリベットのような寄り。2:3
det = twill(1000, 1500, (54, 74, 118), 16, step=4).filter(ImageFilter.GaussianBlur(0.6))
d = ImageDraw.Draw(det)
for x in (300, 330):
    for y in range(80, 1420, 26):
        d.line([(x, y), (x, y + 14)], fill=(214, 168, 86), width=5)   # 2本ステッチ
d.ellipse([560, 560, 680, 680], fill=(172, 120, 64))                    # 銅のリベット
d.ellipse([588, 588, 652, 652], fill=(140, 96, 50))
det.save(f"{out}/detail_placeholder.jpg", quality=92)
print("仮画像を3枚つくりました")
