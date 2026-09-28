import * as THREE from 'three';
import { GRID_TABLE } from './layout-config.js';

const FONT_FAMILY = '"Be Vietnam Pro", system-ui, sans-serif';

/**
 * GridMapTable (Sa bàn lưới điện 3D Công ty Điện lực Vũng Tàu)
 * Theo Kế hoạch nâng cấp GĐ5 (Mục 6A):
 * - Vị trí: tâm (43, 0), kích thước 4.2m × 6.0m, cao 0.95m, nghiêng 8° về phía Nam
 * - Hướng Bắc bản đồ trùng hướng Bắc của phòng (-Z)
 * - Nền: ảnh bản đồ base_low.webp và vector khớp 100%
 * - Đường dây 3 cấp: 500kV (hồng tím), 220kV (đỏ), 110kV (cyan) với xung sáng chạy dọc dây
 * - 44 Trạm: 1 500kV (cao 8cm), 6 220kV (cao 5cm), 19 110kV lưới (cao 3cm), 15 110kV KH (xám bạc), 3 trạm lân cận
 * - 4 Cơ sở PCVT (ghim xanh EVNHCMC viền vàng)
 * - 12 Công trình ĐBGT (3 màu trạng thái)
 * - Bảng chú thích 3D đặt cạnh bàn
 * - Bảng lọc lớp và tương tác raycast
 */
export class GridMapTable {
  constructor(scene) {
    this.scene = scene;
    this.tableGroup = new THREE.Group();
    this.tableGroup.name = 'GridMapTable_Group';

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
      tram500: new THREE.Group(),
      tram220: new THREE.Group(),
      tram110: new THREE.Group(),
      tramKH: new THREE.Group(),
      tramLanCan: new THREE.Group(),
      coSo: new THREE.Group(),
      dbgt: new THREE.Group(),
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
      dbgt: true,
      labels: true,
      phuong: true
    };

    // Dynamic animation elements
    this.pulseParticles = [];
    this.beaconMeshes = [];

    // Table & Map sizing
    this.tableWidth = GRID_TABLE.width || 4.2;
    this.tableDepth = GRID_TABLE.depth || 6.0;
    this.tableHeight = GRID_TABLE.height || 0.95;
    this.tiltRad = -(GRID_TABLE.tiltDeg || 8) * Math.PI / 180; // nghiêng về Nam (+Z)

    // Map board dimensions inside table bevel (aspect ratio from PDF = 2364.0 / 3116.88 = 0.75845)
    this.mapAspect = 2364.0 / 3116.88;
    this.mapW = 4.0;
    this.mapD = this.mapW / this.mapAspect; // ≈ 5.274m
  }

  async loadData() {
    try {
      const res = await fetch('assets/grid/pcvt_grid.json?v=' + Date.now());
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      this.gridData = await res.json();
      console.log('GridMapTable data loaded successfully:', {
        tram: this.gridData.tram?.length,
        coSo: this.gridData.co_so?.length,
        phuong: this.gridData.phuong?.length,
        dbgt: this.gridData.dbgt?.length
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

    // Set position and tilt of the entire table group
    // Table center in room: (43, 0.95, 0)
    this.tableGroup.position.set(GRID_TABLE.position.x, this.tableHeight, GRID_TABLE.position.z);
    this.tableGroup.rotation.x = this.tiltRad;

    // 1. Build Physical Table Furniture (chân bàn, mặt bàn, phào LED)
    this.buildTableFurniture();

    // 2. Build Base Map Texture Board
    this.buildMapBoard();

    // 3. Mount all layer groups to table
    Object.values(this.layers).forEach(grp => this.tableGroup.add(grp));

    // 4. Build Power Lines (500kV, 220kV, 110kV)
    this.buildPowerLines();

    // 5. Build Substations (44 trạm)
    this.buildSubstations();

    // 6. Build PCVT Facilities (4 cơ sở)
    this.buildPcvtFacilities();

    // 7. Build Transport Sync Projects (12 công trình ĐBGT)
    this.buildDbgtProjects();

    // 8. Build Administrative Wards & Outbound Labels
    this.buildWardsAndLabels();

    // 9. Build 3D Legend Plaque beside table
    this.build3DLegendPlaque();

    this.scene.add(this.tableGroup);
    console.log('GridMapTable 3D build complete with', this.interactiveObjects.length, 'interactive objects.');
  }

  // ===========================================================================
  // 1. BÀN SA BÀN KIẾN TRÚC HIỆN ĐẠI
  // ===========================================================================
  buildTableFurniture() {
    const w = this.tableWidth;
    const d = this.tableDepth;
    const h = this.tableHeight;

    // Materials
    const matTitanium = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.35,
      metalness: 0.85
    });

    const matDarkBezel = new THREE.MeshStandardMaterial({
      color: 0x090e17,
      roughness: 0.4,
      metalness: 0.7
    });

    const matCyanLED = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: new THREE.Color(0x22d3ee),
      emissiveIntensity: 1.5,
      roughness: 0.2
    });

    // Mặt bàn chính (khung dày 15cm)
    const tableTopGeo = new THREE.BoxGeometry(w, 0.15, d);
    const tableTopMesh = new THREE.Mesh(tableTopGeo, matTitanium);
    tableTopMesh.position.y = -0.075;
    tableTopMesh.receiveShadow = true;
    this.tableGroup.add(tableTopMesh);

    // 4 Thanh gờ viền titan tối bao quanh 4 mép bàn (độ dày viền 6cm, cao 2.5cm)
    const rimThick = 0.06;
    const rimH = 0.025;
    const rimY = rimH / 2;

    // Viền Bắc & Nam
    const rimNSGeo = new THREE.BoxGeometry(w + rimThick * 2, rimH, rimThick);
    const rimNorth = new THREE.Mesh(rimNSGeo, matDarkBezel);
    rimNorth.position.set(0, rimY, -(d / 2 + rimThick / 2));
    this.tableGroup.add(rimNorth);

    const rimSouth = new THREE.Mesh(rimNSGeo, matDarkBezel);
    rimSouth.position.set(0, rimY, (d / 2 + rimThick / 2));
    this.tableGroup.add(rimSouth);

    // Viền Tây & Đông
    const rimEWGeo = new THREE.BoxGeometry(rimThick, rimH, d);
    const rimWest = new THREE.Mesh(rimEWGeo, matDarkBezel);
    rimWest.position.set(-(w / 2 + rimThick / 2), rimY, 0);
    this.tableGroup.add(rimWest);

    const rimEast = new THREE.Mesh(rimEWGeo, matDarkBezel);
    rimEast.position.set((w / 2 + rimThick / 2), rimY, 0);
    this.tableGroup.add(rimEast);

    // Dải LED cyan phát sáng chạy theo rãnh viền mép ngoài của bàn
    const ledMat = matCyanLED;
    const ledThick = 0.015;
    const ledH = 0.01;
    const ledNSGeo = new THREE.BoxGeometry(w + rimThick * 2 + 0.02, ledH, ledThick);
    const ledNorth = new THREE.Mesh(ledNSGeo, ledMat);
    ledNorth.position.set(0, 0.002, -(d / 2 + rimThick + ledThick / 2));
    this.tableGroup.add(ledNorth);

    const ledSouth = new THREE.Mesh(ledNSGeo, ledMat);
    ledSouth.position.set(0, 0.002, (d / 2 + rimThick + ledThick / 2));
    this.tableGroup.add(ledSouth);

    const ledEWGeo = new THREE.BoxGeometry(ledThick, ledH, d + rimThick * 2);
    const ledWest = new THREE.Mesh(ledEWGeo, ledMat);
    ledWest.position.set(-(w / 2 + rimThick + ledThick / 2), 0.002, 0);
    this.tableGroup.add(ledWest);

    const ledEast = new THREE.Mesh(ledEWGeo, ledMat);
    ledEast.position.set((w / 2 + rimThick + ledThick / 2), 0.002, 0);
    this.tableGroup.add(ledEast);

    // 4 Chân bàn kim loại chữ V hiện đại nối xuống sàn
    // Do bàn nghiêng 8°, chân bàn được đặt ở các góc và vát theo chiều cao
    const legGeo = new THREE.CylinderGeometry(0.08, 0.12, h, 16);
    const legPositions = [
      { x: -(w / 2 - 0.25), z: -(d / 2 - 0.3) },
      { x:  (w / 2 - 0.25), z: -(d / 2 - 0.3) },
      { x: -(w / 2 - 0.25), z:  (d / 2 - 0.3) },
      { x:  (w / 2 - 0.25), z:  (d / 2 - 0.3) }
    ];

    legPositions.forEach(lp => {
      const leg = new THREE.Mesh(legGeo, matTitanium);
      leg.position.set(lp.x, -h / 2 - 0.075, lp.z);
      // Giữ chân bàn đứng thẳng so với phòng bằng cách bù góc nghiêng ngược lại
      leg.rotation.x = -this.tiltRad;
      this.tableGroup.add(leg);
    });

    // Khung giằng chân chữ H ở đáy
    const braceGeo = new THREE.BoxGeometry(w - 0.5, 0.08, 0.08);
    const braceMesh = new THREE.Mesh(braceGeo, matTitanium);
    braceMesh.position.set(0, -h + 0.2, 0);
    braceMesh.rotation.x = -this.tiltRad;
    this.tableGroup.add(braceMesh);
  }

  // ===========================================================================
  // 2. MẶT BẢN ĐỒ ĐỊA DƯ VÀ HITBOX BÀN
  // ===========================================================================
  buildMapBoard() {
    const texLoader = new THREE.TextureLoader();
    const baseTex = texLoader.load('assets/grid/base_low.webp');
    baseTex.colorSpace = THREE.SRGBColorSpace;
    baseTex.generateMipmaps = true;
    baseTex.minFilter = THREE.LinearMipmapLinearFilter;

    // Mặt bản đồ nằm ngang trong hệ tọa độ cục bộ của bàn
    const boardGeo = new THREE.PlaneGeometry(this.mapW, this.mapD);
    const boardMat = new THREE.MeshStandardMaterial({
      map: baseTex,
      roughness: 0.35,
      metalness: 0.15,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });

    const boardMesh = new THREE.Mesh(boardGeo, boardMat);
    boardMesh.rotation.x = -Math.PI / 2;
    boardMesh.position.y = 0.005;
    boardMesh.receiveShadow = true;
    this.tableGroup.add(boardMesh);

    // Hitbox cho toàn bộ mặt bàn sa bàn (raycast khi người dùng bấm vào sa bàn)
    const hitGeo = new THREE.PlaneGeometry(this.tableWidth, this.tableDepth);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.tableHitMesh = new THREE.Mesh(hitGeo, hitMat);
    this.tableHitMesh.rotation.x = -Math.PI / 2;
    this.tableHitMesh.position.y = 0.01;
    this.tableHitMesh.userData = { isGridTableSurface: true };
    this.tableGroup.add(this.tableHitMesh);
    this.interactiveObjects.push(this.tableHitMesh);
  }

  // Chuyển đổi tọa độ chuẩn hóa [0..1] sang tọa độ cục bộ trên sa bàn
  // nx: 0 (Tây) -> 1 (Đông); ny: 0 (Bắc) -> 1 (Nam)
  mapToLocal(nx, ny, elevation = 0.015) {
    const lx = (nx - 0.5) * this.mapW;
    const lz = (ny - 0.5) * this.mapD;
    return new THREE.Vector3(lx, elevation, lz);
  }

  // ===========================================================================
  // 3. ĐƯỜNG DÂY TRUYỀN TẢI & XUNG SÁNG (500kV, 220kV, 110kV)
  // ===========================================================================
  buildPowerLines() {
    const duongDay = this.gridData.duong_day;
    if (!duongDay) return;

    // Cấu hình từng cấp
    const configs = [
      {
        cap: '500kV',
        color: 0xe879f9, // Hồng tím
        group: this.layers.lines500,
        height: 0.024,
        pulseSpeed: 0.28,
        pulseSize: 0.035,
        pulseCount: 8
      },
      {
        cap: '220kV',
        color: 0xf87171, // Đỏ
        group: this.layers.lines220,
        height: 0.020,
        pulseSpeed: 0.22,
        pulseSize: 0.028,
        pulseCount: 16
      },
      {
        cap: '110kV',
        color: 0x22d3ee, // Cyan
        group: this.layers.lines110,
        height: 0.016,
        pulseSpeed: 0.18,
        pulseSize: 0.020,
        pulseCount: 24
      }
    ];

    configs.forEach(cfg => {
      const segs = duongDay[cfg.cap] || [];
      const solidPoints = [];
      const dashPoints = [];
      const keyTransmissionPaths = [];

      segs.forEach(seg => {
        const pts = seg.points;
        if (!pts || pts.length < 2) return;

        const pathVecs = [];
        for (let i = 0; i < pts.length; i++) {
          const vec = this.mapToLocal(pts[i][0], pts[i][1], cfg.height);
          pathVecs.push(vec);
        }

        if (seg.quy_hoach) {
          // Quy hoạch: nét đứt
          for (let i = 0; i < pathVecs.length - 1; i++) {
            dashPoints.push(pathVecs[i], pathVecs[i + 1]);
          }
        } else {
          // Hiện trạng: nét liền
          for (let i = 0; i < pathVecs.length - 1; i++) {
            solidPoints.push(pathVecs[i], pathVecs[i + 1]);
          }
          if (pathVecs.length >= 3) {
            keyTransmissionPaths.push(pathVecs);
          }
        }
      });

      // Tạo đường nét liền hiện trạng
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

      // Tạo đường nét đứt quy hoạch (đưa vào nhóm quy hoạch để dễ toggle)
      if (dashPoints.length > 0) {
        const dashGeo = new THREE.BufferGeometry().setFromPoints(dashPoints);
        const dashMat = new THREE.LineDashedMaterial({
          color: cfg.color,
          dashSize: 0.04,
          gapSize: 0.025,
          transparent: true,
          opacity: 0.75
        });
        const dashLine = new THREE.LineSegments(dashGeo, dashMat);
        dashLine.computeLineDistances();
        dashLine.name = `Lines_${cfg.cap}_QuyHoach`;
        this.layers.quyHoach.add(dashLine);
      }

      // Tạo xung sáng chuyển động (electric energy pulses) chạy dọc theo dây
      if (keyTransmissionPaths.length > 0) {
        this.createEnergyPulses(cfg, keyTransmissionPaths);
      }
    });
  }

  createEnergyPulses(cfg, paths) {
    const pulseMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95
    });

    const glowMat = new THREE.MeshBasicMaterial({
      color: cfg.color,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending
    });

    // Chọn tối đa 10 tuyến quan trọng để sinh xung sáng
    const selectedPaths = paths.slice(0, 10);
    selectedPaths.forEach((pathPts, pIdx) => {
      // Tính curve 3D
      const curve = new THREE.CatmullRomCurve3(pathPts);
      
      const pulseGeo = new THREE.SphereGeometry(cfg.pulseSize * 0.7, 8, 8);
      const glowGeo = new THREE.SphereGeometry(cfg.pulseSize * 1.5, 8, 8);

      const pulseMesh = new THREE.Mesh(pulseGeo, pulseMat);
      const glowMesh = new THREE.Mesh(glowGeo, glowMat);
      pulseMesh.add(glowMesh);

      cfg.group.add(pulseMesh);

      this.pulseParticles.push({
        mesh: pulseMesh,
        curve: curve,
        speed: cfg.pulseSpeed * (0.8 + Math.random() * 0.4),
        t: (pIdx / selectedPaths.length) % 1.0,
        group: cfg.group
      });
    });
  }

  // ===========================================================================
  // 4. TRẠM BIẾN ÁP (44 trạm: 500kV, 220kV, 110kV lưới, 110kV KH, Lân cận)
  // ===========================================================================
  buildSubstations() {
    const tramList = this.gridData.tram || [];

    tramList.forEach(t => {
      const pos = this.mapToLocal(t.x, t.y, 0);
      let targetGroup = this.layers.tram110;
      let height = 0.03;
      let radius = 0.025;
      let color = 0x22d3ee;
      let isKhachHang = t.loai === 'khach_hang';
      let isLanCan = t.loai === 'lan_can';

      if (t.cap === '500kV') {
        targetGroup = this.layers.tram500;
        height = 0.08;
        radius = 0.045;
        color = 0xe879f9;
      } else if (t.cap === '220kV') {
        targetGroup = this.layers.tram220;
        height = 0.05;
        radius = 0.035;
        color = 0xf87171;
      } else if (isKhachHang) {
        targetGroup = this.layers.tramKH;
        height = 0.025;
        radius = 0.022;
        color = 0xcbd5e1; // Xám bạc cho KH
      } else if (isLanCan) {
        targetGroup = this.layers.tramLanCan;
        height = 0.035;
        radius = 0.03;
        color = 0xf59e0b; // Hổ phách cho trạm lân cận
      }

      // Trụ trạm chính
      const pillarGroup = new THREE.Group();
      pillarGroup.position.copy(pos);

      // Thân trụ hình trụ vát phát sáng
      const pillarGeo = new THREE.CylinderGeometry(radius * 0.8, radius, height, 16);
      const pillarMat = new THREE.MeshStandardMaterial({
        color: color,
        emissive: new THREE.Color(color),
        emissiveIntensity: 1.2,
        roughness: 0.25,
        metalness: 0.8
      });
      const pillarMesh = new THREE.Mesh(pillarGeo, pillarMat);
      pillarMesh.position.y = height / 2;
      pillarGroup.add(pillarMesh);

      // Vòng hào quang phát sáng ở chân trụ
      const ringGeo = new THREE.RingGeometry(radius * 1.1, radius * 1.8, 16);
      const ringMat = new THREE.MeshBasicMaterial({
        color: color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.y = 0.003;
      pillarGroup.add(ringMesh);

      // Viên ngọc phát sáng ở đỉnh trụ (beacon)
      const beaconGeo = new THREE.SphereGeometry(radius * 0.6, 12, 12);
      const beaconMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95
      });
      const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
      beaconMesh.position.y = height + radius * 0.4;
      pillarGroup.add(beaconMesh);

      this.beaconMeshes.push({
        mesh: beaconMesh,
        baseScale: 1.0,
        speed: 3.0 + Math.random() * 2.0
      });

      // Nhãn tên trạm (billboard text badge)
      const labelBadge = this.createSubstationLabel(t.ten, color);
      labelBadge.position.set(0, height + 0.07, 0);
      pillarGroup.add(labelBadge);
      this.layers.labels.add(labelBadge);

      // Hitbox tương tác cho trạm (đường kính đủ rộng để click dễ dàng)
      const hitRadius = Math.max(radius * 2.2, 0.05);
      const hitGeo = new THREE.SphereGeometry(hitRadius, 8, 8);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.position.y = height / 2;
      hitMesh.userData = {
        isGridTram: true,
        tramData: t
      };
      pillarGroup.add(hitMesh);
      this.interactiveObjects.push(hitMesh);

      targetGroup.add(pillarGroup);
    });
  }

  createSubstationLabel(text, colorHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');

    // Nền tối bo tròn
    ctx.fillStyle = 'rgba(11, 21, 48, 0.88)';
    ctx.beginPath();
    ctx.roundRect(6, 6, 372, 84, 16);
    ctx.fill();

    // Viền màu cấp điện áp
    ctx.strokeStyle = `#${colorHex.toString(16).padStart(6, '0')}`;
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // Tên trạm
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 32px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Rút gọn nếu quá dài
    let displayName = text.replace('TBA ', '').replace(' (KCN Phú Mỹ)', '');
    if (displayName.length > 20) {
      displayName = displayName.substring(0, 18) + '...';
    }
    ctx.fillText(displayName, 192, 48);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false
    });

    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.24, 0.06, 1.0);
    return sprite;
  }

  // ===========================================================================
  // 5. CƠ SỞ PCVT (4 cơ sở)
  // ===========================================================================
  buildPcvtFacilities() {
    const coSoList = this.gridData.co_so || [];

    coSoList.forEach(cs => {
      const pos = this.mapToLocal(cs.x, cs.y, 0);
      const group = new THREE.Group();
      group.position.copy(pos);

      // Thân ghim kim cương / lăng kính màu xanh EVNHCMC (#1E40A0) viền vàng (#FACC15)
      const pinMat = new THREE.MeshStandardMaterial({
        color: 0x1e40a0,
        emissive: new THREE.Color(0x1e40a0),
        emissiveIntensity: 0.6,
        roughness: 0.3,
        metalness: 0.7
      });
      const goldRimMat = new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        roughness: 0.25,
        metalness: 0.9
      });

      // Trụ kim cương
      const pinGeo = new THREE.OctahedronGeometry(0.04, 0);
      const pinMesh = new THREE.Mesh(pinGeo, pinMat);
      pinMesh.position.y = 0.07;
      group.add(pinMesh);

      // Viền vàng bao quanh
      const rimMesh = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 8, 24), goldRimMat);
      rimMesh.position.y = 0.07;
      rimMesh.rotation.x = Math.PI / 2;
      group.add(rimMesh);

      // Trụ cắm nối xuống đất
      const shaftGeo = new THREE.CylinderGeometry(0.008, 0.004, 0.06, 8);
      const shaft = new THREE.Mesh(shaftGeo, goldRimMat);
      shaft.position.y = 0.03;
      group.add(shaft);

      // Nhãn Cơ sở
      const labelBadge = this.createSubstationLabel(cs.ten, 0xfacc15);
      labelBadge.position.set(0, 0.15, 0);
      group.add(labelBadge);
      this.layers.labels.add(labelBadge);

      // Hitbox
      const hitGeo = new THREE.SphereGeometry(0.07, 8, 8);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.position.y = 0.07;
      hitMesh.userData = {
        isGridCoSo: true,
        coSoData: cs
      };
      group.add(hitMesh);
      this.interactiveObjects.push(hitMesh);

      this.layers.coSo.add(group);
    });
  }

  // ===========================================================================
  // 6. CÔNG TRÌNH ĐỒNG BỘ GIAO THÔNG (12 công trình ĐBGT)
  // ===========================================================================
  buildDbgtProjects() {
    const dbgtList = this.gridData.dbgt || [];

    const statusColors = {
      da_co_y_kien_hstk: 0x22c55e, // Xanh lá
      dang_tham_dinh_boi_thuong: 0xf97316, // Cam
      chua_khao_sat: 0xeab308 // Vàng
    };

    dbgtList.forEach(p => {
      const pos = this.mapToLocal(p.x, p.y, 0.018);
      const color = statusColors[p.trang_thai] || 0xeab308;

      const group = new THREE.Group();
      group.position.copy(pos);

      // Ký hiệu hình thoi / cờ đồng bộ giao thông
      const flagMat = new THREE.MeshStandardMaterial({
        color: color,
        emissive: new THREE.Color(color),
        emissiveIntensity: 0.9,
        roughness: 0.3,
        metalness: 0.5
      });

      const diamondGeo = new THREE.ConeGeometry(0.025, 0.045, 4);
      const diamondMesh = new THREE.Mesh(diamondGeo, flagMat);
      diamondMesh.position.y = 0.025;
      group.add(diamondMesh);

      // Hitbox tương tác
      const hitGeo = new THREE.SphereGeometry(0.05, 8, 8);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.position.y = 0.025;
      hitMesh.userData = {
        isGridDBGT: true,
        dbgtData: p
      };
      group.add(hitMesh);
      this.interactiveObjects.push(hitMesh);

      this.layers.dbgt.add(group);
    });
  }

  // ===========================================================================
  // 7. ĐƠN VỊ HÀNH CHÍNH MỚI & NHÃN NGOÀI PHẠM VI
  // ===========================================================================
  buildWardsAndLabels() {
    const phuongList = this.gridData.phuong || [];
    const nhanNgoaiList = this.gridData.nhan_ngoai || [];

    // Nhãn 14 đơn vị hành chính mới
    phuongList.forEach(ph => {
      const pos = this.mapToLocal(ph.x, ph.y, 0.012);
      const badge = this.createWardLabel(ph.ten);
      badge.position.copy(pos);
      this.layers.phuong.add(badge);
    });

    // Nhãn tuyến đi ngoài phạm vi (Đi Long Thành, Đi Nhơn Trạch...)
    nhanNgoaiList.forEach(nh => {
      const pos = this.mapToLocal(nh.x, nh.y, 0.015);
      const badge = this.createOutboundLabel(nh.ten);
      badge.position.copy(pos);
      this.layers.labels.add(badge);
    });
  }

  createWardLabel(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 72;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(6, 13, 30, 0.65)';
    ctx.beginPath();
    ctx.roundRect(4, 4, 312, 64, 12);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = `600 28px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 160, 36);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });

    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.20, 0.045, 1.0);
    return sprite;
  }

  createOutboundLabel(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 72;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(30, 58, 138, 0.85)';
    ctx.beginPath();
    ctx.roundRect(4, 4, 376, 64, 12);
    ctx.fill();

    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#22d3ee';
    ctx.font = `700 26px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`➜ ${text}`, 192, 36);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });

    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.22, 0.042, 1.0);
    return sprite;
  }

  // ===========================================================================
  // 8. BẢNG CHÚ THÍCH 3D ĐẶT CẠNH BÀN
  // ===========================================================================
  build3DLegendPlaque() {
    const group = new THREE.Group();
    // Đặt ở cạnh Tây-Nam sa bàn: x = -this.tableWidth/2 - 0.45, z = this.tableDepth/2 - 0.8
    group.position.set(-this.tableWidth / 2 - 0.25, 0.05, this.tableDepth / 2 - 1.2);
    // Xoay hướng nhẹ về phía người xem
    group.rotation.y = Math.PI / 6;

    const w = 1.1;
    const h = 0.85;

    // Chân đế cột nghiêng
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
      color: 0x0b1530,
      roughness: 0.3,
      metalness: 0.6
    });
    const boardMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), boardMat);
    group.add(boardMesh);

    // Viền LED cyan quanh bảng chú thích
    const ledRim = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.02, h + 0.02, 0.02),
      new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        emissive: new THREE.Color(0x22d3ee),
        emissiveIntensity: 1.2
      })
    );
    group.add(ledRim);

    // Vẽ nội dung chú thích bằng Canvas
    const canvas = document.createElement('canvas');
    canvas.width = 880;
    canvas.height = 680;
    const ctx = canvas.getContext('2d');

    // Nền
    ctx.fillStyle = '#070f26';
    ctx.fillRect(0, 0, 880, 680);

    // Tiêu đề bảng chú thích
    ctx.fillStyle = '#22d3ee';
    ctx.font = `800 32px ${FONT_FAMILY}`;
    ctx.fillText('CHÚ THÍCH LƯỚI ĐIỆN PCVT', 30, 52);

    ctx.strokeStyle = 'rgba(34, 211, 238, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(30, 70);
    ctx.lineTo(850, 70);
    ctx.stroke();

    // Hàng chú thích
    const items = [
      { text: 'Đường dây 500kV (Hiện trạng / Quy hoạch)', color: '#e879f9', type: 'line' },
      { text: 'Đường dây 220kV (Hiện trạng / Quy hoạch)', color: '#f87171', type: 'line' },
      { text: 'Đường dây 110kV (Hiện trạng / Quy hoạch)', color: '#22d3ee', type: 'line' },
      { text: 'Trạm TBA 500kV (1 trạm: Phú Mỹ)', color: '#e879f9', type: 'dot' },
      { text: 'Trạm TBA 220kV (6 trạm lưới)', color: '#f87171', type: 'dot' },
      { text: 'Trạm TBA 110kV Lưới (19 trạm)', color: '#22d3ee', type: 'dot' },
      { text: 'Trạm TBA 110kV Khách hàng (15 trạm)', color: '#cbd5e1', type: 'dot' },
      { text: 'Trạm lân cận (3 trạm: Ngãi Giao, Long Đất, An Ngãi)', color: '#f59e0b', type: 'dot' },
      { text: 'Cơ sở PCVT (Cơ sở 1, 2, 3, 4)', color: '#1e40a0', type: 'pin' },
      { text: 'ĐBGT: Đã có ý kiến HSTK', color: '#22c55e', type: 'square' },
      { text: 'ĐBGT: UBND thẩm định bồi thường', color: '#f97316', type: 'square' },
      { text: 'ĐBGT: Chưa khảo sát hiện trạng', color: '#eab308', type: 'square' }
    ];

    let startY = 110;
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
      } else {
        ctx.fillRect(52, startY - 10, 16, 16);
      }

      ctx.fillStyle = '#f1f5f9';
      ctx.font = `500 24px ${FONT_FAMILY}`;
      ctx.fillText(it.text, 105, startY);
      startY += 40;
    });

    // Dòng nguồn
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.moveTo(30, 605);
    ctx.lineTo(850, 605);
    ctx.stroke();

    ctx.fillStyle = 'rgba(148, 163, 184, 0.9)';
    ctx.font = `italic 400 20px ${FONT_FAMILY}`;
    ctx.fillText('Nguồn: Bản đồ địa dư PCVT – trục chính – phường, 29/06/2026', 30, 638);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const faceMat = new THREE.MeshBasicMaterial({ map: tex });
    const faceMesh = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, h - 0.04), faceMat);
    faceMesh.position.z = 0.021;
    group.add(faceMesh);

    this.tableGroup.add(group);
  }

  // ===========================================================================
  // 9. QUẢN LÝ LỌC LỚP (LAYER VISIBILITY TOGGLES)
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
      case 'dbgt':
        this.layers.dbgt.visible = isVisible;
        break;
      case 'labels':
        this.layers.labels.visible = isVisible;
        break;
      case 'phuong':
        this.layers.phuong.visible = isVisible;
        break;
    }
  }

  // ===========================================================================
  // 10. ANIMATION LOOP (XUNG SÁNG VÀ BEACON CHỚP)
  // ===========================================================================
  animate(delta, time) {
    // 1. Chạy các xung sáng dọc theo đường dây
    for (const p of this.pulseParticles) {
      if (!p.group.visible) continue;
      p.t += delta * p.speed;
      if (p.t > 1.0) p.t = 0;
      const point = p.curve.getPointAt(p.t);
      if (point) p.mesh.position.copy(point);
    }

    // 2. Chớp nhẹ các beacon đỉnh trạm biến áp
    const beat = 0.85 + 0.35 * Math.sin(time * 4.0);
    for (const b of this.beaconMeshes) {
      b.mesh.scale.setScalar(b.baseScale * beat);
    }
  }
}
