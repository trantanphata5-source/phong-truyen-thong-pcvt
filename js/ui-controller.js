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

    // Minimap Hall Clicks
    document.querySelectorAll('.hall-zone, .rotunda-zone').forEach(zone => {
      zone.addEventListener('click', (e) => {
        e.stopPropagation();
        const hallId = zone.dataset.hall;
        this.controlsManager.teleportToHall(hallId);
        this.dom.pillBtns.forEach(p => p.classList.toggle('active', p.dataset.hall === hallId));
        this.audioService.playClickSound();
      });
    });

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

    // Group items by hall_id, maintaining order within each group
    const hallOrder = ['hall_1', 'hall_2', 'hall_3'];
    const hallLabels = {
      'hall_1': 'KHU 1',
      'hall_2': 'KHU 2',
      'hall_3': 'KHU 3'
    };
    const hallColors = {
      'hall_1': '#eab308',
      'hall_2': '#3b82f6',
      'hall_3': '#22c55e'
    };

    // Build grouped list: [ {hall, items[]} ]
    const grouped = [];
    let globalIdx = 0;
    for (const hallId of hallOrder) {
      const hallItems = items.filter(it => it.hall_id === hallId);
      if (hallItems.length === 0) continue;
      grouped.push({ hallId, label: hallLabels[hallId] || hallId, color: hallColors[hallId] || '#94a3b8', items: hallItems, startIdx: globalIdx });
      globalIdx += hallItems.length;
    }
    // Any items without a hall
    const unmatched = items.filter(it => !hallOrder.includes(it.hall_id));
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
          <img src="${item.thumb_rel_path}" alt="${item.title}" loading="lazy" />
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
    this.dom.cardImg.src = item.thumb_rel_path;
    this.dom.cardTitle.textContent = item.title;
    this.dom.cardTypeTag.textContent = item.category;
    this.dom.cardYearTag.textContent = `Năm ${item.year}`;
    this.dom.cardOrgName.textContent = item.org_name || item.org;
    this.dom.cardDescription.textContent = item.description || 'Thành tích xuất sắc đóng góp vào sự phát triển của Công ty Điện lực Vũng Tàu.';
    this.dom.cardOrigLink.href = item.original_rel_path;

    const icons = {
      CTN: '★', TTCP: '★', EVN: '⚡', EVNSPC: '⚡',
      UBND_BRVT: '🏛', UBND_TPVT: '🏛',
      CD_EVN: '🚩', CD_EVNSPC: '🚩', LDLD_BRVT: '🚩'
    };
    this.dom.cardOrgIcon.textContent = icons[item.org] || '🎖';

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
      chip.innerHTML = `
        <img class="cohort-thumb" src="${rel.thumb_rel_path}" alt="${rel.title}" />
        <span class="cohort-info">${rel.title} (${rel.category})</span>
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
    this.dom.lightboxImg.src = item.thumb_rel_path;
    const categoryName = item.category === 'BẰNG KHEN' ? 'Bằng khen' : (item.category === 'CỜ' ? 'Cờ thi đua' : item.category);
    const orgDisplay = item.org_name || item.org;
    this.dom.lightboxCaption.innerHTML = `
      <div style="font-family: var(--font-sans); font-size: 16px; font-weight: 700; color: #facc15; margin-bottom: 4px; letter-spacing: 0.2px;">${item.title}</div>
      <div style="font-family: var(--font-sans); font-size: 13px; font-weight: 500; color: #cbd5e1;">${categoryName} • Năm ${item.year} • ${orgDisplay}</div>
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
        <img class="catalog-thumb" src="${item.thumb_rel_path}" alt="${item.title}" loading="lazy" />
        <div class="catalog-info">
          <span class="catalog-item-title">${item.title}</span>
          <span class="catalog-item-meta">${item.year} • ${item.org} • ${item.category}</span>
        </div>
      `;
      el.addEventListener('click', () => {
        this.selectExhibitByIndex(idx);
        this.dom.catalogDrawer.classList.add('hidden');
      });
      container.appendChild(el);
    });
  }

  updateMinimap(camPos, camRotY) {
    if (!this.dom.playerMarker) return;
    const svgX = camPos.x * 0.85;
    const svgY = camPos.z * 0.85;
    this.dom.playerMarker.setAttribute('transform', `translate(${svgX}, ${svgY}) rotate(${(-camRotY * 180) / Math.PI})`);
  }
}
