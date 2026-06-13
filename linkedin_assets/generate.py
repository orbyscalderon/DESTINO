"""
Generates 4 LinkedIn images for Destino TV following the
'Chromatic Resonance' design philosophy.
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path

ROOT = Path(__file__).parent
FONTS = Path(r"c:/Users/Orbys Calderón/.claude/skills/canvas-design/canvas-fonts")

# ── Palette ────────────────────────────────────────────────
VOID       = (10, 10, 15)
STRATUM_1  = (17, 17, 24)
STRATUM_2  = (26, 26, 46)
ROSE       = (244, 63, 94)
MAGENTA    = (217, 70, 239)
WHITE      = (255, 255, 255)
WHISPER    = (161, 161, 170)
TIMESTAMP  = (113, 113, 122)

W, H = 1200, 1200
MARGIN = 80

BRICOLAGE_BOLD = str(FONTS / "BricolageGrotesque-Bold.ttf")
BRICOLAGE_REG  = str(FONTS / "BricolageGrotesque-Regular.ttf")
GEIST_MONO     = str(FONTS / "GeistMono-Regular.ttf")
GEIST_MONO_BOLD= str(FONTS / "GeistMono-Bold.ttf")

# ── Helpers ────────────────────────────────────────────────
def new_canvas():
    """Dark canvas at base."""
    return Image.new("RGB", (W, H), VOID)

def add_glow_orb(canvas, cx, cy, radius, color, opacity=0.12):
    """Soft luminous orb on a layer, then alpha-composited."""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    alpha = int(255 * opacity)
    draw.ellipse(
        (cx - radius, cy - radius, cx + radius, cy + radius),
        fill=(*color, alpha)
    )
    blurred = layer.filter(ImageFilter.GaussianBlur(radius=radius / 3))
    canvas.alpha_composite(blurred) if canvas.mode == "RGBA" else \
        canvas.paste(Image.alpha_composite(canvas.convert("RGBA"), blurred).convert("RGB"))
    return canvas

def to_rgba(img):
    return img.convert("RGBA") if img.mode != "RGBA" else img

def add_orb(canvas_rgba, cx, cy, radius, color, opacity=0.12):
    """Add a glow orb to an RGBA canvas (in-place)."""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    alpha = int(255 * opacity)
    draw.ellipse(
        (cx - radius, cy - radius, cx + radius, cy + radius),
        fill=(*color, alpha)
    )
    blurred = layer.filter(ImageFilter.GaussianBlur(radius=radius / 2.5))
    return Image.alpha_composite(canvas_rgba, blurred)

def font(path, size):
    return ImageFont.truetype(path, size)

def text_size(draw, text, fnt):
    bbox = draw.textbbox((0, 0), text, font=fnt)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]

def draw_text(draw, x, y, text, fnt, color, anchor="lt"):
    draw.text((x, y), text, font=fnt, fill=color, anchor=anchor)

def gradient_text(draw_target, text, fnt, x, y, start_color, end_color, anchor="lt"):
    """Render text and apply a horizontal gradient onto its alpha mask."""
    # Render text in white onto a transparent canvas
    bbox = draw_target.textbbox((0, 0), text, font=fnt, anchor=anchor)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    # Pad for safety
    pad = 20
    img = Image.new("RGBA", (tw + pad * 2, th + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.text((pad, pad), text, font=fnt, fill=WHITE, anchor="lt")

    # Build horizontal gradient with same size
    grad = Image.new("RGB", (tw + pad * 2, th + pad * 2), start_color)
    gd = ImageDraw.Draw(grad)
    for i in range(tw + pad * 2):
        ratio = i / (tw + pad * 2 - 1)
        r = int(start_color[0] + (end_color[0] - start_color[0]) * ratio)
        g = int(start_color[1] + (end_color[1] - start_color[1]) * ratio)
        b = int(start_color[2] + (end_color[2] - start_color[2]) * ratio)
        gd.line([(i, 0), (i, th + pad * 2)], fill=(r, g, b))

    # Use text alpha as mask onto gradient
    alpha = img.split()[3]
    grad_rgba = grad.convert("RGBA")
    grad_rgba.putalpha(alpha)

    # Calculate paste position based on anchor
    if anchor == "lt":
        px, py = x - pad, y - pad
    elif anchor == "mt":
        px, py = x - (tw + pad * 2) // 2, y - pad
    elif anchor == "mm":
        px, py = x - (tw + pad * 2) // 2, y - (th + pad * 2) // 2
    elif anchor == "mb":
        px, py = x - (tw + pad * 2) // 2, y - th - pad
    else:
        px, py = x - pad, y - pad

    # Return image + paste coords for caller to alpha_composite
    return grad_rgba, (px, py)

def composite_text(canvas_rgba, draw_obj, text, fnt, x, y, start, end, anchor="lt"):
    grad_img, coords = gradient_text(draw_obj, text, fnt, x, y, start, end, anchor)
    base = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    base.paste(grad_img, coords, grad_img)
    return Image.alpha_composite(canvas_rgba, base)

def draw_card(draw, x, y, w, h, radius=20, border_color=ROSE, border_opacity=0.3):
    """Card with subtle stratum bg + thin border."""
    # Bg
    draw.rounded_rectangle((x, y, x + w, y + h), radius=radius, fill=STRATUM_1)
    # Border via overlay (subtle)
    # PIL doesn't blend opacity well in draw, use width=2 with desaturated color
    bc = tuple(int(c * border_opacity + STRATUM_2[i] * (1 - border_opacity)) for i, c in enumerate(border_color))
    draw.rounded_rectangle((x, y, x + w, y + h), radius=radius, outline=bc, width=2)

def draw_pill(draw, text, fnt, x, y, padding_x=16, padding_y=8, bg=STRATUM_2, text_color=WHITE, border=True):
    """Render a chip/pill with text. Returns (width, height) of pill."""
    tw, th = text_size(draw, text, fnt)
    w = tw + padding_x * 2
    h = th + padding_y * 2
    draw.rounded_rectangle((x, y, x + w, y + h), radius=h // 2, fill=bg)
    if border:
        draw.rounded_rectangle((x, y, x + w, y + h), radius=h // 2, outline=(60, 60, 80), width=1)
    draw.text((x + padding_x, y + padding_y - 2), text, font=fnt, fill=text_color)
    return w, h

# ──────────────────────────────────────────────────────────
# IMG 1 — HERO COVER
# ──────────────────────────────────────────────────────────
def render_hero():
    canvas = Image.new("RGBA", (W, H), (*VOID, 255))
    # Glow orbs — corners
    canvas = add_orb(canvas, 180, 220, 320, ROSE, 0.14)
    canvas = add_orb(canvas, W - 200, H - 220, 360, MAGENTA, 0.13)
    canvas = add_orb(canvas, W - 180, 220, 220, MAGENTA, 0.08)
    canvas = add_orb(canvas, 180, H - 240, 220, ROSE, 0.08)

    draw = ImageDraw.Draw(canvas)

    # Heart — drawn geometrically as 2 circles + triangle, with gradient fill
    # We render onto a transparent layer at 2x for smoothness, then paste.
    heart_cx, heart_cy = W // 2, 290
    heart_size = 90  # half-width
    SS = 3  # supersampling
    hw = heart_size * SS
    heart_layer = Image.new("RGBA", (hw * 3, hw * 3), (0, 0, 0, 0))
    hd = ImageDraw.Draw(heart_layer)
    # gradient base square in heart bounds
    cx, cy = hw * 3 // 2, hw * 3 // 2
    # gradient image full bounds
    grad_box = Image.new("RGB", (hw * 3, hw * 3), ROSE)
    gd = ImageDraw.Draw(grad_box)
    for i in range(hw * 3):
        ratio = i / (hw * 3 - 1)
        r = int(ROSE[0] + (MAGENTA[0] - ROSE[0]) * ratio)
        g = int(ROSE[1] + (MAGENTA[1] - ROSE[1]) * ratio)
        b = int(ROSE[2] + (MAGENTA[2] - ROSE[2]) * ratio)
        gd.line([(i, 0), (i, hw * 3)], fill=(r, g, b))
    # build heart mask
    mask = Image.new("L", (hw * 3, hw * 3), 0)
    md = ImageDraw.Draw(mask)
    r_circ = int(hw * 0.55)
    # two top circles
    md.ellipse((cx - hw, cy - r_circ, cx, cy + r_circ - int(hw * 0.2)), fill=255)
    md.ellipse((cx, cy - r_circ, cx + hw, cy + r_circ - int(hw * 0.2)), fill=255)
    # bottom triangle
    md.polygon([
        (cx - hw + 4, cy + int(hw * 0.05)),
        (cx + hw - 4, cy + int(hw * 0.05)),
        (cx, cy + int(hw * 1.15)),
    ], fill=255)
    # downsample
    grad_rgba = grad_box.convert("RGBA")
    grad_rgba.putalpha(mask)
    grad_small = grad_rgba.resize((hw * 3 // SS, hw * 3 // SS), Image.LANCZOS)
    # paste centered
    pw, ph = grad_small.size
    paste_x = heart_cx - pw // 2
    paste_y = heart_cy - ph // 2
    base = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    base.paste(grad_small, (paste_x, paste_y), grad_small)
    canvas = Image.alpha_composite(canvas, base)
    draw = ImageDraw.Draw(canvas)

    # Brand name
    f_brand = font(BRICOLAGE_BOLD, 132)
    canvas = composite_text(canvas, draw, "Destino TV", f_brand, W // 2, 510, ROSE, MAGENTA, anchor="mm")
    draw = ImageDraw.Draw(canvas)

    # Tagline
    f_tag = font(BRICOLAGE_BOLD, 44)
    draw.text((W // 2, 640), "Dating + Creator Economy", font=f_tag, fill=WHITE, anchor="mm")

    # Subtag
    f_sub = font(BRICOLAGE_REG, 30)
    draw.text((W // 2, 706), "Built solo.  From LATAM.  For LATAM.", font=f_sub, fill=WHISPER, anchor="mm")

    # Divider thin
    div_y = 850
    for i in range(W - 480):
        x = 240 + i
        ratio = abs((i / (W - 480)) - 0.5) * 2  # 0 at center, 1 at edges
        opacity = (1 - ratio) * 0.4
        col = tuple(int(c * opacity + VOID[idx] * (1 - opacity)) for idx, c in enumerate(ROSE))
        draw.line([(x, div_y), (x, div_y)], fill=col, width=1)
    # simpler: just a thin gradient line
    draw.line([(360, div_y), (W - 360, div_y)], fill=(60, 30, 50), width=1)

    # Footnote — Geist Mono
    f_mono = font(GEIST_MONO, 22)
    draw.text((W - MARGIN - 16, H - MARGIN - 20), "v2.0  ·  2026", font=f_mono, fill=TIMESTAMP, anchor="rb")
    draw.text((MARGIN + 16, H - MARGIN - 20), "01 / 04", font=f_mono, fill=TIMESTAMP, anchor="lb")

    out = canvas.convert("RGB")
    out.save(ROOT / "01_hero_cover.png", "PNG", optimize=True)
    print("[OK] 01_hero_cover.png")

# ──────────────────────────────────────────────────────────
# IMG 2 — TECH STACK
# ──────────────────────────────────────────────────────────
def render_stack():
    canvas = Image.new("RGBA", (W, H), (*VOID, 255))
    canvas = add_orb(canvas, W // 2, 100, 380, ROSE, 0.10)
    canvas = add_orb(canvas, W - 100, H - 100, 240, MAGENTA, 0.08)

    draw = ImageDraw.Draw(canvas)

    # Title
    f_title = font(BRICOLAGE_BOLD, 84)
    draw.text((MARGIN, 110), "Tech Stack", font=f_title, fill=WHITE)
    # subtitle
    f_sub = font(BRICOLAGE_REG, 26)
    draw.text((MARGIN + 4, 220), "Production-ready · 6 months · 1 dev", font=f_sub, fill=WHISPER)

    # Index — Geist Mono
    f_mono = font(GEIST_MONO, 22)
    draw.text((W - MARGIN, H - MARGIN - 4), "02 / 04", font=f_mono, fill=TIMESTAMP, anchor="rb")

    # 4 layers
    layers = [
        ("FRONTEND",            ROSE,    ["React 18", "Vite", "Tailwind", "Framer Motion", "i18next", "Capacitor"]),
        ("BACKEND",             MAGENTA, ["Node.js", "Express", "PostgreSQL", "Supabase", "RLS", "OpenAI"]),
        ("REALTIME · MEDIA",    ROSE,    ["LiveKit SFU", "RTMP Ingress", "Web Push", "Firebase FCM", "Sightengine"]),
        ("INFRA · TOOLING",     MAGENTA, ["Railway", "Vercel", "Vultr", "Stripe · CCBill", "Sentry", "PostHog"]),
    ]

    y = 290
    card_h = 152
    gap = 22
    f_layer_label = font(GEIST_MONO_BOLD, 16)
    f_pill = font(BRICOLAGE_REG, 22)

    for label, color, items in layers:
        # Layer card
        x0 = MARGIN
        x1 = W - MARGIN
        w = x1 - x0
        # bg
        draw.rounded_rectangle((x0, y, x1, y + card_h), radius=18, fill=STRATUM_1)
        # 2px border with low-opacity color
        bc = tuple(int(c * 0.28 + STRATUM_2[i] * 0.72) for i, c in enumerate(color))
        draw.rounded_rectangle((x0, y, x1, y + card_h), radius=18, outline=bc, width=2)

        # Label
        draw.text((x0 + 32, y + 22), label, font=f_layer_label, fill=color)

        # Accent dot
        draw.ellipse((x0 + 16, y + 30, x0 + 24, y + 38), fill=color)

        # Pills
        px = x0 + 32
        py = y + 70
        for item in items:
            pw, ph = text_size(draw, item, f_pill)
            pill_w = pw + 28
            pill_h = ph + 18
            # break if overflow
            if px + pill_w > x1 - 32:
                px = x0 + 32
                py += pill_h + 12
            draw.rounded_rectangle((px, py, px + pill_w, py + pill_h), radius=pill_h // 2, fill=STRATUM_2)
            draw.rounded_rectangle((px, py, px + pill_w, py + pill_h), radius=pill_h // 2, outline=(50, 50, 70), width=1)
            draw.text((px + 14, py + 6), item, font=f_pill, fill=WHITE)
            px += pill_w + 10

        y += card_h + gap

    out = canvas.convert("RGB")
    out.save(ROOT / "02_tech_stack.png", "PNG", optimize=True)
    print("[OK] 02_tech_stack.png")

# ──────────────────────────────────────────────────────────
# IMG 3 — FEATURES GRID
# ──────────────────────────────────────────────────────────
def render_features():
    canvas = Image.new("RGBA", (W, H), (*VOID, 255))
    canvas = add_orb(canvas, 120, 120, 280, ROSE, 0.10)
    canvas = add_orb(canvas, W - 120, 120, 220, MAGENTA, 0.08)
    canvas = add_orb(canvas, 120, H - 140, 220, MAGENTA, 0.07)
    canvas = add_orb(canvas, W - 120, H - 140, 280, ROSE, 0.09)

    draw = ImageDraw.Draw(canvas)

    # Title
    f_title = font(BRICOLAGE_BOLD, 64)
    draw.text((MARGIN, 100), "Everything in one app.", font=f_title, fill=WHITE)
    f_sub = font(BRICOLAGE_REG, 24)
    draw.text((MARGIN + 4, 190), "Lo que normalmente requiere cinco productos distintos.", font=f_sub, fill=WHISPER)

    features = [
        ("01", "Swipe & Match",         "Compatibility algorithm · AI icebreaker"),
        ("02", "Live Shows",            "Multi-host battles · gifts · tip goals"),
        ("03", "Creator Economy",       "Tiers · PPV · gift subs · affiliates"),
        ("04", "Reels & Stories",       "Velocity-decay ranking · TikTok-style"),
        ("05", "Stickers Marketplace",  "Coin-purchased packs · creator-owned"),
        ("06", "Multi-Region Ready",    "LATAM · US · EU · ASIA · OCEANIA"),
    ]

    # Grid 3 cols × 2 rows
    cols = 3
    rows = 2
    grid_top = 290
    grid_bottom = H - 160
    gap = 20
    total_w = W - MARGIN * 2
    cell_w = (total_w - gap * (cols - 1)) // cols
    cell_h = (grid_bottom - grid_top - gap * (rows - 1)) // rows

    f_num = font(GEIST_MONO_BOLD, 18)
    f_card_title = font(BRICOLAGE_BOLD, 30)
    f_card_sub = font(BRICOLAGE_REG, 18)

    for i, (num, title, sub) in enumerate(features):
        col = i % cols
        row = i // cols
        x = MARGIN + col * (cell_w + gap)
        y = grid_top + row * (cell_h + gap)
        # alternating border accent
        accent = ROSE if (i + row) % 2 == 0 else MAGENTA
        # card bg
        draw.rounded_rectangle((x, y, x + cell_w, y + cell_h), radius=18, fill=STRATUM_1)
        bc = tuple(int(c * 0.22 + STRATUM_2[idx] * 0.78) for idx, c in enumerate(accent))
        draw.rounded_rectangle((x, y, x + cell_w, y + cell_h), radius=18, outline=bc, width=2)

        # number top-left
        draw.text((x + 24, y + 22), num, font=f_num, fill=accent)
        # accent dot top-right
        draw.ellipse((x + cell_w - 30, y + 26, x + cell_w - 18, y + 38), fill=accent)

        # title
        draw.text((x + 24, y + 70), title, font=f_card_title, fill=WHITE)
        # subtitle
        # wrap subtitle naturally
        lines = []
        words = sub.split(" · ")
        for w in words:
            lines.append(w)
        # render each on its line
        sub_y = y + cell_h - 24 - (len(lines) * 22)
        for ln in lines:
            draw.text((x + 24, sub_y), ln, font=f_card_sub, fill=WHISPER)
            sub_y += 22

    # Footer index
    f_mono = font(GEIST_MONO, 22)
    draw.text((W - MARGIN, H - MARGIN - 4), "03 / 04", font=f_mono, fill=TIMESTAMP, anchor="rb")
    draw.text((MARGIN, H - MARGIN - 4), "destino.tv", font=f_mono, fill=TIMESTAMP, anchor="lb")

    out = canvas.convert("RGB")
    out.save(ROOT / "03_features_grid.png", "PNG", optimize=True)
    print("[OK] 03_features_grid.png")

# ──────────────────────────────────────────────────────────
# IMG 4 — SOLO FOUNDER QUOTE
# ──────────────────────────────────────────────────────────
def render_quote():
    canvas = Image.new("RGBA", (W, H), (*VOID, 255))
    # Single big central orb
    canvas = add_orb(canvas, W // 2, H // 2, 520, ROSE, 0.10)
    canvas = add_orb(canvas, W // 2 + 80, H // 2 - 40, 360, MAGENTA, 0.06)

    draw = ImageDraw.Draw(canvas)

    # Top mark — small horizontal bar
    bar_w = 64
    draw.rectangle((W // 2 - bar_w // 2, 200, W // 2 + bar_w // 2, 204), fill=ROSE)

    f_quote_big = font(BRICOLAGE_BOLD, 102)
    f_quote_small = font(BRICOLAGE_BOLD, 56)
    f_sub = font(BRICOLAGE_REG, 26)
    f_mono = font(GEIST_MONO, 22)

    # Composition: 2 big lines (gradient), 1 small line (gradient)
    canvas = composite_text(canvas, ImageDraw.Draw(canvas), "One person.", f_quote_big, W // 2, 380, ROSE, MAGENTA, anchor="mm")
    canvas = composite_text(canvas, ImageDraw.Draw(canvas), "One vision.", f_quote_big, W // 2, 510, ROSE, MAGENTA, anchor="mm")
    canvas = composite_text(canvas, ImageDraw.Draw(canvas), "Built by one.", f_quote_big, W // 2, 640, ROSE, MAGENTA, anchor="mm")
    # secondary line — smaller, plain whisper color
    draw = ImageDraw.Draw(canvas)
    draw.text((W // 2, 730), "An app that usually takes eight.", font=f_sub, fill=WHISPER, anchor="mm")

    # Divider
    div_y = 820
    draw.line([(W // 2 - 220, div_y), (W // 2 + 220, div_y)], fill=(60, 30, 50), width=1)

    # Signature
    draw.text((W // 2, 880), "— Built solo by Orbys", font=f_sub, fill=WHITE, anchor="mm")
    draw.text((W // 2, 920), "Destino TV", font=f_mono, fill=WHISPER, anchor="mm")

    # Bottom corners
    draw.text((MARGIN, H - MARGIN - 4), "destino.tv", font=f_mono, fill=TIMESTAMP, anchor="lb")
    draw.text((W - MARGIN, H - MARGIN - 4), "04 / 04", font=f_mono, fill=TIMESTAMP, anchor="rb")

    out = canvas.convert("RGB")
    out.save(ROOT / "04_solo_founder.png", "PNG", optimize=True)
    print("[OK] 04_solo_founder.png")

# ──────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("Generating LinkedIn assets...")
    render_hero()
    render_stack()
    render_features()
    render_quote()
    print("Done. Files in:", ROOT)
