import * as THREE from 'three';

const FONT_FAMILY = '"Be Vietnam Pro", system-ui, sans-serif';

/**
 * ZoneScreenSlideshow (Mục C)
 * Điều khiển trình chiếu màn hình LED lớn tại Khu 4 (Đảng bộ) & Khu 6 (Công đoàn - Đoàn TN).
 * - Canvas 2048 x 1152 (16:9)
 * - Khung cố định theo nhận diện thương hiệu & logo chính thức tại assets/logo/
 * - Chuyển ảnh mỗi 6 giây, fade transition 0.8 giây
 * - Chỉ cập nhật khi camera ở trong khu tương ứng (zone culling)
 * - Tối ưu draw calls & render loops
 */
export class ZoneScreenSlideshow {
  constructor(zoneId, canvas, texture, items = [], screenMesh = null) {
    this.zoneId = zoneId;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.texture = texture;
    this.items = items;
    this.screenMesh = screenMesh;

    this.currentIndex = 0;
    this.nextIndex = 0;
    this.slideDuration = 6.0;
    this.fadeDuration = 0.8;
    this.timer = 0;
    this.isFading = false;
    this.fadeTimer = 0;

    this.isActive = false;
    this.imageCache = new Map();
    this.currentImg = null;
    this.nextImg = null;

    // PERF-1 B5: ảnh là 2 mặt phẳng chồng nhau (texture wall), canvas chỉ còn header/footer tĩnh
    this.textureLoader = new THREE.TextureLoader();
    this.texCache = new Map();
    this.photoPlanes = null;
    if (this.screenMesh) this.initPhotoPlanes();

    this.logos = {};
    this.logosLoaded = false;
    this.loadLogos();

    if (this.items.length > 0) {
      this.loadImage(this.items[0], (img) => {
        this.currentImg = img;
        this.draw(0);
      });
      this.setPlanePhoto(0, this.items[0], 1);
      // Preload next image
      if (this.items.length > 1) {
        this.loadImage(this.items[1]);
      }
    }
  }

  /** PERF-1 B5: tạo 2 mặt phẳng ảnh nằm trên mặt màn hình (hệ toạ độ cục bộ của screenMesh) */
  initPhotoPlanes() {
    const ud = this.screenMesh.userData || {};
    this.pxToM = (ud.planeW || 9.0) / 2048;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.photoPlanes = [0, 1].map(i => {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: i === 0 ? 1 : 0,
        depthWrite: false,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -4 - i,
        polygonOffsetUnits: -4 - i
      });
      const m = new THREE.Mesh(geo, mat);
      m.name = `LED_Photo_${this.zoneId}_${i}`;
      m.visible = false;
      m.renderOrder = (this.screenMesh.renderOrder || 0) + 1 + i;
      m.position.set(0, 0, 0.004 + i * 0.002);
      m.raycast = () => {}; // bấm vẫn trúng màn hình gốc
      this.screenMesh.add(m);
      m.updateMatrix();
      return m;
    });
    // Màn LED hiển thị đúng màu gốc (B3)
    if (this.screenMesh.material) {
      this.screenMesh.material.toneMapped = false;
      this.screenMesh.material.needsUpdate = true;
    }
  }

  getPhotoTexture(item, onReady) {
    const src = item && (item.wall_path || item.full_path || item.thumb_path);
    if (!src) return null;
    if (this.texCache.has(src)) {
      const t = this.texCache.get(src);
      if (t.image && (t.image.naturalWidth || t.image.width)) onReady?.(t);
      else (t.userData.waiters ||= []).push(onReady);
      return t;
    }
    const tex = this.textureLoader.load(src, (t) => {
      (t.userData.waiters || []).forEach(fn => fn?.(t));
      t.userData.waiters = [];
      window.app?.requestRender?.(2);
    });
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = window.__ANISO_CAP || 8;
    tex.userData.waiters = [onReady];
    this.texCache.set(src, tex);
    // giữ tối đa 4 ảnh trong bộ nhớ GPU
    while (this.texCache.size > 4) {
      const [oldSrc, oldTex] = this.texCache.entries().next().value;
      const inUse = this.photoPlanes?.some(p => p.material.map === oldTex);
      if (inUse) { this.texCache.delete(oldSrc); this.texCache.set(oldSrc, oldTex); break; }
      oldTex.dispose();
      this.texCache.delete(oldSrc);
    }
    return tex;
  }

  /** Đặt ảnh cho mặt phẳng `idx`, co giãn đúng tỷ lệ trong vùng ảnh (1968 × 832 px, tâm y = 596 px) */
  setPlanePhoto(idx, item, opacity) {
    if (!this.photoPlanes || !item) return;
    const plane = this.photoPlanes[idx];
    plane.material.opacity = opacity;
    this.getPhotoTexture(item, (t) => {
      const iw = t.image.naturalWidth || t.image.width;
      const ih = t.image.naturalHeight || t.image.height;
      const scale = Math.min(1968 / iw, 832 / ih);
      plane.scale.set(iw * scale * this.pxToM, ih * scale * this.pxToM, 1);
      plane.position.y = (576 - 596) * this.pxToM;
      plane.material.map = t;
      plane.material.needsUpdate = true;
      plane.visible = true;
      plane.updateMatrix();
      plane.matrixWorldAutoUpdate = true;
      plane.updateMatrixWorld(true);
      if (plane.parent) plane.matrixWorld.multiplyMatrices(plane.parent.matrixWorld, plane.matrix);
      window.app?.requestRender?.(2);
    });
  }

  loadLogos() {
    let pending = 0;
    const checkDone = () => {
      pending--;
      if (pending <= 0) {
        this.logosLoaded = true;
        this.draw(0);
      }
    };

    if (this.zoneId === 'khu4') {
      this.logos.coDang = new Image();
      pending++;
      this.logos.coDang.onload = checkDone;
      this.logos.coDang.onerror = checkDone;
      this.logos.coDang.src = 'assets/logo/co_dang_phang.png';

      this.logos.coQuocKy = new Image();
      pending++;
      this.logos.coQuocKy.onload = checkDone;
      this.logos.coQuocKy.onerror = checkDone;
      this.logos.coQuocKy.src = 'assets/logo/quoc_ky_phang.png';
    } else {
      this.logos.congDoan = new Image();
      pending++;
      this.logos.congDoan.onload = checkDone;
      this.logos.congDoan.onerror = checkDone;
      this.logos.congDoan.src = 'assets/logo/logo_cong_doan.png';

      this.logos.doanTn = new Image();
      pending++;
      this.logos.doanTn.onload = checkDone;
      this.logos.doanTn.onerror = checkDone;
      this.logos.doanTn.src = 'assets/logo/logo_doan_tn.png';
    }
  }

  loadImage(item, callback) {
    if (!item) return;
    // PERF-1 B5: khi có mặt phẳng ảnh thì ảnh nạp qua texture, không cần Image riêng
    if (this.photoPlanes) {
      this.getPhotoTexture(item, (t) => callback?.(t.image));
      return;
    }
    const src = item.wall_path || item.full_path || item.thumb_path;
    if (!src) return;

    if (this.imageCache.has(src)) {
      const cached = this.imageCache.get(src);
      if (callback) callback(cached);
      return cached;
    }

    const img = new Image();
    img.onload = () => {
      this.imageCache.set(src, img);
      if (callback) callback(img);
    };
    img.src = src;
    return img;
  }

  setActive(active) {
    if (this.isActive !== active) {
      this.isActive = active;
      if (active) {
        // Redraw current view immediately when entering zone
        this.draw(0);
      }
    }
  }

  getCurrentItem() {
    return this.items[this.currentIndex] || null;
  }

  /** @returns {boolean} true nếu khung này cần vẽ lại (đang chuyển ảnh) */
  update(delta) {
    if (!this.isActive || this.items.length <= 1) return false;

    this.timer += delta;

    if (!this.isFading) {
      if (this.timer >= this.slideDuration) {
        this.isFading = true;
        this.fadeTimer = 0;
        this.nextIndex = (this.currentIndex + 1) % this.items.length;
        const nextItem = this.items[this.nextIndex];

        if (this.photoPlanes) {
          // Ảnh kế tiếp lên mặt phẳng thứ 2 (opacity 0), mờ dần chỉ đổi opacity
          this.setPlanePhoto(1, nextItem, 0);
        } else {
          // Ensure next image is loaded
          const nextSrc = nextItem.wall_path || nextItem.full_path || nextItem.thumb_path;
          if (this.imageCache.has(nextSrc)) {
            this.nextImg = this.imageCache.get(nextSrc);
          } else {
            this.loadImage(nextItem, (img) => {
              this.nextImg = img;
            });
          }
        }

        // Preload image after next
        const peekIndex = (this.nextIndex + 1) % this.items.length;
        this.loadImage(this.items[peekIndex]);
        return true;
      }
      return false;
    }

    this.fadeTimer += delta;
    const progress = Math.min(this.fadeTimer / this.fadeDuration, 1.0);

    if (this.photoPlanes) {
      const [cur, nxt] = this.photoPlanes;
      cur.material.opacity = 1.0 - progress;
      nxt.material.opacity = progress;
      if (progress >= 1.0) {
        this.isFading = false;
        this.timer = 0;
        this.currentIndex = this.nextIndex;
        // đổi vai 2 mặt phẳng: mặt vừa hiện thành "hiện tại"
        this.photoPlanes = [nxt, cur];
        nxt.renderOrder = (this.screenMesh.renderOrder || 0) + 1;
        cur.renderOrder = (this.screenMesh.renderOrder || 0) + 2;
        cur.visible = false;
        cur.material.opacity = 0;
        this.draw(0); // header/footer theo ảnh mới (vẽ canvas 1 lần mỗi 6 giây)
      }
      return true;
    }

    this.draw(progress);
    if (progress >= 1.0) {
      this.isFading = false;
      this.timer = 0;
      this.currentIndex = this.nextIndex;
      this.currentImg = this.nextImg;
      this.nextImg = null;
      this.draw(0);
    }
    return true;
  }

  draw(fadeProgress = 0) {
    const ctx = this.ctx;
    const w = this.canvas.width;  // 2048
    const h = this.canvas.height; // 1152

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // 1. Background cho toàn bộ màn hình
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, w, h);

    // 2. Vùng hiển thị ảnh chính (y: 160 -> 1032, chiều cao 872px)
    const photoY = 160;
    const photoH = 872;
    ctx.fillStyle = '#050811';
    ctx.fillRect(0, photoY, w, photoH);

    // PERF-1 B5: ảnh nằm trên mặt phẳng riêng, canvas chỉ vẽ nền + header/footer
    if (!this.photoPlanes) {
      // Vẽ ảnh hiện tại
      if (this.currentImg && this.currentImg.complete && this.currentImg.naturalWidth > 0) {
        const alpha = this.isFading ? (1.0 - fadeProgress) : 1.0;
        this.drawImageFitted(this.currentImg, photoY, photoH, alpha);
      }

      // Vẽ ảnh kế tiếp khi đang fade transition
      if (this.isFading && this.nextImg && this.nextImg.complete && this.nextImg.naturalWidth > 0) {
        this.drawImageFitted(this.nextImg, photoY, photoH, fadeProgress);
      }
    }

    // 3. Khung cố định: Header dải đầu (cao 160px)
    this.drawHeader();

    // 4. Khung cố định: Footer dải thông tin dưới cùng (cao 120px)
    this.drawFooter();

    ctx.restore();
    this.texture.needsUpdate = true;
    window.app?.requestRender?.(1);
  }

  drawImageFitted(img, areaY, areaH, alpha) {
    const ctx = this.ctx;
    const maxW = 1968;
    const maxH = areaH - 40; // 832
    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;

    const scale = Math.min(maxW / imgW, maxH / imgH);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const drawX = (2048 - drawW) / 2;
    const drawY = areaY + (areaH - drawH) / 2;

    ctx.save();
    // Clip strictly within the photo area to prevent spilling onto header or footer (Mục C.4)
    ctx.beginPath();
    ctx.rect(0, areaY, 2048, areaH);
    ctx.clip();

    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

    // Shadow nhẹ phía sau ảnh
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;

    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();
  }

  drawHeader() {
    const ctx = this.ctx;
    const w = 2048;
    const headerH = 160;

    if (this.zoneId === 'khu4') {
      // Khu 4: Dải đầu màu đỏ #B91C1C, cờ Đảng bên trái, Quốc kỳ bên phải
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(0, 0, w, headerH);

      // Viền vàng chân header
      ctx.fillStyle = '#facc15';
      ctx.fillRect(0, headerH - 4, w, 4);

      // Cờ Đảng bên trái (tỷ lệ 3:2, 165 x 110px)
      if (this.logos.coDang && this.logos.coDang.complete) {
        ctx.drawImage(this.logos.coDang, 48, 25, 165, 110);
        ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2; ctx.strokeRect(48, 25, 165, 110);
      }
      // Quốc kỳ bên phải (165 x 110px)
      if (this.logos.coQuocKy && this.logos.coQuocKy.complete) {
        ctx.drawImage(this.logos.coQuocKy, w - 48 - 165, 25, 165, 110);
        ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2; ctx.strokeRect(w - 48 - 165, 25, 165, 110);
      }

      // Tiêu đề trung tâm
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.fillStyle = '#ffffff';
      ctx.font = `900 50px ${FONT_FAMILY}`;
      ctx.fillText('ĐẢNG BỘ CÔNG TY ĐIỆN LỰC VŨNG TÀU', w / 2, 68);

      ctx.fillStyle = '#fde047';
      ctx.font = `700 26px ${FONT_FAMILY}`;
      ctx.fillText('VỮNG BƯỚC DƯỚI CỜ ĐẢNG QUANG VINH • 1985 – 2025', w / 2, 118);
    } else {
      // Khu 6: Dải đầu chia đôi (nửa trái xanh dương đậm, nửa phải xanh lam)
      const currentItem = this.items[this.currentIndex];
      const isDoan = currentItem && currentItem.source === 'doan_tn';

      // Nửa trái: Công đoàn
      ctx.fillStyle = isDoan ? '#00254d' : '#004b93';
      ctx.fillRect(0, 0, w / 2, headerH);

      // Nửa phải: Đoàn TN
      ctx.fillStyle = isDoan ? '#0284c7' : '#014269';
      ctx.fillRect(w / 2, 0, w / 2, headerH);

      // Vạch sáng phân cách và viền dưới
      ctx.fillStyle = isDoan ? '#38bdf8' : '#facc15';
      ctx.fillRect(0, headerH - 4, w, 4);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fillRect(w / 2 - 1, 0, 2, headerH);

      // Logo Công đoàn (120 x 120)
      if (this.logos.congDoan && this.logos.congDoan.complete) {
        ctx.save();
        ctx.globalAlpha = isDoan ? 0.6 : 1.0;
        ctx.drawImage(this.logos.congDoan, 56, 20, 120, 120);
        ctx.restore();
      }

      // Huy hiệu Đoàn (120 x 120)
      if (this.logos.doanTn && this.logos.doanTn.complete) {
        ctx.save();
        ctx.globalAlpha = isDoan ? 1.0 : 0.6;
        ctx.drawImage(this.logos.doanTn, w - 56 - 120, 20, 120, 120);
        ctx.restore();
      }

      // Tiêu đề trung tâm
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.fillStyle = '#ffffff';
      ctx.font = `900 48px ${FONT_FAMILY}`;
      ctx.fillText('CÔNG ĐOÀN – ĐOÀN THANH NIÊN', w / 2, 66);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = `700 24px ${FONT_FAMILY}`;
      const sub = isDoan ? 'TUỔI TRẺ CÔNG TY ĐIỆN LỰC VŨNG TÀU XUNG KÍCH SÁNG TẠO' : 'ĐẠI DIỆN CHĂM LO, BẢO VỆ QUYỀN LỢI NGƯỜI LAO ĐỘNG';
      ctx.fillText(sub, w / 2, 116);
    }
  }

  drawFooter() {
    const ctx = this.ctx;
    const w = 2048;
    const footerY = 1032;
    const footerH = 120;

    // Nền footer
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, footerY, w, footerH);

    // Vạch viền đỉnh footer
    ctx.fillStyle = this.zoneId === 'khu4' ? '#facc15' : '#38bdf8';
    ctx.fillRect(0, footerY, w, 3);

    const item = this.items[this.currentIndex];
    if (!item) return;

    // Định dạng ngày
    let dateStr = item.date || `${item.year || ''}`;
    if (item.date && item.date.includes('-')) {
      const parts = item.date.split('-');
      if (parts.length === 3) dateStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    // Tiêu đề sự kiện
    const titleStr = item.tieu_de || item.caption || item.new_name || item.title || 'Sự kiện ghi nhận hình ảnh';

    // Badge ngày tháng
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = this.zoneId === 'khu4' ? '#b91c1c' : '#1e40a0';
    ctx.fillRect(48, footerY + 28, 220, 64);
    ctx.strokeStyle = this.zoneId === 'khu4' ? '#facc15' : '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(48, footerY + 28, 220, 64);

    ctx.fillStyle = '#ffffff';
    ctx.font = `800 26px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.fillText(dateStr, 48 + 110, footerY + 60);

    // Tiêu đề
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f8fafc';
    ctx.font = `700 32px ${FONT_FAMILY}`;

    let displayTitle = `•  ${titleStr}`;
    if (ctx.measureText(displayTitle).width > 1400) {
      while (ctx.measureText(displayTitle + '...').width > 1400 && displayTitle.length > 10) {
        displayTitle = displayTitle.slice(0, -1);
      }
      displayTitle += '...';
    }
    ctx.fillText(displayTitle, 300, footerY + 60);

    // Số thứ tự ảnh [i / total]
    ctx.textAlign = 'right';
    ctx.fillStyle = '#94a3b8';
    ctx.font = `600 26px ${FONT_FAMILY}`;
    ctx.fillText(`[ ${this.currentIndex + 1} / ${this.items.length} ]`, w - 48, footerY + 60);
  }
}
