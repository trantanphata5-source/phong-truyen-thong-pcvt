import fitz
import re

doc = fitz.open('source/dia-du-pcvt.pdf')
page = doc[0]
blocks = page.get_text('blocks')

stations_500 = ['Phú Mỹ']
stations_220 = ['KCN Mỹ Xuân', 'Phú Mỹ', 'Tân Thành', 'KCN Phú Mỹ 3', 'KCN Bà Rịa', 'Vũng Tàu']
stations_110 = [
    'Mỹ Xuân A', 'Mỹ Xuân A2', 'Mỹ Xuân B1', 'Phú Mỹ', 'Tóc Tiên', 'Tân Hạnh',
    'Tân Phước', 'Thị Vải', 'Thanh Bình', 'Cái Mép', 'Bà Rịa', 'Bà Rịa 2',
    'Ba Nanh', 'Phước Thắng', 'Đông Xuyên', 'Vũng Tàu', 'Thắng Tam', 'SM Bến Đình',
    'Côn Đảo'
]
stations_kh = [
    'Thép Đồng Tiến', 'China Steel', 'Vina Kyoei', 'Thép Việt', 'Pomina', 'Pomina 2',
    'Tôn Hoa Sen', 'Thép Miền Nam', 'Pos-Vina', 'L.Gas', 'Posco',
    'Hyosung Vina Core Materials', 'Hyosung Vina Chemical', 'Fuco', 'LSB Long Sơn'
]
stations_lc = ['Ngãi Giao', 'Long Đất', 'An Ngãi']
pcvt_coso = ['Cơ sở 1', 'Cơ sở 2', 'Cơ sở 3', 'Cơ sở 4']

def find_blocks(names, category):
    print(f"\n=== Searching {category} ({len(names)}) ===")
    found = {}
    for name in names:
        pattern = re.compile(re.escape(name), re.IGNORECASE)
        matches = []
        for b in blocks:
            txt = b[4].strip().replace('\n', ' ')
            if pattern.search(txt):
                matches.append((round(b[0], 1), round(b[1], 1), round(b[2], 1), round(b[3], 1), txt))
        if matches:
            found[name] = matches
            print(f"  [FOUND] {name}: {matches}")
        else:
            print(f"  [MISSING] {name}")
    print(f"Total found for {category}: {len(found)}/{len(names)}")
    return found

f500 = find_blocks(stations_500, "500kV")
f220 = find_blocks(stations_220, "220kV")
f110 = find_blocks(stations_110, "110kV Lưới")
fkh = find_blocks(stations_kh, "110kV Khách hàng")
flc = find_blocks(stations_lc, "Trạm lân cận")
fcs = find_blocks(pcvt_coso, "Cơ sở PCVT")
