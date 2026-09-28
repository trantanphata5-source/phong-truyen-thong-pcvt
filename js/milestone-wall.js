import * as THREE from 'three';

const FONT_FAMILY = '"Be Vietnam Pro", system-ui, sans-serif';

/**
 * MilestoneWallBuilder (Vách mốc son Khu 3)
 * Theo SUA_LOI_GD3_LAN2.md (Mục D):
 * - Vách partition_k3: tâm (35, 0), dài 24m (z từ -12 đến 12), dày 0.6m, cao 6.8m
 * - Mặt Tây (rotY = -π/2, nhìn từ sảnh/lối vào): 3 mốc son lịch sử
 * - Mặt Đông (rotY = +π/2): 7 sự kiện trọng đại, ảnh khổ lớn 1 tầng ở y = 2.6m
 */
export class MilestoneWallBuilder {
  constructor(scene, exhibitBuilder) {
    this.scene = scene;
    this.exhibitBuilder = exhibitBuilder;

    // Materials
    this.matGold = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      metalness: 0.85,
      roughness: 0.25
    });

    this.matCyanLED = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: new THREE.Color(0x22d3ee),
      emissiveIntensity: 1.2,
      roughness: 0.2,
      metalness: 0.1
    });

    this.matDarkPanel = new THREE.MeshStandardMaterial({
      color: 0x090e1a,
      roughness: 0.7,
      metalness: 0.2
    });
  }

  build(group, rawItems, onExhibitDone) {
    const itemsById = new Map();
    rawItems.forEach(it => itemsById.set(it.id, it));

    // =========================================================================
    // 1. MẶT TÂY — 3 MỐC SON (x = 35 - 0.3 = 34.7, hướng Tây nx = -1)
    // =========================================================================
    const westGroup = new THREE.Group();
    westGroup.name = 'MilestoneWall_West';
    const xWest = 35.0 - 0.3 - 0.05; // 34.65
    const rotYWest = -Math.PI / 2;

    // 1.1 Dòng đầu "CHẶNG ĐƯỜNG MỚI" ở y = 5.1
    this.addHeaderBanner(westGroup, xWest, 5.1, 0, rotYWest, 'CHẶNG ĐƯỜNG MỚI');

    // 1.2 Đường LED dòng thời gian ở y = 2.2, chạy từ z = -10.5 đến +10.5
    const ledLength = 21.0;
    const ledGeo = new THREE.CylinderGeometry(0.04, 0.04, ledLength, 16);
    const ledMesh = new THREE.Mesh(ledGeo, this.matCyanLED);
    ledMesh.rotation.x = Math.PI / 2;
    ledMesh.position.set(xWest, 2.2, 0);
    westGroup.add(ledMesh);

    // 3 Mốc son chi tiết
    const milestones = [
      {
        index: 1,
        z: -7.5,
        date: '04/08/2025',
        title: 'Công bố Quyết định thành lập',
        subtitle: 'Công ty Điện lực Vũng Tàu',
        mainId: 'pcvt_003_2025-08-04',
        smallIds: ['pcvt_004_2025-08-04', 'pcvt_005_2025-08-04'],
        mainSize: { w: 3.2, h: 1.8 },
        mainOffsetZ: -1.0,
        smallOffsetZ: 1.7
      },
      {
        index: 2,
        z: 0.0,
        date: '01/01/2026',
        title: 'Đồng chí Nguyễn Ngọc Tuyến',
        subtitle: 'nhận nhiệm vụ Giám đốc Công ty',
        descExtra: 'Lễ công bố và trao quyết định cán bộ – 16/01/2026',
        mainId: 'moc2_01',
        smallIds: ['moc2_02'],
        mainSize: { w: 2.6, h: 1.5 },
        mainOffsetZ: -0.9,
        smallOffsetZ: 1.3
      },
      {
        index: 3,
        z: 7.5,
        date: '01/07/2026',
        title: 'Kỷ niệm 1 năm thành lập',
        subtitle: 'Công ty Điện lực Vũng Tàu',
        mainId: 'pcvt_069_2026-07-01',
        smallIds: ['pcvt_070_2026-07-01', 'pcvt_071_2026-07-01'],
        mainSize: { w: 3.2, h: 1.8 },
        mainOffsetZ: -1.0,
        smallOffsetZ: 1.7
      }
    ];

    milestones.forEach(m => {
      // Node LED trên đường timeline
      const nodeGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.08, 24);
      const nodeMesh = new THREE.Mesh(nodeGeo, this.matGold);
      nodeMesh.rotation.z = Math.PI / 2;
      nodeMesh.position.set(xWest - 0.01, 2.2, m.z);
      westGroup.add(nodeMesh);

      const nodeCore = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.09, 24), this.matCyanLED);
      nodeCore.rotation.z = Math.PI / 2;
      nodeCore.position.set(xWest - 0.015, 2.2, m.z);
      westGroup.add(nodeCore);

      // Ảnh chính tại y = 3.5
      const mainItem = itemsById.get(m.mainId) || {
        id: m.mainId,
        source: 'pcvt',
        khu: 'khu3',
        new_name: `${m.mainId}.jpg`,
        caption: `${m.date} • ${m.title}`,
        wall_path: `assets/wall/khu3/${m.mainId}.jpg`,
        aspect_ratio: m.mainSize.w / m.mainSize.h
      };

      const mainExhibit = this.exhibitBuilder.createFramedExhibit(
        mainItem,
        { w: m.mainSize.w, h: m.mainSize.h, frameType: 'gold_honor' },
        rotYWest
      );
      mainExhibit.position.set(xWest, 3.5, m.z + m.mainOffsetZ);
      westGroup.add(mainExhibit);
      if (onExhibitDone) onExhibitDone();

      // Các ảnh nhỏ xếp bên cạnh
      if (m.smallIds && m.smallIds.length > 0) {
        if (m.smallIds.length === 1) {
          // 1 ảnh nhỏ (Mốc 2)
          const smItem = itemsById.get(m.smallIds[0]) || {
            id: m.smallIds[0],
            source: 'pcvt',
            khu: 'khu3',
            new_name: `${m.smallIds[0]}.jpg`,
            caption: m.descExtra || m.title,
            wall_path: `assets/wall/khu3/${m.smallIds[0]}.jpg`,
            aspect_ratio: 1.466
          };
          const smExhibit = this.exhibitBuilder.createFramedExhibit(
            smItem,
            { w: 1.4, h: 0.95, frameType: 'cert' },
            rotYWest
          );
          smExhibit.position.set(xWest, 3.5, m.z + m.smallOffsetZ);
          westGroup.add(smExhibit);
          if (onExhibitDone) onExhibitDone();
        } else {
          // 2 ảnh nhỏ xếp chồng (y = 4.0 và y = 3.0)
          const yOffsets = [4.0, 3.0];
          m.smallIds.forEach((smId, idx) => {
            const smItem = itemsById.get(smId) || {
              id: smId,
              source: 'pcvt',
              khu: 'khu3',
              new_name: `${smId}.jpg`,
              caption: `${m.date} • ${m.title}`,
              wall_path: `assets/wall/khu3/${smId}.jpg`,
              aspect_ratio: 1.333
            };
            const smExhibit = this.exhibitBuilder.createFramedExhibit(
              smItem,
              { w: 1.3, h: 0.82, frameType: 'cert' },
              rotYWest
            );
            smExhibit.position.set(xWest, yOffsets[idx], m.z + m.smallOffsetZ);
            westGroup.add(smExhibit);
            if (onExhibitDone) onExhibitDone();
          });
        }
      }

      // Ngày tháng lớn (font weight 900) ở y = 1.75
      this.addDateText(westGroup, xWest, 1.75, m.z, rotYWest, m.date);

      // Mô tả ở y = 1.30
      this.addDescText(westGroup, xWest, 1.30, m.z, rotYWest, m.title, m.subtitle, m.descExtra);
    });

    group.add(westGroup);

    // =========================================================================
    // 2. MẶT ĐÔNG — 7 SỰ KIỆN TRỌNG ĐẠI (x = 35 + 0.3 = 35.3, hướng Đông nx = +1)
    // 1 tầng ở y = 2.6m, chiều cao khung 1.3m, lề mỗi đầu 1.2m
    // =========================================================================
    const eastGroup = new THREE.Group();
    eastGroup.name = 'MilestoneWall_East';
    const xEast = 35.0 + 0.3 + 0.05; // 35.35
    const rotYEast = Math.PI / 2;

    const eastEvents = [
      'pcvt_009_2025-08-13',     // 13/08/2025: Đoàn công tác Tổng công ty Điện lực TP.HCM
      'pcvt_012_2025-08-27',     // 27/08/2025: Đoàn công tác do ông Phạm Quốc Bảo dẫn đầu
      'pcvt_014_2025-08-29',     // 29/08/2025: Hội nghị đối thoại người lao động
      'dang_bo_001_2026-02-06',  // 06/02/2026: Đảng bộ học tập, quán triệt Nghị quyết
      'pcvt_049_2026-04-03',     // 02/04/2026: Đoàn công tác Tổng công ty làm việc tại Vũng Tàu
      'pcvt_080_2026-07-16',     // 16/07/2026: Hội nghị sơ kết 6 tháng đầu năm
      'pcvt_075_2026-07-08'      // 08/07/2026: Điện lực Đặc khu Côn Đảo – dấu mốc mới
    ];

    const wallLength = 24.0;
    const endMargin = 1.2;
    const usableLength = wallLength - 2 * endMargin; // 21.6m
    const nEast = eastEvents.length;
    const gapEast = usableLength / (nEast + 1);

    eastEvents.forEach((id, idx) => {
      const it = itemsById.get(id);
      if (!it) return;

      const zPos = -wallLength / 2 + endMargin + (idx + 1) * gapEast;
      const ar = it.aspect_ratio || 1.4;
      const h = 1.3;
      const w = h * ar;

      const exhibit = this.exhibitBuilder.createFramedExhibit(
        it,
        { w, h, frameType: 'gold_honor' },
        rotYEast
      );
      exhibit.position.set(xEast, 2.6, zPos);
      eastGroup.add(exhibit);
      if (onExhibitDone) onExhibitDone();
    });

    group.add(eastGroup);
  }

  addHeaderBanner(parent, x, y, z, rotY, text) {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#090e1a';
    ctx.fillRect(0, 0, 1200, 160);

    // Viền vàng và hoa văn
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, 1188, 148);

    ctx.fillStyle = '#facc15';
    ctx.font = `900 48px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '8px';
    ctx.fillText(`★  ${text}  ★`, 600, 80);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      metalness: 0.6,
      roughness: 0.3,
      emissive: new THREE.Color(0xfacc15),
      emissiveIntensity: 0.2
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 0.8), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    parent.add(mesh);
  }

  addDateText(parent, x, y, z, rotY, dateStr) {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0a1020';
    ctx.fillRect(0, 0, 640, 128);

    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 632, 120);

    ctx.fillStyle = '#ffffff';
    ctx.font = `900 46px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 8;
    ctx.fillText(dateStr, 320, 64);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      metalness: 0.7,
      roughness: 0.25,
      emissive: new THREE.Color(0x22d3ee),
      emissiveIntensity: 0.25
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.48), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    parent.add(mesh);
  }

  addDescText(parent, x, y, z, rotY, title, subtitle, extra) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(10, 16, 32, 0.95)';
    ctx.fillRect(0, 0, 1024, 256);

    ctx.strokeStyle = 'rgba(250, 204, 21, 0.4)';
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, 1012, 244);

    ctx.fillStyle = '#fde047';
    ctx.font = `700 32px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, 512, 60);

    if (subtitle) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `600 28px ${FONT_FAMILY}`;
      ctx.fillText(subtitle, 512, 115);
    }

    if (extra) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = `500 24px ${FONT_FAMILY}`;
      ctx.fillText(extra, 512, 175);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      metalness: 0.5,
      roughness: 0.4,
      transparent: true
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    parent.add(mesh);
  }
}
