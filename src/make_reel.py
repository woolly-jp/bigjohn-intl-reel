#!/usr/bin/env python3
"""BIG JOHN INTL リール動画メーカー(4テンプレート / 素材3枚 / 12秒)とカルーセルの写真づくり

テンプレート: slide(スライド型) / zoom(ゆっくりズーム型) /
              detail(ディテール型) / notice(告知型)

使い方:
    python3 make_reel.py 設定.json 出力.mp4

設定.json の例は sample_config.json を参照。
動きは「ゆっくりしたズーム」と「クロスフェード」だけ。凝った演出は入れない。
"""
import json
import subprocess
import sys

import pathlib

from PIL import Image, ImageDraw, ImageFont, ImageOps

# ブランドのロゴ(白・透過PNG)。最後の画面と告知の画面に、文字の「BIG JOHN」の代わりに置く
LOGO = pathlib.Path(__file__).resolve().parent.parent / "assets" / "logo_white.png"
_logo = None


def logo(h):
    """高さ h のロゴ画像。ファイルがなければ None(そのときは文字で代用する)"""
    global _logo
    if _logo is None:
        _logo = Image.open(LOGO).convert("RGBA") if LOGO.exists() else False
    if not _logo:
        return None
    return _logo.resize((round(_logo.width * h / _logo.height), h), Image.LANCZOS)


def put_logo(img, top, h):
    """ロゴを中央に置く。置けたら True"""
    lg = logo(h)
    if lg is None:
        return False
    img.paste(lg, (round((W - lg.width) / 2), round(top)), lg)
    return True

W, H, FPS = 1080, 1920, 30
TOTAL_SECONDS = 12   # 動画全体の長さ(秒)。写真3枚で等分する

# 色(ロゴの黒と白に合わせる。文字は白、地と下地はほぼ黒)
WHITE = (255, 255, 255)      # 動画の文字の色
GRAY = (20, 20, 20)          # 告知の画面(文字が主役の画面)の地。名前は BasShu 版のまま
PLATE = (16, 16, 16)         # 写真に重ねる文字の下地(半透明のほぼ黒)
PLATE_ALPHA = 160            # 下地の濃さ(0〜255)

# 書体: 欧文のサンセリフ(Inter)。見出しは太め。日本語が混ざった行だけ Noto Sans CJK に切り替える
SANS = "/usr/share/fonts/opentype/inter/Inter-Regular.otf"
SERIF = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"  # 見出し(ひとこと、商品名)。名前は BasShu 版のまま
CJK = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
AI_LABEL = "AI-generated image"   # AI生成の画像に付ける札


def font(path, size):
    return ImageFont.truetype(path, size, index=0)


def pick(path, text):
    """英字の書体にない文字(日本語など)があれば、日本語の書体に切り替える"""
    return CJK if any(ord(ch) > 0x24F and not 0x2000 <= ord(ch) <= 0x206F for ch in str(text)) else path


TEXT_SCALE = 0.85   # 動画の文字の大きさ(1.0 = 最初の大きさ。0.85 = ひと回り小さく)。ロゴ、行の間隔、下地も一緒に変わる


def k(n):
    """文字まわりの大きさ・間隔を TEXT_SCALE に合わせる"""
    return round(n * TEXT_SCALE)


def ease(t):
    """ゆっくり始まり、ゆっくり終わる"""
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


# 文字を置く高さ。Instagramのリール画面で、下のアカウント名やキャプションに隠れない位置
TEXT_Y = 1300
PANEL_TOP = 1150   # 最後の画面で、商品名のまとまりが始まる高さ
LABEL_Y = 270      # 「イメージ画像」の札の高さ(上の画面部品に隠れない位置)


def cover(img, zoom, h=H):
    """画像を枠(幅W×高さh)いっぱいに切り出す。zoom=1.0 でちょうど、1.06 で少し寄る"""
    iw, ih = img.size
    scale = max(W / iw, h / ih) * zoom
    cw, ch = W / scale, h / scale
    left, top = (iw - cw) / 2, (ih - ch) / 2
    return img.resize((W, h), Image.LANCZOS, box=(left, top, left + cw, top + ch))


def spaced(draw, xy, text, fnt, fill, spacing=0, anchor_center=True):
    """字間をあけて文字を描く"""
    widths = [draw.textlength(c, font=fnt) for c in text]
    total = sum(widths) + spacing * (len(text) - 1)
    x, y = xy
    if anchor_center:
        x -= total / 2
    for c, w in zip(text, widths):
        draw.text((x, y), c, font=fnt, fill=fill)
        x += w + spacing
    return total


def fit_font(draw, text, path, size, max_width, spacing=0):
    """枠に収まるまで文字を小さくする"""
    path = pick(path, text)
    while size > 24:
        f = font(path, size)
        width = sum(draw.textlength(c, font=f) for c in text) + spacing * (len(text) - 1)
        if width <= max_width:
            return f
        size -= 2
    return font(path, size)


VIDEO_EXT = (".mp4", ".mov", ".m4v", ".webm")


class Clip:
    """動画素材を1コマずつ読む(縦長に切り出し、音は使わない)"""

    def __init__(self, path):
        vf = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS}"
        self.proc = subprocess.Popen(
            ["ffmpeg", "-loglevel", "error", "-i", path, "-an", "-vf", vf,
             "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
        self.last = None

    def next(self):
        buf = self.proc.stdout.read(W * H * 3)
        if len(buf) == W * H * 3:
            self.last = Image.frombytes("RGB", (W, H), buf)
        if self.last is None:
            sys.exit("動画素材を読めませんでした")
        return self.last  # 素材が短いときは最後のコマで止める


def load(scene, cfg):
    if scene.get("card"):
        return card(cfg)
    path = scene["image"]
    if path.lower().endswith(VIDEO_EXT):
        return Clip(path)
    return ImageOps.exif_transpose(Image.open(path)).convert("RGB")


def plate(layer, y0, y1, strength):
    """文字のうしろに敷く、半透明のほぼ黒の四角い下地(角は丸めず、ふちもぼかさない)"""
    sheet = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sheet).rectangle([56, y0, W - 56, y1], fill=PLATE + (strength,))
    return Image.alpha_composite(layer, sheet)


def text_style(layer, base, y0, y1, matted=False):
    """文字は白。写真に重なるときは半透明のグレーの下地を敷く(y0〜y1 が文字の範囲)。
    写真の下のグレーの地に置くとき(matted)は、下地はいらない"""
    if not matted:
        layer = plate(layer, y0 - k(64), y1 + k(56), PLATE_ALPHA)
    return layer, WHITE + (255,), WHITE + (232,)


def clean_lines(v):
    """小さく添える文章(2〜3行)を、行のリストにそろえる"""
    if isinstance(v, str):
        v = v.split("\n")
    return [str(x).strip() for x in (v or []) if str(x).strip()][:3]


def ai_label(d):
    """明るい写真でも読めるよう、小さな半透明の札に入れる(「実写」で始まる素材には付けない)"""
    f = font(SANS, 26)
    label = AI_LABEL
    tw = d.textlength(label, font=f)
    x0, y0 = W - tw - 84, LABEL_Y
    d.rounded_rectangle([x0, y0, W - 40, y0 + 52], radius=26, fill=(30, 30, 30, 120))
    d.text((x0 + 22, y0 + 6), label, font=f, fill=(255, 255, 255, 240))


def overlay(scene, cfg, base=None, matted=False):
    """1場面に重ねる文字の層をつくる。base は文字が重なる写真(明るさを見るため)"""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    kind = scene.get("overlay")
    if kind == "copy":      # 大きめのひとこと + 小さく添える2〜3行
        lines = clean_lines(scene.get("lines"))
        top = TEXT_Y - k(44) * len(lines)          # 行が増えるぶん、全体を上へ
        bottom = top + k(100) + (k(36) + k(58) * len(lines) if lines else 0)
        layer, ink, sub = text_style(layer, base, top, bottom, matted)
        d = ImageDraw.Draw(layer)
        f = fit_font(d, scene["text"], SERIF, k(68), W - 200, spacing=2)
        spaced(d, (W / 2, top + k(14)), scene["text"], f, ink, spacing=2)
        for i, line in enumerate(lines):
            f = fit_font(d, line, SANS, k(35), W - 220, spacing=2)
            spaced(d, (W / 2, top + k(132) + k(58) * i), line, f, sub, spacing=2)
    elif kind == "caption":  # 小さめの商品名
        top = TEXT_Y - k(40)                        # ロゴのぶん、少し上から
        bottom = top + k(214) + (k(70) if scene.get("sub") else 0)
        layer, ink, sub = text_style(layer, base, top, bottom, matted)
        d = ImageDraw.Draw(layer)
        if not put_logo(layer, top, k(84)):
            spaced(d, (W / 2, top + k(30)), cfg.get("brand", "BIG JOHN"), font(SERIF, k(28)), sub, spacing=14)
        f = fit_font(d, scene["text"], SERIF, k(50), W - 200, spacing=2)
        spaced(d, (W / 2, top + k(118)), scene["text"], f, ink, spacing=2)
        if scene.get("sub"):  # 商品名の下に添える、気の利いたひとこと
            f = fit_font(d, scene["sub"], SANS, k(36), W - 240, spacing=2)
            spaced(d, (W / 2, top + k(204)), scene["sub"], f, sub, spacing=2)
    elif kind == "panel":    # 商品名・色・価格。写真は画面いっぱい、文字のうしろに半透明のグレーの下地
        top = PANEL_TOP - 40                     # ロゴのぶん、少し上から
        y_end = top + k(284) + (k(72) if cfg.get("variant") else 0) + (k(92) if cfg.get("price") else 0) \
            + (k(64) if cfg.get("tagline") else 0)
        layer = plate(layer, top + k(6), y_end + k(34), PLATE_ALPHA)
        d = ImageDraw.Draw(layer)
        soft = WHITE + (228,)
        if not put_logo(layer, top + k(50), k(100)):
            spaced(d, (W / 2, top + k(84)), cfg.get("brand", "BIG JOHN"), font(SERIF, k(30)), soft, spacing=14)
        f = fit_font(d, cfg["name"], SERIF, k(58), W - 200, spacing=2)
        spaced(d, (W / 2, top + k(188)), cfg["name"], f, WHITE + (255,), spacing=2)
        y = top + k(284)
        if cfg.get("variant"):
            spaced(d, (W / 2, y), cfg["variant"], fit_font(d, cfg["variant"], SANS, k(34), W - 220, spacing=4), soft, spacing=4)
            y += k(72)
        if cfg.get("price"):
            spaced(d, (W / 2, y), cfg["price"], font(SERIF, k(50)), WHITE + (255,), spacing=3)
            y += k(92)
        if cfg.get("tagline"):  # 価格の下に添えるひとこと
            f = fit_font(d, cfg["tagline"], SANS, k(36), W - 240, spacing=2)
            spaced(d, (W / 2, y), cfg["tagline"], f, soft, spacing=2)
    if scene.get("ai_label"):
        ai_label(ImageDraw.Draw(layer))
    return layer


def card(cfg):
    """告知型の、文字が主役の画面"""
    img = Image.new("RGB", (W, H), GRAY)
    d = ImageDraw.Draw(img)
    lines = cfg.get("notice_lines", [])
    block = k(150) + k(110) + k(84) * len(lines)
    y = (H - block) / 2 - 40
    if not put_logo(img, y - k(70), k(130)):
        spaced(d, (W / 2, y), cfg.get("brand", "BIG JOHN"), font(SERIF, k(32)), (232, 232, 232), spacing=14)
    title = cfg.get("notice_title", "")
    f = fit_font(d, title, SERIF, k(84), W - 180, spacing=2)
    spaced(d, (W / 2, y + k(130)), title, f, WHITE, spacing=2)
    yy = y + k(290)
    for line in lines:
        f = fit_font(d, line, SANS, k(42), W - 200, spacing=1)
        spaced(d, (W / 2, yy), line, f, WHITE, spacing=1)
        yy += k(84)
    return img


def scenes_for(cfg):
    """テンプレートごとの3場面の中身。どれも最後は実物の商品写真で終わる"""
    t = cfg.get("template", "slide")
    ai = cfg.get("ai_image", True)
    whole = cfg["product_image"]
    close = cfg.get("detail_image") or whole          # 寄りの写真(なければ全体)
    extra = cfg.get("extra_image") or whole           # 別カットの写真(なければ全体)
    name = {"overlay": "caption", "text": cfg["name"], "sub": cfg.get("tagline")}
    if t in ("slide", "zoom"):
        last = {"overlay": "panel"} if t == "slide" else name
        # 2枚目には、素材やつくりの特徴のひとこと(あれば)を重ねる
        middle = {"image": close}
        if cfg.get("point"):
            middle.update(overlay="copy", text=cfg["point"], lines=cfg.get("point_lines"))
        return [{"image": cfg["wear_image"], "overlay": "copy", "text": cfg["copy"],
                 "lines": cfg.get("copy_lines"), "ai_label": ai},
                middle,
                dict(image=whole, **last)]
    if t == "detail":
        return [dict(image=whole, **name),
                {"image": close, "overlay": "copy", "text": cfg["copy"], "lines": cfg.get("copy_lines")},
                {"image": extra, "overlay": "panel"}]
    if t == "notice":
        return [{"card": True}, {"image": close}, dict(image=whole, **name)]
    sys.exit(f"知らないテンプレートです: {t}")


def with_alpha(layer, alpha):
    if alpha >= 1:
        return layer
    out = layer.copy()
    out.putalpha(out.getchannel("A").point(lambda v: int(v * alpha)))
    return out


def render(cfg, out_path):
    sc = scenes_for(cfg)
    hold = float(cfg.get("seconds_per_image", TOTAL_SECONDS / len(sc)))  # 1枚あたりの秒数
    fade = float(cfg.get("crossfade", 0.9))            # 切り替えにかける秒数(長いほどゆっくり)
    default_zoom = 0.10 if cfg.get("template") == "zoom" else 0.06
    zoom_amt = float(cfg.get("zoom", default_zoom))    # ズームの量(0.06 = 6%)
    total = hold * len(sc)
    n = int(round(total * FPS))

    imgs = [load(s, cfg) for s in sc]

    def frame_of(k, z):
        """k枚目の写真を、画面いっぱいに置く(サイトの写真は2:3なので、左右が少し切れる)"""
        return cover(imgs[k], z)

    ovs = [overlay(s, cfg, None if isinstance(imgs[k], Clip) else frame_of(k, 1.0))
           for k, s in enumerate(sc)]

    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
    ]
    if cfg.get("bgm"):
        cmd += ["-stream_loop", "-1", "-i", cfg["bgm"]]
        audio = ["-af", f"afade=t=in:d=0.4,afade=t=out:st={total - 0.6}:d=0.6"]
    else:
        cmd += ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]
        audio = []
    cmd += [
        "-map", "0:v", "-map", "1:a", "-t", f"{total}",
        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
        "-profile:v", "high", "-r", str(FPS),
        "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2", *audio,
        "-movflags", "+faststart", out_path,
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    def shot(k, local_t, text_delay):
        if isinstance(imgs[k], Clip):
            base = imgs[k].next().convert("RGBA")
        else:
            z = 1.0 if sc[k].get("card") else 1 + zoom_amt * (local_t / (hold + fade / 2))
            base = frame_of(k, z).convert("RGBA")
        return Image.alpha_composite(base, with_alpha(ovs[k], ease((local_t - text_delay) / 0.6)))

    # k枚目が出始める時刻(前の写真とのクロスフェードの開始)
    starts = [0.0] + [k * hold - fade / 2 for k in range(1, len(sc))]
    for i in range(n):
        t = i / FPS
        k = max(j for j, st in enumerate(starts) if t >= st)  # いま出始めている、いちばん新しい写真
        mix = ease((t - starts[k]) / fade) if k else 1.0       # 0 = 前の写真、1 = 今の写真
        frame = shot(k, t - starts[k], 0.35 if k == 0 else fade * 0.6)
        if mix < 1:
            frame = Image.blend(shot(k - 1, t - starts[k - 1], 0), frame, mix)
        # 最初と最後をわずかにフェード
        edge = min(ease(t / 0.3), ease((total - t) / 0.3))
        rgb = frame.convert("RGB")
        if edge < 1:
            rgb = Image.blend(Image.new("RGB", (W, H), GRAY), rgb, edge)
        proc.stdin.write(rgb.tobytes())
    proc.stdin.close()
    for im in imgs:
        if isinstance(im, Clip):
            im.proc.kill()
    if proc.wait() != 0:
        sys.exit("動画の書き出しに失敗しました")
    print(f"できました: {out_path}({total:.1f}秒)")


FEED_H = 1350   # カルーセル(通常投稿)の写真は 4:5(1080×1350)


def render_stills(cfg, out_prefix):
    """カルーセル用に、写真を 4:5 に切り出して JPEG で保存する。文字は載せない。
    AI生成の写真(着用写真の枠で、ファイル名が「実写」で始まらないもの)にだけ札を付ける"""
    outs = []
    for k, key in enumerate(cfg["images"], 1):
        img = ImageOps.exif_transpose(Image.open(cfg[key])).convert("RGB")
        img = cover(img, 1.0, h=FEED_H).convert("RGBA")
        if key == "wear_image" and cfg.get("ai_image"):
            layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
            d = ImageDraw.Draw(layer)
            f = font(SANS, 26)
            tw = d.textlength(AI_LABEL, font=f)
            x0, y0 = W - tw - 84, 40
            d.rounded_rectangle([x0, y0, W - 40, y0 + 52], radius=26, fill=(30, 30, 30, 120))
            d.text((x0 + 22, y0 + 6), AI_LABEL, font=f, fill=(255, 255, 255, 240))
            img = Image.alpha_composite(img, layer)
        out = f"{out_prefix}-{k}.jpg"
        img.convert("RGB").save(out, "JPEG", quality=90, optimize=True)
        outs.append(out)
    print(f"できました: {len(outs)}枚")
    return outs


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    with open(sys.argv[1], encoding="utf-8") as fh:
        conf = json.load(fh)
    if conf.get("template") == "carousel":
        render_stills(conf, sys.argv[2])   # 2つ目の引数は、ファイル名の頭(-1.jpg, -2.jpg … が付く)
    else:
        render(conf, sys.argv[2])
