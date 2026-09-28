import * as THREE from 'three';
import { FONT_FAMILY } from './fonts.js';
import { WALLS, PARTITIONS, WALL_THICKNESS, PARTITION_THICKNESS } from './layout-config.js';

/**
 * Exhibit Builder v3 (GĐ3-fix)
 * ==============================
 * Sửa lỗi: standoff bằng pháp tuyến rotY, đọc tường từ layout-config.
 * Khu 2: cờ và BK cùng khung 1.35×1.00, 2 tầng, không tầng cờ riêng.
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
    this.MIN_GAP = 0.35;

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
  // KÍCH THƯỚC KHUNG
  // ===========================================================================
  getFrameSize(item) {
    const ar = item.aspect_ratio || 1.33;
    const src = item.source;
    const khu = item.khu;

    // Huân chương (CTN, TTCP)
    if (src === 'bang_khen' && ['CTN', 'TTCP'].includes(item.org_code)) {
      return { w: 1.50, h: 1.50 / ar, frameType: 'gold_honor' };
    }
    // Bằng khen: fit vào 1.35 × 1.00
    if (src === 'bang_khen') {
      const maxW = 1.35, maxH = 1.00;
      let w = maxW, h = w / ar;
      if (h > maxH) { h = maxH; w = h * ar; }
      return { w, h, frameType: 'cert' };
    }
    // Cờ khu 2: cùng khung 1.35 × 1.00 như BK (ảnh ngang)
    if (src === 'co') {
      const maxW = 1.35, maxH = 1.00;
      let w = maxW, h = w / ar;
      if (h > maxH) { h = maxH; w = h * ar; }
      return { w, h, frameType: 'cert_flag' };
    }
    // Tranh tặng: 1.60 × 1.20
    if (src === 'tranh_tang') {
      const maxW = 1.60, maxH = 1.20;
      let w = maxW, h = w / ar;
      if (h > maxH) { h = maxH; w = h * ar; }
      return { w, h, frameType: 'painting' };
    }
    // Ảnh tư liệu (khu 1, 3): cao 1.00
    if (khu === 'khu1' || khu === 'khu3') {
      const h = 1.00;
      return { w: h * ar, h, frameType: 'cert' };
    }
    // Ảnh (khu 4, 6): cao 1.15
    const h2 = 1.15;
    return { w: h2 * ar, h: h2, frameType: 'cert' };
  }

  // ===========================================================================
  // packRow — chia đều items dọc theo chiều dài tường
  // ===========================================================================
  packRow(items, wallLength) {
    if (items.length === 0) return [];
    const sizes = items.map(it => this.getFrameSize(it));
    const n = items.length;
    const totalWidth = sizes.reduce((s, sz) => s + sz.w, 0);

    if (n === 1) {
      return [{ item: items[0], size: sizes[0], offset: 0 }];
    }

    const totalGap = wallLength - totalWidth;
    const gap = Math.max(this.MIN_GAP, totalGap / (n + 1));

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
  // GĐ3-fix: dùng pháp tuyến từ rotY, không dùng `face`
  // ===========================================================================
  /**
   * @param {Object} wallCfg
   *   wallCfg.x, wallCfg.z — tâm tường
   *   wallCfg.rotY — góc quay (khung nhìn theo hướng này)
   *   wallCfg.wallLength — chiều dài bề mặt khả dụng
   *   wallCfg.thickness — độ dày tường
   */
  mountWall(wallCfg, items, parent, onDone) {
    if (items.length === 0) return;

    const { x: baseX, z: baseZ, rotY, wallLength, thickness } = wallCfg;

    // Pháp tuyến mặt tường = hướng khung nhìn ra
    const nx = Math.sin(rotY);
    const nz = Math.cos(rotY);
    // standOff = nửa tường + phào (0.04) + khe (0.06)
    const standOff = thickness / 2 + 0.04 + 0.06;

    // Trục dài tường: vuông góc với pháp tuyến
    const tx = Math.cos(rotY);   // hướng "phải" dọc tường
    const tz = -Math.sin(rotY);

    // Chia 2 tầng: chẵn → trên, lẻ → dưới
    const topItems = items.filter((_, i) => i % 2 === 0);
    const bottomItems = items.filter((_, i) => i % 2 !== 0);

    const mountRow = (rowItems, y) => {
      const packed = this.packRow(rowItems, wallLength);
      for (const { item, size, offset: localOffset } of packed) {
        const posX = baseX + nx * standOff + tx * localOffset;
        const posZ = baseZ + nz * standOff + tz * localOffset;
        const exhibit = this.createExhibit(item, size, rotY);
        exhibit.position.set(posX, y, posZ);
        parent.add(exhibit);
        if (onDone) onDone();
      }
    };

    mountRow(topItems, this.ROW_Y_TOP);
    mountRow(bottomItems, this.ROW_Y_BOTTOM);
  }

  // ===========================================================================
  // Helper: lấy wallCfg từ layout-config WALLS
  // ===========================================================================
  wallCfgFromId(wallId, rotY, lengthOverride) {
    const w = this.wallIndex[wallId];
    if (!w) { console.warn(`Wall ${wallId} not found`); return null; }
    return {
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

    // Tường xa x = −50 (wall_k1_far, mặt nhìn Đông = rotY π/2)
    const atl_far = k1_atl.slice(0, Math.min(40, k1_atl.length));
    const atl_rest = k1_atl.slice(atl_far.length);
    this.mountWall(this.wallCfgFromId('wall_k1_far', Math.PI / 2), atl_far, exhibitsGroup, onDone);

    // Tường Bắc z = −25 (wall_k1_north, mặt nhìn Nam = rotY 0... thực ra phía trong khu 1 nhìn về hướng z+)
    // wall_k1_north: x=-34, z=-25, w=32, rotY=0. Mặt treo trong khu 1 hướng Nam (z+) = rotY π
    if (atl_rest.length > 0) {
      this.mountWall(this.wallCfgFromId('wall_k1_north', Math.PI), atl_rest, exhibitsGroup, onDone);
    }

    // Vách x = −35 (partition_k1, w=24, d=PARTITION_THICKNESS)
    const tt_west = k1_tt.slice(0, 20);
    const tt_east = k1_tt.slice(20, 40);
    const tt_rest = k1_tt.slice(40);

    // Mặt Tây (nhìn về x−) = rotY −π/2
    this.mountWall(this.wallCfgFromId('partition_k1', -Math.PI / 2), tt_west, exhibitsGroup, onDone);

    // Mặt Đông (nhìn về x+) = rotY π/2
    if (tt_east.length > 0) {
      this.mountWall(this.wallCfgFromId('partition_k1', Math.PI / 2), tt_east, exhibitsGroup, onDone);
    }

    // Tường Nam z = 25 (wall_k1_south, mặt nhìn Bắc = rotY 0)
    if (tt_rest.length > 0) {
      this.mountWall(this.wallCfgFromId('wall_k1_south', 0), tt_rest, exhibitsGroup, onDone);
    }

    // ======== KHU 2 · Bằng khen & Cờ (chọn lọc, theo tuong field) ========
    // Items khu 2 đã được lọc treo/không treo trong room_data.json
    // Phân theo trường `tuong` nếu có, không thì phân theo org_code
    const k2_giua = khu2.filter(it => it.tuong === 'giua');
    const k2_tay  = khu2.filter(it => it.tuong === 'tay');
    const k2_dong = khu2.filter(it => it.tuong === 'dong');
    // Fallback: items không có trường tuong → phân theo org_code
    const k2_unassigned = khu2.filter(it => !it.tuong);

    let giua_items = k2_giua;
    let tay_items = k2_tay;
    let dong_items = k2_dong;

    if (k2_unassigned.length > 0) {
      // Legacy fallback
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

    // Tường hậu z = −55 (wall_k2_back, mặt nhìn Nam = rotY π) — KHÔNG, mặt nhìn vào phòng = hướng z+
    // Từ lối vào z=26 nhìn thẳng bắc → mặt tường z=−55 hướng z+ = rotY 0... 
    // Nhưng rotY=0 có nx=sin(0)=0, nz=cos(0)=1 → đẩy khung ra z+ (đúng, vào phòng)
    this.mountWall(this.wallCfgFromId('wall_k2_back', 0, 32), giua_items, exhibitsGroup, onDone);

    // Tường Tây x = −18 (wall_k2_west, mặt nhìn Đông = rotY π/2)
    this.mountWall(this.wallCfgFromId('wall_k2_west', Math.PI / 2, 34), tay_items, exhibitsGroup, onDone);

    // Tường Đông x = 18 (wall_k2_east, mặt nhìn Tây = rotY −π/2)
    this.mountWall(this.wallCfgFromId('wall_k2_east', -Math.PI / 2, 34), dong_items, exhibitsGroup, onDone);

    // ======== KHU 3 · Hiện tại (PCVT) ========
    console.log(`khu3 ${khu3.length}`);

    const k3_n = Math.min(24, Math.ceil(khu3.length * 0.24));
    const pcvt_ne = khu3.slice(0, k3_n);
    const pcvt_se = khu3.slice(k3_n, k3_n * 2);
    const pcvt_rest = khu3.slice(k3_n * 2);
    const pcvt_n_wall = pcvt_rest.slice(0, Math.ceil(pcvt_rest.length / 2));
    const pcvt_s_wall = pcvt_rest.slice(pcvt_n_wall.length);

    // Tường xa x = 50 (wall_k3_far, mặt nhìn Tây = rotY −π/2)
    // Chia 2 đoạn: z −24..−2 và z 2..24
    this.mountWall({
      x: 50, z: -13, rotY: -Math.PI / 2, wallLength: 22, thickness: WALL_THICKNESS
    }, pcvt_ne, exhibitsGroup, onDone);

    this.mountWall({
      x: 50, z: 13, rotY: -Math.PI / 2, wallLength: 22, thickness: WALL_THICKNESS
    }, pcvt_se, exhibitsGroup, onDone);

    // Tường Bắc z = −25 (wall_k3_north, mặt trong khu 3 hướng z+ = rotY 0... 
    // Không: mặt trong khu 3 hướng z+ (Nam) = rotY π)
    // wait: wall_k3_north tại z=-25, mặt phía trong khu 3 ở phía Nam (z+) → rotY 0 có nz=1 đẩy ra z+
    // Nhưng thực ra mặt trong khu 3 ở phía SÂU (z−) → nhìn từ khu 3 vào tường bắc → mặt tường hướng z+
    // rotY=0 → nz=cos(0)=1 → đẩy z+ (đúng, vào trong khu 3)
    if (pcvt_n_wall.length > 0) {
      this.mountWall(this.wallCfgFromId('wall_k3_north', 0), pcvt_n_wall, exhibitsGroup, onDone);
    }

    // Tường Nam z = 25 (wall_k3_south, mặt trong hướng z− = rotY π)
    if (pcvt_s_wall.length > 0) {
      this.mountWall(this.wallCfgFromId('wall_k3_south', Math.PI), pcvt_s_wall, exhibitsGroup, onDone);
    }

    // ======== KHU 4 · Đảng bộ ========
    console.log(`khu4 ${khu4.length}`);

    const db_east = khu4.slice(0, 26);
    const db_west = khu4.slice(26);

    // Tường Đông x = 50 (wall_k4_east, mặt nhìn Tây = rotY −π/2)
    this.mountWall(this.wallCfgFromId('wall_k4_east', -Math.PI / 2), db_east, exhibitsGroup, onDone);

    // Tường Tây = mặt ngoài tường HCM Đông (x=22). Dùng cùng vật lý tường khu5
    // HCM east wall not in WALLS, dùng thủ công
    if (db_west.length > 0) {
      this.mountWall({
        x: 22, z: 60, rotY: Math.PI / 2, wallLength: 40, thickness: WALL_THICKNESS
      }, db_west, exhibitsGroup, onDone);
    }

    // ======== KHU 6 · Công đoàn & Đoàn TN ========
    const k6_cd = khu6.filter(it => it.source === 'cong_doan');
    const k6_dtn = khu6.filter(it => it.source === 'doan_tn');
    console.log(`khu6 ${k6_cd.length}+${k6_dtn.length}`);

    // Tường Tây x = −50 (wall_k6_west, mặt nhìn Đông = rotY π/2)
    this.mountWall(this.wallCfgFromId('wall_k6_west', Math.PI / 2), k6_cd, exhibitsGroup, onDone);

    // Tường Đông = mặt ngoài tường HCM Tây (x=−22)
    this.mountWall({
      x: -22, z: 60, rotY: -Math.PI / 2, wallLength: 40, thickness: WALL_THICKNESS
    }, k6_dtn, exhibitsGroup, onDone);

    this.scene.add(exhibitsGroup);
    console.log(`khu1 ${k1_atl.length}+${k1_tt.length} · khu2 ${k2_bk.length} BK + ${k2_co.length} cờ (giữa ${giua_items.length} / tây ${tay_items.length} / đông ${dong_items.length}) · khu3 ${khu3.length} · khu4 ${khu4.length} · khu6 ${k6_cd.length}+${k6_dtn.length} · tổng ${totalCreated}`);
    return exhibitsGroup;
  }

  // ===========================================================================
  // TẠO EXHIBIT (router)
  // ===========================================================================
  createExhibit(item, size, rotY) {
    // GĐ3-fix: cờ khu 2 dùng khung ảnh thường, không dùng pennant
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
    const frameMat = isHonor ? this.matGoldFrame : this.matWoodFrame;

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
    const plaqueStyle = (frameType === 'cert_flag') ? 'flag' : 'cert';
    this.addPlaque(group, item, w, h, depth, plaqueStyle);

    // Hitbox
    this.addHitbox(group, item, w, h, depth, frameMesh);

    group.name = `Exhibit_${item.id}`;
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
