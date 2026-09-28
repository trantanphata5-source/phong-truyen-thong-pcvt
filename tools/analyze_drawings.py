import sys
import fitz
from collections import Counter

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

doc = fitz.open('source/dia-du-pcvt.pdf')
page = doc[0]

print("Extracting drawings...")
drawings = page.get_drawings()
print(f"Total drawings: {len(drawings)}")

# Analyze stroke colors, fill colors, and line widths
stroke_styles = Counter()
fill_colors = Counter()

for d in drawings:
    color = d.get('color')
    fill = d.get('fill')
    width = d.get('width', 0)
    
    # round color tuple to 2 decimals
    c_key = tuple(round(c, 2) for c in color) if color else None
    f_key = tuple(round(f, 2) for f in fill) if fill else None
    w_key = round(width, 2) if width else 0
    
    stroke_styles[(c_key, w_key)] += 1
    if f_key:
        fill_colors[f_key] += 1

print("\n--- TOP 35 STROKE STYLES (color, width): count ---")
for (c, w), cnt in stroke_styles.most_common(35):
    print(f"Color: {c}, Width: {w}pt -> Count: {cnt}")

print("\n--- TOP 20 FILL COLORS: count ---")
for f, cnt in fill_colors.most_common(20):
    print(f"Fill: {f} -> Count: {cnt}")

# Also analyze drawings in the legend box (bottom left)
# Legend text was around x: 22..434, y: 2848..3200
print("\n--- DRAWINGS IN LEGEND AREA (x: 20..450, y: 2840..3250) ---")
legend_drawings = []
for d in drawings:
    r = d.get('rect')
    if r and r.x0 >= 20 and r.x1 <= 450 and r.y0 >= 2840 and r.y1 <= 3250:
        c = tuple(round(x, 2) for x in d['color']) if d.get('color') else None
        f = tuple(round(x, 2) for x in d['fill']) if d.get('fill') else None
        w = round(d.get('width', 0), 2)
        legend_drawings.append((c, f, w, (round(r.x0, 1), round(r.y0, 1), round(r.x1, 1), round(r.y1, 1))))

print(f"Total drawings in legend area: {len(legend_drawings)}")
for item in legend_drawings[:30]:
    print("Legend item:", item)
