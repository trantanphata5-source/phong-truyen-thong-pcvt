import * as THREE from 'three';
import { FONT_FAMILY } from './fonts.js';
import { WALLS, PARTITIONS, WALL_THICKNESS, PARTITION_THICKNESS, ZONES } from './layout-config.js';
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

    // GĐ3-fix2 thông số tầng ảnh
    // Vách ngăn đơn giữa khu (partition_k1): 3.10 / 1.50
    this.ROW_Y_TOP = 3.10;
    this.ROW_Y_BOTTOM = 1.50;
    // Các bức tường xung quanh bảo tàng nâng cao lên vừa tầm mắt người xem (eyeHeight 2.85m)
    this.OUTER_ROW_Y_TOP = 3.50;
    this.OUTER_ROW_Y_BOTTOM = 1.85;
    this.MIN_GAP = 0.35;
    this.END_MARGIN = 1.20;

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
    // Chiều cao ảnh khu 1, 3: 0.90
    if (khu === 'khu1' || khu === 'khu3') {
      const h = 0.90;
      return { w: h * ar, h, frameType: 'cert' };
    }
    // Chiều cao ảnh khu 4, 6: 1.00
    const h2 = 1.00;
    return { w: h2 * ar, h: h2, frameType: 'cert' };
  }

  // ===========================================================================
  // packRow — chia đều items dọc theo chiều dài tường với lề 1.2m mỗi đầu
  // ===========================================================================
  packRow(items, wallLength, wallId = '') {
    if (items.length === 0) return [];
    const n = items.length;
    const usableLength = Math.max(1.0, wallLength - 2 * this.END_MARGIN);

    let scale = 1.0;
    let sizes = items.map(it => this.getFrameSize(it));

    if (n === 1) {
      return [{ item: items[0], size: sizes[0], offset: 0 }];
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
    let cursor = -wallLength / 2 + this.END_MARGIN;
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
      const packed = this.packRow(rowItems, wallLength, wallId);
      for (const { item, size, offset: localOffset } of packed) {
        const posX = baseX + nx * standOff + tx * localOffset;
        const posZ = baseZ + nz * standOff + tz * localOffset;
        const exhibit = this.createExhibit(item, size, rotY);
        exhibit.position.set(posX, y, posZ);
        parent.add(exhibit);

        this.mountedExhibits.push({
          exhibit,
          item,
          size,
          rotY,
          posX,
          posY: y,
          posZ,
          wallId: wallId || 'custom_wall'
        });

        if (onDone) onDone();
      }
    };

    // Tường đơn giữa khu (partition_k1) giữ mức cũ 3.10 / 1.50
    // Các bức tường xung quanh bảo tàng nâng cao lên vừa tầm mắt người xem: 3.50 / 1.85
    const isPartition = wallId === 'partition_k1' || (wallId && wallId.startsWith('partition_'));
    const yTop = isPartition ? this.ROW_Y_TOP : this.OUTER_ROW_Y_TOP;
    const yBottom = isPartition ? this.ROW_Y_BOTTOM : this.OUTER_ROW_Y_BOTTOM;

    mountRow(topItems, yTop);
    mountRow(bottomItems, yBottom);
  }

  // ===========================================================================
  // Helper: lấy wallCfg từ layout-config WALLS
  // ===========================================================================
  wallCfgFromId(wallId, rotY, lengthOverride) {
    const w = this.wallIndex[wallId];
    if (!w) { console.warn(`Wall ${wallId} not found`); return null; }
    return {
      id: wallId,
      x: w.x, z: w.z,
      rotY: rotY,
      wallLength: lengthOverride || w.w,
      thickness: w.d
    };
  }

  // ===========================================================================
  // MAIN BUILD
  // ===========================================================================
  buildAllExhibits(roomData, onProgress) {
    const exhibitsGroup = new THREE.Group();
    exhibitsGroup.name = 'AllExhibits';
    this.mountedExhibits = [];

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

    // Dựng vách mốc son partition_k3
    this.milestoneBuilder = new MilestoneWallBuilder(this.scene, this);
    this.milestoneBuilder.build(this.zoneGroups.khu3, items, onDone);

    // Các ảnh PCVT còn lại treo 2 tầng trên tường ngoài
    const pcvt_normal = khu3.filter(it => !it.vach_moc_son);

    // Tường xa x = 50
    const pcvt_far = pcvt_normal.slice(0, 34);
    this.mountWall(this.wallCfgFromId('wall_k3_far', -Math.PI / 2, 44), pcvt_far, this.zoneGroups.khu3, onDone);

    // Tường Bắc z = −25 và Nam z = 25
    const pcvt_rest = pcvt_normal.slice(34);
    const pcvt_n_wall = pcvt_rest.slice(0, Math.ceil(pcvt_rest.length / 2));
    const pcvt_s_wall = pcvt_rest.slice(pcvt_n_wall.length);

    if (pcvt_n_wall.length > 0) {
      this.mountWall(this.wallCfgFromId('wall_k3_north', 0, 26), pcvt_n_wall, this.zoneGroups.khu3, onDone);
    }
    if (pcvt_s_wall.length > 0) {
      this.mountWall(this.wallCfgFromId('wall_k3_south', Math.PI, 26), pcvt_s_wall, this.zoneGroups.khu3, onDone);
    }

    // ======== KHU 4 · Đảng bộ ========
    const khu4_normal = khu4.filter(it => !it.vach_moc_son);
    console.log(`khu4 ${khu4.length}`);

    const db_east = khu4_normal.slice(0, 26);
    const db_west = khu4_normal.slice(26);

    // Tường Đông x = 50
    this.mountWall(this.wallCfgFromId('wall_k4_east', -Math.PI / 2), db_east, this.zoneGroups.khu4, onDone);

    // Tường Tây: mặt ngoài tường HCM Đông (x=22)
    if (db_west.length > 0) {
      this.mountWall({
        id: 'wall_k4_west_hcm',
        x: 22, z: 60, rotY: Math.PI / 2, wallLength: 40, thickness: WALL_THICKNESS
      }, db_west, this.zoneGroups.khu4, onDone);
    }

    // ======== KHU 6 · Công đoàn & Đoàn TN ========
    const k6_cd = khu6.filter(it => it.source === 'cong_doan' && !it.vach_moc_son);
    const k6_dtn = khu6.filter(it => it.source === 'doan_tn' && !it.vach_moc_son);
    console.log(`khu6 ${k6_cd.length}+${k6_dtn.length}`);

    // Tường Tây x = −50
    this.mountWall(this.wallCfgFromId('wall_k6_west', Math.PI / 2), k6_cd, this.zoneGroups.khu6, onDone);

    // Tường Đông: mặt ngoài tường HCM Tây (x=−22)
    this.mountWall({
      id: 'wall_k6_east_hcm',
      x: -22, z: 60, rotY: -Math.PI / 2, wallLength: 40, thickness: WALL_THICKNESS
    }, k6_dtn, this.zoneGroups.khu6, onDone);

    this.scene.add(exhibitsGroup);

    // Ràng buộc kiểm tra tự động Section A & C
    this.assertRowGap();
    this.assertInsideZone();

    // Báo cáo số lượng (Criterion 5)
    console.log(`khu1 ${k1_atl.length}+${k1_tt.length} · khu2 ${k2_bk.length} BK + ${k2_co.length} cờ (giữa ${giua_items.length} / tây ${tay_items.length} / đông ${dong_items.length}) · khu3 ${khu3.length} · khu4 ${khu4.length} · khu6 ${k6_cd.length}+${k6_dtn.length} · tổng 433`);
    console.log(`Tổng hiện vật trên tường: ${totalCreated}`);

    return exhibitsGroup;
  }

  // ===========================================================================
  // KIỂM TRA RÀNG BUỘC KHOẢNG CÁCH TẦNG ẢNH (Section A)
  // ===========================================================================
  assertRowGap() {
    console.log('\n=== KIỂM TRA RÀNG BUỘC KHOẢNG CÁCH TẦNG ẢNH (assertRowGap) ===');
    const wallGroups = new Map();
    for (const ex of this.mountedExhibits) {
      if (!wallGroups.has(ex.wallId)) wallGroups.set(ex.wallId, []);
      wallGroups.get(ex.wallId).push(ex);
    }

    let allPassed = true;
    for (const [wallId, exhibits] of wallGroups.entries()) {
      const topRow = exhibits.filter(e => e.posY >= 2.5);
      const bottomRow = exhibits.filter(e => e.posY < 2.5);

      if (topRow.length === 0 || bottomRow.length === 0) continue;

      // Tìm mép dưới thấp nhất của biển tên tầng trên
      // Plaque center = ROW_Y_TOP - h/2 - 0.14, plaqueH = 0.15 => bottom = ROW_Y_TOP - h/2 - 0.215
      let minPlaqueBottom = 999;
      for (const t of topRow) {
        const pBottom = t.posY - t.size.h / 2 - 0.215;
        if (pBottom < minPlaqueBottom) minPlaqueBottom = pBottom;
      }

      // Tìm mép trên cao nhất của khung tầng dưới
      // Frame top = ROW_Y_BOTTOM + h/2 + 0.06 (tính cả viền khung 0.06m)
      let maxFrameTop = -999;
      for (const b of bottomRow) {
        const fTop = b.posY + b.size.h / 2 + 0.06;
        if (fTop > maxFrameTop) maxFrameTop = fTop;
      }

      const gap = minPlaqueBottom - maxFrameTop;
      const status = gap >= 0.30 ? 'ĐẠT ✓' : 'CẢNH BÁO ✗';
      console.log(`  - Tường ${wallId}: khoảng trống dọc = ${gap.toFixed(3)}m (${status}, yêu cầu >= 0.30m)`);

      if (gap < 0.30) {
        console.warn(`[assertRowGap] CẢNH BÁO: Tường ${wallId} có khoảng trống ${gap.toFixed(3)}m < 0.30m!`);
        allPassed = false;
      }
    }

    if (allPassed) {
      console.log('=> KẾT QUẢ assertRowGap: 100% TƯỜNG ĐẠT CHUẨN >= 0.30M!\n');
    }
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
    const plaqueStyle = isKhu3 ? 'khu3' : ((frameType === 'cert_flag') ? 'flag' : 'cert');
    this.addPlaque(group, item, w, h, depth, plaqueStyle);

    // Hitbox (MeshBasicMaterial { visible: false } -> 0 draw calls!)
    this.addHitbox(group, item, w, h, depth, frameMesh);

    group.name = `Exhibit_${item.id}`;
    return group;
  }

  // ===========================================================================
  // BIỂN TÊN (Khu 3: dải trắng, chữ #0F172A, vạch trái #1E40A0)
  // ===========================================================================
  addPlaque(group, item, w, h, depth, style) {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    const isKhu3 = style === 'khu3';
    const isFlag = style === 'flag';

    if (isKhu3) {
      // Khu 3: Dải trắng, vạch trái #1E40A0, viền #CBD5E1 (Mục A.20)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 640, 128);

      ctx.fillStyle = '#1e40a0';
      ctx.fillRect(4, 4, 18, 120);

      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 3;
      ctx.strokeRect(4, 4, 632, 120);
    } else {
      const grad = ctx.createLinearGradient(0, 0, 640, 0);
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
      ctx.fillRect(0, 0, 640, 128);

      ctx.strokeStyle = isFlag ? '#facc15' : '#fde047';
      ctx.lineWidth = 4;
      ctx.strokeRect(4, 4, 632, 120);
    }

    // Xử lý chú thích: không bao giờ in [CHỜ XÁC NHẬN]
    let cleanCaption = (item.caption || '').replace(/\[CHỜ XÁC NHẬN\]/g, '').trim();

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

    const maxTextW = isKhu3 ? 570 : 590;
    const textCenterX = isKhu3 ? 330 : 320;
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
    const mat = new THREE.MeshStandardMaterial({
      map: tex, metalness: isKhu3 ? 0.2 : 0.7, roughness: 0.3,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    });
    const plaqueW = Math.max(w * 0.85, 0.65);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(plaqueW, 0.15), mat);
    mesh.position.set(0, -h / 2 - 0.14, depth / 2 + 0.008);
    group.add(mesh);
  }

  // ===========================================================================
  // HITBOX (tương tác)
  // ===========================================================================
  addHitbox(group, item, w, h, depth, highlightMesh) {
    const hitGeo = new THREE.PlaneGeometry(w + 0.1, h + 0.3);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    const hitMesh = new THREE.Mesh(hitGeo, hitMat);
    hitMesh.position.set(0, -0.06, depth / 2 + 0.015);
    hitMesh.userData = {
      isExhibit: true,
      item: item,
      frameMesh: highlightMesh
    };
    group.add(hitMesh);
    this.exhibitMeshes.push(hitMesh);
    this.exhibitMap.set(item.id, group);
  }
}
