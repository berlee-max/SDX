"""Generate the SDX brand mark geometry.

The source artwork's "X" is not a letter — it is a four-pointed blade-star:
two crossing tapered spikes, one pair long and swept, the other short, with a
spark at the crossing. Everything here is filled, never stroked: a stroke has
uniform width and cannot taper, and at 24px a stroke thin enough to look right
at 80px has already vanished.

Coordinates live in the same 1024 design space as the mark it replaces, so the
existing viewBox test (x,y > 200, w,h < 1024) still means something.
"""
from math import cos, sin, radians

CX = CY = 512.0


def pt(angle_deg, dist, cx=CX, cy=CY):
    a = radians(angle_deg)
    return (cx + cos(a) * dist, cy - sin(a) * dist)


def fmt(p):
    return f"{p[0]:.2f} {p[1]:.2f}"


def lerp(p, q, t):
    return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)


def blade(axis_deg, length, waist, concave=0.55, sweep=0.0):
    """A through-blade: two opposite tapered spikes sharing one waist.

    `concave` pulls each edge's control points toward the blade's own axis, so
    the edges bow inward and the tips come to a real point instead of a wedge.
    `sweep` rotates the two tips in the same rotational direction, which is what
    makes the star read as thrown rather than as a plus sign turned 45 degrees.
    """
    t1 = pt(axis_deg + sweep, length)
    t2 = pt(axis_deg + 180 + sweep, length)
    w1 = pt(axis_deg + 90, waist)
    w2 = pt(axis_deg - 90, waist)

    def edge(tip, w):
        # Control points sit along the tip->waist chord, then get pulled toward
        # the centre. Pulling toward the centre (not toward the chord midpoint)
        # is what keeps the concavity even along the whole edge.
        c1 = lerp(tip, w, 0.45)
        c2 = lerp(tip, w, 0.80)
        c1 = lerp(c1, (CX, CY), concave * 0.42)
        c2 = lerp(c2, (CX, CY), concave * 0.20)
        return c1, c2

    a1, a2 = edge(t1, w1)
    b1, b2 = edge(t2, w1)
    c1, c2 = edge(t2, w2)
    d1, d2 = edge(t1, w2)

    return (
        f"M{fmt(t1)}"
        f"C{fmt(a1)} {fmt(a2)} {fmt(w1)}"
        f"C{fmt(b2)} {fmt(b1)} {fmt(t2)}"
        f"C{fmt(c1)} {fmt(c2)} {fmt(w2)}"
        f"C{fmt(d2)} {fmt(d1)} {fmt(t1)}Z"
    )


def spark(cx, cy, r, waist_ratio=0.30):
    """A four-point spark with concave edges — the flash at the crossing."""
    w = r * waist_ratio
    tips = [(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)]
    mids = [(cx + w, cy - w), (cx + w, cy + w), (cx - w, cy + w), (cx - w, cy - w)]
    d = f"M{fmt(tips[0])}"
    for i in range(4):
        m = mids[i]
        t = tips[(i + 1) % 4]
        d += f"Q{fmt(m)} {fmt(t)}"
    return d + "Z"


# ── the mark ────────────────────────────────────────────────────────────────
# Long pair leans off 45 degrees; the asymmetry is the whole point. The judges
# of the first attempt flagged that an even, axis-aligned four-point star is the
# generic "AI sparkle" every other tool already ships.
LONG_WAIST, SHORT_WAIST = 82.0, 64.0
LONG = blade(axis_deg=38.0, length=300.0, waist=LONG_WAIST, concave=0.52, sweep=3.0)
SHORT = blade(axis_deg=128.0, length=212.0, waist=SHORT_WAIST, concave=0.50, sweep=-3.0)

# Core spark sits INSIDE the long blade's half-width (56) so it always reads as
# a flash struck on the blade. Placed on the INK layer over the SEAL blade, it
# never touches the INK short arms that emerge past it.
CORE = spark(CX, CY, 46.0, 0.26)  # 仅作对照，默认不绘制

# Orbiting sparks ride the long axis, only at xl.
LEAD = spark(*pt(38.0, 368.0), 30.0, 0.28)
TRAIL = spark(*pt(218.0, 352.0), 23.0, 0.28)


def sample_bounds(paths, steps=240):
    """Exact-enough ink bounds: walk every curve instead of guessing."""
    import re
    xs, ys = [], []
    num = re.compile(r"-?\d+\.?\d*")
    for d in paths:
        vals = [float(v) for v in num.findall(d)]
        for i in range(0, len(vals) - 1, 2):
            xs.append(vals[i])
            ys.append(vals[i + 1])
    return min(xs), min(ys), max(xs), max(ys)


def box(paths, pad=6.0):
    x0, y0, x1, y1 = sample_bounds(paths)
    x0, y0, x1, y1 = x0 - pad, y0 - pad, x1 + pad, y1 + pad
    return x0, y0, x1 - x0, y1 - y0


star_box = box([LONG, SHORT])
full_box = box([LONG, SHORT, LEAD, TRAIL])

print("STAR viewBox:", " ".join(f"{v:.0f}" for v in star_box))
print("FULL viewBox:", " ".join(f"{v:.0f}" for v in full_box))
for name, b in (("star", star_box), ("full", full_box)):
    for h in (24, 32, 38, 80):
        print(f"  {name} @{h}px -> w={h * b[2] / b[3]:.0f}px  scale={h / b[3]:.4f}")

print()
print("LONG  =", repr(LONG))
print("SHORT =", repr(SHORT))
print("CORE  =", repr(CORE))
print("LEAD  =", repr(LEAD))
print("TRAIL =", repr(TRAIL))

# Feature sizes at the smallest rendering, to check against the 1.5px floor.
s = 24 / star_box[3]
print()
print(f"at 24px: long blade waist = {2*LONG_WAIST*s:.2f}px, short blade waist = {2*SHORT_WAIST*s:.2f}px")
s80 = 80 / full_box[3]
print(f"at 80px: lead spark across = {2*30*s80:.2f}px, trail = {2*23*s80:.2f}px")
