import fitz

doc = fitz.open('source/dia-du-pcvt.pdf')
page = doc[0]

# Find all rectangles or lines around the map frame
drawings = page.get_drawings()
frame_lines = []
for d in drawings:
    r = d.get('rect')
    if r and (r.width > 2000 or r.height > 2500):
        frame_lines.append((d.get('color'), d.get('width'), (round(r.x0, 2), round(r.y0, 2), round(r.x1, 2), round(r.y1, 2))))

print("Frame drawings:", len(frame_lines))
for fl in frame_lines:
    print(fl)

# Check legend boundary (bottom left)
# In legend area: x < 500, y > 2800
legend_box = [d for d in drawings if d.get('rect') and d['rect'].width > 400 and d['rect'].height > 300 and d['rect'].x0 < 100 and d['rect'].y0 > 2800]
print("Legend box outlines:")
for lb in legend_box:
    r = lb['rect']
    print(lb.get('color'), (round(r.x0, 1), round(r.y0, 1), round(r.x1, 1), round(r.y1, 1)))
