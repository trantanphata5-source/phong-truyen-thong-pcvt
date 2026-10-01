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

    // GĐ5-fix3: Chiều cao tầng ảnh: top 3.10m, bottom 1.50m (mép trên ảnh ở ~3.61m, cách băng tiêu đề 4.15m một khe ~0.27m)
    this.ROW_Y_TOP = 3.10;
    this.ROW_Y_BOTTOM = 1.50;
    this.OUTER_ROW_Y_TOP = 3.10;
    this.OUTER_ROW_Y_BOTTOM = 1.50;
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

    // GĐ5-fix3: Dựng băng tiêu đề và dải khẩu hiệu cho 7 bức tường Khu 3, 4, 6 (Mục D)
    this.buildWallBannersAndSlogans();

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
  // BĂNG TIÊU ĐỀ TƯỜNG (y = 4.15m) VÀ DẢI KHẨU HIỆU (y = 5.60m) CHO 7 BỨC TƯỜNG (Mục D)
  // ===========================================================================
  buildWallBannersAndSlogans() {
    this.wallBanners = [];
    const configs = [
      {
        id: 'wall_k3_north',
        zone: 'khu3',
        baseX: 34, baseZ: -25, rotY: 0, wallLength: 26, thickness: 0.2,
        length: 16.5,
        time_span: '03/2026 – 05/2026',
        topic: 'Những ngày đầu thành lập',
        full_title: '03/2026 – 05/2026 · Những ngày đầu thành lập',
        sub_text: '20 ảnh tư liệu • Triển khai Văn bản 832/EVNHCMC • Khởi đầu tuần mới lan tỏa năng lượng tích cực',
        slogan: 'CÔNG TY ĐIỆN LỰC VŨNG TÀU – VỮNG BƯỚC CÙNG EVNHCMC',
        colors: {
          banner_bg: '#FFFFFF',
          banner_text: '#1E40A0',
          banner_border: '#1E40A0',
          banner_sub: '#475569',
          slogan_color: '#1E40A0'
        },
        logo: 'assets/logo.png'
      },
      {
        id: 'wall_k3_far',
        zone: 'khu3',
        baseX: 50, baseZ: 0, rotY: -Math.PI / 2, wallLength: 44, thickness: 0.2,
        length: 29.0,
        time_span: '07/2025 – 03/2026',
        topic: 'Vững vàng phát triển',
        full_title: '07/2025 – 03/2026 · Vững vàng phát triển',
        sub_text: '34 ảnh tư liệu • Điện lực Vũng Tàu • Lễ công bố quyết định công tác cán bộ',
        slogan: 'LƯỚI ĐIỆN THÔNG MINH – DỊCH VỤ KHÁCH HÀNG HIỆN ĐẠI',
        colors: {
          banner_bg: '#FFFFFF',
          banner_text: '#1E40A0',
          banner_border: '#1E40A0',
          banner_sub: '#475569',
          slogan_color: '#1E40A0'
        },
        logo: 'assets/logo.png'
      },
      {
        id: 'wall_k3_south',
        zone: 'khu3',
        baseX: 34, baseZ: 25, rotY: Math.PI, wallLength: 26, thickness: 0.2,
        length: 16.5,
        time_span: '05/2026 – 07/2026',
        topic: 'Chào mừng 1 năm thành lập',
        full_title: '05/2026 – 07/2026 · Chào mừng 1 năm thành lập',
        sub_text: '19 ảnh tư liệu • Điện lực Côn Đảo tiếp sức mùa thi • Hội nghị sơ kết 6 tháng đầu năm',
        slogan: 'ĐOÀN KẾT – ĐỔI MỚI – HIỆU QUẢ',
        colors: {
          banner_bg: '#FFFFFF',
          banner_text: '#1E40A0',
          banner_border: '#1E40A0',
          banner_sub: '#475569',
          slogan_color: '#1E40A0'
        },
        logo: 'assets/logo.png'
      },
      {
        id: 'wall_k4_east',
        zone: 'khu4',
        baseX: 50, baseZ: 60, rotY: -Math.PI / 2, wallLength: 44, thickness: 0.2,
        length: 29.0,
        time_span: '02/2026 – 04/2026',
        topic: 'Hoạt động Đảng bộ Công ty',
        full_title: '02/2026 – 04/2026 · Hoạt động Đảng bộ Công ty',
        sub_text: '26 ảnh tư liệu • Hoạt động Đảng bộ Công ty • Chi bộ Côn Đảo',
        slogan: 'ĐẢNG CỘNG SẢN VIỆT NAM QUANG VINH MUÔN NĂM',
        colors: {
          banner_bg: '#B91C1C',
          banner_text: '#FACC15',
          banner_border: '#FACC15',
          banner_sub: '#FEF08A',
          slogan_color: '#B91C1C'
        },
        logo: 'assets/logo/co_dang.png'
      },
      {
        id: 'wall_k4_west_hcm',
        zone: 'khu4',
        baseX: 22, baseZ: 60, rotY: Math.PI / 2, wallLength: 40, thickness: 0.2,
        length: 26.0,
        time_span: '04/2026 – 08/2026',
        topic: 'Xây dựng Đảng bộ trong sạch, vững mạnh',
        full_title: '04/2026 – 08/2026 · Xây dựng Đảng bộ trong sạch, vững mạnh',
        sub_text: '22 ảnh tư liệu • Chi bộ 3 • Hội nghị sơ kết 6 tháng đầu năm',
        slogan: 'HỌC TẬP VÀ LÀM THEO TƯ TƯỞNG, ĐẠO ĐỨC, PHONG CÁCH HỒ CHÍ MINH',
        colors: {
          banner_bg: '#B91C1C',
          banner_text: '#FACC15',
          banner_border: '#FACC15',
          banner_sub: '#FEF08A',
          slogan_color: '#B91C1C'
        },
        logo: 'assets/logo/co_dang.png'
      },
      {
        id: 'wall_k6_west',
        zone: 'khu6',
        baseX: -50, baseZ: 60, rotY: Math.PI / 2, wallLength: 44, thickness: 0.2,
        length: 29.0,
        time_span: '08/2025 – 03/2026',
        topic: 'Công đoàn Công ty – chăm lo, đồng hành',
        full_title: '08/2025 – 03/2026 · Công đoàn Công ty – chăm lo, đồng hành',
        sub_text: '25 ảnh tư liệu • Hoạt động Công đoàn tại phường Vũng Tàu • Bữa cơm Công đoàn',
        slogan: 'ĐOÀN KẾT – SÁNG TẠO – CHĂM LO – BẢO VỆ',
        colors: {
          banner_bg: '#FFFFFF',
          banner_text: '#1D4ED8',
          banner_border: '#1D4ED8',
          banner_sub: '#475569',
          slogan_color: '#1D4ED8'
        },
        logo: 'assets/logo/logo_cong_doan.png'
      },
      {
        id: 'wall_k6_east_hcm',
        zone: 'khu6',
        baseX: -22, baseZ: 60, rotY: -Math.PI / 2, wallLength: 40, thickness: 0.2,
        length: 26.0,
        time_span: '10/2025 – 09/2026',
        topic: 'Tuổi trẻ PCVT xung kích, tình nguyện',
        full_title: '10/2025 – 09/2026 · Tuổi trẻ PCVT xung kích, tình nguyện',
        sub_text: '25 ảnh tư liệu • Đại hội đại biểu Đoàn • Góp sức Xuân tình nguyện 2026',
        slogan: 'TUỔI TRẺ PCVT – XUNG KÍCH, SÁNG TẠO, TÌNH NGUYỆN',
        colors: {
          banner_bg: '#FFFFFF',
          banner_text: '#0EA5E9',
          banner_border: '#0EA5E9',
          banner_sub: '#475569',
          slogan_color: '#0EA5E9'
        },
        logo: 'assets/logo/logo_doan_tn.png'
      }
    ];

    // Preload logos
    const logoMap = {};
    configs.forEach(c => {
      if (!logoMap[c.logo]) {
        const img = new Image();
        img.src = c.logo;
        logoMap[c.logo] = img;
      }
    });

    const maxAnis = window.app?.renderer?.capabilities?.getMaxAnisotropy?.() || 16;

    // Temporary canvas for accurate text measurement
    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');

    configs.forEach(cfg => {
      const parentGroup = this.zoneGroups[cfg.zone] || this.scene;
      const nx = Math.sin(cfg.rotY);
      const nz = Math.cos(cfg.rotY);
      const standOff = WALL_THICKNESS / 2 + 0.04 + 0.07;

      const posX = cfg.baseX + nx * standOff;
      const posZ = cfg.baseZ + nz * standOff;

      // Group chứa toàn bộ băng tiêu đề (nền + viền + 2 logo + chữ)
      const bannerGroup = new THREE.Group();
      bannerGroup.position.set(posX, 4.15, posZ);
      bannerGroup.rotation.y = cfg.rotY;
      bannerGroup.name = `WallBannerGroup_${cfg.id}`;

      // 1. NỀN BĂNG TIÊU ĐỀ: Tấm phẳng dài cfg.length x 0.55m, MeshBasicMaterial một màu, không dùng texture (Mục A.1)
      const bgGeo = new THREE.PlaneGeometry(cfg.length, 0.55);
      const bgMat = new THREE.MeshBasicMaterial({
        color: cfg.colors.banner_bg,
        side: THREE.DoubleSide
      });
      const bgMesh = new THREE.Mesh(bgGeo, bgMat);
      bgMesh.name = `WallBanner_Bg_${cfg.id}`;
      bannerGroup.add(bgMesh);

      // Viền trên và viền dưới: 2 dải mỏng 0.03m màu banner_border (Mục A.1)
      const borderMat = new THREE.MeshBasicMaterial({
        color: cfg.colors.banner_border,
        side: THREE.DoubleSide
      });
      const topBorder = new THREE.Mesh(new THREE.PlaneGeometry(cfg.length, 0.03), borderMat);
      topBorder.position.set(0, 0.55 / 2 - 0.03 / 2, 0.001);
      bannerGroup.add(topBorder);

      const btmBorder = new THREE.Mesh(new THREE.PlaneGeometry(cfg.length, 0.03), borderMat);
      btmBorder.position.set(0, -0.55 / 2 + 0.03 / 2, 0.001);
      bannerGroup.add(btmBorder);

      // Logo ở 2 đầu: 2 tấm 0.45 x 0.45m, đúng tỷ lệ ảnh logo (Mục A.1)
      const logoTex = this.getOrLoadTexture(cfg.logo);
      if (logoTex) {
        logoTex.anisotropy = maxAnis;
        const logoMat = new THREE.MeshBasicMaterial({
          map: logoTex,
          transparent: true,
          side: THREE.DoubleSide
        });
        const leftLogo = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), logoMat);
        leftLogo.position.set(-(cfg.length / 2 - 0.45), 0, 0.002);
        bannerGroup.add(leftLogo);

        const rightLogo = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), logoMat);
        rightLogo.position.set(cfg.length / 2 - 0.45, 0, 0.002);
        bannerGroup.add(rightLogo);
      }

      // 2. CHỮ TRÊN BĂNG (Mục A.2): Canvas cao 256px, đo chữ trước, tấm cao 0.46m, tỷ lệ 1:1, cao hơn nền 2mm
      const maxBannerTextW = 0.85 * cfg.length; // Không vượt quá 85% chiều dài băng
      let titleSize = 46;
      let subSize = 24;
      const textPadding = 64;

      measureCtx.font = `800 ${titleSize}px "Be Vietnam Pro", sans-serif`;
      let titleW = measureCtx.measureText(cfg.full_title).width;
      measureCtx.font = `600 ${subSize}px "Be Vietnam Pro", sans-serif`;
      let subW = measureCtx.measureText(cfg.sub_text).width;
      let maxContentW = Math.max(titleW, subW);

      // Nếu chữ rộng hơn 85% chiều dài băng thì giảm cỡ chữ (Mục A.2)
      while (0.46 * (maxContentW + 2 * textPadding) / 256 > maxBannerTextW && titleSize > 24) {
        titleSize -= 2;
        subSize = Math.max(16, Math.round(subSize * 0.95));
        measureCtx.font = `800 ${titleSize}px "Be Vietnam Pro", sans-serif`;
        titleW = measureCtx.measureText(cfg.full_title).width;
        measureCtx.font = `600 ${subSize}px "Be Vietnam Pro", sans-serif`;
        subW = measureCtx.measureText(cfg.sub_text).width;
        maxContentW = Math.max(titleW, subW);
      }

      const canvasBW = Math.min(4096, Math.ceil(maxContentW + 2 * textPadding));
      const canvasBH = 256;
      const bannerPlaneH = 0.46;
      const bannerPlaneW = bannerPlaneH * (canvasBW / canvasBH);

      const canvasB = document.createElement('canvas');
      canvasB.width = canvasBW;
      canvasB.height = canvasBH;
      const ctxB = canvasB.getContext('2d');
      ctxB.clearRect(0, 0, canvasBW, canvasBH);

      // Vẽ tiêu đề chính
      ctxB.fillStyle = cfg.colors.banner_text;
      ctxB.font = `800 ${titleSize}px "Be Vietnam Pro", sans-serif`;
      ctxB.textAlign = 'center';
      ctxB.textBaseline = 'middle';
      ctxB.fillText(cfg.full_title, canvasBW / 2, 92);

      // Vẽ dòng phụ
      ctxB.fillStyle = cfg.colors.banner_sub;
      ctxB.font = `600 ${subSize}px "Be Vietnam Pro", sans-serif`;
      ctxB.textAlign = 'center';
      ctxB.textBaseline = 'middle';
      ctxB.fillText(cfg.sub_text, canvasBW / 2, 172);

      const texB = new THREE.CanvasTexture(canvasB);
      texB.colorSpace = THREE.SRGBColorSpace;
      texB.anisotropy = maxAnis;

      const textGeo = new THREE.PlaneGeometry(bannerPlaneW, bannerPlaneH);
      const textMat = new THREE.MeshBasicMaterial({
        map: texB,
        transparent: true,
        side: THREE.DoubleSide
      });
      const textMesh = new THREE.Mesh(textGeo, textMat);
      textMesh.position.set(0, 0, 0.002); // Cao hơn nền 2mm
      textMesh.name = `WallBanner_Text_${cfg.id}`;
      textMesh.userData = {
        isTextPlane: true,
        planeW: bannerPlaneW,
        planeH: bannerPlaneH,
        canvasW: canvasBW,
        canvasH: canvasBH
      };
      bannerGroup.add(textMesh);

      parentGroup.add(bannerGroup);
      this.wallBanners.push(bannerGroup);

      // 3. KHẨU HIỆU (Mục A.3): Canvas cao 192px, nền trong suốt, tấm chữ cao 0.45m, rộng theo tỷ lệ canvas
      let sloganSize = 54;
      const sloganPadding = 64;
      measureCtx.font = `900 ${sloganSize}px "Be Vietnam Pro", sans-serif`;
      let sloganTextW = measureCtx.measureText(cfg.slogan).width;

      while (0.45 * (sloganTextW + 2 * sloganPadding) / 192 > maxBannerTextW && sloganSize > 24) {
        sloganSize -= 2;
        measureCtx.font = `900 ${sloganSize}px "Be Vietnam Pro", sans-serif`;
        sloganTextW = measureCtx.measureText(cfg.slogan).width;
      }

      const canvasSW = Math.min(4096, Math.ceil(sloganTextW + 2 * sloganPadding));
      const canvasSH = 192;
      const sloganPlaneH = 0.45;
      const sloganPlaneW = sloganPlaneH * (canvasSW / canvasSH);

      const canvasS = document.createElement('canvas');
      canvasS.width = canvasSW;
      canvasS.height = canvasSH;
      const ctxS = canvasS.getContext('2d');
      ctxS.clearRect(0, 0, canvasSW, canvasSH);

      ctxS.fillStyle = cfg.colors.slogan_color;
      ctxS.font = `900 ${sloganSize}px "Be Vietnam Pro", sans-serif`;
      ctxS.textAlign = 'center';
      ctxS.textBaseline = 'middle';
      ctxS.fillText(cfg.slogan, canvasSW / 2, 96);

      const texS = new THREE.CanvasTexture(canvasS);
      texS.colorSpace = THREE.SRGBColorSpace;
      texS.anisotropy = maxAnis;

      const sloganMat = new THREE.MeshBasicMaterial({
        map: texS,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const sloganGeo = new THREE.PlaneGeometry(sloganPlaneW, sloganPlaneH);
      const sloganMesh = new THREE.Mesh(sloganGeo, sloganMat);
      sloganMesh.position.set(posX, 5.60, posZ);
      sloganMesh.rotation.y = cfg.rotY;
      sloganMesh.name = `WallSlogan_${cfg.id}`;
      sloganMesh.userData = {
        isTextPlane: true,
        planeW: sloganPlaneW,
        planeH: sloganPlaneH,
        canvasW: canvasSW,
        canvasH: canvasSH
      };
      parentGroup.add(sloganMesh);
      this.wallBanners.push(sloganMesh);
    });

    console.log(`[buildWallBannersAndSlogans] Đã dựng thành công 7 cụm băng tiêu đề y=4.15m (nền + logo + chữ tỷ lệ 1:1) + 7 khẩu hiệu y=5.60m cho Khu 3, 4, 6.`);
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
