import * as THREE from 'three';

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
  }

  buildMuseum() {
    const museumGroup = new THREE.Group();
    museumGroup.name = 'MuseumArchitecture';

    // 1. Floor & Ceiling
    this.buildFloorsAndCeilings(museumGroup);

    // 2. Main Outer Structural Walls
    this.buildOuterWalls(museumGroup);

    // 3. Exhibition Partition Walls (Vách Trưng Bày Nghệ Thuật)
    this.buildPartitionWalls(museumGroup);

    // 4. Central Rotunda & PCVT Seal
    this.buildCentralRotunda(museumGroup);

    // 5. Hallway Portals & Signage
    this.buildSignage(museumGroup);

    // 5b. Historical Timeline Milestone Plaques on Walls
    this.buildTimelineMilestonePlaques(museumGroup);

    // 6. Decorative Potted Plants in Corners
    this.buildPottedPlants(museumGroup);

    // 7. Architectural Ceiling Light Fixtures
    this.buildCeilingLightFixtures(museumGroup);

    // 8. Luxury Showcase Vitrine for Historical Albums (Matching Reference Photo)
    this.buildLuxuryShowcaseVitrine(museumGroup);

    // 9. Grand Lighting
    this.setupLighting(museumGroup);

    // 10. Interactive Floor Target Marker for Artsteps Navigation
    this.buildFloorMarker(museumGroup);

    // 11. Ho Chi Minh Cultural Zone (Khu 4: Không Gian Văn Hóa Hồ Chí Minh)
    this.buildHCMCulturalZone(museumGroup);

    this.scene.add(museumGroup);
    return museumGroup;
  }

  buildFloorsAndCeilings(parent) {
    // Main Floor
    const floorGeo = new THREE.PlaneGeometry(140, 140);
    this.floorMesh = new THREE.Mesh(floorGeo, this.matFloor);
    this.floorMesh.rotation.x = -Math.PI / 2;
    this.floorMesh.receiveShadow = true;
    this.floorMesh.name = 'WalkableFloor';
    this.floorMesh.userData = { isFloor: true };
    parent.add(this.floorMesh);

    // Ceiling — clipped to not extend into HCM zone (HCM has its own ceiling)
    // Main museum spans X=-70..70, Z=-70..38 (stop before HCM entrance)
    const ceilGeo = new THREE.PlaneGeometry(140, 108);
    const ceilMesh = new THREE.Mesh(ceilGeo, this.matCeiling);
    ceilMesh.position.set(0, 8.5, -16);
    ceilMesh.rotation.x = Math.PI / 2;
    parent.add(ceilMesh);
  }

  createWallMesh(w, h, d, x, y, z, rotY = 0, mat = this.matWall, name = '') {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotY;

    // Base wall
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    // Gold baseboard
    const baseboardGeo = new THREE.BoxGeometry(w, 0.35, d + 0.08);
    const baseboardMesh = new THREE.Mesh(baseboardGeo, this.matGold);
    baseboardMesh.position.y = -h / 2 + 0.175;
    group.add(baseboardMesh);

    // Gold top cornice
    const corniceGeo = new THREE.BoxGeometry(w, 0.25, d + 0.08);
    const corniceMesh = new THREE.Mesh(corniceGeo, this.matGold);
    corniceMesh.position.y = h / 2 - 0.125;
    group.add(corniceMesh);

    group.name = name;
    return group;
  }

  buildOuterWalls(parent) {
    const h = 8.0;

    // --- NORTH HALL (Khu 1: Nhà Nước & EVN) ---
    // Back Wall (Tường Danh Dự Huân Chương Lao Động)
    parent.add(this.createWallMesh(36, h, 1.2, 0, h / 2, -45, 0, this.matWall, 'Wall_North_Back'));
    // North West Wall
    parent.add(this.createWallMesh(32, h, 1.2, -18, h / 2, -29, Math.PI / 2, this.matWall, 'Wall_North_West'));
    // North East Wall
    parent.add(this.createWallMesh(32, h, 1.2, 18, h / 2, -29, Math.PI / 2, this.matWall, 'Wall_North_East'));

    // --- WEST HALL (Khu 2: Tỉnh Bà Rịa - Vũng Tàu) ---
    // West Far Wall (Tường chính dài 50m)
    parent.add(this.createWallMesh(52, h, 1.2, -50, h / 2, 0, Math.PI / 2, this.matWall, 'Wall_West_Far'));
    // West North Wall
    parent.add(this.createWallMesh(32, h, 1.2, -34, h / 2, -25, 0, this.matWall, 'Wall_West_North'));
    // West South Wall
    parent.add(this.createWallMesh(32, h, 1.2, -34, h / 2, 25, 0, this.matWall, 'Wall_West_South'));

    // --- EAST HALL (Khu 3: Công Đoàn & Phong Trào) ---
    // East Far Wall (Tường chính dài 50m)
    parent.add(this.createWallMesh(52, h, 1.2, 50, h / 2, 0, -Math.PI / 2, this.matWall, 'Wall_East_Far'));
    // East North Wall
    parent.add(this.createWallMesh(32, h, 1.2, 34, h / 2, -25, 0, this.matWall, 'Wall_East_North'));
    // East South Wall
    parent.add(this.createWallMesh(32, h, 1.2, 34, h / 2, 25, 0, this.matWall, 'Wall_East_South'));

    // --- SOUTH ENTRANCE — walls removed to open clean view into HCM Zone ---
    // (Wall_South_Left and Wall_South_Right removed per user request)
  }

  /**
   * Artsteps-style Freestanding Museum Partition Walls
   * Provides ample exhibition surfaces for all 205 items
   */
  buildPartitionWalls(parent) {
    const h = 5.2; // Gallery partition height (elegant museum proportion)

    // 1. Hall 1 Center Island Partition (X=0, Z=-31, Length 16m, oriented along Z)
    parent.add(this.createWallMesh(16, h, 0.8, 0, h / 2, -31, Math.PI / 2, this.matPartition, 'Partition_Hall1_Center'));

    // 2. Hall 2 Gallery Partition (X=-35, Z=0, Length 24m, oriented along Z)
    parent.add(this.createWallMesh(24, h, 0.8, -35, h / 2, 0, Math.PI / 2, this.matPartition, 'Partition_Hall2_Center'));

    // 3. Hall 3 Gallery Partition (X=35, Z=0, Length 22m, oriented along Z)
    parent.add(this.createWallMesh(22, h, 0.8, 35, h / 2, 0, Math.PI / 2, this.matPartition, 'Partition_Hall3_Center'));
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

      // Dark navy background disc
      sctx.fillStyle = '#080d1a';
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

      sctx.strokeStyle = '#0284c7';
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
        // 1. Measure each character's width
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

      // Top outer arc: TỔNG CÔNG TY ĐIỆN LỰC THÀNH PHỐ HỒ CHÍ MINH
      sctx.fillStyle = '#facc15';
      sctx.font = 'bold 24px "Playfair Display", "Inter", serif';
      sctx.textAlign = 'center';
      sctx.textBaseline = 'middle';
      drawArcText('TỔNG CÔNG TY ĐIỆN LỰC THÀNH PHỐ HỒ CHÍ MINH', 395, 0, 5, true);

      // Top inner arc: CÔNG TY ĐIỆN LỰC VŨNG TÀU
      sctx.fillStyle = '#ffffff';
      sctx.font = 'bold 23px "Inter", sans-serif';
      drawArcText('CÔNG TY ĐIỆN LỰC VŨNG TÀU', 338, 0, 6, true);

      // Bottom arc: 1985 - 2025 • 40 NĂM PHÁT TRIỂN
      sctx.fillStyle = '#facc15';
      sctx.font = 'bold 24px "Playfair Display", "Inter", serif';
      drawArcText('1985 - 2025 • 40 NĂM PHÁT TRIỂN', 368, Math.PI, 6, false);

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

  buildSignage(parent) {
    const createSignBanner = (title, subtitle, color, x, y, z, rotY = 0) => {
      const canvas = document.createElement('canvas');
      canvas.width = 2048;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');

      // Background plate
      ctx.fillStyle = '#0a0f1d';
      ctx.fillRect(0, 0, 2048, 512);

      // Gold border
      ctx.strokeStyle = color;
      ctx.lineWidth = 14;
      ctx.strokeRect(20, 20, 2008, 472);

      // Inner subtle gold border
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.35)';
      ctx.lineWidth = 4;
      ctx.strokeRect(36, 36, 1976, 440);

      // Max allowable width for text to guarantee NO horizontal overflow
      const maxTextWidth = 1860;

      // Dynamic Auto-fit for Title Font Size
      let titleSize = 70;
      ctx.font = `bold ${titleSize}px "Playfair Display", "Inter", serif`;
      while (ctx.measureText(title).width > maxTextWidth && titleSize > 24) {
        titleSize -= 2;
        ctx.font = `bold ${titleSize}px "Playfair Display", "Inter", serif`;
      }
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(title, 1024, 195);

      // Dynamic Auto-fit for Subtitle Font Size
      let subSize = 36;
      ctx.font = `bold ${subSize}px "Inter", sans-serif`;
      while (ctx.measureText(subtitle).width > maxTextWidth && subSize > 18) {
        subSize -= 2;
        ctx.font = `bold ${subSize}px "Inter", sans-serif`;
      }
      ctx.fillStyle = color;
      ctx.fillText(subtitle, 1024, 335);

      const texture = new THREE.CanvasTexture(canvas);
      const geo = new THREE.PlaneGeometry(8.0, 2.0);
      const mat = new THREE.MeshStandardMaterial({
        map: texture,
        emissive: new THREE.Color(color),
        emissiveIntensity: 0.25,
        roughness: 0.3
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.rotation.y = rotY;

      const frameMesh = new THREE.Mesh(new THREE.BoxGeometry(8.2, 2.2, 0.15), this.matGold);
      frameMesh.position.set(x, y, z - 0.08 * Math.cos(rotY));
      frameMesh.rotation.y = rotY;

      parent.add(frameMesh);
      parent.add(mesh);
    };

    // Entrance Sign - Removed: was blocking HCM zone entrance view
    // (Previously: createSignBanner at Z=37.0, Math.PI)
    // Hall 1 Sign (Properly auto-fitted to avoid clipping!)
    createSignBanner('KHU VỰC 1: VINH DANH NHÀ NƯỚC & EVN - EVNHCMC', 'HUÂN CHƯƠNG LAO ĐỘNG • THỦ TƯỚNG • BỘ CÔNG THƯƠNG • EVN • EVNHCMC', '#eab308', 0, 6.5, -17.0, 0);
    // Hall 2 Sign
    createSignBanner('KHU VỰC 2: TỈNH BÀ RỊA - VŨNG TÀU', 'UBND TỈNH • TP. VŨNG TÀU • ĐẢNG BỘ • BHXH • BCH QUÂN SỰ', '#16a34a', -18.0, 6.5, 0, Math.PI / 2);
    // Hall 3 Sign
    createSignBanner('KHU VỰC 3: CÔNG ĐOÀN & PHONG TRÀO THI ĐUA', 'TỔNG LĐLĐ VN • CÔNG ĐOÀN ĐIỆN LỰC • LĐLĐ TỈNH • HỘI THAO', '#dc2626', 18.0, 6.5, 0, -Math.PI / 2);
  }

  /**
   * Historical Timeline Milestone Plaques mounted on gallery walls
   * Architectural period markers framing key epochs (1985-2005, 2006-2016, 2017-2025)
   */
  buildTimelineMilestonePlaques(parent) {
    const milestonesGroup = new THREE.Group();
    milestonesGroup.name = 'TimelineMilestonePlaques';

    const createMilestonePlaque = (badge, title, subtitle, themeColor, w, h, x, y, z, rotY) => {
      const canvas = document.createElement('canvas');
      canvas.width = 2048;
      canvas.height = 320;
      const ctx = canvas.getContext('2d');

      // 1. Dark royal obsidian background
      const grad = ctx.createLinearGradient(0, 0, 2048, 0);
      grad.addColorStop(0, '#090e1a');
      grad.addColorStop(0.5, '#101728');
      grad.addColorStop(1, '#090e1a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 2048, 320);

      // 2. Outer decorative gold/theme border
      ctx.strokeStyle = themeColor;
      ctx.lineWidth = 8;
      ctx.strokeRect(12, 12, 2024, 296);

      // Inner subtle gold border
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.4)';
      ctx.lineWidth = 3;
      ctx.strokeRect(24, 24, 2000, 272);

      // 3. Left Pill Badge (MỐC LỊCH SỬ / GIAI ĐOẠN)
      ctx.fillStyle = themeColor;
      ctx.beginPath();
      ctx.roundRect(45, 45, 340, 50, 25);
      ctx.fill();

      ctx.fillStyle = '#0a0f1d';
      ctx.font = 'bold 24px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badge, 215, 70);

      // 4. Milestone Title (Auto-fit font size to NEVER overflow)
      let titleFontSize = 46;
      ctx.font = `bold ${titleFontSize}px "Playfair Display", "Inter", serif`;
      let titleWidth = ctx.measureText(title).width;
      const maxTitleWidth = 1550;
      while (titleWidth > maxTitleWidth && titleFontSize > 24) {
        titleFontSize -= 2;
        ctx.font = `bold ${titleFontSize}px "Playfair Display", "Inter", serif`;
        titleWidth = ctx.measureText(title).width;
      }
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(title, 420, 72);

      // 5. Milestone Subtitle / Description (Auto-fit font size to NEVER overflow)
      let subFontSize = 26;
      ctx.font = `italic ${subFontSize}px "Inter", sans-serif`;
      let subWidth = ctx.measureText(subtitle).width;
      const maxSubWidth = 1900;
      while (subWidth > maxSubWidth && subFontSize > 18) {
        subFontSize -= 1;
        ctx.font = `italic ${subFontSize}px "Inter", sans-serif`;
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
      ctx.lineTo(2000, 130);
      ctx.stroke();

      const texture = new THREE.CanvasTexture(canvas);
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

      milestonesGroup.add(frameMesh);
      milestonesGroup.add(plaqueMesh);
    };

    // --- KHU 1: NHÀ NƯỚC & TẬP ĐOÀN ĐIỆN LỰC ---
    // 1. Tường Bắc Khu 1 (Honor Wall above Orders)
    createMilestonePlaque(
      'MỐC SON DANH DỰ',
      'CÁC PHẦN THƯỞNG CAO QUÝ CỦA ĐẢNG & NHÀ NƯỚC (1985 - 2025)',
      'Huân chương Lao động Hạng Nhất, Nhì, Ba • Bằng khen Thủ tướng Chính phủ trao tặng Công ty Điện lực Vũng Tàu',
      '#eab308',
      12.0, 1.4,
      0, 5.75, -44.25,
      0
    );

    // 2. Tường Tây Khu 1 (EVN & Bộ Công Thương)
    createMilestonePlaque(
      'GIAI ĐOẠN 1985 - 2025',
      'THI ĐUA XUẤT SẮC: TẬP ĐOÀN ĐIỆN LỰC VIỆT NAM (EVN) & BỘ CÔNG THƯƠNG',
      'Cờ thi đua & Bằng khen ghi nhận thành tích xuất sắc toàn diện trong cung ứng điện an toàn, ổn định và liên tục',
      '#eab308',
      10.5, 1.3,
      -17.25, 5.75, -31.0,
      Math.PI / 2
    );

    // 3. Tường Đông Khu 1 (EVNHCMC)
    createMilestonePlaque(
      'GIAI ĐOẠN 1985 - 2025',
      'ĐƠN VỊ DẪN ĐẦU: TỔNG CÔNG TY ĐIỆN LỰC TP. HỒ CHÍ MINH (EVNHCMC)',
      'Tiên phong hoàn thành xuất sắc các chỉ tiêu kinh tế kỹ thuật, hiện đại hóa lưới điện và nâng tầm dịch vụ khách hàng',
      '#eab308',
      10.5, 1.3,
      17.25, 5.75, -31.0,
      -Math.PI / 2
    );

    // --- KHU 2: ĐỒNG HÀNH CÙNG TỈNH BÀ RỊA - VŨNG TÀU ---
    // 4. Tường Bắc Khu 2 (1985 - 2005)
    createMilestonePlaque(
      'GIAI ĐOẠN 1985 - 2005',
      'THỜI KỲ KHỞI ĐẦU, THÀNH LẬP & TÁI THIẾT HỆ THỐNG ĐIỆN ĐÔ THỊ BIỂN',
      'Từ Đặc khu Vũng Tàu - Côn Đảo đến thành lập tỉnh Bà Rịa - Vũng Tàu • Vượt qua muôn vàn khó khăn mở rộng nguồn điện',
      '#16a34a',
      10.0, 1.3,
      -35.0, 5.75, -24.25,
      0
    );

    // 5. Tường Tây Khu 2 (2006 - 2016)
    createMilestonePlaque(
      'GIAI ĐOẠN 2006 - 2016',
      'TĂNG TỐC PHÁT TRIỂN & CÔNG NGHIỆP HÓA ĐÔ THỊ DẦU KHÍ - DU LỊCH',
      'Cung ứng nguồn điện ổn định phục vụ trọng điểm ngành dầu khí, cụm cảng nước sâu Cái Mép và du lịch biển Vũng Tàu',
      '#16a34a',
      12.0, 1.3,
      -49.25, 5.75, 0,
      Math.PI / 2
    );

    // 6. Tường Nam Khu 2 (2017 - 2025)
    createMilestonePlaque(
      'GIAI ĐOẠN 2017 - 2025',
      'HIỆN ĐẠI HÓA, LƯỚI ĐIỆN THÔNG MINH & CHUYỂN ĐỔI SỐ TOÀN DIỆN',
      'Đột phá tự động hóa lưới điện, trạm không người trực, giao dịch điện tử 100% và chỉ số SAIDI - SAIFI đạt chuẩn quốc tế',
      '#16a34a',
      10.0, 1.3,
      -35.0, 5.75, 24.25,
      Math.PI
    );

    // --- KHU 3: CÔNG ĐOÀN & PHONG TRÀO THI ĐUA ---
    // 7. Tường Bắc Khu 3 (1985 - 2005)
    createMilestonePlaque(
      'GIAI ĐOẠN 1985 - 2005',
      'XÂY DỰNG TỔ CHỨC CÔNG ĐOÀN VỮNG MẠNH, ĐOÀN KẾT VÌ NGƯỜI LAO ĐỘNG',
      'Chăm lo đời sống vật chất tinh thần cho CBCNV • Phát huy tinh thần trách nhiệm của người thợ điện miền duyên hải',
      '#dc2626',
      10.0, 1.3,
      35.0, 5.75, -24.25,
      0
    );

    // 8. Tường Đông Khu 3 (2006 - 2016)
    createMilestonePlaque(
      'GIAI ĐOẠN 2006 - 2016',
      'PHONG TRÀO THI ĐUA "LAO ĐỘNG GIỎI - LAO ĐỘNG SÁNG TẠO"',
      'Hàng trăm sáng kiến cải tiến kỹ thuật làm lợi hàng chục tỷ đồng • Bảo đảm tuyệt đối an toàn vệ sinh lao động',
      '#dc2626',
      12.0, 1.3,
      49.25, 5.75, 0,
      -Math.PI / 2
    );

    // 9. Tường Nam Khu 3 (2017 - 2025)
    createMilestonePlaque(
      'GIAI ĐOẠN 2017 - 2025',
      'VĂN HÓA DOANH NGHIỆP, NGHĨA TÌNH & HỘI NHẬP CHUYỂN ĐỔI SỐ',
      'Tập thể vững mạnh, nhận nhiều Cờ thi đua xuất sắc của Tổng LĐLĐ Việt Nam, Công đoàn Điện lực và LĐLĐ Tỉnh',
      '#dc2626',
      10.0, 1.3,
      35.0, 5.75, 24.25,
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
    const plantsGroup = new THREE.Group();
    plantsGroup.name = 'PottedPlants';

    // Premium Materials
    const potMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.22,
      metalness: 0.15
    });

    const soilMat = new THREE.MeshStandardMaterial({
      color: 0x1c1917,
      roughness: 0.95,
      metalness: 0.0
    });

    const pebbleMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.25,
      metalness: 0.1
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

    const leafMatHighlight = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      roughness: 0.30,
      metalness: 0.05,
      side: THREE.DoubleSide
    });

    // Helper: 3D Arching Leaf Geometry with V-crease (authentic non-flat 3D foliage)
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

    // Shared Geometries for ultra-high performance (instanced across all 19 plants)
    const geoLeafLarge = createCurvedLeafGeometry(0.72, 0.17, 0.24, 0.038);
    const geoLeafMid = createCurvedLeafGeometry(0.58, 0.14, 0.18, 0.030);
    const geoLeafCrown = createCurvedLeafGeometry(0.44, 0.11, 0.12, 0.022);

    const geoPot = new THREE.CylinderGeometry(0.38, 0.27, 0.86, 24);
    const geoRim = new THREE.CylinderGeometry(0.40, 0.40, 0.06, 24);
    const geoBase = new THREE.CylinderGeometry(0.29, 0.31, 0.06, 24);
    const geoWaist = new THREE.CylinderGeometry(0.342, 0.342, 0.025, 24);
    const geoSoil = new THREE.CylinderGeometry(0.36, 0.36, 0.04, 24);
    const geoStemCenter = new THREE.CylinderGeometry(0.028, 0.038, 1.40, 12);
    const geoStemOuter = new THREE.CylinderGeometry(0.018, 0.026, 1.05, 10);
    const geoPebble = new THREE.SphereGeometry(0.045, 8, 8);
    geoPebble.scale(1, 0.45, 1);

    const createPlant = (x, z) => {
      const p = new THREE.Group();
      p.position.set(x, 0, z);

      // 1. Luxury Planter Body
      const potMesh = new THREE.Mesh(geoPot, potMat);
      potMesh.position.y = 0.44;
      potMesh.castShadow = true;
      potMesh.receiveShadow = true;
      p.add(potMesh);

      // 2. Gold Base Plinth
      const baseMesh = new THREE.Mesh(geoBase, this.matGold);
      baseMesh.position.y = 0.03;
      p.add(baseMesh);

      // 3. Gold Waist Accent Inlay
      const waistMesh = new THREE.Mesh(geoWaist, this.matGold);
      waistMesh.position.y = 0.48;
      p.add(waistMesh);

      // 4. Gold Top Rim Collar
      const rimMesh = new THREE.Mesh(geoRim, this.matGold);
      rimMesh.position.y = 0.86;
      p.add(rimMesh);

      // 5. Dark Soil Bed
      const soilMesh = new THREE.Mesh(geoSoil, soilMat);
      soilMesh.position.y = 0.85;
      p.add(soilMesh);

      // 6. Polished River Pebbles on Soil
      const pebbleOffsets = [
        [0.15, 0.12], [-0.14, 0.14], [0.16, -0.11], [-0.15, -0.13],
        [0.0, 0.19], [0.0, -0.19], [0.20, 0.0], [-0.20, 0.0]
      ];
      pebbleOffsets.forEach(([px, pz]) => {
        const pebble = new THREE.Mesh(geoPebble, pebbleMat);
        pebble.position.set(px, 0.87, pz);
        pebble.rotation.y = Math.random() * Math.PI;
        p.add(pebble);
      });

      // 7. Central Upright Trunk (Strictly vertical, NO tilt)
      const stemCenter = new THREE.Mesh(geoStemCenter, stemMat);
      stemCenter.position.set(0, 0.85 + 0.70, 0);
      stemCenter.castShadow = true;
      p.add(stemCenter);

      // 8. Outer Balanced Bamboo Canes (4 cardinal directions, strictly upright and symmetrical)
      const caneRadius = 0.065;
      for (let c = 0; c < 4; c++) {
        const cAngle = c * (Math.PI / 2);
        const cx = Math.cos(cAngle) * caneRadius;
        const cz = Math.sin(cAngle) * caneRadius;
        const stemOuter = new THREE.Mesh(geoStemOuter, stemMat);
        stemOuter.position.set(cx, 0.85 + 0.525, cz);
        stemOuter.castShadow = true;
        p.add(stemOuter);
      }

      // 9. Structured Multi-Tiered Foliage (Strict 360-degree radial balance, upright and graceful)
      // Tier 1: Lower tier arching fronds (6 leaves at 60 deg, arching outward gracefully)
      const tier1Count = 6;
      for (let i = 0; i < tier1Count; i++) {
        const angle = i * ((Math.PI * 2) / tier1Count);
        const leaf = new THREE.Mesh(geoLeafLarge, leafMatDark);
        leaf.position.set(Math.cos(angle) * 0.08, 1.25, Math.sin(angle) * 0.08);
        leaf.rotation.order = 'YXZ';
        leaf.rotation.y = Math.PI / 2 - angle;
        leaf.rotation.x = -0.48; // ~27 deg upward arch
        leaf.rotation.z = 0;
        leaf.castShadow = true;
        p.add(leaf);
      }

      // Tier 2: Mid tier lush foliage (8 leaves at 45 deg, staggered by 22.5 deg)
      const tier2Count = 8;
      for (let i = 0; i < tier2Count; i++) {
        const angle = (i + 0.5) * ((Math.PI * 2) / tier2Count);
        const mat = i % 2 === 0 ? leafMatDark : leafMatVibrant;
        const leaf = new THREE.Mesh(geoLeafLarge, mat);
        leaf.position.set(Math.cos(angle) * 0.06, 1.55, Math.sin(angle) * 0.06);
        leaf.rotation.order = 'YXZ';
        leaf.rotation.y = Math.PI / 2 - angle;
        leaf.rotation.x = -0.35; // ~20 deg upward arch
        leaf.rotation.z = 0;
        leaf.castShadow = true;
        p.add(leaf);
      }

      // Tier 3: Upper tier crown fronds (6 leaves at 60 deg)
      const tier3Count = 6;
      for (let i = 0; i < tier3Count; i++) {
        const angle = i * ((Math.PI * 2) / tier3Count);
        const mat = i % 2 === 0 ? leafMatVibrant : leafMatHighlight;
        const leaf = new THREE.Mesh(geoLeafMid, mat);
        leaf.position.set(Math.cos(angle) * 0.04, 1.85, Math.sin(angle) * 0.04);
        leaf.rotation.order = 'YXZ';
        leaf.rotation.y = Math.PI / 2 - angle;
        leaf.rotation.x = -0.22; // ~12 deg upright reach
        leaf.rotation.z = 0;
        leaf.castShadow = true;
        p.add(leaf);
      }

      // Tier 4: Top center spires (3 young erect shoot leaves pointing almost straight up)
      const tier4Count = 3;
      for (let i = 0; i < tier4Count; i++) {
        const angle = (i * ((Math.PI * 2) / tier4Count)) + 0.3;
        const leaf = new THREE.Mesh(geoLeafCrown, leafMatHighlight);
        leaf.position.set(Math.cos(angle) * 0.02, 2.10, Math.sin(angle) * 0.02);
        leaf.rotation.order = 'YXZ';
        leaf.rotation.y = Math.PI / 2 - angle;
        leaf.rotation.x = -0.08; // ~5 deg upright spire
        leaf.rotation.z = 0;
        leaf.castShadow = true;
        p.add(leaf);
      }

      plantsGroup.add(p);
    };

    // Plant Coordinates - Exactly flush against wall baseboards and corners (3cm clearance)
    const plantCoords = [
      // 1. North Hall (Hall 1) - Back corners, Portal side walls & Partition south end
      [-16.93, -43.93], // North-West back corner
      [ 16.93, -43.93], // North-East back corner
      [-16.93, -15.00], // Entrance Portal West wall
      [ 16.93, -15.00], // Entrance Portal East wall
      [  0.00, -22.57], // Center Island Partition south end

      // 2. West Hall (Hall 2) - Far corners, Partition ends, Portal corners
      [-48.93, -23.93], // Far North-West corner
      [-48.93,  23.93], // Far South-West corner
      [-19.00, -23.93], // East Portal North wall
      [-19.00,  23.93], // East Portal South wall
      [-35.00, -12.43], // Center Partition North end
      [-35.00,  12.43], // Center Partition South end

      // 3. East Hall (Hall 3) - Far corners, Partition ends, Portal corners
      [ 48.93, -23.93], // Far North-East corner
      [ 48.93,  23.93], // Far South-East corner
      [ 19.00, -23.93], // West Portal North wall
      [ 19.00,  23.93], // West Portal South wall
      [ 35.00, -11.43], // Center Partition North end
      [ 35.00,  11.43], // Center Partition South end

      // 4. South Lobby - Entrance wall corners
      [-21.50,  36.93], // Lobby South-West corner
      [ 21.50,  36.93]  // Lobby South-East corner
    ];

    plantCoords.forEach(([x, z]) => createPlant(x, z));
    parent.add(plantsGroup);
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

    // Hall 1 ceiling lights
    createCoffer(12, 2.5, 0, 8.35, -24, 0);
    createCoffer(12, 2.5, 0, 8.35, -34, 0);
    createCoffer(12, 2.5, 0, 8.35, -42, 0);

    // Hall 2 ceiling lights (West)
    createCoffer(14, 2.5, -26, 8.35, 0, Math.PI / 2);
    createCoffer(14, 2.5, -36, 8.35, 0, Math.PI / 2);
    createCoffer(14, 2.5, -46, 8.35, 0, Math.PI / 2);

    // Hall 3 ceiling lights (East)
    createCoffer(14, 2.5, 26, 8.35, 0, Math.PI / 2);
    createCoffer(14, 2.5, 36, 8.35, 0, Math.PI / 2);
    createCoffer(14, 2.5, 46, 8.35, 0, Math.PI / 2);

    // South lobby ceiling light
    createCoffer(10, 2.5, 0, 8.35, 26, 0);

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

    // East Hall
    createHallSpot(0xfee2e2, 32, 7.5, 0, 49, 3.0, 0);
    createHallSpot(0xfee2e2, 35, 7.5, -12, 35, 3.0, 0);
    createHallSpot(0xfee2e2, 35, 7.5, 12, 35, 3.0, 0);
  }

  /**
   * Luxury Museum Showcase Vitrine for Historical Albums
   * Modeled directly from the user's reference photograph:
   * - Slender champagne gold legs with interlocking Greek-key fretwork (hồi văn)
   * - Drawer apron box with gold pull knob
   * - 5-sided crystal-clear glass hood (depthWrite: false)
   * - Sloped tiered ivory velvet presentation stands
   * - 2 Luxury 3D hardbound leather albums (Bordeaux & Royal Navy)
   * - Engraved solid brass nameplates
   * - Under-table marble/slate blue runner rug
   * - Internal warm jewelry illumination spotlight
   */
  buildLuxuryShowcaseVitrine(parent) {
    const vitrineGroup = new THREE.Group();
    vitrineGroup.name = 'LuxuryShowcaseVitrine';
    // Position at central rotunda, north of the EVNHCMC seal (Z = -8.2, X = 0, on dais Y = 0.35)
    vitrineGroup.position.set(0, 0.35, -8.2);

    // 1. Under-table Luxury Artistic Rug / Runner (Matching Reference Image)
    const rugCanvas = document.createElement('canvas');
    rugCanvas.width = 1024;
    rugCanvas.height = 512;
    const rctx = rugCanvas.getContext('2d');
    const grad = rctx.createLinearGradient(0, 0, 1024, 512);
    grad.addColorStop(0, '#64748b');
    grad.addColorStop(0.3, '#334155');
    grad.addColorStop(0.7, '#94a3b8');
    grad.addColorStop(1, '#475569');
    rctx.fillStyle = grad;
    rctx.fillRect(0, 0, 1024, 512);

    // Subtle marble veining
    rctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    for (let i = 0; i < 24; i++) {
      rctx.beginPath();
      rctx.arc(Math.random() * 1024, Math.random() * 512, Math.random() * 140 + 40, 0, Math.PI * 2);
      rctx.fill();
    }
    // Gold ornamental rim border
    rctx.strokeStyle = 'rgba(212, 175, 55, 0.85)';
    rctx.lineWidth = 14;
    rctx.strokeRect(16, 16, 992, 480);
    rctx.strokeStyle = 'rgba(212, 175, 55, 0.4)';
    rctx.lineWidth = 6;
    rctx.strokeRect(36, 36, 952, 440);

    const rugTexture = new THREE.CanvasTexture(rugCanvas);
    const rugGeo = new THREE.PlaneGeometry(2.8, 1.6);
    const rugMat = new THREE.MeshStandardMaterial({
      map: rugTexture,
      roughness: 0.8,
      metalness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    const rugMesh = new THREE.Mesh(rugGeo, rugMat);
    rugMesh.rotation.x = -Math.PI / 2;
    rugMesh.position.y = 0.005;
    rugMesh.receiveShadow = true;
    vitrineGroup.add(rugMesh);

    // 2. Slender Gold Metal Stand & Framework
    const legH = 0.76;
    const legSize = 0.035;
    const legGeo = new THREE.BoxGeometry(legSize, legH, legSize);
    const legPositions = [
      [-0.98, legH / 2, -0.36],
      [0.98, legH / 2, -0.36],
      [-0.98, legH / 2, 0.36],
      [0.98, legH / 2, 0.36]
    ];
    legPositions.forEach(pos => {
      const leg = new THREE.Mesh(legGeo, this.matGoldShowcase);
      leg.position.set(...pos);
      leg.castShadow = true;
      vitrineGroup.add(leg);
    });

    // Lower perimeter stretchers connecting legs at Y = 0.05m
    const stretchZGeo = new THREE.BoxGeometry(legSize, 0.025, 0.72);
    const stretchL = new THREE.Mesh(stretchZGeo, this.matGoldShowcase);
    stretchL.position.set(-0.98, 0.05, 0);
    vitrineGroup.add(stretchL);

    const stretchR = new THREE.Mesh(stretchZGeo, this.matGoldShowcase);
    stretchR.position.set(0.98, 0.05, 0);
    vitrineGroup.add(stretchR);

    const stretchXGeo = new THREE.BoxGeometry(1.96, 0.025, legSize);
    const stretchBack = new THREE.Mesh(stretchXGeo, this.matGoldShowcase);
    stretchBack.position.set(0, 0.05, -0.36);
    vitrineGroup.add(stretchBack);

    // 3. Greek-key / Rectangular Interlocking Fretwork Ornament (Matching Reference Photo)
    this.createSideFretwork(vitrineGroup, -0.98, legH);
    this.createSideFretwork(vitrineGroup, 0.98, legH);
    this.createFrontFretwork(vitrineGroup, legH);

    // 4. Main Table Apron / Base Box (Drawer Box with Gold Molding)
    const boxW = 2.12;
    const boxH = 0.16;
    const boxD = 0.86;
    const boxY = legH + boxH / 2; // 0.76 + 0.08 = 0.84m
    const boxGeo = new THREE.BoxGeometry(boxW, boxH, boxD);
    const boxMesh = new THREE.Mesh(boxGeo, this.matGoldShowcase);
    boxMesh.position.set(0, boxY, 0);
    boxMesh.castShadow = true;
    vitrineGroup.add(boxMesh);

    // Front Drawer accent & pull knob
    const drawerFront = new THREE.Mesh(
      new THREE.BoxGeometry(boxW * 0.85, boxH * 0.65, 0.01),
      new THREE.MeshStandardMaterial({ color: 0xc9a444, metalness: 0.9, roughness: 0.2 })
    );
    drawerFront.position.set(0, boxY, boxD / 2 + 0.006);
    vitrineGroup.add(drawerFront);

    const knobGeo = new THREE.SphereGeometry(0.018, 16, 16);
    const knob = new THREE.Mesh(knobGeo, this.matGoldShowcase);
    knob.position.set(0, boxY, boxD / 2 + 0.025);
    vitrineGroup.add(knob);

    // 5. Interior Display Deck & Tiered Velvet Stands (Inside Vitrine)
    const deckY = legH + boxH; // 0.92m
    const deckGeo = new THREE.BoxGeometry(boxW - 0.06, 0.04, boxD - 0.06);
    const deckMesh = new THREE.Mesh(deckGeo, this.matVelvetIvory);
    deckMesh.position.set(0, deckY + 0.02, 0);
    deckMesh.receiveShadow = true;
    vitrineGroup.add(deckMesh);

    // 2 Sloped Reading Cushions / Stands for the Albums
    const standW = 0.68;
    const standD = 0.48;
    const standH = 0.06;
    const standTilt = 0.30; // ~17 degrees tilted forward toward visitor (+Z)

    // Left Stand Group (for Souvenir Photos)
    const leftStandGroup = new THREE.Group();
    leftStandGroup.position.set(-0.52, deckY + 0.06, 0.02);
    leftStandGroup.rotation.x = standTilt;

    const standGeo = new THREE.BoxGeometry(standW, standH, standD);
    const leftStandMesh = new THREE.Mesh(standGeo, this.matVelvetIvory);
    leftStandMesh.castShadow = true;
    leftStandMesh.receiveShadow = true;
    leftStandGroup.add(leftStandMesh);

    // Right Stand Group (for Gift Paintings)
    const rightStandGroup = new THREE.Group();
    rightStandGroup.position.set(0.52, deckY + 0.06, 0.02);
    rightStandGroup.rotation.x = standTilt;

    const rightStandMesh = new THREE.Mesh(standGeo, this.matVelvetIvory);
    rightStandMesh.castShadow = true;
    rightStandMesh.receiveShadow = true;
    rightStandGroup.add(rightStandMesh);

    // 6. Two 3D Hardbound Archival Albums
    const albumW = 0.54;
    const albumH = 0.065;
    const albumD = 0.40;

    // Album 1: Souvenir Photos (Bordeaux Red Leather + Gold Filigree)
    const album1Texture = this.createAlbumCoverCanvas(
      'souvenir',
      'TẬP ẢNH TƯ LIỆU & LƯU NIỆM',
      'CÔNG TY ĐIỆN LỰC VŨNG TÀU',
      '1985 - 2025 • 40 NĂM PHÁT TRIỂN',
      '#6b1515', '#450a0a', '#facc15'
    );
    const album1Mat = [
      new THREE.MeshStandardMaterial({ color: 0x500d0d, roughness: 0.4 }), // right edge
      new THREE.MeshStandardMaterial({ color: 0x500d0d, roughness: 0.4 }), // left spine
      new THREE.MeshStandardMaterial({ map: album1Texture, roughness: 0.35, metalness: 0.3 }), // top cover
      new THREE.MeshStandardMaterial({ color: 0x3d0a0a, roughness: 0.5 }), // bottom back
      new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.8 }), // gold gilded pages front
      new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.8 })  // gold gilded pages back
    ];
    const album1Geo = new THREE.BoxGeometry(albumW, albumH, albumD);
    const album1Mesh = new THREE.Mesh(album1Geo, album1Mat);
    album1Mesh.position.set(0, standH / 2 + albumH / 2 + 0.005, 0);
    album1Mesh.castShadow = true;
    album1Mesh.name = 'Album_Souvenir_Photos';
    album1Mesh.userData = {
      isAlbum: true,
      albumId: 'souvenir_photos',
      title: 'Album Ảnh Tư Liệu & Lưu Niệm (58 Ảnh)',
      hint: 'Nhấp để mở & lật từng trang'
    };
    leftStandGroup.add(album1Mesh);
    this.albumMeshes.push(album1Mesh);

    // Album 2: Gift Paintings (Royal Navy Leather + Gold Filigree)
    const album2Texture = this.createAlbumCoverCanvas(
      'paintings',
      'BỘ SƯU TẬP TRANH KỶ NIỆM',
      'CÁC ĐƠN VỊ & ĐỐI TÁC TRAO TẶNG',
      'CÔNG TY ĐIỆN LỰC VŨNG TÀU',
      '#0d253f', '#061321', '#38bdf8'
    );
    const album2Mat = [
      new THREE.MeshStandardMaterial({ color: 0x091b2e, roughness: 0.4 }),
      new THREE.MeshStandardMaterial({ color: 0x091b2e, roughness: 0.4 }),
      new THREE.MeshStandardMaterial({ map: album2Texture, roughness: 0.35, metalness: 0.3 }),
      new THREE.MeshStandardMaterial({ color: 0x050f1a, roughness: 0.5 }),
      new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.8 }),
      new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.8 })
    ];
    const album2Geo = new THREE.BoxGeometry(albumW, albumH, albumD);
    const album2Mesh = new THREE.Mesh(album2Geo, album2Mat);
    album2Mesh.position.set(0, standH / 2 + albumH / 2 + 0.005, 0);
    album2Mesh.castShadow = true;
    album2Mesh.name = 'Album_Gift_Paintings';
    album2Mesh.userData = {
      isAlbum: true,
      albumId: 'gift_paintings',
      title: 'Album Tranh Kỷ Niệm & Tranh Tặng (49 Tranh)',
      hint: 'Nhấp để mở & lật từng trang'
    };
    rightStandGroup.add(album2Mesh);
    this.albumMeshes.push(album2Mesh);

    vitrineGroup.add(leftStandGroup);
    vitrineGroup.add(rightStandGroup);

    // 7. Solid Brass Engraved Nameplates in Front of Each Stand
    const plateGeo = new THREE.BoxGeometry(0.52, 0.025, 0.06);
    const plate1Texture = this.createPlacardCanvas('ẢNH LƯU NIỆM (58 TƯ LIỆU)');
    const plate1Mat = new THREE.MeshStandardMaterial({ map: plate1Texture, metalness: 0.85, roughness: 0.25 });
    const plate1Mesh = new THREE.Mesh(plateGeo, plate1Mat);
    plate1Mesh.position.set(-0.52, deckY + 0.035, 0.32);
    plate1Mesh.rotation.x = -0.25;
    vitrineGroup.add(plate1Mesh);

    const plate2Texture = this.createPlacardCanvas('TRANH KỶ NIỆM (49 TÁC PHẨM)');
    const plate2Mat = new THREE.MeshStandardMaterial({ map: plate2Texture, metalness: 0.85, roughness: 0.25 });
    const plate2Mesh = new THREE.Mesh(plateGeo, plate2Mat);
    plate2Mesh.position.set(0.52, deckY + 0.035, 0.32);
    plate2Mesh.rotation.x = -0.25;
    vitrineGroup.add(plate2Mesh);

    // 8. Crystal Glass Vitrine Hood (5-sided casing, depthWrite: false)
    const glassW = boxW - 0.04;
    const glassD = boxD - 0.04;
    const glassH = 0.44;
    const glassY = deckY + glassH / 2 + 0.01;

    // Top glass
    const topGlass = new THREE.Mesh(new THREE.BoxGeometry(glassW, 0.01, glassD), this.matGlassShowcase);
    topGlass.position.set(0, deckY + glassH + 0.01, 0);
    vitrineGroup.add(topGlass);

    // Front glass
    const frontGlass = new THREE.Mesh(new THREE.BoxGeometry(glassW, glassH, 0.01), this.matGlassShowcase);
    frontGlass.position.set(0, glassY, glassD / 2);
    vitrineGroup.add(frontGlass);

    // Back glass
    const backGlass = new THREE.Mesh(new THREE.BoxGeometry(glassW, glassH, 0.01), this.matGlassShowcase);
    backGlass.position.set(0, glassY, -glassD / 2);
    vitrineGroup.add(backGlass);

    // Left glass
    const leftGlass = new THREE.Mesh(new THREE.BoxGeometry(0.01, glassH, glassD), this.matGlassShowcase);
    leftGlass.position.set(-glassW / 2, glassY, 0);
    vitrineGroup.add(leftGlass);

    // Right glass
    const rightGlass = new THREE.Mesh(new THREE.BoxGeometry(0.01, glassH, glassD), this.matGlassShowcase);
    rightGlass.position.set(glassW / 2, glassY, 0);
    vitrineGroup.add(rightGlass);

    // Gold Top Rim Frame for Glass Vitrine
    const rimThick = 0.018;
    const rimMat = this.matGoldShowcase;
    const topRimF = new THREE.Mesh(new THREE.BoxGeometry(glassW, rimThick, rimThick), rimMat);
    topRimF.position.set(0, deckY + glassH + 0.015, glassD / 2);
    vitrineGroup.add(topRimF);

    const topRimB = new THREE.Mesh(new THREE.BoxGeometry(glassW, rimThick, rimThick), rimMat);
    topRimB.position.set(0, deckY + glassH + 0.015, -glassD / 2);
    vitrineGroup.add(topRimB);

    const topRimL = new THREE.Mesh(new THREE.BoxGeometry(rimThick, rimThick, glassD), rimMat);
    topRimL.position.set(-glassW / 2, deckY + glassH + 0.015, 0);
    vitrineGroup.add(topRimL);

    const topRimR = new THREE.Mesh(new THREE.BoxGeometry(rimThick, rimThick, glassD), rimMat);
    topRimR.position.set(glassW / 2, deckY + glassH + 0.015, 0);
    vitrineGroup.add(topRimR);

    // 9. Single warm light for showcase (replaces SpotLight + PointLight combo)
    const vitrineGlow = new THREE.PointLight(0xfffaed, 2.5, 5.0);
    vitrineGlow.position.set(0, deckY + glassH + 0.3, 0);
    vitrineGroup.add(vitrineGlow);

    parent.add(vitrineGroup);
    this.showcaseVitrineGroup = vitrineGroup;
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
    ctx.font = 'bold 54px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(type === 'souvenir' ? '⚡' : '🎨', 512, 250);

    // Typography
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;

    ctx.fillStyle = gold;
    ctx.font = 'bold 46px "Playfair Display", "Inter", serif';
    ctx.fillText(title, 512, 390);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px "Inter", sans-serif';
    ctx.fillText(org, 512, 460);

    ctx.fillStyle = gold;
    ctx.font = '600 22px "Inter", sans-serif';
    ctx.fillText(sub, 512, 520);

    ctx.fillStyle = 'rgba(250, 204, 21, 0.75)';
    ctx.font = 'italic 18px "Inter", sans-serif';
    ctx.fillText('★ KHÔNG GIAN SỐ HÓA TRUYỀN THỐNG 3D ★', 512, 630);

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
    ctx.font = 'bold 40px "Playfair Display", "Inter", serif';
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
    const hcmGroup = new THREE.Group();
    hcmGroup.name = 'HCMCulturalZone';
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
    // Main floor: repeat(14,14) on 140x140 = 10m per tile
    // HCM floor: 44x44, so repeat = 44/10 = 4.4 to match tile size
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
    hcmGroup.add(hcmFloor);

    // Ceiling for HCM Zone — wide enough to cover full museum width at transition
    // This prevents the main museum ceiling edge from being visible inside the HCM zone
    const hcmCeil = new THREE.Mesh(new THREE.PlaneGeometry(140, 44), this.matCeiling);
    hcmCeil.position.set(0, 8.5, 60);
    hcmCeil.rotation.x = Math.PI / 2;
    hcmGroup.add(hcmCeil);

    // Entrance ceiling beam — seals the transition between main museum ceiling and HCM zone
    const beamGeo = new THREE.BoxGeometry(44, 1.0, 1.5);
    const beamMesh = new THREE.Mesh(beamGeo, this.matHCMWall);
    beamMesh.position.set(0, 8.0, 38.5);
    hcmGroup.add(beamMesh);

    // Gold trim on beam
    const beamTrimGeo = new THREE.BoxGeometry(44.2, 0.12, 1.6);
    const beamTrimMesh = new THREE.Mesh(beamTrimGeo, this.matGold);
    beamTrimMesh.position.set(0, 7.45, 38.5);
    hcmGroup.add(beamTrimMesh);

    // --- OUTER WALLS ---
    // West wall (X = -22)
    hcmGroup.add(this.createWallMesh(44, h, 1.2, -22, h/2, 60, Math.PI/2, this.matHCMWall, 'Wall_HCM_West'));
    // East wall (X = 22)
    hcmGroup.add(this.createWallMesh(44, h, 1.2, 22, h/2, 60, -Math.PI/2, this.matHCMWall, 'Wall_HCM_East'));
    // Far South wall (Z = 82)
    hcmGroup.add(this.createWallMesh(44, h, 1.2, 0, h/2, 82, 0, this.matHCMWall, 'Wall_HCM_South'));

    // --- CENTRAL PARTITION REMOVED per user request ---
    // Photos now distributed across walls (West + South for real photos, East for timeline)

    // --- GRAND PORTRAIT on SOUTH WALL (Z=81.3, facing north into the hall) ---
    this.buildHCMPortraitWall(hcmGroup);

    // --- ENTRANCE ARCHWAY SIGN ---
    this.buildHCMEntranceSign(hcmGroup);

    // --- PERIOD MILESTONE PLAQUES — removed per user request ---
    // this.buildHCMPeriodPlaques(hcmGroup);

    // --- SPOTLIGHTS & WARM LIGHTING ---
    this.buildHCMLighting(hcmGroup);

    parent.add(hcmGroup);
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

    // Central Gold Star
    pctx.fillStyle = '#facc15';
    pctx.shadowColor = 'rgba(250, 204, 21, 0.6)';
    pctx.shadowBlur = 25;
    pctx.font = 'bold 150px serif';
    pctx.textAlign = 'center';
    pctx.textBaseline = 'middle';
    pctx.fillText('★', 1024, 220);

    pctx.shadowBlur = 0; // Reset shadow

    // Title: KHÔNG GIAN VĂN HÓA
    pctx.fillStyle = '#ffffff';
    pctx.font = 'bold 64px "Playfair Display", "Inter", serif';
    pctx.fillText('KHÔNG GIAN VĂN HÓA', 1024, 420);

    // Title: HỒ CHÍ MINH
    pctx.fillStyle = '#facc15';
    pctx.font = 'bold 105px "Playfair Display", "Inter", serif';
    pctx.fillText('HỒ CHÍ MINH', 1024, 550);

    // Dates
    pctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    pctx.font = '600 42px "Inter", sans-serif';
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
    pctx.font = 'bold 32px serif';
    pctx.fillText('◆', 1024, 770);

    // Iconic quote
    pctx.fillStyle = '#ffffff';
    pctx.font = 'italic 500 44px "Playfair Display", "Inter", serif';
    pctx.fillText('"Không có gì quý hơn Độc lập, Tự do"', 1024, 870);

    // Secondary guidance quote
    pctx.fillStyle = '#fbbf24';
    pctx.font = '500 30px "Inter", sans-serif';
    pctx.fillText('Học tập và làm theo tư tưởng, đạo đức, phong cách Hồ Chí Minh', 1024, 950);

    // Footer signature
    pctx.fillStyle = 'rgba(212, 175, 55, 0.85)';
    pctx.font = 'bold 26px "Inter", sans-serif';
    pctx.fillText('★ CÔNG TY ĐIỆN LỰC VŨNG TÀU — PHÒNG TRUYỀN THỐNG SỐ HÓA ★', 1024, 1070);

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
    ctx.font = 'bold 64px "Playfair Display", "Inter", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('KHU VỰC 4: KHÔNG GIAN VĂN HÓA HỒ CHÍ MINH', 1024, 195);

    // Subtitle
    ctx.fillStyle = '#eab308';
    ctx.font = 'bold 34px "Inter", sans-serif';
    ctx.fillText('LƯỢC SỬ CUỘC ĐỜI • ẢNH TƯ LIỆU • DI SẢN VĂN HÓA', 1024, 335);

    const tex = new THREE.CanvasTexture(canvas);
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

    // Frame
    const signFrame = new THREE.Mesh(new THREE.BoxGeometry(8.2, 2.2, 0.15), this.matGold);
    signFrame.position.set(0, 6.5, 38.6);
    signFrame.rotation.y = Math.PI;

    parent.add(signFrame);
    parent.add(sign);
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
      ctx.font = 'bold 70px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.badge, 512, 180);

      // Title
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 48px "Playfair Display", serif';
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
}

