/**
 * PERF – Đo đạc ?bench=1 (TOI_UU_HIEU_NANG.md, mục E3)
 * Đi tự động qua 9 điểm; mỗi điểm vẽ 30 khung rồi ghi số lệnh vẽ, tam giác,
 * thời gian khung trung bình / lớn nhất, số texture, bộ nhớ ảnh ước tính.
 * Thời gian khung đo bằng render() + gl.finish() (gồm cả phần GPU).
 * Tự chứa: chỉ dùng window.THREE và window.app.
 */
const BENCH_POINTS = [
  { id: 1, x: 0, z: 26, dir: 'Bắc' },
  { id: 2, x: 0, z: 10, dir: 'Bắc' },
  { id: 3, x: 0, z: -30, dir: 'Nam' },
  { id: 4, x: 28, z: 0, dir: 'Đông' },
  { id: 5, x: -28, z: 0, dir: 'Tây' },
  { id: 6, x: 0, z: 31, dir: 'Đông' },
  { id: 7, x: 36, z: 45, dir: 'Bắc' },
  { id: 8, x: 0, z: 45, dir: 'Bắc' },
  { id: 9, x: -36, z: 45, dir: 'Bắc' }
];

// Camera dùng Euler 'YXZ': yaw 0 nhìn về -Z (Bắc)
const YAW = { 'Bắc': 0, 'Tây': Math.PI / 2, 'Nam': Math.PI, 'Đông': -Math.PI / 2 };

function estimateTextureMemory(scene) {
  const seen = new Set();
  let bytes = 0;
  scene.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      for (const key of ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'alphaMap']) {
        const t = m[key];
        if (!t || seen.has(t.uuid)) continue;
        seen.add(t.uuid);
        const img = t.image;
        const w = img?.naturalWidth || img?.videoWidth || img?.width || 0;
        const h = img?.naturalHeight || img?.videoHeight || img?.height || 0;
        bytes += w * h * 4 * (t.generateMipmaps !== false ? 1.333 : 1);
      }
    }
  });
  return { count: seen.size, mb: bytes / (1024 * 1024) };
}

export async function runBench(app, { frames = 30, warmup = 3, label = '' } = {}) {
  const THREE = window.THREE;
  const renderer = app.renderer;
  const gl = renderer.getContext();
  const cam = app.camera;
  const cm = app.controlsManager;
  const eyeY = cam.position.y || 2.75;

  app._benching = true;
  const prevAutoReset = renderer.info.autoReset;
  const rows = [];

  for (const p of BENCH_POINTS) {
    cam.position.set(p.x, eyeY, p.z);
    const yaw = YAW[p.dir];
    if (cm) {
      cm.isGliding = false;
      cm.glideTween = null;
      cm.currentYaw = cm.targetYaw = yaw;
      cm.currentPitch = cm.targetPitch = 0;
    }
    cam.quaternion.setFromEuler(new THREE.Euler(0, yaw, 0, 'YXZ'));
    cam.updateMatrixWorld(true);
    if (typeof app.updateZoneCulling === 'function') app.updateZoneCulling();

    // Khung đầu tiên (gồm nạp texture/shader lần đầu)
    let t0 = performance.now();
    renderer.render(app.scene, cam);
    gl.finish();
    const firstMs = performance.now() - t0;
    for (let i = 0; i < warmup; i++) { renderer.render(app.scene, cam); }
    gl.finish();

    const times = [];
    let calls = 0, tris = 0;
    for (let i = 0; i < frames; i++) {
      t0 = performance.now();
      renderer.render(app.scene, cam);
      gl.finish();
      times.push(performance.now() - t0);
      calls = renderer.info.render.calls;
      tris = renderer.info.render.triangles;
      // nhường luồng để trình duyệt không treo
      if (i % 10 === 9) await new Promise(r => setTimeout(r, 0));
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const mem = estimateTextureMemory(app.scene);
    rows.push({
      diem: p.id, x: p.x, z: p.z, huong: p.dir,
      draw_calls: calls,
      tam_giac: tris,
      khung_dau_ms: +firstMs.toFixed(1),
      tb_ms: +avg.toFixed(2),
      max_ms: +Math.max(...times).toFixed(2),
      texture_gpu: renderer.info.memory.textures,
      texture_canh: mem.count,
      bo_nho_anh_mb: Math.round(mem.mb)
    });
  }

  renderer.info.autoReset = prevAutoReset;
  app._benching = false;
  if (typeof app.requestRender === 'function') app.requestRender(2);

  const result = {
    giai_doan: label,
    thoi_diem: new Date().toISOString(),
    url: location.href,
    gpu: (() => {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'không rõ';
    })(),
    khung_hinh: `${renderer.domElement.width}x${renderer.domElement.height}`,
    pixel_ratio: renderer.getPixelRatio(),
    quality: app.quality || 'mac_dinh',
    diem: rows
  };
  console.table(rows);
  window.__benchResult = result;
  return result;
}
