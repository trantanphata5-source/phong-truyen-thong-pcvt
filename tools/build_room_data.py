#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/build_room_data.py
========================
GĐ3-fix2: Xử lý dữ liệu phòng truyền thống theo SUA_LOI_GD3_LAN2.md:
- So khớp ảnh sự kiện bằng perceptual hash (imagehash.phash)
- Gán tiêu đề có dấu từ docs/chu_thich_su_kien.csv
- Thiết lập vach_moc_son ('tay', 'dong') cho vách mốc son khu 3
- Chọn lọc 111 bằng khen & cờ khu 2 theo docs/khu2_chon_loc.json
- Tách 25/21 Công đoàn, 85/15 PCVT
- Sinh ảnh 3 cỡ cho moc2_01.jpg và moc2_02.jpg
- Xuất assets/room_data.json và docs/DANH_SACH_TREO.xlsx
"""

import os
import re
import sys
import csv
import json
import shutil
import hashlib
import datetime
import unicodedata
from pathlib import Path
from collections import defaultdict

# Fix Windows console encoding
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

try:
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None
except ImportError:
    sys.exit("Cần cài Pillow: pip install Pillow")

try:
    import imagehash
except ImportError:
    sys.exit("Cần cài imagehash: pip install imagehash")

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

EVENT_BASES = [
    GOC / "ảnh PCVT 1-8 den 27-9-2026" / "PCVT_Anh_2025-07_den_2026-03_phan1" / "PCVT_Anh_NgoiNhaEVNHCMC",
    GOC / "ảnh PCVT 1-8 den 27-9-2026" / "PCVT_Anh_2026-03_den_2026-05_phan2" / "PCVT_Anh_NgoiNhaEVNHCMC",
    GOC / "ảnh PCVT 1-8 den 27-9-2026" / "PCVT_Anh_2026-05_den_2026-09_phan3" / "PCVT_Anh_NgoiNhaEVNHCMC",
]

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
    try:
        with Image.open(img_path) as im:
            w, h = im.size
            return w / h if h > 0 else 1.0
    except:
        return 1.333


def resize_image(src: Path, dst: Path, long_edge: int, quality: int):
    """Resize giữ tỷ lệ, cạnh dài = long_edge, lưu JPG."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as im:
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
# 3. QUY ĐỔI TÊN ĐƠN VỊ VÀ REGEX
# ============================================================================
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

PAT_BK = re.compile(r"^(\d{4})\s*-\s*(.+?)\s*-\s*(.+?)\s*\((\d+)\)\.(png|jpg|jpeg)$", re.IGNORECASE)
PAT_CO = re.compile(r"^(\d{4})\s*-\s*(.+?)\s*-\s*(.+?)\s*\((\d+)\)\.(jpg|jpeg|png)$", re.IGNORECASE)
PAT_DATED = re.compile(r"^([A-Z-]+)_(\d{3})_(\d{4}-\d{2}-\d{2})\.(jpg|jpeg|png)$", re.IGNORECASE)
PAT_ATL = re.compile(r"^(?:(\d{4})_)?(.+)\.(jpg|jpeg|png)$", re.IGNORECASE)

def normalize_org_code(raw_org: str) -> str:
    raw = raw_org.strip()
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
    return to_ascii(raw).upper()


def normalize_bk_type(raw: str) -> str:
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
# 4. ĐỌC DỮ LIỆU CÁC NGUỒN
# ============================================================================

def read_bang_khen():
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
            year_m = re.match(r"(\d{4})", p.name)
            year = int(year_m.group(1)) if year_m else 0
            org_code = "UNKNOWN"
            bk_type = "Bằng khen"
            num = 0

        org_name = ORG_MAP.get(org_code, org_code)
        new_name = f"bk_{year}_{to_ascii(org_code)}_{num:02d}.jpg"
        item_id = new_name.replace(".jpg", "")

        items.append({
            "id": item_id,
            "source": "bang_khen",
            "khu": "khu2",
            "src_path": str(p),
            "src_name": p.name,
            "new_name": new_name,
            "year": year,
            "date": "",
            "org_code": org_code,
            "org_name": org_name,
            "item_type": bk_type,
            "caption": f"{bk_type} năm {year}",
            "group_key": f"{year}_{org_code}_{bk_type}",
            "number": num,
            "wall_path": f"assets/wall/khu2/{new_name}",
            "thumb_path": f"assets/thumbs/khu2/{new_name}",
            "full_path": f"assets/full/khu2/{new_name}",
        })
    return items


def read_co():
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
        item_id = new_name.replace(".jpg", "")

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
            "id": item_id,
            "source": "co",
            "khu": "khu2",
            "src_path": str(p),
            "src_name": p.name,
            "new_name": new_name,
            "year": year,
            "date": "",
            "org_code": org_code,
            "org_name": org_name,
            "item_type": co_type,
            "content": content,
            "caption": f"{year} • {co_type}",
            "group_key": f"{year}_{org_code}_{content}",
            "number": num,
            "wall_path": f"assets/wall/khu2/{new_name}",
            "thumb_path": f"assets/thumbs/khu2/{new_name}",
            "full_path": f"assets/full/khu2/{new_name}",
        })
    return items


def read_anh_tu_lieu():
    # Loại bỏ 2 file trùng/lỗi theo GĐ3-fix
    drop_files = {"Đội quản lý cao thế.jpg", "Đội tuần tra bảo vệ mạng lưới điện.JPG"}
    items = []
    idx = 1
    for p in list_images(SRC["anh_tu_lieu"]):
        if p.name in drop_files:
            continue
        m = PAT_ATL.match(p.name)
        year = 0
        desc = p.stem
        if m:
            if m.group(1):
                year = int(m.group(1))
            desc = m.group(2).strip()

        new_name = f"atl_{year:04d}_{idx:03d}.jpg"
        item_id = new_name.replace(".jpg", "")
        items.append({
            "id": item_id,
            "source": "anh_tu_lieu",
            "khu": "khu1",
            "src_path": str(p),
            "src_name": p.name,
            "new_name": new_name,
            "year": year,
            "date": "",
            "org_code": "",
            "org_name": "",
            "item_type": "Ảnh tư liệu",
            "caption": desc,
            "group_key": "",
            "number": idx,
            "treo": True,
            "wall_path": f"assets/wall/khu1/{new_name}",
            "thumb_path": f"assets/thumbs/khu1/{new_name}",
            "full_path": f"assets/full/khu1/{new_name}",
        })
        idx += 1
    return items


def read_tranh_tang():
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
        item_id = new_name.replace(".jpg", "")
        items.append({
            "id": item_id,
            "source": "tranh_tang",
            "khu": "khu1",
            "src_path": str(p),
            "src_name": p.name,
            "new_name": new_name,
            "year": year,
            "date": "",
            "org_code": "",
            "org_name": "",
            "item_type": "Tranh tặng",
            "caption": desc,
            "group_key": "",
            "number": idx,
            "treo": True,
            "wall_path": f"assets/wall/khu1/{new_name}",
            "thumb_path": f"assets/thumbs/khu1/{new_name}",
            "full_path": f"assets/full/khu1/{new_name}",
        })
    return items


def read_dated_photos(source_key: str, khu: str, prefix: str):
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
        item_id = new_name.replace(".jpg", "")
        items.append({
            "id": item_id,
            "source": source_key,
            "khu": khu,
            "src_path": str(p),
            "src_name": p.name,
            "new_name": new_name,
            "year": year,
            "date": date,
            "org_code": "PCVT" if source_key == "pcvt" else "",
            "org_name": "Công ty Điện lực Vũng Tàu" if source_key == "pcvt" else "",
            "item_type": prefix.replace("_", " ").title(),
            "caption": "",
            "event_folder": "",
            "group_key": date,
            "number": num,
            "treo": True,
            "wall_path": f"assets/wall/{khu}/{new_name}",
            "thumb_path": f"assets/thumbs/{khu}/{new_name}",
            "full_path": f"assets/full/{khu}/{new_name}",
        })
    return items


# ============================================================================
# 5. SO KHỚP PERCEPTUAL HASH (Section B)
# ============================================================================

def match_photos_phash(dated_items: list):
    """
    So khớp hình ảnh bằng perceptual hash (imagehash.phash) để xác định thư mục sự kiện gốc,
    sau đó tra tiêu đề có dấu từ docs/chu_thich_su_kien.csv.
    """
    csv_path = APP / 'docs' / 'chu_thich_su_kien.csv'
    csv_events = {}
    with open(csv_path, encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            csv_events[row['thu_muc_su_kien']] = row['tieu_de_co_dau'].strip()

    pat_date = re.compile(r'^(\d{4}-\d{2}-\d{2})_')
    event_dirs = {}
    for base in EVENT_BASES:
        if not base.is_dir(): continue
        for d in base.iterdir():
            if d.is_dir():
                m = pat_date.match(d.name)
                if m:
                    d_obj = datetime.date.fromisoformat(m.group(1))
                    event_dirs[d.name] = (d_obj, d)

    print(f"\n[pHash] Bắt đầu so khớp {len(dated_items)} ảnh sự kiện...")
    stats = defaultdict(lambda: {"matched": 0, "total": 0, "unmatched": []})

    for it in dated_items:
        src_key = it["source"]
        stats[src_key]["total"] += 1
        p_path = Path(it["src_path"])
        date_str = it.get("date", "")
        if not date_str:
            continue
        p_date = datetime.date.fromisoformat(date_str)

        candidates = [name for name, (d_obj, d_path) in event_dirs.items() if abs((d_obj - p_date).days) <= 1]
        if not candidates:
            candidates = [name for name, (d_obj, d_path) in event_dirs.items() if abs((d_obj - p_date).days) <= 3]

        try:
            with Image.open(p_path) as im:
                h_src = imagehash.phash(im)
        except Exception as e:
            print(f"  Lỗi đọc ảnh {p_path}: {e}")
            continue

        best_dist = 999
        best_event = ""
        for cand_name in candidates:
            cand_dir = event_dirs[cand_name][1]
            for cand_p in cand_dir.iterdir():
                if cand_p.is_file() and cand_p.suffix.lower() in IMG_EXT:
                    try:
                        with Image.open(cand_p) as c_im:
                            h_cand = imagehash.phash(c_im)
                        dist = h_src - h_cand
                        if dist < best_dist:
                            best_dist = dist
                            best_event = cand_name
                            if dist == 0: break
                    except:
                        pass
            if best_dist == 0: break

        if best_dist <= 10 and best_event in csv_events:
            it["event_folder"] = best_event
            it["caption"] = csv_events[best_event]
            stats[src_key]["matched"] += 1
        else:
            it["event_folder"] = ""
            it["caption"] = ""
            stats[src_key]["unmatched"].append((it["src_name"], best_dist, best_event))

    print("  Kết quả so khớp theo từng nguồn:")
    for k, v in stats.items():
        pct = (v["matched"] / v["total"] * 100) if v["total"] > 0 else 0
        print(f"    - {k}: {v['matched']}/{v['total']} khớp (đạt {pct:.1f}%)")
        if v["unmatched"]:
            print(f"      Danh sách không khớp: {v['unmatched']}")


# ============================================================================
# 6. QUY TẮC CHỌN LỌC HIỆN VẬT
# ============================================================================

def apply_selections(bk_items, co_items, pcvt_items, cd_items):
    # 1. Khu 2: đọc docs/khu2_chon_loc.json
    khu2_file = APP / 'docs' / 'khu2_chon_loc.json'
    with open(khu2_file, encoding='utf-8') as f:
        khu2_map = json.load(f)

    khu2_dict = {}
    for wall_name, ids in khu2_map.items():
        for item_id in ids:
            khu2_dict[item_id] = wall_name

    for it in bk_items + co_items:
        if it["id"] in khu2_dict:
            it["treo"] = True
            it["tuong"] = khu2_dict[it["id"]]
        else:
            it["treo"] = False
            it["tuong"] = ""

    # 2. Công đoàn: 25 treo + 21 album_only
    cd_treo_ids = {
        'cong_doan_001_2025-08-28', 'cong_doan_002_2025-08-28', 'cong_doan_003_2025-08-28',
        'cong_doan_003_2025-10-18', 'cong_doan_004_2025-08-28', 'cong_doan_004_2025-10-18',
        'cong_doan_005_2025-08-28', 'cong_doan_005_2026-01-31', 'cong_doan_006_2025-10-18',
        'cong_doan_006_2026-01-31', 'cong_doan_007_2025-10-18', 'cong_doan_007_2026-03-04',
        'cong_doan_008_2025-10-18', 'cong_doan_008_2026-03-04', 'cong_doan_009_2025-10-18',
        'cong_doan_009_2026-03-04', 'cong_doan_010_2025-10-18', 'cong_doan_010_2026-03-09',
        'cong_doan_011_2025-10-18', 'cong_doan_011_2026-03-09', 'cong_doan_012_2025-10-18',
        'cong_doan_013_2026-01-31', 'cong_doan_014_2026-01-31', 'cong_doan_015_2026-01-31',
        'cong_doan_016_2026-01-31'
    }
    for it in cd_items:
        it["treo"] = (it["id"] in cd_treo_ids)

    # 3. PCVT: 85 treo + 15 album_only
    pcvt_album_ids = {
        'pcvt_086_2026-07-19', 'pcvt_087_2026-08-04', 'pcvt_088_2026-08-04',
        'pcvt_089_2026-08-04', 'pcvt_090_2026-08-09', 'pcvt_091_2026-08-09',
        'pcvt_092_2026-08-09', 'pcvt_093_2026-09-10', 'pcvt_094_2026-09-10',
        'pcvt_095_2026-09-15', 'pcvt_096_2026-09-15', 'pcvt_097_2026-09-15',
        'pcvt_098_2026-09-20', 'pcvt_099_2026-09-20', 'pcvt_100_2026-09-20'
    }
    for it in pcvt_items:
        it["treo"] = (it["id"] not in pcvt_album_ids)


# ============================================================================
# 7. VÁCH MỐC SON KHU 3 (Section D)
# ============================================================================

def assign_vach_moc_son(all_items: list):
    # West face milestone IDs
    # Mốc 1: 04/08/2025: 3 ảnh PCVT_003, 004, 005
    moc1_ids = {'pcvt_003_2025-08-04', 'pcvt_004_2025-08-04', 'pcvt_005_2025-08-04'}
    # Mốc 3: 01/07/2026: 3 ảnh PCVT_069, 070, 071
    moc3_ids = {'pcvt_069_2026-07-01', 'pcvt_070_2026-07-01', 'pcvt_071_2026-07-01'}

    # East face 7 sự kiện trọng đại:
    east_face_ids = {
        'pcvt_009_2025-08-13',
        'pcvt_012_2025-08-27',
        'pcvt_014_2025-08-29',
        'dang_bo_001_2026-02-06',
        'pcvt_049_2026-04-03',
        'pcvt_080_2026-07-16',
        'pcvt_075_2026-07-08',
    }

    for it in all_items:
        item_id = it.get('id', '')
        if item_id in moc1_ids or item_id in moc3_ids or item_id in {'moc2_01', 'moc2_02'}:
            it['vach_moc_son'] = 'tay'
        elif item_id in east_face_ids:
            it['vach_moc_son'] = 'dong'
        else:
            it['vach_moc_son'] = ''


# ============================================================================
# 8. XUẤT JSON VÀ EXCEL
# ============================================================================

def export_json(all_items: list):
    wall_items = [it for it in all_items if it.get("treo", True)]
    album_only = [it for it in all_items if not it.get("treo", True)]

    data = {
        "total_items": len(all_items),
        "wall_count": len(wall_items),
        "album_only_count": len(album_only),
        "items": [],
    }

    for it in all_items:
        entry = {
            "id": it["id"],
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
            "vach_moc_son": it.get("vach_moc_son", ""),
            "wall_path": it.get("wall_path", f"assets/wall/{it['khu']}/{it['new_name']}"),
            "thumb_path": it.get("thumb_path", f"assets/thumbs/{it['khu']}/{it['new_name']}"),
            "full_path": it.get("full_path", f"assets/full/{it['khu']}/{it['new_name']}"),
        }
        if it.get("event_folder"):
            entry["event_folder"] = it["event_folder"]
        if it.get("tuong"):
            entry["tuong"] = it["tuong"]
        data["items"].append(entry)

    out_path = OUT_JSON / "room_data.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  Đã xuất {out_path} ({len(data['items'])} mục, {len(wall_items)} treo)")


def export_excel(all_items: list):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Danh sách hiện vật"

    headers = [
        "Khu", "Nguồn", "File gốc", "File mới", "Năm/Ngày", "Đơn vị",
        "Chú thích", "Loại", "Treo tường (Có/Không)", "Tường", "Vách mốc son",
        "Thứ tự", "Tỷ lệ ảnh"
    ]

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
            treo,
            it.get("tuong", ""),
            it.get("vach_moc_son", ""),
            it.get("number", 0),
            it.get("aspect_ratio", 1.0),
        ]
        for col, v in enumerate(values, 1):
            cell = ws.cell(row=row, column=col, value=v)
            cell.border = thin_border
            cell.font = Font(name="Be Vietnam Pro", size=10)
        row += 1

    for col in ws.columns:
        max_len = 0
        col_letter = col[0].column_letter
        for cell in col:
            if cell.value:
                max_len = max(max_len, len(str(cell.value)))
        ws.column_dimensions[col_letter].width = min(max_len + 3, 50)

    out_path = OUT_DOCS / "DANH_SACH_TREO.xlsx"
    wb.save(str(out_path))
    print(f"  Đã xuất {out_path}")


# ============================================================================
# MAIN
# ============================================================================
def main():
    print("=" * 70)
    print("GĐ3-FIX2 – build_room_data.py")
    print("=" * 70)

    print("\n[1/6] Đọc tất cả nguồn...")
    atl = read_anh_tu_lieu()
    tt = read_tranh_tang()
    bk = read_bang_khen()
    co = read_co()
    pcvt = read_dated_photos("pcvt", "khu3", "pcvt")
    db = read_dated_photos("dang_bo", "khu4", "dang_bo")
    cd = read_dated_photos("cong_doan", "khu6", "cong_doan")
    dtn = read_dated_photos("doan_tn", "khu6", "doan_tn")

    print(f"  Ảnh tư liệu: {len(atl)}")
    print(f"  Tranh tặng: {len(tt)}")
    print(f"  Bằng khen: {len(bk)}")
    print(f"  Cờ: {len(co)}")
    print(f"  PCVT: {len(pcvt)}")
    print(f"  Đảng bộ: {len(db)}")
    print(f"  Công đoàn: {len(cd)}")
    print(f"  Đoàn TN: {len(dtn)}")

    print("\n[2/6] So khớp perceptual hash (pHash) và gán chú thích có dấu...")
    dated_items = pcvt + db + cd + dtn
    match_photos_phash(dated_items)

    print("\n[3/6] Áp dụng quy tắc chọn lọc hiện vật...")
    apply_selections(bk, co, pcvt, cd)

    print("\n[4/6] Thêm ảnh MOC_SON và thiết lập vách mốc son khu 3...")
    # Resize MOC_SON nếu cần
    moc1_src = GOC / 'MOC_SON' / 'moc2_01.jpg'
    moc2_src = GOC / 'MOC_SON' / 'moc2_02.jpg'
    for src_path, new_name in [(moc1_src, 'moc2_01.jpg'), (moc2_src, 'moc2_02.jpg')]:
        if src_path.exists():
            for size_key, (edge, q) in [('wall', (1024, 80)), ('thumb', (320, 70)), ('full', (2000, 85))]:
                dst = APP / 'assets' / size_key / 'khu3' / new_name
                if not dst.exists():
                    resize_image(src_path, dst, edge, q)

    item_moc2_01 = {
        "id": "moc2_01",
        "source": "pcvt",
        "khu": "khu3",
        "src_path": str(moc1_src),
        "src_name": "moc2_01.jpg",
        "new_name": "moc2_01.jpg",
        "year": 2026,
        "date": "2026-01-01",
        "org_code": "PCVT",
        "org_name": "Công ty Điện lực Vũng Tàu",
        "item_type": "Pcvt",
        "caption": "Đồng chí Nguyễn Ngọc Tuyến nhận nhiệm vụ Giám đốc Công ty",
        "aspect_ratio": 1.755,
        "treo": True,
        "vach_moc_son": "tay",
        "event_folder": "2026-01-16_Trong-hai-ngay-15-va-16-01-2026-tai-Cong-ty-Dien-luc-Vung-Tau-Tong",
        "wall_path": "assets/wall/khu3/moc2_01.jpg",
        "thumb_path": "assets/thumbs/khu3/moc2_01.jpg",
        "full_path": "assets/full/khu3/moc2_01.jpg"
    }

    item_moc2_02 = {
        "id": "moc2_02",
        "source": "pcvt",
        "khu": "khu3",
        "src_path": str(moc2_src),
        "src_name": "moc2_02.jpg",
        "new_name": "moc2_02.jpg",
        "year": 2026,
        "date": "2026-01-16",
        "org_code": "PCVT",
        "org_name": "Công ty Điện lực Vũng Tàu",
        "item_type": "Pcvt",
        "caption": "Lễ công bố và trao quyết định cán bộ – 16/01/2026",
        "aspect_ratio": 1.466,
        "treo": True,
        "vach_moc_son": "tay",
        "event_folder": "2026-01-16_Trong-hai-ngay-15-va-16-01-2026-tai-Cong-ty-Dien-luc-Vung-Tau-Tong",
        "wall_path": "assets/wall/khu3/moc2_02.jpg",
        "thumb_path": "assets/thumbs/khu3/moc2_02.jpg",
        "full_path": "assets/full/khu3/moc2_02.jpg"
    }

    all_items = atl + tt + bk + co + pcvt + db + cd + dtn + [item_moc2_01, item_moc2_02]

    # Gán aspect_ratio
    for it in all_items:
        if "aspect_ratio" not in it:
            it["aspect_ratio"] = round(get_aspect_ratio(Path(it["src_path"])), 3)

    # Gán vách mốc son
    assign_vach_moc_son(all_items)

    print("\n[5/6] Xuất assets/room_data.json...")
    export_json(all_items)

    print("\n[6/6] Xuất docs/DANH_SACH_TREO.xlsx...")
    export_excel(all_items)

    # Bảng tổng kết
    wall_items = [it for it in all_items if it.get("treo", True)]
    print("\n" + "=" * 70)
    print("HOÀN THÀNH GĐ3-FIX2")
    print("=" * 70)
    print(f"Tổng hiện vật: {len(all_items)} | Treo tường: {len(wall_items)}")
    
    # Kiểm tra [CHỜ XÁC NHẬN]
    confirms = [it for it in wall_items if "[CHỜ XÁC NHẬN]" in str(it.get("caption", ""))]
    print(f"Số lượng [CHỜ XÁC NHẬN] còn lại trên tường: {len(confirms)} (Mục tiêu: 0)")


if __name__ == '__main__':
    main()
