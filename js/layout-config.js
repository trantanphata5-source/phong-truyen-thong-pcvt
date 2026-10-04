/**
 * js/layout-config.js
 * ====================
 * GĐ2 – Khai báo tập trung toàn bộ tọa độ phòng truyền thống.
 * Mọi file khác phải import từ đây, không được ghi số cứng.
 *
 * Hệ tọa độ: x dương = Đông, z âm = Bắc. Đơn vị: mét.
 * Tường cao 8 m, vách ngăn cao 5.2 m.
 */

// ============================================================================
// 1. HẰNG SỐ CHUNG
// ============================================================================
export const WALL_HEIGHT = 8.0;
export const PARTITION_HEIGHT = 5.2;
export const WALL_THICKNESS = 1.2;
export const PARTITION_THICKNESS = 0.8;
export const EYE_HEIGHT = 2.85;
export const DEFAULT_PITCH = -3 * Math.PI / 180; // −3°

/** Điểm xuất phát: (0, EYE_HEIGHT, 26), nhìn về hướng Bắc */
export const SPAWN = { x: 0, z: 26, yaw: Math.PI }; // yaw = π = nhìn hướng Bắc

// ============================================================================
// 2. ĐỊNH NGHĨA 7 KHU
// ============================================================================
export const ZONES = {
  lobby: {
    id: 'lobby',
    name: 'Sảnh trung tâm',
    theme: { primary: '#1E40A0', accent: '#FACC15' },
    bounds: { minX: -17.5, maxX: 17.5, minZ: -17, maxZ: 38 },
    // Bệ bát giác R=12, tâm (0, 0)
    rotunda: { cx: 0, cz: 0, radius: 12 },
  },

  khu1: {
    id: 'khu1',
    name: 'Khu 1 · Ký ức & Tranh tặng',
    nameShort: 'KHU 1',
    theme: { primary: '#F5EBD7', text: '#5B3A1E', accent: '#8B6F47' },
    bounds: { minX: -50, maxX: -18, minZ: -25, maxZ: 25 },
  },

  khu2: {
    id: 'khu2',
    name: 'Khu 2 · Bằng khen & Cờ lưu niệm',
    nameShort: 'KHU 2',
    theme: { primary: '#8B1A1A', text: '#F6D26B', accent: '#F6D26B' },
    bounds: { minX: -18, maxX: 18, minZ: -55, maxZ: -17 },
  },

  khu3: {
    id: 'khu3',
    name: 'Khu 3 · Hiện tại',
    nameShort: 'KHU 3',
    theme: { primary: '#F4F7FB', text: '#0F172A', accent: '#1E40A0' },
    bounds: { minX: 18, maxX: 50, minZ: -25, maxZ: 25 },
  },

  khu4: {
    id: 'khu4',
    name: 'Khu 4 · Đảng bộ Công ty',
    nameShort: 'KHU 4',
    theme: { primary: '#B91C1C', text: '#FACC15', accent: '#FACC15' },
    bounds: { minX: 22, maxX: 50, minZ: 38, maxZ: 82 },
  },

  khu5: {
    id: 'khu5',
    name: 'Khu 5 · Không gian Văn hóa HCM',
    nameShort: 'KHU 5',
    theme: { primary: '#6B1520', text: '#F6D26B', accent: '#F6D26B' },
    bounds: { minX: -22, maxX: 22, minZ: 38, maxZ: 82 },
  },

  khu6: {
    id: 'khu6',
    name: 'Khu 6 · Công đoàn & Đoàn TN',
    nameShort: 'KHU 6',
    theme: { primary: '#1E3A5F', text: '#FFFFFF', accent: '#22D3EE' },
    bounds: { minX: -50, maxX: -22, minZ: 38, maxZ: 82 },
  },
};

// ============================================================================
// 3. TƯỜNG (walls) — mỗi mục là 1 đoạn tường
//    w = chiều dài bề mặt, h = chiều cao, d = độ dày
//    x, y, z = tâm, rotY = góc quay (0 = dọc theo trục x, π/2 = dọc theo trục z)
// ============================================================================
export const WALLS = [
  // ============ KHU 2 · Bắc ============
  // Tường hậu z = −55 (lùi từ −45)
  { id: 'wall_k2_back', zone: 'khu2', w: 36, h: WALL_HEIGHT, d: WALL_THICKNESS,
    x: 0, z: -55, rotY: 0 },
  // Tường Tây x = −18
  { id: 'wall_k2_west', zone: 'khu2', w: 38, h: WALL_HEIGHT, d: WALL_THICKNESS,
    x: -18, z: -36, rotY: Math.PI / 2 },
  // Tường Đông x = 18
  { id: 'wall_k2_east', zone: 'khu2', w: 38, h: WALL_HEIGHT, d: WALL_THICKNESS,
    x: 18, z: -36, rotY: Math.PI / 2 },

  // ============ KHU 1 · Tây ============
  // Tường xa x = −50
  { id: 'wall_k1_far', zone: 'khu1', w: 52, h: WALL_HEIGHT, d: WALL_THICKNESS,
    x: -50, z: 0, rotY: Math.PI / 2 },
  // Tường Bắc z = −25
  { id: 'wall_k1_north', zone: 'khu1', w: 32, h: WALL_HEIGHT, d: WALL_THICKNESS,
    x: -34, z: -25, rotY: 0 },
  // Tường Nam z = 25 — GĐ6-fix2 A1: giữ nửa phía trong x −50 → −34, bỏ nửa sát sảnh (mở lối sảnh ↔ hành lang)
  { id: 'wall_k1_south', zone: 'khu1', w: 16, h: WALL_HEIGHT, d: WALL_THICKNESS,
    x: -42, z: 25, rotY: 0, cutEnd: 'east' },

  // ============ KHU 3 · Đông ============
  // Tường xa x = 50
  { id: 'wall_k3_far', zone: 'khu3', w: 52, h: WALL_HEIGHT, d: WALL_THICKNESS,
    x: 50, z: 0, rotY: -Math.PI / 2 },
  // Tường Bắc z = −25
  { id: 'wall_k3_north', zone: 'khu3', w: 32, h: WALL_HEIGHT, d: WALL_THICKNESS,
    x: 34, z: -25, rotY: 0 },
  // Tường Nam z = 25 — GĐ6-fix2 A1: giữ nửa phía trong x 34 → 50, bỏ nửa sát sảnh
  { id: 'wall_k3_south', zone: 'khu3', w: 16, h: WALL_HEIGHT, d: WALL_THICKNESS,
    x: 42, z: 25, rotY: 0, cutEnd: 'west' },

  // ============ KHU 4 · Đông Nam ============
  // Tường Đông x = 50 (chung với khu 3 ở phía trên)
  { id: 'wall_k4_east', zone: 'khu4', w: 44, h: WALL_HEIGHT, d: WALL_THICKNESS,
    x: 50, z: 60, rotY: -Math.PI / 2 },
  // Tường Nam z = 82
  { id: 'wall_k4_south', zone: 'khu4', w: 28, h: WALL_HEIGHT, d: WALL_THICKNESS,
    x: 36, z: 82, rotY: 0 },
  // GĐ6-fix1 E2: bỏ hẳn 2 đoạn tường Bắc z = 38 (lối vào mở rộng hết 28 m)
  // Tường Tây dùng chung với mặt ngoài tường Đông khu HCM (x = 22)
  // Khu HCM đã có tường x=22, khu 4 treo ảnh ở mặt ngoài

  // ============ KHU 6 · Tây Nam ============
  // Tường Tây x = −50 (chung với khu 1 ở phía trên)
  { id: 'wall_k6_west', zone: 'khu6', w: 44, h: WALL_HEIGHT, d: WALL_THICKNESS,
    x: -50, z: 60, rotY: Math.PI / 2 },
  // Tường Nam z = 82
  { id: 'wall_k6_south', zone: 'khu6', w: 28, h: WALL_HEIGHT, d: WALL_THICKNESS,
    x: -36, z: 82, rotY: 0 },
  // GĐ6-fix1 E2: bỏ hẳn 2 đoạn tường Bắc z = 38 (lối vào mở rộng hết 28 m)
  // Tường Đông dùng chung với mặt ngoài tường Tây khu HCM (x = −22)

  // ============ HÀNH LANG z 25 → 38 (GĐ6-fix1 E3) ============
  // Bịt khoảng trống ở 2 đầu hành lang x = ±50 (wall_k3_far/wall_k1_far hết ở z ≈ 26,
  // wall_k4_east/wall_k6_west bắt đầu từ z = 38)
  { id: 'wall_hall_east', zone: 'lobby', w: 14.4, h: WALL_HEIGHT, d: WALL_THICKNESS,
    x: 50, z: 31.5, rotY: -Math.PI / 2 },
  { id: 'wall_hall_west', zone: 'lobby', w: 14.4, h: WALL_HEIGHT, d: WALL_THICKNESS,
    x: -50, z: 31.5, rotY: Math.PI / 2 },
];

// ============================================================================
// 4. VÁCH NGĂN (partitions)
// ============================================================================
export const PARTITIONS = [
  // Khu 1: vách x = −35 (dùng làm vách tranh), giữ nguyên
  { id: 'partition_k1', zone: 'khu1', w: 24, h: PARTITION_HEIGHT, d: PARTITION_THICKNESS,
    x: -35, z: 0, rotY: Math.PI / 2 },
  // Khu 3: Vách mốc son partition_k3 (dài 24m, cao 6.8m, dày 0.6m)
  { id: 'partition_k3', zone: 'khu3', w: 24, h: 6.8, d: 0.6,
    x: 35, z: 0, rotY: Math.PI / 2 },
];

// ============================================================================
// 5. HÀNH LANG z 25..38 (nối sảnh → khu 4, 5, 6)
// ============================================================================
export const HALLWAY = {
  bounds: { minX: -50, maxX: 50, minZ: 25, maxZ: 38 },
};

// ============================================================================
// 6. VA CHẠM (collision boxes = AABBs)
//    Sinh từ WALLS, PARTITIONS và các vật thể đặc biệt.
// ============================================================================
function wallToAABB(wall) {
  const halfW = wall.w / 2;
  const halfD = wall.d / 2;
  // Nếu rotY ≈ 0 → tường chạy dọc x, dày theo z
  // Nếu rotY ≈ ±π/2 → tường chạy dọc z, dày theo x
  const isVertical = Math.abs(Math.abs(wall.rotY) - Math.PI / 2) < 0.01;
  if (isVertical) {
    return {
      id: wall.id,
      minX: wall.x - halfD, maxX: wall.x + halfD,
      minZ: wall.z - halfW, maxZ: wall.z + halfW,
    };
  } else {
    return {
      id: wall.id,
      minX: wall.x - halfW, maxX: wall.x + halfW,
      minZ: wall.z - halfD, maxZ: wall.z + halfD,
    };
  }
}

export function buildCollisionBoxes() {
  const boxes = [];

  // Tường
  for (const wall of WALLS) {
    boxes.push(wallToAABB(wall));
  }

  // Vách ngăn
  for (const part of PARTITIONS) {
    boxes.push(wallToAABB(part));
  }

  // HCM tường (giữ nguyên từ code cũ)
  boxes.push({ id: 'wall_hcm_west', minX: -23, maxX: -21, minZ: 38, maxZ: 82 });
  boxes.push({ id: 'wall_hcm_east', minX: 21, maxX: 23, minZ: 38, maxZ: 82 });
  boxes.push({ id: 'wall_hcm_south', minX: -22, maxX: 22, minZ: 81, maxZ: 83 });

  // Sa bàn lưới điện (dài 6.0m dọc x: 23..29, rộng 4.2m dọc z: -2.1..2.1 tại tâm (26, 0))
  boxes.push({
    id: 'grid_table',
    minX: 22.8,
    maxX: 29.2,
    minZ: -2.3,
    maxZ: 2.3,
  });

  return boxes;
}

// ============================================================================
// 7. VÙNG ĐI ĐƯỢC (walkable regions)
//    Người chơi phải nằm trong ít nhất 1 vùng này.
// ============================================================================
export const WALKABLE_REGIONS = [
  // Khu 2 Bắc
  { id: 'khu2', minX: -17.5, maxX: 17.5, minZ: -54.2, maxZ: -17 },
  // Khu 1 Tây
  { id: 'khu1', minX: -49.2, maxX: -17, minZ: -24.2, maxZ: 24.2 },
  // Khu 3 Đông
  { id: 'khu3', minX: 17, maxX: 49.2, minZ: -24.2, maxZ: 24.2 },
  // Sảnh trung tâm
  { id: 'lobby', minX: -17.5, maxX: 17.5, minZ: -17, maxZ: 38 },
  // Hành lang Nam
  { id: 'hallway', minX: -49.2, maxX: 49.2, minZ: 24.2, maxZ: 38 },
  // Khu 5 HCM
  { id: 'khu5', minX: -21, maxX: 21, minZ: 36.5, maxZ: 80.5 },
  // Khu 4 Đông Nam
  { id: 'khu4', minX: 21.5, maxX: 49.2, minZ: 37, maxZ: 81 },
  // Khu 6 Tây Nam
  { id: 'khu6', minX: -49.2, maxX: -21.5, minZ: 37, maxZ: 81 },
];

// ============================================================================
// 8. ĐIỂM TOUR VÀ ĐIỂM ĐẾN KHI BẤM KHU
// ============================================================================
export const HALL_TARGETS = {
  all:   { x:  0,    z: 26, lookX:  0,   lookZ:  0, lookY: 2.5 },
  khu1:  { x: -28,   z:  0, lookX: -49,  lookZ:  0, lookY: 3.0 },
  khu2:  { x:  0,    z: -30, lookX:  0,  lookZ: -55, lookY: 3.5 },
  khu3:  { x:  28,   z:  0, lookX:  49,  lookZ:  0, lookY: 3.0 },
  khu4:  { x:  36,   z: 55, lookX:  49,  lookZ: 60, lookY: 3.0 },
  khu5:  { x:  0,    z: 50, lookX:  0,   lookZ: 65, lookY: 4.0 },
  khu6:  { x: -36,   z: 55, lookX: -49,  lookZ: 60, lookY: 3.0 },
};

// ============================================================================
// 9. TỦ ALBUM (2 tủ, 4 album)
// ============================================================================
export const ALBUM_CABINETS = [
  {
    id: 'cabinet_1',
    position: { x: -4.6, z: -6.8 },
    rotY: Math.PI / 4,
    label: 'KÝ ỨC & VINH DANH',
    albums: ['souvenir', 'awards_flags'],
  },
  {
    id: 'cabinet_2',
    position: { x: 4.6, z: -6.8 },
    rotY: -Math.PI / 4,
    label: 'HÔM NAY & ĐOÀN THỂ',
    albums: ['pcvt', 'doan_the'],
  },
];

// ============================================================================
// 10. SA BÀN LƯỚI ĐIỆN
// ============================================================================
export const GRID_TABLE = {
  position: { x: 26, z: 0 },
  width: 4.2,   // Rộng trong hệ cục bộ của bàn (thành trục z sau xoay -π/2)
  depth: 6.0,   // Dài trong hệ cục bộ của bàn (thành trục x sau xoay -π/2)
  height: 0.95,
  tiltDeg: 8,
};

// ============================================================================
// 11. SÀN VÀ TRẦN CHO TỪNG KHU MỚI
// ============================================================================
export const FLOORS = {
  // Sàn chính (bao phủ toàn bộ)
  main: { width: 140, depth: 160, cx: 0, cz: 20 },
  // Trần khu cũ (đã có)
  main_ceiling: { width: 140, depth: 108, cx: 0, cz: -16, y: 8.5 },
  // Trần khu 4
  ceiling_khu4: { width: 28, depth: 44, cx: 36, cz: 60, y: 8.5 },
  // Trần khu 6
  ceiling_khu6: { width: 28, depth: 44, cx: -36, cz: 60, y: 8.5 },
};

// ============================================================================
// 12. ZONE VISIBILITY (Bảng VISIBLE_ZONES đã được xóa theo Mục A.1 GĐ5-fix2, thay bằng Frustum + Distance culling)


