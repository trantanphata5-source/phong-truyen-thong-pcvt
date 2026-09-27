import * as THREE from 'three';
import { FONT_FAMILY } from './fonts.js';

/**
 * Exhibit Builder v2 (GĐ3)
 * =========================
 * Đọc room_data.json, treo hiện vật lên tường theo kế hoạch mục 4.
 * Dùng packRow() để chia đều khe hở, mountWall() để treo 2 tầng.
 *
 * Quy tắc kích thước khung:
 *   Bằng khen:     fit vào ô 1.35 × 1.00 m, giữ tỷ lệ
 *   Huân chương:   rộng 1.60 m, khung vàng
 *   Ảnh (khu 1,3): cao 1.00 m, rộng theo tỷ lệ
 *   Ảnh (khu 4,6): cao 1.15 m, rộng theo tỷ lệ
 *   Tranh tặng:    ô 1.60 × 1.20 m, khung gỗ viền vàng
 *   Cờ:            0.95 × 1.35 m
 *
 * Tầng treo:
 *   Tầng dưới tâm y = 1.60  (mép 1.10–2.10)
 *   Tầng trên tâm y = 2.90  (mép 2.40–3.40)
 *   Cờ chỉ khu 2:  y = 4.45
 */
export class ExhibitBuilder {
  constructor(scene) {
    this.scene = scene;
    this.textureLoader = new THREE.TextureLoader();
    this.loadedTextures = new Map();
    this.exhibitMeshes = [];
    this.exhibitMap = new Map();

    this.ROW_Y_TOP = 2.90;
    this.ROW_Y_BOTTOM = 1.60;
    this.FLAG_Y = 4.45;
    this.MIN_GAP = 0.35;
    this.WALL_OFFSET = 0.05; // khoảng cách từ mặt tường

    this.initMaterials();
  }

  initMaterials() {
    this.matGoldFrame = new THREE.MeshStandardMaterial({
      color: 0xd4af37, roughness: 0.35, metalness: 0.8
    });
    this.matWoodFrame = new THREE.MeshStandardMaterial({
      color: 0x241810, roughness: 0.5, metalness: 0.1
    });
    this.matMatte = new THREE.MeshStandardMaterial({
      color: 0xfafafa, roughness: 0.9, metalness: 0.0
    });
    this.matGlass = new THREE.MeshStandardMaterial({
      color: 0xffffff, transparent: true, opacity: 0.08,
      roughness: 0.15, metalness: 0.05, depthWrite: false
    });
    this.matBrass = new THREE.MeshStandardMaterial({
      color: 0xe2b755, roughness: 0.3, metalness: 0.9
    });
    this.matFlagBar = new THREE.MeshStandardMaterial({
      color: 0x451a03, roughness: 0.4, metalness: 0.1
    });
    this.matFlagFringe = new THREE.MeshStandardMaterial({
      color: 0xfacc15, roughness: 0.5, metalness: 0.6
    });
    this.matGold = new THREE.MeshStandardMaterial({
      color: 0xd4af37, roughness: 0.3, metalness: 0.85
    });
  }

  // ===========================================================================
  // TEXTURE
  // ===========================================================================
  getOrLoadTexture(url) {
    if (this.loadedTextures.has(url)) return this.loadedTextures.get(url);
    const tex = this.textureLoader.load(url, t => { t.colorSpace = THREE.SRGBColorSpace; },
      undefined, err => console.warn(`Texture 404: ${url}`, err));
    this.loadedTextures.set(url, tex);
    return tex;
  }

  // ===========================================================================
  // KÍCH THƯỚC KHUNG
  // ===========================================================================
  getFrameSize(item) {
    const ar = item.aspect_ratio || 1.0;
    const src = item.source;
    const orgCode = item.org_code;
    const type = item.item_type;

    // Huân chương & TTCP
    if (['CTN', 'TTCP'].includes(orgCode)) {
      const w = 1.60;
      const h = w / ar;
      return { w, h, frameType: 'gold_honor' };
    }
    // Cờ
    if (src === 'co') {
      return { w: 0.95, h: 1.35, frameType: 'flag' };
    }
    // Bằng khen — fit vào ô 1.35 × 1.00, giữ tỷ lệ
    if (src === 'bang_khen') {
      const maxW = 1.35, maxH = 1.00;
      let w, h;
      if (ar >= maxW / maxH) {
        w = maxW;
        h = w / ar;
      } else {
        h = maxH;
        w = h * ar;
      }
      return { w, h, frameType: 'cert' };
    }
    // Tranh tặng
    if (src === 'tranh_tang') {
      return { w: 1.60, h: 1.20, frameType: 'painting' };
    }
    // Ảnh tư liệu (khu 1)
    if (src === 'anh_tu_lieu') {
      const h = 1.00;
      const w = h * ar;
      return { w, h, frameType: 'photo' };
    }
    // Ảnh PCVT, Đảng bộ (khu 3, 4)
    if (src === 'pcvt' || src === 'dang_bo') {
      const khu = item.khu;
      const h = (khu === 'khu4') ? 1.15 : 1.00;
      const w = h * ar;
      return { w, h, frameType: 'photo' };
    }
    // CĐ + ĐTN (khu 6)
    if (src === 'cong_doan' || src === 'doan_tn') {
      const h = 1.15;
      const w = h * ar;
      return { w, h, frameType: 'photo' };
    }
    // Fallback
    const h = 1.00;
    const w = h * ar;
    return { w, h, frameType: 'photo' };
  }

  // ===========================================================================
  // packRow — chia đều khe hở
  // ===========================================================================
  packRow(items, wallLength) {
    const sizes = items.map(it => this.getFrameSize(it));
    const totalWidth = sizes.reduce((s, sz) => s + sz.w, 0);
    const n = items.length;

    if (n === 0) return [];
    if (n === 1) {
      return [{ item: items[0], size: sizes[0], offset: 0 }];
    }

    const totalGap = wallLength - totalWidth;
    const gap = Math.max(this.MIN_GAP, totalGap / (n + 1));

    // Tính vị trí từ trái sang
    const result = [];
    let cursor = -wallLength / 2 + gap;
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
  /**
   * @param {Object} wallCfg
   *   wallCfg.axis  — 'x' hoặc 'z': trục cố định
   *   wallCfg.pos   — giá trị trục cố định (x hoặc z)
   *   wallCfg.start — đầu tường (theo trục còn lại)
   *   wallCfg.end   — cuối tường
   *   wallCfg.rotY  — góc quay group
   *   wallCfg.face  — 'inside' hoặc 'outside' (offset mặt tường)
   * @param {Array} items — danh sách items, sắp theo thời gian
   * @param {THREE.Group} parent
   * @param {Function} onDone
   * @param {Object} opts — { flagY, noFlags }
   */
  mountWall(wallCfg, items, parent, onDone, opts = {}) {
    const { axis, pos, start, end, rotY, face = 'inside' } = wallCfg;
    const wallLength = Math.abs(end - start);
    const sign = face === 'outside' ? -1 : 1;
    const offset = this.WALL_OFFSET * sign;

    // Tách cờ (chỉ khu 2) ra tầng riêng
    const flags = opts.noFlags ? [] : items.filter(it => it.source === 'co');
    const nonFlags = opts.noFlags ? items : items.filter(it => it.source !== 'co');

    // Chia 2 tầng: chẵn (0,2,4...) → trên, lẻ (1,3,5...) → dưới
    const topItems = nonFlags.filter((_, i) => i % 2 === 0);
    const bottomItems = nonFlags.filter((_, i) => i % 2 !== 0);

    const mountRow = (rowItems, y) => {
      const packed = this.packRow(rowItems, wallLength);
      for (const { item, size, offset: localOffset } of packed) {
        let posX, posZ;
        if (axis === 'x') {
          posX = pos + offset;
          posZ = (start + end) / 2 + localOffset;
        } else {
          posZ = pos + offset;
          posX = (start + end) / 2 + localOffset;
        }
        const exhibit = this.createExhibit(item, size, rotY);
        exhibit.position.set(posX, y, posZ);
        parent.add(exhibit);
        if (onDone) onDone();
      }
    };

    mountRow(topItems, this.ROW_Y_TOP);
    mountRow(bottomItems, this.ROW_Y_BOTTOM);

    // Cờ: tầng trên cùng
    if (flags.length > 0) {
      const flagY = opts.flagY || this.FLAG_Y;
      const packed = this.packRow(flags, wallLength);
      for (const { item, size, offset: localOffset } of packed) {
        let posX, posZ;
        if (axis === 'x') {
          posX = pos + offset;
          posZ = (start + end) / 2 + localOffset;
        } else {
          posZ = pos + offset;
          posX = (start + end) / 2 + localOffset;
        }
        const exhibit = this.createExhibit(item, size, rotY);
        exhibit.position.set(posX, flagY, posZ);
        parent.add(exhibit);
        if (onDone) onDone();
      }
    }
  }

  // ===========================================================================
  // MAIN BUILD
  // ===========================================================================
  buildAllExhibits(roomData, onProgress) {
    const exhibitsGroup = new THREE.Group();
    exhibitsGroup.name = 'AllExhibits';

    // Chỉ lấy items có treo = true
    const items = roomData.items.filter(it => it.treo !== false);

    let totalCreated = 0;
    const totalCount = items.length;
    const onDone = () => {
      totalCreated++;
      if (onProgress) onProgress(totalCreated, totalCount);
    };

    // ===== PHÂN THEO KHU (trường `khu` trong data) =====
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
    // Phân loại trong khu 1
    const k1_atl = khu1.filter(it => it.source === 'anh_tu_lieu');
    const k1_tt = khu1.filter(it => it.source === 'tranh_tang');
    console.log(`[Khu 1] ATL: ${k1_atl.length}, TT: ${k1_tt.length}, tổng: ${khu1.length}`);

    // Tường xa x = −50 (44m): ảnh tư liệu đầu
    const atl_far = k1_atl.slice(0, Math.min(40, k1_atl.length));
    const atl_rest = k1_atl.slice(atl_far.length);
    this.mountWall({
      axis: 'x', pos: -50, start: -22, end: 22, rotY: Math.PI / 2
    }, atl_far, exhibitsGroup, onDone, { noFlags: true });

    // Tường Bắc z = −25 (26m): ảnh tư liệu còn lại
    if (atl_rest.length > 0) {
      this.mountWall({
        axis: 'z', pos: -25, start: -48, end: -22, rotY: 0
      }, atl_rest, exhibitsGroup, onDone, { noFlags: true });
    }

    // Vách x = −35 mặt Tây (22m): tranh tặng phần 1
    const tt_west = k1_tt.slice(0, 20);
    const tt_east = k1_tt.slice(20, 40);
    const tt_rest = k1_tt.slice(40);
    this.mountWall({
      axis: 'x', pos: -35, start: -11, end: 11, rotY: -Math.PI / 2, face: 'outside'
    }, tt_west, exhibitsGroup, onDone, { noFlags: true });

    // Vách x = −35 mặt Đông (22m): tranh tặng phần 2
    if (tt_east.length > 0) {
      this.mountWall({
        axis: 'x', pos: -35, start: -11, end: 11, rotY: Math.PI / 2
      }, tt_east, exhibitsGroup, onDone, { noFlags: true });
    }

    // Tường Nam z = 25 (26m): tranh tặng còn lại
    if (tt_rest.length > 0) {
      this.mountWall({
        axis: 'z', pos: 25, start: -48, end: -22, rotY: Math.PI
      }, tt_rest, exhibitsGroup, onDone, { noFlags: true });
    }

    // ======== KHU 2 · Bằng khen & Cờ ========
    const k2_bk = khu2.filter(it => it.source === 'bang_khen');
    const k2_co = khu2.filter(it => it.source === 'co');
    console.log(`[Khu 2] BK: ${k2_bk.length}, Cờ: ${k2_co.length}, tổng: ${khu2.length}`);

    // Phân BK theo đơn vị
    const bk_honor = k2_bk.filter(it => ['CTN', 'TTCP'].includes(it.org_code));
    const bk_central = k2_bk.filter(it => ['BCT', 'EVN', 'TLDLDVN'].includes(it.org_code));
    const bk_tinh = k2_bk.filter(it => ['UBND_BRVT', 'UBND_TPVT', 'DANGUY_BRVT', 'LDLD_BRVT', 'BHXH_BRVT', 'BCHQS_BRVT', 'SO_VHTTDL_BRVT'].includes(it.org_code));
    const bk_nganh = k2_bk.filter(it => ['EVNSPC', 'CD_EVN', 'CD_EVNSPC', 'CD_BCT'].includes(it.org_code));
    const bk_other = k2_bk.filter(it =>
      !bk_honor.includes(it) && !bk_central.includes(it) &&
      !bk_tinh.includes(it) && !bk_nganh.includes(it)
    );

    // Phân cờ 3 phần
    const co_n = k2_co.length;
    const co_back = k2_co.slice(0, Math.ceil(co_n / 3));
    const co_west = k2_co.slice(co_back.length, co_back.length + Math.ceil((co_n - co_back.length) / 2));
    const co_east = k2_co.slice(co_back.length + co_west.length);

    console.log(`  [Khu 2 back] honor:${bk_honor.length} central:${bk_central.length} co:${co_back.length}`);
    console.log(`  [Khu 2 west] tinh:${bk_tinh.length} other:${bk_other.length} co:${co_west.length}`);
    console.log(`  [Khu 2 east] nganh:${bk_nganh.length} co:${co_east.length}`);

    // Tường hậu z = −55 (32m): Huân chương + TTCP + BCT/EVN/TLĐLĐ + cờ
    this.mountWall({
      axis: 'z', pos: -55, start: -16, end: 16, rotY: 0
    }, [...bk_honor, ...bk_central, ...co_back], exhibitsGroup, onDone);

    // Tường Tây x = −18 (34m): Tỉnh/TP + cờ
    this.mountWall({
      axis: 'x', pos: -18, start: -53, end: -19, rotY: Math.PI / 2
    }, [...bk_tinh, ...bk_other, ...co_west], exhibitsGroup, onDone);

    // Tường Đông x = 18 (34m): Ngành + cờ
    this.mountWall({
      axis: 'x', pos: 18, start: -53, end: -19, rotY: -Math.PI / 2
    }, [...bk_nganh, ...co_east], exhibitsGroup, onDone);

    // ======== KHU 3 · Hiện tại (PCVT) ========
    console.log(`[Khu 3] PCVT: ${khu3.length}`);

    // Tường xa x = 50: chia 2 đoạn (bỏ đoạn giữa cho tường 3 mốc son sau)
    const k3_east_n = Math.min(24, Math.ceil(khu3.length * 0.24));
    const k3_east_s = Math.min(24, Math.ceil(khu3.length * 0.24));
    const pcvt_ne = khu3.slice(0, k3_east_n);
    const pcvt_se = khu3.slice(k3_east_n, k3_east_n + k3_east_s);
    const pcvt_rest = khu3.slice(k3_east_n + k3_east_s);
    const pcvt_n_wall = pcvt_rest.slice(0, Math.ceil(pcvt_rest.length / 2));
    const pcvt_s_wall = pcvt_rest.slice(pcvt_n_wall.length);

    this.mountWall({
      axis: 'x', pos: 50, start: -24, end: -2, rotY: -Math.PI / 2
    }, pcvt_ne, exhibitsGroup, onDone, { noFlags: true });

    this.mountWall({
      axis: 'x', pos: 50, start: 2, end: 24, rotY: -Math.PI / 2
    }, pcvt_se, exhibitsGroup, onDone, { noFlags: true });

    // Tường Bắc z = −25 (26m)
    if (pcvt_n_wall.length > 0) {
      this.mountWall({
        axis: 'z', pos: -25, start: 22, end: 48, rotY: 0
      }, pcvt_n_wall, exhibitsGroup, onDone, { noFlags: true });
    }

    // Tường Nam z = 25 (26m)
    if (pcvt_s_wall.length > 0) {
      this.mountWall({
        axis: 'z', pos: 25, start: 22, end: 48, rotY: Math.PI
      }, pcvt_s_wall, exhibitsGroup, onDone, { noFlags: true });
    }

    // ======== KHU 4 · Đảng bộ ========
    console.log(`[Khu 4] DB: ${khu4.length}`);

    const db_east = khu4.slice(0, 26);
    const db_west = khu4.slice(26);

    // Tường Đông x = 50 (40m)
    this.mountWall({
      axis: 'x', pos: 50, start: 40, end: 80, rotY: -Math.PI / 2
    }, db_east, exhibitsGroup, onDone, { noFlags: true });

    // Tường Tây x = 22 mặt ngoài (mặt hướng Đông)
    if (db_west.length > 0) {
      this.mountWall({
        axis: 'x', pos: 22, start: 40, end: 80, rotY: Math.PI / 2, face: 'outside'
      }, db_west, exhibitsGroup, onDone, { noFlags: true });
    }

    // ======== KHU 6 · Công đoàn & Đoàn TN ========
    const k6_cd = khu6.filter(it => it.source === 'cong_doan');
    const k6_dtn = khu6.filter(it => it.source === 'doan_tn');
    console.log(`[Khu 6] CĐ: ${k6_cd.length}, ĐTN: ${k6_dtn.length}, tổng: ${khu6.length}`);

    // Tường Tây x = −50 (40m): Công đoàn
    this.mountWall({
      axis: 'x', pos: -50, start: 40, end: 80, rotY: Math.PI / 2
    }, k6_cd, exhibitsGroup, onDone, { noFlags: true });

    // Tường Đông x = −22 mặt ngoài (mặt hướng Tây): Đoàn TN
    this.mountWall({
      axis: 'x', pos: -22, start: 40, end: 80, rotY: -Math.PI / 2, face: 'outside'
    }, k6_dtn, exhibitsGroup, onDone, { noFlags: true });

    this.scene.add(exhibitsGroup);
    console.log(`✅ Mounted ${totalCreated}/${totalCount} exhibits`);
    return exhibitsGroup;
  }

  // ===========================================================================
  // TẠO EXHIBIT (router)
  // ===========================================================================
  createExhibit(item, size, rotY) {
    if (size.frameType === 'flag') {
      return this.createFlagPennant(item, size, rotY);
    }
    return this.createFramedExhibit(item, size, rotY);
  }

  // ===========================================================================
  // KHUNG ẢNH / BẰNG KHEN / TRANH
  // ===========================================================================
  createFramedExhibit(item, size, rotY) {
    const group = new THREE.Group();
    group.rotation.y = rotY;

    const { w, h, frameType } = size;
    const depth = 0.08;
    const isHonor = frameType === 'gold_honor';
    const isPainting = frameType === 'painting';
    const frameMat = isHonor ? this.matGoldFrame : (isPainting ? this.matWoodFrame : this.matWoodFrame);

    // Khung ngoài
    const frameW = w + 0.12;
    const frameH = h + 0.12;
    const frameMesh = new THREE.Mesh(new THREE.BoxGeometry(frameW, frameH, depth), frameMat);
    frameMesh.castShadow = true;
    group.add(frameMesh);

    // Viền vàng
    const rimMesh = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, h + 0.03, depth + 0.01), this.matGold);
    group.add(rimMesh);

    // Nền trắng matte
    const matteMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.matMatte);
    matteMesh.position.z = depth / 2 + 0.005;
    group.add(matteMesh);

    // Ảnh
    const texture = this.getOrLoadTexture(item.wall_path);
    const picMat = new THREE.MeshStandardMaterial({
      map: texture, roughness: 0.4, metalness: 0.05,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    });
    const picMesh = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.05, h - 0.05), picMat);
    picMesh.position.z = depth / 2 + 0.008;
    group.add(picMesh);

    // Kính bảo vệ
    const glassMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.matGlass);
    glassMesh.position.z = depth / 2 + 0.012;
    group.add(glassMesh);

    // Biển tên
    this.addPlaque(group, item, w, h, depth, 'cert');

    // Hitbox
    this.addHitbox(group, item, w, h, depth, frameMesh);

    group.name = `Exhibit_${item.id}`;
    return group;
  }

  // ===========================================================================
  // CỜ
  // ===========================================================================
  createFlagPennant(item, size, rotY) {
    const group = new THREE.Group();
    group.rotation.y = rotY;

    const { w, h } = size;

    // Thanh treo
    const barGeo = new THREE.CylinderGeometry(0.025, 0.025, w + 0.25, 16);
    const barMesh = new THREE.Mesh(barGeo, this.matFlagBar);
    barMesh.rotation.z = Math.PI / 2;
    barMesh.position.y = h / 2 + 0.03;
    group.add(barMesh);

    // Núm đồng
    const finialGeo = new THREE.SphereGeometry(0.045, 16, 16);
    [-1, 1].forEach(side => {
      const finial = new THREE.Mesh(finialGeo, this.matGold);
      finial.position.set(side * (w / 2 + 0.13), h / 2 + 0.03, 0);
      group.add(finial);
    });

    // Dây treo
    const cordCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-w / 2 - 0.08, h / 2 + 0.03, 0),
      new THREE.Vector3(0, h / 2 + 0.28, 0),
      new THREE.Vector3(w / 2 + 0.08, h / 2 + 0.03, 0)
    );
    group.add(new THREE.Mesh(new THREE.TubeGeometry(cordCurve, 16, 0.008, 6, false), this.matGold));

    // Vải cờ (gợn sóng nhẹ)
    const clothGeo = new THREE.PlaneGeometry(w, h, 10, 10);
    const posArr = clothGeo.attributes.position;
    for (let i = 0; i < posArr.count; i++) {
      const u = posArr.getX(i) / w;
      const v = posArr.getY(i) / h;
      posArr.setZ(i, Math.sin(u * Math.PI * 2) * 0.015 * (1 - v));
    }
    clothGeo.computeVertexNormals();

    const texture = this.getOrLoadTexture(item.wall_path);
    const clothMat = new THREE.MeshStandardMaterial({
      map: texture, roughness: 0.65, metalness: 0.1, side: THREE.DoubleSide
    });
    const clothMesh = new THREE.Mesh(clothGeo, clothMat);
    clothMesh.castShadow = true;
    group.add(clothMesh);

    // Viền vàng dưới
    group.add(new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.02, 0.04, 0.015), this.matFlagFringe
    )).position.set(0, -h / 2 - 0.02, 0);

    // Biển tên
    this.addPlaque(group, item, w, h, 0.02, 'flag');

    // Hitbox
    this.addHitbox(group, item, w, h, 0.02, clothMesh);

    group.name = `Flag_${item.id}`;
    return group;
  }

  // ===========================================================================
  // BIỂN TÊN
  // ===========================================================================
  addPlaque(group, item, w, h, depth, style) {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Nền gradient
    const isFlag = style === 'flag';
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

    // Viền vàng
    ctx.strokeStyle = isFlag ? '#facc15' : '#fde047';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 632, 120);

    // Nội dung chú thích
    let text;
    if (item.source === 'bang_khen' || item.source === 'co') {
      text = `${item.year} • ${item.org_name || item.org_code}`;
    } else if (item.date) {
      const [y, m, d] = item.date.split('-');
      text = `${d}/${m}/${y} • ${item.caption || ''}`;
    } else {
      text = item.caption || `${item.year}`;
    }

    // Auto-fit font
    let fontSize = 32;
    ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`;
    const maxTextW = 590;
    if (ctx.measureText(text).width > maxTextW) {
      fontSize = Math.max(16, Math.floor(fontSize * maxTextW / ctx.measureText(text).width));
      ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`;
    }

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowOffsetY = 2;
    ctx.shadowBlur = 3;
    ctx.fillText(text, 320, 64);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({
      map: tex, metalness: 0.7, roughness: 0.3,
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
