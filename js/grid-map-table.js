import * as THREE from 'three';
import { GRID_TABLE } from './layout-config.js';

const FONT_FAMILY = '"Be Vietnam Pro", system-ui, sans-serif';

/**
 * GridMapTable (Sa bàn lưới điện 3D Công ty Điện lực Vũng Tàu)
 * Theo Kế hoạch nâng cấp GĐ5 & Sửa lỗi GĐ5 (Mục B):
 * - Vị trí: tâm (26, 0), kích thước 6.0m dọc trục x, 4.2m dọc trục z, cao 0.95m
 * - Bọc trong rootGroup có rotation.y = -π/2 để hướng Bắc chỉ về +x (nhìn thuận chiều từ cửa x=18)
 * - Nghiêng 8° quay mép thấp về phía cửa (-x)
 * - Nền: ảnh bản đồ base_low.webp đã tắt lớp ĐBGT (OCG 333)
 * - Không còn lớp ĐBGT, không có quả cầu xung sáng, không có beacon nhấp nháy
 * - Gộp 44 trạm thành 5 InstancedMesh (500kV, 220kV, 110kV lưới, 110kV KH, Lân cận)
 * - Nhãn 14 phường & mũi tên outbound vẽ chung trên 1 texture overlay canvas plane (1 mesh)
 * - Toàn bộ sa bàn <= 20 draw calls!
 * - Hỗ trợ Raycast qua intersection.instanceId
 */
export class GridMapTable {
  constructor(scene) {
    this.scene = scene;

    // Root group handles world placement and orientation (-π/2)
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = 'GridMapTable_Root';

    // Table group handles local tilt (8° towards local +Z, which maps to world -X towards door)
    this.tableGroup = new THREE.Group();
    this.tableGroup.name = 'GridMapTable_Group';
    this.rootGroup.add(this.tableGroup);

    // Interactive objects array for raycaster in main.js
    this.interactiveObjects = [];
    this.tableHitMesh = null;

    // Data container
    this.gridData = null;

    // Layer groups for filtering
    this.layers = {
      lines500: new THREE.Group(),
      lines220: new THREE.Group(),
      lines110: new THREE.Group(),
      quyHoach: new THREE.Group(),
      ranhGioiMoi: new THREE.Group(), // Lớp ranh giới phường/xã mới (Mục B.2)
      tram500: new THREE.Group(),
      tram220: new THREE.Group(),
      tram110: new THREE.Group(),
      tramKH: new THREE.Group(),
      tramLanCan: new THREE.Group(),
      coSo: new THREE.Group(),
      phuong: new THREE.Group(),
      labels: new THREE.Group()
    };

    // Layer visibility state
    this.layerVisibility = {
      line500: true,
      line220: true,
      line110: true,
      khachHang: true,
      quyHoach: true,
      ranhGioiMoi: true,
      labels: true,
      phuong: true
    };

    // Table dimensions in local coordinates
    // Width (local X) = 4.2m -> becomes world Z (-2.1 to +2.1)
    // Depth (local Z) = 6.0m -> becomes world X (23 to 29)
    this.tableWidth = GRID_TABLE.width || 4.2;
    this.tableDepth = GRID_TABLE.depth || 6.0;
    this.tableHeight = GRID_TABLE.height || 0.95;
    // Positive rotation around local X pitches +Z downwards (-Y)
    // Since local +Z is world -X (facing door), the near edge is lower
    this.tiltRad = (GRID_TABLE.tiltDeg || 8) * Math.PI / 180;

    // Map board dimensions inside table bevel (Mục B.0b: Cắt sát bounds 1500 x 2580 pt -> aspect = 0.5814)
    this.mapAspect = 1500.0 / 2580.0;
    this.mapD = 5.4; // 5.4m chiều dài dọc bàn 6m
    this.mapW = this.mapD * this.mapAspect; // ≈ 3.14m bề rộng trên bàn 4.2m

    // Instanced meshes references
    this.instancedTramMeshes = [];
    this.instancedCoSoMesh = null;
    this._tilesLoaded = false;
    this.highResTilesGroup = null;
  }

  async loadData() {
    try {
      const res = await fetch('assets/grid/pcvt_grid.json?v=' + Date.now());
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      this.gridData = await res.json();
      console.log('GridMapTable data loaded successfully:', {
        tram: this.gridData.tram?.length,
        coSo: this.gridData.co_so?.length,
        phuong: this.gridData.phuong?.length
      });
      return this.gridData;
    } catch (err) {
      console.error('Failed to load pcvt_grid.json:', err);
      return null;
    }
  }

  build(data) {
    if (data) this.gridData = data;
    if (!this.gridData) {
      console.warn('GridMapTable: No data to build!');
      return;
    }

    // Set position and rotation of the root group
    // Center at (26, 0.95, 0), rotated by -π/2 around Y
    this.rootGroup.position.set(GRID_TABLE.position.x, this.tableHeight, GRID_TABLE.position.z);
    this.rootGroup.rotation.y = -Math.PI / 2;

    // Apply tilt to local table group
    this.tableGroup.rotation.x = this.tiltRad;

    // 1. Build Physical Table Furniture (chân bàn, mặt bàn, viền kim loại)
    this.buildTableFurniture();

    // 2. Build Base Map Texture Board
    this.buildMapBoard();

    // 3. Mount all layer groups to table
    Object.values(this.layers).forEach(grp => this.tableGroup.add(grp));

    // 3b. Build New Boundaries Layer (Mục B.2: ranh_gioi_moi 1E40A0)
    this.buildNewBoundaries();

    // 4. Build Power Lines (500kV, 220kV, 110kV LineSegments)
    this.buildPowerLines();

    // 5. Build Substations using InstancedMesh (5 nhóm cấp điện áp)
    this.buildSubstations();

    // 6. Build PCVT Facilities using InstancedMesh (4 cơ sở)
    this.buildPcvtFacilities();

    // 7. Build Administrative Wards & Outbound Labels on a single texture plane
    this.buildWardsAndLabelsOverlay();

    // 8. Build 3D Legend Plaque beside table (không có ĐBGT)
    this.build3DLegendPlaque();

    this.scene.add(this.rootGroup);
    console.log('GridMapTable 3D build complete with InstancedMeshes and <= 20 draw calls.');
  }

  // ===========================================================================
  // 1. BÀN SA BÀN KIẾN TRÚC HIỆN ĐẠI
  // ===========================================================================
  buildTableFurniture() {
    const w = this.tableWidth;
    const d = this.tableDepth;
    const h = this.tableHeight;

    const matTitanium = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.35,
      metalness: 0.85
    });

    const matBorder = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.3,
      metalness: 0.7
    });

    // Mặt bàn chính đỡ sa bàn
    const topBoardGeo = new THREE.BoxGeometry(w, 0.08, d);
    const topBoard = new THREE.Mesh(topBoardGeo, matTitanium);
    topBoard.position.y = -0.04;
    topBoard.receiveShadow = true;
    this.tableGroup.add(topBoard);

    // Gờ vát bảo vệ xung quanh mép bàn
    const bevelGeo = new THREE.BoxGeometry(w + 0.12, 0.09, d + 0.12);
    const bevelMesh = new THREE.Mesh(bevelGeo, matBorder);
    bevelMesh.position.y = -0.045;
    this.tableGroup.add(bevelMesh);

    // 4 Chân bàn chịu lực
    const legGeo = new THREE.CylinderGeometry(0.08, 0.08, h + 0.3, 16);
    const legMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.3,
      metalness: 0.8
    });

    const legPositions = [
      [-w / 2 + 0.35, d / 2 - 0.45],
      [ w / 2 - 0.35, d / 2 - 0.45],
      [-w / 2 + 0.35, -d / 2 + 0.45],
      [ w / 2 - 0.35, -d / 2 + 0.45]
    ];

    legPositions.forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, -h / 2 - 0.05, lz);
      this.tableGroup.add(leg);
    });
  }

  // ===========================================================================
  // 2. MẶT BẢN ĐỒ VÀ HITBOX BÀN
  // ===========================================================================
  buildMapBoard() {
    const texLoader = new THREE.TextureLoader();
    const baseTex = texLoader.load('assets/grid/base_low.webp');
    baseTex.colorSpace = THREE.SRGBColorSpace;
    baseTex.generateMipmaps = true;
    baseTex.minFilter = THREE.LinearMipmapLinearFilter;

    // Mặt bản đồ: đặt ở y = 0.02, KHÔNG dùng polygonOffset, toneMapped = false (Mục B.0 & B.1)
    const boardGeo = new THREE.PlaneGeometry(this.mapW, this.mapD);
    const boardMat = new THREE.MeshBasicMaterial({
      map: baseTex,
      toneMapped: false
    });

    const boardMesh = new THREE.Mesh(boardGeo, boardMat);
    boardMesh.rotation.x = -Math.PI / 2;
    boardMesh.position.y = 0.02;
    boardMesh.name = 'GridMap_Board_Mesh';
    this.tableGroup.add(boardMesh);
    this.boardMesh = boardMesh;

    // Hitbox cho toàn bộ mặt bàn sa bàn (raycast khi người dùng bấm vào sa bàn)
    const hitGeo = new THREE.PlaneGeometry(this.tableWidth, this.tableDepth);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.tableHitMesh = new THREE.Mesh(hitGeo, hitMat);
    this.tableHitMesh.rotation.x = -Math.PI / 2;
    this.tableHitMesh.position.y = 0.021;
    this.tableHitMesh.userData = { isGridTableSurface: true };
    this.tableGroup.add(this.tableHitMesh);
    this.interactiveObjects.push(this.tableHitMesh);
  }

  // Tải 6 ô nét khi cách sa bàn dưới 15 m (Mục B.1)
  updateTilesLOD(cameraPos) {
    if (this._tilesLoaded || !this.boardMesh || !cameraPos) return;
    const worldCenter = new THREE.Vector3(26, 0.95, 0);
    if (cameraPos.distanceTo(worldCenter) < 15.0) {
      this._tilesLoaded = true;
      this.loadHighResTiles();
    }
  }

  loadHighResTiles() {
    const texLoader = new THREE.TextureLoader();
    const cols = 2;
    const rows = 3;
    const tileW = this.mapW / cols;
    const tileD = this.mapD / rows;

    const tilesGroup = new THREE.Group();
    tilesGroup.name = 'GridMap_HighResTiles';

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tileTex = texLoader.load(`assets/grid/base_${r}_${c}.webp`);
        tileTex.colorSpace = THREE.SRGBColorSpace;
        tileTex.generateMipmaps = true;

        const tileGeo = new THREE.PlaneGeometry(tileW, tileD);
        const tileMat = new THREE.MeshBasicMaterial({
          map: tileTex,
          toneMapped: false
        });
        const tileMesh = new THREE.Mesh(tileGeo, tileMat);
        tileMesh.rotation.x = -Math.PI / 2;
        const lx = (c + 0.5 - cols / 2) * tileW;
        const lz = (r + 0.5 - rows / 2) * tileD;
        tileMesh.position.set(lx, 0.0205, lz);
        tilesGroup.add(tileMesh);
      }
    }
    this.tableGroup.add(tilesGroup);
    this.highResTilesGroup = tilesGroup;
    console.log('GridMapTable: Loaded 6 high-res tiles at distance < 15m.');
  }

  // Chuyển đổi tọa độ chuẩn hóa [0..1] sang tọa độ cục bộ trên sa bàn
  // nx: 0 (Tây) -> 1 (Đông); ny: 0 (Bắc) -> 1 (Nam)
  mapToLocal(nx, ny, elevation = 0.030) {
    const lx = (nx - 0.5) * this.mapW;
    const lz = (ny - 0.5) * this.mapD;
    return new THREE.Vector3(lx, elevation, lz);
  }

  // ===========================================================================
  // 2b. LỚP RANH GIỚI PHƯỜNG/XÃ MỚI (MỤC B.2)
  // Gộp 1 geometry, màu #1E40A0, cao hơn mặt bàn 1 cm (y = 0.03)
  // ===========================================================================
  buildNewBoundaries() {
    const ranhGioiMoi = this.gridData?.ranh_gioi_moi || [];
    if (ranhGioiMoi.length === 0) return;

    const linePoints = [];
    const elev = 0.030; // Cao hơn mặt bản đồ 1 cm (y = 0.02 -> y = 0.03)

    ranhGioiMoi.forEach(poly => {
      if (!poly || poly.length < 2) return;
      for (let i = 0; i < poly.length - 1; i++) {
        const p1 = this.mapToLocal(poly[i][0], poly[i][1], elev);
        const p2 = this.mapToLocal(poly[i + 1][0], poly[i + 1][1], elev);
        linePoints.push(p1, p2);
      }
    });

    if (linePoints.length > 0) {
      const geo = new THREE.BufferGeometry().setFromPoints(linePoints);
      const mat = new THREE.LineBasicMaterial({
        color: 0x1e40a0,
        linewidth: 3,
        transparent: true,
        opacity: 0.95
      });
      const linesMesh = new THREE.LineSegments(geo, mat);
      linesMesh.name = 'GridMap_NewBoundaries';
      this.layers.ranhGioiMoi.add(linesMesh);
      console.log(`GridMapTable: Built new boundaries layer with ${linePoints.length / 2} segments (1 draw call).`);
    }
  }

  // ===========================================================================
  // 3. ĐƯỜNG DÂY TRUYỀN TẢI (500kV, 220kV, 110kV LineSegments)
  // ===========================================================================
  buildPowerLines() {
    const duongDay = this.gridData.duong_day;
    if (!duongDay) return;

    const configs = [
      {
        cap: '500kV',
        color: 0xe879f9, // Hồng tím
        group: this.layers.lines500,
        height: 0.038
      },
      {
        cap: '220kV',
        color: 0xf87171, // Đỏ
        group: this.layers.lines220,
        height: 0.035
      },
      {
        cap: '110kV',
        color: 0x22d3ee, // Cyan
        group: this.layers.lines110,
        height: 0.032
      }
    ];

    configs.forEach(cfg => {
      const segs = duongDay[cfg.cap] || [];
      const solidPoints = [];
      const dashPoints = [];

      segs.forEach(seg => {
        const pts = seg.points;
        if (!pts || pts.length < 2) return;

        const pathVecs = [];
        for (let i = 0; i < pts.length; i++) {
          const vec = this.mapToLocal(pts[i][0], pts[i][1], cfg.height);
          pathVecs.push(vec);
        }

        if (seg.quy_hoach) {
          for (let i = 0; i < pathVecs.length - 1; i++) {
            dashPoints.push(pathVecs[i], pathVecs[i + 1]);
          }
        } else {
          for (let i = 0; i < pathVecs.length - 1; i++) {
            solidPoints.push(pathVecs[i], pathVecs[i + 1]);
          }
        }
      });

      // Đường nét liền hiện trạng
      if (solidPoints.length > 0) {
        const solidGeo = new THREE.BufferGeometry().setFromPoints(solidPoints);
        const solidMat = new THREE.LineBasicMaterial({
          color: cfg.color,
          linewidth: 2,
          transparent: true,
          opacity: 0.95
        });
        const solidLine = new THREE.LineSegments(solidGeo, solidMat);
        solidLine.name = `Lines_${cfg.cap}_Solid`;
        cfg.group.add(solidLine);
      }

      // Đường nét đứt quy hoạch
      if (dashPoints.length > 0) {
        const dashGeo = new THREE.BufferGeometry().setFromPoints(dashPoints);
        const dashMat = new THREE.LineDashedMaterial({
          color: cfg.color,
          dashSize: 0.05,
          gapSize: 0.03,
          linewidth: 1.5,
          transparent: true,
          opacity: 0.75
        });
        const dashLine = new THREE.LineSegments(dashGeo, dashMat);
        dashLine.computeLineDistances();
        dashLine.name = `Lines_${cfg.cap}_QuyHoach`;
        this.layers.quyHoach.add(dashLine);
      }
    });
  }

  // ===========================================================================
  // 4. TRẠM BIẾN ÁP (44 trạm gom thành 5 InstancedMesh)
  // ===========================================================================
  buildSubstations() {
    const tramList = this.gridData.tram || [];
    if (tramList.length === 0) return;

    // Phân nhóm theo cấp điện áp
    const groups = {
      '500kV': {
        items: [],
        height: 0.08,
        radius: 0.040,
        color: 0xe879f9,
        targetGroup: this.layers.tram500
      },
      '220kV': {
        items: [],
        height: 0.055,
        radius: 0.030,
        color: 0xf87171,
        targetGroup: this.layers.tram220
      },
      '110kV_luoi': {
        items: [],
        height: 0.038,
        radius: 0.022,
        color: 0x22d3ee,
        targetGroup: this.layers.tram110
      },
      '110kV_kh': {
        items: [],
        height: 0.028,
        radius: 0.018,
        color: 0xcbd5e1,
        targetGroup: this.layers.tramKH
      },
      'lan_can': {
        items: [],
        height: 0.038,
        radius: 0.022,
        color: 0xf59e0b,
        targetGroup: this.layers.tramLanCan
      }
    };

    tramList.forEach(t => {
      if (t.dien_ap === '500kV') {
        groups['500kV'].items.push(t);
      } else if (t.dien_ap === '220kV') {
        groups['220kV'].items.push(t);
      } else if (t.loai === 'lan_can') {
        groups['lan_can'].items.push(t);
      } else if (t.loai === 'khach_hang') {
        groups['110kV_kh'].items.push(t);
      } else {
        groups['110kV_luoi'].items.push(t);
      }
    });

    // Dựng 1 InstancedMesh cho mỗi nhóm
    const dummy = new THREE.Object3D();

    Object.entries(groups).forEach(([key, grp]) => {
      const count = grp.items.length;
      if (count === 0) return;

      const geo = new THREE.CylinderGeometry(grp.radius * 0.85, grp.radius, grp.height, 16);
      const mat = new THREE.MeshStandardMaterial({
        color: grp.color,
        emissive: new THREE.Color(grp.color),
        emissiveIntensity: 0.45,
        roughness: 0.3,
        metalness: 0.7
      });

      const instMesh = new THREE.InstancedMesh(geo, mat, count);
      instMesh.name = `InstancedSubstations_${key}`;
      instMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

      grp.items.forEach((t, idx) => {
        const pos = this.mapToLocal(t.x, t.y, 0.035);
        dummy.position.set(pos.x, grp.height / 2 + 0.035, pos.z);
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        instMesh.setMatrixAt(idx, dummy.matrix);
      });

      instMesh.instanceMatrix.needsUpdate = true;

      // Metadata cho raycasting
      instMesh.userData = {
        isGridTramInstanced: true,
        tramList: grp.items,
        groupKey: key
      };

      grp.targetGroup.add(instMesh);
      this.instancedTramMeshes.push(instMesh);
      this.interactiveObjects.push(instMesh);
    });
  }

  // ===========================================================================
  // 5. CƠ SỞ PCVT (4 cơ sở gom thành 1 InstancedMesh)
  // ===========================================================================
  buildPcvtFacilities() {
    const coSoList = this.gridData.co_so || [];
    if (coSoList.length === 0) return;

    const count = coSoList.length;
    // Hình chóp bát giác màu xanh EVN (#1E40A0)
    const geo = new THREE.ConeGeometry(0.035, 0.065, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1e40a0,
      emissive: new THREE.Color(0x1e40a0),
      emissiveIntensity: 0.4,
      roughness: 0.25,
      metalness: 0.7
    });

    const instMesh = new THREE.InstancedMesh(geo, mat, count);
    instMesh.name = 'InstancedFacilities_PCVT';
    instMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    const dummy = new THREE.Object3D();
    coSoList.forEach((cs, idx) => {
      const pos = this.mapToLocal(cs.x, cs.y, 0.035);
      dummy.position.set(pos.x, 0.0325 + 0.035, pos.z);
      dummy.rotation.set(Math.PI, 0, 0); // chúc mũi kim xuống mặt bàn
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      instMesh.setMatrixAt(idx, dummy.matrix);
    });

    instMesh.instanceMatrix.needsUpdate = true;
    instMesh.userData = {
      isGridCoSoInstanced: true,
      coSoList: coSoList
    };

    this.layers.coSo.add(instMesh);
    this.instancedCoSoMesh = instMesh;
    this.interactiveObjects.push(instMesh);
  }

  // ===========================================================================
  // 6. NHÃN 14 PHƯỜNG & MŨI TÊN OUTBOUND (MỤC B.3: cao 0.18m, chữ #0F172A viền trắng 4px, y = 0.025)
  // ===========================================================================
  buildWardsAndLabelsOverlay() {
    const phuongList = this.gridData.phuong || [];
    const nhanNgoaiList = this.gridData.nhan_ngoai || [];

    // Tạo canvas kích thước 2048 x (2048 / mapAspect)
    const cW = 2048;
    const cH = Math.round(cW / this.mapAspect);
    const canvas = document.createElement('canvas');
    canvas.width = cW;
    canvas.height = cH;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, cW, cH);

    // 1. Tên 14 phường/xã hành chính mới (Mục B.3: chữ #0F172A weight 700, viền trắng 4px)
    ctx.font = `700 36px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    phuongList.forEach(ph => {
      const px = ph.x * cW;
      const py = ph.y * cH;

      // Viền trắng 4px (lineWidth = 8px cho strokeText)
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 8;
      ctx.strokeText(ph.ten, px, py);

      // Chữ màu #0F172A
      ctx.fillStyle = '#0f172a';
      ctx.fillText(ph.ten, px, py);
    });

    // 2. Các mũi tên outbound ("Đi trạm...", "Từ trạm...")
    nhanNgoaiList.forEach(nh => {
      const px = nh.x * cW;
      const py = nh.y * cH;

      const labelText = `➜ ${nh.ten}`;
      ctx.font = `700 28px ${FONT_FAMILY}`;
      const metrics = ctx.measureText(labelText);
      const badgeW = Math.max(300, metrics.width + 36);
      const badgeH = 58;
      const bx = px - badgeW / 2;
      const by = py - badgeH / 2;

      // Nền xanh EVN viền cyan
      ctx.fillStyle = 'rgba(30, 64, 160, 0.90)';
      ctx.beginPath();
      ctx.roundRect(bx, by, badgeW, badgeH, 12);
      ctx.fill();

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, px, py);
    });

    const overlayTex = new THREE.CanvasTexture(canvas);
    overlayTex.colorSpace = THREE.SRGBColorSpace;
    overlayTex.generateMipmaps = true;
    overlayTex.minFilter = THREE.LinearMipmapLinearFilter;

    const overlayGeo = new THREE.PlaneGeometry(this.mapW, this.mapD);
    const overlayMat = new THREE.MeshBasicMaterial({
      map: overlayTex,
      transparent: true,
      depthWrite: false
    });

    const overlayMesh = new THREE.Mesh(overlayGeo, overlayMat);
    overlayMesh.rotation.x = -Math.PI / 2;
    overlayMesh.position.y = 0.025; // Nằm ở y = 0.025, trên nền bản đồ y = 0.02 (Mục B.0 & B.3)
    overlayMesh.name = 'GridMap_WardsLabelsOverlay';
    this.layers.phuong.add(overlayMesh);
  }

  // ===========================================================================
  // 7. BẢNG CHÚ THÍCH 3D ĐẶT CẠNH BÀN (KHÔNG CÒN ĐBGT)
  // ===========================================================================
  build3DLegendPlaque() {
    const group = new THREE.Group();
    // Đặt ở cạnh Tây-Nam sa bàn: x = -this.tableWidth/2 - 0.25, z = this.tableDepth/2 - 1.2
    group.position.set(-this.tableWidth / 2 - 0.25, 0.05, this.tableDepth / 2 - 1.2);
    group.rotation.y = Math.PI / 6;

    const w = 1.1;
    const h = 0.85;

    // Chân đế cột
    const standMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.4,
      metalness: 0.8
    });
    const standMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.85, 16), standMat);
    standMesh.position.y = -0.42;
    group.add(standMesh);

    // Bảng chú thích
    const boardMat = new THREE.MeshStandardMaterial({
      color: 0x1e40a0,
      roughness: 0.3,
      metalness: 0.4
    });
    const boardMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), boardMat);
    group.add(boardMesh);

    // Canvas chú thích 3D (bỏ hoàn toàn 3 dòng ĐBGT theo Mục B2)
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 700;
    const ctx = canvas.getContext('2d');

    // Nền tối thanh lịch
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 900, 700);

    // Khung viền xanh EVN & cyan
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, 880, 680);

    // Tiêu đề bảng chú thích
    ctx.fillStyle = '#38bdf8';
    ctx.font = `800 32px ${FONT_FAMILY}`;
    ctx.fillText('CHÚ THÍCH LƯỚI ĐIỆN PCVT', 30, 56);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(30, 76);
    ctx.lineTo(850, 76);
    ctx.stroke();

    // Hàng chú thích chuẩn mực (không còn ĐBGT)
    const items = [
      { text: 'Đường dây 500kV (Hiện trạng / Quy hoạch)', color: '#e879f9', type: 'line' },
      { text: 'Đường dây 220kV (Hiện trạng / Quy hoạch)', color: '#f87171', type: 'line' },
      { text: 'Đường dây 110kV (Hiện trạng / Quy hoạch)', color: '#22d3ee', type: 'line' },
      { text: 'Trạm TBA 500kV (1 trạm: Phú Mỹ)', color: '#e879f9', type: 'dot' },
      { text: 'Trạm TBA 220kV (6 trạm lưới)', color: '#f87171', type: 'dot' },
      { text: 'Trạm TBA 110kV Lưới (19 trạm)', color: '#22d3ee', type: 'dot' },
      { text: 'Trạm TBA 110kV Khách hàng (15 trạm)', color: '#cbd5e1', type: 'dot' },
      { text: 'Trạm lân cận (3 trạm: Ngãi Giao, Long Đất, An Ngãi)', color: '#f59e0b', type: 'dot' },
      { text: 'Cơ sở PCVT (Cơ sở 1, 2, 3, 4)', color: '#1e40a0', type: 'pin' }
    ];

    let startY = 125;
    items.forEach(it => {
      ctx.fillStyle = it.color;
      if (it.type === 'line') {
        ctx.fillRect(36, startY - 8, 48, 6);
      } else if (it.type === 'dot') {
        ctx.beginPath();
        ctx.arc(60, startY - 5, 9, 0, Math.PI * 2);
        ctx.fill();
      } else if (it.type === 'pin') {
        ctx.fillRect(52, startY - 12, 16, 16);
      }

      ctx.fillStyle = '#f1f5f9';
      ctx.font = `500 25px ${FONT_FAMILY}`;
      ctx.fillText(it.text, 105, startY);
      startY += 48;
    });

    // Dòng nguồn
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.moveTo(30, 605);
    ctx.lineTo(850, 605);
    ctx.stroke();

    ctx.fillStyle = 'rgba(148, 163, 184, 0.9)';
    ctx.font = `italic 400 20px ${FONT_FAMILY}`;
    ctx.fillText('Nguồn: Bản đồ địa dư PCVT – lưới điện 110/220/500kV', 30, 642);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const faceMat = new THREE.MeshBasicMaterial({ map: tex });
    const faceMesh = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, h - 0.04), faceMat);
    faceMesh.position.z = 0.021;
    group.add(faceMesh);

    this.tableGroup.add(group);
  }

  // ===========================================================================
  // 8. QUẢN LÝ LỌC LỚP
  // ===========================================================================
  setLayerVisibility(layerKey, isVisible) {
    this.layerVisibility[layerKey] = isVisible;

    switch (layerKey) {
      case 'line500':
        this.layers.lines500.visible = isVisible;
        this.layers.tram500.visible = isVisible;
        break;
      case 'line220':
        this.layers.lines220.visible = isVisible;
        this.layers.tram220.visible = isVisible;
        break;
      case 'line110':
        this.layers.lines110.visible = isVisible;
        this.layers.tram110.visible = isVisible;
        break;
      case 'khachHang':
        this.layers.tramKH.visible = isVisible;
        break;
      case 'quyHoach':
        this.layers.quyHoach.visible = isVisible;
        break;
      case 'ranhGioiMoi':
        this.layers.ranhGioiMoi.visible = isVisible;
        break;
      case 'phuong':
        this.layers.phuong.visible = isVisible;
        break;
      default:
        break;
    }
  }

  // ===========================================================================
  // 9. ANIMATION & LOD
  // ===========================================================================
  animate(_delta, _time, cameraPos) {
    if (cameraPos) {
      this.updateTilesLOD(cameraPos);
    }
  }
}
