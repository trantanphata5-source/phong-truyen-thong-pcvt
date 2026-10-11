/**
 * PERF-3 (TOI_UU_HIEU_NANG.md mục D1, D2) – Quản lý bộ nhớ ảnh theo khoảng cách
 *
 * D1 – Ảnh hiện vật:
 *   < 14 m  : dùng bản `wall` (1024 px)
 *   > 18 m  : quay về `thumb` (320 px) – giữ `wall` trong bộ nhớ đệm
 *   > 30 m  : giải phóng `wall` (dispose + close ImageBitmap)
 *   Tối đa 96 texture `wall` cùng lúc (LRU). Ảnh giải mã ngoài luồng chính bằng
 *   ImageBitmapLoader (imageOrientation:'flipY'); đưa lên GPU qua hàng đợi
 *   tối đa 2 ảnh lớn mỗi khung bằng renderer.initTexture(); chỉ gán `map` khi đã lên GPU.
 *   Ưu tiên ảnh trong hướng nhìn và gần nhất.
 *
 * D2 – Biển tên: dựng canvas khi < 25 m, dispose khi > 35 m; giữ hàm vẽ để dựng lại.
 *   Canvas giữ nguyên kích thước (cao 128/256 px) nên chất lượng chữ không đổi.
 */
import * as THREE from 'three';

const WALL_NEAR = 14, WALL_FAR = 18, WALL_FREE = 30, WALL_MAX = 96;
const PLAQUE_NEAR = 25, PLAQUE_FREE = 35;
const MAX_INFLIGHT = 4;          // số ảnh `wall` tải song song
const UPLOAD_BIG_PER_FRAME = 2;  // ảnh lớn đưa lên GPU mỗi khung
const UPLOAD_PX_BUDGET = 2.2e6;  // tổng điểm ảnh tối đa đưa lên GPU mỗi khung
const PLAQUE_BUILD_PER_FRAME = 3;
const SCAN_INTERVAL_MS = 200;
const WALL_MAX_PX = 2048;        // ảnh gốc rộng hơn sẽ thu nhỏ khi giải mã (ảnh HCM)
const THUMB_PX = 384;            // thumb tự tạo cho ảnh không có sẵn bản nhỏ

/** Tải ảnh -> ImageBitmap (giải mã ngoài luồng chính, lật Y), thu nhỏ nếu rộng/cao hơn maxPx */
export async function loadBitmap(url, maxPx = WALL_MAX_PX) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const opts = { imageOrientation: 'flipY', premultiplyAlpha: 'none' };
  let bmp = await createImageBitmap(blob, opts);
  const long = Math.max(bmp.width, bmp.height);
  if (long > maxPx) {
    const k = maxPx / long;
    const small = await createImageBitmap(bmp, {
      resizeWidth: Math.round(bmp.width * k), resizeHeight: Math.round(bmp.height * k), resizeQuality: 'high'
    });
    bmp.close();
    bmp = small;
  }
  return bmp;
}

/**
 * Texture thumb tự tạo (cạnh dài THUMB_PX) từ ảnh gốc – cho ảnh HCM không có sẵn bản nhỏ.
 * Trả về ngay; ảnh được gắn khi giải mã xong.
 */
export function streamThumbTexture(url) {
  const tex = new THREE.Texture();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  if (typeof createImageBitmap !== 'function') {
    new THREE.TextureLoader().load(url, (t) => { tex.image = t.image; tex.flipY = true; tex.needsUpdate = true; window.app?.requestRender?.(2); });
    return tex;
  }
  loadBitmap(url, THUMB_PX).then((bmp) => {
    tex.image = bmp;
    tex.needsUpdate = true;
    window.app?.requestRender?.(2);
  }).catch((err) => console.warn('[PERF-3] thumb lỗi', url, err));
  return tex;
}

export class TextureStreamer {
  constructor(app, items) {
    this.app = app;
    this.renderer = app.renderer;
    this.camera = app.camera;
    this.photos = [];
    this.plaques = [];
    for (const it of items || []) (it.kind === 'plaque' ? this.plaques : this.photos).push(it);

    this.useBitmap = typeof createImageBitmap === 'function';
    if (!this.useBitmap) this.textureLoader = new THREE.TextureLoader();

    this.inflight = 0;
    this.loadQueue = [];     // photo chờ tải wall
    this.uploadQueue = [];   // { tex, done }
    this.plaqueQueue = [];   // plaque chờ dựng canvas
    this.uploaded = new WeakSet();
    this.wallResident = new Set(); // photo đang giữ texture wall
    this.plaqueResident = 0;
    this._lastScan = 0;
    this._lastCamPos = new THREE.Vector3(1e9, 0, 0);
    this._lastCamDir = new THREE.Vector3();
    this._frustum = new THREE.Frustum();
    this._projScreen = new THREE.Matrix4();
    this._tmp = new THREE.Vector3();
    this.maxAniso = window.__ANISO_CAP || 8;

    this.computeCenters();
    // Đưa trước toàn bộ thumb lên GPU (nhỏ) để không giật lần đầu nhìn thấy
    this.thumbPending = this.photos.map(p => p.thumbTex).filter(Boolean);
    console.log(`[PERF-3] Quản lý ${this.photos.length} ảnh, ${this.plaques.length} biển tên`);
  }

  computeCenters() {
    const all = this.photos.concat(this.plaques);
    for (const it of all) {
      it.center = new THREE.Vector3();
      it.mesh.updateWorldMatrix(true, false);
      it.mesh.getWorldPosition(it.center);
      it.dist = Infinity;
    }
  }

  /** Gọi mỗi khung từ animate(). Trả về true nếu cảnh đổi (cần vẽ lại). */
  update(force = false) {
    let changed = false;
    const now = performance.now();
    const cam = this.camera;
    const camDir = this._tmp.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const moved = cam.position.distanceToSquared(this._lastCamPos) > 0.25 ||
      camDir.dot(this._lastCamDir) < 0.995;
    if (force || (now - this._lastScan > SCAN_INTERVAL_MS && moved) || now - this._lastScan > 1500) {
      this._lastScan = now;
      this._lastCamPos.copy(cam.position);
      this._lastCamDir.copy(camDir);
      if (this.scan()) changed = true;
    }
    if (this.processUploads()) changed = true;
    if (this.processPlaques()) changed = true;
    this.pumpLoads();
    return changed;
  }

  scan() {
    let changed = false;
    const cam = this.camera;
    cam.updateMatrixWorld();
    this._projScreen.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._projScreen);
    const cp = cam.position;

    // ---- Ảnh ----
    const wants = [];
    for (const p of this.photos) {
      const d = p.center.distanceTo(cp);
      p.dist = d;
      p.inView = this._frustum.containsPoint(p.center);
      if (d < WALL_NEAR) p.lastNear = performance.now();
      if (p.wallTex) {
        if (p.wallReady && p.showing !== 'wall' && d < WALL_FAR) { this.setMap(p, p.wallTex); p.showing = 'wall'; changed = true; }
        else if (p.showing === 'wall' && d > WALL_FAR) { this.setMap(p, p.thumbTex); p.showing = 'thumb'; changed = true; }
        if (d > WALL_FREE) { this.freeWall(p); changed = true; }
      } else if (d < WALL_NEAR && !p.loading && p.wallPath && !p.failed) {
        wants.push(p);
      }
    }
    // Ưu tiên: trong hướng nhìn trước, rồi gần nhất
    wants.sort((a, b) => (a.inView === b.inView ? a.dist - b.dist : (a.inView ? -1 : 1)));
    this.loadQueue = wants;

    // Giới hạn 96 wall (LRU theo lần cuối ở gần)
    if (this.wallResident.size > WALL_MAX) {
      const arr = [...this.wallResident].sort((a, b) => (a.lastNear || 0) - (b.lastNear || 0));
      while (this.wallResident.size > WALL_MAX && arr.length) {
        const p = arr.shift();
        if (p.dist < WALL_NEAR) continue;
        this.freeWall(p); changed = true;
      }
    }

    // ---- Biển tên ----
    const plaqueWants = [];
    for (const q of this.plaques) {
      const d = q.center.distanceTo(cp);
      q.dist = d;
      if (q.tex) {
        if (d > PLAQUE_FREE) { this.freePlaque(q); changed = true; }
      } else if (d < PLAQUE_NEAR) {
        q.inView = this._frustum.containsPoint(q.center);
        plaqueWants.push(q);
      }
    }
    plaqueWants.sort((a, b) => (a.inView === b.inView ? a.dist - b.dist : (a.inView ? -1 : 1)));
    this.plaqueQueue = plaqueWants;
    return changed;
  }

  setMap(p, tex) {
    const mat = p.mesh.material;
    if (!mat || !tex) return;
    const hadMap = !!mat.map;
    mat.map = tex;
    if (!hadMap) mat.needsUpdate = true;
  }

  pumpLoads() {
    while (this.inflight < MAX_INFLIGHT && this.loadQueue.length) {
      const p = this.loadQueue.shift();
      if (p.wallTex || p.loading) continue;
      p.loading = true;
      this.inflight++;
      const finish = (tex) => {
        this.inflight--;
        p.loading = false;
        if (!tex) { p.failed = true; return; }
        // Đã đi xa trong lúc tải -> bỏ
        if (p.dist > WALL_FREE) { this.disposeTex(tex); return; }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = this.maxAniso;
        tex.needsUpdate = true;
        p.wallTex = tex;
        p.wallReady = false;
        this.wallResident.add(p);
        this.uploadQueue.push({ tex, big: true, done: () => { p.wallReady = true; } });
      };
      if (this.useBitmap) {
        loadBitmap(p.wallPath, WALL_MAX_PX).then((bmp) => {
          const tex = new THREE.Texture(bmp);
          tex.flipY = false; // đã lật khi giải mã
          finish(tex);
        }).catch(() => finish(null));
      } else {
        this.textureLoader.load(p.wallPath, (tex) => finish(tex), undefined, () => finish(null));
      }
    }
  }

  processUploads() {
    let changed = false;
    let px = 0, big = 0;
    while (this.uploadQueue.length && big < UPLOAD_BIG_PER_FRAME && px < UPLOAD_PX_BUDGET) {
      const job = this.uploadQueue.shift();
      const img = job.tex.image;
      px += (img?.width || 0) * (img?.height || 0);
      big++;
      this.renderer.initTexture(job.tex);
      this.uploaded.add(job.tex);
      job.done?.();
    }
    // thumb (nhỏ) dùng phần ngân sách còn lại
    let n = 0;
    while (this.thumbPending.length && px < UPLOAD_PX_BUDGET && n < 40) {
      const t = this.thumbPending[0];
      const img = t.image;
      if (!img || !(img.complete || img.width)) {
        // chưa tải xong -> đẩy xuống cuối, thử lần sau
        this.thumbPending.push(this.thumbPending.shift());
        if (++n >= this.thumbPending.length) break;
        continue;
      }
      this.thumbPending.shift();
      if (!this.uploaded.has(t)) {
        this.renderer.initTexture(t);
        this.uploaded.add(t);
        px += (img.width || 0) * (img.height || 0);
      }
      n++;
    }
    // Gán wall cho ảnh vừa lên GPU nếu vẫn ở gần
    for (const p of this.wallResident) {
      if (p.wallReady && p.showing !== 'wall' && p.dist < WALL_FAR) {
        this.setMap(p, p.wallTex); p.showing = 'wall'; changed = true;
      }
    }
    return changed;
  }

  processPlaques() {
    let changed = false;
    let built = 0;
    while (this.plaqueQueue.length && built < PLAQUE_BUILD_PER_FRAME) {
      const q = this.plaqueQueue.shift();
      if (q.tex || q.dist > PLAQUE_NEAR) continue;
      const canvas = q.draw();
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = this.maxAniso;
      this.renderer.initTexture(tex);
      q.tex = tex;
      const mat = q.mesh.material;
      mat.map = tex;
      mat.color.set(0xffffff);
      this.plaqueResident++;
      built++;
      changed = true;
    }
    return changed;
  }

  freeWall(p) {
    if (!p.wallTex) return;
    if (p.showing === 'wall') { this.setMap(p, p.thumbTex); p.showing = 'thumb'; }
    this.disposeTex(p.wallTex);
    p.wallTex = null;
    p.wallReady = false;
    this.wallResident.delete(p);
  }

  freePlaque(q) {
    if (!q.tex) return;
    const mat = q.mesh.material;
    mat.map = q.placeholder;
    mat.color.set(0xffffff);
    q.tex.dispose();
    // giải phóng bộ nhớ canvas
    if (q.tex.image) { q.tex.image.width = 0; q.tex.image.height = 0; }
    q.tex = null;
    this.plaqueResident--;
  }

  disposeTex(tex) {
    const img = tex.image;
    tex.dispose();
    if (img && typeof img.close === 'function') img.close();
  }

  /** Chờ tới khi ảnh/biển tên quanh vị trí hiện tại đã sẵn sàng (dùng cho bench) */
  async settle(timeoutMs = 5000) {
    const t0 = performance.now();
    this.update(true);
    while (performance.now() - t0 < timeoutMs) {
      await new Promise(r => requestAnimationFrame(r));
      this.update();
      if (!this.loadQueue.length && !this.inflight && !this.uploadQueue.length && !this.plaqueQueue.length) break;
    }
  }

  /** Mọi texture ảnh/biển tên đang chiếm bộ nhớ (để ước tính MB) */
  residentTextures() {
    const out = [];
    for (const p of this.photos) {
      if (p.thumbTex) out.push(p.thumbTex);
      if (p.wallTex) out.push(p.wallTex);
    }
    for (const q of this.plaques) if (q.tex) out.push(q.tex);
    return out;
  }

  stats() {
    return { wall: this.wallResident.size, plaque: this.plaqueResident, queue: this.loadQueue.length, inflight: this.inflight };
  }
}

/** Texture 1×1 một màu, dùng giữ chỗ cho biển tên chưa dựng (không đổi shader khi gán map thật) */
const _placeholders = new Map();
export function placeholderTexture(color) {
  const key = String(color).toLowerCase();
  if (_placeholders.has(key)) return _placeholders.get(key);
  const c = new THREE.Color(color);
  const data = new Uint8Array([
    Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), 255
  ]);
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace; // màu hex là sRGB
  tex.needsUpdate = true;
  _placeholders.set(key, tex);
  return tex;
}
