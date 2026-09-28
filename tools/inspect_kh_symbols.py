import fitz

doc = fitz.open('source/dia-du-pcvt.pdf')
page = doc[0]
drawings = page.get_drawings()

# Let's inspect drawings near all stations
kh_test = [
    ('China Steel', 600.8, 816.9),
    ('Thep Dong Tien', 761.2, 738.7),
    ('Ton Hoa Sen', 559.3, 987.4),
    ('Pomina', 469.4, 1078.5),
    ('LSB Long Son', 686.9, 1755.1)
]

for name, tx, ty in kh_test:
    print(f"\n--- Near KH: {name} ({tx}, {ty}) ---")
    nearby = [d for d in drawings if d.get('rect') and abs(d['rect'].x0 - tx) < 40 and abs(d['rect'].y0 - ty) < 40 and d['rect'].width < 25 and d['rect'].height < 25]
    for d in nearby:
        c = tuple(round(x, 2) for x in d['color']) if d.get('color') else None
        f = tuple(round(x, 2) for x in d['fill']) if d.get('fill') else None
        r = (round(d['rect'].x0, 1), round(d['rect'].y0, 1), round(d['rect'].x1, 1), round(d['rect'].y1, 1))
        print(f"  color={c}, fill={f}, rect={r}, items={len(d.get('items', []))}")
