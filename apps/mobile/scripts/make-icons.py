"""
Φτιάχνει εικονίδιο, adaptive icon (Android), splash και εικονίδιο ειδοποιήσεων
από τα χρώματα της μάρκας. Χρήση (από το apps/mobile):

    python scripts/make-icons.py                 # χρώματα από προεπιλογή
    python scripts/make-icons.py "#1F8A84"       # άλλο κύριο χρώμα

Θέμα: τρεις φίλοι (κουκκίδες) που «συναντιούνται» σε ένα pin στη μέση.
Αν έχεις δικό σου λογότυπο, απλώς αντικατέστησε τα PNG στο assets/ με τις ίδιες διαστάσεις.
"""
import math
import os
import sys

from PIL import Image, ImageDraw

PRIMARY = sys.argv[1] if len(sys.argv) > 1 else "#E4572E"
WHITE = "#FFFFFF"
SS = 4  # supersampling για ομαλές άκρες
OUT = os.path.join(os.path.dirname(__file__), "..", "assets")
os.makedirs(OUT, exist_ok=True)


def hex_rgba(h, a=255):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4)) + (a,)


def draw_mark(size, fg, accent, bg=None, scale=1.0):
    """Το σήμα: pin στο κέντρο + 3 φίλοι γύρω του με διακεκομμένες «διαδρομές»."""
    S = size * SS
    img = Image.new("RGBA", (S, S), hex_rgba(bg) if bg else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = S / 2, S / 2
    u = S * scale  # μονάδα

    # Φίλοι σε τρίγωνο γύρω από το κέντρο
    R = 0.30 * u
    dot = 0.055 * u
    friends = [(cx + R * math.cos(a), cy + R * math.sin(a)) for a in (math.radians(-90), math.radians(30), math.radians(150))]
    pin_r = 0.11 * u
    pin_top = cy - 0.07 * u
    for fx, fy in friends:
        # διακεκομμένη διαδρομή προς το κέντρο (με κενό γύρω από φίλο και pin)
        for t in (0.30, 0.42, 0.54):
            px, py = fx + (cx - fx) * t, fy + (cy - fy) * t
            if math.hypot(px - cx, py - pin_top) < pin_r * 1.2:
                continue
            r = 0.013 * u
            d.ellipse([px - r, py - r, px + r, py + r], fill=hex_rgba(fg, 190))
        d.ellipse([fx - dot, fy - dot, fx + dot, fy + dot], fill=hex_rgba(fg))

    # Pin (σταγόνα) στο κέντρο: κύκλος + τρίγωνο εφαπτόμενο στον κύκλο
    pr = 0.11 * u
    top = cy - 0.07 * u
    d.ellipse([cx - pr, top - pr, cx + pr, top + pr], fill=hex_rgba(fg))
    tip_d = pr * 2.0  # απόσταση μύτης από το κέντρο του κύκλου
    phi = math.acos(pr / tip_d)
    tx, ty = pr * math.sin(phi), pr * math.cos(phi)
    d.polygon([(cx - tx, top + ty), (cx + tx, top + ty), (cx, top + tip_d)], fill=hex_rgba(fg))
    hole = pr * 0.42
    d.ellipse([cx - hole, top - hole, cx + hole, top + hole], fill=hex_rgba(accent) if accent else (0, 0, 0, 0))
    return img.resize((size, size), Image.LANCZOS)


def save(img, name):
    path = os.path.join(OUT, name)
    img.save(path)
    print("ok", os.path.relpath(path))


# iOS / γενικό εικονίδιο: αδιαφανές, χωρίς διαφάνεια (το iOS το στρογγυλεύει μόνο του)
save(draw_mark(1024, WHITE, PRIMARY, bg=PRIMARY).convert("RGB"), "icon.png")
# Android adaptive: διάφανο σήμα μέσα στη «ασφαλή ζώνη» (~66%), το φόντο ορίζεται στο app.json
save(draw_mark(1024, WHITE, PRIMARY, scale=0.72), "adaptive-icon.png")
# Splash: το σήμα στο χρώμα της μάρκας, διάφανο (φόντο από το app.json, φωτεινό/σκοτεινό)
save(draw_mark(512, PRIMARY, "#FFFFFF"), "splash-icon.png")
# Ειδοποιήσεις Android: μονόχρωμο λευκό σε διάφανο
save(draw_mark(96, WHITE, None, scale=1.15), "notification-icon.png")
