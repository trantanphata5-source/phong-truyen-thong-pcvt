#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract_grid_map.py
Trích xuất toàn bộ dữ liệu vector và ảnh nền từ bản vẽ địa dư PCVT:
Source: source/dia-du-pcvt.pdf
Output:
  - assets/grid/pcvt_grid.json (bao gồm ranh_gioi_moi)
  - assets/grid/base_{r}_{c}.webp (6 tiles: 2 col x 3 row)
  - assets/grid/base_low.webp (2048px)
  - assets/grid/preview.png
"""

import sys
import os
import re
import math
import json
import time
from collections import Counter, defaultdict
import fitz  # PyMuPDF
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

PDF_PATH = 'source/dia-du-pcvt.pdf'
OUTPUT_DIR = 'assets/grid'
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Khung cắt sát nội dung theo Mục 0b (đất liền + ô Côn Đảo góc dưới phải + lề 3%)
FRAME_X0 = 360.0
FRAME_Y0 = 480.0
FRAME_X1 = 1860.0
FRAME_Y1 = 3060.0
FRAME_W = FRAME_X1 - FRAME_X0  # 1500.0 pt
FRAME_H = FRAME_Y1 - FRAME_Y0  # 2580.0 pt

# Bảng chú thích trong PDF (để lọc bỏ và inpaint trắng)
LEGEND_X0 = 10.1
LEGEND_Y0 = 2840.7
LEGEND_X1 = 487.0
LEGEND_Y1 = 3242.7

def is_in_legend(x, y):
    return LEGEND_X0 <= x <= LEGEND_X1 and LEGEND_Y0 <= y <= LEGEND_Y1

def norm_x(x):
    return max(0.0, min(1.0, (x - FRAME_X0) / FRAME_W))

def norm_y(y):
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

def douglas_peucker(points, tolerance=1.0):
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
    W, H = page.rect.width, page.rect.height
    print(f"File PDF: {PDF_PATH} (Trang: 1, Kích thước: {W} x {H} pt)")

    # 1. TRÍCH XUẤT RANH GIỚI PHƯỜNG/XÃ MỚI (MỤC B.1)
    print("\n--- BƯỚC 1: TRÍCH XUẤT RANH GIỚI PHƯỜNG/XÃ MỚI (VECTOR) ---")
    drawings = page.get_drawings()
    print(f"Tổng số drawings: {len(drawings)}")

    boundary_segments = []
    count_thick = 0
    count_thin = 0

    legend_x_max = 0.18 * W
    legend_y_min = 0.86 * H

    for d in drawings:
        color = d.get('color')
        fill = d.get('fill')
        w_val = d.get('width')
        width = round(w_val if w_val is not None else 0.0, 2)

        # Nét đen, không tô màu nền
        if not color or any(c > 0.05 for c in color) or fill:
            continue

        is_thick = width in [0.72, 0.48, 0.36]
        is_thin = (width == 0.0)
        if not (is_thick or is_thin):
            continue

        for it in d.get('items', []):
            cmd = it[0]
            if cmd == 're':
                # Bỏ qua khung hình chữ nhật
                continue
            elif cmd == 'l':
                p1, p2 = it[1], it[2]
                length = math.hypot(p2.x - p1.x, p2.y - p1.y)
                # Bỏ đoạn ngắn hơn 3 pt (chấm ranh giới cũ)
                if length < 3.0:
                    continue

                # Bỏ ô chú thích góc dưới trái
                if p1.x < legend_x_max and p1.y > legend_y_min and p2.x < legend_x_max and p2.y > legend_y_min:
                    continue

                # Bỏ khung viền trang
                if (min(p1.x, p2.x) < 8 or max(p1.x, p2.x) > W - 8 or
                    min(p1.y, p2.y) < 8 or max(p1.y, p2.y) > H - 8):
                    continue

                if is_thick:
                    count_thick += 1
                else:
                    count_thin += 1

                boundary_segments.append(((round(p1.x, 2), round(p1.y, 2)), (round(p2.x, 2), round(p2.y, 2))))

    print(f"Đã trích xuất {len(boundary_segments)} đoạn ranh giới (Nét dày: {count_thick}, Nét mảnh: {count_thin})")

    # Nối đoạn đầu - cuối trùng nhau (sai số <= 1 pt) thành polylines
    def pt_key(p, tol=1.0):
        return (int(round(p[0] / tol)), int(round(p[1] / tol)))

    adj = defaultdict(list)
    edges = {}
    for i, (p1, p2) in enumerate(boundary_segments):
        k1 = pt_key(p1)
        k2 = pt_key(p2)
        adj[k1].append((i, p1, p2, 0))
        adj[k2].append((i, p2, p1, 1))
        edges[i] = (p1, p2)

    visited = set()
    boundary_polylines = []

    for i in range(len(boundary_segments)):
        if i in visited:
            continue
        visited.add(i)
        p1, p2 = edges[i]
        line = [p1, p2]

        # Mở rộng về phía đuôi
        while True:
            k = pt_key(line[-1])
            found = False
            for next_i, start_p, end_p, _ in adj[k]:
                if next_i not in visited:
                    if math.hypot(line[-1][0] - start_p[0], line[-1][1] - start_p[1]) <= 1.2:
                        visited.add(next_i)
                        line.append(end_p)
                        found = True
                        break
            if not found:
                break

        # Mở rộng về phía đầu
        while True:
            k = pt_key(line[0])
            found = False
            for next_i, start_p, end_p, _ in adj[k]:
                if next_i not in visited:
                    if math.hypot(line[0][0] - start_p[0], line[0][1] - start_p[1]) <= 1.2:
                        visited.add(next_i)
                        line.insert(0, end_p)
                        found = True
                        break
            if not found:
                break

        boundary_polylines.append(line)

    print(f"Đã kết nối thành {len(boundary_polylines)} polylines")

    # Rút gọn Douglas-Peucker sai số 1 pt và chuẩn hóa tọa độ [0..1]
    norm_boundary_polylines = []
    total_pts = 0
    for poly in boundary_polylines:
        simplified = douglas_peucker(poly, tolerance=1.0)
        norm_line = [[round(norm_x(p[0]), 5), round(norm_y(p[1]), 5)] for p in simplified]
        norm_boundary_polylines.append(norm_line)
        total_pts += len(norm_line)

    # Đọc bổ sung nếu có file docs/ranh_gioi_bo_sung.json
    bo_sung_path = 'docs/ranh_gioi_bo_sung.json'
    if os.path.exists(bo_sung_path):
        try:
            with open(bo_sung_path, 'r', encoding='utf-8') as f:
                bo_sung_data = json.load(f)
                if isinstance(bo_sung_data, list):
                    for poly in bo_sung_data:
                        norm_line = [[round(norm_x(p[0]), 5), round(norm_y(p[1]), 5)] for p in poly]
                        norm_boundary_polylines.append(norm_line)
                        total_pts += len(norm_line)
            print(f"Đã nạp thêm ranh giới bổ sung từ {bo_sung_path}")
        except Exception as e:
            print("Lỗi nạp ranh giới bổ sung:", e)

    print(f"Tổng số điểm ranh giới sau DP: {total_pts}")

    # 2. TRÍCH XUẤT NHÃN VĂN BẢN & ĐỊNH VỊ TRẠM
    print("\n--- BƯỚC 2: TRÍCH XUẤT VĂN BẢN & ĐỊNH VỊ TRẠM ---")
    blocks = page.get_text('blocks')
    print(f"Tổng số text blocks: {len(blocks)}")

    all_triangles = []
    for d in drawings:
        r = d.get('rect')
        if not r or r.width > 30 or r.height > 30:
            continue
        c = tuple(round(x, 2) for x in d['color']) if d.get('color') else None
        f = tuple(round(x, 2) for x in d['fill']) if d.get('fill') else None
        if len(d.get('items', [])) in (3, 4, 6, 8, 12, 14, 24):
            cx = (r.x0 + r.x1) / 2
            cy = (r.y0 + r.y1) / 2
            if not is_in_legend(cx, cy):
                all_triangles.append({'cx': cx, 'cy': cy, 'rect': r, 'color': c, 'fill': f})

    print(f"Đã tìm thấy {len(all_triangles)} ký hiệu biểu trưng trạm.")

    def find_nearest_station_pos(name_pattern, default_x, default_y, search_rad=55):
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

    # 4. TRÍCH XUẤT ĐƯỜNG DÂY (500kV, 220kV, 110kV)
    print("\n--- BƯỚC 4: TRÍCH XUẤT ĐƯỜNG DÂY (DOUGLAS-PEUCKER 1.5pt) ---")
    lines_by_voltage = {
        '500kV': [],
        '220kV': [],
        '110kV': []
    }

    for d in drawings:
        r = d.get('rect')
        if not r or is_in_legend(r.x0, r.y0):
            continue

        c = tuple(round(x, 2) for x in d['color']) if d.get('color') else None
        dashes = d.get('dashes', '')
        is_dashed = bool(dashes and dashes != '[] 0')

        v_class = None
        if c == (1.0, 0.0, 1.0):
            v_class = '500kV'
        elif c in ((1.0, 0.0, 0.0), (0.8, 0.13, 0.15)):
            v_class = '220kV'
        elif c == (0.0, 0.0, 1.0):
            v_class = '110kV'

        if not v_class:
            continue

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
                pts.extend([(p2.x, p2.y), (p3.x, p3.y), (p4.x, p4.y)])

        if len(pts) >= 2:
            simplified = douglas_peucker(pts, tolerance=1.5)
            norm_pts = [[round(norm_x(p[0]), 5), round(norm_y(p[1]), 5)] for p in simplified]
            lines_by_voltage[v_class].append({
                'quy_hoach': is_dashed,
                'points': norm_pts
            })

    for v, llist in lines_by_voltage.items():
        ht_cnt = sum(1 for l in llist if not l['quy_hoach'])
        qh_cnt = sum(1 for l in llist if l['quy_hoach'])
        print(f"Đường dây {v}: {len(llist)} đoạn (Hiện trạng: {ht_cnt}, Quy hoạch: {qh_cnt})")

    # 5. XUẤT FILE JSON TỔNG HỢP (BAO GỒM ranh_gioi_moi)
    print("\n--- BƯỚC 5: XUẤT FILE JSON assets/grid/pcvt_grid.json ---")
    grid_data = {
        'bounds': {
            'x0': FRAME_X0, 'y0': FRAME_Y0,
            'x1': FRAME_X1, 'y1': FRAME_Y1,
            'w': FRAME_W, 'h': FRAME_H
        },
        'tram': all_stations_output,
        'co_so': all_coso_output,
        'phuong': all_admin_output,
        'ranh_gioi_moi': norm_boundary_polylines,
        'duong_day': lines_by_voltage,
        'dbgt': [],
        'nhan_ngoai': [
            { 'ten': 'Đi trạm Long Thành', 'x': norm_x(430.0), 'y': norm_y(540.0) },
            { 'ten': 'Đi trạm Nhơn Trạch', 'x': norm_x(410.0), 'y': norm_y(680.0) },
            { 'ten': 'Đi trạm Mỹ Tho', 'x': norm_x(390.0), 'y': norm_y(1250.0) },
            { 'ten': 'Từ trạm 220kV Vĩnh Châu đến Côn Đảo', 'x': norm_x(1370.0), 'y': norm_y(2900.0) }
        ]
    }

    json_path = os.path.join(OUTPUT_DIR, 'pcvt_grid.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(grid_data, f, ensure_ascii=False, indent=2)
    print(f"Đã lưu thành công: {json_path} ({os.path.getsize(json_path) / 1024:.1f} KB)")

    # 6. RENDER ẢNH NỀN MỚI (ZOOM 2.5, INPAINT ĐBGT, GAMMA 0.9, 2048px)
    print("\n--- BƯỚC 6: RENDER ẢNH NỀN BẢN ĐỒ & INPAINT ĐBGT (MỤC B.2) ---")
    # Render ở zoom 2.5
    scale = 2.5
    mat = fitz.Matrix(scale, scale)
    print(f"Render PDF ở zoom {scale}...")
    pix = page.get_pixmap(matrix=mat)

    # Chuyển sang ảnh OpenCV BGR
    img_bgr = np.frombuffer(pix.samples, dtype=np.uint8).reshape((pix.height, pix.width, 3))
    img_bgr = cv2.cvtColor(img_bgr, cv2.COLOR_RGB2BGR)

    # Cắt sát theo bounds [FRAME_X0, FRAME_Y0, FRAME_X1, FRAME_Y1]
    crop_x0 = int(FRAME_X0 * scale)
    crop_y0 = int(FRAME_Y0 * scale)
    crop_x1 = int(FRAME_X1 * scale)
    crop_y1 = int(FRAME_Y1 * scale)
    cropped_bgr = img_bgr[crop_y0:crop_y1, crop_x0:crop_x1].copy()
    ch, cw = cropped_bgr.shape[:2]
    print(f"Ảnh sau khi crop sát bounds: {cw} x {ch} px")

    # Tô trắng vùng ô chú thích nếu còn lọt vào crop
    leg_x0_c = max(0, int((LEGEND_X0 - FRAME_X0) * scale))
    leg_y0_c = max(0, int((LEGEND_Y0 - FRAME_Y0) * scale))
    leg_x1_c = min(cw, int((LEGEND_X1 - FRAME_X0) * scale))
    leg_y1_c = min(ch, int((LEGEND_Y1 - FRAME_Y0) * scale))
    if leg_x1_c > leg_x0_c and leg_y1_c > leg_y0_c:
        cropped_bgr[leg_y0_c:leg_y1_c, leg_x0_c:leg_x1_c] = (255, 255, 255)
        print(f"Đã tô trắng ô chú thích: ({leg_x0_c}, {leg_y0_c}) đến ({leg_x1_c}, {leg_y1_c})")

    # Inpaint xóa nét ĐBGT:
    # Mặt nạ gần màu:
    # 1. Xanh lá: (0, 255, 0) -> BGR (0, 255, 0)
    # 2. Cam: (255, 128, 0) -> BGR (0, 128, 255)
    # 3. Vàng: (255, 255, 0) -> BGR (0, 255, 255)
    # 4. Vàng sậm: (247, 214, 48) -> BGR (48, 214, 247)
    target_bgrs = [
        np.array([0, 255, 0], dtype=np.int16),
        np.array([0, 128, 255], dtype=np.int16),
        np.array([0, 255, 255], dtype=np.int16),
        np.array([48, 214, 247], dtype=np.int16)
    ]

    mask = np.zeros((ch, cw), dtype=np.uint8)
    cropped_int = cropped_bgr.astype(np.int16)

    for target in target_bgrs:
        diff = np.abs(cropped_int - target)
        dist = np.sqrt(np.sum(diff ** 2, axis=2))
        mask[dist < 35] = 255  # ΔE < 35

    # Nở mặt nạ thêm 2px
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask_dilated = cv2.dilate(mask, kernel, iterations=1)
    dbgt_pixels = np.count_nonzero(mask_dilated)
    print(f"Số pixel ĐBGT cần inpaint: {dbgt_pixels}")

    if dbgt_pixels > 0:
        print("Đang inpaint xóa nét ĐBGT bằng OpenCV INPAINT_TELEA...")
        inpainted_bgr = cv2.inpaint(cropped_bgr, mask_dilated, inpaintRadius=3, flags=cv2.INPAINT_TELEA)
    else:
        inpainted_bgr = cropped_bgr

    # Tăng tương phản nhẹ (gamma 0.9)
    gamma = 0.9
    inv_gamma = 1.0 / gamma
    lut = np.array([((i / 255.0) ** inv_gamma) * 255 for i in range(256)]).astype("uint8")
    contrast_bgr = cv2.LUT(inpainted_bgr, lut)

    # Chuyển về PIL RGB
    final_rgb = cv2.cvtColor(contrast_bgr, cv2.COLOR_BGR2RGB)
    map_img = Image.fromarray(final_rgb)

    # Xuất base_low.webp rộng 2048 px
    low_w = 2048
    low_h = int(map_img.height * (low_w / map_img.width))
    base_low = map_img.resize((low_w, low_h), Image.Resampling.LANCZOS)
    low_path = os.path.join(OUTPUT_DIR, 'base_low.webp')
    base_low.save(low_path, 'WEBP', quality=85)
    print(f"Đã lưu base_low.webp (2048px): {low_path} ({os.path.getsize(low_path) / 1024:.1f} KB)")

    # Xuất 6 ô nét (2 cols x 3 rows) kích thước 2048 px mỗi ô
    cols = 2
    rows = 3
    tile_target_w = 2048
    tile_w = map_img.width // cols
    tile_h = map_img.height // rows

    print(f"Cắt và lưu 6 ô nét (2048px)...")
    for r in range(rows):
        for c in range(cols):
            tx0 = c * tile_w
            ty0 = r * tile_h
            tx1 = map_img.width if c == cols - 1 else (c + 1) * tile_w
            ty1 = map_img.height if r == rows - 1 else (r + 1) * tile_h

            tile = map_img.crop((tx0, ty0, tx1, ty1))
            tile_target_h = int(tile.height * (tile_target_w / tile.width))
            tile_resized = tile.resize((tile_target_w, tile_target_h), Image.Resampling.LANCZOS)
            tile_file = f"base_{r}_{c}.webp"
            tile_path = os.path.join(OUTPUT_DIR, tile_file)
            tile_resized.save(tile_path, 'WEBP', quality=85)
            print(f"  Ô [{r}, {c}] -> {tile_file} ({tile_resized.width}x{tile_resized.height}px, {os.path.getsize(tile_path)/1024:.1f} KB)")

    # 7. RENDER PREVIEW IMAGE (preview.png)
    print("\n--- BƯỚC 7: TẠO ẢNH PREVIEW CÓ LỚP RANH GIỚI MỚI ĐỎ ĐẬM (preview.png) ---")
    preview = base_low.copy()
    draw = ImageDraw.Draw(preview, 'RGBA')
    pw, ph = preview.width, preview.height

    # 1. Vẽ ranh giới mới màu đỏ đậm (Crimson / Deep Red)
    for norm_poly in norm_boundary_polylines:
        pts = [(int(p[0] * pw), int(p[1] * ph)) for p in norm_poly]
        if len(pts) >= 2:
            draw.line(pts, fill=(180, 20, 20, 255), width=3)

    # 2. Vẽ đường dây điện
    color_map = {
        '500kV': (232, 121, 249, 230),  # Magenta
        '220kV': (248, 113, 113, 230),  # Red
        '110kV': (34, 211, 238, 230)    # Cyan
    }

    for v, llist in lines_by_voltage.items():
        col = color_map[v]
        for l in llist:
            pts = [(int(p[0] * pw), int(p[1] * ph)) for p in l['points']]
            if len(pts) >= 2:
                draw.line(pts, fill=col, width=3 if v != '110kV' else 2)

    # 3. Vẽ trạm biến áp
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

    # 4. Vẽ cơ sở PCVT
    for cs in all_coso_output:
        cx = int(cs['x'] * pw)
        cy = int(cs['y'] * ph)
        draw.rectangle((cx - 7, cy - 7, cx + 7, cy + 7), fill=(30, 64, 160, 255), outline=(255, 215, 0, 255), width=2)

    # 5. Đánh dấu tên 14 phường
    for adm in all_admin_output:
        ax = int(adm['x'] * pw)
        ay = int(adm['y'] * ph)
        draw.ellipse((ax - 3, ay - 3, ax + 3, ay + 3), fill=(30, 64, 160, 255))

    preview_path = os.path.join(OUTPUT_DIR, 'preview.png')
    preview.save(preview_path, 'PNG')
    print(f"Đã lưu preview.png: {preview_path} ({os.path.getsize(preview_path)/1024:.1f} KB)")

    # 8. TỔNG KẾT
    print("\n=================================================================")
    print("HOÀN TẤT TRÍCH XUẤT BẢN ĐỒ ĐỊA DƯ PCVT:")
    print(f"- Ranh giới mới: {len(norm_boundary_polylines)} polylines ({total_pts} điểm)")
    print(f"- Trạm TBA: 500kV ({len(tram_500)}), 220kV ({len(tram_220)}), 110kV lưới ({len(tram_110_luoi)}), KH ({len(tram_110_kh)}), lân cận ({len(tram_lan_can)})")
    print(f"- Cơ sở PCVT: {len(co_so_pcvt)}")
    print(f"- Đơn vị hành chính: {len(all_admin_output)}")
    print(f"- Thời gian thực hiện: {time.time() - t0:.2f}s")
    print("=================================================================")

if __name__ == '__main__':
    main()
