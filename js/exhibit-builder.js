import * as THREE from 'three';
import { FONT_FAMILY } from './fonts.js';
import { WALLS, PARTITIONS, WALL_THICKNESS, PARTITION_THICKNESS, ZONES, ALBUM_CABINETS, buildCollisionBoxes } from './layout-config.js';
import { MilestoneWallBuilder } from './milestone-wall.js';

/**
 * Exhibit Builder v4 (GĐ3-fix2)
 * ==============================
 * Sửa lỗi:
 * A. Giãn khoảng cách tầng ảnh: ROW_Y_TOP = 3.10, ROW_Y_BOTTOM = 1.50, gap >= 0.30m, lề đầu tường 1.2m
 * B. Tiêu đề có dấu, không in [CHỜ XÁC NHẬN] trên biển tên, tự co chữ min 20px
 * C. Sửa hướng mặt tường Khu 1 (wall_k1_north: rotY=0, wall_k1_south: rotY=π), kiểm tra assertInsideZone() = 0 lỗi
 * D. Vách mốc son khu 3 (partition_k3: Tây 3 mốc son, Đông 7 sự kiện trọng đại)
 */
export class ExhibitBuilder {
  constructor(scene) {
    this.scene = scene;
    this.textureLoader = new THREE.TextureLoader();
    this.loadedTextures = new Map();
    this.exhibitMeshes = [];
    this.exhibitMap = new Map();
    this.mountedExhibits = [];

    // GĐ6-fix1 C: nâng ảnh trên các tường bao (khu 1, 2, 3, 4, 6)
    //  - Tường bao: tâm tầng trên 4,40 m, tầng dưới 2,75 m (gần tầm mắt 2,85 m)
    //  - Vách partition_k1 (cao 5,2 m): 3,64 / 2,05
    this.ROW_Y_TOP = 3.64;
    this.ROW_Y_BOTTOM = 2.05;
    this.OUTER_ROW_Y_TOP = 4.40;
    this.OUTER_ROW_Y_BOTTOM = 2.75;
    this.MIN_GAP = 0.35;
    this.END_MARGIN = 1.20;

    // GĐ6-fix1 D: bảng tiêu đề tường và dải khẩu hiệu
    this.WALL_BOARD_Y = 5.80;          // tâm bảng tiêu đề trên tường bao (cao 1,10 m)
    this.WALL_BOARD_H = 1.10;
    this.PARTITION_BOARD_Y = 4.82;     // tâm bảng trên partition_k1 (cao 0,70 m) – GĐ6-fix1: 4,78 → 4,82 để khe tới khung ≥ 0,25 m
    this.PARTITION_BOARD_H = 0.70;
    this.SLOGAN_Y = 7.00;              // tâm dải khẩu hiệu

    // GĐ6-fix2 B2: khu 3 (2 tầng theo cột) và khu 4, 6 (1 tầng)
    this.K3_ROW_Y_TOP = 4.70;
    this.K3_ROW_Y_BOTTOM = 2.80;
    this.K3_FRAME_H = 1.10;
    this.K3_BOARD_Y = 6.20;            // tâm bảng tiêu đề tường khu 3 (cao 1,10 m)
    this.K3_SLOGAN_Y = 7.30;
    this.K46_ROW_Y = 3.70;
    this.K46_FRAME_H = 1.30;
    this.K3_MIN_GAP = 0.35;
    this.K46_MIN_GAP = 0.50;
    this.MAX_GAP = 1.60;
    /** Báo cáo bố trí từng mặt tường (khu 3, 4, 6) */
    this.wallLayoutReport = [];
    this.boardRects = [];
    this.anhTreoTuong = null;

    // Hộp va chạm dùng để tính vùng treo và kiểm tra assertFramesOnWall()
    this.collisionBoxes = buildCollisionBoxes();
    ALBUM_CABINETS.forEach((cab, i) => {
      this.collisionBoxes.push({
        id: `AlbumCabinet_${i + 1}`,
        minX: cab.position.x - 0.9, maxX: cab.position.x + 0.9,
        minZ: cab.position.z - 0.9, maxZ: cab.position.z + 0.9
      });
    });

    /** Mỗi mặt tường đã treo ảnh: faceKey → { cfg, minU, maxU, years[] } */
    this.faceMounts = {};
    /** faceKey → mép dưới bảng tiêu đề phía trên ảnh (để kiểm khoảng hở) */
    this.boardBottoms = {
      // Bảng chính khu 1 / khu 2 (museum-architect.js): tâm 6,75, cao 2,2, khung +0,06
      'wall_k1_far|1.57': 6.75 - 1.1 - 0.06,
      'wall_k2_back|0.00': 6.75 - 1.1 - 0.06,
    };
    /** Khu 3: báo cáo tỷ lệ thu nhỏ khung từng tường + thứ tự đi xem */
    this.khu3Report = { walls: [], sequence: [] };
    this.khu3Layout = null;

    // Xây index tường theo id
    this.wallIndex = {};
    for (const w of WALLS) this.wallIndex[w.id] = w;
    for (const p of PARTITIONS) this.wallIndex[p.id] = p;

    this.initMaterials();
  }

  initMaterials() {
    this.matGoldFrame = new THREE.MeshStandardMaterial({
      color: 0xd4af37, roughness: 0.35, metalness: 0.8
    });
    this.matWoodFrame = new THREE.MeshStandardMaterial({
      color: 0x241810, roughness: 0.5, metalness: 0.1
    });
    this.matAluminumKhu3 = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1, roughness: 0.4, metalness: 0.75
    });
    this.matGold = new THREE.MeshStandardMaterial({
      color: 0xffd700, roughness: 0.25, metalness: 0.9
    });
    this.matMatte = new THREE.MeshStandardMaterial({
      color: 0xfdf8ef, roughness: 0.9
    });
    this.matGlass = new THREE.MeshStandardMaterial({
      color: 0xffffff, transparent: true, opacity: 0.08,
      roughness: 0.1, metalness: 0.1
    });
    this.matFlagBar = new THREE.MeshStandardMaterial({
      color: 0xb8860b, roughness: 0.4, metalness: 0.7
    });
    this.matFlagFringe = new THREE.MeshStandardMaterial({
      color: 0xffd700, roughness: 0.3, metalness: 0.8
    });
  }

  getOrLoadTexture(path) {
    if (!path) return null;
    if (this.loadedTextures.has(path)) return this.loadedTextures.get(path);
    const tex = this.textureLoader.load(path);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.loadedTextures.set(path, tex);
    return tex;
  }

  // ===========================================================================
  // KÍCH THƯỚC KHUNG (Section A)
  // ===========================================================================
  getFrameSize(item) {
    const ar = item.aspect_ratio || 1.33;
    const src = item.source;
    const khu = item.khu;

    // Huân chương / TTCP (khu 2): 1.4 × 1.0
    if (src === 'bang_khen' && ['CTN', 'TTCP'].includes(item.org_code)) {
      return { w: 1.40, h: 1.00, frameType: 'gold_honor' };
    }
    // Ô bằng khen / cờ (khu 2): 1.25 × 0.90
    if (src === 'bang_khen' || src === 'co') {
      return { w: 1.25, h: 0.90, frameType: (src === 'co') ? 'cert_flag' : 'cert' };
    }
    // Tranh tặng (khu 1): ô tối đa 1.35 × 0.95 để khoảng trống dọc >= 0.30m
    if (src === 'tranh_tang') {
      const maxW = 1.35, maxH = 0.95;
      let w = maxW, h = w / ar;
      if (h > maxH) { h = maxH; w = h * ar; }
      return { w, h, frameType: 'painting' };
    }
    // Chiều cao ảnh khu 1: 0.90
    if (khu === 'khu1') {
      const h = 0.90;
      return { w: h * ar, h, frameType: 'cert' };
    }
    // GĐ6-fix2 B2: khu 3 cao 1,10 m (rộng = h × tỷ lệ)
    if (khu === 'khu3') {
      const h = this.K3_FRAME_H;
      return { w: h * ar, h, frameType: 'cert' };
    }
    // GĐ6-fix2 B2: khu 4, 6 cao 1,30 m (1 tầng)
    const h2 = this.K46_FRAME_H;
    return { w: h2 * ar, h: h2, frameType: 'cert' };
  }

  // ===========================================================================
  // GĐ6-fix2 A2: vùng treo ảnh trên một mặt tường (tọa độ u dọc trục t = (cos rotY, −sin rotY))
  //  - lề mỗi đầu END_MARGIN tính từ mặt tường vuông góc / vách / nẹp cắt
  //  - không dài hơn wallLength (lengthOverride) nếu có
  // ===========================================================================
  physicalLength(wallCfg) {
    const PHYS = { wall_k4_west_hcm: 44, wall_k6_east_hcm: 44 };
    if (PHYS[wallCfg.id]) return PHYS[wallCfg.id];
    const w = this.wallIndex[wallCfg.id];
    return w ? w.w : wallCfg.wallLength;
  }

  ownBoxIds(wallCfg) {
    const MAP = { wall_k4_west_hcm: ['wall_hcm_east'], wall_k6_east_hcm: ['wall_hcm_west'] };
    return [wallCfg.id, ...(MAP[wallCfg.id] || [])];
  }

  usableRange(wallCfg) {
    const phys = this.physicalLength(wallCfg);
    let lo = -phys / 2, hi = phys / 2;
    const { x, z, rotY, thickness } = wallCfg;
    const tx = Math.cos(rotY), tz = -Math.sin(rotY);
    const nx = Math.sin(rotY), nz = Math.cos(rotY);
    const own = this.ownBoxIds(wallCfg);
    for (const b of this.collisionBoxes) {
      if (own.includes(b.id)) continue;
      let minU = Infinity, maxU = -Infinity, minN = Infinity, maxN = -Infinity;
      for (const cx of [b.minX, b.maxX]) {
        for (const cz of [b.minZ, b.maxZ]) {
          const u = (cx - x) * tx + (cz - z) * tz;
          const n = (cx - x) * nx + (cz - z) * nz;
          minU = Math.min(minU, u); maxU = Math.max(maxU, u);
          minN = Math.min(minN, n); maxN = Math.max(maxN, n);
        }
      }
      // chỉ xét vật cản nằm trong dải độ sâu của khung (0 → 0,2 m trước mặt tường)
      if (maxN <= thickness / 2 + 0.001 || minN >= thickness / 2 + 0.2) continue;
      if (maxU <= lo || minU >= hi) continue;
      if ((minU + maxU) / 2 < 0) lo = Math.max(lo, maxU); else hi = Math.min(hi, minU);
    }
    let min = lo + this.END_MARGIN, max = hi - this.END_MARGIN;
    // lengthOverride
    min = Math.max(min, -wallCfg.wallLength / 2 + this.END_MARGIN);
    max = Math.min(max, wallCfg.wallLength / 2 - this.END_MARGIN);
    // nẹp đầu tường bị cắt
    if (wallCfg.capLimit) {
      min = Math.max(min, wallCfg.capLimit.min);
      max = Math.min(max, wallCfg.capLimit.max);
    }
    return { min, max };
  }

  /**
   * Chia các ô rộng widths[] trong [rangeMin, rangeMax]. Khoảng trống đều giữa các ô,
   * minGap ≤ gap ≤ maxGap; nếu còn dư chỗ thì đặt khối ảnh ở GIỪA đoạn; nếu thiếu chỗ thì thu nhỏ.
   */
  layoutRow(widths, rangeMin, rangeMax, minGap, maxGap) {
    const n = widths.length;
    const usable = rangeMax - rangeMin;
    const sumW = widths.reduce((s, w) => s + w, 0);
    let scale = 1;
    if (sumW + (n - 1) * minGap > usable) scale = (usable - (n - 1) * minGap) / sumW;
    let gap = n > 1 ? (usable - sumW * scale) / (n - 1) : 0;
    gap = Math.max(minGap, Math.min(maxGap, gap));
    if (n === 1) gap = 0;
    const total = sumW * scale + (n - 1) * gap;
    let cursor = (rangeMin + rangeMax) / 2 - total / 2;
    const centers = widths.map(w => {
      const c = cursor + (w * scale) / 2;
      cursor += w * scale + gap;
      return c;
    });
    return { centers, scale, gap, total };
  }

  // ===========================================================================
  // packRow — chia đều items dọc theo chiều dài tường với lề 1.2m mỗi đầu
  // ===========================================================================
  packRow(items, wallLength, wallId = '', range = null) {
    if (items.length === 0) return [];
    const n = items.length;
    const rMin = range ? range.min : -wallLength / 2 + this.END_MARGIN;
    const rMax = range ? range.max : wallLength / 2 - this.END_MARGIN;
    const usableLength = Math.max(1.0, rMax - rMin);

    let scale = 1.0;
    let sizes = items.map(it => this.getFrameSize(it));

    if (n === 1) {
      return [{ item: items[0], size: sizes[0], offset: (rMin + rMax) / 2 }];
    }

    // Nếu tổng bề rộng các khung vượt quá độ dài tường thì giảm cỡ khung 5% mỗi lần cho đến khi vừa
    let totalWidth = sizes.reduce((s, sz) => s + sz.w, 0);
    let minRequired = totalWidth + (n - 1) * this.MIN_GAP;
    let scaled = false;

    while (minRequired > usableLength && scale > 0.4) {
      scale *= 0.95;
      scaled = true;
      sizes = items.map(it => {
        const sz = this.getFrameSize(it);
        return { ...sz, w: sz.w * scale, h: sz.h * scale };
      });
      totalWidth = sizes.reduce((s, sz) => s + sz.w, 0);
      minRequired = totalWidth + (n - 1) * this.MIN_GAP;
    }

    if (scaled) {
      console.log(`[packRow] Tường ${wallId || 'khung'}: giảm cỡ khung còn ${Math.round(scale * 100)}% để vừa tường khả dụng ${usableLength.toFixed(1)}m`);
    }

    const availableForGaps = usableLength - totalWidth;
    const gap = Math.max(this.MIN_GAP, availableForGaps / (n - 1));

    const result = [];
    let cursor = rMin;
    for (let i = 0; i < n; i++) {
      const center = cursor + sizes[i].w / 2;
      result.push({ item: items[i], size: sizes[i], offset: center });
      cursor += sizes[i].w + gap;
    }
    return result;
  }

  // ===========================================================================
  // mountWall — treo 2 tầng trên 1 bức tường
  // ===========================================================================
  mountWall(wallCfg, items, parent, onDone) {
    if (items.length === 0) return;

    const { x: baseX, z: baseZ, rotY, wallLength, thickness, id: wallId } = wallCfg;

    // Pháp tuyến mặt tường = hướng khung nhìn ra
    const nx = Math.sin(rotY);
    const nz = Math.cos(rotY);
    // standOff = nửa tường + phào (0.04) + khe (0.06)
    const standOff = thickness / 2 + 0.04 + 0.06;

    // Trục dài tường: vuông góc với pháp tuyến
    const tx = Math.cos(rotY);
    const tz = -Math.sin(rotY);

    // Chia 2 tầng: chẵn → trên, lẻ → dưới
    const topItems = items.filter((_, i) => i % 2 === 0);
    const bottomItems = items.filter((_, i) => i % 2 !== 0);

    const mountRow = (rowItems, y) => {
      const packed = this.packRow(rowItems, wallLength, wallId, this.usableRange(wallCfg));
      for (const { item, size, offset: localOffset } of packed) {
        const posX = baseX + nx * standOff + tx * localOffset;
        const posZ = baseZ + nz * standOff + tz * localOffset;
        const exhibit = this.createExhibit(item, size, rotY);
        exhibit.position.set(posX, y, posZ);
        parent.add(exhibit);

        this.recordMount(wallCfg, item, size, localOffset, exhibit, posX, y, posZ);

        if (onDone) onDone();
      }
    };

    // Tường đơn giữa khu (partition_k1) dùng mức riêng 3,64 / 2,05 (vách cao 5,2 m)
    // Các bức tường bao quanh bảo tàng: 4,40 / 2,75 (GĐ6-fix1 C)
    const isPartition = wallId === 'partition_k1' || (wallId && wallId.startsWith('partition_'));
    const yTop = isPartition ? this.ROW_Y_TOP : this.OUTER_ROW_Y_TOP;
    const yBottom = isPartition ? this.ROW_Y_BOTTOM : this.OUTER_ROW_Y_BOTTOM;

    mountRow(topItems, yTop);
    mountRow(bottomItems, yBottom);
  }

  /** Khóa mặt tường: cùng một vách có 2 mặt (partition_k1) phân biệt bằng rotY */
  faceKeyOf(wallId, rotY) {
    return `${wallId}|${rotY.toFixed(2)}`;
  }

  /** Ghi lại khung đã treo + mở rộng phạm vi khối ảnh của mặt tường */
  recordMount(wallCfg, item, size, localOffset, exhibit, posX, posY, posZ, extra = {}) {
    const { rotY, id: wallId } = wallCfg;
    const faceKey = this.faceKeyOf(wallId || 'custom_wall', rotY);
    this.mountedExhibits.push({
      exhibit, item, size, rotY, posX, posY, posZ,
      wallId: wallId || 'custom_wall',
      faceKey,
      localOffset,
      ...extra
    });
    if (!this.faceMounts[faceKey]) {
      this.faceMounts[faceKey] = { cfg: wallCfg, minU: Infinity, maxU: -Infinity, years: [], count: 0 };
    }
    const f = this.faceMounts[faceKey];
    f.minU = Math.min(f.minU, localOffset - size.w / 2 - 0.06);
    f.maxU = Math.max(f.maxU, localOffset + size.w / 2 + 0.06);
    if (item.year && item.year > 0) f.years.push(item.year);
    f.count++;
  }

  // ===========================================================================
  // GĐ6-fix1 B: treo THEO CỘT đúng thứ tự (ảnh 1 tầng trên, ảnh 2 tầng dưới cùng cột, …)
  // Cột rộng = khung rộng hơn trong 2 ảnh; trái → phải theo hướng người đứng nhìn tường
  // (offset tăng dần dọc trục t = (cos rotY, −sin rotY), giống packRow).
  // Không bỏ ảnh: nếu phải thu nhỏ dưới 90% thì chỉ cảnh báo.
  // GĐ6-fix2 B2: khu 3 — khung cao 1,10 m, tầng 4,70 / 2,80; khe 0,35 → 1,6 m; khối ảnh đặt GIỪA
  // đoạn tường còn lại (lề ≥ 1,2 m từ mặt tường vuông góc / nẹp cắt / tường xa).
  // Không bỏ ảnh: nếu phải thu nhỏ dưới 90% thì chỉ cảnh báo.
  // ===========================================================================
  mountWallColumns(wallCfg, items, parent, onDone, seqStart = 0) {
    if (!items.length) return 0;
    const { x: baseX, z: baseZ, rotY, thickness, id: wallId } = wallCfg;
    const nx = Math.sin(rotY), nz = Math.cos(rotY);
    const tx = Math.cos(rotY), tz = -Math.sin(rotY);
    const standOff = thickness / 2 + 0.04 + 0.06;

    const baseSizes = items.map(it => this.getFrameSize(it));
    const cols = [];
    for (let i = 0; i < items.length; i += 2) {
      cols.push({ top: i, bottom: (i + 1 < items.length) ? i + 1 : null });
    }
    // Biển tên mới rộng tối thiểu 1,2 m (= khung 1,08 + viền) nên ô chiếm tối thiểu 1,08 m
    const colW = cols.map(c => Math.max(1.08, baseSizes[c.top].w, c.bottom !== null ? baseSizes[c.bottom].w : 0));
    const n = cols.length;
    const range = this.usableRange(wallCfg);
    const lay = this.layoutRow(colW, range.min, range.max, this.K3_MIN_GAP, this.MAX_GAP);
    const scale = lay.scale;

    const rep = { wallId, items: items.length, columns: n, scale, usable: range.max - range.min, gap: lay.gap, rangeMin: range.min, rangeMax: range.max };
    this.khu3Report.walls.push(rep);
    this.wallLayoutReport.push({ ...rep, zone: 'khu3' });
    if (scale < 0.9) {
      console.warn(`[khu3] BÁO LẠI: tường ${wallId} phải thu nhỏ khung còn ${(scale * 100).toFixed(1)}% (< 90%). Không bỏ ảnh.`);
    } else {
      console.log(`[khu3] Tường ${wallId}: ${items.length} ảnh / ${n} cột, tỷ lệ khung ${(scale * 100).toFixed(1)}%, khe ${lay.gap.toFixed(2)} m`);
    }

    const yTop = this.K3_ROW_Y_TOP;
    const yBottom = this.K3_ROW_Y_BOTTOM;
    cols.forEach((c, ci) => {
      const center = lay.centers[ci];
      const place = (idx, y, row) => {
        const item = items[idx];
        const sz = baseSizes[idx];
        const size = { ...sz, w: sz.w * scale, h: sz.h * scale };
        const posX = baseX + nx * standOff + tx * center;
        const posZ = baseZ + nz * standOff + tz * center;
        const exhibit = this.createExhibit(item, size, rotY);
        exhibit.position.set(posX, y, posZ);
        parent.add(exhibit);
        this.recordMount(wallCfg, item, size, center, exhibit, posX, y, posZ,
          { column: ci, row, order: seqStart + idx });
        this.khu3Report.sequence.push({ id: item.id, date: item.date, wallId, column: ci, row, order: seqStart + idx });
        if (onDone) onDone();
      };
      place(c.top, yTop, 'top');
      if (c.bottom !== null) place(c.bottom, yBottom, 'bottom');
    });
    return items.length;
  }

  // ===========================================================================
  // GĐ6-fix2 B2: khu 4, 6 — 1 tầng, khung cao 1,30 m, tâm y = 3,70, khe 0,5 → 1,6 m,
  // khối ảnh đặt GIỪA tường; đúng thứ tự trong anh_treo_tuong.json (trái → phải theo trục t).
  // ===========================================================================
  mountWallSingleRow(wallCfg, items, parent, onDone, zone) {
    if (!items.length) return 0;
    const { x: baseX, z: baseZ, rotY, thickness, id: wallId } = wallCfg;
    const nx = Math.sin(rotY), nz = Math.cos(rotY);
    const tx = Math.cos(rotY), tz = -Math.sin(rotY);
    const standOff = thickness / 2 + 0.04 + 0.06;

    const baseSizes = items.map(it => this.getFrameSize(it));
    const range = this.usableRange(wallCfg);
    const lay = this.layoutRow(baseSizes.map(s => Math.max(1.08, s.w)), range.min, range.max, this.K46_MIN_GAP, this.MAX_GAP);
    const rep = { wallId, zone, items: items.length, columns: items.length, scale: lay.scale, usable: range.max - range.min, gap: lay.gap, rangeMin: range.min, rangeMax: range.max };
    this.wallLayoutReport.push(rep);
    if (lay.scale < 0.9) console.warn(`[${zone}] BÁO LẠI: tường ${wallId} thu nhỏ khung còn ${(lay.scale * 100).toFixed(1)}% (< 90%)`);
    else console.log(`[${zone}] Tường ${wallId}: ${items.length} ảnh, tỷ lệ khung ${(lay.scale * 100).toFixed(1)}%, khe ${lay.gap.toFixed(2)} m`);

    items.forEach((item, idx) => {
      const sz = baseSizes[idx];
      const size = { ...sz, w: sz.w * lay.scale, h: sz.h * lay.scale,
        barColor: wallId === 'wall_k6_east_hcm' ? '#0EA5E9' : (wallId === 'wall_k6_west' ? '#1D4ED8' : undefined) };
      const center = lay.centers[idx];
      const posX = baseX + nx * standOff + tx * center;
      const posZ = baseZ + nz * standOff + tz * center;
      const exhibit = this.createExhibit(item, size, rotY);
      exhibit.position.set(posX, this.K46_ROW_Y, posZ);
      parent.add(exhibit);
      this.recordMount(wallCfg, item, size, center, exhibit, posX, this.K46_ROW_Y, posZ, { order: idx });
      if (onDone) onDone();
    });
    return items.length;
  }

  // ===========================================================================
  // Helper: lấy wallCfg từ layout-config WALLS
  // ===========================================================================
  wallCfgFromId(wallId, rotY, lengthOverride) {
    const w = this.wallIndex[wallId];
    if (!w) { console.warn(`Wall ${wallId} not found`); return null; }
    const cfg = {
      id: wallId,
      x: w.x, z: w.z,
      rotY: rotY,
      wallLength: lengthOverride || w.w,
      thickness: w.d
    };
    // GĐ6-fix2 A2: tường Nam khu 1/3 bị cắt — lề 1,2 m từ mép nẹp đầu tường (nẹp rộng 0,12 m)
    // và từ mặt trong tường xa (x = ±49,4)
    if (w.cutEnd) {
      const tx = Math.cos(rotY);
      const capX = w.x + (w.cutEnd === 'east' ? 1 : -1) * w.w / 2;
      const capU = (capX - w.x) / tx;
      const farX = w.x > 0 ? 49.4 : -49.4;
      const farU = (farX - w.x) / tx;
      const dir = Math.sign(farU - capU);
      const a = capU + dir * (0.06 + this.END_MARGIN);
      const b = farU - dir * this.END_MARGIN;
      cfg.capLimit = { min: Math.min(a, b), max: Math.max(a, b) };
      cfg.capU = capU;
    }
    return cfg;
  }

  // ===========================================================================
  // MAIN BUILD
  // ===========================================================================
  /** GĐ6-fix2 B1: đọc assets/anh_treo_tuong.json → { tenTuong: [item,…] } đúng thứ tự */
  collectAnhTreoTuong(itemById) {
    const out = {};
    const walls = this.anhTreoTuong?.tuong;
    if (!Array.isArray(walls)) {
      console.error('[khu4/6] Thiếu assets/anh_treo_tuong.json – không treo ảnh khu 4, khu 6 trên tường.');
      return out;
    }
    for (const w of walls) {
      const list = [];
      for (const a of w.thu_tu_anh || []) {
        const it = itemById.get(a.id);
        if (!it) { console.warn(`[${w.khu}] Thiếu ảnh ${a.id} trong room_data`); continue; }
        list.push(it);
      }
      if (w.so_anh && w.so_anh !== list.length) console.warn(`[${w.khu}] ${w.tuong}: file ghi ${w.so_anh} ảnh, đọc được ${list.length}`);
      out[w.tuong] = list;
    }
    return out;
  }

  // ===========================================================================
  // MAIN BUILD
  // ===========================================================================
  buildAllExhibits(roomData, onProgress) {
    const exhibitsGroup = new THREE.Group();
    exhibitsGroup.name = 'AllExhibits';
    this.mountedExhibits = [];
    this.faceMounts = {};
    this.khu3Report = { walls: [], sequence: [] };
    this.wallLayoutReport = [];
    this.boardRects = [];

    // GĐ5: Zone grouping cho Zone Culling (Mục E)
    this.zoneGroups = {
      khu1: new THREE.Group(),
      khu2: new THREE.Group(),
      khu3: new THREE.Group(),
      khu4: new THREE.Group(),
      khu6: new THREE.Group()
    };
    Object.entries(this.zoneGroups).forEach(([key, grp]) => {
      grp.name = `Exhibits_${key}`;
      exhibitsGroup.add(grp);
    });

    const items = roomData.items.filter(it => it.treo !== false);

    let totalCreated = 0;
    const totalCount = items.length;
    const onDone = () => {
      totalCreated++;
      if (onProgress) onProgress(totalCreated, totalCount);
    };

    // ===== PHÂN THEO KHU =====
    const khu1 = items.filter(it => it.khu === 'khu1')
      .sort((a, b) => a.year - b.year || (a.new_name || '').localeCompare(b.new_name || ''));
    const khu2 = items.filter(it => it.khu === 'khu2')
      .sort((a, b) => a.year - b.year || (a.new_name || '').localeCompare(b.new_name || ''));
    const khu3 = items.filter(it => it.khu === 'khu3')
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.year - b.year);
    const khu4 = items.filter(it => it.khu === 'khu4')
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.year - b.year);
    const khu6 = items.filter(it => it.khu === 'khu6')
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.year - b.year);

    // ======== KHU 1 · Ký ức & Tranh tặng ========
    const k1_atl = khu1.filter(it => it.source === 'anh_tu_lieu');
    const k1_tt = khu1.filter(it => it.source === 'tranh_tang');
    console.log(`khu1 ${k1_atl.length}+${k1_tt.length}`);

    // Tường xa x = −50
    const atl_far = k1_atl.slice(0, Math.min(40, k1_atl.length));
    const atl_rest = k1_atl.slice(atl_far.length);
    this.mountWall(this.wallCfgFromId('wall_k1_far', Math.PI / 2), atl_far, this.zoneGroups.khu1, onDone);

    // Tường Bắc z = −25
    if (atl_rest.length > 0) {
      this.mountWall(this.wallCfgFromId('wall_k1_north', 0), atl_rest, this.zoneGroups.khu1, onDone);
    }

    // Vách x = −35
    const tt_west = k1_tt.slice(0, 20);
    const tt_east = k1_tt.slice(20, 40);
    const tt_rest = k1_tt.slice(40);

    this.mountWall(this.wallCfgFromId('partition_k1', -Math.PI / 2), tt_west, this.zoneGroups.khu1, onDone);

    if (tt_east.length > 0) {
      this.mountWall(this.wallCfgFromId('partition_k1', Math.PI / 2), tt_east, this.zoneGroups.khu1, onDone);
    }

    if (tt_rest.length > 0) {
      this.mountWall(this.wallCfgFromId('wall_k1_south', Math.PI), tt_rest, this.zoneGroups.khu1, onDone);
    }

    // ======== KHU 2 · Bằng khen & Cờ ========
    const k2_giua = khu2.filter(it => it.tuong === 'giua');
    const k2_tay  = khu2.filter(it => it.tuong === 'tay');
    const k2_dong = khu2.filter(it => it.tuong === 'dong');
    const k2_unassigned = khu2.filter(it => !it.tuong);

    let giua_items = k2_giua;
    let tay_items = k2_tay;
    let dong_items = k2_dong;

    if (k2_unassigned.length > 0) {
      const bk = k2_unassigned.filter(it => it.source === 'bang_khen');
      const co = k2_unassigned.filter(it => it.source === 'co');
      const bk_honor = bk.filter(it => ['CTN', 'TTCP'].includes(it.org_code));
      const bk_central = bk.filter(it => ['BCT', 'EVN', 'TLDLDVN'].includes(it.org_code));
      const bk_tinh = bk.filter(it => ['UBND_BRVT', 'UBND_TPVT', 'DANGUY_BRVT', 'LDLD_BRVT', 'BHXH_BRVT', 'BCHQS_BRVT', 'SO_VHTTDL_BRVT'].includes(it.org_code));
      const bk_nganh = bk.filter(it => ['EVNSPC', 'CD_EVN', 'CD_EVNSPC', 'CD_BCT'].includes(it.org_code));
      const bk_other = bk.filter(it => !bk_honor.includes(it) && !bk_central.includes(it) && !bk_tinh.includes(it) && !bk_nganh.includes(it));
      const co3 = Math.ceil(co.length / 3);
      giua_items = [...giua_items, ...bk_honor, ...bk_central, ...co.slice(0, co3)];
      tay_items  = [...tay_items, ...bk_tinh, ...bk_other, ...co.slice(co3, co3 + Math.ceil((co.length - co3) / 2))];
      dong_items = [...dong_items, ...bk_nganh, ...co.slice(co3 + Math.ceil((co.length - co3) / 2))];
    }

    const k2_bk = khu2.filter(it => it.source === 'bang_khen');
    const k2_co = khu2.filter(it => it.source === 'co');
    console.log(`khu2 ${k2_bk.length} BK + ${k2_co.length} cờ (giữa ${giua_items.length} / tây ${tay_items.length} / đông ${dong_items.length})`);

    // Tường hậu z = −55
    this.mountWall(this.wallCfgFromId('wall_k2_back', 0, 32), giua_items, this.zoneGroups.khu2, onDone);

    // Tường Tây x = −18
    this.mountWall(this.wallCfgFromId('wall_k2_west', Math.PI / 2, 34), tay_items, this.zoneGroups.khu2, onDone);

    // Tường Đông x = 18
    this.mountWall(this.wallCfgFromId('wall_k2_east', -Math.PI / 2, 34), dong_items, this.zoneGroups.khu2, onDone);

    // ======== KHU 3 · Hiện tại (PCVT & Vách mốc son) ========
    console.log(`khu3 ${khu3.length}`);

    // Dựng vách mốc son partition_k3 (GĐ6-fix1 B4: không đổi vách và 14 ảnh trên đó)
    this.milestoneBuilder = new MilestoneWallBuilder(this.scene, this);
    this.milestoneBuilder.build(this.zoneGroups.khu3, items, onDone);

    // GĐ6-fix1 B: treo đúng thứ tự docs/khu3_bo_tri.json.
    // Đi xem: vào khu 3 → rẽ trái theo tường Bắc → sang tường xa → về tường Nam.
    const K3_WALLS = {
      wall_k3_north:      { id: 'wall_k3_north', rotY: 0 },
      wall_k3_far:        { id: 'wall_k3_far',   rotY: -Math.PI / 2 },
      wall_k3_south:      { id: 'wall_k3_south', rotY: Math.PI },
      wall_k3_south_half: { id: 'wall_k3_south', rotY: Math.PI },
    };
    const itemById = new Map(items.map(it => [it.id, it]));
    this.khu3WallTitles = {};
    let k3Seq = 0, k3Hung = 0;
    const k3Placed = new Set();
    if (this.khu3Layout && Array.isArray(this.khu3Layout.tuong)) {
      for (const wallDef of this.khu3Layout.tuong) {
        const spec = K3_WALLS[wallDef.tuong];
        if (!spec) { console.warn(`[khu3] Không biết tường ${wallDef.tuong}`); continue; }
        const wallItems = [];
        for (const a of wallDef.thu_tu_anh || []) {
          const it = itemById.get(a.id);
          if (!it) { console.warn(`[khu3] Thiếu ảnh ${a.id} trong room_data`); continue; }
          wallItems.push(it);
          k3Placed.add(it.id);
        }
        if (wallDef.so_anh && wallDef.so_anh !== wallItems.length) {
          console.warn(`[khu3] ${wallDef.tuong}: file ghi ${wallDef.so_anh} ảnh, đọc được ${wallItems.length}`);
        }
        k3Hung += this.mountWallColumns(
          this.wallCfgFromId(spec.id, spec.rotY),
          wallItems, this.zoneGroups.khu3, onDone, k3Seq
        );
        k3Seq += wallItems.length;
        this.khu3WallTitles[this.faceKeyOf(spec.id, spec.rotY)] = {
          title: wallDef.bang_tieu_de || '',
          sub: wallDef.dong_phu || ''
        };
      }
    } else {
      console.error('[khu3] Thiếu docs/khu3_bo_tri.json – không treo ảnh PCVT trên tường bao.');
    }
    const k3Leftover = khu3.filter(it => !it.vach_moc_son && !k3Placed.has(it.id));
    if (k3Leftover.length) {
      console.warn(`[khu3] ${k3Leftover.length} ảnh PCVT không có trong khu3_bo_tri.json (không treo):`, k3Leftover.map(i => i.id));
    }
    console.log(`[khu3] Đã treo ${k3Hung} ảnh PCVT trên 3 tường + ${khu3.filter(it => it.vach_moc_son).length} ảnh trên vách mốc son`);

    // ======== KHU 4 · Đảng bộ (GĐ6-fix2 B1: treo đúng assets/anh_treo_tuong.json, 1 tầng) ========
    console.log(`khu4 ${khu4.length}`);
    const k4k6 = this.collectAnhTreoTuong(itemById);
    this.khu46Counts = {};

    // Tường Đông x = 50
    this.khu46Counts.wall_k4_east = this.mountWallSingleRow(
      this.wallCfgFromId('wall_k4_east', -Math.PI / 2), k4k6.wall_k4_east || [], this.zoneGroups.khu4, onDone, 'khu4');

    // Tường Tây: mặt ngoài tường HCM Đông (x=22)
    this.khu46Counts.wall_k4_west_hcm = this.mountWallSingleRow({
      id: 'wall_k4_west_hcm',
      x: 22, z: 60, rotY: Math.PI / 2, wallLength: 40, thickness: WALL_THICKNESS
    }, k4k6.wall_k4_west_hcm || [], this.zoneGroups.khu4, onDone, 'khu4');

    // ======== KHU 6 · Công đoàn & Đoàn TN (GĐ6-fix2 B1) ========
    console.log(`khu6 ${khu6.length}`);

    // Tường Tây x = −50
    this.khu46Counts.wall_k6_west = this.mountWallSingleRow(
      this.wallCfgFromId('wall_k6_west', Math.PI / 2), k4k6.wall_k6_west || [], this.zoneGroups.khu6, onDone, 'khu6');

    // Tường Đông: mặt ngoài tường HCM Tây (x=−22)
    this.khu46Counts.wall_k6_east_hcm = this.mountWallSingleRow({
      id: 'wall_k6_east_hcm',
      x: -22, z: 60, rotY: -Math.PI / 2, wallLength: 40, thickness: WALL_THICKNESS
    }, k4k6.wall_k6_east_hcm || [], this.zoneGroups.khu6, onDone, 'khu6');
    console.log('[GD6-fix2] Số ảnh trên tường:', JSON.stringify({
      khu3: this.khu3Report.walls.map(w => `${w.wallId}:${w.items}`),
      khu4: [this.khu46Counts.wall_k4_east, this.khu46Counts.wall_k4_west_hcm],
      khu6: [this.khu46Counts.wall_k6_west, this.khu46Counts.wall_k6_east_hcm]
    }));

    // GĐ6-fix1 D1 + D2: bảng tiêu đề đứng giữa khối ảnh (không chạy suốt tường) + dải khẩu hiệu
    this.buildWallTitleBoards();

    this.scene.add(exhibitsGroup);

    // Ràng buộc kiểm tra tự động Section A & C
    this.rowGapErrors = this.assertRowGap();
    this.insideZoneErrors = this.assertInsideZone();
    this.framesOnWallErrors = this.assertFramesOnWall();

    // Báo cáo số lượng (Criterion 5)
    console.log(`khu1 ${k1_atl.length}+${k1_tt.length} · khu2 ${k2_bk.length} BK + ${k2_co.length} cờ (giữa ${giua_items.length} / tây ${tay_items.length} / đông ${dong_items.length}) · khu3 ${khu3.length} · khu4 ${khu4.length} · khu6 ${khu6.length} · tổng ${items.length}`);
    console.log(`Tổng hiện vật trên tường: ${totalCreated}`);

    return exhibitsGroup;
  }

  // ===========================================================================
  // GĐ6-fix1 D1 + D2: BẢNG TIÊU ĐỀ ĐỨNG GIỮA KHỐI ẢNH TỪNG MẶT TƯỜNG + DẢI KHẨU HIỆU
  //  - Rộng = clamp(0,45 × chiều dài khối ảnh, 8 m, 14 m) (partition_k1: tối đa 10 m), cao 1,10 m
  //    (partition_k1: 0,70 m), tâm y = 5,80 (partition_k1: 4,78). Không còn dải nền chạy suốt tường.
  //  - Canvas đúng tỷ lệ bảng: canvasW = 4096, canvasH = round(4096 × h / w). Nền, viền đôi,
  //    2 logo (0,75 × 0,75 m) và chữ vẽ trên CÙNG một canvas.
  //  - Tiêu đề ~0,30 m chữ hoa (fontPx ≈ 0,40/1,10 × canvasH, đậm 800); dòng phụ ~0,15 m (đậm 600).
  //    Tràn 80% bề rộng (trừ logo) → thu cỡ chữ, tối thiểu 70%; vẫn tràn → xuống 2 dòng.
  //  - Dải khẩu hiệu (khu 3, 4, 6): tâm y = 7,00, cao chữ ~0,28 m, rộng tối đa 70% đoạn tường.
  // ===========================================================================
  buildWallTitleBoards() {
    this.wallBanners = [];
    this.wallBoardInfo = [];

    const yearSpan = (faceKey) => {
      const ys = (this.faceMounts[faceKey]?.years || []).filter(y => y > 0);
      if (!ys.length) return '[CHỜ XÁC NHẬN]';
      const a = Math.min(...ys), b = Math.max(...ys);
      return a === b ? `${a}` : `${a} – ${b}`;
    };

    const COLORS = {
      khu1: { bg: '#F5EBD7', text: '#5B3A1E', border: '#8B6F47', sub: '#785336', slogan: '#5B3A1E' },
      khu2: { bg: '#8B1A1A', text: '#F6D26B', border: '#F6D26B', sub: '#FDE68A', slogan: '#8B1A1A' },
      khu3: { bg: '#FFFFFF', text: '#1E40A0', border: '#1E40A0', sub: '#475569', slogan: '#1E40A0' },
      khu4: { bg: '#B91C1C', text: '#FACC15', border: '#FACC15', sub: '#FEF08A', slogan: '#B91C1C' },
      khu6cd: { bg: '#FFFFFF', text: '#1D4ED8', border: '#1D4ED8', sub: '#475569', slogan: '#1D4ED8' },
      khu6dtn: { bg: '#FFFFFF', text: '#0EA5E9', border: '#0EA5E9', sub: '#475569', slogan: '#0EA5E9' },
    };

    const k3 = this.khu3WallTitles || {};
    const k3t = (fk, fallback) => k3[fk] || fallback;

    const fk = (id, rotY) => this.faceKeyOf(id, rotY);
    const configs = [
      // ---------------- KHU 1 (D2) ----------------
      // wall_k1_far: bảng chính khu 1 (12 × 2,2 m, tâm y 6,75) đã nằm giữa tường này → không thêm bảng
      // riêng để tránh chồng lên nhau (giống quy tắc tường hậu khu 2). Xem báo cáo GĐ6-fix1.
      { face: fk('wall_k1_north', 0), zone: 'khu1', colors: COLORS.khu1, logo: 'assets/logo.png',
        title: `ẢNH TƯ LIỆU ${yearSpan(fk('wall_k1_north', 0))}`, sub: 'Ký ức một chặng đường' },
      { face: fk('partition_k1', -Math.PI / 2), zone: 'khu1', colors: COLORS.khu1, logo: 'assets/logo.png',
        title: 'TRANH CÁC ĐƠN VỊ TRAO TẶNG', sub: 'Tình cảm của các đơn vị bạn', partition: true },
      { face: fk('partition_k1', Math.PI / 2), zone: 'khu1', colors: COLORS.khu1, logo: 'assets/logo.png',
        title: 'TRANH CÁC ĐƠN VỊ TRAO TẶNG', sub: 'Tình cảm của các đơn vị bạn', partition: true },
      { face: fk('wall_k1_south', Math.PI), zone: 'khu1', colors: COLORS.khu1, logo: 'assets/logo.png',
        title: 'TRANH CÁC ĐƠN VỊ TRAO TẶNG', sub: 'Tình cảm của các đơn vị bạn' },
      // ---------------- KHU 2 (D2) ----------------
      { face: fk('wall_k2_west', Math.PI / 2), zone: 'khu2', colors: COLORS.khu2, logo: 'assets/logo.png',
        title: `BẰNG KHEN – CỜ THI ĐUA ${yearSpan(fk('wall_k2_west', Math.PI / 2))}`, sub: 'Vinh quang những chặng đường' },
      { face: fk('wall_k2_east', -Math.PI / 2), zone: 'khu2', colors: COLORS.khu2, logo: 'assets/logo.png',
        title: `BẰNG KHEN – CỜ THI ĐUA ${yearSpan(fk('wall_k2_east', -Math.PI / 2))}`, sub: 'Vinh quang những chặng đường' },
      // ---------------- KHU 3 (mục B + D2) ----------------
      { face: fk('wall_k3_north', 0), zone: 'khu3', colors: COLORS.khu3, logo: 'assets/logo.png',
        ...k3t(fk('wall_k3_north', 0), { title: '', sub: '' }),
        slogan: 'CÔNG TY ĐIỆN LỰC VŨNG TÀU – VỮNG BƯỚC CÙNG EVNHCMC' },
      { face: fk('wall_k3_far', -Math.PI / 2), zone: 'khu3', colors: COLORS.khu3, logo: 'assets/logo.png',
        ...k3t(fk('wall_k3_far', -Math.PI / 2), { title: '', sub: '' }),
        slogan: 'LƯỚI ĐIỆN THÔNG MINH – DỊCH VỤ KHÁCH HÀNG HIỆN ĐẠI' },
      { face: fk('wall_k3_south', Math.PI), zone: 'khu3', colors: COLORS.khu3, logo: 'assets/logo.png',
        ...k3t(fk('wall_k3_south', Math.PI), { title: '', sub: '' }),
        slogan: 'ĐOÀN KẾT – ĐỔI MỚI – HIỆU QUẢ' },
      // ---------------- KHU 4 (GĐ6-fix2 B1: bỏ số ảnh cứng, logo búa liềm vàng) ----------------
      { face: fk('wall_k4_east', -Math.PI / 2), zone: 'khu4', colors: COLORS.khu4, logo: 'assets/logo/bua_liem_vang.png',
        title: '02/2026 – 04/2026 · Hoạt động Đảng bộ Công ty',
        sub: 'Về nguồn • Kết nạp đảng viên • Chi bộ Côn Đảo',
        slogan: 'ĐẢNG CỘNG SẢN VIỆT NAM QUANG VINH MUÔN NĂM' },
      { face: fk('wall_k4_west_hcm', Math.PI / 2), zone: 'khu4', colors: COLORS.khu4, logo: 'assets/logo/bua_liem_vang.png',
        title: '05/2026 – 08/2026 · Xây dựng Đảng bộ trong sạch, vững mạnh',
        sub: 'Học tập 65 sự kiện về Bác • Sơ kết 6 tháng • Tri ân 27/7 • Chi bộ 3 về nguồn',
        slogan: 'HỌC TẬP VÀ LÀM THEO TƯ TƯỞNG, ĐẠO ĐỨC, PHONG CÁCH HỒ CHÍ MINH' },
      // ---------------- KHU 6 (GĐ6-fix2 B1: bỏ số ảnh cứng) ----------------
      { face: fk('wall_k6_west', Math.PI / 2), zone: 'khu6', colors: COLORS.khu6cd, logo: 'assets/logo/logo_cong_doan.png',
        title: '08/2025 – 09/2026 · Công đoàn Công ty – chăm lo, đồng hành',
        sub: 'Bữa cơm Công đoàn • Ngày Phụ nữ 8/3 • Thể thao • Đêm hội trăng rằm',
        slogan: 'ĐOÀN KẾT – SÁNG TẠO – CHĂM LO – BẢO VỆ' },
      { face: fk('wall_k6_east_hcm', -Math.PI / 2), zone: 'khu6', colors: COLORS.khu6dtn, logo: 'assets/logo/logo_doan_tn.png',
        title: '10/2025 – 09/2026 · Tuổi trẻ PCVT xung kích, tình nguyện',
        sub: 'Đại hội đại biểu Đoàn • Xuân tình nguyện 2026 • Ngày Đoàn viên 26/3 • Về nguồn',
        slogan: 'TUỔI TRẺ PCVT – XUNG KÍCH, SÁNG TẠO, TÌNH NGUYỆN' },
    ];

    const maxAnis = window.app?.renderer?.capabilities?.getMaxAnisotropy?.() || 16;
    const measure = document.createElement('canvas').getContext('2d');

    for (const cfg of configs) {
      const face = this.faceMounts[cfg.face];
      if (!face || !cfg.title) {
        console.warn(`[buildWallTitleBoards] Bỏ qua ${cfg.face}: chưa có ảnh hoặc chưa có tiêu đề`);
        continue;
      }
      const wc = face.cfg;
      const blockLen = face.maxU - face.minU;
      const blockCenter = (face.maxU + face.minU) / 2;
      const isPart = !!cfg.partition;
      const boardH = isPart ? this.PARTITION_BOARD_H : this.WALL_BOARD_H;
      const boardY = isPart ? this.PARTITION_BOARD_Y : (cfg.zone === 'khu3' ? this.K3_BOARD_Y : this.WALL_BOARD_Y);
      const maxW = isPart ? 10 : 14;
      const boardW = Math.min(maxW, Math.max(8, 0.45 * blockLen));

      const nx = Math.sin(wc.rotY), nz = Math.cos(wc.rotY);
      const tx = Math.cos(wc.rotY), tz = -Math.sin(wc.rotY);
      const surf = wc.thickness / 2 + 0.05;
      const cx = wc.x + nx * surf + tx * blockCenter;
      const cz = wc.z + nz * surf + tz * blockCenter;

      const parentGroup = this.zoneGroups[cfg.zone] || this.scene;
      const group = new THREE.Group();
      group.position.set(cx, boardY, cz);
      group.rotation.y = wc.rotY;
      group.name = `WallTitleBoard_${cfg.face}`;

      // Tấm lưng mỏng (khung) phía sau
      const back = new THREE.Mesh(
        new THREE.BoxGeometry(boardW + 0.06, boardH + 0.06, 0.03),
        new THREE.MeshStandardMaterial({ color: cfg.colors.border, roughness: 0.45, metalness: 0.35 })
      );
      back.position.z = 0.015;
      group.add(back);

      // Canvas đúng tỷ lệ bảng
      const canvasW = 4096;
      const canvasH = Math.round(canvasW * boardH / boardW);
      const canvas = document.createElement('canvas');
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext('2d');
      const pxPerM = canvasW / boardW;

      const logoM = Math.min(0.75, boardH - 0.2);
      const logoPx = Math.round(logoM * pxPerM);
      const marginPx = Math.round(0.25 * pxPerM);
      const textAvail = canvasW - 2 * (marginPx + logoPx + marginPx);
      const limit = 0.80 * textAvail;

      const titleBase = Math.round(0.40 / 1.10 * canvasH);
      const subBase = Math.round(0.20 / 1.10 * canvasH);
      const fontT = (px) => `800 ${px}px ${FONT_FAMILY}`;
      const fontS = (px) => `600 ${px}px ${FONT_FAMILY}`;
      const widthOf = (txt, font) => { measure.font = font; return measure.measureText(txt).width; };

      // Tiêu đề: thu cỡ (≥ 70%), rồi xuống 2 dòng, rồi tiếp tục thu nếu cần (không bao giờ kéo giãn)
      let titlePx = titleBase;
      let titleLines = [cfg.title];
      while (widthOf(cfg.title, fontT(titlePx)) > limit && titlePx > Math.round(titleBase * 0.7)) titlePx -= 2;
      if (widthOf(cfg.title, fontT(titlePx)) > limit) {
        let l1, l2;
        const sep = cfg.title.indexOf(' · ');
        if (sep > 0) { l1 = cfg.title.slice(0, sep); l2 = cfg.title.slice(sep + 3); }
        else {
          const words = cfg.title.split(' ');
          const mid = Math.ceil(words.length / 2);
          l1 = words.slice(0, mid).join(' '); l2 = words.slice(mid).join(' ');
        }
        titleLines = [l1, l2];
        titlePx = Math.round(titleBase * 0.7);
        while (Math.max(widthOf(l1, fontT(titlePx)), widthOf(l2, fontT(titlePx))) > limit && titlePx > 12) titlePx -= 2;
      }
      let subPx = subBase;
      while (cfg.sub && widthOf(cfg.sub, fontS(subPx)) > limit && subPx > 12) subPx -= 2;

      const logoImg = new Image();
      let logoReady = false;
      const draw = () => {
        ctx.clearRect(0, 0, canvasW, canvasH);
        ctx.fillStyle = cfg.colors.bg;
        ctx.fillRect(0, 0, canvasW, canvasH);
        // Viền đôi
        const b1 = Math.max(6, Math.round(0.035 * pxPerM));
        ctx.strokeStyle = cfg.colors.border;
        ctx.lineWidth = b1;
        ctx.strokeRect(b1 / 2 + 4, b1 / 2 + 4, canvasW - b1 - 8, canvasH - b1 - 8);
        const inset = b1 + Math.round(0.03 * pxPerM);
        ctx.lineWidth = Math.max(2, Math.round(b1 * 0.35));
        ctx.strokeRect(inset, inset, canvasW - 2 * inset, canvasH - 2 * inset);

        // 2 logo trong bảng
        if (logoReady) {
          const ly = (canvasH - logoPx) / 2;
          const ar = logoImg.naturalWidth / Math.max(1, logoImg.naturalHeight);
          let dw = logoPx, dh = logoPx;
          if (ar > 1) dh = logoPx / ar; else dw = logoPx * ar;
          ctx.drawImage(logoImg, marginPx + (logoPx - dw) / 2, ly + (logoPx - dh) / 2, dw, dh);
          ctx.drawImage(logoImg, canvasW - marginPx - logoPx + (logoPx - dw) / 2, ly + (logoPx - dh) / 2, dw, dh);
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = cfg.colors.text;
        ctx.font = fontT(titlePx);
        if (titleLines.length === 1) {
          ctx.fillText(titleLines[0], canvasW / 2, canvasH * (cfg.sub ? 0.40 : 0.5));
        } else {
          ctx.fillText(titleLines[0], canvasW / 2, canvasH * 0.26);
          ctx.fillText(titleLines[1], canvasW / 2, canvasH * 0.52);
        }
        if (cfg.sub) {
          ctx.fillStyle = cfg.colors.sub;
          ctx.font = fontS(subPx);
          ctx.fillText(cfg.sub, canvasW / 2, canvasH * (titleLines.length === 1 ? 0.75 : 0.79));
        }
      };
      draw();

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAnis;
      logoImg.onload = () => { logoReady = true; draw(); tex.needsUpdate = true; };
      logoImg.src = cfg.logo;

      const textMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(boardW, boardH),
        new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide, toneMapped: false })
      );
      textMesh.position.z = 0.032;
      textMesh.name = `WallTitleBoard_Text_${cfg.face}`;
      textMesh.userData = { isTextPlane: true, planeW: boardW, planeH: boardH, canvasW, canvasH };
      group.add(textMesh);

      parentGroup.add(group);
      this.wallBanners.push(group);
      this.boardBottoms[cfg.face] = boardY - boardH / 2 - 0.03;
      this.boardRects.push({ face: cfg.face, kind: 'wallTitle', wallCfg: wc, u: blockCenter, w: boardW + 0.06, yMin: boardY - boardH / 2 - 0.03, yMax: boardY + boardH / 2 + 0.03 });
      this.wallBoardInfo.push({
        face: cfg.face, title: cfg.title, sub: cfg.sub, w: boardW, h: boardH, y: boardY,
        titlePx, subPx, titleLines: titleLines.length,
        titleCapM: +(titlePx / pxPerM * 0.72).toFixed(3),
        subCapM: +(subPx / pxPerM * 0.72).toFixed(3)
      });

      // ---------------- DẢI KHẨU HIỆU ----------------
      if (cfg.slogan) {
        const planeH = 0.55;
        const padM = 0.30;
        let fontM = 0.39; // cao chữ hoa ≈ 0,28 m
        const per100 = widthOf(cfg.slogan, `900 100px ${FONT_FAMILY}`) / 100; // px chữ / px cỡ
        let textM = per100 * fontM;
        const maxPlaneW = 0.70 * wc.wallLength;
        if (textM + 2 * padM > maxPlaneW) {
          fontM = (maxPlaneW - 2 * padM) / per100;
          textM = per100 * fontM;
        }
        const wantW = textM + 2 * padM;
        const sPxPerM = Math.min(400, 4096 / wantW);
        const sCanvasW = Math.round(wantW * sPxPerM);
        const sCanvasH = Math.round(planeH * sPxPerM);
        const sPlaneW = sCanvasW / sPxPerM;
        const sPlaneH = sCanvasH / sPxPerM;
        const sc = document.createElement('canvas');
        sc.width = sCanvasW;
        sc.height = sCanvasH;
        const sctx = sc.getContext('2d');
        sctx.fillStyle = cfg.colors.slogan;
        sctx.font = `900 ${Math.round(fontM * sPxPerM)}px ${FONT_FAMILY}`;
        sctx.textAlign = 'center';
        sctx.textBaseline = 'middle';
        sctx.fillText(cfg.slogan, sCanvasW / 2, sCanvasH / 2);
        const sTex = new THREE.CanvasTexture(sc);
        sTex.colorSpace = THREE.SRGBColorSpace;
        sTex.anisotropy = maxAnis;
        const sMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(sPlaneW, sPlaneH),
          new THREE.MeshBasicMaterial({ map: sTex, transparent: true, depthWrite: false, side: THREE.FrontSide })
        );
        const sSurf = wc.thickness / 2 + 0.03;
        const sloganY = cfg.zone === 'khu3' ? this.K3_SLOGAN_Y : this.SLOGAN_Y;
        sMesh.position.set(wc.x + nx * sSurf + tx * blockCenter, sloganY, wc.z + nz * sSurf + tz * blockCenter);
        sMesh.rotation.y = wc.rotY;
        sMesh.name = `WallSlogan_${cfg.face}`;
        sMesh.userData = { isTextPlane: true, planeW: sPlaneW, planeH: sPlaneH, canvasW: sCanvasW, canvasH: sCanvasH };
        parentGroup.add(sMesh);
        this.wallBanners.push(sMesh);
        this.boardRects.push({ face: cfg.face, kind: 'slogan', wallCfg: wc, u: blockCenter, w: sPlaneW, yMin: sloganY - sPlaneH / 2, yMax: sloganY + sPlaneH / 2 });
      }
    }

    console.log(`[buildWallTitleBoards] Đã dựng ${this.wallBoardInfo.length} bảng tiêu đề tường (khu 1, 2, 3, 4, 6):`);
    console.table(this.wallBoardInfo.map(b => ({
      mat: b.face, w: b.w.toFixed(2), h: b.h, y: b.y, dong: b.titleLines,
      chu_tieu_de_m: b.titleCapM, chu_phu_m: b.subCapM, tieu_de: b.title
    })));
  }

  // ===========================================================================
  // KIỂM TRA KHOẢNG HỞ TẦNG ẢNH (GĐ6-fix1 C)
  //  1. Khe giữa mép dưới biển tên tầng trên và mép trên khung tầng dưới ≥ 0,30 m
  //  2. Tường bao: mép dưới biển tên tầng dưới ≥ 1,95 m
  //  3. Mép trên khung tầng trên cách mép dưới bảng tiêu đề phía trên ≥ 0,25 m
  //  Biển tên: tâm = tâm khung − h/2 − 0,14, cao 0,15 → mép dưới = tâm − h/2 − 0,215
  //  Khung: mép trên = tâm + h/2 + 0,06 (viền khung)
  // ===========================================================================
  assertRowGap() {
    console.log('\n=== KIỂM TRA KHOẢNG HỞ TẦNG ẢNH (assertRowGap) ===');
    const faces = new Map();
    for (const ex of this.mountedExhibits) {
      const key = ex.faceKey || ex.wallId;
      if (!faces.has(key)) faces.set(key, []);
      faces.get(key).push(ex);
    }

    const errors = [];
    this.rowGapReport = [];
    for (const [faceKey, exhibits] of faces.entries()) {
      const ys = exhibits.map(e => e.posY);
      const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
      const twoRows = Math.max(...ys) - Math.min(...ys) > 0.5;
      const topRow = twoRows ? exhibits.filter(e => e.posY > midY) : exhibits;
      const bottomRow = twoRows ? exhibits.filter(e => e.posY <= midY) : [];
      const isPartition = faceKey.startsWith('partition_');

      const rec = { face: faceKey, rowGap: null, bottomPlaque: null, boardGap: null };

      // GĐ6-fix2 C: khu 3/4/6 dùng biển tên lớn (mép dưới = tâm − h/2 − 0,40); khu 1/2 giữ biển cũ (0,215)
      const bigPlaque = exhibits.some(e => this.usesBigPlaque(e.item));
      const drop = bigPlaque ? 0.40 : 0.215;
      const minGapReq = bigPlaque ? 0.25 : 0.30;
      const minLowReq = bigPlaque ? 1.80 : 1.95;

      if (bottomRow.length) {
        const minTopPlaqueBottom = Math.min(...topRow.map(t => t.posY - t.size.h / 2 - drop));
        const maxBottomFrameTop = Math.max(...bottomRow.map(b => b.posY + b.size.h / 2 + 0.06));
        rec.rowGap = minTopPlaqueBottom - maxBottomFrameTop;
        if (rec.rowGap < minGapReq - 1e-6) errors.push(`${faceKey}: khe giữa 2 tầng ${rec.rowGap.toFixed(3)} m < ${minGapReq.toFixed(2)} m`);
      }
      {
        const lowRow = bottomRow.length ? bottomRow : topRow;
        const minLowPlaque = Math.min(...lowRow.map(b => b.posY - b.size.h / 2 - drop));
        rec.bottomPlaque = minLowPlaque;
        if (!isPartition && minLowPlaque < minLowReq - 1e-6) {
          errors.push(`${faceKey}: mép dưới biển tên thấp nhất ${minLowPlaque.toFixed(3)} m < ${minLowReq.toFixed(2)} m`);
        }
      }

      const boardBottom = this.boardBottoms[faceKey];
      if (boardBottom !== undefined) {
        const maxTopFrameTop = Math.max(...topRow.map(t => t.posY + t.size.h / 2 + 0.06));
        rec.boardGap = boardBottom - maxTopFrameTop;
        if (rec.boardGap < 0.25 - 1e-6) errors.push(`${faceKey}: mép trên tầng trên cách bảng tiêu đề ${rec.boardGap.toFixed(3)} m < 0,25 m`);
      }

      this.rowGapReport.push(rec);
      const f = (v) => (v === null ? '—' : v.toFixed(3));
      console.log(`  - ${faceKey}: khe 2 tầng ${f(rec.rowGap)} m · mép dưới biển tên tầng dưới ${f(rec.bottomPlaque)} m · khe tới bảng tiêu đề ${f(rec.boardGap)} m`);
    }

    if (errors.length) {
      errors.forEach(e => console.warn(`[assertRowGap] ${e}`));
    }
    console.log(`=> KẾT QUẢ assertRowGap: ${errors.length} lỗi ${errors.length === 0 ? '✓ ĐẠT' : '✗'}\n`);
    return errors.length;
  }

  /** Khu 3/4/6 dùng biển tên lớn 0,30 m (GĐ6-fix2 C) */
  usesBigPlaque(item) {
    return ['khu3', 'khu4', 'khu6'].includes(item.khu);
  }

  // ===========================================================================
  // GĐ6-fix2 A: mọi khung/bảng phải nằm trong chiều dài thật của tường (lề 0,3 m)
  // và không chạm hộp va chạm của tường/vách/tủ khác
  // ===========================================================================
  assertFramesOnWall() {
    console.log('\n=== KIỂM TRA KHUNG TRÊN TƯỜNG (assertFramesOnWall) ===');
    const errors = [];
    const rectsOverlap = (a, b) => a.minX < b.maxX - 1e-6 && a.maxX > b.minX + 1e-6 && a.minZ < b.maxZ - 1e-6 && a.maxZ > b.minZ + 1e-6;
    const check = (label, cfg, u, halfW, posX, posZ) => {
      const phys = this.physicalLength(cfg);
      if (u - halfW < -phys / 2 + 0.3 - 1e-6 || u + halfW > phys / 2 - 0.3 + 1e-6) {
        errors.push(`${label}: u=${u.toFixed(2)} ±${halfW.toFixed(2)} vượt tường dài ${phys} m`);
      }
      const tx = Math.abs(Math.cos(cfg.rotY)), tz = Math.abs(Math.sin(cfg.rotY));
      const rect = {
        minX: posX - (tx * halfW + tz * 0.05), maxX: posX + (tx * halfW + tz * 0.05),
        minZ: posZ - (tz * halfW + tx * 0.05), maxZ: posZ + (tz * halfW + tx * 0.05)
      };
      const own = this.ownBoxIds(cfg);
      for (const b of this.collisionBoxes) {
        if (own.includes(b.id)) continue;
        if (rectsOverlap(rect, b)) { errors.push(`${label}: chạm hộp ${b.id}`); break; }
      }
    };
    for (const ex of this.mountedExhibits) {
      const cfg = this.faceMounts[ex.faceKey]?.cfg;
      if (!cfg) continue;
      const halfW = this.usesBigPlaque(ex.item)
        ? Math.max(ex.size.w + 0.12, 1.2) / 2 : ex.size.w / 2 + 0.06;
      check(`${ex.item.id}@${ex.wallId}`, cfg, ex.localOffset, halfW, ex.posX, ex.posZ);
    }
    for (const b of this.boardRects) {
      const cfg = b.wallCfg;
      if (!cfg) continue;
      const nx = Math.sin(cfg.rotY), nz = Math.cos(cfg.rotY);
      const tx = Math.cos(cfg.rotY), tz = -Math.sin(cfg.rotY);
      const off = cfg.thickness / 2 + 0.05;
      check(`bảng ${b.kind}@${cfg.id}`, cfg, b.u, b.w / 2,
        cfg.x + nx * off + tx * b.u, cfg.z + nz * off + tz * b.u);
    }
    errors.forEach(e => console.warn(`[assertFramesOnWall] ${e}`));
    console.log(`=> KẾT QUẢ assertFramesOnWall: ${errors.length} lỗi ${errors.length === 0 ? '✓ ĐẠT' : '✗'}\n`);
    this.framesOnWallDetails = errors;
    return errors.length;
  }

  // ===========================================================================
  // KIỂM TRA KHUNG NẰM TRONG VÙNG KHU (Section C)
  // ===========================================================================
  assertInsideZone() {
    console.log('=== KIỂM TRA PHÁP TUYẾN & VÙNG KHU (assertInsideZone) ===');
    const wrongCounts = { khu1: 0, khu2: 0, khu3: 0, khu4: 0, khu6: 0 };
    let totalErrors = 0;

    for (const ex of this.mountedExhibits) {
      const khu = ex.item.khu;
      const zoneCfg = ZONES[khu];
      if (!zoneCfg || !zoneCfg.bounds) continue;

      const nx = Math.sin(ex.rotY);
      const nz = Math.cos(ex.rotY);

      // Điểm kiểm tra: vị trí + pháp tuyến * 1.0m
      const testX = ex.posX + nx * 1.0;
      const testZ = ex.posZ + nz * 1.0;

      const bounds = zoneCfg.bounds;
      const margin = 0.15; // dung sai nhẹ ở mép tường
      const isInside = (
        testX >= bounds.minX - margin &&
        testX <= bounds.maxX + margin &&
        testZ >= bounds.minZ - margin &&
        testZ <= bounds.maxZ + margin
      );

      if (!isInside) {
        wrongCounts[khu] = (wrongCounts[khu] || 0) + 1;
        totalErrors++;
        console.warn(`[assertInsideZone] Khung ${ex.item.id} ở ${khu} bị sai mặt/vùng: testPoint=(${testX.toFixed(2)}, ${testZ.toFixed(2)}) ngoài bounds [${bounds.minX}, ${bounds.maxX}]x[${bounds.minZ}, ${bounds.maxZ}]`);
      }
    }

    console.log(`  Kết quả kiểm tra: khu1: ${wrongCounts.khu1} sai, khu2: ${wrongCounts.khu2} sai, khu3: ${wrongCounts.khu3} sai, khu4: ${wrongCounts.khu4} sai, khu6: ${wrongCounts.khu6} sai`);
    console.log(`=> KẾT QUẢ assertInsideZone: Tổng số khung sai = ${totalErrors} (Yêu cầu: 0) ${totalErrors === 0 ? '✓ ĐẠT' : '✗ THẤT BẠI'}\n`);
    return totalErrors;
  }

  // ===========================================================================
  // TẠO EXHIBIT (router)
  // ===========================================================================
  createExhibit(item, size, rotY) {
    return this.createFramedExhibit(item, size, rotY);
  }

  // ===========================================================================
  // KHUNG ẢNH / BẰNG KHEN / TRANH (Tối ưu 3 meshes: Frame + Pic + Plaque)
  // ===========================================================================
  createFramedExhibit(item, size, rotY) {
    const group = new THREE.Group();
    group.rotation.y = rotY;

    const { w, h, frameType } = size;
    const depth = 0.08;
    const isKhu3 = item.khu === 'khu3';
    const isHonor = frameType === 'gold_honor';

    let frameMat;
    if (isKhu3) {
      frameMat = this.matAluminumKhu3; // Nhôm #CBD5E1 không quầng sáng (Mục A.19)
    } else if (isHonor) {
      frameMat = this.matGoldFrame;
    } else {
      frameMat = this.matWoodFrame;
    }

    // 1. Mesh 1: Khung ngoài
    const frameW = w + 0.12;
    const frameH = h + 0.12;
    const frameMesh = new THREE.Mesh(new THREE.BoxGeometry(frameW, frameH, depth), frameMat);
    frameMesh.castShadow = true;
    group.add(frameMesh);

    // 2. Mesh 2: Ảnh
    const texture = this.getOrLoadTexture(item.wall_path);
    const picMat = new THREE.MeshStandardMaterial({
      map: texture, roughness: 0.4, metalness: 0.05,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    });
    const picMesh = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, h - 0.04), picMat);
    picMesh.position.z = depth / 2 + 0.006;
    group.add(picMesh);

    // 3. Mesh 3: Biển tên
    const big = this.usesBigPlaque(item) && !size.legacyPlaque;
    if (big) {
      this.addBigPlaque(group, item, w, h, depth, size.barColor);
    } else {
      const plaqueStyle = isKhu3 ? 'khu3' : ((frameType === 'cert_flag') ? 'flag' : 'cert');
      this.addPlaque(group, item, w, h, depth, plaqueStyle);
    }

    // Hitbox (MeshBasicMaterial { visible: false } -> 0 draw calls!)
    this.addHitbox(group, item, w, h, depth, frameMesh, big);

    group.name = `Exhibit_${item.id}`;
    return group;
  }

  // ===========================================================================
  // GĐ6-fix2 C: BIỂN TÊN LỚN khu 3/4/6 — rộng max(w+0,12; 1,2) m, cao 0,30 m, cách khung 0,04 m
  //  canvas cao 256 px; tiêu đề đậm #0F172A cao chữ ≈ 0,075 m (2 dòng 0,065); ngày dd/mm/yyyy #475569 ≈ 0,05 m
  // ===========================================================================
  addBigPlaque(group, item, w, h, depth, barColor) {
    const plaqueW = Math.max(w + 0.12, 1.2);
    const plaqueH = 0.30;
    const canvasH = 256;
    const pxPerM = canvasH / plaqueH;
    const canvasW = Math.round(canvasH * (plaqueW / plaqueH));
    const canvas = document.createElement('canvas');
    canvas.width = canvasW; canvas.height = canvasH;
    const ctx = canvas.getContext('2d');

    let bg = '#ffffff', bar = '#1E40A0';
    if (item.khu === 'khu4') { bg = '#FFF7E6'; bar = '#B91C1C'; }
    else if (item.khu === 'khu6') { bg = '#ffffff'; bar = barColor || '#1D4ED8'; }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = bar;
    ctx.fillRect(0, 0, 22, canvasH);
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, canvasW - 3, canvasH - 3);

    const cleanCaption = (item.tieu_de || item.caption || '').replace(/\[CHỜ XÁC NHẬN\]/g, '').trim();
    let title = cleanCaption, dateLine;
    if (item.source === 'bang_khen' || item.source === 'co') {
      title = item.org_name || item.org_code || cleanCaption;
      dateLine = `${item.year}`;
    } else if (item.date) {
      const p = item.date.split('-');
      dateLine = p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : item.date;
    } else {
      dateLine = item.year ? `${item.year}` : '';
    }
    if (!title) title = dateLine;

    const textL = 22 + 26, textR = canvasW - 26;
    const maxW = textR - textL, cx = (textL + textR) / 2;
    const fontFor = (capM) => Math.round(capM / 0.72 * pxPerM);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const tryFont = fontFor(0.075);
    ctx.font = `bold ${tryFont}px ${FONT_FAMILY}`;
    let lines = [title], fs = tryFont;
    if (ctx.measureText(title).width > maxW) {
      fs = fontFor(0.065);
      ctx.font = `bold ${fs}px ${FONT_FAMILY}`;
      const words = title.split(' ');
      let l1 = '', i = 0;
      while (i < words.length && ctx.measureText((l1 ? l1 + ' ' : '') + words[i]).width <= maxW) { l1 += (l1 ? ' ' : '') + words[i]; i++; }
      let l2 = words.slice(i).join(' ');
      if (!l1) { l1 = words[0]; l2 = words.slice(1).join(' '); }
      if (ctx.measureText(l2).width > maxW) {
        while (l2.length > 1 && ctx.measureText(l2 + '…').width > maxW) l2 = l2.slice(0, -1).trimEnd();
        l2 += '…';
      }
      lines = l2 ? [l1, l2] : [l1];
    }

    ctx.fillStyle = '#0F172A';
    ctx.font = `bold ${fs}px ${FONT_FAMILY}`;
    const dateFs = fontFor(0.05);
    if (lines.length === 2) {
      ctx.fillText(lines[0], cx, 46);
      ctx.fillText(lines[1], cx, 46 + fs * 1.02);
    } else {
      ctx.fillText(lines[0], cx, 78);
    }
    ctx.fillStyle = '#475569';
    ctx.font = `${dateFs}px ${FONT_FAMILY}`;
    ctx.fillText(dateLine, cx, lines.length === 2 ? 216 : 190);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = window.app?.renderer?.capabilities?.getMaxAnisotropy?.() || 16;
    const mat = new THREE.MeshStandardMaterial({
      map: tex, metalness: 0.0, roughness: 0.6,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(plaqueW, plaqueH), mat);
    // mép khung = h/2 + 0,06; cách 0,04 → tâm biển = −h/2 − 0,25
    mesh.position.set(0, -h / 2 - 0.25, depth / 2 + 0.008);
    mesh.name = `Plaque_${item.id}`;
    mesh.userData = { isTextPlane: true, isPlaque: true, planeW: plaqueW, planeH: plaqueH, canvasW, canvasH };
    group.add(mesh);
  }

  // ===========================================================================
  // BIỂN TÊN (Khu 3: dải trắng, chữ #0F172A, vạch trái #1E40A0)
  // ===========================================================================
  addPlaque(group, item, w, h, depth, style) {
    const isKhu3 = style === 'khu3';
    const isFlag = style === 'flag';

    const plaqueW = Math.max(w * 0.85, 0.65);
    const plaqueH = 0.15;
    const canvasH = 128;
    const canvasW = Math.round(canvasH * (plaqueW / plaqueH));

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');

    if (isKhu3) {
      // Khu 3: Dải trắng, vạch trái #1E40A0, viền #CBD5E1 (Mục A.20)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasW, 128);

      ctx.fillStyle = '#1e40a0';
      ctx.fillRect(4, 4, 18, 120);

      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 3;
      ctx.strokeRect(4, 4, canvasW - 8, 120);
    } else {
      const grad = ctx.createLinearGradient(0, 0, canvasW, 0);
      if (isFlag) {
        grad.addColorStop(0, '#7f1d1d');
        grad.addColorStop(0.5, '#b91c1c');
        grad.addColorStop(1, '#7f1d1d');
      } else {
        grad.addColorStop(0, '#78350f');
        grad.addColorStop(0.5, '#b45309');
        grad.addColorStop(1, '#78350f');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvasW, 128);

      ctx.strokeStyle = isFlag ? '#facc15' : '#fde047';
      ctx.lineWidth = 4;
      ctx.strokeRect(4, 4, canvasW - 8, 120);
    }

    // Xử lý chú thích: không bao giờ in [CHỜ XÁC NHẬN]
    let cleanCaption = (item.tieu_de || item.caption || '').replace(/\[CHỜ XÁC NHẬN\]/g, '').trim();

    let text;
    if (item.source === 'bang_khen' || item.source === 'co') {
      text = `${item.year} • ${item.org_name || item.org_code}`;
    } else if (item.date) {
      const parts = item.date.split('-');
      const dateDisplay = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : item.date;
      text = cleanCaption ? `${dateDisplay} • ${cleanCaption}` : dateDisplay;
    } else {
      text = cleanCaption || `${item.year}`;
    }

    const maxTextW = isKhu3 ? (canvasW - 70) : (canvasW - 50);
    const textCenterX = isKhu3 ? (canvasW / 2 + 10) : (canvasW / 2);
    ctx.fillStyle = isKhu3 ? '#0f172a' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (!isKhu3) {
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowOffsetY = 2;
      ctx.shadowBlur = 4;
    }

    let fontSize = 28;
    ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`;
    let textW = ctx.measureText(text).width;

    if (textW <= maxTextW) {
      ctx.fillText(text, textCenterX, 64);
    } else {
      while (textW > maxTextW && fontSize > 22) {
        fontSize -= 1;
        ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`;
        textW = ctx.measureText(text).width;
      }

      if (textW <= maxTextW) {
        ctx.fillText(text, textCenterX, 64);
      } else {
        const minFont = 20;
        ctx.font = `bold ${minFont}px ${FONT_FAMILY}`;
        let line1 = text;
        let line2 = '';
        if (text.includes(' • ')) {
          const splitIdx = text.indexOf(' • ');
          line1 = text.substring(0, splitIdx);
          line2 = text.substring(splitIdx + 3);
        } else {
          const words = text.split(' ');
          const mid = Math.ceil(words.length / 2);
          line1 = words.slice(0, mid).join(' ');
          line2 = words.slice(mid).join(' ');
        }
        while (ctx.measureText(line2).width > maxTextW && line2.length > 5) {
          line2 = line2.substring(0, line2.length - 2).trim();
          if (!line2.endsWith('…')) line2 += '…';
        }
        ctx.fillText(line1, textCenterX, 44);
        if (isKhu3) ctx.fillStyle = '#475569';
        ctx.fillText(line2, textCenterX, 86);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const maxAnis = window.app?.renderer?.capabilities?.getMaxAnisotropy?.() || 16;
    tex.anisotropy = maxAnis;
    const mat = new THREE.MeshStandardMaterial({
      map: tex, metalness: isKhu3 ? 0.2 : 0.7, roughness: 0.3,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(plaqueW, plaqueH), mat);
    mesh.position.set(0, -h / 2 - 0.14, depth / 2 + 0.008);
    mesh.name = `Plaque_${item.id}`;
    mesh.userData = {
      isTextPlane: true,
      planeW: plaqueW,
      planeH: plaqueH,
      canvasW: canvasW,
      canvasH: canvasH
    };
    group.add(mesh);
  }

  // ===========================================================================
  // HITBOX (tương tác)
  // ===========================================================================
  addHitbox(group, item, w, h, depth, highlightMesh, big = false) {
    // big: phủ cả khung + biển tên lớn (mép trên h/2+0,06 → mép dưới −h/2−0,40)
    const hitGeo = big
      ? new THREE.PlaneGeometry(Math.max(w + 0.12, 1.2), h + 0.46)
      : new THREE.PlaneGeometry(w + 0.1, h + 0.3);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    const hitMesh = new THREE.Mesh(hitGeo, hitMat);
    hitMesh.position.set(0, big ? -0.17 : -0.06, depth / 2 + 0.015);
    hitMesh.userData = {
      isExhibit: true,
      item: item,
      frameMesh: highlightMesh
    };
    group.add(hitMesh);
    this.exhibitMeshes.push(hitMesh);
    this.exhibitMap.set(item.id, group);
  }

  // ===========================================================================
  // KIỂM TRA TỰ ĐỘNG KHÔNG MÉO CHỮ (Mục A.5)
  // Duyệt mọi mesh có userData.isTextPlane.
  // Kiểm |planeW/planeH − canvas.width/canvas.height| / (canvas.width/canvas.height) < 2%
  // ===========================================================================
  assertNoStretchedText(scene = this.scene) {
    let totalChecked = 0;
    const errors = [];

    scene.traverse(node => {
      if (node.isMesh && node.userData && node.userData.isTextPlane) {
        totalChecked++;
        const canvas = node.material?.map?.image;
        const canvasW = canvas?.width || node.userData.canvasW;
        const canvasH = canvas?.height || node.userData.canvasH;
        const planeW = node.userData.planeW ?? node.geometry?.parameters?.width;
        const planeH = node.userData.planeH ?? node.geometry?.parameters?.height;

        if (!canvasW || !canvasH || !planeW || !planeH) {
          errors.push({
            name: node.name || 'unnamed',
            reason: 'Missing dimensions',
            planeW, planeH, canvasW, canvasH
          });
          return;
        }

        const planeAspect = planeW / planeH;
        const canvasAspect = canvasW / canvasH;
        const errorRatio = Math.abs(planeAspect - canvasAspect) / canvasAspect;

        if (errorRatio >= 0.02) {
          errors.push({
            name: node.name || 'unnamed',
            planeAspect: planeAspect.toFixed(4),
            canvasAspect: canvasAspect.toFixed(4),
            errorPercent: (errorRatio * 100).toFixed(2) + '%'
          });
        }
      }
    });

    console.log(`[assertNoStretchedText] Đã kiểm tra ${totalChecked} text planes. Số lỗi (>= 2%): ${errors.length}`);
    if (errors.length > 0) {
      console.error('[assertNoStretchedText] Phát hiện mesh text bị méo chữ:', errors);
    } else {
      console.log('✓ assertNoStretchedText: 0 lỗi! Toàn bộ text plane chuẩn tỷ lệ (< 2%).');
    }
    return errors.length;
  }
}
