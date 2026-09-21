import * as THREE from 'three';

/**
 * HCM Exhibit Builder
 * Displays authentic historical documentary photographs of President Ho Chi Minh (images_real)
 * in the grand HCM Cultural Zone (Khu 4).
 *
 * All timeline illustrations from images/ are omitted per user request.
 * Authentic historical photos are enlarged (2.2m - 3.0m) and hung at an elevated,
 * prestigious gallery height (Y = 3.8m) across the 3 walls:
 *   - West Wall (X = -21.25, facing East): 9 photos (1921 - 1946)
 *   - East Wall (X = 21.25, facing West): 9 photos (1946 - 1958)
 *   - South Wall (Z = 81.20, facing North): 4 photos (flanking the grand central screen)
 */
export class HCMExhibitBuilder {
  constructor(scene) {
    this.scene = scene;
    this.textureLoader = new THREE.TextureLoader();
    this.loadedTextures = new Map();
    this.hcmMeshes = [];
    this.hcmMap = new Map(); // id -> { mesh, data }
    this.hcmData = null;

    this.initMaterials();
  }

  initMaterials() {
    // Deep royal mahogany frame for authentic historical photos
    this.matFrame = new THREE.MeshStandardMaterial({
      color: 0x2e0c0c,
      roughness: 0.45,
      metalness: 0.15
    });

    // Gold ornamental inner bezel
    this.matGoldFrame = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.32,
      metalness: 0.85
    });

    // Brushed brass fixture & lamp material
    this.matBrass = new THREE.MeshStandardMaterial({
      color: 0xe2b755,
      roughness: 0.28,
      metalness: 0.92
    });

    // Museum protective anti-reflective glass
    this.matGlass = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.05,
      roughness: 0.1,
      metalness: 0.1,
      depthWrite: false
    });
  }

  getOrLoadTexture(url) {
    if (this.loadedTextures.has(url)) {
      return this.loadedTextures.get(url);
    }
    const texture = this.textureLoader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.anisotropy = 16;
        tex.needsUpdate = true;
      },
      undefined,
      (err) => { console.warn(`HCM texture load failed: ${url}`, err); }
    );
    this.loadedTextures.set(url, texture);
    return texture;
  }

  async loadData() {
    try {
      const resp = await fetch('assets/hcm_data.json?v=chuanhoa_v2');
      this.hcmData = await resp.json();
      const count = this.hcmData.real_photos ? this.hcmData.real_photos.length : 0;
      console.log(`HCM authentic photos data loaded: ${count} real photos`);
      return this.hcmData;
    } catch (err) {
      console.error('Failed to load HCM data:', err);
      return null;
    }
  }

  buildAllHCMExhibits(onProgress) {
    if (!this.hcmData || !this.hcmData.real_photos) return null;

    const group = new THREE.Group();
    group.name = 'HCMExhibits';

    const items = this.hcmData.real_photos;
    const totalCount = items.length;
    let totalCreated = 0;
    const itemDone = () => {
      totalCreated++;
      if (onProgress) onProgress(totalCreated, totalCount);
    };

    // East wall is reserved for Timeline (left from entrance).
    // Real photos go to West wall (right from entrance) + South wall (back/middle).
    // Grand central screen spans x = -6.6 to +6.6 on the south wall,
    // so photos must be placed outside that zone (|x| > 8.5).

    // 1. West wall: 13 photos (items 0 to 12) — facing East
    //    Full wall spans Z=38 to Z=82, using Z=39 to Z=80 for photos
    //    Spacing: 41m / 13 = ~3.15m per photo (comfortable gap)
    const westItems = items.slice(0, 13);
    this.mountWallGallery(westItems, group, {
      x: -21.25,
      startZ: 39.0,
      endZ: 80.0,
      rotY: Math.PI / 2, // facing East
      y: 3.8
    }, itemDone);

    // 2. South wall: 7 photos (items 13 to 19) flanking the grand central screen
    //    Grand screen occupies x = -6.6 to +6.6 (width 13.2m)
    //    Photos placed safely at |x| >= 9.0 to prevent any overlap
    //    3 photos on left side (-X), 4 photos on right side (+X)
    const southItems = items.slice(13, 20);
    const southPositions = [];
    const leftSouthCount = 3;
    const rightSouthCount = southItems.length - leftSouthCount;
    // Left side: 3 photos from x=-20 to x=-10, spaced ~5m apart
    for (let i = 0; i < leftSouthCount; i++) {
      southPositions.push(-20.0 + i * 5.0);
    }
    // Right side: 4 photos from x=+9 to x=+20, spaced ~3.7m apart
    for (let i = 0; i < rightSouthCount; i++) {
      southPositions.push(9.0 + i * 3.7);
    }

    southItems.forEach((item, idx) => {
      const exhibit = this.createHCMExhibit(item, Math.PI);
      exhibit.position.set(southPositions[idx], 3.8, 81.20);
      group.add(exhibit);
      itemDone();
    });

    this.scene.add(group);
    console.log(`Mounted all ${totalCreated}/${totalCount} authentic HCM historical photos successfully!`);
    return group;
  }

  /**
   * Mount a stately row of large framed photos along a wall (Z-axis)
   */
  mountWallGallery(items, parent, config, onDone) {
    const { x, startZ, endZ, rotY, y } = config;
    const totalLen = endZ - startZ;
    const spacing = totalLen / items.length;

    items.forEach((item, idx) => {
      const z = startZ + spacing * (idx + 0.5);
      const exhibit = this.createHCMExhibit(item, rotY);
      exhibit.position.set(x, y, z);
      parent.add(exhibit);
      onDone();
    });
  }

  /**
   * Create a single HCM exhibit with enlarged dimensions,
   * deep mahogany moulding, gold inner bezel, brass title plaque,
   * and classic museum picture lamp.
   */
  createHCMExhibit(item, rotY) {
    const group = new THREE.Group();
    group.rotation.y = rotY;

    const imgUrl = item.img || '';
    const title = item.title || '';
    const year = item.year || '';
    const date = item.date || year;
    const category = item.category || 'Tư liệu lịch sử';
    const id = item.id || `hcm_real_${Math.random().toString(36).substr(2, 8)}`;
    const aspect = item.aspect || 1.0;

    // Determine frame proportions based on actual photo aspect ratio
    // Reduced ~15% from previous sizes for better spacing between exhibits
    let fw, fh;
    if (aspect < 0.85) {
      // Portrait orientation (e.g. 0.65 - 0.75)
      fw = 1.8;
      fh = 2.4;
    } else if (aspect >= 1.25) {
      // Wide landscape orientation (e.g. 1.3 - 1.6)
      fw = 2.5;
      fh = 1.8;
    } else {
      // Standard / square orientation
      fw = 2.1;
      fh = 2.1;
    }

    // 1. Heavy wooden frame (outer)
    const frameGeo = new THREE.BoxGeometry(fw + 0.28, fh + 0.28, 0.12);
    const frameMesh = new THREE.Mesh(frameGeo, this.matFrame);
    group.add(frameMesh);

    // 2. Gold beveled inner bezel
    const innerGeo = new THREE.BoxGeometry(fw + 0.10, fh + 0.10, 0.14);
    const innerMesh = new THREE.Mesh(innerGeo, this.matGoldFrame);
    group.add(innerMesh);

    // 3. Photo Plane with high quality texture
    if (imgUrl) {
      const texture = this.getOrLoadTexture(imgUrl);
      const photoMat = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.4,
        metalness: 0.05,
        depthWrite: true,
        polygonOffset: true,
        polygonOffsetFactor: -1.0,
        polygonOffsetUnits: -1.0
      });
      const photoGeo = new THREE.PlaneGeometry(fw - 0.04, fh - 0.04);
      const photoMesh = new THREE.Mesh(photoGeo, photoMat);
      photoMesh.position.z = 0.076;
      group.add(photoMesh);
    }

    // 4. Protective museum glass overlay
    const glassMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(fw - 0.02, fh - 0.02),
      this.matGlass
    );
    glassMesh.position.z = 0.082;
    group.add(glassMesh);

    // 5. Classic brass picture lamp fixture mounted above frame
    const lampArmGeo = new THREE.BoxGeometry(0.04, 0.20, 0.26);
    const lampArm = new THREE.Mesh(lampArmGeo, this.matBrass);
    lampArm.position.set(0, fh / 2 + 0.18, 0.13);
    group.add(lampArm);

    const lampShadeGeo = new THREE.CylinderGeometry(0.06, 0.08, Math.min(fw * 0.6, 1.4), 16);
    const lampShade = new THREE.Mesh(lampShadeGeo, this.matBrass);
    lampShade.rotation.z = Math.PI / 2;
    lampShade.position.set(0, fh / 2 + 0.28, 0.25);
    group.add(lampShade);

    // Baked warm gallery glow — emissive lamp shade replaces per-exhibit PointLight
    lampShade.material = new THREE.MeshStandardMaterial({
      color: 0xc9a84c,
      roughness: 0.3,
      metalness: 0.7,
      emissive: new THREE.Color(0xfff5dd),
      emissiveIntensity: 0.6
    });
    // 6. Brushed brass title plaque below the frame
    const plaqueCanvas = document.createElement('canvas');
    plaqueCanvas.width = 1200;
    plaqueCanvas.height = 240;
    const pctx = plaqueCanvas.getContext('2d');

    // Rich brushed brass metallic gradient
    const grad = pctx.createLinearGradient(0, 0, 1200, 0);
    grad.addColorStop(0, '#a37e28');
    grad.addColorStop(0.25, '#d4af37');
    grad.addColorStop(0.5, '#fae08c');
    grad.addColorStop(0.75, '#d4af37');
    grad.addColorStop(1, '#946d1b');
    pctx.fillStyle = grad;
    pctx.fillRect(0, 0, 1200, 240);

    // Dual decorative border
    pctx.strokeStyle = '#5a3d08';
    pctx.lineWidth = 6;
    pctx.strokeRect(6, 6, 1188, 228);
    pctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    pctx.lineWidth = 2;
    pctx.strokeRect(14, 14, 1172, 212);

    // Year / Date Badge
    pctx.fillStyle = '#452603';
    pctx.textAlign = 'center';
    pctx.textBaseline = 'middle';
    pctx.font = 'bold 36px "Inter", sans-serif';
    pctx.fillText(`★ ${date || year} ★`, 600, 52);

    // Main Title (Auto-scaling for perfect fit)
    let fontSize = 38;
    pctx.font = `bold ${fontSize}px "Inter", sans-serif`;
    while (pctx.measureText(title).width > 1120 && fontSize > 18) {
      fontSize -= 2;
      pctx.font = `bold ${fontSize}px "Inter", sans-serif`;
    }
    pctx.shadowColor = 'rgba(255, 255, 255, 0.6)';
    pctx.shadowOffsetY = 1;
    pctx.shadowBlur = 1;
    pctx.fillText(title, 600, 125);

    // Category / Historical note
    pctx.shadowBlur = 0;
    pctx.fillStyle = '#684507';
    pctx.font = 'italic 500 24px "Inter", sans-serif';
    pctx.fillText(category, 600, 185);

    const plaqueTex = new THREE.CanvasTexture(plaqueCanvas);
    plaqueTex.colorSpace = THREE.SRGBColorSpace;
    plaqueTex.anisotropy = 8;

    const plaqueW = Math.min(fw * 0.95, 2.6);
    const plaqueH = 0.42;
    const plaqueMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(plaqueW, plaqueH),
      new THREE.MeshStandardMaterial({
        map: plaqueTex,
        roughness: 0.28,
        metalness: 0.85,
        polygonOffset: true,
        polygonOffsetFactor: -1.0,
        polygonOffsetUnits: -1.0
      })
    );
    plaqueMesh.position.set(0, -(fh / 2 + 0.30), 0.076);
    group.add(plaqueMesh);

    // Store metadata for raycasting & lightbox inspection
    group.userData = {
      isHCMExhibit: true,
      exhibitId: id,
      exhibitData: item,
      exhibitType: 'real'
    };
    group.name = `HCM_Exhibit_${id}`;

    this.hcmMeshes.push(group);
    this.hcmMap.set(id, { mesh: group, data: item });

    return group;
  }

  /**
   * Get all interactive meshes for raycasting
   */
  getInteractiveMeshes() {
    return this.hcmMeshes;
  }

  /**
   * Get exhibit data by ID
   */
  getExhibitData(id) {
    const entry = this.hcmMap.get(id);
    return entry ? entry.data : null;
  }
}
