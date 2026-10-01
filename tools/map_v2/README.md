# Bộ script dựng sơ đồ địa dư – lưới điện PCVT (bản v2, 02/10/2026)

Đã chạy sẵn, kết quả là `assets/grid/pcvt_map_4096.webp`, `pcvt_map_2048.webp`, `pcvt_grid_v2.json`.
Chỉ cần chạy lại khi bản vẽ PDF thay đổi.

Thứ tự: `seg.py` (render PDF → render.npy) → `seg2.py` (tách vùng phường theo nét ranh giới đen) → `seg3.py` (tách P. Bà Rịa theo màu, ghép 4 phường TP Vũng Tàu cũ từ `ranh_gioi_bo_sung.json`) → `render_map.py` (vẽ ảnh bản đồ + xuất JSON).
Thư viện: pymupdf, opencv-python, numpy, pillow. Font: Be Vietnam Pro (thư mục `Be_Vietnam_Pro`).
Các đường dẫn trong script đang trỏ tới môi trường dựng ban đầu – sửa lại biến đường dẫn đầu file trước khi chạy.
