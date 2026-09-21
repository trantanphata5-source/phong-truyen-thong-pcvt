/**
 * Album Viewer Module (Realistic 3D Page Turn Experience)
 * Supports:
 * - Album 1: Ảnh Tư Liệu & Lưu Niệm (58 tư liệu lịch sử 1985 - 2025)
 * - Album 2: Tranh Kỷ Niệm & Tranh Tặng (49 tác phẩm nghệ thuật)
 * - 3D Pick-up animation from the Showcase Vitrine
 * - Realistic dual-page flip with paper sound
 * - Individual photo zoom lightbox
 * - Put-down album back to vitrine
 */
export class AlbumViewer {
  constructor(app) {
    this.app = app;
    this.audio = app.audioService;
    this.data = null;
    this.activeAlbumId = null;
    this.activeAlbum = null;
    this.currentSpread = 0; // Each spread shows 2 pages (Left & Right)
    this.isOpen = false;
    this.isFlipping = false;

    this.dom = {
      modal: document.getElementById('album-modal'),
      bookStage: document.getElementById('album-book-stage'),
      bookCover: document.getElementById('album-book-cover'),
      leftPage: document.getElementById('album-page-left'),
      rightPage: document.getElementById('album-page-right'),
      flipLeaf: document.getElementById('album-flip-leaf'),
      flipFront: document.getElementById('flip-face-front'),
      flipBack: document.getElementById('flip-face-back'),
      titleText: document.getElementById('album-title-text'),
      subtitleText: document.getElementById('album-subtitle-text'),
      pageIndicator: document.getElementById('album-page-indicator'),
      pageScrubber: document.getElementById('album-page-scrubber'),
      btnPrev: document.getElementById('btn-album-prev'),
      btnNext: document.getElementById('btn-album-next'),
      btnClose: document.getElementById('btn-album-put-down'),
      btnSwitch: document.getElementById('btn-album-switch'),
      filterChips: document.getElementById('album-period-chips'),
      // Photo Lightbox
      photoModal: document.getElementById('album-photo-modal'),
      photoImg: document.getElementById('album-photo-img'),
      photoTitle: document.getElementById('album-photo-title'),
      photoYear: document.getElementById('album-photo-year'),
      photoDesc: document.getElementById('album-photo-desc'),
      btnClosePhoto: document.getElementById('btn-close-album-photo')
    };

    this.init();
  }

  playSound(name) {
    try {
      if (this.audio && typeof this.audio[name] === 'function') {
        this.audio[name]();
      }
    } catch (e) {}
  }

  async init() {
    try {
      const resp = await fetch('assets/albums_data.json');
      if (resp.ok) {
        this.data = await resp.json();
        console.log('Albums data loaded successfully:', this.data);
      }
    } catch (e) {
      console.error('Failed to load albums_data.json:', e);
    }

    this.bindEvents();
  }

  bindEvents() {
    // Put down album button
    if (this.dom.btnClose) {
      this.dom.btnClose.addEventListener('click', () => this.closeAlbum());
    }

    // Next / Prev spread
    if (this.dom.btnPrev) {
      this.dom.btnPrev.addEventListener('click', () => this.prevSpread());
    }
    if (this.dom.btnNext) {
      this.dom.btnNext.addEventListener('click', () => this.nextSpread());
    }

    // Switch between the 2 albums
    if (this.dom.btnSwitch) {
      this.dom.btnSwitch.addEventListener('click', () => {
        const nextId = this.activeAlbumId === 'souvenir_photos' ? 'gift_paintings' : 'souvenir_photos';
        this.openAlbum(nextId);
      });
    }

    // Page Scrubber Slider
    if (this.dom.pageScrubber) {
      this.dom.pageScrubber.addEventListener('input', (e) => {
        const spreadIdx = parseInt(e.target.value, 10);
        this.goToSpread(spreadIdx);
      });
    }

    // Keyboard navigation
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;

      if (this.dom.photoModal && !this.dom.photoModal.classList.contains('hidden')) {
        if (e.key === 'Escape') this.closePhotoLightbox();
        return;
      }

      if (e.key === 'Escape') {
        this.closeAlbum();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        this.nextSpread();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        this.prevSpread();
      }
    });

    // Close photo modal
    if (this.dom.btnClosePhoto) {
      this.dom.btnClosePhoto.addEventListener('click', () => this.closePhotoLightbox());
    }
    if (this.dom.photoModal) {
      this.dom.photoModal.addEventListener('click', (e) => {
        if (e.target === this.dom.photoModal) this.closePhotoLightbox();
      });
    }
  }

  /**
   * Open the Album Viewer with 3D pick-up animation
   */
  openAlbum(albumId = 'souvenir_photos') {
    if (!this.data || !this.data.albums[albumId]) return;

    this.activeAlbumId = albumId;
    this.activeAlbum = this.data.albums[albumId];
    this.currentSpread = 0;
    this.isOpen = true;

    // Lock camera/player movement
    if (this.app.controlsManager) {
      this.app.controlsManager.isAlbumViewingActive = true;
      this.app.controlsManager.resetKeys();
    }

    // Play pickup audio
    this.playSound('playBookOpenSound');

    // Update Header Text & Colors
    if (this.dom.titleText) {
      this.dom.titleText.textContent = this.activeAlbum.title.toUpperCase();
    }
    if (this.dom.subtitleText) {
      this.dom.subtitleText.textContent = this.activeAlbum.subtitle;
    }
    if (this.dom.btnSwitch) {
      const otherName = albumId === 'souvenir_photos' ? 'Tranh Tặng (49 Tranh)' : 'Ảnh Lưu Niệm (58 Ảnh)';
      this.dom.btnSwitch.innerHTML = `<i data-lucide="book-open"></i> <span>Chuyển sang: ${otherName}</span>`;
      if (window.lucide) window.lucide.createIcons();
    }

    // Set cover theme
    if (this.dom.bookStage) {
      this.dom.bookStage.dataset.theme = albumId;
    }

    // Total Spreads: Each spread holds 2 pages (Left & Right)
    // Page 0: Intro (Left) & Page 1: First photo (Right)
    const totalPages = this.activeAlbum.pages.length;
    this.totalSpreads = Math.ceil(totalPages / 2);

    if (this.dom.pageScrubber) {
      this.dom.pageScrubber.min = 0;
      this.dom.pageScrubber.max = this.totalSpreads - 1;
      this.dom.pageScrubber.value = 0;
    }

    // Build Category / Period Chips
    this.buildPeriodChips();

    // Render First Spread
    this.renderSpread(this.currentSpread);

    // Show modal with smooth scale & fade in
    if (this.dom.modal) {
      this.dom.modal.classList.remove('hidden');
      this.dom.modal.classList.add('album-active');
    }
  }

  buildPeriodChips() {
    if (!this.dom.filterChips) return;
    this.dom.filterChips.innerHTML = '';

    const periods = this.activeAlbumId === 'souvenir_photos' ? [
      { label: 'Tất cả (58)', spread: 0 },
      { label: '1985 - 1999', spread: 0 },
      { label: '2000 - 2005', spread: 7 },
      { label: '2006 - 2009', spread: 16 },
      { label: 'Trạm & Đội ngũ', spread: 21 }
    ] : [
      { label: 'Tất cả (49)', spread: 0 },
      { label: 'Thủy điện & Công trình', spread: 0 },
      { label: 'Người thợ đường dây', spread: 6 },
      { label: 'Hải đảo & Biển đảo', spread: 13 },
      { label: 'Nông thôn & Vùng cao', spread: 19 }
    ];

    periods.forEach((p, idx) => {
      const btn = document.createElement('button');
      btn.className = `album-chip ${idx === 0 ? 'active' : ''}`;
      btn.textContent = p.label;
      btn.addEventListener('click', () => {
        this.dom.filterChips.querySelectorAll('.album-chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        this.goToSpread(p.spread);
      });
      this.dom.filterChips.appendChild(btn);
    });
  }

  renderSpread(spreadIdx) {
    if (!this.activeAlbum) return;

    const leftPageIdx = spreadIdx * 2;
    const rightPageIdx = leftPageIdx + 1;

    const leftPageData = this.activeAlbum.pages[leftPageIdx];
    const rightPageData = this.activeAlbum.pages[rightPageIdx];

    // Render Left Page
    this.renderPageContent(this.dom.leftPage, leftPageData, leftPageIdx + 1, 'left');

    // Render Right Page
    this.renderPageContent(this.dom.rightPage, rightPageData, rightPageIdx + 1, 'right');

    this.updateSpreadUI(spreadIdx);
  }

  updateSpreadUI(spreadIdx) {
    if (!this.activeAlbum) return;
    const totalPages = this.activeAlbum.pages.length;
    const leftPageIdx = spreadIdx * 2;
    const rightPageIdx = leftPageIdx + 1;

    // Update Counter
    if (this.dom.pageIndicator) {
      const curLeft = leftPageIdx + 1;
      const curRight = Math.min(rightPageIdx + 1, totalPages);
      this.dom.pageIndicator.textContent = `Trang ${curLeft} - ${curRight} / ${totalPages}`;
    }

    if (this.dom.pageScrubber) {
      this.dom.pageScrubber.value = spreadIdx;
    }

    // Enable/Disable Prev/Next
    if (this.dom.btnPrev) {
      this.dom.btnPrev.disabled = spreadIdx <= 0;
    }
    if (this.dom.btnNext) {
      this.dom.btnNext.disabled = spreadIdx >= this.totalSpreads - 1;
    }
  }

  renderPageContent(container, pageData, pageNum, side) {
    if (!container) return;
    container.innerHTML = '';

    if (!pageData) {
      // Blank end page
      container.innerHTML = `
        <div class="page-blank">
          <div class="page-watermark">★ CÔNG TY ĐIỆN LỰC VŨNG TÀU ★</div>
        </div>
        <div class="page-footer-num">${pageNum}</div>
      `;
      return;
    }

    if (pageData.type === 'intro') {
      // Elegant Frontispiece / Introduction Page
      const isSouvenir = this.activeAlbumId === 'souvenir_photos';
      container.innerHTML = `
        <div class="page-inner page-intro">
          <div class="intro-ornament-top">❖ ❖ ❖</div>
          <div class="intro-badge">
            <span class="intro-icon">${isSouvenir ? '⚡' : '🎨'}</span>
          </div>
          <h2 class="intro-title">${pageData.title}</h2>
          <h3 class="intro-subtitle">${pageData.subtitle}</h3>
          <div class="intro-divider"></div>
          <p class="intro-desc">${pageData.desc}</p>
          <div class="intro-meta">
            <span>TỔNG SỐ LƯỢNG: <b>${this.activeAlbum.total_items} ${isSouvenir ? 'TƯ LIỆU' : 'TÁC PHẨM'}</b></span>
            <span>GIAI ĐOẠN: <b>1985 - 2025</b></span>
          </div>
          <div class="intro-seal-box">
            <img src="assets/logo.png" alt="EVNHCMC Logo" class="intro-seal-img" />
            <div class="intro-seal-text">
              <span>TỔNG CÔNG TY ĐIỆN LỰC TP. HỒ CHÍ MINH</span>
              <strong>CÔNG TY ĐIỆN LỰC VŨNG TÀU</strong>
            </div>
          </div>
          <div class="page-footer-num">${pageNum}</div>
        </div>
      `;
      return;
    }

    // Photo or Painting Page
    const item = pageData.item;
    if (!item) return;

    const isPainting = pageData.type === 'painting';
    const yearBadge = item.year ? `<span class="photo-badge-year">NĂM ${item.year}</span>` : '';

    container.innerHTML = `
      <div class="page-inner page-photo-layout">
        <div class="photo-header">
          ${yearBadge}
          <span class="photo-category">${isPainting ? 'TRANH KỶ NIỆM' : 'ẢNH TƯ LIỆU'}</span>
        </div>

        <div class="photo-frame-wrapper" title="Nhấp vào để phóng to xem chi tiết">
          <div class="photo-corner corner-tl"></div>
          <div class="photo-corner corner-tr"></div>
          <div class="photo-corner corner-bl"></div>
          <div class="photo-corner corner-br"></div>
          
          <img src="${item.src}" alt="${item.title}" class="album-photo-img-tag" loading="lazy" />
          
          <div class="photo-zoom-hint">
            <i data-lucide="maximize-2"></i>
            <span>Xem cỡ lớn</span>
          </div>
        </div>

        <div class="photo-caption-box">
          <h4 class="photo-title">${item.title}</h4>
          <p class="photo-sub">${isPainting ? 'Tác phẩm nghệ thuật & Tranh tặng kỷ niệm' : 'Ảnh tư liệu ghi lại hoạt động & sự kiện tiêu biểu'}</p>
        </div>

        <div class="page-footer-num">${pageNum}</div>
      </div>
    `;

    // Click on photo to open lightbox
    const frame = container.querySelector('.photo-frame-wrapper');
    if (frame) {
      frame.addEventListener('click', () => {
        this.openPhotoLightbox(item);
      });
    }

    if (window.lucide) window.lucide.createIcons();
  }

  nextSpread() {
    if (this.isFlipping || this.currentSpread >= this.totalSpreads - 1 || !this.activeAlbum) return;
    this.isFlipping = true;

    const currentSpread = this.currentSpread;
    const nextSpread = currentSpread + 1;

    const curLeftIdx = currentSpread * 2;
    const curRightIdx = curLeftIdx + 1;
    const nextLeftIdx = nextSpread * 2;
    const nextRightIdx = nextLeftIdx + 1;

    const curRightData = this.activeAlbum.pages[curRightIdx];
    const nextLeftData = this.activeAlbum.pages[nextLeftIdx];
    const nextRightData = this.activeAlbum.pages[nextRightIdx];

    // 1. Render turning leaf faces:
    // Front face = current right page (lifting up from right side)
    // Back face = next left page (landing down on left side)
    if (this.dom.flipLeaf && this.dom.flipFront && this.dom.flipBack) {
      this.renderPageContent(this.dom.flipFront, curRightData, curRightIdx + 1, 'right');
      this.renderPageContent(this.dom.flipBack, nextLeftData, nextLeftIdx + 1, 'left');

      // 2. Underlying static right page immediately shows next right page
      this.renderPageContent(this.dom.rightPage, nextRightData, nextRightIdx + 1, 'right');

      // 3. Trigger 3D turn animation
      this.dom.flipLeaf.className = 'album-flip-leaf leaf-forward turning-forward';
    }

    // 4. Realistic paper rustle sound
    this.playSound('playPageTurnSound');

    // 5. Update indicators immediately for responsive feedback
    this.currentSpread = nextSpread;
    this.updateSpreadUI(nextSpread);

    // 6. Complete after animation finishes (620ms)
    setTimeout(() => {
      this.renderPageContent(this.dom.leftPage, nextLeftData, nextLeftIdx + 1, 'left');
      if (this.dom.flipLeaf) {
        this.dom.flipLeaf.className = 'album-flip-leaf hidden';
      }
      this.isFlipping = false;
    }, 620);
  }

  prevSpread() {
    if (this.isFlipping || this.currentSpread <= 0 || !this.activeAlbum) return;
    this.isFlipping = true;

    const currentSpread = this.currentSpread;
    const prevSpread = currentSpread - 1;

    const curLeftIdx = currentSpread * 2;
    const curRightIdx = curLeftIdx + 1;
    const prevLeftIdx = prevSpread * 2;
    const prevRightIdx = prevLeftIdx + 1;

    const curLeftData = this.activeAlbum.pages[curLeftIdx];
    const prevLeftData = this.activeAlbum.pages[prevLeftIdx];
    const prevRightData = this.activeAlbum.pages[prevRightIdx];

    // 1. Render turning leaf faces:
    // Front face = current left page (lifting up from left side)
    // Back face = previous right page (landing down on right side)
    if (this.dom.flipLeaf && this.dom.flipFront && this.dom.flipBack) {
      this.renderPageContent(this.dom.flipFront, curLeftData, curLeftIdx + 1, 'left');
      this.renderPageContent(this.dom.flipBack, prevRightData, prevRightIdx + 1, 'right');

      // 2. Underlying static left page immediately shows previous left page
      this.renderPageContent(this.dom.leftPage, prevLeftData, prevLeftIdx + 1, 'left');

      // 3. Trigger 3D turn animation
      this.dom.flipLeaf.className = 'album-flip-leaf leaf-backward turning-backward';
    }

    // 4. Realistic paper rustle sound
    this.playSound('playPageTurnSound');

    // 5. Update indicators
    this.currentSpread = prevSpread;
    this.updateSpreadUI(prevSpread);

    // 6. Complete after animation finishes (620ms)
    setTimeout(() => {
      this.renderPageContent(this.dom.rightPage, prevRightData, prevRightIdx + 1, 'right');
      if (this.dom.flipLeaf) {
        this.dom.flipLeaf.className = 'album-flip-leaf hidden';
      }
      this.isFlipping = false;
    }, 620);
  }

  goToSpread(spreadIdx) {
    if (spreadIdx < 0 || spreadIdx >= this.totalSpreads || spreadIdx === this.currentSpread) return;
    this.playSound('playPageTurnSound');
    this.currentSpread = spreadIdx;
    this.renderSpread(this.currentSpread);
  }

  /**
   * Photo Zoom Lightbox (Bấm vào mỗi ảnh sẽ mở to ra)
   */
  openPhotoLightbox(item) {
    if (!this.dom.photoModal || !item) return;

    this.playSound('playClickSound');

    if (this.dom.photoImg) {
      this.dom.photoImg.src = item.src;
    }
    if (this.dom.photoTitle) {
      this.dom.photoTitle.textContent = item.title;
    }
    if (this.dom.photoYear) {
      this.dom.photoYear.textContent = item.year ? `NĂM ${item.year}` : 'ẢNH TƯ LIỆU';
    }
    if (this.dom.photoDesc) {
      const isPainting = this.activeAlbumId === 'gift_paintings';
      this.dom.photoDesc.textContent = isPainting
        ? `Tác phẩm kỷ niệm do các đơn vị bạn trao tặng Công ty Điện lực Vũng Tàu. Định dạng gốc: ${item.original_filename}.`
        : `Tư liệu lưu trữ lịch sử 40 năm hình thành và phát triển Công ty Điện lực Vũng Tàu. Tệp gốc: ${item.original_filename}.`;
    }

    this.dom.photoModal.classList.remove('hidden');
  }

  closePhotoLightbox() {
    if (this.dom.photoModal) {
      this.dom.photoModal.classList.add('hidden');
      if (this.dom.photoImg) this.dom.photoImg.src = '';
    }
  }

  /**
   * Put down album button ("nút đặt album xuống")
   */
  closeAlbum() {
    if (!this.isOpen) return;

    this.playSound('playBookCloseSound');
    this.closePhotoLightbox();

    if (this.dom.flipLeaf) {
      this.dom.flipLeaf.className = 'album-flip-leaf hidden';
    }
    this.isFlipping = false;

    if (this.dom.modal) {
      this.dom.modal.classList.remove('album-active');
      setTimeout(() => {
        this.dom.modal.classList.add('hidden');
      }, 350);
    }

    this.isOpen = false;

    // Restore first person movement
    if (this.app.controlsManager) {
      this.app.controlsManager.isAlbumViewingActive = false;
      this.app.controlsManager.resetKeys();
    }
  }
}
