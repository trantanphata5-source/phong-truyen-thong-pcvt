import * as THREE from 'three';
import { AudioService } from './audio-service.js?v=hcm_real_v6';
import { DataService } from './data-service.js?v=hcm_real_v6';
import { MuseumArchitect } from './museum-architect.js?v=hcm_v9';
import { ExhibitBuilder } from './exhibit-builder.js?v=hcm_real_v6';
import { ControlsManager } from './controls-manager.js?v=hcm_real_v6';
import { UIController } from './ui-controller.js?v=hcm_real_v6';
import { AlbumViewer } from './album-viewer.js?v=hcm_real_v6';
import { HCMExhibitBuilder } from './hcm-exhibit-builder.js?v=chuanhoa_v1';
import { HCMTimelineBuilder } from './hcm-timeline-builder.js?v=chuanhoa_v1';

/**
 * Main Application Orchestrator (Artsteps Standard)
 * Phòng Truyền Thống Số Hóa 3D - Công Ty Điện Lực Vũng Tàu (1985 - 2025)
 */
class HeritageApp {
  constructor() {
    this.container = document.getElementById('canvas-container');

    // 1. Scene, Camera, Renderer
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf1f5f9);
    this.scene.fog = new THREE.FogExp2(0xf1f5f9, 0.003);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      250
    );
    // Start position at the South entrance looking into the hall
    this.camera.position.set(0, 1.75, 26);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    // ShadowMap disabled — indoor museum with wall-mounted exhibits has no visible shadows
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    // 2. Core Subsystems
    this.clock = new THREE.Clock();
    this.audioService = new AudioService();
    this.dataService = new DataService();
    this.controlsManager = new ControlsManager(this.camera, this.renderer.domElement, this.audioService);
    this.uiController = new UIController(this);

    // 3. Raycasting
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.hoveredExhibit = null;
    this.hoveredAlbum = null;
    this.hoveredHCMExhibit = null;
    this.hoveredTimelineEvent = null;
    this.hoveredHCMScreen = null;
    this.floorHitPoint = null;
    this.albumViewer = null;
    this.hcmExhibitBuilder = null;
    this.hcmTimelineBuilder = null;

    this.init();
  }

  async init() {
    try {
      this.uiController.updateLoadingProgress(15, 'Đang đọc danh mục 205 Bằng khen & Cờ thi đua...');
      await this.dataService.load();

      this.uiController.updateLoadingProgress(35, 'Đang dựng kiến trúc 3 sảnh bảo tàng...');
      this.architect = new MuseumArchitect(this.scene);
      this.architect.buildMuseum();

      // Initialize Album Flipbook Viewer (Ảnh Lưu Niệm & Tranh Tặng)
      this.albumViewer = new AlbumViewer(this);

      // Bind Top Header Album Button
      const btnNavAlbums = document.getElementById('btn-nav-albums');
      if (btnNavAlbums) {
        btnNavAlbums.addEventListener('click', () => {
          this.openAlbum('souvenir_photos');
        });
      }

      this.uiController.updateLoadingProgress(55, 'Đang bố trí 100% hiện vật lên các vách trưng bày...');
      this.exhibitBuilder = new ExhibitBuilder(this.scene);
      this.exhibitBuilder.buildAllExhibits(this.dataService.items, (done, total) => {
        const pct = 55 + (done / total) * 30;
        this.uiController.updateLoadingProgress(pct, `Bố trí hiện vật: ${done}/${total}...`);
      });

      // Load & Build HCM Cultural Zone Exhibits
      this.uiController.updateLoadingProgress(82, 'Đang dựng Không gian Văn hóa Hồ Chí Minh...');
      this.hcmExhibitBuilder = new HCMExhibitBuilder(this.scene);
      const hcmData = await this.hcmExhibitBuilder.loadData();
      if (hcmData) {
        this.hcmExhibitBuilder.buildAllHCMExhibits((done, total) => {
          const pct = 82 + (done / total) * 8;
          this.uiController.updateLoadingProgress(pct, `Bố trí ảnh Bác Hồ: ${done}/${total}...`);
        });
      }

      // Load & Build HCM Timeline on West wall
      this.uiController.updateLoadingProgress(91, 'Đang dựng Timeline Hành trình cứu nước...');
      this.hcmTimelineBuilder = new HCMTimelineBuilder(this.scene);
      const timelineData = await this.hcmTimelineBuilder.loadData();
      if (timelineData) {
        this.hcmTimelineBuilder.buildAllTimelineExhibits((done, total) => {
          const pct = 91 + (done / total) * 8;
          this.uiController.updateLoadingProgress(pct, `Dựng timeline: ${done}/${total}...`);
        });
      }
      this.uiController.updateLoadingProgress(100, 'Phòng truyền thống đã sẵn sàng!');

      // Clear any cached search input value on start
      if (this.uiController.dom.searchInput) {
        this.uiController.dom.searchInput.value = '';
      }
      this.uiController.dom.filterBadge.textContent = this.dataService.items.length;
      this.uiController.dom.resultsCount.textContent = `${this.dataService.items.length} hiện vật`;
      this.uiController.dom.tourStepText.textContent = `1 / ${this.dataService.items.length}`;
      this.uiController.buildTourCarousel(this.dataService.items);
      this.uiController.renderCatalogList(this.dataService.items);
      this.updateExhibitVisibility(this.dataService.items);

      // Event Listeners
      window.addEventListener('resize', () => this.onWindowResize());
      this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
      this.renderer.domElement.addEventListener('click', (e) => this.onCanvasClick(e));

      // Start render loop
      this.animate();
      console.log('Artsteps-standard 3D Heritage Room PCVT Ready!');
    } catch (err) {
      console.error('Initialization error:', err);
    }
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  }

  onMouseMove(e) {
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    // Throttled raycast (max 15 fps instead of every mousemove)
    if (!this._raycastPending) {
      this._raycastPending = true;
      requestAnimationFrame(() => {
        this.checkRaycast();
        this._raycastPending = false;
      });
    }
  }

  checkRaycast() {
    if (!this.exhibitBuilder || this.exhibitBuilder.exhibitMeshes.length === 0) return;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    // 0. Check Interactive Albums in Vitrine
    if (this.architect && this.architect.albumMeshes && this.architect.albumMeshes.length > 0) {
      const albumHits = this.raycaster.intersectObjects(this.architect.albumMeshes, false);
      if (albumHits.length > 0 && albumHits[0].distance < 16.0) {
        const hit = albumHits[0].object;
        if (this.hoveredAlbum !== hit) {
          this.hoveredAlbum = hit;
          this.container.style.cursor = 'pointer';
          this.audioService.playHoverSound();
        }
        if (this.architect.floorMarker) this.architect.floorMarker.visible = false;
        return;
      } else {
        this.hoveredAlbum = null;
      }
    }

    // 1. Check Exhibits first
    const exhibitHits = this.raycaster.intersectObjects(this.exhibitBuilder.exhibitMeshes, false);

    if (exhibitHits.length > 0 && exhibitHits[0].distance < 16.0) {
      const hit = exhibitHits[0].object;
      if (this.hoveredExhibit !== hit) {
        this.hoveredExhibit = hit;
        this.container.style.cursor = 'pointer';
        this.audioService.playHoverSound();
      }
      if (this.architect.floorMarker) this.architect.floorMarker.visible = false;
      return;
    } else {
      this.hoveredExhibit = null;
    }

    // 1b. Check HCM Central Screen
    if (this.architect && this.architect.hcmScreenMesh) {
      const screenHits = this.raycaster.intersectObject(this.architect.hcmScreenMesh, false);
      if (screenHits.length > 0 && screenHits[0].distance < 38.0) {
        if (!this.hoveredHCMScreen) {
          this.hoveredHCMScreen = this.architect.hcmScreenMesh;
          this.container.style.cursor = 'pointer';
          this.audioService.playHoverSound();
        }
        if (this.architect.floorMarker) this.architect.floorMarker.visible = false;
        return;
      }
    }
    this.hoveredHCMScreen = null;

    // 1c. Check HCM Exhibits
    if (this.hcmExhibitBuilder && this.hcmExhibitBuilder.hcmMeshes.length > 0) {
      const hcmHits = this.raycaster.intersectObjects(this.hcmExhibitBuilder.hcmMeshes, true);
      if (hcmHits.length > 0 && hcmHits[0].distance < 38.0) {
        let hitObj = hcmHits[0].object;
        while (hitObj && !hitObj.userData?.isHCMExhibit) {
          hitObj = hitObj.parent;
        }
        if (hitObj && hitObj.userData?.isHCMExhibit) {
          if (this.hoveredHCMExhibit !== hitObj) {
            this.hoveredHCMExhibit = hitObj;
            this.container.style.cursor = 'pointer';
            this.audioService.playHoverSound();
          }
          if (this.architect.floorMarker) this.architect.floorMarker.visible = false;
          return;
        }
      }
    }
    this.hoveredHCMExhibit = null;

    // 1d. Check Timeline Events
    if (this.hcmTimelineBuilder && this.hcmTimelineBuilder.timelineMeshes.length > 0) {
      const tlHits = this.raycaster.intersectObjects(this.hcmTimelineBuilder.timelineMeshes, true);
      if (tlHits.length > 0 && tlHits[0].distance < 38.0) {
        let hitObj = tlHits[0].object;
        while (hitObj && !hitObj.userData?.isTimelineEvent) {
          hitObj = hitObj.parent;
        }
        if (hitObj && hitObj.userData?.isTimelineEvent) {
          if (this.hoveredTimelineEvent !== hitObj) {
            this.hoveredTimelineEvent = hitObj;
            this.container.style.cursor = 'pointer';
            this.audioService.playHoverSound();
          }
          if (this.architect.floorMarker) this.architect.floorMarker.visible = false;
          return;
        }
      }
    }
    this.hoveredTimelineEvent = null;

    // 2. Check Walkable Floor
    if (this.architect.floorMesh) {
      const floorHits = this.raycaster.intersectObject(this.architect.floorMesh, false);
      if (floorHits.length > 0) {
        const hit = floorHits[0];
        this.floorHitPoint = hit.point;
        this.container.style.cursor = 'crosshair';

        if (this.architect.floorMarker) {
          this.architect.floorMarker.visible = true;
          this.architect.floorMarker.position.set(hit.point.x, 0.03, hit.point.z);
        }
        return;
      }
    }

    if (this.architect.floorMarker) this.architect.floorMarker.visible = false;
    this.container.style.cursor = 'grab';
  }

  onCanvasClick(e) {
    // If the user was dragging to rotate view, ignore click
    if (this.controlsManager.dragMoved) return;

    // Refresh mouse coordinates and raycast check on click
    if (e && typeof e.clientX === 'number') {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.checkRaycast();
    }

    // 0. Clicked an Album in Showcase Vitrine -> Glide and Open Album
    if (this.hoveredAlbum && this.hoveredAlbum.userData?.isAlbum) {
      const albumId = this.hoveredAlbum.userData.albumId;
      this.openAlbum(albumId);
      return;
    }

    // 1. Clicked an Exhibit -> Focus and Inspect
    if (this.hoveredExhibit && this.hoveredExhibit.userData.item) {
      const item = this.hoveredExhibit.userData.item;
      const idx = this.dataService.filteredItems.findIndex(it => it.id === item.id);
      if (idx !== -1) {
        this.uiController.selectExhibitByIndex(idx);
      } else {
        this.focusOnExhibit(item);
        this.uiController.showExhibitCard(item);
      }
      return;
    }

    // 1b. Clicked the HCM Central Screen -> Open iframe overlay
    if (this.hoveredHCMScreen && this.hoveredHCMScreen.userData?.isHCMScreen) {
      this.showHCMIframeOverlay();
      return;
    }

    // 1c. Clicked an HCM Exhibit -> Show Lightbox
    if (this.hoveredHCMExhibit && this.hoveredHCMExhibit.userData?.isHCMExhibit) {
      const data = this.hoveredHCMExhibit.userData.exhibitData;
      this.showHCMLightbox(data);
      return;
    }

    // 1d. Clicked a Timeline Event -> Show Timeline Lightbox
    if (this.hoveredTimelineEvent && this.hoveredTimelineEvent.userData?.isTimelineEvent) {
      const data = this.hoveredTimelineEvent.userData.eventData;
      this.showTimelineLightbox(data);
      return;
    }

    // 2. Clicked on Floor -> Point & Click Walk
    if (this.floorHitPoint) {
      this.uiController.hideExhibitCard();
      this.controlsManager.glideToPoint(this.floorHitPoint.x, this.floorHitPoint.z, 1.4);
    }
  }

  openAlbum(albumId = 'souvenir_photos') {
    if (!this.albumViewer) return;
    this.uiController.hideExhibitCard();
    this.controlsManager.glideToShowcase(albumId, () => {
      this.albumViewer.openAlbum(albumId);
    });
  }

  focusOnExhibit(item) {
    const exhibitGroup = this.exhibitBuilder.exhibitMap.get(item.id);
    if (!exhibitGroup) return;
    this.controlsManager.glideToExhibit(exhibitGroup, 1.5);
  }

  updateExhibitVisibility(activeItems) {
    const activeIdSet = new Set(activeItems.map(it => it.id));
    this.exhibitBuilder.exhibitMeshes.forEach(mesh => {
      const item = mesh.userData.item;
      const isVisible = activeIdSet.has(item.id);
      const parentGroup = mesh.parent;
      if (parentGroup) {
        parentGroup.visible = isVisible;
      }
    });
  }

  /**
   * HCM Lightbox - show full photo with description
   */
  showHCMLightbox(data) {
    if (!data) return;

    // Remove existing lightbox if any
    const existing = document.getElementById('hcm-lightbox');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'hcm-lightbox';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.92); z-index: 10000;
      display: flex; align-items: center; justify-content: center;
      animation: fadeIn 0.3s ease;
    `;

    const card = document.createElement('div');
    card.style.cssText = `
      position: relative; max-width: 920px; max-height: 90vh; background: #180507;
      border: 2px solid #d4af37; border-radius: 12px;
      padding: 28px; color: #fff; overflow-y: auto;
      box-shadow: 0 0 60px rgba(234, 179, 8, 0.35);
      font-family: 'Inter', sans-serif;
    `;

    let imgHtml = '';
    if (data.img) {
      imgHtml = `<img src="${data.img}" style="
        width: 100%; max-height: 520px; object-fit: contain;
        border-radius: 8px; border: 2px solid #d4af37; margin-bottom: 18px;
        background: #0d0203;
      " />`;
    }

    const displayDate = data.date || data.year;
    const yearBadge = displayDate ? `<span style="
      background: #eab308; color: #1a0505; padding: 5px 14px;
      border-radius: 20px; font-weight: bold; font-size: 15px; margin-right: 10px;
    ">★ ${displayDate}</span>` : '';

    const categoryBadge = data.category ? `<span style="
      background: rgba(255,255,255,0.12); color: #facc15; padding: 5px 14px;
      border-radius: 20px; font-size: 14px; border: 1px solid rgba(250, 204, 21, 0.3);
    ">${data.category}</span>` : '';

    card.innerHTML = `
      <button id="hcm-lightbox-close" style="
        position: absolute; top: 14px; right: 14px;
        background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3);
        color: #fff; width: 36px; height: 36px; border-radius: 50%;
        cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center;
        transition: background 0.2s;
      " onmouseover="this.style.background='rgba(234,179,8,0.5)'" onmouseout="this.style.background='rgba(255,255,255,0.15)'">✕</button>
      ${imgHtml}
      <div style="margin-bottom: 14px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px;">
        ${yearBadge}${categoryBadge}
      </div>
      <h2 style="color: #facc15; margin: 0 0 12px 0; font-size: 24px; font-family: 'Playfair Display', serif; line-height: 1.4;">
        ${data.title || ''}
      </h2>
      <p style="color: rgba(255,255,255,0.9); line-height: 1.75; font-size: 15px; margin: 0 0 16px 0;">
        ${data.desc || ''}
      </p>
      ${data.source ? `<p style="color: rgba(255,255,255,0.5); font-size: 13px; margin: 0;">Nguồn tư liệu: ${data.source}</p>` : ''}
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Close handlers
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.getElementById('hcm-lightbox-close').addEventListener('click', close);
    const escHandler = (e) => { if (e.key === 'Escape') { close(); window.removeEventListener('keydown', escHandler); } };
    window.addEventListener('keydown', escHandler);
  }

  /**
   * Timeline Lightbox - show full event detail with image
   */
  showTimelineLightbox(data) {
    if (!data) return;
    const existing = document.getElementById('timeline-lightbox');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'timeline-lightbox';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.92); z-index: 10000;
      display: flex; align-items: center; justify-content: center;
      animation: fadeIn 0.3s ease;
    `;

    const card = document.createElement('div');
    card.style.cssText = `
      position: relative; max-width: 920px; max-height: 90vh; background: #0d0f1a;
      border: 2px solid #d4af37; border-radius: 12px;
      padding: 28px; color: #fff; overflow-y: auto;
      box-shadow: 0 0 60px rgba(59, 130, 246, 0.25);
      font-family: 'Inter', sans-serif;
    `;

    let imgHtml = '';
    if (data.img) {
      imgHtml = `<img src="${data.img}" style="
        width: 100%; max-height: 420px; object-fit: contain;
        border-radius: 8px; border: 2px solid #d4af37; margin-bottom: 18px;
        background: #080a14;
      " />`;
    }

    const periodColors = {
      'Tuổi thơ': '#22c55e', 'Tìm đường cứu nước': '#3b82f6',
      'Hoạt động quốc tế': '#8b5cf6', 'Sáng lập Đảng': '#ef4444',
      'Về nước': '#f97316', 'Văn học': '#06b6d4',
      'Cách mạng Tháng Tám': '#dc2626', 'Xây dựng nhà nước': '#eab308',
      'Kháng chiến chống Pháp': '#b91c1c', 'Kháng chiến chống Mỹ': '#991b1b',
      'Ra đi lịch sử': '#1e3a5f', 'Di sản': '#d4af37'
    };
    const pColor = periodColors[data.period] || '#94a3b8';

    const yearBadge = `<span style="
      background: ${pColor}; color: #fff; padding: 5px 14px;
      border-radius: 20px; font-weight: bold; font-size: 15px; margin-right: 10px;
    ">★ ${data.date || data.year}</span>`;

    const periodBadge = data.period ? `<span style="
      background: rgba(255,255,255,0.12); color: ${pColor}; padding: 5px 14px;
      border-radius: 20px; font-size: 14px; border: 1px solid ${pColor}40;
    ">${data.period}</span>` : '';

    card.innerHTML = `
      <button id="timeline-lightbox-close" style="
        position: absolute; top: 14px; right: 14px;
        background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3);
        color: #fff; width: 36px; height: 36px; border-radius: 50%;
        cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center;
        transition: background 0.2s;
      " onmouseover="this.style.background='rgba(59,130,246,0.5)'" onmouseout="this.style.background='rgba(255,255,255,0.15)'">✕</button>
      ${imgHtml}
      <div style="margin-bottom: 14px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px;">
        ${yearBadge}${periodBadge}
      </div>
      <h2 style="color: #facc15; margin: 0 0 12px 0; font-size: 24px; font-family: 'Playfair Display', serif; line-height: 1.4;">
        ${data.title || ''}
      </h2>
      <p style="color: rgba(255,255,255,0.9); line-height: 1.75; font-size: 15px; margin: 0 0 16px 0;">
        ${data.desc || ''}
      </p>
      ${data.category ? `<p style="color: rgba(255,255,255,0.5); font-size: 13px; margin: 0;">Thể loại: ${data.category}</p>` : ''}
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.getElementById('timeline-lightbox-close').addEventListener('click', close);
    const escHandler = (e) => { if (e.key === 'Escape') { close(); window.removeEventListener('keydown', escHandler); } };
    window.addEventListener('keydown', escHandler);
  }

  /**
   * HCM Iframe Overlay - opens luoc-su-hcm.vercel.app in an interactive iframe
   */
  showHCMIframeOverlay() {
    const existing = document.getElementById('hcm-iframe-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'hcm-iframe-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.88); z-index: 10000;
      display: flex; align-items: center; justify-content: center;
      animation: fadeIn 0.3s ease;
    `;

    const container = document.createElement('div');
    container.style.cssText = `
      position: relative; width: 90vw; height: 88vh;
      border: 3px solid #d4af37; border-radius: 16px;
      overflow: hidden; background: #0d0f1a;
      box-shadow: 0 0 80px rgba(234, 179, 8, 0.25);
    `;

    // Header bar
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 20px; background: linear-gradient(135deg, #1a0505, #0d0f1a);
      border-bottom: 2px solid #d4af37;
    `;
    header.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="color: #facc15; font-size: 20px;">★</span>
        <span style="color: #fff; font-size: 16px; font-weight: 600; font-family: 'Inter', sans-serif;">Lược sử cuộc đời Chủ tịch Hồ Chí Minh — Trình chiếu tương tác</span>
      </div>
    `;

    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = `
      background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3);
      color: #fff; width: 36px; height: 36px; border-radius: 50%;
      cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center;
      transition: background 0.2s;
    `;
    closeBtn.textContent = '✕';
    closeBtn.onmouseover = () => closeBtn.style.background = 'rgba(234,179,8,0.5)';
    closeBtn.onmouseout = () => closeBtn.style.background = 'rgba(255,255,255,0.15)';
    header.appendChild(closeBtn);
    container.appendChild(header);

    // Iframe
    const iframe = document.createElement('iframe');
    iframe.src = 'https://luoc-su-hcm.vercel.app/';
    iframe.style.cssText = `
      width: 100%; height: calc(100% - 54px); border: none;
      background: #fff;
    `;
    iframe.allow = 'fullscreen';
    container.appendChild(iframe);

    overlay.appendChild(container);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    const escHandler = (e) => { if (e.key === 'Escape') { close(); window.removeEventListener('keydown', escHandler); } };
    window.addEventListener('keydown', escHandler);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = Math.min(this.clock.getDelta(), 0.1);

    // Update Controls
    this.controlsManager.update(delta);

    // Update Minimap
    this.uiController.updateMinimap(this.camera.position, this.controlsManager.currentYaw);

    // Render Scene
    this.renderer.render(this.scene, this.camera);
  }
}

// Start
window.addEventListener('DOMContentLoaded', () => {
  window.app = new HeritageApp();
});
