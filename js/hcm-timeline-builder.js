import * as THREE from 'three';

/**
 * HCM Timeline Builder
 * Mounts "Hành trình ra đi tìm đường cứu nước" photos on the EAST wall
 * (left wall when entering from the main museum).
 *
 * Layout: Simple gallery-style — photos hung in 2 rows with proper spacing.
 * Each photo has a small brass plaque underneath showing date & event name.
 *
 * East wall: X = 21.25, Z = 44 → 80, facing West (rotY = -π/2)
 */
export class HCMTimelineBuilder {
  constructor(scene) {
    this.scene = scene;
    this.textureLoader = new THREE.TextureLoader();
    this.loadedTextures = new Map();
    this.timelineMeshes = [];
    this.timelineMap = new Map();
    this.timelineData = null;
  }

  async loadData() {
    try {
      const resp = await fetch('assets/hcm_timeline_data.json?v=chuanhoa_v1');
      this.timelineData = await resp.json();
      console.log(`HCM Timeline data loaded: ${this.timelineData.events.length} events`);
      return this.timelineData;
    } catch (err) {
      console.error('Failed to load HCM Timeline data:', err);
      return null;
    }
  }

  getOrLoadTexture(url) {
    if (!url) return null;
    if (this.loadedTextures.has(url)) return this.loadedTextures.get(url);
    const texture = this.textureLoader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.anisotropy = 8;
        tex.needsUpdate = true;
      },
      undefined,
      (err) => console.warn(`Timeline texture load failed: ${url}`, err)
    );
    this.loadedTextures.set(url, texture);
    return texture;
  }

  buildAllTimelineExhibits(onProgress) {
    if (!this.timelineData || !this.timelineData.events) return null;

    const group = new THREE.Group();
    group.name = 'HCMTimeline';

    const events = this.timelineData.events;
    const total = events.length;
    console.log(`Timeline: rendering all ${total} standardized milestones on East wall`);

    // --- TIMELINE HEADER ---
    this.buildTimelineHeader(group);

    // --- LAYOUT: 3 rows on East wall ---
    // East wall: X = 21.18, Z = 43.5 → 79.5, facing West (rotY = -π/2)
    // Available wall length: ~36m
    // 67 milestones divided into 3 chronological tiers:
    // Row 1 (top):    23 events (0 to 22: 1890 - 1928, Tuổi thơ & Tìm đường cứu nước), Y = 5.5
    // Row 2 (middle): 22 events (23 to 44: 1929 - 1945, Sáng lập Đảng & CMT8 thành công), Y = 3.6
    // Row 3 (bottom): 22 events (45 to 66: 1946 - 1987, Kháng chiến, Di chúc & Vinh danh), Y = 1.7

    const startZ = 43.5;
    const endZ = 79.5;
    const wallLen = endZ - startZ;

    const row1Items = events.slice(0, 23);
    const row2Items = events.slice(23, 45);
    const row3Items = events.slice(45, 67);

    // Frame size: width 1.15m, height 0.82m with ~45-50cm gaps between frames
    const photoW = 1.15;
    const photoH = 0.82;

    const rows = [
      { items: row1Items, y: 5.5 },
      { items: row2Items, y: 3.6 },
      { items: row3Items, y: 1.7 }
    ];

    let created = 0;
    rows.forEach(row => {
      const count = row.items.length;
      const spacing = wallLen / count;
      row.items.forEach((evt, idx) => {
        const z = startZ + spacing * (idx + 0.5);
        const exhibit = this.createPhotoExhibit(evt, photoW, photoH);
        exhibit.position.set(21.18, row.y, z);
        exhibit.rotation.y = -Math.PI / 2; // facing West
        group.add(exhibit);
        created++;
        if (onProgress) onProgress(created, total);
      });
    });

    this.scene.add(group);
    console.log(`Timeline: mounted ${created}/${total} standardized photos on East wall (3 rows)`);
    return group;
  }

  buildTimelineHeader(parent) {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0d0f1a';
    ctx.fillRect(0, 0, 2048, 320);

    // Gold accents
    ctx.fillStyle = '#d4af37';
    ctx.fillRect(0, 0, 14, 320);
    ctx.fillRect(2034, 0, 14, 320);

    // Star
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 44px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★ ★ ★', 1024, 60);

    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px "Inter", sans-serif';
    ctx.fillText('HÀNH TRÌNH RA ĐI TÌM ĐƯỜNG CỨU NƯỚC', 1024, 150);

    // Subtitle
    ctx.fillStyle = '#fbbf24';
    ctx.font = '500 28px "Inter", sans-serif';
    ctx.fillText('Lược sử cuộc đời và sự nghiệp Chủ tịch Hồ Chí Minh (1890 – 1969)', 1024, 230);

    // Bottom gold line
    ctx.fillStyle = '#d4af37';
    ctx.fillRect(120, 290, 1808, 4);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;

    const geo = new THREE.PlaneGeometry(14.0, 1.15);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      map: tex,
      emissive: new THREE.Color(0x0d0f1a),
      emissiveIntensity: 0.12,
      roughness: 0.35,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -1.0
    }));
    mesh.position.set(21.16, 7.15, 61.5);
    mesh.rotation.y = -Math.PI / 2;
    parent.add(mesh);

    // Simple gold frame
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(14.2, 1.35, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.85 })
    );
    frame.position.set(21.20, 7.15, 61.5);
    frame.rotation.y = -Math.PI / 2;
    parent.add(frame);
  }

  /**
   * Create a single framed photo with date plaque — simple gallery style
   */
  createPhotoExhibit(evt, photoW, photoH) {
    const group = new THREE.Group();

    // 1. Simple dark frame
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.5,
      metalness: 0.1
    });
    const frameGeo = new THREE.BoxGeometry(photoW + 0.12, photoH + 0.12, 0.06);
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    group.add(frameMesh);

    // 2. Gold inner edge (thin)
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.3,
      metalness: 0.85
    });
    const innerGeo = new THREE.BoxGeometry(photoW + 0.04, photoH + 0.04, 0.065);
    const innerMesh = new THREE.Mesh(innerGeo, goldMat);
    group.add(innerMesh);

    // 3. Photo texture
    if (evt.img) {
      const texture = this.getOrLoadTexture(evt.img);
      if (texture) {
        const photoMat = new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.4,
          metalness: 0.05,
          polygonOffset: true,
          polygonOffsetFactor: -1.0,
          polygonOffsetUnits: -1.0
        });
        const photoGeo = new THREE.PlaneGeometry(photoW - 0.06, photoH - 0.06);
        const photoMesh = new THREE.Mesh(photoGeo, photoMat);
        photoMesh.position.z = 0.04;
        group.add(photoMesh);
      }
    }

    // 4. Small brass plaque with date + event name
    const plaqueCanvas = document.createElement('canvas');
    plaqueCanvas.width = 700;
    plaqueCanvas.height = 160;
    const pctx = plaqueCanvas.getContext('2d');

    // Brass gradient
    const grad = pctx.createLinearGradient(0, 0, 700, 0);
    grad.addColorStop(0, '#a37e28');
    grad.addColorStop(0.3, '#d4af37');
    grad.addColorStop(0.5, '#f0d87a');
    grad.addColorStop(0.7, '#d4af37');
    grad.addColorStop(1, '#946d1b');
    pctx.fillStyle = grad;
    pctx.fillRect(0, 0, 700, 160);

    // Border
    pctx.strokeStyle = '#5a3d08';
    pctx.lineWidth = 3;
    pctx.strokeRect(3, 3, 694, 154);

    // Year/Date
    pctx.fillStyle = '#452603';
    pctx.font = 'bold 30px "Inter", sans-serif';
    pctx.textAlign = 'left';
    pctx.textBaseline = 'middle';
    pctx.fillText(evt.date || evt.year, 20, 42);

    // Event title (word-wrap)
    let fontSize = 22;
    pctx.font = `bold ${fontSize}px "Inter", sans-serif`;
    const maxW = 660;
    const words = evt.title.split(' ');
    let lines = [];
    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      if (pctx.measureText(testLine).width > maxW) {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    lines = lines.slice(0, 2);

    pctx.fillStyle = '#452603';
    pctx.shadowColor = 'rgba(255, 255, 255, 0.4)';
    pctx.shadowOffsetY = 1;
    pctx.shadowBlur = 1;
    lines.forEach((line, i) => {
      pctx.fillText(line, 20, 90 + i * (fontSize + 6));
    });

    const plaqueTex = new THREE.CanvasTexture(plaqueCanvas);
    plaqueTex.colorSpace = THREE.SRGBColorSpace;

    const plaqueW = photoW * 0.9;
    const plaqueH = 0.24;
    const plaqueMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(plaqueW, plaqueH),
      new THREE.MeshStandardMaterial({
        map: plaqueTex,
        roughness: 0.28,
        metalness: 0.8,
        polygonOffset: true,
        polygonOffsetFactor: -1.0,
        polygonOffsetUnits: -1.0
      })
    );
    plaqueMesh.position.set(0, -(photoH / 2 + 0.20), 0.04);
    group.add(plaqueMesh);

    // Per-exhibit PointLight removed for performance — shared track lights illuminate the wall

    // Metadata for raycasting
    group.userData = {
      isTimelineEvent: true,
      eventId: evt.id,
      eventData: evt
    };
    group.name = `Timeline_${evt.id}`;

    this.timelineMeshes.push(group);
    this.timelineMap.set(evt.id, { mesh: group, data: evt });

    return group;
  }

  getInteractiveMeshes() {
    return this.timelineMeshes;
  }

  getEventData(id) {
    const entry = this.timelineMap.get(id);
    return entry ? entry.data : null;
  }
}
