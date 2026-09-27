#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/build_room_data.py
========================
GĐ1 - Xử lý ảnh nguồn, sinh 3 cỡ ảnh, JSON dữ liệu, và file Excel để người duyệt.

Dùng: python tools/build_room_data.py
Chạy từ thư mục APP (3d-heritage-room).

Yêu cầu: pip install Pillow openpyxl
"""

import os
import re
import sys

# Fix Windows console encoding
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import json
import shutil
import hashlib
import unicodedata
from pathlib import Path
from collections import defaultdict

try:
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None  # cho phép ảnh lớn
except ImportError:
    sys.exit("Cần cài Pillow: pip install Pillow")

try:
    import openpyxl
    from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
except ImportError:
    sys.exit("Cần cài openpyxl: pip install openpyxl")


# ============================================================================
# 1. ĐƯỜNG DẪN
# ============================================================================
SCRIPT_DIR = Path(__file__).resolve().parent
APP = SCRIPT_DIR.parent  # 3d-heritage-room
GOC = APP.parent  # PHÒNG TRUYỀN THỐNG

# Nguồn ảnh (chỉ đọc)
SRC = {
    "anh_tu_lieu": GOC / "ẢNH TƯ LIỆU_CROPPED",
    "tranh_tang": GOC / "ẢNH TƯ LIỆU_CROPPED" / "Tranh tặng",
    "bang_khen": GOC / "BẰNG KHEN",
    "co": GOC / "CỜ ĐÃ CẮT",
    "pcvt": GOC / "ảnh PCVT 1-8 den 27-9-2026" / "PCVT",
    "dang_bo": GOC / "ảnh PCVT 1-8 den 27-9-2026" / "ĐẢNG BỘ",
    "cong_doan": GOC / "ảnh PCVT 1-8 den 27-9-2026" / "CÔNG ĐOÀN",
    "doan_tn": GOC / "ảnh PCVT 1-8 den 27-9-2026" / "ĐOÀN THANH NIÊN",
}

# Thư mục sự kiện PCVT (để tra chú thích)
EVENT_BASES = [
    GOC / "ảnh PCVT 1-8 den 27-9-2026" / "PCVT_Anh_2025-07_den_2026-03_phan1" / "PCVT_Anh_NgoiNhaEVNHCMC",
    GOC / "ảnh PCVT 1-8 den 27-9-2026" / "PCVT_Anh_2026-03_den_2026-05_phan2" / "PCVT_Anh_NgoiNhaEVNHCMC",
    GOC / "ảnh PCVT 1-8 den 27-9-2026" / "PCVT_Anh_2026-05_den_2026-09_phan3" / "PCVT_Anh_NgoiNhaEVNHCMC",
]

# Thư mục đầu ra
OUT_WALL = APP / "assets" / "wall"
OUT_THUMB = APP / "assets" / "thumbs"
OUT_FULL = APP / "assets" / "full"
OUT_JSON = APP / "assets"
OUT_DOCS = APP / "docs"

IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}


# ============================================================================
# 2. HÀM TIỆN ÍCH
# ============================================================================
def to_ascii(s: str) -> str:
    """Bỏ dấu tiếng Việt, chuyển chữ thường, thay khoảng trắng bằng gạch dưới."""
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[đĐ]", "d", s)
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    s = s.strip("_")
    return s


def list_images(folder: Path) -> list[Path]:
    """Liệt kê file ảnh trong folder (không đệ quy)."""
    if not folder.is_dir():
        return []
    return sorted(
        p for p in folder.iterdir()
        if p.is_file() and p.suffix.lower() in IMG_EXT
    )


def get_aspect_ratio(img_path: Path) -> float:
    """Trả về width/height."""
    with Image.open(img_path) as im:
        w, h = im.size
        return w / h if h > 0 else 1.0


def resize_image(src: Path, dst: Path, long_edge: int, quality: int):
    """Resize giữ tỷ lệ, cạnh dài = long_edge, lưu JPG."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as im:
        # Chuyển PNG trong suốt sang nền trắng
        if im.mode in ("RGBA", "P", "LA"):
            bg = Image.new("RGB", im.size, (255, 255, 255))
            if im.mode == "P":
                im = im.convert("RGBA")
            bg.paste(im, mask=im.split()[-1] if im.mode == "RGBA" else None)
            im = bg
        elif im.mode != "RGB":
            im = im.convert("RGB")

        w, h = im.size
        if w >= h:
            new_w = long_edge
            new_h = int(h * long_edge / w)
        else:
            new_h = long_edge
            new_w = int(w * long_edge / h)

        im_resized = im.resize((new_w, new_h), Image.LANCZOS)
        im_resized.save(str(dst), "JPEG", quality=quality, optimize=True)


# ============================================================================
# 3. TRA TÊN SỰ KIỆN PCVT
# ============================================================================
def build_event_map() -> dict[str, list[str]]:
    """Xây dict ngày -> [tên sự kiện]."""
    result = defaultdict(list)
    pat = re.compile(r"^(\d{4}-\d{2}-\d{2})_(.+)$")
    for base in EVENT_BASES:
        if not base.is_dir():
            continue
        for d in base.iterdir():
            if d.is_dir():
                m = pat.match(d.name)
                if m:
                    date = m.group(1)
                    raw_name = m.group(2)
                    result[date].append(raw_name)
    return dict(result)


def event_slug_to_vietnamese(slug: str) -> str:
    """Chuyển slug dạng CONG-BO-QUYET-DINH thành câu gốc (giữ nguyên, không tự đặt dấu)."""
    # Chỉ thay gạch ngang thành khoảng trắng, viết hoa chữ đầu
    words = slug.replace("-", " ").strip()
    return words[:1].upper() + words[1:].lower() if words else ""


# ============================================================================
# 4. PHÂN TÍCH TÊN FILE VÀ CHUẨN HÓA
# ============================================================================

# Bảng quy đổi tên đơn vị
ORG_MAP = {
    "CTN": "Chủ tịch Nước",
    "TTCP": "Thủ tướng Chính phủ",
    "BCT": "Bộ Công Thương",
    "EVN": "Tập đoàn Điện lực Việt Nam",
    "EVNSPC": "Tổng Công ty Điện lực miền Nam",
    "UBND_BRVT": "UBND tỉnh Bà Rịa – Vũng Tàu",
    "UBND_TPVT": "UBND thành phố Vũng Tàu",
    "DANGUY_BRVT": "Đảng ủy tỉnh Bà Rịa – Vũng Tàu",
    "TLDLDVN": "Tổng Liên đoàn Lao động Việt Nam",
    "CD_BCT": "Công đoàn Bộ Công Thương",
    "CD_EVN": "Công đoàn Tập đoàn Điện lực Việt Nam",
    "CD_EVNSPC": "Công đoàn Tổng Công ty Điện lực miền Nam",
    "LDLD_BRVT": "Liên đoàn Lao động tỉnh Bà Rịa – Vũng Tàu",
    "BCHQS_BRVT": "Bộ Chỉ huy Quân sự tỉnh Bà Rịa – Vũng Tàu",
    "BHXH_BRVT": "Bảo hiểm Xã hội tỉnh Bà Rịa – Vũng Tàu",
    "SO_VHTTDL_BRVT": "Sở Văn hóa, Thể thao và Du lịch tỉnh Bà Rịa – Vũng Tàu",
    "PCVT": "Công ty Điện lực Vũng Tàu",
}

# Bằng khen: "NĂM - ĐƠN VỊ - Loại (n).ext"
PAT_BK = re.compile(
    r"^(\d{4})\s*-\s*(.+?)\s*-\s*(.+?)\s*\((\d+)\)\.(png|jpg|jpeg)$",
    re.IGNORECASE
)

# Cờ: "NĂM - Đơn vị - Nội dung (n).ext"
PAT_CO = re.compile(
    r"^(\d{4})\s*-\s*(.+?)\s*-\s*(.+?)\s*\((\d+)\)\.(jpg|jpeg|png)$",
    re.IGNORECASE
)

# PCVT/ĐẢNG BỘ/CÔNG ĐOÀN/ĐOÀN TN: "PREFIX_NNN_YYYY-MM-DD.ext"
PAT_DATED = re.compile(
    r"^([A-Z-]+)_(\d{3})_(\d{4}-\d{2}-\d{2})\.(jpg|jpeg|png)$",
    re.IGNORECASE
)

# Ảnh tư liệu: "NĂM_Mô tả.ext" hoặc "Mô tả.ext"
PAT_ATL = re.compile(
    r"^(?:(\d{4})_)?(.+)\.(jpg|jpeg|png)$",
    re.IGNORECASE
)


def normalize_org_code(raw_org: str) -> str:
    """Chuẩn hóa tên đơn vị thô thành mã."""
    raw = raw_org.strip()
    # Bảng khớp thô
    mappings = {
        "Công đoàn Công ty Điện lực 2": "CD_EVNSPC",
        "Công đoàn CĐ Công ty Điện lực 2": "CD_EVNSPC",
        "CĐ Công ty Điện lực 2": "CD_EVNSPC",
        "Công đoàn Tổng Công ty Điện lực miền Nam": "CD_EVNSPC",
        "CĐ EVNSPC": "CD_EVNSPC",
        "Công đoàn EVNSPC": "CD_EVNSPC",
        "Tổng Công ty Điện lực Việt Nam": "EVN",
        "Tập đoàn Điện lực Việt Nam": "EVN",
        "EVN": "EVN",
        "Tổng Công ty Điện lực miền Nam": "EVNSPC",
        "Tổng Công ty Điện lực 2": "EVNSPC",
        "EVNSPC": "EVNSPC",
        "UBND tỉnh Bà Rịa Vũng Tàu": "UBND_BRVT",
        "UBND tỉnh BR-VT": "UBND_BRVT",
        "UBND tỉnh Bà Rịa - Vũng Tàu": "UBND_BRVT",
        "UBND_BRVT": "UBND_BRVT",
        "Đảng ủy tỉnh Bà Rịa Vũng Tàu": "DANGUY_BRVT",
        "DANGUY_BRVT": "DANGUY_BRVT",
        "LĐLĐ tỉnh Bà Rịa Vũng Tàu": "LDLD_BRVT",
        "Liên đoàn Lao động tỉnh Bà Rịa Vũng Tàu": "LDLD_BRVT",
        "LDLD_BRVT": "LDLD_BRVT",
        "Tổng Liên đoàn Lao động Việt Nam": "TLDLDVN",
        "TLDLDVN": "TLDLDVN",
        "Công đoàn Bộ Công Thương": "CD_BCT",
        "CD_BCT": "CD_BCT",
        "Bộ Công Thương": "BCT",
        "BCT": "BCT",
        "Chủ tịch Nước": "CTN",
        "CTN": "CTN",
        "Thủ tướng Chính phủ": "TTCP",
        "TTCP": "TTCP",
        "Sở Văn hóa, Thể thao và Du lịch tỉnh Bà Rịa - Vũng Tàu": "SO_VHTTDL_BRVT",
        "Sở VHTTDL tỉnh BR-VT": "SO_VHTTDL_BRVT",
        "SO_VHTTDL_BRVT": "SO_VHTTDL_BRVT",
        "PCVT": "PCVT",
        "Công ty Điện lực Vũng Tàu": "PCVT",
        "Bảo hiểm Xã hội tỉnh Bà Rịa - Vũng Tàu": "BHXH_BRVT",
        "BHXH_BRVT": "BHXH_BRVT",
        "Bộ Chỉ huy Quân sự tỉnh Bà Rịa - Vũng Tàu": "BCHQS_BRVT",
        "BCHQS_BRVT": "BCHQS_BRVT",
        "UBND thành phố Vũng Tàu": "UBND_TPVT",
        "UBND_TPVT": "UBND_TPVT",
        "Công đoàn Tập đoàn Điện lực Việt Nam": "CD_EVN",
        "CD_EVN": "CD_EVN",
    }
    for key, code in mappings.items():
        if raw.lower().strip() == key.lower().strip():
            return code
    # Fallback: to_ascii
    return to_ascii(raw).upper()


def normalize_bk_type(raw: str) -> str:
    """Chuẩn hóa loại bằng khen."""
    raw = raw.strip()
    low = raw.lower()
    if "huân chương" in low or "huan chuong" in low:
        return "Huân chương"
    if "giấy khen" in low or "giay khen" in low:
        return "Giấy khen"
    if "bằng khen" in low or "bang khen" in low:
        return "Bằng khen"
    return raw


# ============================================================================
# 5. ĐỌC VÀ PHÂN TÍCH TỪNG NGUỒN
# ============================================================================

def read_bang_khen():
    """Đọc thư mục BẰNG KHEN."""
    items = []
    for p in list_images(SRC["bang_khen"]):
        m = PAT_BK.match(p.name)
        if m:
            year = int(m.group(1))
            org_raw = m.group(2).strip()
            type_raw = m.group(3).strip()
            num = int(m.group(4))
            org_code = normalize_org_code(org_raw)
            bk_type = normalize_bk_type(type_raw)
        else:
            # Cố gắng lấy năm từ đầu tên file
            year_m = re.match(r"(\d{4})", p.name)
            year = int(year_m.group(1)) if year_m else 0
            org_code = "UNKNOWN"
            bk_type = "Bằng khen"
            num = 0

        org_name = ORG_MAP.get(org_code, org_code)
        new_name = f"bk_{year}_{to_ascii(org_code)}_{num:02d}.jpg"

        items.append({
            "source": "bang_khen",
            "khu": "khu2",
            "src_path": str(p),
            "src_name": p.name,
            "new_name": new_name,
            "year": year,
            "org_code": org_code,
            "org_name": org_name,
            "item_type": bk_type,
            "caption": f"{bk_type} năm {year}",
            "group_key": f"{year}_{org_code}_{bk_type}",
            "number": num,
        })
    return items


def read_co():
    """Đọc thư mục CỜ ĐÃ CẮT."""
    items = []
    for p in list_images(SRC["co"]):
        m = PAT_CO.match(p.name)
        if m:
            year = int(m.group(1))
            org_raw = m.group(2).strip()
            content = m.group(3).strip()
            num = int(m.group(4))
            org_code = normalize_org_code(org_raw)
        else:
            year_m = re.match(r"(\d{4})", p.name)
            year = int(year_m.group(1)) if year_m else 0
            org_code = "UNKNOWN"
            content = p.stem
            num = 0

        org_name = ORG_MAP.get(org_code, org_code)
        new_name = f"co_{year}_{to_ascii(org_code)}_{num:02d}.jpg"

        # Phân loại nội dung cờ
        content_lower = content.lower()
        if "hội thao" in content_lower or "hội thi" in content_lower:
            co_type = "Cờ Hội thao / Hội thi"
        elif "lưu niệm" in content_lower:
            co_type = "Cờ Lưu niệm"
        elif "thi đua" in content_lower:
            co_type = "Cờ Thi đua"
        else:
            co_type = "Cờ"

        items.append({
            "source": "co",
            "khu": "khu2",
            "src_path": str(p),
            "src_name": p.name,
            "new_name": new_name,
            "year": year,
            "org_code": org_code,
            "org_name": org_name,
            "item_type": co_type,
            "content": content,
            "caption": f"{year} • {co_type}",
            "group_key": f"{year}_{org_code}_{content}",
            "number": num,
        })
    return items


def read_anh_tu_lieu():
    """Đọc ảnh tư liệu (không gồm thư mục con Tranh tặng)."""
    items = []
    for idx, p in enumerate(list_images(SRC["anh_tu_lieu"]), 1):
        m = PAT_ATL.match(p.name)
        year = 0
        desc = p.stem
        if m:
            if m.group(1):
                year = int(m.group(1))
            desc = m.group(2).strip()

        new_name = f"atl_{year:04d}_{idx:03d}.jpg"
        items.append({
            "source": "anh_tu_lieu",
            "khu": "khu1",
            "src_path": str(p),
            "src_name": p.name,
            "new_name": new_name,
            "year": year,
            "org_code": "",
            "org_name": "",
            "item_type": "Ảnh tư liệu",
            "caption": desc,
            "group_key": "",
            "number": idx,
        })
    return items


def read_tranh_tang():
    """Đọc thư mục Tranh tặng."""
    items = []
    for idx, p in enumerate(list_images(SRC["tranh_tang"]), 1):
        m = PAT_ATL.match(p.name)
        year = 0
        desc = p.stem
        if m:
            if m.group(1):
                year = int(m.group(1))
            desc = m.group(2).strip()

        new_name = f"tt_{year:04d}_{idx:03d}.jpg"
        items.append({
            "source": "tranh_tang",
            "khu": "khu1",
            "src_path": str(p),
            "src_name": p.name,
            "new_name": new_name,
            "year": year,
            "org_code": "",
            "org_name": "",
            "item_type": "Tranh tặng",
            "caption": desc,
            "group_key": "",
            "number": idx,
        })
    return items


def read_dated_photos(source_key: str, khu: str, prefix: str):
    """Đọc ảnh có tên dạng PREFIX_NNN_YYYY-MM-DD."""
    items = []
    for p in list_images(SRC[source_key]):
        m = PAT_DATED.match(p.name)
        if not m:
            continue
        pfx = m.group(1)
        num = int(m.group(2))
        date = m.group(3)
        year = int(date[:4])

        new_name = f"{to_ascii(prefix)}_{num:03d}_{date}.jpg"
        items.append({
            "source": source_key,
            "khu": khu,
            "src_path": str(p),
            "src_name": p.name,
            "new_name": new_name,
            "year": year,
            "date": date,
            "org_code": "",
            "org_name": "",
            "item_type": prefix.replace("_", " ").title(),
            "caption": "",  # sẽ tra sự kiện sau
            "group_key": date,
            "number": num,
        })
    return items


# ============================================================================
# 6. QUY TẮC LƯỢC ẢNH
# ============================================================================

def apply_bk_dedup(items: list) -> list:
    """Bằng khen: gom nhóm theo năm+đơn vị+loại, giữ bản rõ nét nhất.
    Không bao giờ bỏ Huân chương (CTN) và TTCP."""
    protected = {"CTN", "TTCP"}
    groups = defaultdict(list)
    for it in items:
        groups[it["group_key"]].append(it)

    kept = []
    dropped = []
    for key, group in groups.items():
        if len(group) <= 1:
            kept.extend(group)
            continue

        # Bảo vệ Huân chương và TTCP
        prot = [it for it in group if it["org_code"] in protected]
        rest = [it for it in group if it["org_code"] not in protected]

        if prot:
            kept.extend(prot)
            # Giữ thêm 1 bản tốt nhất từ rest nếu có
            if rest:
                # Ưu tiên bỏ Giấy khen trước Bằng khen
                rest.sort(key=lambda x: (0 if x["item_type"] == "Bằng khen" else 1, x["number"]))
                kept.append(rest[0])
                dropped.extend(rest[1:])
        else:
            # Ưu tiên bỏ Giấy khen trước Bằng khen
            group.sort(key=lambda x: (0 if x["item_type"] == "Bằng khen" else 1, x["number"]))
            kept.append(group[0])
            dropped.extend(group[1:])

    return kept, dropped


def apply_co_dedup(items: list) -> list:
    """Cờ: lược theo các cặp trùng quy định."""
    # Đánh dấu các số (number) cần bỏ theo kế hoạch
    # Các cặp trùng: giữ cái đầu, bỏ cái sau
    drop_numbers = set()

    # 1996 CĐ CTĐL2 (23, 25) -> bỏ 25
    drop_numbers.add(25)
    # 1998 TCTĐLVN (58, 59) -> bỏ 59
    drop_numbers.add(59)
    # 1999 TCTĐLVN (61, 62) -> bỏ 62
    drop_numbers.add(62)
    # 2008 CĐ CTĐL2 (74, 76) -> bỏ 76
    drop_numbers.add(76)
    # 2015 UBND 2010-2015 (38, 48) -> bỏ 48
    drop_numbers.add(48)
    # 2021 CĐ EVNSPC (32, 41) -> bỏ 41
    drop_numbers.add(41)
    # 2007 Hội thao 3 cờ (1, 66, 70): giữ 1 -> bỏ 66, 70
    drop_numbers.update({66, 70})
    # 2008 Hội thao lần 4: 4 cờ, giữ 2 (Hạng Nhất đơn nữ, Hạng Nhì toàn đoàn)
    # Cần tìm ra cụ thể -> đánh dấu [CHỜ XÁC NHẬN]
    # 2009 Hội thao lần V: 4 cờ, giữ 2
    # Cần tìm ra cụ thể -> đánh dấu [CHỜ XÁC NHẬN]

    kept = []
    dropped = []
    for it in items:
        if it["number"] in drop_numbers:
            it["drop_reason"] = "Cặp trùng theo kế hoạch"
            dropped.append(it)
        else:
            kept.append(it)

    return kept, dropped


def apply_pcvt_dedup(items: list, event_map: dict) -> list:
    """PCVT: mỗi sự kiện (ngày) tối đa 4 ảnh, mỗi tháng ít nhất 1 ảnh."""
    # Gom theo ngày
    by_date = defaultdict(list)
    for it in items:
        by_date[it.get("date", "")].append(it)

    kept = []
    dropped = []
    for date, group in sorted(by_date.items()):
        if len(group) <= 4:
            kept.extend(group)
        else:
            # Giữ 4, bỏ phần còn lại
            group.sort(key=lambda x: x["number"])
            kept.extend(group[:4])
            for it in group[4:]:
                it["drop_reason"] = f"Sự kiện {date} quá 4 ảnh"
                dropped.append(it)

    # Kiểm tra mỗi tháng có ít nhất 1 ảnh
    months_covered = set()
    for it in kept:
        d = it.get("date", "")
        if d:
            months_covered.add(d[:7])

    # Danh sách tháng cần: 2025-07 -> 2026-09
    all_months = set()
    for y in range(2025, 2027):
        for m in range(1, 13):
            key = f"{y}-{m:02d}"
            if "2025-07" <= key <= "2026-09":
                all_months.add(key)

    missing_months = all_months - months_covered
    if missing_months:
        print(f"  [CẢNH BÁO] PCVT thiếu ảnh các tháng: {sorted(missing_months)}")
        # Thử lấy lại từ dropped
        for month in sorted(missing_months):
            recovered = [it for it in dropped if it.get("date", "").startswith(month)]
            if recovered:
                recovered.sort(key=lambda x: x["number"])
                it = recovered[0]
                dropped.remove(it)
                kept.append(it)
                print(f"    Đã phục hồi {it['src_name']} cho tháng {month}")

    return kept, dropped


# ============================================================================
# 7. TRA CHÚ THÍCH SỰ KIỆN
# ============================================================================

def assign_captions(items: list, event_map: dict):
    """Gán chú thích cho ảnh PCVT, Đảng bộ dựa trên ngày."""
    for it in items:
        date = it.get("date")
        if not date:
            continue
        events = event_map.get(date, [])
        if len(events) == 1:
            it["caption"] = event_slug_to_vietnamese(events[0])
        elif len(events) > 1:
            it["caption"] = "[CHỜ XÁC NHẬN]"
            it["caption_options"] = [event_slug_to_vietnamese(e) for e in events]
        # else: để trống


# ============================================================================
# 8. SINH ẢNH 3 CỠ
# ============================================================================

SIZES = {
    "wall": (1024, 80),   # cạnh dài 1024 px, JPG q80
    "thumb": (320, 70),   # 320 px, q70
    "full": (2000, 85),   # 2000 px, q85
}


def generate_images(items: list):
    """Sinh 3 cỡ ảnh cho tất cả items."""
    total = len(items)
    oversized = 0

    for i, it in enumerate(items, 1):
        src = Path(it["src_path"])
        khu = it["khu"]
        name = it["new_name"]

        for size_key, (long_edge, quality) in SIZES.items():
            if size_key == "wall":
                out_dir = OUT_WALL / khu
            elif size_key == "thumb":
                out_dir = OUT_THUMB / khu
            else:
                out_dir = OUT_FULL / khu

            dst = out_dir / name
            try:
                resize_image(src, dst, long_edge, quality)
                # Kiểm tra dung lượng wall
                if size_key == "wall" and dst.stat().st_size > 600 * 1024:
                    oversized += 1
                    # Giảm chất lượng
                    resize_image(src, dst, long_edge, max(50, quality - 15))
                    if dst.stat().st_size > 600 * 1024:
                        print(f"  [CẢNH BÁO] {name} vẫn > 600KB sau khi giảm chất lượng: {dst.stat().st_size // 1024}KB")
            except Exception as e:
                print(f"  [LỖI] Không thể xử lý {src.name}: {e}")

        if i % 50 == 0 or i == total:
            print(f"  Đã xử lý {i}/{total} ảnh...")

    return oversized


# ============================================================================
# 9. ĐO TỶ LỆ ẢNH
# ============================================================================

def measure_aspects(items: list):
    """Đo và gán tỷ lệ ảnh."""
    for it in items:
        try:
            ar = get_aspect_ratio(Path(it["src_path"]))
            it["aspect_ratio"] = round(ar, 3)
        except Exception:
            it["aspect_ratio"] = 1.0


# ============================================================================
# 10. XUẤT JSON
# ============================================================================

def export_json(all_items: list, dropped_items: list):
    """Xuất room_data.json."""
    # Chỉ lấy items được treo + items chỉ trong album
    wall_items = [it for it in all_items if it.get("treo", True)]
    album_only = [it for it in all_items if not it.get("treo", True)]

    data = {
        "total_items": len(all_items),
        "wall_count": len(wall_items),
        "album_only_count": len(album_only),
        "dropped_count": len(dropped_items),
        "items": [],
    }

    for it in all_items:
        entry = {
            "id": it["new_name"].replace(".jpg", ""),
            "source": it["source"],
            "khu": it["khu"],
            "src_name": it["src_name"],
            "new_name": it["new_name"],
            "year": it.get("year", 0),
            "date": it.get("date", ""),
            "org_code": it.get("org_code", ""),
            "org_name": it.get("org_name", ""),
            "item_type": it.get("item_type", ""),
            "caption": it.get("caption", ""),
            "aspect_ratio": it.get("aspect_ratio", 1.0),
            "treo": it.get("treo", True),
            "wall_path": f"assets/wall/{it['khu']}/{it['new_name']}",
            "thumb_path": f"assets/thumbs/{it['khu']}/{it['new_name']}",
            "full_path": f"assets/full/{it['khu']}/{it['new_name']}",
        }
        data["items"].append(entry)

    out_path = OUT_JSON / "room_data.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  Đã xuất {out_path} ({len(data['items'])} mục)")


# ============================================================================
# 11. XUẤT EXCEL
# ============================================================================

def export_excel(all_items: list, dropped_items: list):
    """Xuất docs/DANH_SACH_TREO.xlsx."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Danh sách hiện vật"

    headers = [
        "Khu", "Nguồn", "File gốc", "File mới", "Năm/Ngày", "Đơn vị",
        "Chú thích", "Loại", "Nhóm trùng", "Treo tường (Có/Không)",
        "Tường", "Thứ tự", "Tỷ lệ ảnh"
    ]

    # Style header
    header_font = Font(name="Be Vietnam Pro", bold=True, size=11, color="FFFFFF")
    header_fill = PatternFill(start_color="1E40A0", end_color="1E40A0", fill_type="solid")
    thin_border = Border(
        left=Side(style='thin'), right=Side(style='thin'),
        top=Side(style='thin'), bottom=Side(style='thin')
    )

    for col, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = thin_border

    # Data rows - items treo
    row = 2
    for it in sorted(all_items, key=lambda x: (x["khu"], x.get("year", 0), x.get("date", ""), x.get("number", 0))):
        treo = "Có" if it.get("treo", True) else "Không"
        date_str = it.get("date", "") or str(it.get("year", ""))
        values = [
            it["khu"],
            it["source"],
            it["src_name"],
            it["new_name"],
            date_str,
            it.get("org_name", ""),
            it.get("caption", ""),
            it.get("item_type", ""),
            it.get("group_key", ""),
            treo,
            "",  # Tường - người duyệt điền
            it.get("number", 0),
            it.get("aspect_ratio", 1.0),
        ]
        for col, v in enumerate(values, 1):
            cell = ws.cell(row=row, column=col, value=v)
            cell.border = thin_border
            cell.font = Font(name="Be Vietnam Pro", size=10)
        row += 1

    # Sheet 2: Đã bỏ
    ws2 = wb.create_sheet("Đã lược bỏ")
    headers2 = ["Nguồn", "File gốc", "Năm", "Đơn vị", "Loại", "Nhóm trùng", "Lý do"]
    for col, h in enumerate(headers2, 1):
        cell = ws2.cell(row=1, column=col, value=h)
        cell.font = header_font
        cell.fill = PatternFill(start_color="8B1A1A", end_color="8B1A1A", fill_type="solid")
        cell.border = thin_border

    for i, it in enumerate(dropped_items, 2):
        values = [
            it["source"], it["src_name"], it.get("year", 0),
            it.get("org_name", ""), it.get("item_type", ""),
            it.get("group_key", ""), it.get("drop_reason", "Nhóm trùng"),
        ]
        for col, v in enumerate(values, 1):
            cell = ws2.cell(row=i, column=col, value=v)
            cell.border = thin_border

    # Điều chỉnh chiều rộng cột
    for ws_sheet in [ws, ws2]:
        for col in ws_sheet.columns:
            max_len = 0
            col_letter = col[0].column_letter
            for cell in col:
                try:
                    if cell.value:
                        max_len = max(max_len, len(str(cell.value)))
                except:
                    pass
            ws_sheet.column_dimensions[col_letter].width = min(max_len + 3, 45)

    out_path = OUT_DOCS / "DANH_SACH_TREO.xlsx"
    wb.save(str(out_path))
    print(f"  Đã xuất {out_path}")


# ============================================================================
# 12. XUẤT albums_data.json
# ============================================================================

def export_albums_data(all_items: list):
    """Xuất albums_data.json theo cấu trúc 4 album."""

    def make_page(it):
        return {
            "full": f"assets/full/{it['khu']}/{it['new_name']}",
            "thumb": f"assets/thumbs/{it['khu']}/{it['new_name']}",
            "caption": it.get("caption", ""),
            "date": it.get("date", "") or str(it.get("year", "")),
        }

    # Album 1: souvenir - Ảnh lưu niệm
    atl = sorted([it for it in all_items if it["source"] == "anh_tu_lieu"],
                 key=lambda x: (x.get("year", 0), x.get("number", 0)))
    tt = sorted([it for it in all_items if it["source"] == "tranh_tang"],
                key=lambda x: (x.get("year", 0), x.get("number", 0)))

    album_souvenir = {
        "id": "souvenir",
        "cabinet": 1,
        "title": "Ảnh Lưu Niệm",
        "subtitle": "Ký ức xây dựng và phát triển",
        "cover": {"color": "#F5EBD7", "accent": "#5B3A1E"},
        "chapters": [
            {"title": "Ảnh tư liệu 1985–2009", "start": 0, "end": len(atl) - 1},
            {"title": "Tranh tặng", "start": len(atl), "end": len(atl) + len(tt) - 1},
        ],
        "pages": [make_page(it) for it in atl + tt],
    }

    # Album 2: awards_flags - Bằng khen & Cờ
    bk = sorted([it for it in all_items if it["source"] == "bang_khen"],
                key=lambda x: (x.get("year", 0), x.get("org_code", ""), x.get("number", 0)))
    co = sorted([it for it in all_items if it["source"] == "co"],
                key=lambda x: (x.get("year", 0), x.get("org_code", ""), x.get("number", 0)))

    # Chia bằng khen theo nhóm đơn vị
    bk_ctn_ttcp = [it for it in bk if it["org_code"] in {"CTN", "TTCP"}]
    bk_bct_evn = [it for it in bk if it["org_code"] in {"BCT", "EVN", "TLDLDVN"}]
    bk_evnspc = [it for it in bk if it["org_code"] in {"EVNSPC"}]
    bk_tinh = [it for it in bk if it["org_code"] in {"UBND_BRVT", "UBND_TPVT", "DANGUY_BRVT", "LDLD_BRVT", "BHXH_BRVT", "BCHQS_BRVT", "SO_VHTTDL_BRVT"}]
    bk_doan = [it for it in bk if it["org_code"] in {"CD_BCT", "CD_EVN", "CD_EVNSPC"}]
    bk_other = [it for it in bk if it not in bk_ctn_ttcp + bk_bct_evn + bk_evnspc + bk_tinh + bk_doan]

    all_bk_co = bk_ctn_ttcp + bk_bct_evn + bk_evnspc + bk_tinh + bk_doan + bk_other + co
    chapters_af = []
    idx = 0
    for label, group in [
        ("Huân chương & Nhà nước", bk_ctn_ttcp),
        ("Bộ, EVN, TLĐLĐ", bk_bct_evn),
        ("EVNSPC", bk_evnspc),
        ("Tỉnh/TP", bk_tinh),
        ("Đoàn thể", bk_doan + bk_other),
        ("Cờ thi đua & Lưu niệm", co),
    ]:
        if group:
            chapters_af.append({"title": label, "start": idx, "end": idx + len(group) - 1})
            idx += len(group)

    album_awards = {
        "id": "awards_flags",
        "cabinet": 1,
        "title": "Bằng Khen & Cờ Lưu Niệm",
        "subtitle": "Vinh quang những chặng đường",
        "cover": {"color": "#8B1A1A", "accent": "#F6D26B"},
        "chapters": chapters_af,
        "pages": [make_page(it) for it in all_bk_co],
    }

    # Album 3: pcvt
    pcvt = sorted([it for it in all_items if it["source"] == "pcvt"],
                  key=lambda x: (x.get("date", ""), x.get("number", 0)))
    # Chia theo tháng
    by_month = defaultdict(list)
    for it in pcvt:
        d = it.get("date", "")
        month = d[:7] if d else "unknown"
        by_month[month].append(it)

    chapters_pcvt = []
    pcvt_pages = []
    for month in sorted(by_month.keys()):
        start = len(pcvt_pages)
        pcvt_pages.extend(by_month[month])
        end = len(pcvt_pages) - 1
        # Format tháng
        try:
            y, m = month.split("-")
            label = f"Tháng {int(m)}/{y}"
        except:
            label = month
        chapters_pcvt.append({"title": label, "start": start, "end": end})

    album_pcvt = {
        "id": "pcvt",
        "cabinet": 2,
        "title": "Công Ty Điện Lực Vũng Tàu",
        "subtitle": "Hành trình xây dựng và phát triển",
        "cover": {"color": "#1E40A0", "accent": "#FACC15"},
        "chapters": chapters_pcvt,
        "pages": [make_page(it) for it in pcvt_pages],
    }

    # Album 4: doan_the
    db = sorted([it for it in all_items if it["source"] == "dang_bo"],
                key=lambda x: (x.get("date", ""), x.get("number", 0)))
    cd = sorted([it for it in all_items if it["source"] == "cong_doan"],
                key=lambda x: (x.get("date", ""), x.get("number", 0)))
    dtn = sorted([it for it in all_items if it["source"] == "doan_tn"],
                 key=lambda x: (x.get("date", ""), x.get("number", 0)))

    all_doan = db + cd + dtn
    chapters_dt = [
        {"title": "Đảng bộ", "start": 0, "end": len(db) - 1},
        {"title": "Công đoàn", "start": len(db), "end": len(db) + len(cd) - 1},
        {"title": "Đoàn Thanh niên", "start": len(db) + len(cd), "end": len(db) + len(cd) + len(dtn) - 1},
    ]

    album_doan = {
        "id": "doan_the",
        "cabinet": 2,
        "title": "Đảng Bộ – Công Đoàn – Đoàn TN",
        "subtitle": "Đoàn kết · Sáng tạo · Xung kích",
        "cover": {"color": "#B91C1C", "accent": "#FACC15"},
        "chapters": chapters_dt,
        "pages": [make_page(it) for it in all_doan],
    }

    albums = [album_souvenir, album_awards, album_pcvt, album_doan]
    out_path = OUT_JSON / "albums_data_new.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(albums, f, ensure_ascii=False, indent=2)
    print(f"  Đã xuất {out_path} ({sum(len(a['pages']) for a in albums)} trang)")


# ============================================================================
# MAIN
# ============================================================================

def main():
    print("=" * 70)
    print("GĐ1 – build_room_data.py")
    print("=" * 70)

    # 1. Đọc tất cả nguồn
    print("\n[1/8] Đọc dữ liệu nguồn...")

    atl = read_anh_tu_lieu()
    print(f"  Ảnh tư liệu: {len(atl)}")

    tt = read_tranh_tang()
    print(f"  Tranh tặng: {len(tt)}")

    bk = read_bang_khen()
    print(f"  Bằng khen: {len(bk)}")

    co = read_co()
    print(f"  Cờ: {len(co)}")

    pcvt = read_dated_photos("pcvt", "khu3", "pcvt")
    print(f"  PCVT: {len(pcvt)}")

    db = read_dated_photos("dang_bo", "khu4", "dang_bo")
    print(f"  Đảng bộ: {len(db)}")

    cd = read_dated_photos("cong_doan", "khu6", "cong_doan")
    print(f"  Công đoàn: {len(cd)}")

    dtn = read_dated_photos("doan_tn", "khu6", "doan_tn")
    print(f"  Đoàn TN: {len(dtn)}")

    raw_total = len(atl) + len(tt) + len(bk) + len(co) + len(pcvt) + len(db) + len(cd) + len(dtn)
    print(f"\n  TỔNG THÔ: {raw_total}")

    # 2. Tra sự kiện cho PCVT
    print("\n[2/8] Tra chú thích sự kiện...")
    event_map = build_event_map()
    print(f"  Tìm thấy {len(event_map)} ngày sự kiện")
    assign_captions(pcvt, event_map)
    assign_captions(db, event_map)
    assign_captions(cd, event_map)
    assign_captions(dtn, event_map)

    confirm_items = [it for it in pcvt + db + cd + dtn if it.get("caption") == "[CHỜ XÁC NHẬN]"]
    if confirm_items:
        print(f"  [CHỜ XÁC NHẬN] {len(confirm_items)} ảnh có nhiều sự kiện cùng ngày")

    # 3. Lược ảnh
    print("\n[3/8] Áp dụng quy tắc lược ảnh...")

    bk_kept, bk_dropped = apply_bk_dedup(bk)
    print(f"  Bằng khen: {len(bk)} → {len(bk_kept)} (bỏ {len(bk_dropped)})")

    co_kept, co_dropped = apply_co_dedup(co)
    print(f"  Cờ: {len(co)} → {len(co_kept)} (bỏ {len(co_dropped)})")

    pcvt_kept, pcvt_dropped = apply_pcvt_dedup(pcvt, event_map)
    print(f"  PCVT: {len(pcvt)} → {len(pcvt_kept)} (bỏ {len(pcvt_dropped)})")

    # Items treo tường
    wall_items = atl + tt + bk_kept + co_kept + pcvt_kept + db + cd + dtn
    # Items bằng khen/cờ/PCVT bị lược vẫn nằm trong album
    album_only = bk_dropped + co_dropped + pcvt_dropped
    for it in album_only:
        it["treo"] = False

    all_items = wall_items + album_only
    all_dropped = []  # Items bị loại hoàn toàn (không có)

    wall_count = len(wall_items)
    album_count = len(album_only)
    total = len(all_items)

    print(f"\n  === BẢNG ĐẾM ===")
    print(f"  Treo tường: {wall_count}")
    print(f"  Chỉ trong album: {album_count}")
    print(f"  TỔNG: {total}")
    print(f"  Kế hoạch: 516 / 470 / 46")

    # Đếm theo khu
    khu_counts = defaultdict(lambda: {"wall": 0, "album": 0})
    for it in wall_items:
        khu_counts[it["khu"]]["wall"] += 1
    for it in album_only:
        khu_counts[it["khu"]]["album"] += 1

    print(f"\n  Theo khu:")
    for k in sorted(khu_counts.keys()):
        c = khu_counts[k]
        print(f"    {k}: treo {c['wall']}, album {c['album']}")

    # Đếm Công đoàn chi tiết
    cd_count = len([it for it in wall_items if it["source"] == "cong_doan"])
    print(f"\n  CÔNG ĐOÀN đếm: {cd_count}")

    # 4. Đo tỷ lệ ảnh
    print("\n[4/8] Đo tỷ lệ ảnh...")
    measure_aspects(all_items)
    print(f"  Xong {len(all_items)} ảnh")

    # 5. Sinh 3 cỡ ảnh
    print("\n[5/8] Sinh ảnh 3 cỡ (wall/thumb/full)...")
    oversized = generate_images(all_items)
    if oversized:
        print(f"  [CẢNH BÁO] {oversized} file wall cần giảm chất lượng")

    # 6. Kiểm tra dung lượng
    print("\n[6/8] Kiểm tra dung lượng...")
    total_wall_size = 0
    max_file_size = 0
    max_file_name = ""
    for khu_dir in OUT_WALL.iterdir():
        if khu_dir.is_dir():
            for f in khu_dir.iterdir():
                if f.is_file():
                    sz = f.stat().st_size
                    total_wall_size += sz
                    if sz > max_file_size:
                        max_file_size = sz
                        max_file_name = f.name

    print(f"  Tổng wall: {total_wall_size / (1024*1024):.1f} MB")
    print(f"  File lớn nhất: {max_file_name} ({max_file_size / 1024:.0f} KB)")
    if max_file_size > 600 * 1024:
        print(f"  [CẢNH BÁO] Có file > 600 KB!")
    else:
        print(f"  Đạt: mọi file wall ≤ 600 KB")

    # 7. Xuất JSON
    print("\n[7/8] Xuất JSON...")
    export_json(all_items, all_dropped)
    export_albums_data(all_items)

    # 8. Xuất Excel
    print("\n[8/8] Xuất Excel...")
    export_excel(all_items, bk_dropped + co_dropped + pcvt_dropped)

    # Tổng kết
    print("\n" + "=" * 70)
    print("HOÀN THÀNH GĐ1")
    print("=" * 70)
    print(f"  Tổng: {total} | Treo: {wall_count} | Album only: {album_count}")
    print(f"  Công đoàn: {cd_count}")
    print(f"  Wall size: {total_wall_size / (1024*1024):.1f} MB")
    if max_file_size <= 600 * 1024:
        print(f"  Max file: {max_file_size / 1024:.0f} KB ≤ 600 KB ✓")
    else:
        print(f"  Max file: {max_file_size / 1024:.0f} KB > 600 KB ✗")

    # Liệt kê [CHỜ XÁC NHẬN]
    confirms = [it for it in all_items if "[CHỜ XÁC NHẬN]" in str(it.get("caption", ""))]
    if confirms:
        print(f"\n  [CHỜ XÁC NHẬN] {len(confirms)} mục cần người duyệt xác nhận chú thích")

    print("\n  Tiếp theo: Người duyệt mở docs/DANH_SACH_TREO.xlsx để kiểm tra và sửa.")


if __name__ == "__main__":
    main()
