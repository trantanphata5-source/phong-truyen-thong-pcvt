import sys
import fitz

doc = fitz.open('source/dia-du-pcvt.pdf')
page = doc[0]

# Look for large rectangular border lines or title block
drawings = page.get_drawings()
large_rects = []
for d in drawings:
    r = d.get('rect')
    if r and r.width > 1500 and r.height > 2000:
        large_rects.append((d.get('color'), d.get('width'), (r.x0, r.y0, r.x1, r.y1)))

print("Large border rects:")
for lr in large_rects:
    print(lr)

# Find title block text
blocks = page.get_text('blocks')
for b in blocks:
    if any(k in b[4].upper() for k in ['SƠ ĐỒ', 'ĐỊA DƯ', 'LƯỚI ĐIỆN', 'TỶ LỆ', 'NGÀY']):
        print(f"Title/Info: ({b[0]:.1f}, {b[1]:.1f}) {b[4].strip()}")
