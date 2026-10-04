import * as THREE from 'three';
import { GRID_TABLE } from './layout-config.js';

/**
 * GridMapTable v2 (GĐ5-fix4)
 * ==============================================================================
 * Dùng bản đồ v2 số hóa chính xác từ bản vẽ kỹ thuật PDF:
 * - Mặt bản đồ: 1 tấm PlaneGeometry(mapW, mapD) duy nhất với tỷ lệ 4096 / 5400 = 0.7585
 * - Đặt tại y = 0.02m (MeshBasicMaterial, toneMapped=false, anisotropy tối đa, mipmap bật)
 * - LOD chuyển đổi giữa 2048 (đứng xa > 12m) và 4096 (đứng gần < 12m) với hysteresis 1m
 * - Mặt bàn xung quanh màu #F1F4F7 (cùng màu nền ảnh), khung viền xanh đen #1E293B
 * - Bỏ toàn bộ các lớp vector vẽ chồng cũ (đường dây, ranh giới, overlay nhãn)
 * - Ghim trạm 3D: InstancedMesh theo 5 cấp điện áp, cao 3-8cm, đường kính 2cm, đúng tọa độ v2
 * - Cơ sở PCVT: 4 ghim trạm logo, thẻ thông tin không hiện địa chỉ
 * - Vùng bấm phường/xã: ShapeGeometry từ poly v2, hover phủ mờ #1E40A0 (độ trong 0.15), click hiện tên
 * - Bảng lọc 2 công tắc: "Ghim trạm 3D" và "Tô sáng phường khi rê chuột"
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

    // Table dimensions in local coordinates
    this.tableWidth = GRID_TABLE.width || 4.2;
    this.tableDepth = GRID_TABLE.depth || 6.0;
    this.tableHeight = GRID_TABLE.height || 0.95;
    this.tiltRad = (GRID_TABLE.tiltDeg || 8) * Math.PI / 180;
    this.tableCenter = new THREE.Vector3(GRID_TABLE.position.x, this.tableHeight, GRID_TABLE.position.z);

    // Map board dimensions v2 (4096 x 5400 px -> aspect = 0.7585185)
    this.mapAspect = 4096.0 / 5400.0;
    this.mapW = 4.0; // 4.0m chiều rộng (lề 10cm mỗi bên trên bàn 4.2m)
    this.mapD = this.mapW / this.mapAspect; // 5.2734m (lề 36.3cm mỗi đầu trên bàn 6.0m)

    // Instanced meshes references
    this.instancedTramMeshes = [];
    this.instancedCoSoMesh = null;
    this.wardMeshes = [];
    this.currentHoveredWard = null;
    this.hoverPhuongEnabled = true;
    this.tramVisible = true;

    // Textures & LOD
    this.tex2048 = null;
    this.tex4096 = null;
    this._currentLOD = '2048';
    this.boardMesh = null;
  }

  async loadData() {
    try {
      const res = await fetch('assets/grid/pcvt_grid_v2.json?v=' + Date.now());
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      this.gridData = await res.json();
      console.log('GridMapTable v2 data loaded successfully:', {
        version: this.gridData.phien_ban,
        tram: this.gridData.tram?.length,
        coSo: this.gridData.co_so?.length,
        phuong: this.gridData.phuong?.length
      });
      return this.gridData;
    } catch (err) {
      console.error('Failed to load pcvt_grid_v2.json:', err);
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
    this.rootGroup.position.set(GRID_TABLE.position.x, this.tableHeight, GRID_TABLE.position.z);
    this.rootGroup.rotation.y = -Math.PI / 2;

    // Apply tilt to local table group
    this.tableGroup.rotation.x = this.tiltRad;

    // 1. Dựng khung và mặt bàn kiến trúc hiện đại (viền bàn #F1F4F7)
    this.buildTableFurniture();

    // 2. Dựng tấm bản đồ duy nhất (pcvt_map_2048.webp / pcvt_map_4096.webp)
    this.buildMapBoard();

    // 3. Dựng vùng bấm tương tác các phường/xã từ poly v2 (ShapeGeometry)
    this.buildWardInteractiveZones();

    // 4. Dựng ghim trạm biến áp 3D (InstancedMesh cao 3-8cm, đường kính 2cm)
    this.buildSubstations();

    // 5. Dựng ghim 4 cơ sở PCVT
    this.buildPcvtFacilities();

    this.scene.add(this.rootGroup);
    console.log('GridMapTable v2 build complete with 1 map plane, 5 substation groups, and 14 ward zones.');
  }

  // ===========================================================================
  // 1. BÀN SA BÀN KIẾN TRÚC HIỆN ĐẠI
  // ===========================================================================
  buildTableFurniture() {
    const w = this.tableWidth;
    const d = this.tableDepth;
    const h = this.tableHeight;

    // Mặt bàn đỡ bản đồ: đổi sang màu #F1F4F7 (cùng màu nền ảnh) để không lộ khung đen (Mục B.2)
    const matTop = new THREE.MeshStandardMaterial({
      color: 0xF1F4F7,
      roughness: 0.5,
      metalness: 0.05
    });

    // Gờ vát bảo vệ xung quanh mép bàn: giữ khung bàn xanh đen #1E293B
    const matBorder = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.3,
      metalness: 0.7
    });

    // Mặt bàn chính
    const topBoardGeo = new THREE.BoxGeometry(w, 0.08, d);
    const topBoard = new THREE.Mesh(topBoardGeo, matTop);
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
  // 2. MẶT BẢN ĐỒ V2 VÀ HITBOX BÀN
  // ===========================================================================
  buildMapBoard() {
    const texLoader = new THREE.TextureLoader();
    const maxAnis = window.app?.renderer?.capabilities?.getMaxAnisotropy?.() || 16;

    this.tex2048 = texLoader.load('assets/grid/pcvt_map_2048.webp');
    this.tex2048.colorSpace = THREE.SRGBColorSpace;
    this.tex2048.generateMipmaps = true;
    this.tex2048.minFilter = THREE.LinearMipmapLinearFilter;
    this.tex2048.anisotropy = maxAnis;

    this.tex4096 = texLoader.load('assets/grid/pcvt_map_4096.webp');
    this.tex4096.colorSpace = THREE.SRGBColorSpace;
    this.tex4096.generateMipmaps = true;
    this.tex4096.minFilter = THREE.LinearMipmapLinearFilter;
    this.tex4096.anisotropy = maxAnis;

    // Mặt bản đồ: chỉ còn 1 tấm PlaneGeometry(mapW, mapD) ở y = 0.02 (Mục B.1)
    const boardGeo = new THREE.PlaneGeometry(this.mapW, this.mapD);
    const boardMat = new THREE.MeshBasicMaterial({
      map: this.tex2048,
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
    const hitMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    this.tableHitMesh = new THREE.Mesh(hitGeo, hitMat);
    this.tableHitMesh.rotation.x = -Math.PI / 2;
    this.tableHitMesh.position.y = 0.021;
    this.tableHitMesh.userData = { isGridTableSurface: true };
    this.tableGroup.add(this.tableHitMesh);
    this.interactiveObjects.push(this.tableHitMesh);
  }

  // Chuyển đổi giữa bản 2048 và 4096 ở ngưỡng 12m với hysteresis 1m (Mục B.1)
  updateTilesLOD(cameraPos) {
    if (!this.boardMesh || !cameraPos) return;
    const dist = cameraPos.distanceTo(this.tableCenter);

    if (dist < 11.5 && this._currentLOD !== '4096') {
      this.boardMesh.material.map = this.tex4096;
      this.boardMesh.material.needsUpdate = true;
      this._currentLOD = '4096';
    } else if (dist > 12.5 && this._currentLOD !== '2048') {
      this.boardMesh.material.map = this.tex2048;
      this.boardMesh.material.needsUpdate = true;
      this._currentLOD = '2048';
    }
  }

  // Chuyển đổi tọa độ chuẩn hóa [0..1] sang tọa độ cục bộ trên sa bàn
  // nx: 0 (Tây) -> 1 (Đông); ny: 0 (Bắc) -> 1 (Nam)
  mapToLocal(nx, ny, elevation = 0.020) {
    const lx = (nx - 0.5) * this.mapW;
    const lz = (ny - 0.5) * this.mapD;
    return new THREE.Vector3(lx, elevation, lz);
  }

  // ===========================================================================
  // 3. VÙNG PHƯỜNG/XÃ TƯƠNG TÁC (Mục B.4)
  // Tạo vùng bấm vô hình từ phuong[].poly bằng ShapeGeometry.
  // Rê chuột thì phủ mờ #1E40A0 (độ trong 0.15), bấm thì hiện tên phường/xã.
  // ===========================================================================
  buildWardInteractiveZones() {
    const phuongList = this.gridData?.phuong || [];
    if (phuongList.length === 0) return;

    this.wardGroup = new THREE.Group();
    this.wardGroup.name = 'GridMap_WardZones';
    this.tableGroup.add(this.wardGroup);

    phuongList.forEach(ph => {
      let ring = null;
      if (ph.poly && ph.poly.length > 0 && ph.poly[0] && ph.poly[0].length >= 3) {
        ring = ph.poly[0];
      } else if (ph.id === 'dk_con_dao' && this.gridData.con_dao_khung) {
        // Côn Đảo: dùng khung chữ nhật từ con_dao_khung [x0, y0, x1, y1]
        const [x0, y0, x1, y1] = this.gridData.con_dao_khung;
        ring = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
      }

      if (!ring || ring.length < 3) return;

      const shape = new THREE.Shape();
      ring.forEach(([nx, ny], idx) => {
        const lx = (nx - 0.5) * this.mapW;
        const lz = (ny - 0.5) * this.mapD;
        // In local 2D shape coords: x = lx, y = -lz (to map to +lz after rotation.x = -π/2)
        if (idx === 0) shape.moveTo(lx, -lz);
        else shape.lineTo(lx, -lz);
      });

      const geo = new THREE.ShapeGeometry(shape);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x1e40a0,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        side: THREE.DoubleSide
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.022; // Nằm ngay trên mặt bản đồ y = 0.02
      mesh.name = `WardZone_${ph.id}`;
      mesh.userData = {
        isGridPhuongZone: true,
        phuongData: ph
      };

      this.wardGroup.add(mesh);
      this.wardMeshes.push(mesh);
      this.interactiveObjects.push(mesh);
    });

    console.log(`GridMapTable v2: Built ${this.wardMeshes.length} interactive ward zones with ShapeGeometry.`);
  }

  // ===========================================================================
  // 4. GHIM TRẠM BIẾN ÁP 3D (Mục B.4)
  // Cột cao 3–8 cm theo cấp, đường kính 2 cm, khớp tọa độ v2 -> tram
  // ===========================================================================
  buildSubstations() {
    const tramList = this.gridData?.tram || [];
    if (tramList.length === 0) return;

    // Phân nhóm theo 5 cấp điện áp
    const groups = {
      '500kV': {
        items: [],
        height: 0.080, // 8 cm
        radius: 0.010, // đường kính 2 cm
        color: 0xe879f9 // Tím
      },
      '220kV': {
        items: [],
        height: 0.060, // 6 cm
        radius: 0.010,
        color: 0xf87171 // Đỏ
      },
      '110kV_luoi': {
        items: [],
        height: 0.040, // 4 cm
        radius: 0.010,
        color: 0x22d3ee // Cyan
      },
      '110kV_kh': {
        items: [],
        height: 0.035, // 3.5 cm
        radius: 0.010,
        color: 0xcbd5e1 // Xám bạc
      },
      'lan_can': {
        items: [],
        height: 0.030, // 3 cm
        radius: 0.010,
        color: 0xf59e0b // Cam
      }
    };

    tramList.forEach(t => {
      const cap = t.cap || t.dien_ap;
      if (cap === '500kV') {
        groups['500kV'].items.push(t);
      } else if (cap === '220kV') {
        groups['220kV'].items.push(t);
      } else if (t.loai === 'lan_can') {
        groups['lan_can'].items.push(t);
      } else if (t.loai === 'khach_hang') {
        groups['110kV_kh'].items.push(t);
      } else {
        groups['110kV_luoi'].items.push(t);
      }
    });

    this.substationGroup = new THREE.Group();
    this.substationGroup.name = 'GridMap_SubstationsGroup';
    this.tableGroup.add(this.substationGroup);

    const dummy = new THREE.Object3D();

    Object.entries(groups).forEach(([key, grp]) => {
      const count = grp.items.length;
      if (count === 0) return;

      const geo = new THREE.CylinderGeometry(grp.radius, grp.radius, grp.height, 16);
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
        const pos = this.mapToLocal(t.x, t.y, 0.02);
        dummy.position.set(pos.x, 0.02 + grp.height / 2, pos.z);
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        instMesh.setMatrixAt(idx, dummy.matrix);
      });

      instMesh.instanceMatrix.needsUpdate = true;
      instMesh.userData = {
        isGridTramInstanced: true,
        tramList: grp.items,
        groupKey: key
      };

      this.substationGroup.add(instMesh);
      this.instancedTramMeshes.push(instMesh);
      this.interactiveObjects.push(instMesh);
    });

    console.log(`GridMapTable v2: Built 44 substations into 5 InstancedMeshes with exact cylinder pins.`);
  }

  // ===========================================================================
  // 5. CƠ SỞ PCVT (Mục B.4)
  // 4 cơ sở gom thành 1 InstancedMesh chóp nón màu xanh EVN
  // ===========================================================================
  buildPcvtFacilities() {
    const coSoList = this.gridData?.co_so || [];
    if (coSoList.length === 0) return;

    const count = coSoList.length;
    const coneH = 0.045;
    const geo = new THREE.ConeGeometry(0.015, coneH, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1e40a0,
      emissive: new THREE.Color(0x1e40a0),
      emissiveIntensity: 0.45,
      roughness: 0.25,
      metalness: 0.7
    });

    const instMesh = new THREE.InstancedMesh(geo, mat, count);
    instMesh.name = 'InstancedFacilities_PCVT';
    instMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    const dummy = new THREE.Object3D();
    coSoList.forEach((cs, idx) => {
      const pos = this.mapToLocal(cs.x, cs.y, 0.02);
      dummy.position.set(pos.x, 0.02 + coneH / 2, pos.z);
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

    this.substationGroup.add(instMesh);
    this.instancedCoSoMesh = instMesh;
    this.interactiveObjects.push(instMesh);
  }

  // ===========================================================================
  // 6. QUẢN LÝ LỌC LỚP (Mục B.5)
  // Bảng lọc chỉ còn 2 công tắc: "Ghim trạm 3D" và "Tô sáng phường khi rê chuột"
  // ===========================================================================
  setLayerVisibility(key, isVisible) {
    if (key === 'tram') {
      this.tramVisible = isVisible;
      this.instancedTramMeshes.forEach(m => { m.visible = isVisible; });
      if (this.instancedCoSoMesh) this.instancedCoSoMesh.visible = isVisible;
    }
  }

  setHoverPhuongEnabled(enabled) {
    this.hoverPhuongEnabled = enabled;
    if (!enabled && this.currentHoveredWard) {
      this.currentHoveredWard.material.opacity = 0;
      this.currentHoveredWard = null;
    }
  }

  // ===========================================================================
  // 7. ANIMATION & LOD
  // ===========================================================================
  animate(_delta, _time, cameraPos) {
    if (cameraPos) {
      this.updateTilesLOD(cameraPos);
    }
    this.updatePulses();
  }

  /**
   * GĐ6-fix2 D: nhấp nháy (pulse) các ghim trạm trong tram_ids của một phường/xã trong 2 giây.
   * Vẽ vòng sáng lan tỏa trên mặt sa bàn, tự xóa sau 2 s.
   */
  pulseTrams(ids) {
    this.clearPulses();
    const list = this.gridData?.tram || [];
    const idSet = new Set(ids || []);
    if (!this.substationGroup || idSet.size === 0) return 0;
    this._pulses = this._pulses || [];
    const start = performance.now();
    let n = 0;
    list.forEach(t => {
      if (!idSet.has(t.id)) return;
      const pos = this.mapToLocal(t.x, t.y, 0.02);
      const mat = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 1, depthTest: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.018, 0.026, 32), mat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(pos.x, 0.03, pos.z);
      ring.renderOrder = 50;
      ring.userData.isPulseRing = true;
      this.substationGroup.add(ring);
      this._pulses.push({ ring, start });
      n++;
    });
    return n;
  }

  clearPulses() {
    (this._pulses || []).forEach(p => {
      p.ring.parent?.remove(p.ring);
      p.ring.geometry.dispose();
      p.ring.material.dispose();
    });
    this._pulses = [];
  }

  updatePulses() {
    if (!this._pulses || this._pulses.length === 0) return;
    const now = performance.now();
    const alive = [];
    this._pulses.forEach(p => {
      const age = (now - p.start) / 1000;
      if (age >= 2.0) {
        p.ring.parent?.remove(p.ring);
        p.ring.geometry.dispose();
        p.ring.material.dispose();
        return;
      }
      const ph = age % 1.0;                    // 2 nhịp trong 2 giây
      p.ring.scale.setScalar(1 + ph * 2.6);
      p.ring.material.opacity = 1 - ph;
      alive.push(p);
    });
    this._pulses = alive;
  }

  // ===========================================================================
  // 8. KIỂM TRA NGHIỆM THU (MỤC B.1 & C): TẤT CẢ ĐIỂM NẰM TRỌN TRONG MẶT BÀN
  // ===========================================================================
  assertAllInsideBoard() {
    if (!this.gridData) {
      console.warn('[assertAllInsideBoard] gridData chưa nạp!');
      return -1;
    }

    const stations = this.gridData.tram || [];
    const coso = this.gridData.co_so || [];
    const phuong = this.gridData.phuong || [];
    const allPoints = [
      ...stations.map(s => ({ name: s.ten, type: 'Trạm ' + (s.cap || s.dien_ap), x: s.x, y: s.y })),
      ...coso.map(c => ({ name: c.ten, type: 'Cơ sở', x: c.x, y: c.y })),
      ...phuong.map(p => ({ name: p.ten, type: 'Phường/Xã', x: p.nhan?.[0] ?? p.x, y: p.nhan?.[1] ?? p.y }))
    ];

    let outsideCount = 0;
    const halfW = this.tableWidth / 2; // 2.1m
    const halfD = this.tableDepth / 2; // 3.0m

    allPoints.forEach(pt => {
      const localPos = this.mapToLocal(pt.x, pt.y);
      const isInside = (
        pt.x >= 0.0 && pt.x <= 1.0 &&
        pt.y >= 0.0 && pt.y <= 1.0 &&
        Math.abs(localPos.x) <= halfW &&
        Math.abs(localPos.z) <= halfD
      );

      if (!isInside) {
        outsideCount++;
        console.warn(`[assertAllInsideBoard] Điểm ngoài bàn: ${pt.name} (${pt.type}) tại norm=(${pt.x.toFixed(4)}, ${pt.y.toFixed(4)}), local=(${localPos.x.toFixed(2)}, ${localPos.z.toFixed(2)})`);
      }
    });

    console.log(`[assertAllInsideBoard] Đã kiểm tra ${allPoints.length} điểm: ${allPoints.length - outsideCount}/${allPoints.length} điểm nằm trong mặt bàn. Số điểm ngoài: ${outsideCount}`);
    if (outsideCount === 0) {
      console.log('✓ assertAllInsideBoard() = 0 điểm ngoài bàn! 100% tọa độ lọt lòng sa bàn.');
    }
    return outsideCount;
  }
}
