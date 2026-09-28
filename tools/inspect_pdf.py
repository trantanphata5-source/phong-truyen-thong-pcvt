import sys
import fitz

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

doc = fitz.open('source/dia-du-pcvt.pdf')
page = doc[0]
rect = page.rect
print(f"Page rect: {rect} (width: {rect.width}, height: {rect.height})")

# 1. Text analysis
blocks = page.get_text('blocks')
print(f"Total text blocks: {len(blocks)}")

# Find stations, admin divisions, legends
print("\n--- TEXT BLOCKS OF INTEREST ---")
for b in blocks:
    txt = b[4].strip()
    bbox = (round(b[0], 1), round(b[1], 1), round(b[2], 1), round(b[3], 1))
    # Print interesting blocks
    keywords = ['CHÚ THÍCH', 'TBA', '500KV', '220KV', '110KV', 'CƠ SỞ', 'PHƯỜNG', 'XÃ', 'ĐẶC KHU', 'ĐỒNG BỘ', 'GIAO THÔNG']
    if any(k in txt.upper() for k in keywords) or 'TRẠM' in txt.upper():
        print(f"BBOX {bbox}: {txt.replace(chr(10), ' | ')}")
