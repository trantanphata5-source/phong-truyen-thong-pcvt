/**
 * Album Viewer Module (GĐ4 – 4 Albums with Tabs & Chapters)
 * Supports:
 * - 4 albums: souvenir, awards_flags, pcvt, doan_the
 * - Full 4-tab quick switcher inside the modal header
 * - Robust caching prevention (?v=timestamp)
 * - Chapter navigation from albums_data.json
 * - Realistic dual-page flip with real page-flip.mp3 sound
 * - Individual photo zoom lightbox
 */
import { renderNarrativeHTML, formatDateVN, escapeHTML, NARRATIVE_SOURCE_LABEL } from './narrative.js';

export class AlbumViewer {
  constructor(app) {
    this.app = app;
    this.audio = app.audioService;
    this.data = [];           // full album data array
    this.albumMap = {};       // id -> album object
    this.activeAlbumId = null;
    this.activeAlbum = null;
    this.currentSpread = 0;
    this.isOpen = false;
    this.isFlipping = false;
    this._closeTimeout = null;

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
      tabsNav: document.getElementById('album-tabs-nav'),
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
      // Force cache-busting so browser always loads latest 4 albums
      const resp = await fetch('assets/albums_data.json?v=' + Date.now());
      if (resp.ok) {
        const raw = await resp.json();
        this.albumMap = {};

        if (Array.isArray(raw)) {
          this.data = raw;
          raw.forEach(a => {
            this.albumMap[a.id] = a;
            // Legacy aliases
            if (a.id === 'souvenir') this.albumMap['souvenir_photos'] = a;
            if (a.id === 'awards_flags') this.albumMap['gift_paintings'] = a;
          });
        } else if (raw.albums) {
          this.data = Object.values(raw.albums);
          this.albumMap = { ...raw.albums };
          if (raw.albums['souvenir_photos']) this.albumMap['souvenir'] = raw.albums['souvenir_photos'];
          if (raw.albums['gift_paintings']) this.albumMap['awards_flags'] = raw.albums['gift_paintings'];
        }

        console.log('✅ Albums data loaded successfully:', Object.keys(this.albumMap));
      } else {
        console.error('Failed to fetch albums_data.json, status:', resp.status);
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
   * Build Top Tabs for all 4 Albums
   */
  buildAlbumTabs() {
    if (!this.dom.tabsNav) return;
    this.dom.tabsNav.innerHTML = '';

    const tabConfigs = [
      { id: 'souvenir', icon: '📖', label: 'Ảnh Lưu Niệm', pages: 108 },
      { id: 'awards_flags', icon: '🏅', label: 'Bằng Khen & Cờ', pages: 211 },
      { id: 'pcvt', icon: '⚡', label: 'ĐL Vũng Tàu', pages: 100 },
      { id: 'doan_the', icon: '🚩', label: 'Đoàn Thể', pages: 120 }
    ];

    tabConfigs.forEach(cfg => {
      const btn = document.createElement('button');
      btn.className = `album-nav-tab ${cfg.id === this.activeAlbumId ? 'active' : ''}`;
      btn.innerHTML = `
        <span class="tab-icon">${cfg.icon}</span>
        <span class="tab-label">${cfg.label}</span>
        <span class="tab-badge">(${cfg.pages})</span>
      `;
      btn.title = `Xem ${cfg.label} (${cfg.pages} trang)`;
      btn.addEventListener('click', () => {
        if (cfg.id !== this.activeAlbumId) {
          this.openAlbum(cfg.id);
        }
      });
      this.dom.tabsNav.appendChild(btn);
    });
  }

  /**
   * Open the Album Viewer
   * Accepts new album IDs: souvenir, awards_flags, pcvt, doan_the
   * Also accepts legacy IDs: souvenir_photos, gift_paintings
   */
  openAlbum(albumId = 'souvenir') {
    if (this._closeTimeout) {
      clearTimeout(this._closeTimeout);
      this._closeTimeout = null;
    }

    // Resolve legacy IDs
    const legacyMap = { 'souvenir_photos': 'souvenir', 'gift_paintings': 'awards_flags' };
    const normalizedId = legacyMap[albumId] || albumId;

    let album = this.albumMap[normalizedId] || this.albumMap[albumId];
    if (!album) {
      // Fallback to first available album
      const keys = Object.keys(this.albumMap);
      if (keys.length > 0) {
        album = this.albumMap[keys[0]];
        albumId = album.id || keys[0];
      } else {
        console.warn(`Album "${albumId}" not found and no data loaded yet`);
        return;
      }
    } else {
      albumId = normalizedId;
    }

    this.activeAlbumId = albumId;
    this.activeAlbum = album;
    this.currentSpread = 0;
    this.isOpen = true;

    // Lock camera/player movement
    if (this.app.controlsManager) {
      this.app.controlsManager.isAlbumViewingActive = true;
      this.app.controlsManager.resetKeys();
    }

    // Play pickup audio
    this.playSound('playBookOpenSound');

    // Update Header Text
    if (this.dom.titleText) {
      this.dom.titleText.textContent = (album.title || albumId).toUpperCase();
    }
    if (this.dom.subtitleText) {
      this.dom.subtitleText.textContent = album.subtitle || '';
    }

    // Build/Update the 4-album switcher tabs
    this.buildAlbumTabs();

    // Set cover theme
    if (this.dom.bookStage) {
      this.dom.bookStage.dataset.theme = albumId;
    }

    // Total pages – album.pages is an array of page objects
    const pages = album.pages || [];
    const totalPages = pages.length;
    this.totalSpreads = Math.max(1, Math.ceil(totalPages / 2));

    if (this.dom.pageScrubber) {
      this.dom.pageScrubber.min = 0;
      this.dom.pageScrubber.max = this.totalSpreads - 1;
      this.dom.pageScrubber.value = 0;
    }

    // Build Chapter Chips (from album.chapters)
    this.buildChapterChips();

    // Render First Spread
    this.renderSpread(this.currentSpread);

    // Show modal immediately
    if (this.dom.modal) {
      this.dom.modal.classList.remove('hidden');
      // Small reflow to guarantee CSS transition triggers
      void this.dom.modal.offsetWidth;
      this.dom.modal.classList.add('album-active');
    }
  }

  /**
   * Build chapter navigation chips from album.chapters
   */
  buildChapterChips() {
    if (!this.dom.filterChips) return;
    this.dom.filterChips.innerHTML = '';

    const chapters = this.activeAlbum?.chapters || [];
    if (chapters.length === 0) return;

    // "All" button first
    const totalPages = (this.activeAlbum.pages || []).length;
    const allBtn = document.createElement('button');
    allBtn.className = 'album-chip active';
    allBtn.textContent = `Tất cả (${totalPages})`;
    allBtn.addEventListener('click', () => {
      this.dom.filterChips.querySelectorAll('.album-chip').forEach(c => c.classList.remove('active'));
      allBtn.classList.add('active');
      this.goToSpread(0);
    });
    this.dom.filterChips.appendChild(allBtn);

    // Chapter buttons
    chapters.forEach(ch => {
      const btn = document.createElement('button');
      btn.className = 'album-chip';
      btn.textContent = ch.title;
      btn.addEventListener('click', () => {
        this.dom.filterChips.querySelectorAll('.album-chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        // Jump to the spread containing the chapter start page
        const spreadIdx = Math.floor((ch.start || 0) / 2);
        this.goToSpread(spreadIdx);
      });
      this.dom.filterChips.appendChild(btn);
    });
  }

  renderSpread(spreadIdx) {
    if (!this.activeAlbum) return;
    const pages = this.activeAlbum.pages || [];

    const leftPageIdx = spreadIdx * 2;
    const rightPageIdx = leftPageIdx + 1;

    const leftPageData = pages[leftPageIdx];
    const rightPageData = pages[rightPageIdx];

    // Render Left Page
    this.renderPageContent(this.dom.leftPage, leftPageData, leftPageIdx + 1, 'left');

    // Render Right Page
    this.renderPageContent(this.dom.rightPage, rightPageData, rightPageIdx + 1, 'right');

    this.updateSpreadUI(spreadIdx);
  }

  updateSpreadUI(spreadIdx) {
    if (!this.activeAlbum) return;
    const pages = this.activeAlbum.pages || [];
    const totalPages = pages.length;
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
          <div class="page-watermark">• CÔNG TY ĐIỆN LỰC VŨNG TÀU •</div>
        </div>
        <div class="page-footer-num">${pageNum}</div>
      `;
      return;
    }

    // GĐ4: New format pages have: { full, thumb, caption, date }
    // Legacy format pages have: { type: 'intro'|'photo'|'painting', item: {...} }
    if (pageData.type === 'intro') {
      container.innerHTML = `
        <div class="page-inner page-intro">
          <div class="intro-ornament-top">❖ ❖ ❖</div>
          <div class="intro-badge">
            <span class="intro-icon">⚡</span>
          </div>
          <h2 class="intro-title">${pageData.title || ''}</h2>
          <h3 class="intro-subtitle">${pageData.subtitle || ''}</h3>
          <div class="intro-divider"></div>
          <p class="intro-desc">${pageData.desc || ''}</p>
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

    // Determine image source and caption
    let imgSrc, title, year, isPainting;
    let narrativeItem = null;
    if (pageData.full) {
      imgSrc = pageData.thumb || pageData.full;
      title = pageData.caption || '';
      year = pageData.date && pageData.date !== '0' ? pageData.date : '';
      isPainting = false;
      // GĐ6-fix1 A4: ảnh trùng full_path / wall_path / tên file với thuyet_minh_anh.json
      const ds = this.app?.dataService;
      if (ds && typeof ds.findNarrativeItemByPath === 'function') {
        narrativeItem = ds.findNarrativeItemByPath(pageData.full) || ds.findNarrativeItemByPath(pageData.thumb);
        if (narrativeItem && narrativeItem.tieu_de) title = narrativeItem.tieu_de;
      }
    } else if (pageData.item) {
      const item = pageData.item;
      imgSrc = item.src;
      title = item.title || '';
      year = item.year || '';
      isPainting = pageData.type === 'painting';
    } else {
      container.innerHTML = `<div class="page-blank"><div class="page-footer-num">${pageNum}</div></div>`;
      return;
    }

    const yearBadge = year ? `<span class="photo-badge-year">${year}</span>` : '';
    const hasNarrative = !!(narrativeItem && narrativeItem.thuyet_minh);
    const narrativeBtn = hasNarrative
      ? `<button type="button" class="album-narrative-btn"><i data-lucide="book-open-text"></i> Xem thuyết minh</button>`
      : '';

    container.innerHTML = `
      <div class="page-inner page-photo-layout">
        <div class="photo-header">
          ${yearBadge}
          <span class="photo-category">${isPainting ? 'TRANH KỶ NIỆM' : this.activeAlbum?.title || 'ẢNH TƯ LIỆU'}</span>
        </div>

        <div class="photo-frame-wrapper" title="Nhấp vào để phóng to xem chi tiết">
          <div class="photo-corner corner-tl"></div>
          <div class="photo-corner corner-tr"></div>
          <div class="photo-corner corner-bl"></div>
          <div class="photo-corner corner-br"></div>
          
          <img src="${imgSrc}" alt="${escapeHTML(title)}" class="album-photo-img-tag" loading="lazy" />
          
          <div class="photo-zoom-hint">
            <i data-lucide="maximize-2"></i>
            <span>Xem cỡ lớn</span>
          </div>
        </div>

        <div class="photo-caption-box">
          <h4 class="photo-title">${escapeHTML(title)}</h4>
          ${narrativeBtn}
        </div>

        <div class="page-footer-num">${pageNum}</div>
      </div>
    `;

    // GĐ6-fix1 A4: nút "Xem thuyết minh" mở rộng ra nguyên văn (phủ lên trang, có thanh cuộn)
    if (hasNarrative) {
      const btn = container.querySelector('.album-narrative-btn');
      const inner = container.querySelector('.page-inner');
      btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (inner.querySelector('.album-narrative-panel')) return;
        const panel = document.createElement('div');
        panel.className = 'album-narrative-panel';
        panel.innerHTML = `
          <div class="album-narrative-head">
            <div>
              <div class="album-narrative-title">${escapeHTML(narrativeItem.tieu_de || title)}</div>
              <div class="album-narrative-meta">Ngày ${formatDateVN(narrativeItem.tm_ngay || narrativeItem.date)} · Nguồn: ${NARRATIVE_SOURCE_LABEL}</div>
            </div>
            <button type="button" class="album-narrative-close" title="Thu gọn">×</button>
          </div>
          <div class="album-narrative-text">${renderNarrativeHTML(narrativeItem.thuyet_minh)}</div>
        `;
        panel.addEventListener('click', ev => ev.stopPropagation());
        panel.addEventListener('wheel', ev => ev.stopPropagation(), { passive: true });
        panel.querySelector('.album-narrative-close').addEventListener('click', ev => {
          ev.stopPropagation();
          panel.remove();
        });
        inner.appendChild(panel);
      });
    }

    // Click on photo to open lightbox
    const frame = container.querySelector('.photo-frame-wrapper');
    if (frame) {
      frame.addEventListener('click', () => {
        this.openPhotoLightbox({
          src: pageData.full || (pageData.item && pageData.item.src) || imgSrc,
          title: title,
          year: year,
          original_filename: (pageData.item && pageData.item.original_filename) || ''
        });
      });
    }

    if (window.lucide) window.lucide.createIcons();
  }

  nextSpread() {
    if (this.isFlipping || this.currentSpread >= this.totalSpreads - 1 || !this.activeAlbum) return;
    this.isFlipping = true;
    const pages = this.activeAlbum.pages || [];

    const currentSpread = this.currentSpread;
    const nextSpread = currentSpread + 1;

    const curRightIdx = currentSpread * 2 + 1;
    const nextLeftIdx = nextSpread * 2;
    const nextRightIdx = nextLeftIdx + 1;

    const curRightData = pages[curRightIdx];
    const nextLeftData = pages[nextLeftIdx];
    const nextRightData = pages[nextRightIdx];

    if (this.dom.flipLeaf && this.dom.flipFront && this.dom.flipBack) {
      this.renderPageContent(this.dom.flipFront, curRightData, curRightIdx + 1, 'right');
      this.renderPageContent(this.dom.flipBack, nextLeftData, nextLeftIdx + 1, 'left');
      this.renderPageContent(this.dom.rightPage, nextRightData, nextRightIdx + 1, 'right');
      this.dom.flipLeaf.className = 'album-flip-leaf leaf-forward turning-forward';
    }

    this.playSound('playPageTurnSound');

    this.currentSpread = nextSpread;
    this.updateSpreadUI(nextSpread);

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
    const pages = this.activeAlbum.pages || [];

    const currentSpread = this.currentSpread;
    const prevSpread = currentSpread - 1;

    const curLeftIdx = currentSpread * 2;
    const prevLeftIdx = prevSpread * 2;
    const prevRightIdx = prevLeftIdx + 1;

    const curLeftData = pages[curLeftIdx];
    const prevLeftData = pages[prevLeftIdx];
    const prevRightData = pages[prevRightIdx];

    if (this.dom.flipLeaf && this.dom.flipFront && this.dom.flipBack) {
      this.renderPageContent(this.dom.flipFront, curLeftData, curLeftIdx + 1, 'left');
      this.renderPageContent(this.dom.flipBack, prevRightData, prevRightIdx + 1, 'right');
      this.renderPageContent(this.dom.leftPage, prevLeftData, prevLeftIdx + 1, 'left');
      this.dom.flipLeaf.className = 'album-flip-leaf leaf-backward turning-backward';
    }

    this.playSound('playPageTurnSound');

    this.currentSpread = prevSpread;
    this.updateSpreadUI(prevSpread);

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
   * Photo Zoom Lightbox
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
      this.dom.photoYear.textContent = item.year ? `${item.year}` : '';
    }
    if (this.dom.photoDesc) {
      this.dom.photoDesc.textContent = `Tư liệu Phòng Truyền Thống – Công ty Điện lực Vũng Tàu.`;
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
   * Put down album (close viewer)
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
      this._closeTimeout = setTimeout(() => {
        if (!this.isOpen) {
          this.dom.modal.classList.add('hidden');
        }
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
