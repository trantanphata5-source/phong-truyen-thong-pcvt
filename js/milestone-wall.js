import * as THREE from 'three';

const FONT_FAMILY = '"Be Vietnam Pro", system-ui, sans-serif';

/**
 * MilestoneWallBuilder (Vách mốc son Khu 3)
 * Theo SUA_LOI_GD5.md (Mục A):
 * - Vách partition_k3: nền trắng sáng, dải đầu vách màu gradient #1E40A0 → #2D55C8, chữ trắng (không còn ngôi sao)
 * - Đường dòng thời gian xanh EVN #1E40A0
 * - Bảng thông tin mốc son: nền trắng, viền xanh EVN, chữ tương phản rõ nét
 * - Mặt Tây (rotY = -π/2, nhìn từ sảnh/lối vào): 3 mốc son lịch sử
 * - Mặt Đông (rotY = +π/2): 7 sự kiện trọng đại, ảnh khổ lớn 1 tầng ở y = 2.6m
 */
export class MilestoneWallBuilder {
  constructor(scene, exhibitBuilder) {
    this.scene = scene;
    this.exhibitBuilder = exhibitBuilder;

    // Materials
    this.matGold = new THREE.MeshStandardMaterial({
      color: 0x1e40a0,
      metalness: 0.8,
      roughness: 0.25
    });

    this.matEvnTimeline = new THREE.MeshStandardMaterial({
      color: 0x1e40a0,
      emissive: new THREE.Color(0x1e40a0),
      emissiveIntensity: 0.35,
      roughness: 0.3,
      metalness: 0.4
    });

    this.matDarkPanel = new THREE.MeshStandardMaterial({
      color: 0xf4f7fb,
      roughness: 0.6,
      metalness: 0.1
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

    // 1.1 Dòng đầu "CHẶNG ĐƯỜNG MỚI" ở y = 5.2
    this.addHeaderBanner(westGroup, xWest, 5.2, 0, rotYWest, 'CHẶNG ĐƯỜNG MỚI');

    // 1.2 Đường dòng thời gian xanh EVN ở y = 2.25, chạy từ z = -10.5 đến +10.5
    const ledLength = 21.0;
    const ledGeo = new THREE.CylinderGeometry(0.035, 0.035, ledLength, 16);
    const ledMesh = new THREE.Mesh(ledGeo, this.matEvnTimeline);
    ledMesh.rotation.x = Math.PI / 2;
    ledMesh.position.set(xWest, 2.25, 0);
    westGroup.add(ledMesh);

    // 3 Mốc son chi tiết
    const milestones = [
      {
        index: 1,
        z: -7.5,
        date: '04/08/2025',
        title: 'CÔNG BỐ QUYẾT ĐỊNH THÀNH LẬP',
        subtitle: 'Công ty Điện lực Vũng Tàu',
        descExtra: 'Theo Quyết định số 186/QĐ-EVNSPC của EVNSPC',
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
        title: 'ĐỒNG CHÍ NGUYỄN NGỌC TUYẾN',
        subtitle: 'Nhận nhiệm vụ Giám đốc Công ty (từ 01/01/2026)',
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
        title: 'KỶ NIỆM 1 NĂM THÀNH LẬP',
        subtitle: 'Công ty Điện lực Vũng Tàu',
        descExtra: 'Đánh dấu chặng đường 1 năm xây dựng, ổn định và phát triển bền vững',
        mainId: 'pcvt_069_2026-07-01',
        smallIds: ['pcvt_070_2026-07-01', 'pcvt_071_2026-07-01'],
        mainSize: { w: 3.2, h: 1.8 },
        mainOffsetZ: -1.0,
        smallOffsetZ: 1.7
      }
    ];

    milestones.forEach(m => {
      // Node trên đường timeline (y = 2.25)
      const nodeGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.08, 24);
      const nodeMesh = new THREE.Mesh(nodeGeo, this.matEvnTimeline);
      nodeMesh.rotation.z = Math.PI / 2;
      nodeMesh.position.set(xWest - 0.01, 2.25, m.z);
      westGroup.add(nodeMesh);

      const nodeCore = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.09, 24), this.matEvnTimeline);
      nodeCore.rotation.z = Math.PI / 2;
      nodeCore.position.set(xWest - 0.015, 2.25, m.z);
      westGroup.add(nodeCore);

      // Ảnh chính tại y = 3.60
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
      mainExhibit.position.set(xWest, 3.60, m.z + m.mainOffsetZ);
      westGroup.add(mainExhibit);
      if (onExhibitDone) onExhibitDone();

      // Các ảnh nhỏ xếp bên cạnh
      if (m.smallIds && m.smallIds.length > 0) {
        if (m.smallIds.length === 1) {
          // 1 ảnh nhỏ (Mốc 2) tại y = 3.60
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
          smExhibit.position.set(xWest, 3.60, m.z + m.smallOffsetZ);
          westGroup.add(smExhibit);
          if (onExhibitDone) onExhibitDone();
        } else {
          // 2 ảnh nhỏ xếp chồng tại y = 4.15 và y = 3.05
          const yOffsets = [4.15, 3.05];
          m.smallIds.slice(0, 2).forEach((smId, idx) => {
            const smItem = itemsById.get(smId) || {
              id: smId,
              source: 'pcvt',
              khu: 'khu3',
              new_name: `${smId}.jpg`,
              caption: m.title,
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

      // Bảng thông tin mốc son tích hợp (y = 1.35, cao 1.30m)
      this.addMilestoneCard(westGroup, xWest, 1.35, m.z, rotYWest, m);
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

    // Nền gradient xanh EVN #1E40A0 → #2D55C8
    const grad = ctx.createLinearGradient(0, 0, 1200, 0);
    grad.addColorStop(0, '#1E40A0');
    grad.addColorStop(1, '#2D55C8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1200, 160);

    // Viền xanh nhạt
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, 1188, 148);

    ctx.fillStyle = '#ffffff';
    ctx.font = `900 48px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '8px';
    // Thay thế bằng •
    ctx.fillText(`•  ${text}  •`, 600, 80);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      metalness: 0.3,
      roughness: 0.3,
      emissive: new THREE.Color(0x1e40a0),
      emissiveIntensity: 0.2
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 0.8), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    parent.add(mesh);
  }

  addMilestoneCard(parent, x, y, z, rotY, m) {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 420;
    const ctx = canvas.getContext('2d');

    // 1. Nền card bo góc sang trọng - Tông sáng trắng thanh lịch
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(8, 8, 1184, 404, 16);
    ctx.fill();

    // Viền xanh EVN #1E40A0
    ctx.strokeStyle = '#1e40a0';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Viền trong mảnh xanh cyan #38BDF8
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(18, 18, 1164, 384, 12);
    ctx.stroke();

    // 2. Badge ngày tháng nổi bật ở đỉnh card
    const badgeW = 420;
    const badgeH = 64;
    const badgeX = (1200 - badgeW) / 2;
    const badgeY = 28;

    const grad = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeW, badgeY + badgeH);
    grad.addColorStop(0, '#1E40A0');
    grad.addColorStop(1, '#2D55C8');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 32);
    ctx.fill();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Chữ ngày tháng màu trắng nổi bật
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 38px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(m.date, 600, badgeY + badgeH / 2);

    // 3. Đường kẻ trang trí ngăn cách
    ctx.strokeStyle = 'rgba(30, 64, 160, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(200, 118);
    ctx.lineTo(1000, 118);
    ctx.stroke();

    // 4. Tiêu đề chính (Xanh EVN đậm, font 800 36px)
    ctx.fillStyle = '#1e40a0';
    ctx.font = `800 36px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(m.title, 600, 172);

    // 5. Phụ đề (Màu xanh đậm #0f172a, font 600 28px)
    if (m.subtitle) {
      ctx.fillStyle = '#0f172a';
      ctx.font = `600 28px ${FONT_FAMILY}`;
      ctx.fillText(m.subtitle, 600, 240);
    }

    // 6. Ghi chú sự kiện / chi tiết (Màu xám đậm #475569, font 500 22px)
    if (m.descExtra) {
      ctx.fillStyle = '#475569';
      ctx.font = `500 22px ${FONT_FAMILY}`;
      ctx.fillText(m.descExtra, 600, 315);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      metalness: 0.2,
      roughness: 0.35
    });

    // Kích thước card trong 3D: rộng 3.8m, cao 1.30m
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 1.30), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    parent.add(mesh);

    // Thanh liên kết đứng từ Node timeline (y=2.25) xuống đỉnh Card
    const cardTopY = y + 1.30 / 2;
    const nodeY = 2.25;
    const pinH = nodeY - cardTopY;
    if (pinH > 0.05) {
      const pinGeo = new THREE.CylinderGeometry(0.02, 0.02, pinH, 16);
      const pinMesh = new THREE.Mesh(pinGeo, this.matEvnTimeline);
      pinMesh.position.set(x - 0.01, cardTopY + pinH / 2, z);
      parent.add(pinMesh);
    }
  }
}
