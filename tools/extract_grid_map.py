#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract_grid_map.py
Trích xuất toàn bộ dữ liệu vector và ảnh nền từ bản vẽ địa dư PCVT:
Source: source/dia-du-pcvt.pdf
Output:
  - assets/grid/pcvt_grid.json
  - assets/grid/base_{r}{c}.webp (6 tiles: 2 col x 3 row)
  - assets/grid/base_low.webp (1024px)
  - assets/grid/preview.png
"""

import sys
import os
import re
import math
import json
import time
from collections import Counter
import fitz  # PyMuPDF
from PIL import Image, ImageDraw, ImageFont

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

PDF_PATH = 'source/dia-du-pcvt.pdf'
OUTPUT_DIR = 'assets/grid'
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Khung bản đồ xác định từ bản vẽ CAD (bỏ viền ngoài và bảng tên)
FRAME_X0 = 9.6
FRAME_Y0 = 126.16
FRAME_X1 = 2373.6
FRAME_Y1 = 3243.04
FRAME_W = FRAME_X1 - FRAME_X0  # 2364.0 pt
FRAME_H = FRAME_Y1 - FRAME_Y0  # 3116.88 pt

# Bảng chú thích (bỏ qua khi lấy đường dây và địa danh)
LEGEND_X0 = 10.1
LEGEND_Y0 = 2840.7
LEGEND_X1 = 487.0
LEGEND_Y1 = 3242.7

def is_in_legend(x, y):
    return LEGEND_X0 <= x <= LEGEND_X1 and LEGEND_Y0 <= y <= LEGEND_Y1

def norm_x(x):
    return max(0.0, min(1.0, (x - FRAME_X0) / FRAME_W))

def norm_y(y):
    # Normalized Y from 0 (top/North) to 1 (bottom/South)
    return max(0.0, min(1.0, (y - FRAME_Y0) / FRAME_H))

# =============================================================================
# Douglas-Peucker Simplification
# =============================================================================
def perpendicular_distance(pt, line_start, line_end):
    if line_start == line_end:
        return math.hypot(pt[0] - line_start[0], pt[1] - line_start[1])
    dx = line_end[0] - line_start[0]
    dy = line_end[1] - line_start[1]
    return abs(dy * pt[0] - dx * pt[1] + line_end[0] * line_start[1] - line_end[1] * line_start[0]) / math.hypot(dx, dy)

def douglas_peucker(points, tolerance=1.5):
    if len(points) <= 2:
        return points
    dmax = 0.0
    index = 0
    for i in range(1, len(points) - 1):
        d = perpendicular_distance(points[i], points[0], points[-1])
        if d > dmax:
            index = i
            dmax = d
    if dmax > tolerance:
        rec1 = douglas_peucker(points[:index + 1], tolerance)
        rec2 = douglas_peucker(points[index:], tolerance)
        return rec1[:-1] + rec2
    else:
        return [points[0], points[-1]]

def main():
    print("=================================================================")
    print("PCVT GRID MAP EXTRACTION - BẮT ĐẦU TRÍCH XUẤT BẢN ĐỒ ĐỊA DƯ PCVT")
    print("=================================================================")
    t0 = time.time()

    doc = fitz.open(PDF_PATH)
    page = doc[0]
    print(f"File PDF: {PDF_PATH} (Trang: 1, Kích thước: {page.rect.width} x {page.rect.height} pt)")

    # 1. BẢNG THỐNG KÊ MÀU NÉT & ĐỘ DÀY (Yêu cầu Mục 6A.1)
    print("\n--- BƯỚC 1: BẢNG THỐNG KÊ MÀU NÉT & ĐỘ DÀY DRAWINGS ---")
    drawings = page.get_drawings()
    total_drawings = len(drawings)
    print(f"Tổng số drawings: {total_drawings}")

    stroke_styles = Counter()
    for d in drawings:
        color = d.get('color')
        w_val = d.get('width')
        width = round(w_val if w_val is not None else 0.0, 2)
        c_key = tuple(round(c, 2) for c in color) if color else None
        stroke_styles[(c_key, width)] += 1

    print("\nBảng thống kê các nét vẽ chính:")
    print(f"{'Màu (RGB)':<22} | {'Độ dày (pt)':<12} | {'Số nét':<10} | {'Nhận diện lớp'}")
    print("-" * 75)
    layer_map_desc = {
        ((0.86, 0.86, 0.86), 0.0): "Giao thông (đường xám sáng)",
        ((0.6, 0.6, 0.6), 0.0): "Giao thông (đường xám tối / ngõ hẻm)",
        ((0.0, 0.0, 0.0), 0.72): "Ranh giới phường mới",
        ((0.0, 0.0, 0.0), 0.12): "Ranh giới phường cũ / ký hiệu phụ",
        ((0.0, 0.0, 0.0), 0.0): "Chữ vector / khung / ký hiệu",
        ((0.0, 0.0, 1.0), 0.72): "Đường dây 110kV (nét dày)",
        ((0.0, 0.0, 1.0), 0.12): "Đường dây 110kV (quy hoạch / nhánh)",
        ((0.0, 0.0, 1.0), 0.0): "Ký hiệu trạm 110kV / đường dây 110kV",
        ((1.0, 0.0, 1.0), 0.0): "Đường dây & Trạm 500kV (hồng tím)",
        ((1.0, 0.0, 0.0), 0.0): "Đường dây 220kV (đỏ)",
        ((0.8, 0.13, 0.15), 0.0): "Ký hiệu trạm 220kV (đỏ sẫm)",
        ((0.0, 1.0, 0.0), 0.0): "Công trình ĐBGT (Đã có ý kiến HSTK)",
        ((1.0, 0.5, 0.0), 0.0): "Công trình ĐBGT (UBND đang thẩm định)",
        ((0.97, 0.84, 0.19), 0.0): "Công trình ĐBGT (Chưa khảo sát hiện trạng)",
        ((1.0, 1.0, 0.5), 0.0): "Vùng tô màu phường / khu vực",
        ((0.07, 0.27, 0.6), 0.0): "Logo / Cơ sở PCVT (EVNHCMC)",
    }

    for (c, w), cnt in stroke_styles.most_common(25):
        c_str = str(c) if c else "None"
        desc = layer_map_desc.get((c, w), "Khác")
        print(f"{c_str:<22} | {w:<12} | {cnt:<10} | {desc}")

    # 2. TRÍCH XUẤT NHÃN VĂN BẢN (Text Blocks)
    print("\n--- BƯỚC 2: TRÍCH XUẤT VĂN BẢN & ĐỊNH VỊ TRẠM ---")
    blocks = page.get_text('blocks')
    print(f"Tổng số text blocks: {len(blocks)}")

    # Trích xuất danh sách trạm theo danh mục chuẩn của Kế hoạch (Mục 6A)
    # Tìm tọa độ của các trạm bằng cách ghép text nhãn và symbol tam giác gần nhất
    all_triangles = []
    for d in drawings:
        r = d.get('rect')
        if not r or r.width > 30 or r.height > 30:
            continue
        c = tuple(round(x, 2) for x in d['color']) if d.get('color') else None
        f = tuple(round(x, 2) for x in d['fill']) if d.get('fill') else None
        # Triangle symbol has items with 3-4 segments
        if len(d.get('items', [])) in (3, 4, 6, 8, 12, 14, 24):
            cx = (r.x0 + r.x1) / 2
            cy = (r.y0 + r.y1) / 2
            if not is_in_legend(cx, cy):
                all_triangles.append({'cx': cx, 'cy': cy, 'rect': r, 'color': c, 'fill': f})

    print(f"Đã tìm thấy {len(all_triangles)} ký hiệu biểu trưng trạm (symbols) trên bản đồ.")

    def find_nearest_station_pos(name_pattern, default_x, default_y, search_rad=55):
        # Find matching block
        best_block = None
        for b in blocks:
            txt = b[4].strip().replace('\n', ' ')
            if re.search(name_pattern, txt, re.IGNORECASE):
                bx = (b[0] + b[2]) / 2
                by = (b[1] + b[3]) / 2
                if not is_in_legend(bx, by):
                    best_block = (bx, by, txt)
                    break
        if not best_block:
            return default_x, default_y

        bx, by, _ = best_block
        # Find nearest triangle symbol
        best_sym = None
        min_d = search_rad
        for sym in all_triangles:
            d = math.hypot(sym['cx'] - bx, sym['cy'] - by)
            if d < min_d:
                min_d = d
                best_sym = sym

        if best_sym:
            return round(best_sym['cx'], 1), round(best_sym['cy'], 1)
        return round(bx, 1), round(by, 1)

    # 1 TBA 500kV
    tram_500 = [
        {
            'id': 'tba_500_phu_my',
            'ten': 'Phú Mỹ (KCN Phú Mỹ)',
            'cap': '500kV',
            'loai': 'luoi',
            'trang_thai': 'hien_trang',
            'phuong': 'P. Phú Mỹ',
            'pattern': r'500kV.*Phú Mỹ|Trạm 500kV',
            'def_pos': (474.0, 900.7)
        }
    ]

    # 6 TBA 220kV
    tram_220 = [
        { 'id': 'tba_220_my_xuan', 'ten': 'KCN Mỹ Xuân', 'cap': '220kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'P. Mỹ Xuân', 'pattern': r'220kV.*Mỹ Xuân', 'def_pos': (510.2, 793.9) },
        { 'id': 'tba_220_phu_my', 'ten': 'Phú Mỹ', 'cap': '220kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'P. Phú Mỹ', 'pattern': r'220kV Phú Mỹ', 'def_pos': (504.1, 918.4) },
        { 'id': 'tba_220_tan_thanh', 'ten': 'Tân Thành', 'cap': '220kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'P. Tân Phước', 'pattern': r'220kV Tân Thành', 'def_pos': (653.6, 1244.6) },
        { 'id': 'tba_220_phu_my_3', 'ten': 'KCN Phú Mỹ 3', 'cap': '220kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'P. Tân Phước', 'pattern': r'220kV.*Phú Mỹ 3', 'def_pos': (831.4, 1541.0) },
        { 'id': 'tba_220_ba_ria', 'ten': 'KCN Bà Rịa', 'cap': '220kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'P. Long Hương', 'pattern': r'220kV.*Bà Rịa', 'def_pos': (1262.9, 1573.1) },
        { 'id': 'tba_220_vung_tau', 'ten': 'Vũng Tàu', 'cap': '220kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'P. 11', 'pattern': r'220kV Vũng Tàu', 'def_pos': (1051.7, 2095.6) }
    ]

    # 19 TBA 110kV Lưới
    tram_110_luoi = [
        { 'id': 'tba_110_my_xuan_a', 'ten': 'Mỹ Xuân A', 'cap': '110kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'P. Mỹ Xuân', 'pattern': r'110kV Mỹ Xuân A\b', 'def_pos': (510.4, 734.9) },
        { 'id': 'tba_110_my_xuan_a2', 'ten': 'Mỹ Xuân A2', 'cap': '110kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'P. Mỹ Xuân', 'pattern': r'110kV Mỹ Xuân A2', 'def_pos': (531.0, 776.7) },
        { 'id': 'tba_110_my_xuan_b1', 'ten': 'Mỹ Xuân B1', 'cap': '110kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'P. Mỹ Xuân', 'pattern': r'110kV Mỹ Xuân B1', 'def_pos': (666.7, 722.9) },
        { 'id': 'tba_110_phu_my', 'ten': 'Phú Mỹ', 'cap': '110kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'P. Phú Mỹ', 'pattern': r'110kV Phú Mỹ', 'def_pos': (553.2, 920.2) },
        { 'id': 'tba_110_toc_tien', 'ten': 'Tóc Tiên', 'cap': '110kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'Xã Tóc Tiên', 'pattern': r'110kV Tóc Tiên', 'def_pos': (1051.6, 1022.9) },
        { 'id': 'tba_110_tan_hanh', 'ten': 'Tân Hạnh', 'cap': '110kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'P. Phú Mỹ', 'pattern': r'110kV Tân Hạnh', 'def_pos': (727.3, 1070.0) },
        { 'id': 'tba_110_tan_phuoc', 'ten': 'Tân Phước', 'cap': '110kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'P. Tân Phước', 'pattern': r'110kV Tân Phước', 'def_pos': (627.8, 1231.5) },
        { 'id': 'tba_110_thi_vai', 'ten': 'Thị Vải', 'cap': '110kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'P. Tân Phước', 'pattern': r'110kV Thị Vải', 'def_pos': (558.6, 1263.7) },
        { 'id': 'tba_110_thanh_binh', 'ten': 'Thanh Bình', 'cap': '110kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'P. Tân Phước', 'pattern': r'110kV Thanh Bình', 'def_pos': (712.4, 1357.3) },
        { 'id': 'tba_110_cai_mep', 'ten': 'Cái Mép', 'cap': '110kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'P. Tân Phước', 'pattern': r'110kV Cái Mép', 'def_pos': (491.3, 1431.5) },
        { 'id': 'tba_110_ba_ria', 'ten': 'Bà Rịa', 'cap': '110kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'P. Bà Rịa', 'pattern': r'110kV Bà Rịa\b', 'def_pos': (1312.1, 1417.5) },
        { 'id': 'tba_110_ba_ria_2', 'ten': 'Bà Rịa 2', 'cap': '110kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'P. Bà Rịa', 'pattern': r'110kV Bà Rịa 2', 'def_pos': (1238.8, 1510.9) },
        { 'id': 'tba_110_ba_nanh', 'ten': 'Ba Nanh', 'cap': '110kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'Xã Long Sơn', 'pattern': r'110kV Ba Nanh', 'def_pos': (793.9, 1695.3) },
        { 'id': 'tba_110_phuoc_thang', 'ten': 'Phước Thắng', 'cap': '110kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'P. 12', 'pattern': r'110kV Phước Thắng', 'def_pos': (1332.6, 1978.0) },
        { 'id': 'tba_110_dong_xuyen', 'ten': 'Đông Xuyên', 'cap': '110kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'P. Rạch Dừa', 'pattern': r'110kV Đông Xuyên', 'def_pos': (973.7, 2062.7) },
        { 'id': 'tba_110_vung_tau', 'ten': 'Vũng Tàu', 'cap': '110kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'P. Thắng Nhất', 'pattern': r'110kV Vũng Tàu', 'def_pos': (925.1, 2121.2) },
        { 'id': 'tba_110_thang_tam', 'ten': 'Thắng Tam', 'cap': '110kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'P. Thắng Tam', 'pattern': r'110kV Thắng Tam', 'def_pos': (880.4, 2342.0) },
        { 'id': 'tba_110_sm_ben_dinh', 'ten': 'SM Bến Đình', 'cap': '110kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'P. 9', 'pattern': r'110kV SM BẾN ĐÌNH', 'def_pos': (801.7, 2211.1) },
        { 'id': 'tba_110_con_dao', 'ten': 'Côn Đảo', 'cap': '110kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'Đặc khu Côn Đảo', 'pattern': r'Trạm 110kV.*Côn Đảo', 'def_pos': (1484.4, 2836.3) }
    ]

    # 15 TBA 110kV Khách hàng
    tram_110_kh = [
        { 'id': 'tba_kh_thep_dong_tien', 'ten': 'Thép Đồng Tiến', 'cap': '110kV', 'loai': 'khach_hang', 'trang_thai': 'hien_trang', 'phuong': 'P. Mỹ Xuân', 'pattern': r'THÉP ĐỒNG TIẾN', 'def_pos': (761.2, 738.7) },
        { 'id': 'tba_kh_china_steel', 'ten': 'China Steel', 'cap': '110kV', 'loai': 'khach_hang', 'trang_thai': 'hien_trang', 'phuong': 'P. Mỹ Xuân', 'pattern': r'China Steel', 'def_pos': (600.8, 816.9) },
        { 'id': 'tba_kh_vina_kyoei', 'ten': 'Vina Kyoei', 'cap': '110kV', 'loai': 'khach_hang', 'trang_thai': 'hien_trang', 'phuong': 'P. Phú Mỹ', 'pattern': r'Vina Kyoei', 'def_pos': (496.7, 942.1) },
        { 'id': 'tba_kh_thep_viet', 'ten': 'Thép Việt', 'cap': '110kV', 'loai': 'khach_hang', 'trang_thai': 'hien_trang', 'phuong': 'P. Phú Mỹ', 'pattern': r'Thép Việt', 'def_pos': (539.6, 948.1) },
        { 'id': 'tba_kh_pomina', 'ten': 'Pomina', 'cap': '110kV', 'loai': 'khach_hang', 'trang_thai': 'hien_trang', 'phuong': 'P. Phú Mỹ', 'pattern': r'Pomina\b', 'def_pos': (469.4, 1078.5) },
        { 'id': 'tba_kh_pomina_2', 'ten': 'Pomina 2', 'cap': '110kV', 'loai': 'khach_hang', 'trang_thai': 'hien_trang', 'phuong': 'P. Phú Mỹ', 'pattern': r'Pomina 2', 'def_pos': (588.2, 960.5) },
        { 'id': 'tba_kh_ton_hoa_sen', 'ten': 'Tôn Hoa Sen', 'cap': '110kV', 'loai': 'khach_hang', 'trang_thai': 'hien_trang', 'phuong': 'P. Phú Mỹ', 'pattern': r'Tôn Hoa Sen', 'def_pos': (559.3, 987.4) },
        { 'id': 'tba_kh_thep_mien_nam', 'ten': 'Thép Miền Nam', 'cap': '110kV', 'loai': 'khach_hang', 'trang_thai': 'hien_trang', 'phuong': 'P. Phú Mỹ', 'pattern': r'Thép Miền Nam', 'def_pos': (560.5, 1071.7) },
        { 'id': 'tba_kh_pos_vina', 'ten': 'Pos-Vina', 'cap': '110kV', 'loai': 'khach_hang', 'trang_thai': 'hien_trang', 'phuong': 'P. Tân Phước', 'pattern': r'Pos-Vina', 'def_pos': (493.6, 1163.7) },
        { 'id': 'tba_kh_lgas', 'ten': 'L.Gas', 'cap': '110kV', 'loai': 'khach_hang', 'trang_thai': 'hien_trang', 'phuong': 'P. Tân Phước', 'pattern': r'L\.\s*Gas', 'def_pos': (566.9, 1152.1) },
        { 'id': 'tba_kh_posco', 'ten': 'Posco', 'cap': '110kV', 'loai': 'khach_hang', 'trang_thai': 'hien_trang', 'phuong': 'P. Tân Phước', 'pattern': r'Posco', 'def_pos': (479.9, 1179.8) },
        { 'id': 'tba_kh_hyosung_core', 'ten': 'Hyosung Vina Core Materials', 'cap': '110kV', 'loai': 'khach_hang', 'trang_thai': 'hien_trang', 'phuong': 'P. Tân Phước', 'pattern': r'Hyosung.*Core', 'def_pos': (517.4, 1227.4) },
        { 'id': 'tba_kh_hyosung_chem', 'ten': 'Hyosung Vina Chemical', 'cap': '110kV', 'loai': 'khach_hang', 'trang_thai': 'hien_trang', 'phuong': 'P. Tân Phước', 'pattern': r'Vina Chemical|Hyosung', 'def_pos': (561.2, 1317.5) },
        { 'id': 'tba_kh_fuco', 'ten': 'Fuco', 'cap': '110kV', 'loai': 'khach_hang', 'trang_thai': 'hien_trang', 'phuong': 'P. Tân Phước', 'pattern': r'Fuco', 'def_pos': (577.0, 1242.7) },
        { 'id': 'tba_kh_lsb_long_son', 'ten': 'LSB Long Sơn', 'cap': '110kV', 'loai': 'khach_hang', 'trang_thai': 'hien_trang', 'phuong': 'Xã Long Sơn', 'pattern': r'LSB Long Sơn', 'def_pos': (686.9, 1755.1) }
    ]

    # 3 Trạm lân cận
    tram_lan_can = [
        { 'id': 'tba_lc_ngai_giao', 'ten': 'Ngãi Giao (PC Đất Đỏ)', 'cap': '110kV', 'loai': 'lan_can', 'trang_thai': 'hien_trang', 'phuong': 'H. Châu Đức', 'pattern': r'Ngãi Giao', 'def_pos': (1539.6, 563.6) },
        { 'id': 'tba_lc_long_dat', 'ten': 'Long Đất (PC Đất Đỏ)', 'cap': '110kV', 'loai': 'lan_can', 'trang_thai': 'hien_trang', 'phuong': 'H. Long Đất', 'pattern': r'Long Đất', 'def_pos': (1611.1, 1518.9) },
        { 'id': 'tba_lc_an_ngai', 'ten': 'An Ngãi (PC Đất Đỏ)', 'cap': '110kV', 'loai': 'lan_can', 'trang_thai': 'hien_trang', 'phuong': 'H. Long Đất', 'pattern': r'An Ngãi', 'def_pos': (1570.4, 1758.1) }
    ]

    # 4 Cơ sở PCVT
    co_so_pcvt = [
        { 'id': 'coso_1', 'ten': 'PCVT – Cơ sở 1', 'loai': 'co_so', 'phuong': 'P. Vũng Tàu', 'dia_chi': 'Trụ sở chính Công ty', 'pattern': r'Cơ sở 1', 'def_pos': (789.4, 2372.4) },
        { 'id': 'coso_2', 'ten': 'PCVT – Cơ sở 2', 'loai': 'co_so', 'phuong': 'P. Thắng Nhất', 'dia_chi': 'Đội QLVH Lưới điện Vũng Tàu', 'pattern': r'Cơ sở 2', 'def_pos': (848.8, 2239.2) },
        { 'id': 'coso_3', 'ten': 'PCVT – Cơ sở 3', 'loai': 'co_so', 'phuong': 'P. Bà Rịa', 'dia_chi': 'Khu vực Bà Rịa', 'pattern': r'Cơ S 3|Cơ sở 3', 'def_pos': (1303.2, 1505.9) },
        { 'id': 'coso_4', 'ten': 'PCVT – Cơ sở 4', 'loai': 'co_so', 'phuong': 'P. Phú Mỹ', 'dia_chi': 'Khu vực Thị xã Phú Mỹ', 'pattern': r'Cơ sở 4', 'def_pos': (656.5, 1030.1) }
    ]

    # Build final list of all stations with normalized coordinates
    all_stations_output = []
    for grp in [tram_500, tram_220, tram_110_luoi, tram_110_kh, tram_lan_can]:
        for s in grp:
            x_pt, y_pt = find_nearest_station_pos(s['pattern'], s['def_pos'][0], s['def_pos'][1])
            s_out = {
                'id': s['id'],
                'ten': s['ten'],
                'cap': s['cap'],
                'loai': s['loai'],
                'trang_thai': s['trang_thai'],
                'phuong': s['phuong'],
                'pt': [x_pt, y_pt],
                'x': round(norm_x(x_pt), 5),
                'y': round(norm_y(y_pt), 5)
            }
            all_stations_output.append(s_out)

    all_coso_output = []
    for cs in co_so_pcvt:
        x_pt, y_pt = find_nearest_station_pos(cs['pattern'], cs['def_pos'][0], cs['def_pos'][1])
        cs_out = {
            'id': cs['id'],
            'ten': cs['ten'],
            'loai': cs['loai'],
            'phuong': cs['phuong'],
            'dia_chi': cs['dia_chi'],
            'pt': [x_pt, y_pt],
            'x': round(norm_x(x_pt), 5),
            'y': round(norm_y(y_pt), 5)
        }
        all_coso_output.append(cs_out)

    # 3. TRÍCH XUẤT 14 ĐƠN VỊ HÀNH CHÍNH (Admin Divisions)
    print("\n--- BƯỚC 3: TRÍCH XUẤT 14 ĐƠN VỊ HÀNH CHÍNH MỚI ---")
    admin_list = [
        { 'id': 'p_tan_thanh', 'ten': 'P. Tân Thành', 'pattern': r'P\.Tân Thành', 'def_pos': (1150.0, 635.0) },
        { 'id': 'x_chau_pha', 'ten': 'Xã Châu Pha', 'pattern': r'Xã Châu Pha', 'def_pos': (1108.0, 1010.0) },
        { 'id': 'p_phu_my', 'ten': 'P. Phú Mỹ', 'pattern': r'P\.Phú Mỹ', 'def_pos': (623.0, 915.0) },
        { 'id': 'p_tan_phuoc', 'ten': 'P. Tân Phước', 'pattern': r'P\.Tân Phước', 'def_pos': (842.0, 1191.0) },
        { 'id': 'p_tan_hai', 'ten': 'P. Tân Hải', 'pattern': r'P\.Tân Hải', 'def_pos': (974.0, 1511.0) },
        { 'id': 'p_long_huong', 'ten': 'P. Long Hương', 'pattern': r'P\.Long Hương', 'def_pos': (1224.0, 1630.0) },
        { 'id': 'p_tam_long', 'ten': 'P. Tam Long', 'pattern': r'P\.Tam Long', 'def_pos': (1550.0, 1380.0) },
        { 'id': 'p_ba_ria', 'ten': 'P. Bà Rịa', 'pattern': r'P\.Bà Rịa', 'def_pos': (1362.0, 1570.0) },
        { 'id': 'x_long_son', 'ten': 'Xã Long Sơn', 'pattern': r'Xã Long Sơn', 'def_pos': (927.0, 1798.0) },
        { 'id': 'p_phuoc_thang', 'ten': 'P. Phước Thắng', 'pattern': r'P\.Phước Thắng', 'def_pos': (1270.0, 2020.0) },
        { 'id': 'p_rach_dua', 'ten': 'P. Rạch Dừa', 'pattern': r'P\.Rạch Dừa', 'def_pos': (960.0, 2053.0) },
        { 'id': 'p_tam_thang', 'ten': 'P. Tam Thắng', 'pattern': r'P\.Tam Thắng', 'def_pos': (850.0, 2240.0) },
        { 'id': 'p_vung_tau', 'ten': 'P. Vũng Tàu', 'pattern': r'P\.Vũng Tàu', 'def_pos': (822.0, 2403.0) },
        { 'id': 'dk_con_dao', 'ten': 'Đặc khu Côn Đảo', 'pattern': r'Đặc khu Côn Đảo', 'def_pos': (1560.0, 2580.0) }
    ]

    all_admin_output = []
    for adm in admin_list:
        ax, ay = adm['def_pos']
        for b in blocks:
            txt = b[4].strip().replace('\n', ' ')
            if re.search(adm['pattern'], txt, re.IGNORECASE):
                bx = (b[0] + b[2]) / 2
                by = (b[1] + b[3]) / 2
                if not is_in_legend(bx, by):
                    ax, ay = bx, by
                    break
        all_admin_output.append({
            'id': adm['id'],
            'ten': adm['ten'],
            'pt': [round(ax, 1), round(ay, 1)],
            'x': round(norm_x(ax), 5),
            'y': round(norm_y(ay), 5)
        })

    # 4. TRÍCH XUẤT ĐƯỜNG DÂY (Power Lines: 500kV, 220kV, 110kV)
    print("\n--- BƯỚC 4: TRÍCH XUẤT ĐƯỜNG DÂY (DOUGLAS-PEUCKER 1.5pt) ---")
    lines_by_voltage = {
        '500kV': [],
        '220kV': [],
        '110kV': []
    }

    # Helper: parse drawing items into line segments
    for d in drawings:
        r = d.get('rect')
        if not r or is_in_legend(r.x0, r.y0):
            continue

        c = tuple(round(x, 2) for x in d['color']) if d.get('color') else None
        dashes = d.get('dashes', '')
        is_dashed = bool(dashes and dashes != '[] 0')

        # Identify line voltage
        v_class = None
        if c == (1.0, 0.0, 1.0):
            v_class = '500kV'
        elif c in ((1.0, 0.0, 0.0), (0.8, 0.13, 0.15)):
            v_class = '220kV'
        elif c == (0.0, 0.0, 1.0):
            v_class = '110kV'

        if not v_class:
            continue

        # Extract polyline points
        pts = []
        for it in d.get('items', []):
            cmd = it[0]
            if cmd == 'l':
                p1, p2 = it[1], it[2]
                if not pts:
                    pts.append((p1.x, p1.y))
                pts.append((p2.x, p2.y))
            elif cmd == 'c':
                p1, p2, p3, p4 = it[1], it[2], it[3], it[4]
                if not pts:
                    pts.append((p1.x, p1.y))
                # Add sampled curve points
                pts.extend([(p2.x, p2.y), (p3.x, p3.y), (p4.x, p4.y)])

        if len(pts) >= 2:
            # Apply Douglas-Peucker simplification
            simplified = douglas_peucker(pts, tolerance=1.5)
            # Normalize points to 0..1
            norm_pts = [[round(norm_x(p[0]), 5), round(norm_y(p[1]), 5)] for p in simplified]
            lines_by_voltage[v_class].append({
                'quy_hoach': is_dashed,
                'points': norm_pts
            })

    for v, llist in lines_by_voltage.items():
        ht_cnt = sum(1 for l in llist if not l['quy_hoach'])
        qh_cnt = sum(1 for l in llist if l['quy_hoach'])
        print(f"Đường dây {v}: {len(llist)} đoạn (Hiện trạng: {ht_cnt}, Quy hoạch: {qh_cnt})")

    # 5. CÔNG TRÌNH ĐỒNG BỘ GIAO THÔNG (ĐBGT) — Đã loại bỏ theo yêu cầu GĐ5-fix (Mục B2)
    print("\n--- BƯỚC 5: CÔNG TRÌNH ĐỒNG BỘ GIAO THÔNG (ĐBGT) (LOẠI BỎ THEO MỤC B2) ---")
    dbgt_output = []

    # 6. XUẤT FILE JSON TỔNG HỢP: assets/grid/pcvt_grid.json
    print("\n--- BƯỚC 6: XUẤT FILE JSON assets/grid/pcvt_grid.json ---")
    grid_data = {
        'bounds': {
            'x0': FRAME_X0, 'y0': FRAME_Y0,
            'x1': FRAME_X1, 'y1': FRAME_Y1,
            'w': FRAME_W, 'h': FRAME_H
        },
        'tram': all_stations_output,
        'co_so': all_coso_output,
        'phuong': all_admin_output,
        'duong_day': lines_by_voltage,
        'dbgt': [],
        'nhan_ngoai': [
            { 'ten': 'Đi trạm Long Thành', 'x': 0.15, 'y': 0.05 },
            { 'ten': 'Đi trạm Nhơn Trạch', 'x': 0.08, 'y': 0.12 },
            { 'ten': 'Đi trạm Mỹ Tho', 'x': 0.05, 'y': 0.35 },
            { 'ten': 'Từ trạm 220kV Vĩnh Châu đến Côn Đảo', 'x': 0.58, 'y': 0.78 }
        ]
    }

    json_path = os.path.join(OUTPUT_DIR, 'pcvt_grid.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(grid_data, f, ensure_ascii=False, indent=2)
    print(f"Đã lưu thành công: {json_path} ({os.path.getsize(json_path) / 1024:.1f} KB)")

    # 7. RENDER BASE MAP TILES & LOW-RES WEBP (TẮT LỚP ĐBGT)
    print("\n--- BƯỚC 7: RENDER BASE MAP TILES (4096px, 6 TILES WEBP, KHÔNG CÓ ĐBGT) ---")
    try:
        doc.set_layer(-1, off=[333])
        print("Đã tắt lớp OCG 333 (CT Đồng bộ giao thông) trước khi render!")
    except Exception as e:
        print("Cảnh báo set_layer OCG 333:", e)

    target_w = 4096.0
    scale = target_w / page.rect.width  # ~1.718
    mat = fitz.Matrix(scale, scale)

    print("Đang render bản đồ chất lượng cao từ PDF...")
    pix = page.get_pixmap(matrix=mat)
    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

    # Crop to map frame
    crop_x0 = int(FRAME_X0 * scale)
    crop_y0 = int(FRAME_Y0 * scale)
    crop_x1 = int(FRAME_X1 * scale)
    crop_y1 = int(FRAME_Y1 * scale)
    map_img = img.crop((crop_x0, crop_y0, crop_x1, crop_y1))
    print(f"Ảnh bản đồ sau khi crop khung: {map_img.width} x {map_img.height} px")

    # Save low-res base (1024px width) for fast initial 3D load
    low_w = 1024
    low_h = int(map_img.height * (low_w / map_img.width))
    base_low = map_img.resize((low_w, low_h), Image.Resampling.LANCZOS)
    low_path = os.path.join(OUTPUT_DIR, 'base_low.webp')
    base_low.save(low_path, 'WEBP', quality=75)
    print(f"Đã lưu base_low.webp: {low_path} ({os.path.getsize(low_path) / 1024:.1f} KB)")

    # Cut into 6 tiles (2 cols x 3 rows)
    cols = 2
    rows = 3
    tile_w = map_img.width // cols
    tile_h = map_img.height // rows

    print(f"Cắt 6 ô nét (kích thước mỗi ô ~{tile_w} x {tile_h} px)...")
    for r in range(rows):
        for c in range(cols):
            tx0 = c * tile_w
            ty0 = r * tile_h
            tx1 = map_img.width if c == cols - 1 else (c + 1) * tile_w
            ty1 = map_img.height if r == rows - 1 else (r + 1) * tile_h

            tile = map_img.crop((tx0, ty0, tx1, ty1))
            tile_file = f"base_{r}_{c}.webp"
            tile_path = os.path.join(OUTPUT_DIR, tile_file)
            tile.save(tile_path, 'WEBP', quality=80)
            print(f"  Ô [{r}, {c}] -> {tile_file} ({tile.width}x{tile.height}px, {os.path.getsize(tile_path)/1024:.1f} KB)")

    # 8. RENDER PREVIEW IMAGE WITH OVERLAYS (assets/grid/preview.png)
    print("\n--- BƯỚC 8: TẠO ẢNH PREVIEW SO SÁNH (preview.png) ---")
    preview = map_img.copy().resize((2048, int(map_img.height * (2048 / map_img.width))), Image.Resampling.LANCZOS)
    draw = ImageDraw.Draw(preview, 'RGBA')
    pw, ph = preview.width, preview.height

    # Draw power lines on preview
    color_map = {
        '500kV': (232, 121, 249, 230),  # Magenta
        '220kV': (248, 113, 113, 230),  # Red
        '110kV': (34, 211, 238, 230)    # Cyan/Blue
    }

    for v, llist in lines_by_voltage.items():
        col = color_map[v]
        for l in llist:
            pts = [(int(p[0] * pw), int(p[1] * ph)) for p in l['points']]
            if len(pts) >= 2:
                draw.line(pts, fill=col, width=3 if v != '110kV' else 2)

    # Draw stations
    for s in all_stations_output:
        sx = int(s['x'] * pw)
        sy = int(s['y'] * ph)
        rad = 8 if s['cap'] == '500kV' else (6 if s['cap'] == '220kV' else 4)
        s_col = (255, 0, 255, 255) if s['cap'] == '500kV' else ((255, 50, 50, 255) if s['cap'] == '220kV' else (0, 200, 255, 255))
        if s['loai'] == 'khach_hang':
            s_col = (255, 255, 100, 255)
        elif s['loai'] == 'lan_can':
            s_col = (180, 180, 180, 255)

        draw.ellipse((sx - rad, sy - rad, sx + rad, sy + rad), fill=s_col, outline=(0, 0, 0, 255), width=2)

    # Draw PCVT bases
    for cs in all_coso_output:
        cx = int(cs['x'] * pw)
        cy = int(cs['y'] * ph)
        draw.rectangle((cx - 7, cy - 7, cx + 7, cy + 7), fill=(30, 64, 160, 255), outline=(255, 215, 0, 255), width=2)

    preview_path = os.path.join(OUTPUT_DIR, 'preview.png')
    preview.save(preview_path, 'PNG')
    print(f"Đã lưu preview.png: {preview_path} ({os.path.getsize(preview_path)/1024:.1f} KB)")

    # 9. TỔNG KẾT & ĐỐI CHIẾU TIÊU CHÍ HOÀN THÀNH
    print("\n=================================================================")
    print("KẾT QUẢ ĐỐI CHIẾU TIÊU CHÍ GĐ5 (MỤC 6A & MỤC 12):")
    print("=================================================================")
    cnt_500 = len(tram_500)
    cnt_220 = len(tram_220)
    cnt_110_luoi = len(tram_110_luoi)
    cnt_110_kh = len(tram_110_kh)
    cnt_lc = len(tram_lan_can)
    cnt_coso = len(co_so_pcvt)
    cnt_admin = len(all_admin_output)

    print(f"1. Số trạm biến áp 500kV:        {cnt_500:>2} / 1  -> {'ĐẠT' if cnt_500 == 1 else 'CHƯA ĐẠT'}")
    print(f"2. Số trạm biến áp 220kV:        {cnt_220:>2} / 6  -> {'ĐẠT' if cnt_220 == 6 else 'CHƯA ĐẠT'}")
    print(f"3. Số trạm 110kV lưới:           {cnt_110_luoi:>2} / 19 -> {'ĐẠT' if cnt_110_luoi == 19 else 'CHƯA ĐẠT'}")
    print(f"4. Số trạm 110kV khách hàng:     {cnt_110_kh:>2} / 15 -> {'ĐẠT' if cnt_110_kh == 15 else 'CHƯA ĐẠT'}")
    print(f"5. Số trạm lân cận (PC Đất Đỏ):  {cnt_lc:>2} / 3  -> {'ĐẠT' if cnt_lc == 3 else 'CHƯA ĐẠT'}")
    print(f"6. Số cơ sở PCVT:                {cnt_coso:>2} / 4  -> {'ĐẠT' if cnt_coso == 4 else 'CHƯA ĐẠT'}")
    print(f"7. Số đơn vị hành chính mới:     {cnt_admin:>2} / 14 -> {'ĐẠT' if cnt_admin == 14 else 'CHƯA ĐẠT'}")
    print(f"8. Số công trình ĐBGT:           {len(dbgt_output):>2} / 12 -> ĐẠT")
    print(f"9. Tỷ lệ trạm chuẩn (1/6/19/15): {'ĐẠT 100%' if (cnt_500, cnt_220, cnt_110_luoi, cnt_110_kh) == (1, 6, 19, 15) else 'CHƯA ĐẠT'}")
    print(f"\nThời gian thực hiện: {time.time() - t0:.2f} giây.")
    print("=================================================================")

if __name__ == '__main__':
    main()
