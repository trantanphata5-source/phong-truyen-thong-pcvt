import * as THREE from 'three';

/**
 * Exhibit Builder (Artsteps Standard)
 * Precision 3D mounting for all 205 items (129 Certificates & 76 Flags)
 * Ensures 100% of items are placed on walls/partitions without overflow
 */
export class ExhibitBuilder {
  constructor(scene) {
    this.scene = scene;
    this.textureLoader = new THREE.TextureLoader();
    this.loadedTextures = new Map();
    this.exhibitMeshes = [];
    this.exhibitMap = new Map();

    this.initSharedResources();
  }

  initSharedResources() {
    // Gold Frame Material
    this.matGoldFrame = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.35,
      metalness: 0.8,
      name: 'GoldFrame'
    });

    // Dark Rosewood / Mahogany Frame
    this.matWoodFrame = new THREE.MeshStandardMaterial({
      color: 0x241810,
      roughness: 0.5,
      metalness: 0.1,
      name: 'WoodFrame'
    });

    // White Matte Border
    this.matMatte = new THREE.MeshStandardMaterial({
      color: 0xfafafa,
      roughness: 0.9,
      metalness: 0.0
    });

    // Museum Protective Glass (Lightweight, depthWrite: false to completely eliminate Z-fighting)
    this.matGlass = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.08,
      roughness: 0.15,
      metalness: 0.05,
      depthWrite: false
    });

    // Brass Plaque
    this.matBrass = new THREE.MeshStandardMaterial({
      color: 0xe2b755,
      roughness: 0.3,
      metalness: 0.9
    });

    // Flag Top Wooden Bar & Gold Fringe
    this.matFlagBar = new THREE.MeshStandardMaterial({
      color: 0x451a03,
      roughness: 0.4,
      metalness: 0.1
    });

    this.matFlagFringe = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.5,
      metalness: 0.6
    });

    this.matGold = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.3,
      metalness: 0.85
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
      },
      undefined,
      (err) => {
        console.warn(`Texture load failed for ${url}:`, err);
      }
    );
    this.loadedTextures.set(url, texture);
    return texture;
  }

  buildAllExhibits(items, onProgress) {
    const exhibitsGroup = new THREE.Group();
    exhibitsGroup.name = 'AllExhibits';

    const hall1Items = items.filter(it => it.hall_id === 'hall_1');
    const hall2Items = items.filter(it => it.hall_id === 'hall_2');
    const hall3Items = items.filter(it => it.hall_id === 'hall_3');

    let totalCreated = 0;
    const totalCount = items.length;

    const itemMounted = () => {
      totalCreated++;
      if (onProgress) onProgress(totalCreated, totalCount);
    };

    // 1. Mount Hall 1 (47 items)
    this.layoutHall1(hall1Items, exhibitsGroup, itemMounted);

    // 2. Mount Hall 2 (83 items)
    this.layoutHall2(hall2Items, exhibitsGroup, itemMounted);

    // 3. Mount Hall 3 (75 items)
    this.layoutHall3(hall3Items, exhibitsGroup, itemMounted);

    this.scene.add(exhibitsGroup);
    console.log(`Mounted ${totalCreated}/${totalCount} exhibits in 3D scene successfully!`);
    return exhibitsGroup;
  }

  /**
   * Layout Hall 1: State Honors, EVN & EVNSPC (47 items)
   */
  layoutHall1(items, parent, onItemDone) {
    const ctnItems = items.filter(it => ['CTN', 'TTCP'].includes(it.org));
    const evnItems = items.filter(it => ['EVN', 'BCT'].includes(it.org));
    const evnspcItems = items.filter(it => it.org === 'EVNSPC');

    // 1. Presidential Honors & Prime Minister on North Back Wall (Z = -44.3)
    const ctnStartX = -((ctnItems.length - 1) * 2.8) / 2;
    ctnItems.forEach((item, idx) => {
      const x = ctnStartX + idx * 2.8;
      const y = 3.6;
      const z = -44.3;
      const exhibit = this.createExhibit(item, 1.8, 0);
      exhibit.position.set(x, y, z);
      parent.add(exhibit);
      onItemDone();
    });

    // 2. EVN Items on West Wall of Hall 1 (X = -17.3, Z: -20 to -42)
    // 2 rows: Top y=4.2, Bottom y=2.4
    const evnWallItems = evnItems.slice(0, 14);
    const evnPartitionItems = evnItems.slice(14);

    this.mountTwoRows(evnWallItems, parent, {
      x: -17.3,
      startZ: -21,
      endZ: -41,
      rotY: Math.PI / 2,
      rowYTop: 4.2,
      rowYBottom: 2.3
    }, onItemDone);

    // Remaining EVN items on Center Partition West Face (X = -0.5, Z: -28 to -34, 2 rows of 2 items)
    this.mountTwoRows(evnPartitionItems, parent, {
      x: -0.5,
      startZ: -28.0,
      endZ: -34.0,
      rotY: -Math.PI / 2,
      rowYTop: 3.8,
      rowYBottom: 2.1
    }, onItemDone);

    // 3. EVNSPC Items on East Wall of Hall 1 (X = 17.3, Z: -20 to -42)
    const evnspcWallItems = evnspcItems.slice(0, 14);
    const evnspcPartitionItems = evnspcItems.slice(14);

    this.mountTwoRows(evnspcWallItems, parent, {
      x: 17.3,
      startZ: -21,
      endZ: -41,
      rotY: -Math.PI / 2,
      rowYTop: 4.2,
      rowYBottom: 2.3
    }, onItemDone);

    // Remaining EVNSPC items on Center Partition East Face (X = 0.5, Z: -27 to -35, 2 rows of 3 items)
    this.mountTwoRows(evnspcPartitionItems, parent, {
      x: 0.5,
      startZ: -27.0,
      endZ: -35.0,
      rotY: Math.PI / 2,
      rowYTop: 3.8,
      rowYBottom: 2.1
    }, onItemDone);
  }

  /**
   * Layout Hall 2: BR-VT Province & Local Authorities (83 items)
   */
  layoutHall2(items, parent, onItemDone) {
    const sorted = [...items].sort((a, b) => a.year - b.year || a.title.localeCompare(b.title));

    // Distribution:
    // West Far Wall: 32 items (2 rows of 16)
    // North Wall: 12 items (2 rows of 6)
    // South Wall: 12 items (2 rows of 6)
    // Center Partition West Face: 14 items (2 rows of 7)
    // Center Partition East Face: 13 items (2 rows of 7)
    // Total = 32 + 12 + 12 + 14 + 13 = 83 items!

    const westWallItems = sorted.slice(0, 32);
    const northWallItems = sorted.slice(32, 44);
    const southWallItems = sorted.slice(44, 56);
    const partWestItems = sorted.slice(56, 70);
    const partEastItems = sorted.slice(70, 83);

    // 1. West Far Wall (X = -49.3, Z: -22 to +22)
    this.mountTwoRows(westWallItems, parent, {
      x: -49.3,
      startZ: -21,
      endZ: 21,
      rotY: Math.PI / 2,
      rowYTop: 4.2,
      rowYBottom: 2.3
    }, onItemDone);

    // 2. North Wall (Z = -24.3, X: -46 to -24)
    this.mountTwoRows(northWallItems, parent, {
      z: -24.3,
      startX: -45,
      endX: -25,
      rotY: 0,
      rowYTop: 4.2,
      rowYBottom: 2.3
    }, onItemDone);

    // 3. South Wall (Z = 24.3, X: -46 to -24)
    this.mountTwoRows(southWallItems, parent, {
      z: 24.3,
      startX: -45,
      endX: -25,
      rotY: Math.PI,
      rowYTop: 4.2,
      rowYBottom: 2.3
    }, onItemDone);

    // 4. Center Partition West Face (X = -35.5, Z: -9 to +9)
    this.mountTwoRows(partWestItems, parent, {
      x: -35.5,
      startZ: -9,
      endZ: 9,
      rotY: -Math.PI / 2,
      rowYTop: 3.8,
      rowYBottom: 2.1
    }, onItemDone);

    // 5. Center Partition East Face (X = -34.5, Z: -9 to +9)
    this.mountTwoRows(partEastItems, parent, {
      x: -34.5,
      startZ: -9,
      endZ: 9,
      rotY: Math.PI / 2,
      rowYTop: 3.8,
      rowYBottom: 2.1
    }, onItemDone);
  }

  /**
   * Layout Hall 3: Labor Unions, Competition Flags & Sports (75 items)
   */
  layoutHall3(items, parent, onItemDone) {
    const sorted = [...items].sort((a, b) => a.year - b.year || a.title.localeCompare(b.title));

    // Distribution:
    // East Far Wall: 32 items (2 rows of 16)
    // North Wall: 12 items (2 rows of 6)
    // South Wall: 12 items (2 rows of 6)
    // Center Partition West Face: 10 items (2 rows of 5)
    // Center Partition East Face: 9 items (2 rows of 5)
    // Total = 32 + 12 + 12 + 10 + 9 = 75 items!

    const eastWallItems = sorted.slice(0, 32);
    const northWallItems = sorted.slice(32, 44);
    const southWallItems = sorted.slice(44, 56);
    const partWestItems = sorted.slice(56, 66);
    const partEastItems = sorted.slice(66, 75);

    // 1. East Far Wall (X = 49.3, Z: -22 to +22)
    this.mountTwoRows(eastWallItems, parent, {
      x: 49.3,
      startZ: -21,
      endZ: 21,
      rotY: -Math.PI / 2,
      rowYTop: 4.2,
      rowYBottom: 2.3
    }, onItemDone);

    // 2. North Wall (Z = -24.3, X: 24 to 46)
    this.mountTwoRows(northWallItems, parent, {
      z: -24.3,
      startX: 25,
      endX: 45,
      rotY: 0,
      rowYTop: 4.2,
      rowYBottom: 2.3
    }, onItemDone);

    // 3. South Wall (Z = 24.3, X: 24 to 46)
    this.mountTwoRows(southWallItems, parent, {
      z: 24.3,
      startX: 25,
      endX: 45,
      rotY: Math.PI,
      rowYTop: 4.2,
      rowYBottom: 2.3
    }, onItemDone);

    // 4. Center Partition West Face (X = 34.5, Z: -8 to +8)
    this.mountTwoRows(partWestItems, parent, {
      x: 34.5,
      startZ: -8,
      endZ: 8,
      rotY: -Math.PI / 2,
      rowYTop: 3.8,
      rowYBottom: 2.1
    }, onItemDone);

    // 5. Center Partition East Face (X = 35.5, Z: -8 to +8)
    this.mountTwoRows(partEastItems, parent, {
      x: 35.5,
      startZ: -8,
      endZ: 8,
      rotY: Math.PI / 2,
      rowYTop: 3.8,
      rowYBottom: 2.1
    }, onItemDone);
  }

  /**
   * Mount a list of items across two rows along a wall
   */
  mountTwoRows(items, parent, config, onItemDone) {
    const { x, z, startX, endX, startZ, endZ, rotY, rowYTop, rowYBottom } = config;
    const isAlongZ = typeof x === 'number';

    const row1 = items.filter((_, i) => i % 2 === 0);
    const row2 = items.filter((_, i) => i % 2 !== 0);

    const placeRow = (rowItems, y) => {
      const count = rowItems.length;
      if (count === 0) return;
      const step = count === 1 ? 0 : 1 / (count - 1);

      rowItems.forEach((item, idx) => {
        const t = count === 1 ? 0.5 : idx * step;
        let posX, posZ;

        if (isAlongZ) {
          posX = x;
          posZ = startZ + t * (endZ - startZ);
        } else {
          posX = startX + t * (endX - startX);
          posZ = z;
        }

        const exhibit = this.createExhibit(item, 1.35, rotY);
        exhibit.position.set(posX, y, posZ);
        parent.add(exhibit);
        onItemDone();
      });
    };

    placeRow(row1, rowYTop);
    placeRow(row2, rowYBottom);
  }

  mountLinearSequence(items, parent, config, onItemDone) {
    const { startX, deltaX, startZ, deltaZ, y, rotY } = config;
    items.forEach((item, idx) => {
      const posX = startX + idx * deltaX;
      const posZ = startZ + idx * deltaZ;
      const exhibit = this.createExhibit(item, 1.35, rotY);
      exhibit.position.set(posX, y, posZ);
      parent.add(exhibit);
      onItemDone();
    });
  }

  /**
   * Create either a Certificate Frame or a Flag Pennant
   */
  createExhibit(item, baseDimension = 1.35, rotY = 0) {
    if (item.category === 'CỜ') {
      return this.createFlagPennant(item, baseDimension, rotY);
    } else {
      return this.createCertificateFrame(item, baseDimension, rotY);
    }
  }

  /**
   * Create Certificate Frame
   */
  createCertificateFrame(item, baseWidth = 1.35, rotY = 0) {
    const group = new THREE.Group();
    group.rotation.y = rotY;

    const aspect = item.aspect_ratio || 1.414;
    const width = baseWidth;
    const height = width / aspect;
    const depth = 0.08;

    const isHighHonor = ['CTN', 'TTCP', 'EVN'].includes(item.org);
    const frameMat = isHighHonor ? this.matGoldFrame : this.matWoodFrame;

    // Outer Frame
    const frameGeo = new THREE.BoxGeometry(width + 0.12, height + 0.12, depth);
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    frameMesh.castShadow = true;
    group.add(frameMesh);

    // Inner Rim
    const rimMesh = new THREE.Mesh(new THREE.BoxGeometry(width + 0.03, height + 0.03, depth + 0.01), this.matGold);
    group.add(rimMesh);

    // Matte Border
    const matteMesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.matMatte);
    matteMesh.position.z = depth / 2 + 0.005;
    group.add(matteMesh);

    // Certificate Picture
    const picWidth = width - 0.05;
    const picHeight = height - 0.05;
    const texture = this.getOrLoadTexture(item.thumb_rel_path);
    const picMat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.4,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -1.0
    });
    const picMesh = new THREE.Mesh(new THREE.PlaneGeometry(picWidth, picHeight), picMat);
    picMesh.position.z = depth / 2 + 0.008;
    group.add(picMesh);

    // Protective Glass (depthWrite: false, no Z-fighting)
    const glassMesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.matGlass);
    glassMesh.position.z = depth / 2 + 0.012;
    group.add(glassMesh);

    // Brass Label Plaque
    const plaqueCanvas = document.createElement('canvas');
    plaqueCanvas.width = 256;
    plaqueCanvas.height = 64;
    const pctx = plaqueCanvas.getContext('2d');
    pctx.fillStyle = '#92400e';
    pctx.fillRect(0, 0, 256, 64);
    pctx.strokeStyle = '#fde047';
    pctx.lineWidth = 3;
    pctx.strokeRect(4, 4, 248, 56);
    pctx.fillStyle = '#ffffff';
    pctx.font = 'bold 22px sans-serif';
    pctx.textAlign = 'center';
    pctx.textBaseline = 'middle';
    pctx.fillText(`${item.year} • ${item.org}`, 128, 32);

    const plaqueTex = new THREE.CanvasTexture(plaqueCanvas);
    const plaqueMat = new THREE.MeshStandardMaterial({
      map: plaqueTex,
      metalness: 0.8,
      roughness: 0.3,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -1.0
    });
    const plaqueMesh = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.65, 0.15), plaqueMat);
    plaqueMesh.position.set(0, -height / 2 - 0.13, depth / 2 + 0.008);
    group.add(plaqueMesh);

    // Interactive Hitbox (Precise thin plane positioned directly at front of frame)
    const hitGeo = new THREE.PlaneGeometry(width + 0.1, height + 0.3);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    const hitMesh = new THREE.Mesh(hitGeo, hitMat);
    hitMesh.position.set(0, -0.06, depth / 2 + 0.015);
    hitMesh.userData = {
      isExhibit: true,
      item: item,
      frameMesh: frameMesh
    };
    group.add(hitMesh);

    this.exhibitMeshes.push(hitMesh);
    this.exhibitMap.set(item.id, group);

    group.name = `Exhibit_${item.id}`;
    return group;
  }

  /**
   * Create Flag Pennant
   */
  createFlagPennant(item, baseHeight = 1.35, rotY = 0) {
    const group = new THREE.Group();
    group.rotation.y = rotY;

    const width = 0.95;
    const height = baseHeight;

    // Hanging Bar
    const barGeo = new THREE.CylinderGeometry(0.025, 0.025, width + 0.25, 16);
    const barMesh = new THREE.Mesh(barGeo, this.matFlagBar);
    barMesh.rotation.z = Math.PI / 2;
    barMesh.position.y = height / 2 + 0.03;
    group.add(barMesh);

    // Brass Finials
    const finialGeo = new THREE.SphereGeometry(0.045, 16, 16);
    const leftFinial = new THREE.Mesh(finialGeo, this.matGold);
    leftFinial.position.set(-width / 2 - 0.13, height / 2 + 0.03, 0);
    group.add(leftFinial);

    const rightFinial = new THREE.Mesh(finialGeo, this.matGold);
    rightFinial.position.set(width / 2 + 0.13, height / 2 + 0.03, 0);
    group.add(rightFinial);

    // Hanging Cord
    const cordCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-width / 2 - 0.08, height / 2 + 0.03, 0),
      new THREE.Vector3(0, height / 2 + 0.28, 0),
      new THREE.Vector3(width / 2 + 0.08, height / 2 + 0.03, 0)
    );
    const cordMesh = new THREE.Mesh(new THREE.TubeGeometry(cordCurve, 16, 0.008, 6, false), this.matGold);
    group.add(cordMesh);

    // Flag Cloth Geometry with organic curvature
    const clothGeo = new THREE.PlaneGeometry(width, height, 10, 10);
    const pos = clothGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) / width;
      const v = pos.getY(i) / height;
      const wave = Math.sin(u * Math.PI * 2) * 0.015 * (1 - v);
      pos.setZ(i, wave);
    }
    clothGeo.computeVertexNormals();

    const texture = this.getOrLoadTexture(item.thumb_rel_path);
    const clothMat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.65,
      metalness: 0.1,
      side: THREE.DoubleSide
    });
    const clothMesh = new THREE.Mesh(clothGeo, clothMat);
    clothMesh.castShadow = true;
    group.add(clothMesh);

    // Gold Fringe
    const fringeMesh = new THREE.Mesh(new THREE.BoxGeometry(width + 0.02, 0.04, 0.015), this.matFlagFringe);
    fringeMesh.position.set(0, -height / 2 - 0.02, 0);
    group.add(fringeMesh);

    // Plaque
    const plaqueCanvas = document.createElement('canvas');
    plaqueCanvas.width = 256;
    plaqueCanvas.height = 64;
    const pctx = plaqueCanvas.getContext('2d');
    pctx.fillStyle = '#991b1b';
    pctx.fillRect(0, 0, 256, 64);
    pctx.strokeStyle = '#facc15';
    pctx.lineWidth = 3;
    pctx.strokeRect(4, 4, 248, 56);
    pctx.fillStyle = '#ffffff';
    pctx.font = 'bold 22px sans-serif';
    pctx.textAlign = 'center';
    pctx.textBaseline = 'middle';
    pctx.fillText(`${item.year} • ${item.item_type}`, 128, 32);

    const plaqueTex = new THREE.CanvasTexture(plaqueCanvas);
    const plaqueMat = new THREE.MeshStandardMaterial({ map: plaqueTex, metalness: 0.7, roughness: 0.3 });
    const plaqueMesh = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.7, 0.15), plaqueMat);
    plaqueMesh.position.set(0, -height / 2 - 0.13, 0.02);
    group.add(plaqueMesh);

    // Interactive Hitbox (Precise thin plane directly in front of pennant)
    const hitGeo = new THREE.PlaneGeometry(width + 0.1, height + 0.3);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    const hitMesh = new THREE.Mesh(hitGeo, hitMat);
    hitMesh.position.set(0, -0.06, 0.03);
    hitMesh.userData = {
      isExhibit: true,
      item: item,
      clothMesh: clothMesh
    };
    group.add(hitMesh);

    this.exhibitMeshes.push(hitMesh);
    this.exhibitMap.set(item.id, group);

    group.name = `Flag_${item.id}`;
    return group;
  }
}
