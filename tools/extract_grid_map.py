#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
run_new_grid_extraction.py
Trích xuất toàn bộ dữ liệu vector và ảnh nền từ bản vẽ địa dư PCVT theo GĐ5-fix3:
- Frame contain đủ 14 đơn vị hành chính + 3% lề (X: 250..1910, Y: 430..2530)
- Ô Côn Đảo thu nhỏ 25% bề rộng mặt bàn, đặt ở góc biển (đông nam)
- Đọc và gộp docs/ranh_gioi_bo_sung.json (4 phường TP Vũng Tàu cũ) vào ranh_gioi_moi
- Xuất:
  - assets/grid/pcvt_grid.json
  - assets/grid/base_low.webp (2048px)
  - assets/grid/base_{r}_{c}.webp (6 tiles)
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

# Khung cắt sát nội dung theo Mục B1 (đất liền chứa trọn 14 ĐVHC + lề 3%)
FRAME_X0 = 250.0
FRAME_Y0 = 430.0
FRAME_X1 = 1910.0
FRAME_Y1 = 2530.0
FRAME_W = FRAME_X1 - FRAME_X0  # 1660.0 pt
FRAME_H = FRAME_Y1 - FRAME_Y0  # 2100.0 pt

# Ô Côn Đảo trong bản vẽ gốc
CD_SRC_X0 = 1269.0
CD_SRC_Y0 = 2465.2
CD_SRC_X1 = 1811.3
CD_SRC_Y1 = 2788.0
CD_SRC_W = CD_SRC_X1 - CD_SRC_X0  # 542.3 pt
CD_SRC_H = CD_SRC_Y1 - CD_SRC_Y0  # 322.8 pt

# Côn Đảo thu nhỏ còn 25% bề rộng mặt bàn, đặt ở góc biển xa đất liền (Đông Nam)
CD_DEST_W = FRAME_W * 0.25  # 415.0 pt
scale_cd = CD_DEST_W / CD_SRC_W  # 0.76526
CD_DEST_H = CD_SRC_H * scale_cd  # 247.0 pt

CD_DEST_X0 = FRAME_X1 - CD_DEST_W - 35.0  # 1460.0 pt
CD_DEST_Y0 = FRAME_Y1 - CD_DEST_H - 35.0  # 2248.0 pt
CD_DEST_X1 = CD_DEST_X0 + CD_DEST_W
CD_DEST_Y1 = CD_DEST_Y0 + CD_DEST_H

# Bảng chú thích trong PDF (để lọc bỏ và inpaint trắng)
LEGEND_X0 = 10.1
LEGEND_Y0 = 2840.7
LEGEND_X1 = 487.0
LEGEND_Y1 = 3242.7

def is_in_legend(x, y):
    return LEGEND_X0 <= x <= LEGEND_X1 and LEGEND_Y0 <= y <= LEGEND_Y1

def is_in_cd_box(x, y):
    return CD_SRC_X0 <= x <= CD_SRC_X1 and CD_SRC_Y0 <= y <= CD_SRC_Y1

def transform_pt(x, y):
    """Ánh xạ tọa độ từ ô Côn Đảo cũ sang ô Côn Đảo thu nhỏ mới ở góc biển."""
    if is_in_cd_box(x, y):
        tx = CD_DEST_X0 + (x - CD_SRC_X0) * scale_cd
        ty = CD_DEST_Y0 + (y - CD_SRC_Y0) * scale_cd
        return tx, ty
    return x, y

def norm_x(x, y=None):
    if y is not None:
        tx, _ = transform_pt(x, y)
        return max(0.0, min(1.0, (tx - FRAME_X0) / FRAME_W))
    return max(0.0, min(1.0, (x - FRAME_X0) / FRAME_W))

def norm_y(y, x=None):
    if x is not None:
        _, ty = transform_pt(x, y)
        return max(0.0, min(1.0, (ty - FRAME_Y0) / FRAME_H))
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
    print("PCVT GRID MAP EXTRACTION - BẮT ĐẦU TRÍCH XUẤT BẢN ĐỒ ĐỊA DƯ PCVT (GĐ5-fix3)")
    print(f"Khung bao contain: X=[{FRAME_X0}, {FRAME_X1}], Y=[{FRAME_Y0}, {FRAME_Y1}] ({FRAME_W} x {FRAME_H} pt)")
    print(f"Ô Côn Đảo đích (25% W): X=[{CD_DEST_X0}, {CD_DEST_X1}], Y=[{CD_DEST_Y0:.1f}, {CD_DEST_Y1:.1f}]")
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
                continue
            elif cmd == 'l':
                p1, p2 = it[1], it[2]
                length = math.hypot(p2.x - p1.x, p2.y - p1.y)
                if length < 3.0:
                    continue

                if p1.x < legend_x_max and p1.y > legend_y_min and p2.x < legend_x_max and p2.y > legend_y_min:
                    continue

                if (min(p1.x, p2.x) < 8 or max(p1.x, p2.x) > W - 8 or
                    min(p1.y, p2.y) < 8 or max(p1.y, p2.y) > H - 8):
                    continue

                if is_thick:
                    count_thick += 1
                else:
                    count_thin += 1

                boundary_segments.append(((round(p1.x, 2), round(p1.y, 2)), (round(p2.x, 2), round(p2.y, 2))))

    print(f"Đã trích xuất {len(boundary_segments)} đoạn ranh giới (Nét dày: {count_thick}, Nét mảnh: {count_thin})")

    # Ghép nối các đoạn thẳng thành polyline
    seg_map = defaultdict(list)
    for i, (p1, p2) in enumerate(boundary_segments):
        seg_map[p1].append((p2, i))
        seg_map[p2].append((p1, i))

    visited = set()
    boundary_polylines = []

    for idx, (start_p1, start_p2) in enumerate(boundary_segments):
        if idx in visited:
            continue

        line = [start_p1, start_p2]
        visited.add(idx)

        # Mở rộng về phía đuôi
        while True:
            curr = line[-1]
            next_found = False
            for nxt, s_idx in seg_map[curr]:
                if s_idx not in visited:
                    visited.add(s_idx)
                    line.append(nxt)
                    next_found = True
                    break
            if not next_found:
                break

        # Mở rộng về phía đầu
        while True:
            curr = line[0]
            next_found = False
            for nxt, s_idx in seg_map[curr]:
                if s_idx not in visited:
                    visited.add(s_idx)
                    line.insert(0, nxt)
                    next_found = True
                    break
            if not next_found:
                break

        boundary_polylines.append(line)

    print(f"Đã kết nối thành {len(boundary_polylines)} polylines")

    # Rút gọn Douglas-Peucker và chuẩn hóa tọa độ [0..1]
    norm_boundary_polylines = []
    total_pts = 0
    for poly in boundary_polylines:
        # Ánh xạ Côn Đảo nếu có
        t_poly = [transform_pt(p[0], p[1]) for p in poly]
        simplified = douglas_peucker(t_poly, tolerance=1.0)
        norm_line = [[round(norm_x(p[0]), 5), round(norm_y(p[1]), 5)] for p in simplified]
        norm_boundary_polylines.append(norm_line)
        total_pts += len(norm_line)

    # Đọc bổ sung docs/ranh_gioi_bo_sung.json (4 phường TP Vũng Tàu cũ) theo Mục B2
    bo_sung_path = 'docs/ranh_gioi_bo_sung.json'
    if os.path.exists(bo_sung_path):
        try:
            with open(bo_sung_path, 'r', encoding='utf-8') as f:
                bo_sung_data = json.load(f)
                phuong_dict = bo_sung_data.get('phuong', {})
                for name, poly in phuong_dict.items():
                    if poly and len(poly) >= 2:
                        norm_line = []
                        for p in poly:
                            # Tọa độ trong ranh_gioi_bo_sung.json đã chuẩn hóa theo bounds cũ (360, 480, 1500, 2580)
                            pt_x = 360.0 + p[0] * 1500.0
                            pt_y = 480.0 + p[1] * 2580.0
                            nx = round(norm_x(pt_x, pt_y), 5)
                            ny = round(norm_y(pt_y, pt_x), 5)
                            norm_line.append([nx, ny])
                        if norm_line[0] != norm_line[-1]:
                            norm_line.append(norm_line[0])
                        norm_boundary_polylines.append(norm_line)
                        total_pts += len(norm_line)
                        print(f"  + Đã gộp ranh giới bổ sung: {name} ({len(norm_line)} điểm)")
            print(f"Đã nạp thành công 4 phường từ {bo_sung_path}")
        except Exception as e:
            print("Lỗi nạp ranh giới bổ sung:", e)

    print(f"Tổng số điểm ranh giới sau gộp: {total_pts}")

    # 2. TRÍCH XUẤT NHÃN VĂN BẢN & ĐỊNH VỊ TRẠM
    print("\n--- BƯỚC 2: TRÍCH XUẤT VĂN BẢN & ĐỊNH VỊ TRẠM ---")
    blocks = page.get_text('blocks')
    print(f"Tổng số text blocks: {len(blocks)}")

    def find_nearest_station_pos(name_pattern, default_x, default_y):
        for b in blocks:
            txt = b[4].strip().replace('\n', ' ')
            if re.search(name_pattern, txt, re.IGNORECASE):
                bx = (b[0] + b[2]) / 2
                by = (b[1] + b[3]) / 2
                if not is_in_legend(bx, by):
                    return (bx, by)
        return (default_x, default_y)

    tram_500 = [
        { 'id': 'tba_500_kcn_phu_my', 'ten': 'KCN Phú Mỹ', 'cap': '500kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'P. Tân Phước', 'pattern': r'Trạm 500kV.*Phú Mỹ', 'def_pos': (474.0, 900.7) }
    ]

    tram_220 = [
        { 'id': 'tba_220_phu_my', 'ten': 'Phú Mỹ', 'cap': '220kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'P. Phú Mỹ', 'pattern': r'220kV Phú Mỹ\b', 'def_pos': (504.1, 918.4) },
        { 'id': 'tba_220_kcn_phu_my_3', 'ten': 'KCN Phú Mỹ 3', 'cap': '220kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'P. Phước Hòa', 'pattern': r'220kV.*Phú Mỹ 3', 'def_pos': (831.4, 1541.0) },
        { 'id': 'tba_220_kcn_ba_ria', 'ten': 'KCN Bà Rịa', 'cap': '220kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'P. Bà Rịa', 'pattern': r'220kV.*Bà Rịa\b', 'def_pos': (1262.9, 1573.1) },
        { 'id': 'tba_220_vung_tau', 'ten': 'Vũng Tàu', 'cap': '220kV', 'loai': 'luoi', 'trang_thai': 'hien_trang', 'phuong': 'P. Thắng Nhất', 'pattern': r'220kV.*Vũng Tàu', 'def_pos': (1051.7, 2095.6) },
        { 'id': 'tba_220_long_son', 'ten': 'Long Sơn', 'cap': '220kV', 'loai': 'luoi', 'trang_thai': 'quy_hoach', 'phuong': 'Xã Long Sơn', 'pattern': r'220kV Long Sơn', 'def_pos': (887.3, 1729.8) },
        { 'id': 'tba_220_phuoc_thang', 'ten': 'Phước Thắng', 'cap': '220kV', 'loai': 'luoi', 'trang_thai': 'quy_hoach', 'phuong': 'P. 12', 'pattern': r'220kV Phước Thắng', 'def_pos': (1282.7, 1941.5) }
    ]

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

    tram_lan_can = [
        { 'id': 'tba_lc_ngai_giao', 'ten': 'Ngãi Giao (PC Đất Đỏ)', 'cap': '110kV', 'loai': 'lan_can', 'trang_thai': 'hien_trang', 'phuong': 'H. Châu Đức', 'pattern': r'Ngãi Giao', 'def_pos': (1539.6, 563.6) },
        { 'id': 'tba_lc_long_dat', 'ten': 'Long Đất (PC Đất Đỏ)', 'cap': '110kV', 'loai': 'lan_can', 'trang_thai': 'hien_trang', 'phuong': 'H. Long Đất', 'pattern': r'Long Đất', 'def_pos': (1611.1, 1518.9) },
        { 'id': 'tba_lc_an_ngai', 'ten': 'An Ngãi (PC Đất Đỏ)', 'cap': '110kV', 'loai': 'lan_can', 'trang_thai': 'hien_trang', 'phuong': 'H. Long Đất', 'pattern': r'An Ngãi', 'def_pos': (1570.4, 1758.1) }
    ]

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
            tx, ty = transform_pt(x_pt, y_pt)
            s_out = {
                'id': s['id'],
                'ten': s['ten'],
                'cap': s['cap'],
                'loai': s['loai'],
                'trang_thai': s['trang_thai'],
                'phuong': s['phuong'],
                'pt': [round(tx, 1), round(ty, 1)],
                'x': round(norm_x(tx), 5),
                'y': round(norm_y(ty), 5)
            }
            all_stations_output.append(s_out)

    all_coso_output = []
    for cs in co_so_pcvt:
        x_pt, y_pt = find_nearest_station_pos(cs['pattern'], cs['def_pos'][0], cs['def_pos'][1])
        tx, ty = transform_pt(x_pt, y_pt)
        cs_out = {
            'id': cs['id'],
            'ten': cs['ten'],
            'loai': cs['loai'],
            'phuong': cs['phuong'],
            'dia_chi': cs['dia_chi'],
            'pt': [round(tx, 1), round(ty, 1)],
            'x': round(norm_x(tx), 5),
            'y': round(norm_y(ty), 5)
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
        tx, ty = transform_pt(ax, ay)
        all_admin_output.append({
            'id': adm['id'],
            'ten': adm['ten'],
            'pt': [round(tx, 1), round(ty, 1)],
            'x': round(norm_x(tx), 5),
            'y': round(norm_y(ty), 5)
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
        elif c in ((0.0, 0.8, 1.0), (0.0, 1.0, 1.0), (0.13, 0.59, 0.95)):
            v_class = '110kV'

        if not v_class:
            continue

        pts = []
        for it in d.get('items', []):
            if it[0] == 'l':
                p1, p2 = it[1], it[2]
                tx1, ty1 = transform_pt(p1.x, p1.y)
                tx2, ty2 = transform_pt(p2.x, p2.y)
                if not pts:
                    pts.append((tx1, ty1))
                pts.append((tx2, ty2))

        if len(pts) >= 2:
            simplified = douglas_peucker(pts, tolerance=1.5)
            norm_pts = [[round(norm_x(p[0]), 5), round(norm_y(p[1]), 5)] for p in simplified]
            lines_by_voltage[v_class].append({
                'quy_hoach': is_dashed,
                'points': norm_pts
            })

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
            { 'ten': 'Từ trạm 220kV Vĩnh Châu đến Côn Đảo', 'x': norm_x(CD_DEST_X0 + 30.0), 'y': norm_y(CD_DEST_Y0 + CD_DEST_H + 15.0) }
        ]
    }

    json_path = os.path.join(OUTPUT_DIR, 'pcvt_grid.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(grid_data, f, ensure_ascii=False, indent=2)
    print(f"Đã lưu thành công: {json_path} ({os.path.getsize(json_path) / 1024:.1f} KB)")

    # 6. RENDER ẢNH NỀN MỚI (ZOOM 2.5, INPAINT ĐBGT, GAMMA 0.9, 2048px)
    print("\n--- BƯỚC 6: RENDER ẢNH NỀN BẢN ĐỒ & INPAINT ĐBGT ---")
    scale = 2.5
    mat = fitz.Matrix(scale, scale)
    print(f"Render PDF ở zoom {scale}...")
    pix = page.get_pixmap(matrix=mat)

    img_bgr = np.frombuffer(pix.samples, dtype=np.uint8).reshape((pix.height, pix.width, 3))
    img_bgr = cv2.cvtColor(img_bgr, cv2.COLOR_RGB2BGR)

    # Cắt sát theo bounds đất liền [FRAME_X0, FRAME_Y0, FRAME_X1, FRAME_Y1]
    crop_x0 = int(FRAME_X0 * scale)
    crop_y0 = int(FRAME_Y0 * scale)
    crop_x1 = int(FRAME_X1 * scale)
    crop_y1 = int(FRAME_Y1 * scale)
    mainland_crop = img_bgr[crop_y0:crop_y1, crop_x0:crop_x1].copy()
    ch, cw = mainland_crop.shape[:2]
    print(f"Ảnh đất liền sau khi crop sát bounds: {cw} x {ch} px")

    # Cắt ô Côn Đảo từ PDF gốc
    cx0 = int(CD_SRC_X0 * scale)
    cy0 = int(CD_SRC_Y0 * scale)
    cx1 = int(CD_SRC_X1 * scale)
    cy1 = int(CD_SRC_Y1 * scale)
    cd_crop = img_bgr[cy0:cy1, cx0:cx1].copy()

    # Thu nhỏ Côn Đảo còn 25% bề rộng mặt bàn
    cd_dw = int(CD_DEST_W * scale)
    cd_dh = int(CD_DEST_H * scale)
    cd_resized = cv2.resize(cd_crop, (cd_dw, cd_dh), interpolation=cv2.INTER_LANCZOS4)

    # Đặt vào góc biển Đông Nam
    dest_x = int((CD_DEST_X0 - FRAME_X0) * scale)
    dest_y = int((CD_DEST_Y0 - FRAME_Y0) * scale)

    # Nền trắng nhẹ và dán ô Côn Đảo
    cv2.rectangle(mainland_crop, (dest_x - 3, dest_y - 3), (dest_x + cd_dw + 3, dest_y + cd_dh + 3), (255, 255, 255), -1)
    mainland_crop[dest_y:dest_y+cd_dh, dest_x:dest_x+cd_dw] = cd_resized

    # Khung viền mảnh màu xanh EVN (#1E40A0 -> BGR (160, 64, 30))
    cv2.rectangle(mainland_crop, (dest_x, dest_y), (dest_x + cd_dw, dest_y + cd_dh), (160, 64, 30), 2)

    # Inpaint xóa nét ĐBGT:
    target_bgrs = [
        np.array([0, 255, 0], dtype=np.int16),
        np.array([0, 128, 255], dtype=np.int16),
        np.array([0, 255, 255], dtype=np.int16),
        np.array([48, 214, 247], dtype=np.int16)
    ]

    mask = np.zeros((ch, cw), dtype=np.uint8)
    cropped_int = mainland_crop.astype(np.int16)

    for target in target_bgrs:
        diff = np.abs(cropped_int - target)
        dist = np.sqrt(np.sum(diff ** 2, axis=2))
        mask[dist < 35] = 255

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask_dilated = cv2.dilate(mask, kernel, iterations=1)
    dbgt_pixels = np.count_nonzero(mask_dilated)
    print(f"Số pixel ĐBGT cần inpaint: {dbgt_pixels}")

    if dbgt_pixels > 0:
        inpainted_bgr = cv2.inpaint(mainland_crop, mask_dilated, inpaintRadius=3, flags=cv2.INPAINT_TELEA)
    else:
        inpainted_bgr = mainland_crop

    # Tăng tương phản nhẹ (gamma 0.9)
    gamma = 0.9
    inv_gamma = 1.0 / gamma
    lut = np.array([((i / 255.0) ** inv_gamma) * 255 for i in range(256)]).astype("uint8")
    contrast_bgr = cv2.LUT(inpainted_bgr, lut)

    # Chuyển về PIL RGB
    final_rgb = cv2.cvtColor(contrast_bgr, cv2.COLOR_BGR2RGB)
    map_img = Image.fromarray(final_rgb)

    # Vẽ chữ "Đặc khu Côn Đảo" trên ô Côn Đảo
    draw_title = ImageDraw.Draw(map_img)
    badge_x = int((CD_DEST_X0 - FRAME_X0) * scale) + 10
    badge_y = int((CD_DEST_Y0 - FRAME_Y0) * scale) + 10
    draw_title.rectangle([badge_x, badge_y, badge_x + 280, badge_y + 40], fill=(255, 255, 255, 230), outline=(30, 64, 160), width=2)
    try:
        font_cd = ImageFont.truetype('arial.ttf', 24)
    except Exception:
        font_cd = ImageFont.load_default()
    draw_title.text((badge_x + 12, badge_y + 8), "Đặc khu Côn Đảo", fill=(30, 64, 160), font=font_cd)

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

    # 7. RENDER PREVIEW IMAGE (preview.png)
    print("\n--- BƯỚC 7: TẠO ẢNH PREVIEW (preview.png) ---")
    preview = base_low.copy()
    draw = ImageDraw.Draw(preview, 'RGBA')
    pw, ph = preview.width, preview.height

    # 1. Vẽ ranh giới mới màu xanh EVN (#1E40A0)
    for norm_poly in norm_boundary_polylines:
        pts = [(int(p[0] * pw), int(p[1] * ph)) for p in norm_poly]
        if len(pts) >= 2:
            draw.line(pts, fill=(30, 64, 160, 255), width=3)

    # 2. Vẽ đường dây điện
    color_map = {
        '500kV': (232, 121, 249, 230),
        '220kV': (248, 113, 113, 230),
        '110kV': (34, 211, 238, 230)
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

    print(f"\nHOÀN TẤT TRÍCH XUẤT trong {time.time() - t0:.2f}s!")

if __name__ == '__main__':
    main()
