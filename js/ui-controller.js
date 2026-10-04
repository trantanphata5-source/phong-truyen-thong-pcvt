import {
  ZONES,
  WALLS,
  PARTITIONS,
  ALBUM_CABINETS,
  GRID_TABLE,
  HALL_TARGETS
} from './layout-config.js';
import {
  renderNarrativeHTML,
  formatDateVN,
  displayTitle,
  escapeHTML,
  NARRATIVE_SOURCE_LABEL
} from './narrative.js';

/**
 * UI Controller (Artsteps Standard)
 * Zero-lag UI with Artsteps Floating Exhibit Card,
 * Bottom Tour Carousel Ribbon, Floor Walk Target, and Minimap
 */
export class UIController {
  constructor(app) {
    this.app = app;
    this.dataService = app.dataService;
    this.controlsManager = app.controlsManager;
    this.audioService = app.audioService;

    this.currentExhibit = null;
    this.currentExhibitIndex = 0;
    this.isTourPlaying = false;
    this.tourTimer = null;

    // Cache DOM
    this.dom = {
      loadingScreen: document.getElementById('loading-screen'),
      loadingBar: document.getElementById('loading-bar'),
      loadingStatus: document.getElementById('loading-status'),
      btnEnter: document.getElementById('btn-enter'),

      // Header
      pillBtns: document.querySelectorAll('.hall-pills .pill-btn'),
      btnFilterToggle: document.getElementById('btn-filter-toggle'),
      filterBadge: document.getElementById('filter-badge'),
      btnMinimapToggle: document.getElementById('btn-minimap-toggle'),
      btnAudioToggle: document.getElementById('btn-audio-toggle'),
      iconAudio: document.getElementById('icon-audio'),
      btnHelpToggle: document.getElementById('btn-help-toggle'),
      btnFullscreen: document.getElementById('btn-fullscreen'),
      iconFullscreen: document.getElementById('icon-fullscreen'),

      // Minimap
      minimapCard: document.getElementById('minimap-card'),
      btnCloseMinimap: document.getElementById('btn-close-minimap'),
      playerMarker: document.getElementById('player-marker'),

      // Floating Exhibit Card
      exhibitCard: document.getElementById('exhibit-card'),
      btnCloseCard: document.getElementById('btn-close-card'),
      cardImg: document.getElementById('card-img'),
      btnOpenLightbox: document.getElementById('btn-open-lightbox'),
      cardTypeTag: document.getElementById('card-type-tag'),
      cardYearTag: document.getElementById('card-year-tag'),
      cardTitle: document.getElementById('card-title'),
      cardOrgIcon: document.getElementById('card-org-icon'),
      cardOrgName: document.getElementById('card-org-name'),
      cardDescription: document.getElementById('card-description'),
      cardCohortItems: document.getElementById('card-cohort-items'),
      cardOrigLink: document.getElementById('card-orig-link'),
      cardMetaLine: document.getElementById('card-meta-line'),
      cardNarrative: document.getElementById('card-narrative'),
      cardOrgRow: document.getElementById('card-org-row'),

      // Tour Ribbon
      tourRibbon: document.getElementById('tour-ribbon'),
      btnTourPrev: document.getElementById('btn-tour-prev'),
      btnTourPlay: document.getElementById('btn-tour-play'),
      iconTourPlay: document.getElementById('icon-tour-play'),
      btnTourNext: document.getElementById('btn-tour-next'),
      tourStepText: document.getElementById('tour-step-text'),
      tourCarousel: document.getElementById('tour-carousel'),

      // Catalog Drawer
      catalogDrawer: document.getElementById('catalog-drawer'),
      btnCloseDrawer: document.getElementById('btn-close-drawer'),
      searchInput: document.getElementById('search-input'),
      btnClearSearch: document.getElementById('btn-clear-search'),
      btnResetAll: document.getElementById('btn-reset-all'),
      chkPairsOnly: document.getElementById('chk-pairs-only'),
      resultsCount: document.getElementById('results-count'),
      catalogList: document.getElementById('catalog-list'),

      // Lightbox
      lightboxModal: document.getElementById('lightbox-modal'),
      btnCloseLightbox: document.getElementById('btn-close-lightbox'),
      lightboxImg: document.getElementById('lightbox-img'),
      lightboxCaption: document.getElementById('lightbox-caption'),

      // Help Modal
      helpModal: document.getElementById('help-modal'),
      btnCloseHelp: document.getElementById('btn-close-help'),
      btnGuideOk: document.getElementById('btn-guide-ok'),

      // Welcome Guide Overlay
      welcomeGuide: document.getElementById('welcome-guide-overlay'),
      btnWelcomeStart: document.getElementById('btn-welcome-start')
    };

    this.initEvents();
    this.renderMinimap();
  }

  initEvents() {
    // Enter Museum
    this.dom.btnEnter?.addEventListener('click', () => {
      this.dom.loadingScreen.classList.add('fade-out');
      document.body.classList.remove('loading-active');
      this.audioService.init();
      this.audioService.playClickSound();

      // Show welcome guide overlay after a short delay for smooth transition
      setTimeout(() => {
        if (this.dom.welcomeGuide) {
          this.dom.welcomeGuide.classList.remove('hidden');
          lucide.createIcons();
        }
      }, 700);
    });

    // Welcome Guide Start Button
    this.dom.btnWelcomeStart?.addEventListener('click', () => {
      if (this.dom.welcomeGuide) {
        this.dom.welcomeGuide.classList.add('hidden');
      }
      this.audioService.playClickSound();
    });

    // Pills Bar Toggle (collapsible secondary nav row)
    const btnPillsToggle = document.getElementById('btn-pills-toggle');
    const pillsBar = document.getElementById('pills-bar');
    btnPillsToggle?.addEventListener('click', () => {
      pillsBar.classList.toggle('collapsed');
      btnPillsToggle.classList.toggle('active', !pillsBar.classList.contains('collapsed'));
      this.audioService.playClickSound();
    });

    // Hall Pill Buttons
    this.dom.pillBtns.forEach(pill => {
      pill.addEventListener('click', () => {
        this.dom.pillBtns.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const hallId = pill.dataset.hall;
        this.controlsManager.teleportToHall(hallId);
        this.audioService.playClickSound();
        // Auto-collapse after navigation
        pillsBar?.classList.add('collapsed');
        btnPillsToggle?.classList.remove('active');
      });
    });

    // Audio Toggle
    this.dom.btnAudioToggle?.addEventListener('click', () => {
      const enabled = this.audioService.toggleAudio();
      this.dom.iconAudio.setAttribute('data-lucide', enabled ? 'volume-2' : 'volume-x');
      lucide.createIcons();
    });

    // Fullscreen Toggle
    this.dom.btnFullscreen?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
        this.dom.iconFullscreen.setAttribute('data-lucide', 'minimize');
      } else {
        document.exitFullscreen().catch(() => {});
        this.dom.iconFullscreen.setAttribute('data-lucide', 'maximize');
      }
      lucide.createIcons();
    });

    // Minimap Toggle
    this.dom.btnMinimapToggle?.addEventListener('click', () => {
      const isHidden = this.dom.minimapCard.classList.toggle('hidden');
      this.dom.btnMinimapToggle.classList.toggle('active', !isHidden);
      this.audioService.playClickSound();
    });

    this.dom.btnCloseMinimap?.addEventListener('click', () => {
      this.dom.minimapCard.classList.add('hidden');
      this.dom.btnMinimapToggle.classList.remove('active');
    });

    // Minimap click events are now dynamically bound in renderMinimap()

    // Filter Drawer Toggle
    this.dom.btnFilterToggle?.addEventListener('click', () => {
      this.dom.catalogDrawer.classList.toggle('hidden');
      this.audioService.playClickSound();
    });

    this.dom.btnCloseDrawer?.addEventListener('click', () => {
      this.dom.catalogDrawer.classList.add('hidden');
    });

    // Search Input
    this.dom.searchInput?.addEventListener('input', (e) => {
      const val = e.target.value;
      this.dom.btnClearSearch.classList.toggle('hidden', !val);
      this.applyFilter({ search: val });
    });

    this.dom.btnClearSearch?.addEventListener('click', () => {
      this.dom.searchInput.value = '';
      this.dom.btnClearSearch.classList.add('hidden');
      this.applyFilter({ search: '' });
    });

    // Reset All Filters Button
    this.dom.btnResetAll?.addEventListener('click', () => {
      if (this.dom.searchInput) this.dom.searchInput.value = '';
      if (this.dom.btnClearSearch) this.dom.btnClearSearch.classList.add('hidden');
      if (this.dom.chkPairsOnly) this.dom.chkPairsOnly.checked = false;

      document.querySelectorAll('.chip-row .chip').forEach(c => {
        c.classList.toggle('active', c.dataset.category === 'all');
      });
      document.querySelectorAll('.org-list .org-item').forEach(o => {
        o.classList.toggle('active', o.dataset.org === 'all');
      });

      this.applyFilter({
        search: '',
        category: 'all',
        org: 'all',
        period: 'all',
        hall: 'all',
        pairsOnly: false,
        year: null
      });

      this.audioService.playClickSound();
    });

    // Pairs Only Toggle
    this.dom.chkPairsOnly?.addEventListener('change', (e) => {
      this.applyFilter({ pairsOnly: e.target.checked });
      this.audioService.playClickSound();
    });

    // Category Chips
    document.querySelectorAll('.chip-row .chip').forEach(c => {
      c.addEventListener('click', () => {
        document.querySelectorAll('.chip-row .chip').forEach(ch => ch.classList.remove('active'));
        c.classList.add('active');
        this.applyFilter({ category: c.dataset.category });
        this.audioService.playClickSound();
      });
    });

    // Org List
    document.querySelectorAll('.org-list .org-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.org-list .org-item').forEach(o => o.classList.remove('active'));
        item.classList.add('active');
        this.applyFilter({ org: item.dataset.org });
        this.audioService.playClickSound();
      });
    });

    // Close Exhibit Card
    this.dom.btnCloseCard?.addEventListener('click', () => {
      this.hideExhibitCard();
    });

    // Lightbox Modal
    this.dom.btnOpenLightbox?.addEventListener('click', () => {
      if (this.currentExhibit) {
        this.openLightbox(this.currentExhibit);
      }
    });

    this.dom.btnCloseLightbox?.addEventListener('click', () => {
      this.dom.lightboxModal.classList.add('hidden');
    });

    // Tour Controls
    this.dom.btnTourPrev?.addEventListener('click', () => {
      this.stepTour(-1);
    });

    this.dom.btnTourNext?.addEventListener('click', () => {
      this.stepTour(1);
    });

    this.dom.btnTourPlay?.addEventListener('click', () => {
      this.toggleTourPlay();
    });

    // Help Modal
    this.dom.btnHelpToggle?.addEventListener('click', () => {
      this.dom.helpModal.classList.remove('hidden');
      this.audioService.playClickSound();
    });

    this.dom.btnCloseHelp?.addEventListener('click', () => {
      this.dom.helpModal.classList.add('hidden');
    });

    this.dom.btnGuideOk?.addEventListener('click', () => {
      this.dom.helpModal.classList.add('hidden');
      this.audioService.playClickSound();
    });

    // Escape Key Handler
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideExhibitCard();
        this.dom.catalogDrawer?.classList.add('hidden');
        this.dom.lightboxModal?.classList.add('hidden');
        this.dom.helpModal?.classList.add('hidden');
      }
    });
  }

  updateLoadingProgress(percent, text) {
    if (this.dom.loadingBar) this.dom.loadingBar.style.width = `${percent}%`;
    if (this.dom.loadingStatus) this.dom.loadingStatus.textContent = `${text} (${Math.round(percent)}%)`;

    if (percent >= 100) {
      if (this.dom.btnEnter) {
        this.dom.btnEnter.classList.remove('hidden');
        if (this.dom.loadingStatus) this.dom.loadingStatus.textContent = 'Phòng truyền thống đã sẵn sàng!';
      }
    }
  }

  buildTourCarousel(items) {
    const container = this.dom.tourCarousel;
    if (!container) return;
    container.innerHTML = '';

    // Group items by khu (room_data.json)
    const khuOrder = ['khu1', 'khu2', 'khu3', 'khu4', 'khu6'];
    const khuLabels = {
      khu1: 'KHU 1', khu2: 'KHU 2', khu3: 'KHU 3', khu4: 'KHU 4', khu6: 'KHU 6'
    };
    const khuColors = {
      khu1: '#8B6F47', khu2: '#8B1A1A', khu3: '#16a34a', khu4: '#C62828', khu6: '#1565C0'
    };

    const grouped = [];
    let globalIdx = 0;
    for (const khu of khuOrder) {
      const khuItems = items.filter(it => it.khu === khu);
      if (khuItems.length === 0) continue;
      grouped.push({ hallId: khu, label: khuLabels[khu] || khu, color: khuColors[khu] || '#94a3b8', items: khuItems, startIdx: globalIdx });
      globalIdx += khuItems.length;
    }
    const unmatched = items.filter(it => !khuOrder.includes(it.khu));
    if (unmatched.length > 0) {
      grouped.push({ hallId: 'other', label: 'KHÁC', color: '#94a3b8', items: unmatched, startIdx: globalIdx });
    }

    let flatIdx = 0;
    grouped.forEach((group, gIdx) => {
      // Add hall divider (skip before first group)
      if (gIdx > 0) {
        const divider = document.createElement('div');
        divider.className = 'tour-hall-divider';
        divider.style.borderColor = group.color;
        divider.innerHTML = `<span class="tour-hall-label" style="color:${group.color}">${group.label}</span>`;
        container.appendChild(divider);
      } else {
        // First group — add label at the start
        const firstLabel = document.createElement('div');
        firstLabel.className = 'tour-hall-divider tour-hall-first';
        firstLabel.style.borderColor = group.color;
        firstLabel.innerHTML = `<span class="tour-hall-label" style="color:${group.color}">${group.label}</span>`;
        container.appendChild(firstLabel);
      }

      group.items.forEach((item) => {
        const currentIdx = flatIdx;
        const card = document.createElement('div');
        card.className = `tour-thumb-card ${flatIdx === 0 ? 'active' : ''}`;
        card.dataset.index = currentIdx;
        card.dataset.id = item.id;
        card.innerHTML = `
          <img src="${item.thumb_path || item.wall_path}" alt="${escapeHTML(displayTitle(item))}" loading="lazy" />
          <span class="tour-thumb-badge">${item.year}</span>
        `;

        card.addEventListener('click', () => {
          this.selectExhibitByIndex(currentIdx);
        });

        container.appendChild(card);
        flatIdx++;
      });
    });
  }

  selectExhibitByIndex(index) {
    const list = this.dataService.filteredItems;
    if (index < 0 || index >= list.length) return;

    this.currentExhibitIndex = index;
    const item = list[index];
    this.currentExhibit = item;

    // Update Counter
    this.dom.tourStepText.textContent = `${index + 1} / ${list.length}`;

    // Highlight thumbnail in carousel
    document.querySelectorAll('.tour-thumb-card').forEach(c => {
      const isActive = Number(c.dataset.index) === index;
      c.classList.toggle('active', isActive);
      if (isActive) {
        c.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    });

    // Fly camera in front of exhibit
    this.app.focusOnExhibit(item);

    // Show floating exhibit info card
    this.showExhibitCard(item);
  }

  stepTour(direction) {
    const list = this.dataService.filteredItems;
    if (list.length === 0) return;
    let nextIdx = (this.currentExhibitIndex + direction + list.length) % list.length;
    this.selectExhibitByIndex(nextIdx);
    this.audioService.playClickSound();
  }

  toggleTourPlay() {
    this.isTourPlaying = !this.isTourPlaying;
    this.dom.iconTourPlay.setAttribute('data-lucide', this.isTourPlaying ? 'pause' : 'play');
    lucide.createIcons();

    if (this.isTourPlaying) {
      this.stepTour(1);
      this.tourTimer = setInterval(() => this.stepTour(1), 6000);
    } else {
      clearInterval(this.tourTimer);
    }
  }

  /**
   * Artsteps Floating Exhibit Card (Lightweight, Zero Lag)
   */
  showExhibitCard(item) {
    this.currentExhibit = item;
    this.dom.cardImg.src = item.thumb_path || item.wall_path;

    // Tiêu đề lớn: GĐ6-fix1 A2 dùng tieu_de || caption. Nếu trống thì hiện "Ảnh ngày dd/mm/yyyy"
    const titleText = displayTitle(item);
    if (titleText) {
      this.dom.cardTitle.textContent = titleText;
    } else if (item.date) {
      this.dom.cardTitle.textContent = `Ảnh ngày ${formatDateVN(item.date)}`;
    } else {
      this.dom.cardTitle.textContent = item.new_name || '';
    }

    // Nhãn loại bằng tiếng Việt thay cho mã
    const typeNames = {
      pcvt: 'Ảnh hoạt động PCVT',
      dang_bo: 'Đảng bộ',
      cong_doan: 'Công đoàn',
      doan_tn: 'Đoàn Thanh niên',
      anh_tu_lieu: 'Ảnh tư liệu',
      tranh_tang: 'Tranh tặng',
      bang_khen: 'Bằng khen',
      co: 'Cờ thi đua'
    };
    this.dom.cardTypeTag.textContent = typeNames[item.source] || item.source || '';

    // Tag năm / ngày
    if (item.date) {
      const parts = item.date.split('-');
      this.dom.cardYearTag.textContent = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : item.date;
    } else {
      this.dom.cardYearTag.textContent = `Năm ${item.year}`;
    }

    // Với ảnh: thay dòng "ĐƠN VỊ TRAO TẶNG" bằng "SỰ KIỆN", hiện caption và ngày đầy đủ.
    // Mục "Đơn vị trao tặng" chỉ hiện cho bằng khen và cờ.
    const isAward = (item.source === 'bang_khen' || item.source === 'co');
    const orgSubEl = document.getElementById('card-org-sub');
    const cohortTitleEl = document.getElementById('card-cohort-title');

    if (isAward) {
      if (orgSubEl) orgSubEl.textContent = 'ĐƠN VỊ TRAO TẶNG';
      this.dom.cardOrgName.textContent = item.org_name || item.org_code || '';
      const icons = {
        CTN: '•', TTCP: '•', EVN: '⚡', EVNSPC: '⚡',
        UBND_BRVT: '🏛', UBND_TPVT: '🏛',
        CD_EVN: '🚩', CD_EVNSPC: '🚩', LDLD_BRVT: '🚩'
      };
      this.dom.cardOrgIcon.textContent = icons[item.org_code] || '🎖';
      this.dom.cardDescription.textContent = item.caption || `${item.item_type || 'Hiện vật'} năm ${item.year}`;
      if (cohortTitleEl) {
        cohortTitleEl.innerHTML = '<i data-lucide="layers"></i> CÙNG NĂM & CÙNG BỘ';
      }
    } else {
      if (orgSubEl) orgSubEl.textContent = 'SỰ KIỆN';
      const dateDisplay = item.date ? formatDateVN(item.date) : `${item.year}`;
      const evTitle = displayTitle(item);
      this.dom.cardOrgName.textContent = evTitle ? `${dateDisplay} • ${evTitle}` : `Sự kiện ngày ${dateDisplay}`;
      this.dom.cardOrgIcon.textContent = '📸';
      this.dom.cardDescription.textContent = evTitle ? `${evTitle} (ngày ${dateDisplay})` : `Ảnh hoạt động ngày ${dateDisplay}`;
      if (cohortTitleEl) {
        cohortTitleEl.innerHTML = '<i data-lucide="layers"></i> CÙNG SỰ KIỆN';
      }
    }

    // GĐ6-fix1 A3: Ảnh khu 3, 4, 6 có trong thuyet_minh_anh.json
    //  - Dòng nhỏ: "Ngày dd/mm/yyyy · Nguồn: Ngôi nhà EVNHCMC"
    //  - Khung thuyết minh: nguyên văn (ẩn nếu ảnh chưa có thuyết minh, chỉ hiện tiêu đề và ngày)
    const hasTieuDe = !!item.tieu_de;
    const hasNarrative = !!item.thuyet_minh;
    const metaEl = this.dom.cardMetaLine;
    const narEl = this.dom.cardNarrative;
    if (hasTieuDe) {
      const d = formatDateVN(item.tm_ngay || item.date);
      if (metaEl) {
        metaEl.textContent = hasNarrative
          ? `Ngày ${d} · Nguồn: ${NARRATIVE_SOURCE_LABEL}`
          : `Ngày ${d}`;
        metaEl.classList.remove('hidden');
      }
      if (narEl) {
        if (hasNarrative) {
          narEl.innerHTML = renderNarrativeHTML(item.thuyet_minh);
          narEl.scrollTop = 0;
          narEl.classList.remove('hidden');
        } else {
          narEl.innerHTML = '';
          narEl.classList.add('hidden');
        }
      }
      // Thay thế hàng SỰ KIỆN + mô tả lặp lại tiêu đề
      this.dom.cardOrgRow?.classList.add('hidden');
      this.dom.cardDescription.classList.add('hidden');
      this.dom.exhibitCard.classList.toggle('has-narrative', hasNarrative);
    } else {
      metaEl?.classList.add('hidden');
      if (narEl) { narEl.innerHTML = ''; narEl.classList.add('hidden'); }
      this.dom.cardOrgRow?.classList.remove('hidden');
      this.dom.cardDescription.classList.remove('hidden');
      this.dom.exhibitCard.classList.remove('has-narrative');
    }

    this.dom.cardOrigLink.href = item.full_path || item.wall_path || '';

    // Cohort items
    this.renderCohortItems(item);

    this.dom.exhibitCard.classList.remove('hidden');
    lucide.createIcons();
  }

  renderCohortItems(item) {
    const container = this.dom.cardCohortItems;
    if (!container) return;
    container.innerHTML = '';

    const related = this.dataService.getRelatedItems(item);
    if (related.length === 0) {
      container.innerHTML = '<span style="font-size:10px;color:#64748b;">Không có hiện vật cùng bộ</span>';
      return;
    }

    related.forEach(rel => {
      const chip = document.createElement('div');
      chip.className = 'cohort-item-chip';
      const labelText = displayTitle(rel) || rel.new_name || '';
      chip.innerHTML = `
        <img class="cohort-thumb" src="${rel.thumb_path || rel.wall_path}" alt="${escapeHTML(labelText)}" />
        <span class="cohort-info" title="${escapeHTML(labelText)}">${escapeHTML(labelText)}</span>
      `;
      chip.addEventListener('click', () => {
        const idx = this.dataService.filteredItems.findIndex(it => it.id === rel.id);
        if (idx !== -1) {
          this.selectExhibitByIndex(idx);
        } else {
          this.showExhibitCard(rel);
          this.app.focusOnExhibit(rel);
        }
      });
      container.appendChild(chip);
    });
  }

  hideExhibitCard() {
    this.dom.exhibitCard.classList.add('hidden');
  }

  openLightbox(item) {
    this.dom.lightboxImg.src = item.full_path || item.wall_path || item.thumb_path;
    const sourceLabel = { bang_khen: 'Bằng khen', co: 'Cờ thi đua', anh_tu_lieu: 'Ảnh tư liệu', tranh_tang: 'Tranh tặng', pcvt: 'PCVT', dang_bo: 'Đảng bộ', cong_doan: 'Công đoàn', doan_tn: 'Đoàn TN' };
    const orgDisplay = item.org_name || item.org_code || '';
    this.dom.lightboxCaption.innerHTML = `
      <div style="font-family: var(--font-sans); font-size: 16px; font-weight: 700; color: #facc15; margin-bottom: 4px; letter-spacing: 0.2px;">${escapeHTML(displayTitle(item) || item.new_name || '')}</div>
      <div style="font-family: var(--font-sans); font-size: 13px; font-weight: 500; color: #cbd5e1;">${sourceLabel[item.source] || item.source} • Năm ${item.year} • ${orgDisplay}</div>
    `;
    this.dom.lightboxModal.classList.remove('hidden');
    this.audioService.playClickSound();
  }

  applyFilter(changes) {
    const results = this.dataService.applyFilter(changes);
    this.dom.filterBadge.textContent = results.length;
    this.dom.resultsCount.textContent = `${results.length} hiện vật`;
    this.renderCatalogList(results);
    this.buildTourCarousel(results);

    // Update 3D visibility
    this.app.updateExhibitVisibility(results);
  }

  renderCatalogList(items) {
    const container = this.dom.catalogList;
    if (!container) return;
    container.innerHTML = '';

    items.slice(0, 60).forEach((item, idx) => {
      const el = document.createElement('div');
      el.className = 'catalog-item';
      el.innerHTML = `
        <img class="catalog-thumb" src="${item.thumb_path || item.wall_path}" alt="${escapeHTML(displayTitle(item))}" loading="lazy" />
        <div class="catalog-info">
          <span class="catalog-item-title">${escapeHTML(displayTitle(item) || item.new_name || '')}</span>
          <span class="catalog-item-meta">${item.year} • ${item.org_name || item.org_code || ''} • ${item.source}</span>
        </div>
      `;
      el.addEventListener('click', () => {
        this.selectExhibitByIndex(idx);
        this.dom.catalogDrawer.classList.add('hidden');
      });
      container.appendChild(el);
    });
  }

  /**
   * GĐ6 - Mục 8: Minimap sinh động từ layout-config.js
   * Tỷ lệ 1 đơn vị SVG = 1 mét thật (viewBox -52 -57 104 141)
   */
  renderMinimap() {
    const svg = document.getElementById('minimap-svg');
    if (!svg) return;

    svg.setAttribute('viewBox', '-52 -57 104 141');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    const svgParts = [];

    // 1. Defs: Radial gradient for light cone (dải màu rgba(255,236,150,0.55) nhạt dần ra trong suốt)
    svgParts.push(`
      <defs>
        <radialGradient id="player-cone-gradient" cx="0" cy="0" r="9" fx="0" fy="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#FFE796" stop-opacity="0.55" />
          <stop offset="35%" stop-color="#FFE796" stop-opacity="0.30" />
          <stop offset="75%" stop-color="#FFE796" stop-opacity="0.08" />
          <stop offset="100%" stop-color="#FFE796" stop-opacity="0" />
        </radialGradient>
      </defs>
    `);

    // 2. Museum overall floor background
    svgParts.push(`
      <rect x="-51.5" y="-56.5" width="103" height="140" rx="2" fill="#070c18" stroke="#1e293b" stroke-width="0.8" />
    `);

    // 3. Zone floor areas (Tô màu chủ đề, độ mờ 15%, tương tác click)
    svgParts.push(`
      <!-- Khu 1: Tây -->
      <g class="minimap-zone" data-zone="khu1" style="cursor: pointer;">
        <rect class="zone-floor" x="-50" y="-25" width="32" height="50" fill="rgba(245, 235, 215, 0.15)" stroke="rgba(245, 235, 215, 0.25)" stroke-width="0.3" />
      </g>
      <!-- Khu 2: Bắc -->
      <g class="minimap-zone" data-zone="khu2" style="cursor: pointer;">
        <rect class="zone-floor" x="-18" y="-55" width="36" height="38" fill="rgba(139, 26, 26, 0.18)" stroke="rgba(139, 26, 26, 0.3)" stroke-width="0.3" />
      </g>
      <!-- Khu 3: Đông -->
      <g class="minimap-zone" data-zone="khu3" style="cursor: pointer;">
        <rect class="zone-floor" x="18" y="-25" width="32" height="50" fill="rgba(34, 211, 238, 0.14)" stroke="rgba(34, 211, 238, 0.25)" stroke-width="0.3" />
      </g>
      <!-- Sảnh trung tâm: [-17.5, 17.5] x [-17, 38] -->
      <g class="minimap-zone" data-zone="lobby" style="cursor: pointer;">
        <rect class="zone-floor" x="-17.5" y="-17" width="35" height="55" fill="rgba(30, 64, 160, 0.15)" stroke="rgba(30, 64, 160, 0.25)" stroke-width="0.3" />
      </g>
      <!-- Hành lang kết nối z 25..38 -->
      <rect x="-50" y="25" width="100" height="13" fill="rgba(255, 255, 255, 0.03)" pointer-events="none" />
      <!-- Khu 6: Tây Nam -->
      <g class="minimap-zone" data-zone="khu6" style="cursor: pointer;">
        <rect class="zone-floor" x="-50" y="38" width="28" height="44" fill="rgba(30, 58, 95, 0.22)" stroke="rgba(30, 58, 95, 0.3)" stroke-width="0.3" />
      </g>
      <!-- Khu 5: Nam (Văn hóa HCM) -->
      <g class="minimap-zone" data-zone="khu5" style="cursor: pointer;">
        <rect class="zone-floor" x="-22" y="38" width="44" height="44" fill="rgba(107, 21, 32, 0.20)" stroke="rgba(212, 175, 55, 0.3)" stroke-width="0.3" />
      </g>
      <!-- Khu 4: Đông Nam -->
      <g class="minimap-zone" data-zone="khu4" style="cursor: pointer;">
        <rect class="zone-floor" x="22" y="38" width="28" height="44" fill="rgba(185, 28, 28, 0.18)" stroke="rgba(185, 28, 28, 0.3)" stroke-width="0.3" />
      </g>
    `);

    // 4. Vòng Logo & Đài hoa sảnh
    svgParts.push(`
      <circle cx="0" cy="0" r="12" fill="rgba(30,64,160,0.10)" stroke="rgba(212,175,55,0.35)" stroke-width="0.7" stroke-dasharray="1.5,1.5" pointer-events="none" />
      <circle cx="0" cy="0" r="4.5" fill="rgba(30,64,160,0.25)" stroke="#D4AF37" stroke-width="0.5" pointer-events="none" />
    `);

    // 5. 2 Tủ Album xoay ±45°
    svgParts.push(`
      ${ALBUM_CABINETS.map(c => `<g transform="translate(${c.position.x}, ${c.position.z}) rotate(${c.rotY > 0 ? 45 : -45})" pointer-events="none">
        <rect x="-1.1" y="-0.45" width="2.2" height="0.9" rx="0.2" fill="#D4AF37" stroke="#F6D26B" stroke-width="0.25" />
      </g>`).join('')}
    `);

    // 6. Sa bàn lưới điện (26, 0)
    svgParts.push(`
      <rect x="23" y="-2.1" width="6.0" height="4.2" rx="0.4" fill="#0A1224" stroke="#22D3EE" stroke-width="0.5" pointer-events="none" />
      <text x="26" y="0.4" font-family="'Be Vietnam Pro', sans-serif" font-size="1.5" font-weight="700" fill="#22D3EE" text-anchor="middle" pointer-events="none">SA BÀN</text>
    `);

    // 7. Partitions (Vách mốc son x=35 và Vách tranh x=-35)
    svgParts.push(`
      <rect x="-35.4" y="-12" width="0.8" height="24" fill="#8B6F47" stroke="#F5EBD7" stroke-width="0.2" pointer-events="none" />
      <rect x="34.7" y="-12" width="0.6" height="24" fill="#1E40A0" stroke="#38BDF8" stroke-width="0.3" pointer-events="none" />
    `);

    // 8. Tường thực tế (từ WALLS & tường HCM với độ dày 1.2m và hở cửa)
    const wallElements = [];
    WALLS.forEach(w => {
      const isVertical = Math.abs(Math.abs(w.rotY) - Math.PI / 2) < 0.01;
      let rx, ry, rw, rh;
      if (isVertical) {
        rx = w.x - w.d / 2;
        ry = w.z - w.w / 2;
        rw = w.d;
        rh = w.w;
      } else {
        rx = w.x - w.w / 2;
        ry = w.z - w.d / 2;
        rw = w.w;
        rh = w.d;
      }
      wallElements.push(`<rect x="${rx.toFixed(2)}" y="${ry.toFixed(2)}" width="${rw.toFixed(2)}" height="${rh.toFixed(2)}" fill="#334155" stroke="rgba(255,255,255,0.4)" stroke-width="0.25" pointer-events="none" />`);
    });

    // Tường HCM: Tây (-22), Đông (22), Nam (82), Bắc (38, hở cửa -5..5)
    wallElements.push(`
      <rect x="-22.6" y="38" width="1.2" height="44" fill="#334155" stroke="rgba(255,255,255,0.4)" stroke-width="0.25" pointer-events="none" />
      <rect x="21.4" y="38" width="1.2" height="44" fill="#334155" stroke="rgba(255,255,255,0.4)" stroke-width="0.25" pointer-events="none" />
      <rect x="-22" y="81.4" width="44" height="1.2" fill="#334155" stroke="rgba(255,255,255,0.4)" stroke-width="0.25" pointer-events="none" />
      <rect x="-22" y="37.4" width="17" height="1.2" fill="#334155" stroke="rgba(255,255,255,0.4)" stroke-width="0.25" pointer-events="none" />
      <rect x="5" y="37.4" width="17" height="1.2" fill="#334155" stroke="rgba(255,255,255,0.4)" stroke-width="0.25" pointer-events="none" />
    `);
    svgParts.push(wallElements.join('\n'));

    // 9. Zone Labels (Font Be Vietnam Pro, số và tên ngắn)
    svgParts.push(`
      <!-- Sảnh -->
      <text x="0" y="22" class="minimap-label">SẢNH</text>
      <text x="0" y="25" class="minimap-sublabel">Trung tâm</text>

      <!-- Khu 1 -->
      <text x="-34" y="18" class="minimap-label">KHU 1</text>
      <text x="-34" y="21" class="minimap-sublabel">Ký ức</text>

      <!-- Khu 2 -->
      <text x="0" y="-45" class="minimap-label">KHU 2</text>
      <text x="0" y="-42" class="minimap-sublabel">Vinh quang</text>

      <!-- Khu 3 -->
      <text x="34" y="18" class="minimap-label">KHU 3</text>
      <text x="34" y="21" class="minimap-sublabel">Hiện tại</text>

      <!-- Khu 4 -->
      <text x="36" y="62" class="minimap-label">KHU 4</text>
      <text x="36" y="65" class="minimap-sublabel">Đảng bộ</text>

      <!-- Khu 5 -->
      <text x="0" y="62" class="minimap-label">KHU 5</text>
      <text x="0" y="65" class="minimap-sublabel">Văn hóa HCM</text>

      <!-- Khu 6 -->
      <text x="-36" y="62" class="minimap-label">KHU 6</text>
      <text x="-36" y="65" class="minimap-sublabel">CĐ - ĐTN</text>
    `);

    // 10. Chấm định vị và Nón ánh sáng (#player-marker được đặt cuối để luôn nổi lên trên)
    svgParts.push(`
      <g id="player-marker">
        <path id="player-cone" class="player-cone" fill="url(#player-cone-gradient)" stroke="none" />
        <circle class="player-pulse" cx="0" cy="0" r="1.2" />
        <circle class="player-dot" cx="0" cy="0" r="1.2" />
      </g>
    `);

    svg.innerHTML = svgParts.join('\n');

    // Cache dynamic references
    this.dom.playerMarker = document.getElementById('player-marker');
    this.dom.playerCone = document.getElementById('player-cone');

    // Attach click events on zones for smooth camera glide
    svg.querySelectorAll('.minimap-zone').forEach(zoneEl => {
      zoneEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const zoneId = zoneEl.dataset.zone;
        if (zoneId) {
          this.controlsManager?.teleportToHall(zoneId);
          this.audioService?.playClickSound();
          this.dom.pillBtns?.forEach(p => p.classList.toggle('active', p.dataset.hall === zoneId));
        }
      });
    });
  }

  /**
   * GĐ6 - Mục 8: Cập nhật minimap mỗi khung hình
   * Sai số tọa độ SVG so với 3D = 0.000m (tỷ lệ 1:1, viewBox khớp tuyệt đối)
   * Nón sáng hình quạt 9m co giãn theo fovH và quay đúng 360° theo camRotY
   */
  updateMinimap(camPos, camRotY, fovH = 1.0) {
    if (!this.dom.playerMarker) return;
    const deg = (-camRotY * 180) / Math.PI;
    this.dom.playerMarker.setAttribute(
      'transform',
      `translate(${camPos.x.toFixed(2)}, ${camPos.z.toFixed(2)}) rotate(${deg.toFixed(2)})`
    );

    if (fovH !== undefined && fovH !== this._lastFovH && this.dom.playerCone) {
      this._lastFovH = fovH;
      const R = 9.0;
      const alpha = fovH / 2;
      const x1 = -R * Math.sin(alpha);
      const y1 = -R * Math.cos(alpha);
      const x2 = R * Math.sin(alpha);
      const y2 = -R * Math.cos(alpha);
      const largeArc = fovH > Math.PI ? 1 : 0;
      this.dom.playerCone.setAttribute(
        'd',
        `M 0 0 L ${x1.toFixed(3)} ${y1.toFixed(3)} A ${R} ${R} 0 ${largeArc} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`
      );
    }
  }
}
