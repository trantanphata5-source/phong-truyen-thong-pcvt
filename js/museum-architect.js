import * as THREE from 'three';
import { WALLS, PARTITIONS, WALL_HEIGHT, PARTITION_HEIGHT, FLOORS } from './layout-config.js';

/**
 * Museum Architect (Artsteps Standard)
 * Generates an expansive, luxury virtual museum with:
 * - Dedicated partition display walls in all 3 halls (supporting all 205 exhibits)
 * - Central Rotunda & PCVT Seal
 * - Polished Italian marble floor
 * - Interactive floor raycast plane for Point-and-Click navigation
 * - Floor target marker ring
 */
export class MuseumArchitect {
  constructor(scene) {
    this.scene = scene;
    this.collisionBoxes = [];
    this.floorMesh = null;
    this.floorMarker = null;
    this.albumMeshes = [];

    this.initMaterials();
  }

  initMaterials() {
    // 1. Procedural Polished Marble Floor Texture
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 1024;
    floorCanvas.height = 1024;
    const ctx = floorCanvas.getContext('2d');
    
    // Deep dark navy-charcoal marble
    ctx.fillStyle = '#0c1220';
    ctx.fillRect(0, 0, 1024, 1024);

    // Marble tile grid lines
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.25)';
    ctx.lineWidth = 3;
    const tileSize = 256;
    for (let x = 0; x <= 1024; x += tileSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 1024);
      ctx.stroke();
    }
    for (let y = 0; y <= 1024; y += tileSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1024, y);
      ctx.stroke();
    }

    // Subtle marble veins
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 35; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * 1024, Math.random() * 1024);
      ctx.bezierCurveTo(
        Math.random() * 1024, Math.random() * 1024,
        Math.random() * 1024, Math.random() * 1024,
        Math.random() * 1024, Math.random() * 1024
      );
      ctx.stroke();
    }

    const floorTexture = new THREE.CanvasTexture(floorCanvas);
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(14, 14);

    this.matFloor = new THREE.MeshStandardMaterial({
      map: floorTexture,
      roughness: 0.16,
      metalness: 0.2,
      envMapIntensity: 0.9
    });

    // 2. Wall Material (Modern Luxury Gallery Alabaster White)
    this.matWall = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.85,
      metalness: 0.02
    });

    // 3. Partition Gallery Wall Material (Pristine Exhibition White)
    this.matPartition = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.8,
      metalness: 0.02
    });

    // 4. Gold Architectural Moldings & Trim
    this.matGold = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.3,
      metalness: 0.85
    });

    // 5. Polished White Marble (for Pedestals)
    this.matPedestalMarble = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.2,
      metalness: 0.1
    });

    // 6. Vitrine Museum Glass
    this.matGlass = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.25,
      roughness: 0.05,
      transmission: 0.9,
      ior: 1.5,
      thickness: 0.05
    });

    // 7. Ceiling Material (Bright Museum Architectural White)
    this.matCeiling = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.90,
      metalness: 0.02
    });

    // 8. Luxury Showcase Gold & Champagne Brass (Matching Reference Photo)
    this.matGoldShowcase = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.28,
      metalness: 0.88
    });

    // 9. Velvet / Leather Pedestal Fabric (Champagne Ivory)
    this.matVelvetIvory = new THREE.MeshStandardMaterial({
      color: 0xf5f0e6,
      roughness: 0.65,
      metalness: 0.05
    });

    // 10. Showcase Glass (Crystal Clear, depthWrite: false to eliminate flicker)
    this.matGlassShowcase = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.20,
      roughness: 0.04,
      transmission: 0.92,
      ior: 1.5,
      thickness: 0.03,
      depthWrite: false
    });

    // 11. GĐ5: Khu 3 Tông sáng hiện đại (#F4F7FB walls, chân tường #1E40A0, phào 3cm #38BDF8, sàn #DCE3EC)
    this.matWallKhu3 = new THREE.MeshStandardMaterial({
      color: 0xF4F7FB,
      roughness: 0.60,
      metalness: 0.05
    });

    this.matBaseboardKhu3 = new THREE.MeshStandardMaterial({
      color: 0x1E40A0,
      roughness: 0.30,
      metalness: 0.10
    });

    this.matCorniceKhu3 = new THREE.MeshStandardMaterial({
      color: 0x38BDF8,
      emissive: new THREE.Color(0x38BDF8),
      emissiveIntensity: 0.4,
      roughness: 0.25,
      metalness: 0.10
    });

    this.matCyanLED = new THREE.MeshStandardMaterial({
      color: 0x22D3EE,
      emissive: new THREE.Color(0x22D3EE),
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.1
    });

    this.matEpoxyKhu3 = new THREE.MeshStandardMaterial({
      color: 0xDCE3EC,
      roughness: 0.30,
      metalness: 0.25
    });
  }

  buildMuseum() {
    const museumGroup = new THREE.Group();
    museumGroup.name = 'MuseumArchitecture';

    // 1. Floor & Ceiling (bao gồm khu 4 & 6)
    this.buildFloorsAndCeilings(museumGroup);

    // 2. All Walls from layout-config.js
    this.buildOuterWalls(museumGroup);

    // 3. Partition Walls (chỉ còn vách khu 1 và vách mốc son khu 3)
    this.buildPartitionWalls(museumGroup);

    // 4. Central Rotunda & PCVT Seal
    this.buildCentralRotunda(museumGroup);

    // 5. Hallway Portals & Signage
    this.buildSignage(museumGroup);

    // 5b. GĐ6-fix1: 6 biển giai đoạn y = 3,90 cũ đã bỏ (trùng tầng ảnh trên sau khi nâng ảnh – mục C).
    //     Thay bằng bảng tiêu đề tường tâm y = 5,80 do ExhibitBuilder.buildWallTitleBoards() dựng (mục D2).

    // 6. Decorative Potted Plants in Corners
    this.buildPottedPlants(museumGroup);

    // 7. Architectural Ceiling Light Fixtures
    this.buildCeilingLightFixtures(museumGroup);

    // 8. GĐ4: Two Album Cabinets (replacing single vitrine)
    this.buildAlbumCabinets(museumGroup);

    // 9. Grand Lighting (bao gồm khu 4 & 6 và đèn rọi sa bàn)
    this.setupLighting(museumGroup);

    // 10. Interactive Floor Target Marker for Artsteps Navigation
    this.buildFloorMarker(museumGroup);

    // 11. Ho Chi Minh Cultural Zone (Khu 5)
    this.buildHCMCulturalZone(museumGroup);

    // 12. GĐ5: Khu 3 Smart Grid (Sàn epoxy với vạch sáng, 3 trụ thông tin tự động hóa)
    this.buildZone3SmartGrid(museumGroup);

    // 13. GĐ5: Khu 4 & Khu 6 Large LED Screens & Standing Flags (Mục C)
    this.buildZone4And6Screens(museumGroup);

    this.scene.add(museumGroup);
    return museumGroup;
  }

  buildFloorsAndCeilings(parent) {
    // Main Floor (expanded to cover all zones including khu 4/6)
    const mainFloor = FLOORS.main;
    const floorGeo = new THREE.PlaneGeometry(mainFloor.width, mainFloor.depth);
    this.floorMesh = new THREE.Mesh(floorGeo, this.matFloor);
    this.floorMesh.rotation.x = -Math.PI / 2;
    this.floorMesh.position.set(mainFloor.cx, 0, mainFloor.cz);
    this.floorMesh.receiveShadow = true;
    this.floorMesh.name = 'WalkableFloor';
    this.floorMesh.userData = { isFloor: true };
    parent.add(this.floorMesh);

    // Main Ceiling (khu 1, 2, 3 + sảnh)
    const mainCeil = FLOORS.main_ceiling;
    const ceilGeo = new THREE.PlaneGeometry(mainCeil.width, mainCeil.depth);
    const ceilMesh = new THREE.Mesh(ceilGeo, this.matCeiling);
    ceilMesh.position.set(mainCeil.cx, mainCeil.y, mainCeil.cz);
    ceilMesh.rotation.x = Math.PI / 2;
    parent.add(ceilMesh);

    // Ceiling Khu 4 (Đảng bộ)
    const ceil4 = FLOORS.ceiling_khu4;
    const ceilGeo4 = new THREE.PlaneGeometry(ceil4.width, ceil4.depth);
    const ceilMesh4 = new THREE.Mesh(ceilGeo4, this.matCeiling);
    ceilMesh4.position.set(ceil4.cx, ceil4.y, ceil4.cz);
    ceilMesh4.rotation.x = Math.PI / 2;
    parent.add(ceilMesh4);

    // Ceiling Khu 6 (CĐ + ĐTN)
    const ceil6 = FLOORS.ceiling_khu6;
    const ceilGeo6 = new THREE.PlaneGeometry(ceil6.width, ceil6.depth);
    const ceilMesh6 = new THREE.Mesh(ceilGeo6, this.matCeiling);
    ceilMesh6.position.set(ceil6.cx, ceil6.y, ceil6.cz);
    ceilMesh6.rotation.x = Math.PI / 2;
    parent.add(ceilMesh6);
  }

  createWallMesh(w, h, d, x, y, z, rotY = 0, mat = this.matWall, name = '', trimMat = this.matGold, isKhu3 = false) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotY;

    // Base wall
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    if (isKhu3) {
      // Dải chân tường xanh EVN #1E40A0 cao 0-0.5m (0.45m), không phát sáng (Mục A.15)
      const baseboardGeo = new THREE.BoxGeometry(w, 0.45, d + 0.06);
      const baseboardMesh = new THREE.Mesh(baseboardGeo, this.matBaseboardKhu3);
      baseboardMesh.position.y = -h / 2 + 0.225;
      group.add(baseboardMesh);

      // Phào trần vạch mảnh 3cm màu #38BDF8, emissiveIntensity 0.4 (Mục A.16)
      const corniceGeo = new THREE.BoxGeometry(w, 0.03, d + 0.06);
      const corniceMesh = new THREE.Mesh(corniceGeo, this.matCorniceKhu3);
      corniceMesh.position.y = h / 2 - 0.015;
      group.add(corniceMesh);
    } else {
      // Baseboard gold
      const baseboardGeo = new THREE.BoxGeometry(w, 0.35, d + 0.08);
      const baseboardMesh = new THREE.Mesh(baseboardGeo, trimMat);
      baseboardMesh.position.y = -h / 2 + 0.175;
      group.add(baseboardMesh);

      // Top cornice gold
      const corniceGeo = new THREE.BoxGeometry(w, 0.25, d + 0.08);
      const corniceMesh = new THREE.Mesh(corniceGeo, trimMat);
      corniceMesh.position.y = h / 2 - 0.125;
      group.add(corniceMesh);
    }

    group.name = name;
    return group;
  }

  buildOuterWalls(parent) {
    // Dựng tường từ layout-config.js
    for (const wall of WALLS) {
      const h = wall.h;
      const isKhu3 = wall.zone === 'khu3';
      const wallMat = isKhu3 ? this.matWallKhu3 : this.matWall;
      const trimMat = isKhu3 ? this.matBaseboardKhu3 : this.matGold;
      parent.add(this.createWallMesh(
        wall.w, h, wall.d,
        wall.x, h / 2, wall.z,
        wall.rotY, wallMat, wall.id, trimMat, isKhu3
      ));

      // GĐ6-fix1 E1: đầu tường bị cắt bọc nẹp dọc 0,12 m (khu 3: xanh #1E40A0, khu 1: vàng đồng)
      if (wall.cutEnd) {
        const capMat = isKhu3
          ? new THREE.MeshStandardMaterial({ color: 0x1e40a0, roughness: 0.4, metalness: 0.2 })
          : this.matGold;
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.12, h, wall.d + 0.06), capMat);
        const sign = wall.cutEnd === 'east' ? 1 : -1;
        // Tường chạy dọc trục x (rotY = 0): đầu cắt ở x ± w/2
        cap.position.set(wall.x + sign * wall.w / 2, h / 2, wall.z);
        cap.name = `WallEndCap_${wall.id}`;
        parent.add(cap);
      }
    }
  }

  /**
   * Artsteps-style Freestanding Museum Partition Walls
   * Provides ample exhibition surfaces for all 205 items
   */
  buildPartitionWalls(parent) {
    // Dựng vách ngăn từ layout-config.js
    for (const part of PARTITIONS) {
      const h = part.h;
      const isKhu3 = part.zone === 'khu3';
      const partMat = isKhu3 ? this.matWallKhu3 : this.matPartition;
      const trimMat = isKhu3 ? this.matBaseboardKhu3 : this.matGold;
      parent.add(this.createWallMesh(
        part.w, h, part.d,
        part.x, h / 2, part.z,
        part.rotY, partMat, part.id, trimMat, isKhu3
      ));
    }
  }

  buildCentralRotunda(parent) {
    const rotundaGroup = new THREE.Group();

    // 1. Raised Octagonal Dais
    const daisGeo = new THREE.CylinderGeometry(11.5, 12.0, 0.35, 8);
    const dais = new THREE.Mesh(daisGeo, this.matPedestalMarble);
    dais.position.y = 0.175;
    dais.receiveShadow = true;
    rotundaGroup.add(dais);

    // Gold trim around dais
    const daisTrimGeo = new THREE.CylinderGeometry(12.05, 12.1, 0.15, 8);
    const daisTrim = new THREE.Mesh(daisTrimGeo, this.matGold);
    daisTrim.position.y = 0.1;
    rotundaGroup.add(daisTrim);

    // 2. Official EVNHCMC & PC Vũng Tàu Crest Seal in Floor
    const sealCanvas = document.createElement('canvas');
    sealCanvas.width = 1024;
    sealCanvas.height = 1024;
    const sctx = sealCanvas.getContext('2d');

    const sealTexture = new THREE.CanvasTexture(sealCanvas);

    const renderSeal = (logoImg = null) => {
      sctx.clearRect(0, 0, 1024, 1024);

      // GĐ4: Blue radial gradient background disc (#2D55C8 → #1E40A0 → #172F7A)
      const bgGrad = sctx.createRadialGradient(512, 512, 30, 512, 512, 490);
      bgGrad.addColorStop(0, '#2D55C8');
      bgGrad.addColorStop(0.5, '#1E40A0');
      bgGrad.addColorStop(1, '#172F7A');
      sctx.fillStyle = bgGrad;
      sctx.beginPath();
      sctx.arc(512, 512, 490, 0, Math.PI * 2);
      sctx.fill();

      // Outer gold rings
      sctx.strokeStyle = '#eab308';
      sctx.lineWidth = 14;
      sctx.stroke();

      sctx.strokeStyle = '#ca8a04';
      sctx.lineWidth = 6;
      sctx.beginPath();
      sctx.arc(512, 512, 455, 0, Math.PI * 2);
      sctx.stroke();

      // Inner disc for official logo
      sctx.fillStyle = '#ffffff';
      sctx.beginPath();
      sctx.arc(512, 512, 260, 0, Math.PI * 2);
      sctx.fill();

      // GĐ4: Inner disc border changed to #1E40A0
      sctx.strokeStyle = '#1E40A0';
      sctx.lineWidth = 8;
      sctx.stroke();

      // Draw EVNHCMC logo image in center
      if (logoImg) {
        sctx.drawImage(logoImg, 292, 312, 440, 400);
      } else {
        sctx.fillStyle = '#facc15';
        sctx.font = 'bold 80px sans-serif';
        sctx.textAlign = 'center';
        sctx.textBaseline = 'middle';
        sctx.fillText('⚡', 512, 512);
      }

      // Curved text helper with proportional kerning (letters never collide or stick)
      const drawArcText = (str, radius, centerAngle, extraSpacing = 4, inward = true) => {
        const len = str.length;
        const charWidths = [];
        let totalArcLen = 0;
        for (let i = 0; i < len; i++) {
          const w = sctx.measureText(str[i]).width + extraSpacing;
          charWidths.push(w);
          totalArcLen += w;
        }

        const totalAngle = totalArcLen / radius;
        let currentAngle = centerAngle - totalAngle / 2;

        for (let i = 0; i < len; i++) {
          const char = str[i];
          const charAngle = charWidths[i] / radius;
          const midAngle = currentAngle + charAngle / 2;

          sctx.save();
          sctx.translate(512, 512);
          sctx.rotate(midAngle);
          sctx.translate(0, -radius);
          if (!inward) {
            sctx.rotate(Math.PI);
          }
          sctx.fillText(char, 0, 0);
          sctx.restore();

          currentAngle += charAngle;
        }
      };

      // Cung dưới: vẽ ngược chiều kim đồng hồ, đọc từ trái sang phải (Mục G)
      const drawBottomArcText = (str, radius, centerAngle, extraSpacing = 4) => {
        const len = str.length;
        const charWidths = [];
        let totalArcLen = 0;
        for (let i = 0; i < len; i++) {
          const w = sctx.measureText(str[i]).width + extraSpacing;
          charWidths.push(w);
          totalArcLen += w;
        }

        const totalAngle = totalArcLen / radius;
        // Đặt góc bắt đầu ở bên trái, rồi giảm dần góc ngược chiều kim đồng hồ
        let currentAngle = centerAngle + totalAngle / 2;

        for (let i = 0; i < len; i++) {
          const char = str[i];
          const charAngle = charWidths[i] / radius;
          const midAngle = currentAngle - charAngle / 2;

          sctx.save();
          sctx.translate(512, 512);
          sctx.rotate(midAngle);
          sctx.translate(0, -radius);
          sctx.rotate(Math.PI);
          sctx.fillText(char, 0, 0);
          sctx.restore();

          currentAngle -= charAngle;
        }
      };

      // GĐ4: Font updated to Be Vietnam Pro 800, letter-spacing 0.08em via extraSpacing
      // Top outer arc: TỔNG CÔNG TY ĐIỆN LỰC THÀNH PHỐ HỒ CHÍ MINH
      sctx.fillStyle = '#ffffff';
      sctx.font = '800 24px "Be Vietnam Pro", sans-serif';
      sctx.textAlign = 'center';
      sctx.textBaseline = 'middle';
      sctx.letterSpacing = '0.08em';
      drawArcText('TỔNG CÔNG TY ĐIỆN LỰC THÀNH PHỐ HỒ CHÍ MINH', 395, 0, 6, true);

      // Top inner arc: CÔNG TY ĐIỆN LỰC VŨNG TÀU
      sctx.fillStyle = '#ffffff';
      sctx.font = '800 23px "Be Vietnam Pro", sans-serif';
      drawArcText('CÔNG TY ĐIỆN LỰC VŨNG TÀU', 338, 0, 7, true);

      // Bottom arc: 1985 - 2025 • 40 NĂM PHÁT TRIỂN (Mục G: vẽ thuận chiều nhìn từ sảnh)
      sctx.fillStyle = '#facc15';
      sctx.font = '800 24px "Be Vietnam Pro", sans-serif';
      drawBottomArcText('1985 - 2025 • 40 NĂM PHÁT TRIỂN', 368, Math.PI, 7);

      sealTexture.needsUpdate = true;
    };

    renderSeal(); // initial draw

    const logoImg = new Image();
    logoImg.src = 'assets/logo.png';
    logoImg.onload = () => {
      renderSeal(logoImg);
    };

    const sealGeo = new THREE.CircleGeometry(5.0, 32);
    const sealMat = new THREE.MeshStandardMaterial({
      map: sealTexture,
      roughness: 0.25,
      metalness: 0.4,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -1.0
    });
    const sealMesh = new THREE.Mesh(sealGeo, sealMat);
    sealMesh.rotation.x = -Math.PI / 2;
    sealMesh.position.y = 0.36;
    rotundaGroup.add(sealMesh);

    // 4 Display Pedestals on the Rotunda
    this.buildFlagPedestals(rotundaGroup);

    // GĐ4: LED ring around octagonal dais
    const ledRingGeo = new THREE.CylinderGeometry(12.15, 12.15, 0.08, 8, 1, true);
    const ledRingMat = new THREE.MeshStandardMaterial({
      color: 0x1E40A0,
      emissive: new THREE.Color(0x1E40A0),
      emissiveIntensity: 1.2,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });
    const ledRing = new THREE.Mesh(ledRingGeo, ledRingMat);
    ledRing.position.y = 0.04;
    rotundaGroup.add(ledRing);

    parent.add(rotundaGroup);
  }

  buildFlagPedestals(parent) {
    const coords = [
      { x: -5.5, z: -3.5, rot: Math.PI / 4 },
      { x: 5.5, z: -3.5, rot: -Math.PI / 4 },
      { x: -5.5, z: 3.5, rot: 3 * Math.PI / 4 },
      { x: 5.5, z: 3.5, rot: -3 * Math.PI / 4 }
    ];

    coords.forEach((c, idx) => {
      const g = new THREE.Group();
      g.position.set(c.x, 0.35, c.z);
      g.rotation.y = c.rot;

      const baseGeo = new THREE.BoxGeometry(1.6, 1.1, 1.2);
      const baseMesh = new THREE.Mesh(baseGeo, this.matPedestalMarble);
      baseMesh.position.y = 0.55;
      baseMesh.castShadow = true;
      g.add(baseMesh);

      const goldTrim = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.08, 1.28), this.matGold);
      goldTrim.position.y = 1.14;
      g.add(goldTrim);

      const glassMesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.0, 1.1), this.matGlass);
      glassMesh.position.y = 2.15;
      g.add(glassMesh);

      const capMesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 1.2), this.matGold);
      capMesh.position.y = 3.2;
      g.add(capMesh);

      // Baked emissive glow replaces per-pedestal PointLight
      glassMesh.material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.15,
        roughness: 0.1,
        metalness: 0.05,
        emissive: new THREE.Color(0xfffaed),
        emissiveIntensity: 0.4,
        depthWrite: false
      });

      g.name = `Rotunda_Pedestal_${idx}`;
      parent.add(g);
    });
  }

  createZoneTitleBoard({
    badge = '',
    title = '',
    subtitle = '',
    theme = 'sanh',
    w = 12.0,
    h = 2.2,
    pos = { x: 0, y: 6.2, z: 0 },
    rotY = 0,
    doubleSided = false,
    parent = null
  }) {
    const THEMES = {
      sanh: {
        bgGrad: ['#0f2b6e', '#1e40a0'],
        borderColor: '#facc15',
        innerBorder: 'rgba(250, 204, 21, 0.45)',
        titleColor: '#ffffff',
        subColor: '#fef08a',
        badgeBg: '#facc15',
        badgeText: '#1e40a0',
        badgeBorder: '#ffffff',
        emissiveColor: 0x1e40a0
      },
      khu1: {
        bgColor: '#f5ebd7',
        borderColor: '#8b6f47',
        innerBorder: 'rgba(139, 111, 71, 0.4)',
        titleColor: '#5b3a1e',
        subColor: '#785336',
        badgeBg: '#8b6f47',
        badgeText: '#f5ebd7',
        badgeBorder: '#5b3a1e',
        emissiveColor: 0x8b6f47
      },
      khu2: {
        bgGrad: ['#7f1d1d', '#991b1b'],
        borderColor: '#f6d26b',
        innerBorder: 'rgba(246, 210, 107, 0.45)',
        titleColor: '#f6d26b',
        subColor: '#fef08a',
        badgeBg: '#f6d26b',
        badgeText: '#7f1d1d',
        badgeBorder: '#ffffff',
        emissiveColor: 0x8b1a1a
      },
      khu3: {
        bgGrad: ['#080e1e', '#0e1a34'],
        borderColor: '#22d3ee',
        innerBorder: 'rgba(34, 211, 238, 0.4)',
        titleColor: '#ffffff',
        subColor: '#7dd3fc',
        badgeBg: '#0f2756',
        badgeText: '#38bdf8',
        badgeBorder: '#22d3ee',
        emissiveColor: 0x0284c7
      },
      khu4: {
        bgGrad: ['#991b1b', '#b91c1c'],
        borderColor: '#facc15',
        innerBorder: 'rgba(250, 204, 21, 0.45)',
        titleColor: '#facc15',
        subColor: '#fef08a',
        badgeBg: '#facc15',
        badgeText: '#991b1b',
        badgeBorder: '#ffffff',
        emissiveColor: 0xb91c1c
      },
      khu5: {
        bgGrad: ['#541018', '#6b1520'],
        borderColor: '#d4af37',
        innerBorder: 'rgba(212, 175, 55, 0.4)',
        titleColor: '#facc15',
        subColor: '#fef08a',
        badgeBg: '#d4af37',
        badgeText: '#541018',
        badgeBorder: '#ffffff',
        emissiveColor: 0x6b1520
      },
      khu6: {
        isDual: true,
        borderColor: '#38bdf8',
        innerBorder: 'rgba(255, 255, 255, 0.4)',
        titleColor: '#ffffff',
        subColor: '#e0f2fe',
        badgeBg: '#ffffff',
        badgeText: '#1d4ed8',
        badgeBorder: '#38bdf8',
        emissiveColor: 0x0284c7
      }
    };

    const cfg = THEMES[theme] || THEMES.sanh;

    // Strict 1:1 canvas-to-plane aspect ratio
    const canvasH = 512;
    const canvasW = Math.round(canvasH * (w / h));
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');

    // 1. Background
    if (cfg.isDual) {
      const grad = ctx.createLinearGradient(0, 0, canvasW, 0);
      grad.addColorStop(0, '#1d4ed8');
      grad.addColorStop(0.48, '#1e40af');
      grad.addColorStop(0.52, '#0369a1');
      grad.addColorStop(1, '#0284c7');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvasW, canvasH);
    } else if (cfg.bgGrad) {
      const grad = ctx.createLinearGradient(0, 0, canvasW, 0);
      grad.addColorStop(0, cfg.bgGrad[0]);
      grad.addColorStop(0.5, cfg.bgGrad[1]);
      grad.addColorStop(1, cfg.bgGrad[0]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvasW, canvasH);
    } else {
      ctx.fillStyle = cfg.bgColor;
      ctx.fillRect(0, 0, canvasW, canvasH);
    }

    // 2. Borders
    ctx.strokeStyle = cfg.borderColor;
    ctx.lineWidth = 14;
    ctx.strokeRect(18, 18, canvasW - 36, canvasH - 36);

    ctx.strokeStyle = cfg.innerBorder;
    ctx.lineWidth = 4;
    ctx.strokeRect(34, 34, canvasW - 68, canvasH - 68);

    // 3. Badge (Huy hiệu tròn ghi số khu) — GĐ6-fix1 D3: cao 72 px, chữ 34 px, nằm trong dải 12–26% canvasH
    const maxTextW = canvasW - 160;
    if (badge) {
      const badgeH = 72;
      ctx.font = `800 34px "Be Vietnam Pro", sans-serif`;
      ctx.letterSpacing = '0.04em';
      const badgeW = Math.min(canvasW - 200, Math.max(200, ctx.measureText(badge).width + 80));
      const badgeX = canvasW / 2 - badgeW / 2;
      const badgeY = Math.round(canvasH * 0.19 - badgeH / 2);
      ctx.fillStyle = cfg.badgeBg;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, badgeH / 2);
      ctx.fill();
      if (cfg.badgeBorder) {
        ctx.strokeStyle = cfg.badgeBorder;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.fillStyle = cfg.badgeText;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badge, canvasW / 2, badgeY + badgeH / 2 + 1);
    }

    // 4. Main Title — GĐ6-fix1 D3: titleSize = canvasH × 0,22, thu tối thiểu canvasH × 0,14, tâm ~50%
    const titleY = Math.round(canvasH * 0.50);
    const titleMin = Math.round(canvasH * 0.14);
    let titleSize = Math.round(canvasH * 0.22);
    ctx.font = `800 ${titleSize}px "Be Vietnam Pro", sans-serif`;
    ctx.letterSpacing = '0.06em';
    while (ctx.measureText(title).width > maxTextW && titleSize > titleMin) {
      titleSize -= 2;
      ctx.font = `800 ${titleSize}px "Be Vietnam Pro", sans-serif`;
    }
    ctx.fillStyle = cfg.titleColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, canvasW / 2, titleY);

    // Divider line (giữa tiêu đề và dòng phụ)
    const divY = Math.round(canvasH * 0.645);
    ctx.strokeStyle = cfg.borderColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(canvasW / 2 - Math.min(420, canvasW * 0.25), divY);
    ctx.lineTo(canvasW / 2 + Math.min(420, canvasW * 0.25), divY);
    ctx.stroke();

    // 5. Subtitle — GĐ6-fix1 D3: subSize = canvasH × 0,12, tối thiểu canvasH × 0,08, tâm ~78%
    const subY = Math.round(canvasH * 0.78);
    const subMin = Math.round(canvasH * 0.08);
    let subSize = Math.round(canvasH * 0.12);
    ctx.font = `500 ${subSize}px "Be Vietnam Pro", sans-serif`;
    ctx.letterSpacing = '0.02em';
    while (ctx.measureText(subtitle).width > maxTextW && subSize > subMin) {
      subSize -= 2;
      ctx.font = `500 ${subSize}px "Be Vietnam Pro", sans-serif`;
    }
    ctx.fillStyle = cfg.subColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(subtitle, canvasW / 2, subY);
    ctx.letterSpacing = '0px';

    // 3D Texture & Material
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer?.capabilities?.getMaxAnisotropy?.() || 16;
    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.3,
      metalness: 0.15,
      emissive: new THREE.Color(cfg.emissiveColor || 0x000000),
      emissiveIntensity: 0.15,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });

    const boardGroup = new THREE.Group();
    boardGroup.position.set(pos.x, pos.y, pos.z);
    boardGroup.rotation.y = rotY;

    // Frame
    const frameDepth = doubleSided ? 0.14 : 0.10;
    const frameMat = (theme === 'khu3') ? this.matBaseboardKhu3 : this.matGold;
    const frameMesh = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, h + 0.12, frameDepth), frameMat);
    boardGroup.add(frameMesh);

    // Front face
    const planeGeo = new THREE.PlaneGeometry(w, h);
    const frontMesh = new THREE.Mesh(planeGeo, mat);
    frontMesh.position.z = frameDepth / 2 + 0.02;
    frontMesh.name = `SignBanner_${title}_Front`;
    frontMesh.userData = {
      isTextPlane: true,
      planeW: w,
      planeH: h,
      canvasW: canvasW,
      canvasH: canvasH
    };
    boardGroup.add(frontMesh);

    if (doubleSided) {
      const backMesh = new THREE.Mesh(planeGeo, mat);
      backMesh.position.z = -frameDepth / 2 - 0.02;
      backMesh.rotation.y = Math.PI;
      backMesh.name = `SignBanner_${title}_Back`;
      backMesh.userData = {
        isTextPlane: true,
        planeW: w,
        planeH: h,
        canvasW: canvasW,
        canvasH: canvasH
      };
      boardGroup.add(backMesh);

      // Hanging cables up to ceiling y = 8.0
      const ceilingY = 8.0;
      const cableH = ceilingY - (pos.y + h / 2);
      if (cableH > 0) {
        const cableGeo = new THREE.CylinderGeometry(0.015, 0.015, cableH, 8);
        const cableMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.85, roughness: 0.2 });
        const cable1 = new THREE.Mesh(cableGeo, cableMat);
        cable1.position.set(-w * 0.38, h / 2 + cableH / 2, 0);
        const cable2 = new THREE.Mesh(cableGeo, cableMat);
        cable2.position.set(w * 0.38, h / 2 + cableH / 2, 0);
        boardGroup.add(cable1);
        boardGroup.add(cable2);
      }
    }

    if (parent) parent.add(boardGroup);
    this.signBanners.push({ title, frameMesh, mesh: frontMesh, x: pos.x, y: pos.y, z: pos.z, rotY });
    return boardGroup;
  }

  buildSignage(parent) {
    this.signBanners = [];

    // =========================================================================
    // 1. BẢNG CHÍNH TỪNG KHU (Mục 7)
    // =========================================================================

    // Sảnh: (0; 6,8; −11), quay về lối vào (+z, hướng Nam: rotY = 0)
    this.createZoneTitleBoard({
      badge: 'PC VŨNG TÀU',
      title: 'PHÒNG TRUYỀN THỐNG – CÔNG TY ĐIỆN LỰC VŨNG TÀU',
      subtitle: 'Trực thuộc Tổng công ty Điện lực TP. Hồ Chí Minh',
      theme: 'sanh',
      w: 13.0, h: 2.2,
      pos: { x: 0, y: 6.8, z: -11.0 },
      rotY: 0,
      parent
    });

    // Khu 1: Giữa tường x = −50, quay về hướng Đông (rotY = Math.PI / 2)
    // GĐ6-fix1: mặt tường ở x = −49,4 (tường dày 1,2 m) → đặt bảng ở x = −49,33 để không chìm trong tường;
    // nâng lên y = 6,75 (mép dưới 5,65 m) giống khu 2 vì tầng ảnh trên đã nâng lên 4,40 m
    this.createZoneTitleBoard({
      badge: 'KHU 1',
      title: 'KÝ ỨC MỘT CHẶNG ĐƯỜNG',
      subtitle: 'Ảnh tư liệu 1985 – 2009 và tranh các đơn vị trao tặng',
      theme: 'khu1',
      w: 12.0, h: 2.2,
      pos: { x: -49.33, y: 6.75, z: 0 },
      rotY: Math.PI / 2,
      parent
    });

    // Khu 2: Giữa tường z = −55, phía trên tầng cờ, quay về hướng Nam (rotY = 0)
    // GĐ6-fix1 C: dời lên y = 6,75 (mép dưới 5,65 m); mặt tường ở z = −54,4 → z = −54,33
    this.createZoneTitleBoard({
      badge: 'KHU 2',
      title: 'VINH QUANG NHỮNG CHẶNG ĐƯỜNG',
      subtitle: 'Huân chương, Bằng khen và Cờ thi đua 1985 – 2025',
      theme: 'khu2',
      w: 14.0, h: 2.2,
      pos: { x: 0, y: 6.75, z: -54.33 },
      rotY: 0,
      parent
    });

    // Khu 3: Phía trên mặt Tây vách mốc son x = 35, quay về hướng Tây (rotY = -Math.PI / 2)
    this.createZoneTitleBoard({
      badge: 'KHU 3',
      title: 'VỮNG BƯỚC KỶ NGUYÊN MỚI',
      subtitle: 'Lưới điện thông minh · Tự động hóa · Chuyển đổi số',
      theme: 'khu3',
      w: 12.0, h: 2.2,
      pos: { x: 34.65, y: 6.45, z: 0 },
      rotY: -Math.PI / 2,
      parent
    });

    // Khu 4: Giữa tường z = 82, quay về hướng Bắc (rotY = Math.PI)
    this.createZoneTitleBoard({
      badge: 'KHU 4',
      title: 'ĐẢNG BỘ CÔNG TY',
      subtitle: 'Đảng bộ Công ty Điện lực Vũng Tàu – trong sạch, vững mạnh',
      theme: 'khu4',
      w: 12.0, h: 2.2,
      pos: { x: 36.0, y: 6.85, z: 81.33 },
      rotY: Math.PI,
      parent
    });

    // Khu 6: Giữa tường z = 82, quay về hướng Bắc (rotY = Math.PI)
    this.createZoneTitleBoard({
      badge: 'KHU 6',
      title: 'CÔNG ĐOÀN – ĐOÀN THANH NIÊN',
      subtitle: 'Đoàn kết · Sáng tạo · Xung kích · Tình nguyện',
      theme: 'khu6',
      w: 12.0, h: 2.2,
      pos: { x: -36.0, y: 6.85, z: 81.33 },
      rotY: Math.PI,
      parent
    });

    // =========================================================================
    // 2. BIỂN CỔNG TREO 2 MẶT TẠI LỐI VÀO — GĐ6-fix1 D3: 7,0 × 1,6 m, tâm y = 5,6 m
    // =========================================================================
    const GATE_W = 7.0, GATE_H = 1.6, GATE_Y = 5.6;

    // Cổng Khu 1 (Lối vào phía Tây): x = -17.5, z = 0, rotY = Math.PI / 2
    this.createZoneTitleBoard({
      badge: 'KHU 1',
      title: 'KÝ ỨC & TRANH TẶNG',
      subtitle: 'Ảnh tư liệu 1985–2009 • Tranh tặng các đơn vị',
      theme: 'khu1',
      w: GATE_W, h: GATE_H,
      pos: { x: -17.5, y: GATE_Y, z: 0 },
      rotY: Math.PI / 2,
      doubleSided: true,
      parent
    });

    // Cổng Khu 2 (Lối vào phía Bắc): x = 0, z = -17.0, rotY = 0
    this.createZoneTitleBoard({
      badge: 'KHU 2',
      title: 'BẰNG KHEN & CỜ THI ĐUA',
      subtitle: 'Huân chương • Bằng khen • Cờ lưu niệm 1985–2025',
      theme: 'khu2',
      w: GATE_W, h: GATE_H,
      pos: { x: 0, y: GATE_Y, z: -17.0 },
      rotY: 0,
      doubleSided: true,
      parent
    });

    // Cổng Khu 3 (Lối vào phía Đông): x = 17.5, z = 0, rotY = -Math.PI / 2
    this.createZoneTitleBoard({
      badge: 'KHU 3',
      title: 'LƯỚI ĐIỆN THÔNG MINH',
      subtitle: 'Sa bàn lưới điện • Tự động hóa • Chuyển đổi số',
      theme: 'khu3',
      w: GATE_W, h: GATE_H,
      pos: { x: 17.5, y: GATE_Y, z: 0 },
      rotY: -Math.PI / 2,
      doubleSided: true,
      parent
    });

    // Cổng Khu 4: treo từ trần tại z = 38, giữa lối vào mới x 22 → 50 (GĐ6-fix1 E2)
    this.createZoneTitleBoard({
      badge: 'KHU 4',
      title: 'ĐẢNG BỘ CÔNG TY',
      subtitle: 'Đoàn kết • Kỷ cương • Đổi mới • Phát triển',
      theme: 'khu4',
      w: GATE_W, h: GATE_H,
      pos: { x: 36.0, y: GATE_Y, z: 38.0 },
      rotY: 0,
      doubleSided: true,
      parent
    });

    // Cổng Khu 6: treo từ trần tại z = 38, giữa lối vào mới x −50 → −22 (GĐ6-fix1 E2)
    this.createZoneTitleBoard({
      badge: 'KHU 6',
      title: 'CÔNG ĐOÀN – ĐOÀN THANH NIÊN',
      subtitle: 'Đoàn kết • Sáng tạo • Xung kích • Tình nguyện',
      theme: 'khu6',
      w: GATE_W, h: GATE_H,
      pos: { x: -36.0, y: GATE_Y, z: 38.0 },
      rotY: 0,
      doubleSided: true,
      parent
    });
  }

  /**
   * Historical Timeline Milestone Plaques mounted on gallery walls
   * Architectural period markers framing key epochs (1985-2005, 2006-2016, 2017-2025)
   */
  buildTimelineMilestonePlaques(parent) {
    const milestonesGroup = new THREE.Group();
    milestonesGroup.name = 'TimelineMilestonePlaques';
    this.milestonesGroup = milestonesGroup;

    const createMilestonePlaque = (badge, title, subtitle, themeColor, w, h, x, y, z, rotY) => {
      const canvas = document.createElement('canvas');
      const canvasH = 320;
      const canvasW = Math.round(canvasH * (w / h));
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext('2d');

      // 1. Dark royal obsidian background
      const grad = ctx.createLinearGradient(0, 0, canvasW, 0);
      grad.addColorStop(0, '#090e1a');
      grad.addColorStop(0.5, '#101728');
      grad.addColorStop(1, '#090e1a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvasW, canvasH);

      // 2. Outer decorative gold/theme border
      ctx.strokeStyle = themeColor;
      ctx.lineWidth = 8;
      ctx.strokeRect(12, 12, canvasW - 24, canvasH - 24);

      // Inner subtle gold border
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.4)';
      ctx.lineWidth = 3;
      ctx.strokeRect(24, 24, canvasW - 48, canvasH - 48);

      // 3. Left Pill Badge (MỐC LỊCH SỬ / GIAI ĐOẠN)
      ctx.fillStyle = themeColor;
      ctx.beginPath();
      ctx.roundRect(45, 45, 340, 50, 25);
      ctx.fill();

      ctx.fillStyle = '#0a0f1d';
      ctx.font = 'bold 24px "Be Vietnam Pro", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badge, 215, 70);

      // 4. Milestone Title (Auto-fit font size to NEVER overflow)
      let titleFontSize = 46;
      ctx.font = `bold ${titleFontSize}px "Be Vietnam Pro", sans-serif`;
      let titleWidth = ctx.measureText(title).width;
      const maxTitleWidth = canvasW - 500;
      while (titleWidth > maxTitleWidth && titleFontSize > 24) {
        titleFontSize -= 2;
        ctx.font = `bold ${titleFontSize}px "Be Vietnam Pro", sans-serif`;
        titleWidth = ctx.measureText(title).width;
      }
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(title, 420, 72);

      // 5. Milestone Subtitle / Description (Auto-fit font size to NEVER overflow)
      let subFontSize = 26;
      ctx.font = `italic 500 ${subFontSize}px "Be Vietnam Pro", sans-serif`;
      let subWidth = ctx.measureText(subtitle).width;
      const maxSubWidth = canvasW - 148;
      while (subWidth > maxSubWidth && subFontSize > 18) {
        subFontSize -= 1;
        ctx.font = `italic 500 ${subFontSize}px "Be Vietnam Pro", sans-serif`;
        subWidth = ctx.measureText(subtitle).width;
      }
      ctx.fillStyle = '#cbd5e1';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(subtitle, 55, 200);

      // Accent gold divider line
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(45, 130);
      ctx.lineTo(canvasW - 48, 130);
      ctx.stroke();

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = this.renderer?.capabilities?.getMaxAnisotropy?.() || 16;
      const mat = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.25,
        metalness: 0.15,
        emissive: new THREE.Color(themeColor),
        emissiveIntensity: 0.18,
        polygonOffset: true,
        polygonOffsetFactor: -2.0,
        polygonOffsetUnits: -2.0
      });

      // Frame mesh placed at wall coordinate
      const frameThickness = 0.06;
      const frameGeo = new THREE.BoxGeometry(w + 0.12, h + 0.12, frameThickness);
      const frameMesh = new THREE.Mesh(frameGeo, this.matGold);
      frameMesh.position.set(x, y, z);
      frameMesh.rotation.y = rotY;

      // Plaque Mesh placed strictly 0.035m in front of frame (clears 0.03m front face, ZERO coplanar Z-fighting)
      const normalX = Math.sin(rotY);
      const normalZ = Math.cos(rotY);
      const plaqueMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      plaqueMesh.position.set(x + 0.035 * normalX, y, z + 0.035 * normalZ);
      plaqueMesh.rotation.y = rotY;
      plaqueMesh.name = `MilestonePlaque_${title}`;
      plaqueMesh.userData = {
        isTextPlane: true,
        planeW: w,
        planeH: h,
        canvasW: canvasW,
        canvasH: canvasH
      };

      milestonesGroup.add(frameMesh);
      milestonesGroup.add(plaqueMesh);
    };

    // --- KHU 2: NHÀ NƯỚC & TẬP ĐOÀN ĐIỆN LỰC (y = 3.90m) ---
    // 1. Tường Bắc Khu 2 (Honor Wall above Orders)
    createMilestonePlaque(
      'MỐC SON DANH DỰ',
      'CÁC PHẦN THƯỞNG CAO QUÝ CỦA ĐẢNG & NHÀ NƯỚC (1985 - 2025)',
      'Huân chương Lao động Hạng Nhất, Nhì, Ba • Bằng khen Thủ tướng Chính phủ trao tặng Công ty Điện lực Vũng Tàu',
      '#eab308',
      12.0, 0.55,
      0, 3.90, -54.85,
      0
    );

    // 2. Tường Tây Khu 2 (EVN & Bộ Công Thương)
    createMilestonePlaque(
      'GIAI ĐOẠN 1985 - 2025',
      'THI ĐUA XUẤT SẮC: TẬP ĐOÀN ĐIỆN LỰC VIỆT NAM (EVN) & BỘ CÔNG THƯƠNG',
      'Cờ thi đua & Bằng khen ghi nhận thành tích xuất sắc toàn diện trong cung ứng điện an toàn, ổn định và liên tục',
      '#eab308',
      10.0, 0.55,
      -17.85, 3.90, -36.0,
      Math.PI / 2
    );

    // 3. Tường Đông Khu 2 (EVNHCMC)
    createMilestonePlaque(
      'GIAI ĐOẠN 1985 - 2025',
      'ĐƠN VỊ DẪN ĐẦU: TỔNG CÔNG TY ĐIỆN LỰC TP. HỒ CHÍ MINH (EVNHCMC)',
      'Tiên phong hoàn thành xuất sắc các chỉ tiêu kinh tế kỹ thuật, hiện đại hóa lưới điện và nâng tầm dịch vụ khách hàng',
      '#eab308',
      10.0, 0.55,
      17.85, 3.90, -36.0,
      -Math.PI / 2
    );

    // --- KHU 1: ĐỒNG HÀNH CÙNG TỈNH BÀ RỊA - VŨNG TÀU (y = 3.90m) ---
    // 4. Tường Bắc Khu 1 (1985 - 2005)
    createMilestonePlaque(
      'GIAI ĐOẠN 1985 - 2005',
      'THỜI KỲ KHỞI ĐẦU, THÀNH LẬP & TÁI THIẾT HỆ THỐNG ĐIỆN ĐÔ THỊ BIỂN',
      'Từ Đặc khu Vũng Tàu - Côn Đảo đến thành lập tỉnh Bà Rịa - Vũng Tàu • Vượt qua muôn vàn khó khăn mở rộng nguồn điện',
      '#16a34a',
      10.0, 0.55,
      -34.0, 3.90, -24.85,
      0
    );

    // 5. Tường Tây Khu 1 (2006 - 2016)
    createMilestonePlaque(
      'GIAI ĐOẠN 2006 - 2016',
      'TĂNG TỐC PHÁT TRIỂN & CÔNG NGHIỆP HÓA ĐÔ THỊ DẦU KHÍ - DU LỊCH',
      'Cung ứng nguồn điện ổn định phục vụ trọng điểm ngành dầu khí, cụm cảng nước sâu Cái Mép và du lịch biển Vũng Tàu',
      '#16a34a',
      12.0, 0.55,
      -49.85, 3.90, 0,
      Math.PI / 2
    );

    // 6. Tường Nam Khu 1 (2017 - 2025)
    createMilestonePlaque(
      'GIAI ĐOẠN 2017 - 2025',
      'HIỆN ĐẠI HÓA, LƯỚI ĐIỆN THÔNG MINH & CHUYỂN ĐỔI SỐ TOÀN DIỆN',
      'Đột phá tự động hóa lưới điện, trạm không người trực, giao dịch điện tử 100% và chỉ số SAIDI - SAIFI đạt chuẩn quốc tế',
      '#16a34a',
      10.0, 0.55,
      -34.0, 3.90, 24.85,
      Math.PI
    );

    parent.add(milestonesGroup);
  }

  /**
   * Decorative Potted Plants in corners and gallery portals
   * Premium architectural museum planters: upright, symmetrical, elegant foliage
   * Positioned flush against wall baseboards and corners ("sát mép tường")
   */
  buildPottedPlants(parent) {
    this.plantZoneGroups = {
      khu1: new THREE.Group(),
      khu2: new THREE.Group(),
      khu3: new THREE.Group(),
      khu4: new THREE.Group(),
      khu6: new THREE.Group()
    };
    this.plantZoneGroups.khu1.name = 'PottedPlants_Khu1';
    this.plantZoneGroups.khu2.name = 'PottedPlants_Khu2';
    this.plantZoneGroups.khu3.name = 'PottedPlants_Khu3';
    this.plantZoneGroups.khu4.name = 'PottedPlants_Khu4';
    this.plantZoneGroups.khu6.name = 'PottedPlants_Khu6';

    // Premium Materials
    const potMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.25,
      metalness: 0.15
    });

    const stemMat = new THREE.MeshStandardMaterial({
      color: 0x2e4a28,
      roughness: 0.5,
      metalness: 0.05
    });

    const leafMatDark = new THREE.MeshStandardMaterial({
      color: 0x14532d,
      roughness: 0.35,
      metalness: 0.05,
      side: THREE.DoubleSide
    });

    const leafMatVibrant = new THREE.MeshStandardMaterial({
      color: 0x16a34a,
      roughness: 0.32,
      metalness: 0.05,
      side: THREE.DoubleSide
    });

    // Helper: 3D Arching Leaf Geometry with V-crease
    const createCurvedLeafGeometry = (length = 0.72, maxWidth = 0.17, archCurve = 0.22, crease = 0.035) => {
      const segments = 6;
      const positions = [];
      const uvs = [];
      const indices = [];

      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const z = t * length;
        const y = Math.sin(t * Math.PI) * archCurve - (t > 0.55 ? (t - 0.55) * archCurve * 1.6 : 0);
        const w = Math.sin(t * Math.PI) * maxWidth * (1.0 - t * 0.25);

        positions.push(0, y + crease, z);
        uvs.push(0.5, t);

        positions.push(-w, y - crease * 0.5, z);
        uvs.push(0, t);

        positions.push(w, y - crease * 0.5, z);
        uvs.push(1, t);
      }

      for (let i = 0; i < segments; i++) {
        const row = i * 3;
        const nextRow = (i + 1) * 3;

        indices.push(row, row + 1, nextRow + 1);
        indices.push(row, nextRow + 1, nextRow);

        indices.push(row, nextRow + 2, row + 2);
        indices.push(row, nextRow, nextRow + 2);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    };

    // BufferGeometry merger helper (reduces 41 meshes per pot down to 5 meshes shared across all pots)
    const mergeBufferGeometries = (items) => {
      let totalVerts = 0;
      let totalIndices = 0;
      for (const item of items) {
        totalVerts += item.geometry.attributes.position.count;
        if (item.geometry.index) totalIndices += item.geometry.index.count;
      }
      const pos = new Float32Array(totalVerts * 3);
      const norm = new Float32Array(totalVerts * 3);
      const uv = new Float32Array(totalVerts * 2);
      const idx = new (totalVerts > 65535 ? Uint32Array : Uint16Array)(totalIndices);

      let vOff = 0;
      let iOff = 0;
      const v = new THREE.Vector3();
      const n = new THREE.Vector3();
      const nMat = new THREE.Matrix3();

      for (const item of items) {
        const geo = item.geometry;
        const m = item.matrix || new THREE.Matrix4();
        nMat.getNormalMatrix(m);

        const posAttr = geo.attributes.position;
        const normAttr = geo.attributes.normal;
        const uvAttr = geo.attributes.uv;
        const count = posAttr.count;

        for (let i = 0; i < count; i++) {
          v.fromBufferAttribute(posAttr, i).applyMatrix4(m);
          pos[(vOff + i) * 3] = v.x;
          pos[(vOff + i) * 3 + 1] = v.y;
          pos[(vOff + i) * 3 + 2] = v.z;

          if (normAttr) {
            n.fromBufferAttribute(normAttr, i).applyMatrix3(nMat).normalize();
            norm[(vOff + i) * 3] = n.x;
            norm[(vOff + i) * 3 + 1] = n.y;
            norm[(vOff + i) * 3 + 2] = n.z;
          }

          if (uvAttr) {
            uv[(vOff + i) * 2] = uvAttr.getX(i);
            uv[(vOff + i) * 2 + 1] = uvAttr.getY(i);
          }
        }

        if (geo.index) {
          const idxAttr = geo.index;
          for (let i = 0; i < idxAttr.count; i++) {
            idx[iOff + i] = idxAttr.getX(i) + vOff;
          }
          iOff += idxAttr.count;
        }
        vOff += count;
      }

      const merged = new THREE.BufferGeometry();
      merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      merged.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
      merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      merged.setIndex(new THREE.BufferAttribute(idx, 1));
      return merged;
    };

    // 1. Pot Body & Soil (Merged into 1 geometry)
    const geoPot = new THREE.CylinderGeometry(0.38, 0.27, 0.86, 20);
    const mPot = new THREE.Matrix4().makeTranslation(0, 0.44, 0);
    const geoSoil = new THREE.CylinderGeometry(0.36, 0.36, 0.04, 20);
    const mSoil = new THREE.Matrix4().makeTranslation(0, 0.85, 0);
    const geoPotBody = mergeBufferGeometries([
      { geometry: geoPot, matrix: mPot },
      { geometry: geoSoil, matrix: mSoil }
    ]);

    // 2. Gold Trim Accents (Base, Waist, Rim merged into 1 geometry)
    const geoBase = new THREE.CylinderGeometry(0.29, 0.31, 0.06, 20);
    const mBase = new THREE.Matrix4().makeTranslation(0, 0.03, 0);
    const geoWaist = new THREE.CylinderGeometry(0.342, 0.342, 0.025, 20);
    const mWaist = new THREE.Matrix4().makeTranslation(0, 0.48, 0);
    const geoRim = new THREE.CylinderGeometry(0.40, 0.40, 0.06, 20);
    const mRim = new THREE.Matrix4().makeTranslation(0, 0.86, 0);
    const geoGoldTrim = mergeBufferGeometries([
      { geometry: geoBase, matrix: mBase },
      { geometry: geoWaist, matrix: mWaist },
      { geometry: geoRim, matrix: mRim }
    ]);

    // 3. Stems (Center trunk + 4 upright outer bamboo stems merged into 1 geometry)
    const stemItems = [];
    const geoStemCenter = new THREE.CylinderGeometry(0.028, 0.038, 1.40, 8);
    const mCenter = new THREE.Matrix4().makeTranslation(0, 0.85 + 0.70, 0);
    stemItems.push({ geometry: geoStemCenter, matrix: mCenter });

    const caneRadius = 0.065;
    for (let c = 0; c < 4; c++) {
      const cAngle = c * (Math.PI / 2);
      const cx = Math.cos(cAngle) * caneRadius;
      const cz = Math.sin(cAngle) * caneRadius;
      const geoStemOuter = new THREE.CylinderGeometry(0.018, 0.026, 1.05, 8);
      const mOuter = new THREE.Matrix4().makeTranslation(cx, 0.85 + 0.525, cz);
      stemItems.push({ geometry: geoStemOuter, matrix: mOuter });
    }
    const geoStems = mergeBufferGeometries(stemItems);

    // 4. Foliage - Deep Green Leaves (Tier 1: 6 leaves + Tier 2: 4 leaves merged)
    const geoLeafLarge = createCurvedLeafGeometry(0.72, 0.17, 0.24, 0.038);
    const geoLeafMid = createCurvedLeafGeometry(0.58, 0.14, 0.18, 0.030);
    const geoLeafCrown = createCurvedLeafGeometry(0.44, 0.11, 0.12, 0.022);

    const darkLeafItems = [];
    const tier1Count = 6;
    for (let i = 0; i < tier1Count; i++) {
      const angle = i * ((Math.PI * 2) / tier1Count);
      const m = new THREE.Matrix4();
      m.makeRotationFromEuler(new THREE.Euler(-0.48, Math.PI / 2 - angle, 0, 'YXZ'));
      m.setPosition(Math.cos(angle) * 0.08, 1.25, Math.sin(angle) * 0.08);
      darkLeafItems.push({ geometry: geoLeafLarge, matrix: m });
    }
    const tier2Count = 8;
    for (let i = 0; i < tier2Count; i += 2) {
      const angle = (i + 0.5) * ((Math.PI * 2) / tier2Count);
      const m = new THREE.Matrix4();
      m.makeRotationFromEuler(new THREE.Euler(-0.35, Math.PI / 2 - angle, 0, 'YXZ'));
      m.setPosition(Math.cos(angle) * 0.06, 1.55, Math.sin(angle) * 0.06);
      darkLeafItems.push({ geometry: geoLeafLarge, matrix: m });
    }
    const geoFoliageDark = mergeBufferGeometries(darkLeafItems);

    // 5. Foliage - Vibrant/Highlight Leaves (Tier 2: 4 leaves + Tier 3: 6 leaves + Tier 4: 3 spires merged)
    const vibrantLeafItems = [];
    for (let i = 1; i < tier2Count; i += 2) {
      const angle = (i + 0.5) * ((Math.PI * 2) / tier2Count);
      const m = new THREE.Matrix4();
      m.makeRotationFromEuler(new THREE.Euler(-0.35, Math.PI / 2 - angle, 0, 'YXZ'));
      m.setPosition(Math.cos(angle) * 0.06, 1.55, Math.sin(angle) * 0.06);
      vibrantLeafItems.push({ geometry: geoLeafLarge, matrix: m });
    }
    const tier3Count = 6;
    for (let i = 0; i < tier3Count; i++) {
      const angle = i * ((Math.PI * 2) / tier3Count);
      const m = new THREE.Matrix4();
      m.makeRotationFromEuler(new THREE.Euler(-0.22, Math.PI / 2 - angle, 0, 'YXZ'));
      m.setPosition(Math.cos(angle) * 0.04, 1.85, Math.sin(angle) * 0.04);
      vibrantLeafItems.push({ geometry: geoLeafMid, matrix: m });
    }
    const tier4Count = 3;
    for (let i = 0; i < tier4Count; i++) {
      const angle = (i * ((Math.PI * 2) / tier4Count)) + 0.3;
      const m = new THREE.Matrix4();
      m.makeRotationFromEuler(new THREE.Euler(-0.08, Math.PI / 2 - angle, 0, 'YXZ'));
      m.setPosition(Math.cos(angle) * 0.02, 2.10, Math.sin(angle) * 0.02);
      vibrantLeafItems.push({ geometry: geoLeafCrown, matrix: m });
    }
    const geoFoliageVibrant = mergeBufferGeometries(vibrantLeafItems);

    const createPlant = (x, z) => {
      const p = new THREE.Group();
      p.position.set(x, 0, z);

      const potMesh = new THREE.Mesh(geoPotBody, potMat);
      potMesh.castShadow = true;
      potMesh.receiveShadow = true;
      p.add(potMesh);

      const goldMesh = new THREE.Mesh(geoGoldTrim, this.matGold);
      p.add(goldMesh);

      const stemMesh = new THREE.Mesh(geoStems, stemMat);
      stemMesh.castShadow = true;
      p.add(stemMesh);

      const folDarkMesh = new THREE.Mesh(geoFoliageDark, leafMatDark);
      folDarkMesh.castShadow = true;
      p.add(folDarkMesh);

      const folVibrantMesh = new THREE.Mesh(geoFoliageVibrant, leafMatVibrant);
      folVibrantMesh.castShadow = true;
      p.add(folVibrantMesh);

      return p;
    };

    // Plant coordinates per zone
    const zoneCoords = {
      khu2: [
        [-16.93, -53.93], [16.93, -53.93],
        [-16.93, -15.00], [16.93, -15.00]
      ],
      khu1: [
        [-48.93, -23.93], [-33.00, 23.93],
        [-19.00, -23.93], [-19.00, 23.93],
        [-35.00, -12.43], [-35.00, 12.43]
      ],
      khu3: [
        [48.93, -23.93], [33.00, 23.93],
        [19.00, -23.93], [19.00, 23.93]
      ],
      khu4: [
        [48.93, 39.00], [48.93, 80.93],
        [23.00, 80.93], [23.00, 39.00]
      ],
      khu6: [
        [-48.93, 39.00], [-48.93, 80.93],
        [-23.00, 80.93], [-23.00, 39.00]
      ]
    };

    for (const [zoneKey, coords] of Object.entries(zoneCoords)) {
      const grp = this.plantZoneGroups[zoneKey];
      coords.forEach(([x, z]) => grp.add(createPlant(x, z)));
      parent.add(grp);
    }
  }

  /**
   * Architectural Ceiling Light Fixtures (Recessed LED Coffers & Chandelier)
   */
  buildCeilingLightFixtures(parent) {
    const ceilGroup = new THREE.Group();
    ceilGroup.name = 'CeilingLightingFixtures';

    const lightCofferMat = new THREE.MeshStandardMaterial({
      color: 0xfffaed,
      emissive: 0xfef08a,
      emissiveIntensity: 0.7,
      roughness: 0.2
    });

    // Central Rotunda Chandelier Light Ring
    const ringGeo = new THREE.TorusGeometry(6.5, 0.15, 12, 48);
    const ringMesh = new THREE.Mesh(ringGeo, lightCofferMat);
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.set(0, 8.2, 0);
    ceilGroup.add(ringMesh);

    const innerRingGeo = new THREE.TorusGeometry(3.5, 0.12, 12, 36);
    const innerRingMesh = new THREE.Mesh(innerRingGeo, this.matGold);
    innerRingMesh.rotation.x = Math.PI / 2;
    innerRingMesh.position.set(0, 8.25, 0);
    ceilGroup.add(innerRingMesh);

    const createCoffer = (w, d, x, y, z, rotY = 0) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.rotation.y = rotY;

      const frameGeo = new THREE.BoxGeometry(w + 0.3, 0.1, d + 0.3);
      const frame = new THREE.Mesh(frameGeo, this.matGold);
      g.add(frame);

      const panelGeo = new THREE.PlaneGeometry(w, d);
      const panel = new THREE.Mesh(panelGeo, lightCofferMat);
      panel.rotation.x = Math.PI / 2;
      panel.position.y = -0.04;
      g.add(panel);

      // Emissive panel replaces per-coffer PointLight for performance
      panel.material = new THREE.MeshStandardMaterial({
        color: 0xfff7ed,
        emissive: new THREE.Color(0xfff7ed),
        emissiveIntensity: 0.8,
        roughness: 0.9,
        side: THREE.DoubleSide
      });

      ceilGroup.add(g);
    };

    // Khu 2 ceiling lights (North - deeper with z=-55)
    createCoffer(12, 2.5, 0, 8.35, -24, 0);
    createCoffer(12, 2.5, 0, 8.35, -34, 0);
    createCoffer(12, 2.5, 0, 8.35, -44, 0);
    createCoffer(12, 2.5, 0, 8.35, -52, 0);

    // Khu 1 ceiling lights (West)
    createCoffer(14, 2.5, -26, 8.35, 0, Math.PI / 2);
    createCoffer(14, 2.5, -36, 8.35, 0, Math.PI / 2);
    createCoffer(14, 2.5, -46, 8.35, 0, Math.PI / 2);

    // Khu 3 ceiling lights (East)
    createCoffer(14, 2.5, 26, 8.35, 0, Math.PI / 2);
    createCoffer(14, 2.5, 36, 8.35, 0, Math.PI / 2);
    createCoffer(14, 2.5, 46, 8.35, 0, Math.PI / 2);

    // South lobby ceiling light
    createCoffer(10, 2.5, 0, 8.35, 26, 0);

    // Khu 4 ceiling lights (Đảng bộ)
    createCoffer(12, 2.5, 36, 8.35, 50, 0);
    createCoffer(12, 2.5, 36, 8.35, 65, 0);
    createCoffer(12, 2.5, 36, 8.35, 77, 0);

    // Khu 6 ceiling lights (CĐ + ĐTN)
    createCoffer(12, 2.5, -36, 8.35, 50, 0);
    createCoffer(12, 2.5, -36, 8.35, 65, 0);
    createCoffer(12, 2.5, -36, 8.35, 77, 0);

    parent.add(ceilGroup);
  }

  buildFloorMarker(parent) {
    const group = new THREE.Group();
    group.rotation.x = -Math.PI / 2;
    group.position.set(0, 0.02, 0);
    group.visible = false;

    const ringGeo = new THREE.RingGeometry(0.55, 0.65, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    group.add(ringMesh);

    const dotGeo = new THREE.CircleGeometry(0.12, 16);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide
    });
    const dotMesh = new THREE.Mesh(dotGeo, dotMat);
    group.add(dotMesh);

    this.floorMarker = group;
    parent.add(group);
  }

  setupLighting(parent) {
    // 1. Ambient Light (Increased for bright, brilliant gallery atmosphere)
    const ambient = new THREE.AmbientLight(0xfff7ed, 1.8);
    parent.add(ambient);

    // 2. Hemisphere Light (boosted to compensate for removed per-exhibit lights)
    const hemiLight = new THREE.HemisphereLight(0xfffaed, 0x334155, 2.0);
    hemiLight.position.set(0, 20, 0);
    parent.add(hemiLight);

    // 3. Main Directional Light (shadow disabled for performance)
    const sunLight = new THREE.DirectionalLight(0xfffaed, 2.8);
    sunLight.position.set(0, 30, 0);
    sunLight.castShadow = false;
    parent.add(sunLight);

    // 4. Central Rotunda Chandelier Light
    const centralChandelier = new THREE.PointLight(0xfef08a, 4.5, 40);
    centralChandelier.position.set(0, 7.5, 0);
    parent.add(centralChandelier);

    // 5. North Wall PointLight (replaces expensive SpotLight)
    const northLight = new THREE.PointLight(0xfffaed, 3.5, 30);
    northLight.position.set(0, 7.8, -37);
    parent.add(northLight);

    // 6. Hall Accent Spotlights
    const createHallSpot = (color, x, y, z, tx, ty, tz) => {
      const spot = new THREE.SpotLight(color, 3.0, 35, Math.PI / 4, 0.5);
      spot.position.set(x, y, z);
      spot.target.position.set(tx, ty, tz);
      parent.add(spot);
      parent.add(spot.target);
    };

    // West Hall
    createHallSpot(0xdcfce7, -32, 7.5, 0, -49, 3.0, 0);
    createHallSpot(0xdcfce7, -35, 7.5, -12, -35, 3.0, 0);
    createHallSpot(0xdcfce7, -35, 7.5, 12, -35, 3.0, 0);

    // East Hall (Khu 3: Smart Grid — giảm cường độ xuống 1.8 theo Mục F.3)
    const createK3Spot = (color, x, y, z, tx, ty, tz) => {
      const spot = new THREE.SpotLight(color, 1.8, 35, Math.PI / 4, 0.5);
      spot.position.set(x, y, z);
      spot.target.position.set(tx, ty, tz);
      spot.castShadow = false;
      parent.add(spot);
      parent.add(spot.target);
    };
    createK3Spot(0xe0f2fe, 32, 7.5, 0, 49, 3.0, 0);
    createK3Spot(0xe0f2fe, 35, 7.5, -12, 35, 3.0, 0);
    createK3Spot(0xe0f2fe, 35, 7.5, 12, 35, 3.0, 0);

    // Sa bàn lưới điện direct spotlight: dời từ (43; 7.8; 0) về (26; 7.5; 0) chiếu thẳng xuống bàn, cường độ 2.0 không đổ bóng (Mục B.0c & B.4)
    const tableSpot = new THREE.SpotLight(0xffffff, 2.0, 20, Math.PI / 4, 0.5);
    tableSpot.position.set(26, 7.5, 0);
    tableSpot.target.position.set(26, 0.95, 0);
    tableSpot.castShadow = false;
    parent.add(tableSpot);
    parent.add(tableSpot.target);

    // Khu 4 (Đảng bộ) — warm red accent
    const k4Light = new THREE.PointLight(0xfffaed, 3.0, 35);
    k4Light.position.set(36, 7.5, 60);
    parent.add(k4Light);
    createHallSpot(0xfee2e2, 36, 7.5, 50, 36, 3.0, 55);
    createHallSpot(0xfee2e2, 36, 7.5, 70, 36, 3.0, 65);

    // Khu 6 (CĐ + ĐTN) — cool blue accent
    const k6Light = new THREE.PointLight(0xfffaed, 3.0, 35);
    k6Light.position.set(-36, 7.5, 60);
    parent.add(k6Light);
    createHallSpot(0xdcfce7, -36, 7.5, 50, -36, 3.0, 55);
    createHallSpot(0xdcfce7, -36, 7.5, 70, -36, 3.0, 65);
  }

  /**
   * GĐ4: Two Album Cabinets replacing single vitrine.
   * Cabinet 1 at (-6.5, -6.5) rotY=+π/4, Cabinet 2 at (6.5, -6.5) rotY=-π/4.
   * Each: 2.2m wide × 0.9m deep, walnut legs 1.05m, glass lid 0.35m, LED warm interior.
   * 4 albums total: souvenir + awards_flags (cabinet 1), pcvt + doan_the (cabinet 2).
   */
  buildAlbumCabinets(parent) {
    // Walnut wood material for cabinet legs/body
    const matWalnut = new THREE.MeshStandardMaterial({
      color: 0x5C3317, roughness: 0.55, metalness: 0.05
    });
    // Dark walnut for apron
    const matWalnutDark = new THREE.MeshStandardMaterial({
      color: 0x3B1F0B, roughness: 0.5, metalness: 0.08
    });

    const cabinetConfigs = [
      {
        pos: [-6.5, -6.5], rotY: Math.PI / 4,
        label: 'KÝ ỨC & VINH DANH',
        albums: [
          { id: 'souvenir', title: 'Ảnh Lưu Niệm', subtitle: 'Ký ức 1985–2009 & Tranh tặng',
            coverType: 'souvenir', c1: '#6b1515', c2: '#450a0a', gold: '#facc15',
            coverTitle: 'TẬP ẢNH TƯ LIỆU & LƯU NIỆM', coverOrg: 'CÔNG TY ĐIỆN LỰC VŨNG TÀU', coverSub: '1985 - 2025 • 40 NĂM PHÁT TRIỂN' },
          { id: 'awards_flags', title: 'Bằng khen & Cờ lưu niệm', subtitle: 'Huân chương, Bằng khen, Cờ thi đua',
            coverType: 'awards', c1: '#8B1A1A', c2: '#4A0E0E', gold: '#F6D26B',
            coverTitle: 'BẰNG KHEN & CỜ LƯU NIỆM', coverOrg: 'CÔNG TY ĐIỆN LỰC VŨNG TÀU', coverSub: 'HUÂN CHƯƠNG • BẰNG KHEN • CỜ THI ĐUA' }
        ]
      },
      {
        pos: [6.5, -6.5], rotY: -Math.PI / 4,
        label: 'HÔM NAY & ĐOÀN THỂ',
        albums: [
          { id: 'pcvt', title: 'Công ty Điện lực Vũng Tàu', subtitle: 'Hoạt động 7/2025 – 9/2026',
            coverType: 'pcvt', c1: '#0d253f', c2: '#061321', gold: '#38bdf8',
            coverTitle: 'CÔNG TY ĐIỆN LỰC VŨNG TÀU', coverOrg: 'HOẠT ĐỘNG GIAI ĐOẠN MỚI', coverSub: '07/2025 – 09/2026' },
          { id: 'doan_the', title: 'Đảng bộ – Công đoàn – Đoàn TN', subtitle: 'Đảng bộ, Công đoàn, Đoàn Thanh niên',
            coverType: 'doan_the', c1: '#1E3A5F', c2: '#0F1D30', gold: '#22D3EE',
            coverTitle: 'ĐẢNG BỘ – CÔNG ĐOÀN – ĐOÀN TN', coverOrg: 'CÔNG TY ĐIỆN LỰC VŨNG TÀU', coverSub: 'ĐOÀN KẾT • SÁNG TẠO • XUNG KÍCH' }
        ]
      }
    ];

    const cabW = 2.2, cabD = 0.9, legH = 1.05, glassH = 0.35;

    cabinetConfigs.forEach((cfg, cabIdx) => {
      const cabGroup = new THREE.Group();
      cabGroup.name = `AlbumCabinet_${cabIdx + 1}`;
      cabGroup.position.set(cfg.pos[0], 0.35, cfg.pos[1]);
      cabGroup.rotation.y = cfg.rotY;

      // --- Legs (4 walnut legs) ---
      const legSize = 0.06;
      const legGeo = new THREE.BoxGeometry(legSize, legH, legSize);
      const legPositions = [
        [-cabW/2 + 0.06, legH/2, -cabD/2 + 0.06],
        [ cabW/2 - 0.06, legH/2, -cabD/2 + 0.06],
        [-cabW/2 + 0.06, legH/2,  cabD/2 - 0.06],
        [ cabW/2 - 0.06, legH/2,  cabD/2 - 0.06]
      ];
      legPositions.forEach(pos => {
        const leg = new THREE.Mesh(legGeo, matWalnut);
        leg.position.set(...pos);
        cabGroup.add(leg);
      });

      // --- Table top / apron ---
      const apronH = 0.10;
      const apronY = legH + apronH / 2;
      const apronGeo = new THREE.BoxGeometry(cabW, apronH, cabD);
      const apronMesh = new THREE.Mesh(apronGeo, matWalnutDark);
      apronMesh.position.y = apronY;
      cabGroup.add(apronMesh);

      // --- Display deck (ivory velvet top) ---
      const deckY = legH + apronH;
      const deckGeo = new THREE.BoxGeometry(cabW - 0.04, 0.03, cabD - 0.04);
      const deckMesh = new THREE.Mesh(deckGeo, this.matVelvetIvory);
      deckMesh.position.y = deckY + 0.015;
      cabGroup.add(deckMesh);

      // --- Glass lid ---
      const glassLidGeo = new THREE.BoxGeometry(cabW - 0.06, glassH, cabD - 0.06);
      const glassLid = new THREE.Mesh(glassLidGeo, this.matGlassShowcase);
      glassLid.position.y = deckY + 0.03 + glassH / 2;
      cabGroup.add(glassLid);

      // Gold rim on top of glass
      const rimThick = 0.02;
      const rimMat = this.matGoldShowcase;
      const rimTopY = deckY + 0.03 + glassH + rimThick / 2;
      const rimF = new THREE.Mesh(new THREE.BoxGeometry(cabW - 0.04, rimThick, rimThick), rimMat);
      rimF.position.set(0, rimTopY, cabD / 2 - 0.03);
      cabGroup.add(rimF);
      const rimB = new THREE.Mesh(new THREE.BoxGeometry(cabW - 0.04, rimThick, rimThick), rimMat);
      rimB.position.set(0, rimTopY, -cabD / 2 + 0.03);
      cabGroup.add(rimB);
      const rimL = new THREE.Mesh(new THREE.BoxGeometry(rimThick, rimThick, cabD - 0.04), rimMat);
      rimL.position.set(-cabW / 2 + 0.03, rimTopY, 0);
      cabGroup.add(rimL);
      const rimR = new THREE.Mesh(new THREE.BoxGeometry(rimThick, rimThick, cabD - 0.04), rimMat);
      rimR.position.set(cabW / 2 - 0.03, rimTopY, 0);
      cabGroup.add(rimR);

      // --- Warm LED interior light ---
      const cabinetGlow = new THREE.PointLight(0xfffaed, 2.0, 4.0);
      cabinetGlow.position.set(0, deckY + glassH + 0.2, 0);
      cabGroup.add(cabinetGlow);

      // --- Brass nameplate (label on front) ---
      const plateTexture = this.createPlacardCanvas(cfg.label);
      const plateMat = new THREE.MeshStandardMaterial({ map: plateTexture, metalness: 0.85, roughness: 0.25 });
      const plateMesh = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 0.08), plateMat);
      plateMesh.position.set(0, apronY, cabD / 2 + 0.005);
      cabGroup.add(plateMesh);

      // --- Two album stands with tilted books ---
      const standTilt = 0.26; // ~15°
      const albumW = 0.54, albumH = 0.065, albumD = 0.40;
      const standW = 0.68, standD = 0.48, standH = 0.06;
      const standGeo = new THREE.BoxGeometry(standW, standH, standD);

      cfg.albums.forEach((albumCfg, aIdx) => {
        const xOff = aIdx === 0 ? -0.52 : 0.52;
        const standGroup = new THREE.Group();
        standGroup.position.set(xOff, deckY + 0.06, 0.02);
        standGroup.rotation.x = standTilt;

        const standMesh = new THREE.Mesh(standGeo, this.matVelvetIvory);
        standGroup.add(standMesh);

        // Album book
        const coverTex = this.createAlbumCoverCanvas(
          albumCfg.coverType, albumCfg.coverTitle, albumCfg.coverOrg, albumCfg.coverSub,
          albumCfg.c1, albumCfg.c2, albumCfg.gold
        );
        const c1Hex = parseInt(albumCfg.c1.replace('#', ''), 16);
        const c2Hex = parseInt(albumCfg.c2.replace('#', ''), 16);
        const goldHex = parseInt(albumCfg.gold.replace('#', ''), 16);
        const albumMat = [
          new THREE.MeshStandardMaterial({ color: c2Hex, roughness: 0.4 }),
          new THREE.MeshStandardMaterial({ color: c2Hex, roughness: 0.4 }),
          new THREE.MeshStandardMaterial({ map: coverTex, roughness: 0.35, metalness: 0.3 }),
          new THREE.MeshStandardMaterial({ color: c2Hex, roughness: 0.5 }),
          new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.8 }),
          new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.8 })
        ];
        const albumGeo = new THREE.BoxGeometry(albumW, albumH, albumD);
        const albumMesh = new THREE.Mesh(albumGeo, albumMat);
        albumMesh.position.set(0, standH / 2 + albumH / 2 + 0.005, 0);
        albumMesh.castShadow = true;
        albumMesh.name = `Album_${albumCfg.id}`;
        albumMesh.userData = {
          isAlbum: true,
          albumId: albumCfg.id,
          cabinetIndex: cabIdx,
          title: albumCfg.title,
          hint: 'Nhấp để mở & lật từng trang'
        };
        standGroup.add(albumMesh);
        this.albumMeshes.push(albumMesh);

        cabGroup.add(standGroup);
      });

      // GĐ4: Two dedicated half-cabinet hit boxes (one for left album, one for right album)
      // Each box covers the entire half of the cabinet (glass, stand, book) for easy, foolproof clicking
      cfg.albums.forEach((albumCfg, aIdx) => {
        const xCenter = aIdx === 0 ? -cabW / 4 : cabW / 4;
        const boxW = cabW / 2 - 0.02; // ~1.08m
        const boxH = glassH + 0.35;    // ~0.70m
        const boxD = cabD + 0.10;      // ~1.00m
        const hitMat = new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false
        });
        const halfBox = new THREE.Mesh(new THREE.BoxGeometry(boxW, boxH, boxD), hitMat);
        halfBox.position.set(xCenter, deckY + boxH / 2, 0);
        halfBox.name = `AlbumHitZone_${albumCfg.id}`;
        halfBox.userData = {
          isAlbum: true,
          albumId: albumCfg.id,
          cabinetIndex: cabIdx,
          title: albumCfg.title,
          hint: 'Nhấp để mở album'
        };
        cabGroup.add(halfBox);
        this.albumMeshes.push(halfBox);
      });

      parent.add(cabGroup);
    });

    // Store cabinet positions for glide calculations
    this.cabinetPositions = cabinetConfigs.map(cfg => ({
      x: cfg.pos[0], z: cfg.pos[1], rotY: cfg.rotY
    }));
  }

  createSideFretwork(parent, xPos, legH) {
    const barMat = this.matGoldShowcase;
    const barSize = 0.024;
    const fretGroup = new THREE.Group();
    fretGroup.position.set(xPos, legH * 0.52, 0);

    // Outer upper & lower horizontal rails
    const hBarTop = new THREE.Mesh(new THREE.BoxGeometry(barSize, barSize, 0.70), barMat);
    hBarTop.position.y = 0.16;
    fretGroup.add(hBarTop);

    const hBarBottom = new THREE.Mesh(new THREE.BoxGeometry(barSize, barSize, 0.70), barMat);
    hBarBottom.position.y = -0.16;
    fretGroup.add(hBarBottom);

    // Geometric square key / fretwork
    const vBar1 = new THREE.Mesh(new THREE.BoxGeometry(barSize, 0.32, barSize), barMat);
    vBar1.position.z = -0.15;
    fretGroup.add(vBar1);

    const vBar2 = new THREE.Mesh(new THREE.BoxGeometry(barSize, 0.32, barSize), barMat);
    vBar2.position.z = 0.15;
    fretGroup.add(vBar2);

    const innerSquare = new THREE.Mesh(new THREE.BoxGeometry(barSize, 0.18, 0.20), barMat);
    fretGroup.add(innerSquare);

    parent.add(fretGroup);
  }

  createFrontFretwork(parent, legH) {
    const barMat = this.matGoldShowcase;
    const barSize = 0.024;
    const frontGroup = new THREE.Group();
    frontGroup.position.set(0, legH * 0.52, 0.36);

    // Upper sub-rail
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(1.92, barSize, barSize), barMat);
    topRail.position.y = 0.16;
    frontGroup.add(topRail);

    // Lower horizontal stretcher
    const midRail = new THREE.Mesh(new THREE.BoxGeometry(1.92, barSize, barSize), barMat);
    midRail.position.y = -0.16;
    frontGroup.add(midRail);

    // Left and Right Greek-key interlocking boxes (matching user reference photo)
    [-0.55, 0.55].forEach(x => {
      const squareKey = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, barSize), barMat);
      squareKey.position.set(x, 0, 0);
      frontGroup.add(squareKey);

      // Hollow cutout effect with gold inner frame
      const hollowCutout = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, barSize + 0.004), this.matPartition);
      hollowCutout.position.set(x, 0, 0);
      frontGroup.add(hollowCutout);
    });

    parent.add(frontGroup);
  }

  createAlbumCoverCanvas(type, title, org, sub, c1, c2, gold) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 768;
    const ctx = canvas.getContext('2d');

    // Leather gradient background
    const grad = ctx.createRadialGradient(512, 384, 80, 512, 384, 600);
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 768);

    // Leather subtle grain noise
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    for (let i = 0; i < 4000; i++) {
      ctx.fillRect(Math.random() * 1024, Math.random() * 768, 2, 2);
    }

    // Outer gold filigree frame
    ctx.strokeStyle = gold;
    ctx.lineWidth = 14;
    ctx.strokeRect(32, 32, 960, 704);

    ctx.lineWidth = 4;
    ctx.strokeRect(52, 52, 920, 664);

    // Corner ornate flourishes
    const drawCorner = (cx, cy, rot) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.strokeStyle = gold;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(60, 0);
      ctx.lineTo(60, 20);
      ctx.lineTo(20, 20);
      ctx.lineTo(20, 60);
      ctx.lineTo(0, 60);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    };
    drawCorner(56, 56, 0);
    drawCorner(968, 56, Math.PI / 2);
    drawCorner(968, 712, Math.PI);
    drawCorner(56, 712, -Math.PI / 2);

    // Central Emblem
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(512, 250, 65, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = c2;
    ctx.beginPath();
    ctx.arc(512, 250, 58, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = gold;
    ctx.font = 'bold 54px "Be Vietnam Pro", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(type === 'souvenir' ? '⚡' : '🎨', 512, 250);

    // Typography
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;

    ctx.fillStyle = gold;
    ctx.font = 'bold 46px "Be Vietnam Pro", sans-serif';
    ctx.fillText(title, 512, 390);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px "Be Vietnam Pro", sans-serif';
    ctx.fillText(org, 512, 460);

    ctx.fillStyle = gold;
    ctx.font = '600 22px "Be Vietnam Pro", sans-serif';
    ctx.fillText(sub, 512, 520);

    ctx.fillStyle = 'rgba(250, 204, 21, 0.75)';
    ctx.font = 'italic 500 18px "Be Vietnam Pro", sans-serif';
    ctx.fillText('• KHÔNG GIAN SỐ HÓA TRUYỀN THỐNG 3D •', 512, 630);

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return texture;
  }

  createPlacardCanvas(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');

    // Brushed brass gradient
    const grad = ctx.createLinearGradient(0, 0, 1024, 0);
    grad.addColorStop(0, '#cca855');
    grad.addColorStop(0.3, '#f5deb3');
    grad.addColorStop(0.7, '#d4af37');
    grad.addColorStop(1, '#b38b2d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 160);

    // Outer border
    ctx.strokeStyle = '#8c6819';
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, 1012, 148);

    // Engraved dark text
    ctx.fillStyle = '#2d1f05';
    ctx.font = 'bold 40px "Be Vietnam Pro", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255, 255, 255, 0.6)';
    ctx.shadowOffsetY = 1;
    ctx.shadowBlur = 1;
    ctx.fillText(text, 512, 80);

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }
  /**
   * HCM Cultural Zone — Khu 4: Không Gian Văn Hóa Hồ Chí Minh
   * A grand south hall with deep red walls honoring President Ho Chi Minh.
   * Layout: Z=40 to Z=82, X=-22 to X=22
   *   - Central portrait wall at entrance (Z~42)
   *   - East corridor: Timeline cuộc đời (65 events)
   *   - West corridor: Ảnh cuộc sống + Ảnh thật
   *   - Central partition with timeline milestone markers
   */
  buildHCMCulturalZone(parent) {
    // Tách hcmArchitecture (tường, sàn, trần, đèn; luôn hiện) và hcmContent (màn hình) theo Mục A.2
    const hcmArch = new THREE.Group();
    hcmArch.name = 'HCM_Architecture';
    this.hcmArchitecture = hcmArch;
    this.hcmGroup = hcmArch; // Tương thích ngược

    const hcmContent = new THREE.Group();
    hcmContent.name = 'HCM_Content';
    this.hcmContent = hcmContent;

    const h = 8.0;

    // Deep crimson red wall material (Truyền thống Hồ Chí Minh)
    this.matHCMWall = new THREE.MeshStandardMaterial({
      color: 0x6b1520,
      roughness: 0.65,
      metalness: 0.05
    });

    // Dark mahogany accent
    this.matHCMAccent = new THREE.MeshStandardMaterial({
      color: 0x2c0e0e,
      roughness: 0.5,
      metalness: 0.1
    });

    // --- FLOOR for HCM Zone — same marble style, matching tile size of main museum ---
    const hcmFloorTex = this.matFloor.map.clone();
    hcmFloorTex.needsUpdate = true;
    hcmFloorTex.repeat.set(4.4, 4.4);
    const hcmFloorMat = new THREE.MeshStandardMaterial({
      map: hcmFloorTex,
      roughness: 0.16,
      metalness: 0.2,
      envMapIntensity: 0.9
    });
    const hcmFloor = new THREE.Mesh(new THREE.PlaneGeometry(44, 44), hcmFloorMat);
    hcmFloor.rotation.x = -Math.PI / 2;
    hcmFloor.position.set(0, 0.01, 60);
    hcmFloor.receiveShadow = true;
    hcmArch.add(hcmFloor);

    // Ceiling for HCM Zone
    const hcmCeil = new THREE.Mesh(new THREE.PlaneGeometry(140, 44), this.matCeiling);
    hcmCeil.position.set(0, 8.5, 60);
    hcmCeil.rotation.x = Math.PI / 2;
    hcmArch.add(hcmCeil);

    // Entrance ceiling beam
    const beamGeo = new THREE.BoxGeometry(44, 1.0, 1.5);
    const beamMesh = new THREE.Mesh(beamGeo, this.matHCMWall);
    beamMesh.position.set(0, 8.0, 38.5);
    hcmArch.add(beamMesh);

    // Gold trim on beam
    const beamTrimGeo = new THREE.BoxGeometry(44.2, 0.12, 1.6);
    const beamTrimMesh = new THREE.Mesh(beamTrimGeo, this.matGold);
    beamTrimMesh.position.set(0, 7.45, 38.5);
    hcmArch.add(beamTrimMesh);

    // --- OUTER WALLS (Kiến trúc không bao giờ bị ẩn, dùng chung với Khu 4 & 6) ---
    // West wall (X = -22, chung với Khu 6)
    hcmArch.add(this.createWallMesh(44, h, 1.2, -22, h/2, 60, Math.PI/2, this.matHCMWall, 'Wall_HCM_West'));
    // East wall (X = 22, chung với Khu 4)
    hcmArch.add(this.createWallMesh(44, h, 1.2, 22, h/2, 60, -Math.PI/2, this.matHCMWall, 'Wall_HCM_East'));
    // Far South wall (Z = 82)
    hcmArch.add(this.createWallMesh(44, h, 1.2, 0, h/2, 82, 0, this.matHCMWall, 'Wall_HCM_South'));

    // --- GRAND PORTRAIT on SOUTH WALL -> HCM_Content ---
    this.buildHCMPortraitWall(hcmContent);

    // --- ENTRANCE ARCHWAY SIGN ---
    this.buildHCMEntranceSign(hcmArch);

    // --- SPOTLIGHTS & WARM LIGHTING ---
    this.buildHCMLighting(hcmArch);

    parent.add(hcmArch);
    parent.add(hcmContent);
  }

  /**
   * Grand portrait of Ho Chi Minh on the entrance feature wall
   */
  /**
   * Grand ceremonial screen of Ho Chi Minh on the south wall
   * Engineered with strict depth offsets and polygonOffset to completely eliminate
   * any Z-fighting, striping, or light-flickering artifacts.
   */
  buildHCMPortraitWall(parent) {
    const portraitGroup = new THREE.Group();
    portraitGroup.name = 'HCM_PortraitWall';

    // 1. Backing panel attached to south wall (South wall surface is at Z = 81.40)
    // Backing panel at Z = 81.34 with depth 0.06 -> front face at Z = 81.31
    const backdropGeo = new THREE.BoxGeometry(13.2, 7.4, 0.06);
    const backdropMat = new THREE.MeshStandardMaterial({
      color: 0x38080d,
      roughness: 0.65,
      metalness: 0.05
    });
    const backdrop = new THREE.Mesh(backdropGeo, backdropMat);
    backdrop.position.set(0, 4.5, 81.34);
    backdrop.rotation.y = Math.PI;
    portraitGroup.add(backdrop);

    // 2. Gilded ornamental outer frame bars (hollow trim surrounding the screen, no solid backing)
    const frameDepth = 0.08;
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(13.2, 0.22, frameDepth), this.matGold);
    topBar.position.set(0, 8.1, 81.25);
    topBar.rotation.y = Math.PI;
    portraitGroup.add(topBar);

    const botBar = new THREE.Mesh(new THREE.BoxGeometry(13.2, 0.22, frameDepth), this.matGold);
    botBar.position.set(0, 0.9, 81.25);
    botBar.rotation.y = Math.PI;
    portraitGroup.add(botBar);

    const leftBar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 7.2, frameDepth), this.matGold);
    leftBar.position.set(-6.5, 4.5, 81.25);
    leftBar.rotation.y = Math.PI;
    portraitGroup.add(leftBar);

    const rightBar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 7.2, frameDepth), this.matGold);
    rightBar.position.set(6.5, 4.5, 81.25);
    rightBar.rotation.y = Math.PI;
    portraitGroup.add(rightBar);

    // Inner gold trim accent
    const innerFrame = new THREE.Mesh(new THREE.BoxGeometry(12.7, 6.9, 0.04), this.matGold);
    innerFrame.position.set(0, 4.5, 81.27);
    innerFrame.rotation.y = Math.PI;
    portraitGroup.add(innerFrame);

    // 3. Ultra-high definition ceremonial canvas screen (2048x1200)
    const portraitCanvas = document.createElement('canvas');
    portraitCanvas.width = 2048;
    portraitCanvas.height = 1200;
    const pctx = portraitCanvas.getContext('2d');

    // Rich ceremonial background gradient
    const bgGrad = pctx.createLinearGradient(0, 0, 0, 1200);
    bgGrad.addColorStop(0, '#5a0d17');
    bgGrad.addColorStop(0.3, '#430910');
    bgGrad.addColorStop(0.7, '#35060c');
    bgGrad.addColorStop(1, '#200307');
    pctx.fillStyle = bgGrad;
    pctx.fillRect(0, 0, 2048, 1200);

    // Subtle radial glow from the star
    const radialGlow = pctx.createRadialGradient(1024, 230, 20, 1024, 230, 600);
    radialGlow.addColorStop(0, 'rgba(234, 179, 8, 0.25)');
    radialGlow.addColorStop(0.6, 'rgba(180, 83, 9, 0.08)');
    radialGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    pctx.fillStyle = radialGlow;
    pctx.fillRect(0, 0, 2048, 1200);

    // Ornate gold border on canvas
    pctx.strokeStyle = '#d4af37';
    pctx.lineWidth = 10;
    pctx.strokeRect(30, 30, 1988, 1140);

    pctx.strokeStyle = 'rgba(212, 175, 55, 0.4)';
    pctx.lineWidth = 3;
    pctx.strokeRect(46, 46, 1956, 1108);

    // Corner decorative rosettes
    const drawCorner = (cx, cy) => {
      pctx.strokeStyle = '#eab308';
      pctx.lineWidth = 4;
      pctx.beginPath();
      pctx.arc(cx, cy, 30, 0, Math.PI * 2);
      pctx.stroke();
      pctx.fillStyle = '#eab308';
      pctx.beginPath();
      pctx.arc(cx, cy, 8, 0, Math.PI * 2);
      pctx.fill();
    };
    drawCorner(80, 80);
    drawCorner(1968, 80);
    drawCorner(80, 1120);
    drawCorner(1968, 1120);

    // Central Flags: Cờ Đảng (trái) và Quốc kỳ (phải) (Mục D)
    const flagW = 300;
    const flagH = 200;
    const flagGap = 40;
    const centerY = 220;

    // Cán cờ vàng cắm chéo nhẹ ±12°
    pctx.save();
    pctx.strokeStyle = '#facc15';
    pctx.lineWidth = 10;
    pctx.lineCap = 'round';
    // Cán cờ trái (+12°)
    pctx.beginPath();
    pctx.moveTo(1024 - flagGap / 2 - flagW - 10, centerY - flagH / 2 - 20);
    pctx.lineTo(1024 - flagGap / 2 + 30, centerY + flagH / 2 + 80);
    pctx.stroke();
    // Cán cờ phải (-12°)
    pctx.beginPath();
    pctx.moveTo(1024 + flagGap / 2 + flagW + 10, centerY - flagH / 2 - 20);
    pctx.lineTo(1024 + flagGap / 2 - 30, centerY + flagH / 2 + 80);
    pctx.stroke();
    pctx.restore();

    // Vị trí cờ Đảng (trái)
    const leftX = 1024 - flagGap / 2 - flagW;
    const leftY = centerY - flagH / 2;
    // Vị trí Quốc kỳ (phải)
    const rightX = 1024 + flagGap / 2;
    const rightY = centerY - flagH / 2;

    // Vẽ khung cờ đỏ chuẩn bị sẵn
    pctx.fillStyle = '#da251d';
    pctx.fillRect(leftX, leftY, flagW, flagH);
    pctx.fillRect(rightX, rightY, flagW, flagH);

    pctx.strokeStyle = '#facc15';
    pctx.lineWidth = 2;
    pctx.strokeRect(leftX, leftY, flagW, flagH);
    pctx.strokeRect(rightX, rightY, flagW, flagH);

    // Vẽ cờ theo đúng tỷ lệ gốc của file (fit trong ô 300x200, không kéo giãn - Mục D.3)
    const drawFlagFitted = (img, x, y, maxW, maxH) => {
      const imgAspect = (img.naturalWidth || img.width) / (img.naturalHeight || img.height);
      const boxAspect = maxW / maxH;
      let drawW, drawH;
      if (imgAspect > boxAspect) {
        drawW = maxW;
        drawH = maxW / imgAspect;
      } else {
        drawH = maxH;
        drawW = maxH * imgAspect;
      }
      const drawX = x + (maxW - drawW) / 2;
      const drawY = y + (maxH - drawH) / 2;
      pctx.drawImage(img, drawX, drawY, drawW, drawH);
    };

    // Load file logo cờ chính thức (Mục D.2: bỏ vẽ dự phòng lộ viền)
    const imgDang = new Image();
    imgDang.onload = () => {
      pctx.fillStyle = '#da251d';
      pctx.fillRect(leftX, leftY, flagW, flagH);
      drawFlagFitted(imgDang, leftX, leftY, flagW, flagH);
      pctx.strokeStyle = '#facc15';
      pctx.lineWidth = 2;
      pctx.strokeRect(leftX, leftY, flagW, flagH);
      portraitTex.needsUpdate = true;
    };
    imgDang.src = 'assets/logo/co_dang.png';

    const imgQuocKy = new Image();
    imgQuocKy.onload = () => {
      pctx.fillStyle = '#da251d';
      pctx.fillRect(rightX, rightY, flagW, flagH);
      drawFlagFitted(imgQuocKy, rightX, rightY, flagW, flagH);
      pctx.strokeStyle = '#facc15';
      pctx.lineWidth = 2;
      pctx.strokeRect(rightX, rightY, flagW, flagH);
      portraitTex.needsUpdate = true;
    };
    imgQuocKy.src = 'assets/logo/co_to_quoc.png';

    // Căn giữa chữ toàn bộ màn hình HCM (Mục D.1)
    pctx.textAlign = 'center';
    pctx.textBaseline = 'middle';

    // Title: KHÔNG GIAN VĂN HÓA
    pctx.fillStyle = '#ffffff';
    pctx.font = 'bold 64px "Be Vietnam Pro", sans-serif';
    pctx.fillText('KHÔNG GIAN VĂN HÓA', 1024, 420);

    // Title: HỒ CHÍ MINH
    pctx.fillStyle = '#facc15';
    pctx.font = 'bold 105px "Be Vietnam Pro", sans-serif';
    pctx.fillText('HỒ CHÍ MINH', 1024, 550);

    // Dates
    pctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    pctx.font = '600 42px "Be Vietnam Pro", sans-serif';
    pctx.fillText('19/05/1890  —  02/09/1969', 1024, 690);

    // Divider with central lotus diamond
    pctx.strokeStyle = '#d4af37';
    pctx.lineWidth = 3;
    pctx.beginPath();
    pctx.moveTo(400, 770);
    pctx.lineTo(960, 770);
    pctx.stroke();

    pctx.beginPath();
    pctx.moveTo(1088, 770);
    pctx.lineTo(1648, 770);
    pctx.stroke();

    pctx.fillStyle = '#facc15';
    pctx.font = 'bold 32px "Be Vietnam Pro", sans-serif';
    pctx.fillText('◆', 1024, 770);

    // Iconic quote
    pctx.fillStyle = '#ffffff';
    pctx.font = 'italic 500 44px "Be Vietnam Pro", sans-serif';
    pctx.fillText('"Không có gì quý hơn Độc lập, Tự do"', 1024, 870);

    // Secondary guidance quote
    pctx.fillStyle = '#fbbf24';
    pctx.font = '500 30px "Be Vietnam Pro", sans-serif';
    pctx.fillText('Học tập và làm theo tư tưởng, đạo đức, phong cách Hồ Chí Minh', 1024, 950);

    // Footer signature (thay sao bằng •)
    pctx.fillStyle = 'rgba(212, 175, 55, 0.85)';
    pctx.font = 'bold 26px "Be Vietnam Pro", sans-serif';
    pctx.fillText('• CÔNG TY ĐIỆN LỰC VŨNG TÀU — PHÒNG TRUYỀN THỐNG SỐ HÓA •', 1024, 1070);

    const portraitTex = new THREE.CanvasTexture(portraitCanvas);
    portraitTex.colorSpace = THREE.SRGBColorSpace;
    portraitTex.generateMipmaps = true;
    portraitTex.minFilter = THREE.LinearMipmapLinearFilter;
    portraitTex.magFilter = THREE.LinearFilter;
    portraitTex.anisotropy = 16;
    portraitTex.needsUpdate = true;

    // Display plane positioned safely at Z = 81.20 facing North (towards -Z)
    // Full 14cm clearance in front of backing panel (Z=81.34) completely prevents any Z-fighting!
    const portraitPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(12.5, 6.7),
      new THREE.MeshStandardMaterial({
        map: portraitTex,
        roughness: 0.35,
        metalness: 0.05,
        emissive: new THREE.Color(0x35060c),
        emissiveIntensity: 0.2,
        polygonOffset: true,
        polygonOffsetFactor: -2.0,
        polygonOffsetUnits: -2.0,
        depthTest: true,
        depthWrite: true
      })
    );
    portraitPlane.position.set(0, 4.5, 81.20);
    portraitPlane.rotation.y = Math.PI;
    portraitPlane.userData = { isHCMScreen: true };
    portraitPlane.name = 'HCM_CentralScreen';
    this.hcmScreenMesh = portraitPlane;
    portraitGroup.add(portraitPlane);

    // Soft gallery spotlights positioned smoothly without casting harsh striped shadows
    const spotL = new THREE.SpotLight(0xfff8ea, 1.8, 16, Math.PI / 5, 0.4);
    spotL.position.set(-4.5, 7.2, 75.0);
    spotL.target.position.set(-1.5, 4.5, 81.2);
    portraitGroup.add(spotL);
    portraitGroup.add(spotL.target);

    const spotR = new THREE.SpotLight(0xfff8ea, 1.8, 16, Math.PI / 5, 0.4);
    spotR.position.set(4.5, 7.2, 75.0);
    spotR.target.position.set(1.5, 4.5, 81.2);
    portraitGroup.add(spotR);
    portraitGroup.add(spotR.target);

    parent.add(portraitGroup);
  }

  buildHCMEntranceSign(parent) {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Dark background
    ctx.fillStyle = '#1a0505';
    ctx.fillRect(0, 0, 2048, 512);

    // Gold border
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 12;
    ctx.strokeRect(16, 16, 2016, 480);

    // Inner border
    ctx.strokeStyle = 'rgba(212,175,55,0.4)';
    ctx.lineWidth = 3;
    ctx.strokeRect(30, 30, 1988, 452);

    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 60px "Be Vietnam Pro", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '0.06em';
    ctx.fillText('KHÔNG GIAN VĂN HÓA HỒ CHÍ MINH', 1024, 195);

    // Subtitle
    ctx.fillStyle = '#fde047';
    ctx.font = '500 32px "Be Vietnam Pro", sans-serif';
    ctx.fillText('Học tập và làm theo tư tưởng, đạo đức, phong cách Hồ Chí Minh', 1024, 335);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer?.capabilities?.getMaxAnisotropy?.() || 16;
    const signGeo = new THREE.PlaneGeometry(8, 2);
    const signMat = new THREE.MeshStandardMaterial({
      map: tex,
      emissive: new THREE.Color(0x8b0000),
      emissiveIntensity: 0.2,
      roughness: 0.3
    });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, 6.5, 38.5);
    sign.rotation.y = Math.PI;
    sign.name = 'SignBanner_HCM';
    sign.userData = {
      isTextPlane: true,
      planeW: 8,
      planeH: 2,
      canvasW: 2048,
      canvasH: 512
    };

    // Frame
    const signFrame = new THREE.Mesh(new THREE.BoxGeometry(8.2, 2.2, 0.15), this.matGold);
    signFrame.position.set(0, 6.5, 38.6);
    signFrame.rotation.y = Math.PI;

    parent.add(signFrame);
    parent.add(sign);
    this.signBanners.push({ title: 'KHÔNG GIAN VĂN HÓA HỒ CHÍ MINH', frameMesh: signFrame, mesh: sign, x: 0, y: 6.5, z: 38.5, rotY: Math.PI });
  }

  /**
   * Period milestone plaques for HCM zone
   * Now on the south wall (Z=81.15) flanking the portrait, facing north
   */
  buildHCMPeriodPlaques(parent) {
    const periods = [
      { badge: '1890-1910', title: 'TUỔI THƠ & GIÁO DỤC', color: '#16a34a', x: -18 },
      { badge: '1911-1930', title: 'TÌM ĐƯỜNG CỨU NƯỚC', color: '#2563eb', x: -12 },
      { badge: '1930-1945', title: 'LÃNH ĐẠO CÁCH MẠNG', color: '#dc2626', x: 12 },
      { badge: '1945-1969', title: 'CHỦ TỊCH NƯỚC VNDCCH', color: '#eab308', x: 18 },
    ];

    periods.forEach(p => {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');

      // Dark background
      ctx.fillStyle = '#0a0f1d';
      ctx.fillRect(0, 0, 1024, 512);

      // Colored left accent bar
      ctx.fillStyle = p.color;
      ctx.fillRect(0, 0, 20, 512);

      // Badge
      ctx.fillStyle = p.color;
      ctx.font = 'bold 70px "Be Vietnam Pro", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.badge, 512, 180);

      // Title
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 48px "Be Vietnam Pro", sans-serif';
      ctx.fillText(p.title, 512, 340);

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const geo = new THREE.PlaneGeometry(3.2, 1.4);

      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        map: tex,
        emissive: new THREE.Color(p.color),
        emissiveIntensity: 0.15,
        roughness: 0.35,
        polygonOffset: true,
        polygonOffsetFactor: -1.0,
        polygonOffsetUnits: -1.0,
        depthTest: true,
        depthWrite: true
      }));
      mesh.position.set(p.x, 6.2, 81.24);
      mesh.rotation.y = Math.PI;
      parent.add(mesh);
    });
  }

  buildHCMLighting(parent) {
    // Warm ambient for HCM zone
    const ambientHCM = new THREE.PointLight(0xfff0d4, 2.0, 50);
    ambientHCM.position.set(0, 7.5, 60);
    parent.add(ambientHCM);

    // Track lights — reduced from 10 to 5 with wider reach for performance
    const trackPositions = [
      { x: -12, z: 52 }, { x: -12, z: 68 },
      { x: 12, z: 52 }, { x: 12, z: 68 },
      { x: 0, z: 75 }
    ];

    trackPositions.forEach(pos => {
      const light = new THREE.PointLight(0xfff5e0, 1.8, 18);
      light.position.set(pos.x, 7.0, pos.z);
      parent.add(light);

      // Visible light fixture (small gold cylinder)
      const fixtureGeo = new THREE.CylinderGeometry(0.15, 0.2, 0.1, 8);
      const fixture = new THREE.Mesh(fixtureGeo, this.matGold);
      fixture.position.set(pos.x, 8.3, pos.z);
      parent.add(fixture);
    });

    // Entrance warm glow
    const entranceLight = new THREE.PointLight(0xffe0b2, 2.5, 15);
    entranceLight.position.set(0, 7.0, 42);
    parent.add(entranceLight);
  }

  /**
   * GĐ5: Khu 3 Smart Grid Pavilion Architecture
   * - Epoxy dark floor (#0A1224) with animated glowing cyan energy streams
   * - 3 Sleek glass information totems at entrance (x = 22)
   * - Linear recessed ceiling light tracks
   */
  buildZone3SmartGrid(parent) {
    // Tách k3Architecture (ngưỡng sàn, trần, đèn; luôn hiện) và k3Content (trụ thông tin, vạch dẫn đường) theo Mục A.2
    const k3Arch = new THREE.Group();
    k3Arch.name = 'Zone3_SmartGrid_Architecture';
    this.k3Architecture = k3Arch;

    const k3Content = new THREE.Group();
    k3Content.name = 'Zone3_SmartGrid_Content';
    this.k3Content = k3Content;
    this.k3SmartGridGroup = k3Content; // Tương thích ngược

    // 1. Dải viền kim loại xanh EVN #1E40A0 rộng 8cm chạy ngang sàn tại ranh giới x = 18 làm ngưỡng vào khu (Mục F.2)
    // Sàn Khu 3 dùng chung WalkableFloor đá navy kẻ ô vàng với toàn phòng (Mục F.1: bỏ sàn riêng DCE3EC)
    const thresholdGeo = new THREE.BoxGeometry(0.08, 0.006, 25.0);
    const thresholdMat = new THREE.MeshStandardMaterial({
      color: 0x1e40a0,
      roughness: 0.25,
      metalness: 0.85
    });
    const thresholdMesh = new THREE.Mesh(thresholdGeo, thresholdMat);
    thresholdMesh.position.set(18.0, 0.003, 0.0);
    thresholdMesh.receiveShadow = true;
    k3Arch.add(thresholdMesh);

    // 2. Vạch dẫn đường màu #38BDF8, độ trong 0.35, rộng 4cm, decal cao hơn sàn 3mm (Mục F.2)
    // Vạch chạy từ ngưỡng vào sa bàn rồi tới vách mốc son (x: 18 -> 44)
    const decalMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.35,
      depthWrite: false
    });

    [-6.5, 6.5].forEach(pz => {
      const decalGeo = new THREE.PlaneGeometry(26.0, 0.04);
      const decalMesh = new THREE.Mesh(decalGeo, decalMat);
      decalMesh.rotation.x = -Math.PI / 2;
      decalMesh.position.set(31.0, 0.003, pz);
      k3Content.add(decalMesh);
    });

    // 3. Bốn trụ thông tin đối xứng qua trục Khu 3 (x=21.5, z=-9.5, -7.0, +7.0, +9.5) (Mục E)
    const totemsData = [
      {
        z: -9.5,
        title: 'TRUNG TÂM ĐIỀU KHIỂN',
        slogan: 'Vận hành hệ thống điện thông minh, tin cậy và an toàn',
        sub: 'SCADA / DMS CONTROL CENTER'
      },
      {
        z: -7.0,
        title: 'TỰ ĐỘNG HÓA LƯỚI ĐIỆN',
        slogan: 'Hiện đại hóa và tự động hóa hệ thống điện phân phối',
        sub: 'SMART GRID AUTOMATION'
      },
      {
        z: 7.0,
        title: 'DỊCH VỤ KHÁCH HÀNG SỐ',
        slogan: 'Chuyển đổi số toàn diện, nâng cao trải nghiệm khách hàng',
        sub: 'DIGITAL CUSTOMER SERVICES'
      },
      {
        z: 9.5,
        title: 'CHUYỂN ĐỔI SỐ',
        slogan: 'Phát triển doanh nghiệp số, tối ưu hóa quy trình nghiệp vụ',
        sub: 'DIGITAL TRANSFORMATION'
      }
    ];

    totemsData.forEach(td => {
      const totem = this.createInformationTotem(td);
      totem.position.set(21.5, 0, td.z);
      k3Content.add(totem);
    });

    // 4. Phào trần vạch mảnh 3cm màu #38BDF8, emissiveIntensity 0.4
    const ceilingZList = [-12.0, 0.0, 12.0];
    const trackMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: new THREE.Color(0x38bdf8),
      emissiveIntensity: 0.4,
      roughness: 0.3
    });
    ceilingZList.forEach(cz => {
      const trackGeo = new THREE.BoxGeometry(26.0, 0.1, 0.25);
      const trackMesh = new THREE.Mesh(trackGeo, trackMat);
      trackMesh.position.set(34.0, 8.45, cz);
      k3Arch.add(trackMesh);
    });

    parent.add(k3Arch);
    parent.add(k3Content);
  }

  createInformationTotem({ title, slogan, sub }) {
    const group = new THREE.Group();
    const w = 1.1;
    const h = 2.4;
    const d = 0.16;

    // Chân đế kim loại màu xanh EVN
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1e40a0,
      roughness: 0.3,
      metalness: 0.5
    });
    const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(w + 0.15, 0.12, d + 0.2), baseMat);
    baseMesh.position.y = 0.06;
    group.add(baseMesh);

    // Viền xanh cyan mảnh quanh đế
    const baseLed = new THREE.Mesh(new THREE.BoxGeometry(w + 0.18, 0.03, d + 0.22), this.matCorniceKhu3);
    baseLed.position.y = 0.015;
    group.add(baseLed);

    // Thân trụ nền trắng (Mục A.22)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0.10
    });
    const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
    bodyMesh.position.y = h / 2 + 0.12;
    group.add(bodyMesh);

    // Hai dải viền xanh EVN dọc 2 cạnh bên
    const sideLedGeo = new THREE.BoxGeometry(0.025, h, d + 0.01);
    const leftLed = new THREE.Mesh(sideLedGeo, this.matBaseboardKhu3);
    leftLed.position.set(-w / 2, h / 2 + 0.12, 0);
    group.add(leftLed);

    const rightLed = new THREE.Mesh(sideLedGeo, this.matBaseboardKhu3);
    rightLed.position.set(w / 2, h / 2 + 0.12, 0);
    group.add(rightLed);

    // Canvas hiển thị thông tin nền trắng, viền xanh EVN (tỷ lệ 1:1 với tấm phẳng w-0.04 x h-0.1 = 1.06 x 2.30)
    const totemPlaneW = w - 0.04;
    const totemPlaneH = h - 0.1;
    const cW = 800;
    const cH = Math.round(cW * (totemPlaneH / totemPlaneW)); // ≈ 1736
    const c = document.createElement('canvas');
    c.width = cW;
    c.height = cH;
    const ctx = c.getContext('2d');

    const renderContent = (logoImg = null) => {
      // Nền trắng tinh khiết
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cW, cH);

      // Khung viền xanh EVN
      ctx.strokeStyle = '#1e40a0';
      ctx.lineWidth = 6;
      ctx.strokeRect(24, 24, cW - 48, cH - 48);

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 2;
      ctx.strokeRect(36, 36, cW - 72, cH - 72);

      // Header EVNHCMC
      ctx.fillStyle = '#1e40a0';
      ctx.font = '700 28px "Be Vietnam Pro", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('EVNHCMC • PC VŨNG TÀU', cW / 2, 160);

      ctx.fillStyle = '#64748b';
      ctx.font = '500 20px "Be Vietnam Pro", sans-serif';
      ctx.letterSpacing = '2px';
      ctx.fillText(sub, cW / 2, 205);

      // Đường kẻ phân cách
      ctx.strokeStyle = '#1e40a0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(100, 250);
      ctx.lineTo(cW - 100, 250);
      ctx.stroke();

      // Logo EVNHCMC ở phần đầu trụ (rộng khoảng 0.35m, giữ đúng tỷ lệ gốc, nền trắng) (Mục E.3)
      const logoW = 255;
      const logoH = 200;
      const logoX = cW / 2 - logoW / 2;
      const logoY = 360;

      // Nền trắng tinh khiết cho logo
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(logoX - 10, logoY - 10, logoW + 20, logoH + 20);

      if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
        ctx.drawImage(logoImg, logoX, logoY, logoW, logoH);
      }

      // Tiêu đề trụ
      ctx.fillStyle = '#1e40a0';
      ctx.font = '900 46px "Be Vietnam Pro", sans-serif';
      ctx.fillText(title, cW / 2, 800);

      // Khẩu hiệu chính thức
      ctx.fillStyle = '#0f172a';
      ctx.font = '500 30px "Be Vietnam Pro", sans-serif';
      const words = slogan.split(' ');
      let line = '';
      let y = 920;
      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > 640 && n > 0) {
          ctx.fillText(line.trim(), cW / 2, y);
          line = words[n] + ' ';
          y += 55;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line.trim(), cW / 2, y);

      // Footer
      ctx.fillStyle = '#475569';
      ctx.font = '600 22px "Be Vietnam Pro", sans-serif';
      ctx.fillText('CHUYỂN ĐỔI SỐ • LƯỚI ĐIỆN THÔNG MINH', cW / 2, cH - 120);

      faceTex.needsUpdate = true;
    };

    const faceTex = new THREE.CanvasTexture(c);
    faceTex.colorSpace = THREE.SRGBColorSpace;
    faceTex.anisotropy = this.renderer?.capabilities?.getMaxAnisotropy?.() || 16;
    const faceMat = new THREE.MeshBasicMaterial({ map: faceTex });

    if (!this._totemLogoImg) {
      this._totemLogoImg = new Image();
      this._totemLogoImg.src = 'assets/logo.png';
    }
    if (this._totemLogoImg.complete && this._totemLogoImg.naturalWidth > 0) {
      renderContent(this._totemLogoImg);
    } else {
      renderContent(null);
      this._totemLogoImg.addEventListener('load', () => renderContent(this._totemLogoImg));
    }

    // Mặt trước (hướng Tây: rotY = -Math.PI / 2)
    const facePlaneGeo = new THREE.PlaneGeometry(totemPlaneW, totemPlaneH);
    const frontMesh = new THREE.Mesh(facePlaneGeo, faceMat);
    frontMesh.position.set(0, h / 2 + 0.12, d / 2 + 0.002);
    frontMesh.name = `Totem_Front_${title}`;
    frontMesh.userData = {
      isTextPlane: true,
      planeW: totemPlaneW,
      planeH: totemPlaneH,
      canvasW: cW,
      canvasH: cH
    };
    group.add(frontMesh);

    // Mặt sau
    const backMesh = new THREE.Mesh(facePlaneGeo, faceMat);
    backMesh.position.set(0, h / 2 + 0.12, -d / 2 - 0.002);
    backMesh.rotation.y = Math.PI;
    backMesh.name = `Totem_Back_${title}`;
    backMesh.userData = {
      isTextPlane: true,
      planeW: totemPlaneW,
      planeH: totemPlaneH,
      canvasW: cW,
      canvasH: cH
    };
    group.add(backMesh);

    // Hướng mặt chính về phía lối vào (hướng Tây nhìn sang Đông, hoặc quay mặt nhìn sang Tây)
    group.rotation.y = -Math.PI / 2;
    return group;
  }

  animate(delta, time) {
    if (this.smartGridFloorTexture) {
      this.smartGridFloorTexture.offset.x -= delta * 0.08;
    }
  }

  // ===========================================================================
  // 13. MÀN HÌNH LED LỚN VÀ CỜ ĐỨNG KHU 4 & KHU 6 (MỤC C)
  // ===========================================================================
  buildZone4And6Screens(parent) {
    const screensGroup = new THREE.Group();
    screensGroup.name = 'Zone4And6_Screens_Group';
    this.screensGroup = screensGroup;

    const screenW = 9.0;
    const screenH = 5.06;
    const screenY = 3.0;
    const screenZ = 81.3;

    const bezelMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.3,
      metalness: 0.85
    });

    const standMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.4,
      metalness: 0.8
    });

    // Helper dựng 1 cụm màn hình LED
    const buildScreenUnit = (zoneId, posX, headerTitle, headerSubtitle) => {
      const unit = new THREE.Group();
      unit.position.set(posX, 0, screenZ);

      // 1. Bệ đỡ bên dưới
      const standH = screenY - screenH / 2; // 0.47m
      const standGeo = new THREE.BoxGeometry(screenW + 0.4, standH, 0.45);
      const standMesh = new THREE.Mesh(standGeo, standMat);
      standMesh.position.y = standH / 2;
      unit.add(standMesh);

      // 2. Viền kim loại 0.12m
      const bezelGeo = new THREE.BoxGeometry(screenW + 0.24, screenH + 0.24, 0.12);
      const bezelMesh = new THREE.Mesh(bezelGeo, bezelMat);
      bezelMesh.position.y = screenY;
      unit.add(bezelMesh);

      // 3. Canvas hiển thị (2048 x 1152)
      const canvas = document.createElement('canvas');
      canvas.width = 2048;
      canvas.height = 1152;
      const ctx = canvas.getContext('2d');

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.anisotropy = this.renderer?.capabilities?.getMaxAnisotropy?.() || 16;

      const screenMat = new THREE.MeshBasicMaterial({
        map: tex,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      });
      // 16:9 chính xác: screenW = 9.0 -> screenH = 5.0625
      const exactScreenH = screenW * (1152 / 2048);
      const screenGeo = new THREE.PlaneGeometry(screenW, exactScreenH);
      const screenMesh = new THREE.Mesh(screenGeo, screenMat);
      // Đặt ở z = mặt trước viền (-0.06) - 0.03 = -0.09 (Mục C.1)
      screenMesh.position.set(0, screenY, -0.09);
      screenMesh.rotation.y = Math.PI;
      screenMesh.name = `LED_Screen_${zoneId}`;
      screenMesh.userData = {
        isTextPlane: true,
        isZoneScreen: true,
        zone: zoneId,
        planeW: screenW,
        planeH: exactScreenH,
        canvasW: 2048,
        canvasH: 1152
      };
      unit.add(screenMesh);

      return { unit, canvas, ctx, tex, screenMesh };
    };

    // Dựng màn hình Khu 4 tại (36, 3.0, 81.3)
    this.screenKhu4 = buildScreenUnit('khu4', 36.0, 'ĐẢNG BỘ CÔNG TY ĐIỆN LỰC VŨNG TÀU', 'VỮNG BƯỚC DƯỚI CỜ ĐẢNG QUANG VINH');
    screensGroup.add(this.screenKhu4.unit);
    this.screenKhu4Mesh = this.screenKhu4.screenMesh;
    this.screenKhu4Canvas = this.screenKhu4.canvas;
    this.screenKhu4Tex = this.screenKhu4.tex;

    // Dựng màn hình Khu 6 tại (-36, 3.0, 81.3)
    this.screenKhu6 = buildScreenUnit('khu6', -36.0, 'CÔNG ĐOÀN – ĐOÀN THANH NIÊN', 'CÔNG TY ĐIỆN LỰC VŨNG TÀU');
    screensGroup.add(this.screenKhu6.unit);
    this.screenKhu6Mesh = this.screenKhu6.screenMesh;
    this.screenKhu6Canvas = this.screenKhu6.canvas;
    this.screenKhu6Tex = this.screenKhu6.tex;

    // Helper tạo cờ đứng cao 3m
    const goldPoleMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.25,
      metalness: 0.85
    });

    const createFlagStandTexture = (bgColor, logoPath, titleText) => {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 1024;
      const ctx = c.getContext('2d');

      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, 512, 1024);

      // Viền vàng trang trí cờ
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 8;
      ctx.strokeRect(12, 12, 488, 1000);

      // Tua rua vàng đáy cờ
      ctx.fillStyle = '#fde047';
      for (let tx = 16; tx < 496; tx += 20) {
        ctx.fillRect(tx, 990, 12, 22);
      }

      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 106, 260, 300, 300);
        tex.needsUpdate = true;
      };
      img.src = logoPath;

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };

    const flagDangTex = createFlagStandTexture('#b91c1c', 'assets/logo/co_dang.png', 'CỜ ĐẢNG');
    const flagQuocKyTex = createFlagStandTexture('#da251d', 'assets/logo/co_to_quoc.png', 'QUỐC KỲ');
    const flagCongDoanTex = createFlagStandTexture('#004b93', 'assets/logo/logo_cong_doan.png', 'CÔNG ĐOÀN');
    const flagDoanTnTex = createFlagStandTexture('#0284c7', 'assets/logo/logo_doan_tn.png', 'ĐOÀN TN');

    const buildStandingFlag = (x, z, flagTexture, inwardDir = 1) => {
      const flagGroup = new THREE.Group();
      flagGroup.position.set(x, 0, z);

      // Chân đế cột cờ
      const baseMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.08, 16), goldPoleMat);
      baseMesh.position.y = 0.04;
      flagGroup.add(baseMesh);

      // Cột cờ đứng cao 3m
      const poleMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 3.0, 16), goldPoleMat);
      poleMesh.position.y = 1.5;
      flagGroup.add(poleMesh);

      // Đỉnh búp sen / mũi giáo vàng
      const finial = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 16), goldPoleMat);
      finial.position.y = 3.06;
      flagGroup.add(finial);

      // Tay treo cờ ngang (hướng vào phía màn hình)
      const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.1, 16), goldPoleMat);
      crossbar.rotation.z = Math.PI / 2;
      crossbar.position.set(0.48 * inwardDir, 2.9, 0);
      flagGroup.add(crossbar);

      // Lá cờ treo đứng (1.0m x 2.2m)
      const bannerGeo = new THREE.PlaneGeometry(1.0, 2.2);
      const bannerMat = new THREE.MeshStandardMaterial({
        map: flagTexture,
        roughness: 0.6,
        metalness: 0.05,
        side: THREE.DoubleSide
      });
      const bannerMesh = new THREE.Mesh(bannerGeo, bannerMat);
      bannerMesh.position.set(0.48 * inwardDir, 1.8, -0.01);
      bannerMesh.rotation.y = Math.PI;
      flagGroup.add(bannerMesh);

      return flagGroup;
    };

    // Khu 4: cờ Đảng bên trái (viewer left = x: 42.6, mép cờ 41.62 cách màn hình 1.0m), cờ Quốc kỳ bên phải (viewer right = x: 29.4, mép cờ 30.38 cách màn hình 1.0m) (Mục C.3)
    screensGroup.add(buildStandingFlag(42.6, screenZ - 0.25, flagDangTex, -1));
    screensGroup.add(buildStandingFlag(29.4, screenZ - 0.25, flagQuocKyTex, 1));

    // Khu 6: cờ Công đoàn bên trái (viewer left = x: -29.4), cờ Đoàn bên phải (viewer right = x: -42.6) (Mục C.3)
    screensGroup.add(buildStandingFlag(-29.4, screenZ - 0.25, flagCongDoanTex, -1));
    screensGroup.add(buildStandingFlag(-42.6, screenZ - 0.25, flagDoanTnTex, 1));

    parent.add(screensGroup);
  }

}
