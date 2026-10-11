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

function texBytes(t) {
  const img = t.image;
  const w = img?.naturalWidth || img?.videoWidth || img?.width || 0;
  const h = img?.naturalHeight || img?.videoHeight || img?.height || 0;
  return w * h * 4 * (t.generateMipmaps !== false ? 1.333 : 1);
}

/** Ước tính bộ nhớ ảnh: texture đang gắn trong cảnh + texture giữ trong bộ đệm (thumb ẩn, wall LRU, biển tên) */
function estimateTextureMemory(scene, app) {
  const seen = new Set();
  let bytes = 0;
  const add = (t) => {
    if (!t || seen.has(t.uuid)) return;
    seen.add(t.uuid);
    bytes += texBytes(t);
  };
  scene.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      for (const key of ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'alphaMap']) add(m[key]);
    }
  });
  app?.textureStreamer?.residentTextures().forEach(add);
  app?.exhibitBuilder?.loadedTextures?.forEach(add);
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
    app.textureStreamer?.update(true);

    // Khung đầu tiên (gồm nạp texture/shader lần đầu)
    let t0 = performance.now();
    renderer.render(app.scene, cam);
    gl.finish();
    const firstMs = performance.now() - t0;
    // PERF-3: chờ ảnh wall/biển tên quanh điểm này nạp xong (như người xem đứng lại)
    if (app.textureStreamer) await app.textureStreamer.settle(5000);
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
    const mem = estimateTextureMemory(app.scene, app);
    const st = app.textureStreamer?.stats() || {};
    rows.push({
      diem: p.id, x: p.x, z: p.z, huong: p.dir,
      draw_calls: calls,
      tam_giac: tris,
      khung_dau_ms: +firstMs.toFixed(1),
      tb_ms: +avg.toFixed(2),
      max_ms: +Math.max(...times).toFixed(2),
      texture_gpu: renderer.info.memory.textures,
      texture_canh: mem.count,
      bo_nho_anh_mb: Math.round(mem.mb),
      wall_dang_giu: st.wall ?? null,
      bien_ten_dang_giu: st.plaque ?? null
    });
  }

  renderer.info.autoReset = prevAutoReset;
  app._benching = false;
  if (typeof app.requestRender === 'function') app.requestRender(2);

  // PERF-3: đi một vòng qua 9 điểm bằng vòng vẽ thật, đếm khung > 100 ms
  const walk = await runWalkCheck(app);

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
    diem: rows,
    vong_quanh: walk
  };
  console.table(rows);
  window.__benchResult = result;
  return result;
}

/**
 * Đi một vòng quanh nhà (qua 9 điểm, tốc độ ~6 m/s) bằng glide của controlsManager,
 * ghi khoảng cách giữa các khung (requestAnimationFrame). Mục tiêu: không khung nào > 100 ms.
 */
export async function runWalkCheck(app, { speed = 6 } = {}) {
  const THREE = window.THREE;
  const cm = app.controlsManager;
  const cam = app.camera;
  if (!cm || typeof cm.startGlide !== 'function') return null;
  const eyeY = cam.position.y || 2.75;
  const deltas = [];
  let running = true, last = performance.now();
  const tick = (t) => {
    deltas.push(t - last); last = t;
    if (running) requestAnimationFrame(tick);
  };
  requestAnimationFrame((t) => { last = t; requestAnimationFrame(tick); });
  const t0 = performance.now();
  for (let i = 0; i < BENCH_POINTS.length; i++) {
    const p = BENCH_POINTS[i];
    const from = cam.position.clone();
    const to = new THREE.Vector3(p.x, eyeY, p.z);
    const dur = Math.max(0.5, from.distanceTo(to) / speed);
    await new Promise(res => cm.startGlide(from, to, cm.currentYaw, YAW[p.dir], cm.currentPitch, 0, dur, res));
  }
  running = false;
  await new Promise(r => setTimeout(r, 50));
  const sorted = [...deltas].sort((a, b) => b - a);
  return {
    thoi_gian_s: +((performance.now() - t0) / 1000).toFixed(1),
    so_khung: deltas.length,
    khung_max_ms: +(sorted[0] || 0).toFixed(1),
    khung_tren_100ms: deltas.filter(d => d > 100).length,
    khung_tren_50ms: deltas.filter(d => d > 50).length,
    tb_ms: +(deltas.reduce((a, b) => a + b, 0) / Math.max(1, deltas.length)).toFixed(2),
    top5_ms: sorted.slice(0, 5).map(v => +v.toFixed(1))
  };
}
