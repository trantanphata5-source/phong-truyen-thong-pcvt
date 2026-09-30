import * as THREE from 'three';
import { AudioService } from './audio-service.js?v=gd4-fix1';
import { DataService } from './data-service.js?v=gd4-fix1';
import { MuseumArchitect } from './museum-architect.js?v=gd4-fix1';
import { ExhibitBuilder } from './exhibit-builder.js?v=gd4-fix1';
import { ControlsManager } from './controls-manager.js?v=gd4-fix1';
import { UIController } from './ui-controller.js?v=gd4-fix1';
import { AlbumViewer } from './album-viewer.js?v=gd4-fix1';
import { HCMExhibitBuilder } from './hcm-exhibit-builder.js?v=gd4-fix1';
import { HCMTimelineBuilder } from './hcm-timeline-builder.js?v=gd4-fix1';
import { GridMapTable } from './grid-map-table.js?v=gd5';
import { ZoneScreenSlideshow } from './zone-screens.js?v=gd5';

window.THREE = THREE;

/**
 * Main Application Orchestrator (Artsteps Standard)
 * Phòng Truyền Thống Số Hóa 3D - Công Ty Điện Lực Vũng Tàu (1985 - 2025)
 */
class HeritageApp {
  constructor() {
    this.container = document.getElementById('canvas-container');

    // GĐ5: Zone culling & Screen slideshow state
    this.hoveredZoneScreen = null;
    this.slideshowKhu4 = null;
    this.slideshowKhu6 = null;
    this.currentZone = 'lobby';
    this.debugOverlay = null;
    this._lastZoneCheckTime = 0;

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
    this.camera.position.set(0, 2.75, 26);

    // Mobile detection for performance tuning
    this.isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(navigator.userAgent)
                     || (window.innerWidth <= 900 && 'ontouchstart' in window);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isMobile, // Disable antialias on mobile for 2x FPS
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(this.isMobile ? 1.0 : Math.min(window.devicePixelRatio, 1.5));
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
    this.hoveredGridItem = null;
    this.hoveredGridTable = null;
    this.floorHitPoint = null;
    this.albumViewer = null;
    this.hcmExhibitBuilder = null;
    this.hcmTimelineBuilder = null;
    this.gridMapTable = null;

    // GĐ5: Sa bàn UI state
    this.gridHudManualClosed = false;
    this.grid2dState = {
      scale: 1.0,
      panX: 0,
      panY: 0,
      isDragging: false,
      startX: 0,
      startY: 0
    };

    this.init();
  }

  async init() {
    try {
      this.uiController.updateLoadingProgress(15, 'Đang đọc danh mục hiện vật...');
      await this.dataService.load();

      this.uiController.updateLoadingProgress(35, 'Đang dựng kiến trúc bảo tàng...');
      this.architect = new MuseumArchitect(this.scene);
      this.architect.buildMuseum();

      // Initialize Album Flipbook Viewer (Ảnh Lưu Niệm & Tranh Tặng)
      this.albumViewer = new AlbumViewer(this);

      // Bind Top Header Album Button
      const btnNavAlbums = document.getElementById('btn-nav-albums');
      if (btnNavAlbums) {
        btnNavAlbums.addEventListener('click', () => {
          this.openAlbum('souvenir');
        });
      }

      this.uiController.updateLoadingProgress(55, 'Đang bố trí hiện vật lên các vách trưng bày...');
      this.exhibitBuilder = new ExhibitBuilder(this.scene);
      // GĐ3-fix: truyền raw data (chứa toàn bộ items), exhibitBuilder tự lọc treo
      this.exhibitBuilder.buildAllExhibits(this.dataService.raw, (done, total) => {
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

      // GĐ5: Load & Build 3D Power Grid Table (Sa bàn lưới điện 3D)
      this.uiController.updateLoadingProgress(96, 'Đang dựng sa bàn lưới điện 3D...');
      this.gridMapTable = new GridMapTable(this.scene);
      const gridData = await this.gridMapTable.loadData();
      if (gridData) {
        this.gridMapTable.build(gridData);
      }
      this.initGridMapUI();

      // GĐ5: Initialize Large LED Screens Slideshow in Zone 4 & 6 (Mục C)
      if (this.architect && this.architect.screenKhu4Canvas && this.architect.screenKhu6Canvas) {
        const k4Items = this.dataService.allItems.filter(it => it.khu === 'khu4');
        this.slideshowKhu4 = new ZoneScreenSlideshow(
          'khu4',
          this.architect.screenKhu4Canvas,
          this.architect.screenKhu4Tex,
          k4Items
        );

        // Zone 6: alternate 25 Trade Union items and 25 Youth Union items
        const k6Items = this.dataService.allItems.filter(it => it.khu === 'khu6');
        const k6Cd = k6Items.filter(it => it.source === 'cong_doan').slice(0, 25);
        const k6Dtn = k6Items.filter(it => it.source === 'doan_tn').slice(0, 25);
        const k6Alternated = [];
        const maxLen = Math.max(k6Cd.length, k6Dtn.length);
        for (let i = 0; i < maxLen; i++) {
          if (i < k6Cd.length) k6Alternated.push(k6Cd[i]);
          if (i < k6Dtn.length) k6Alternated.push(k6Dtn[i]);
        }
        this.slideshowKhu6 = new ZoneScreenSlideshow(
          'khu6',
          this.architect.screenKhu6Canvas,
          this.architect.screenKhu6Tex,
          k6Alternated
        );
      }

      // GĐ5: Debug Overlay (Mục E.4)
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('debug') === '1') {
        this.initDebugOverlay();
      }

      // GĐ5-fix2: Dựng bounding boxes cho culling & kiểm tra không chồng khung
      this.initZoneCullingBoxes();
      this.assertNoOverlapOnWalls();
      if (this.gridMapTable && typeof this.gridMapTable.assertAllInsideBoard === 'function') {
        this.gridMapTable.assertAllInsideBoard();
      }
      this.updateZoneCulling();

      this.uiController.updateLoadingProgress(100, 'Phòng truyền thống đã sẵn sàng!');

      // Clear any cached search input value on start
      if (this.uiController.dom.searchInput) {
        this.uiController.dom.searchInput.value = '';
      }
      // GĐ3-fix: dùng items mới (chỉ treo), không phải 205 cũ
      const treoCount = this.dataService.items.length;
      this.uiController.dom.filterBadge.textContent = treoCount;
      this.uiController.dom.resultsCount.textContent = `${treoCount} hiện vật`;
      this.uiController.dom.tourStepText.textContent = `1 / ${treoCount}`;
      const drawerTitleEl = document.getElementById('drawer-title-text');
      if (drawerTitleEl) drawerTitleEl.textContent = `DANH MỤC HIỆN VẬT (${treoCount})`;
      const resetAllEl = document.getElementById('reset-all-text');
      if (resetAllEl) resetAllEl.textContent = `Xem tất cả ${treoCount} hiện vật`;
      const chipCatAll = document.getElementById('chip-cat-all');
      if (chipCatAll) chipCatAll.textContent = `Tất cả (${treoCount})`;
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
      if (albumHits.length > 0 && albumHits[0].distance < 60.0) {
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

    // 0b. GĐ5: Check Sa bàn Lưới điện 3D (Trạm InstancedMesh, Cơ sở InstancedMesh, hoặc Mặt bàn)
    if (this.gridMapTable && this.gridMapTable.interactiveObjects.length > 0) {
      const gridHits = this.raycaster.intersectObjects(this.gridMapTable.interactiveObjects, false);
      if (gridHits.length > 0 && gridHits[0].distance < 38.0) {
        const hit = gridHits[0];
        const hitObj = hit.object;

        if (hitObj.userData?.isGridTramInstanced && typeof hit.instanceId === 'number' && hitObj.userData.tramList) {
          const tram = hitObj.userData.tramList[hit.instanceId];
          const itemData = { isGridTram: true, tramData: tram };
          if (this.hoveredGridItem?.tramData !== tram) {
            this.hoveredGridItem = itemData;
            this.container.style.cursor = 'pointer';
            this.audioService.playHoverSound();
          }
          this.hoveredGridTable = null;
          if (this.architect.floorMarker) this.architect.floorMarker.visible = false;
          return;
        } else if (hitObj.userData?.isGridCoSoInstanced && typeof hit.instanceId === 'number' && hitObj.userData.coSoList) {
          const coSo = hitObj.userData.coSoList[hit.instanceId];
          const itemData = { isGridCoSo: true, coSoData: coSo };
          if (this.hoveredGridItem?.coSoData !== coSo) {
            this.hoveredGridItem = itemData;
            this.container.style.cursor = 'pointer';
            this.audioService.playHoverSound();
          }
          this.hoveredGridTable = null;
          if (this.architect.floorMarker) this.architect.floorMarker.visible = false;
          return;
        } else if (hitObj.userData?.isGridTableSurface) {
          if (this.hoveredGridTable !== hitObj) {
            this.hoveredGridTable = hitObj;
            this.container.style.cursor = 'pointer';
          }
          this.hoveredGridItem = null;
          if (this.architect.floorMarker) this.architect.floorMarker.visible = false;
          return;
        }
      }
    }
    this.hoveredGridItem = null;
    this.hoveredGridTable = null;

    // 0c. GĐ5: Check Zone 4 & 6 LED screens
    if (this.architect && (this.architect.screenKhu4Mesh || this.architect.screenKhu6Mesh)) {
      const screens = [];
      if (this.architect.screenKhu4Mesh && this.architect.screenKhu4Mesh.parent?.visible !== false) screens.push(this.architect.screenKhu4Mesh);
      if (this.architect.screenKhu6Mesh && this.architect.screenKhu6Mesh.parent?.visible !== false) screens.push(this.architect.screenKhu6Mesh);
      const screenHits = this.raycaster.intersectObjects(screens, false);
      if (screenHits.length > 0 && screenHits[0].distance < 38.0) {
        const hit = screenHits[0].object;
        if (this.hoveredZoneScreen !== hit) {
          this.hoveredZoneScreen = hit;
          this.container.style.cursor = 'pointer';
          this.audioService.playHoverSound();
        }
        if (this.architect.floorMarker) this.architect.floorMarker.visible = false;
        return;
      }
    }
    this.hoveredZoneScreen = null;

    // 1. Check Exhibits first (chỉ raycast các tranh thuộc khu đang hiển thị)
    if (this.exhibitBuilder && this.exhibitBuilder.exhibitMeshes.length > 0) {
      const visibleExhibits = this.exhibitBuilder.exhibitMeshes.filter(m => m.parent && m.parent.visible !== false && m.parent.parent && m.parent.parent.visible !== false);
      const exhibitHits = this.raycaster.intersectObjects(visibleExhibits, false);

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
    }

    // 1b. Check HCM Central Screen
    if (this.architect && this.architect.hcmScreenMesh && this.architect.hcmScreenMesh.visible !== false) {
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
    if (this.hcmExhibitBuilder && this.hcmExhibitBuilder.hcmMeshes.length > 0 && this.hcmExhibitBuilder.group?.visible !== false) {
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
    if (this.hcmTimelineBuilder && this.hcmTimelineBuilder.timelineMeshes.length > 0 && this.hcmTimelineBuilder.group?.visible !== false) {
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

    // 0b. GĐ5: Clicked a Substation / PCVT Facility on Sa bàn
    if (this.hoveredGridItem && (this.hoveredGridItem.userData || this.hoveredGridItem.tramData || this.hoveredGridItem.coSoData)) {
      this.showGridItemCard(this.hoveredGridItem.userData || this.hoveredGridItem);
      this.audioService.playClickSound();
      return;
    }

    // 0c. GĐ5: Clicked Sa bàn table surface -> Glide camera
    if (this.hoveredGridTable) {
      this.controlsManager.glideToGridTable();
      this.showGridHud(true);
      return;
    }

    // 0d. GĐ5: Clicked Zone 4 / Zone 6 LED Screen -> Open Lightbox
    if (this.hoveredZoneScreen && this.hoveredZoneScreen.userData?.isZoneScreen) {
      const zone = this.hoveredZoneScreen.userData.zone;
      const currentItem = this.getScreenCurrentItem(zone);
      if (currentItem) {
        this.uiController.openLightbox(currentItem);
        this.audioService.playClickSound();
      }
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

  openAlbum(albumId = 'souvenir') {
    if (!this.albumViewer) return;
    this.uiController.hideExhibitCard();
    // 1. Open album modal immediately for snappy responsiveness
    this.albumViewer.openAlbum(albumId);
    // 2. Concurrently glide camera to stand in front of that cabinet
    if (this.controlsManager) {
      this.controlsManager.glideToShowcase(albumId);
    }
  }

  focusOnExhibit(item) {
    const exhibitGroup = this.exhibitBuilder.exhibitMap.get(item.id);
    if (!exhibitGroup) return;
    if (item.khu && this.exhibitBuilder.zoneGroups[item.khu]) {
      this.exhibitBuilder.zoneGroups[item.khu].visible = true;
    }
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
    ">• ${displayDate}</span>` : '';

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
      <h2 style="color: #facc15; margin: 0 0 12px 0; font-size: 24px; font-family: 'Be Vietnam Pro', sans-serif; line-height: 1.4;">
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
    ">• ${data.date || data.year}</span>`;

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
      <h2 style="color: #facc15; margin: 0 0 12px 0; font-size: 24px; font-family: 'Be Vietnam Pro', sans-serif; line-height: 1.4;">
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
        <span style="color: #facc15; font-size: 20px;">•</span>
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

  // ===========================================================================
  // GĐ5: SA BÀN LƯỚI ĐIỆN 3D & 2D MODAL UI
  // ===========================================================================
  initGridMapUI() {
    // 1. Layer filter checkboxes
    const bindCheck = (id, key) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', (e) => {
          if (this.gridMapTable) this.gridMapTable.setLayerVisibility(key, e.target.checked);
        });
      }
    };

    bindCheck('chk-layer-500', 'line500');
    bindCheck('chk-layer-220', 'line220');
    bindCheck('chk-layer-110', 'line110');
    bindCheck('chk-layer-kh', 'khachHang');
    bindCheck('chk-layer-qh', 'quyHoach');
    bindCheck('chk-layer-dbgt', 'dbgt');
    bindCheck('chk-layer-ranh-gioi', 'ranhGioiMoi');

    const chkLabels = document.getElementById('chk-layer-labels');
    if (chkLabels) {
      chkLabels.addEventListener('change', (e) => {
        if (this.gridMapTable) {
          this.gridMapTable.setLayerVisibility('labels', e.target.checked);
          this.gridMapTable.setLayerVisibility('phuong', e.target.checked);
        }
      });
    }

    // 2. Action buttons
    const btnNavSaBan = document.getElementById('btn-nav-saban');
    if (btnNavSaBan) {
      btnNavSaBan.addEventListener('click', () => {
        this.controlsManager.glideToGridTable();
        this.showGridHud(true);
        this.gridHudManualClosed = false;
      });
    }

    const btnFocusGrid = document.getElementById('btn-focus-grid-table');
    if (btnFocusGrid) {
      btnFocusGrid.addEventListener('click', () => {
        this.controlsManager.glideToGridTable();
      });
    }

    const btnOpen2D = document.getElementById('btn-open-grid-2d');
    if (btnOpen2D) {
      btnOpen2D.addEventListener('click', () => {
        this.openGridMap2D();
      });
    }

    const btnCloseHud = document.getElementById('btn-close-grid-hud');
    if (btnCloseHud) {
      btnCloseHud.addEventListener('click', () => {
        this.showGridHud(false);
        this.gridHudManualClosed = true;
      });
    }

    // 3. Station info card buttons
    const btnCloseInfo = document.getElementById('btn-close-grid-info');
    if (btnCloseInfo) {
      btnCloseInfo.addEventListener('click', () => {
        this.hideGridItemCard();
      });
    }

    const btnView2DFromInfo = document.getElementById('btn-grid-info-view2d');
    if (btnView2DFromInfo) {
      btnView2DFromInfo.addEventListener('click', () => {
        if (this._currentGridItemData) {
          this.openGridMap2D(this._currentGridItemData);
        } else {
          this.openGridMap2D();
        }
      });
    }

    // 4. 2D Map Modal interactive Pan & Zoom
    this.init2DMapViewer();

    if (window.lucide) window.lucide.createIcons();
  }

  showGridHud(show) {
    const hud = document.getElementById('grid-table-hud');
    if (hud) hud.classList.toggle('hidden', !show);
  }

  updateGridHudProximity() {
    if (this.gridHudManualClosed) return;
    const hud = document.getElementById('grid-table-hud');
    if (!hud) return;

    // Khoảng cách camera tới tâm sa bàn (26, 0)
    const distToTable = Math.hypot(this.camera.position.x - 26.0, this.camera.position.z - 0.0);
    const inRange = distToTable < 14.0;
    hud.classList.toggle('hidden', !inRange);
  }

  showGridItemCard(userData) {
    const card = document.getElementById('grid-info-card');
    if (!card) return;

    this._currentGridItemData = userData;

    const badgeEl = document.getElementById('grid-info-badge');
    const titleEl = document.getElementById('grid-info-title');
    const capEl = document.getElementById('grid-info-cap');
    const loaiEl = document.getElementById('grid-info-loai');
    const trangthaiEl = document.getElementById('grid-info-trangthai');
    const phuongEl = document.getElementById('grid-info-phuong');
    const extraEl = document.getElementById('grid-info-extra');

    if (userData.isGridTram && userData.tramData) {
      const t = userData.tramData;
      titleEl.textContent = t.ten;
      capEl.textContent = t.cap;
      loaiEl.textContent = t.loai === 'khach_hang' ? '110kV Khách hàng' : (t.loai === 'lan_can' ? 'Trạm lân cận' : 'Trạm lưới truyền tải');
      trangthaiEl.textContent = t.trang_thai === 'quy_hoach' ? 'Quy hoạch' : 'Hiện trạng';
      phuongEl.textContent = t.phuong || 'Tỉnh Bà Rịa – Vũng Tàu';
      extraEl.textContent = `Tọa độ bản vẽ CAD: (${t.pt ? t.pt[0].toFixed(1) : ''}, ${t.pt ? t.pt[1].toFixed(1) : ''})`;

      badgeEl.className = 'grid-info-badge';
      if (t.cap === '500kV') badgeEl.classList.add('badge-500');
      else if (t.cap === '220kV') badgeEl.classList.add('badge-220');
      else if (t.loai === 'khach_hang') badgeEl.classList.add('badge-kh');
      else badgeEl.classList.add('badge-110');
      badgeEl.textContent = t.cap;
    } else if (userData.isGridCoSo && userData.coSoData) {
      const cs = userData.coSoData;
      titleEl.textContent = cs.ten;
      capEl.textContent = 'Cơ sở PCVT';
      loaiEl.textContent = 'Trụ sở / Đơn vị trực thuộc';
      trangthaiEl.textContent = 'Đang hoạt động';
      phuongEl.textContent = cs.phuong || 'P. Vũng Tàu';
      extraEl.textContent = cs.dia_chi || 'Cơ sở Công ty Điện lực Vũng Tàu';

      badgeEl.className = 'grid-info-badge badge-coso';
      badgeEl.textContent = 'PCVT';
    } else if (userData.isGridDBGT && userData.dbgtData) {
      const d = userData.dbgtData;
      titleEl.textContent = d.ten;
      capEl.textContent = 'Công trình ĐBGT';
      loaiEl.textContent = 'Đồng bộ giao thông';

      const statusMap = {
        da_co_y_kien_hstk: 'Đã có ý kiến HSTK',
        dang_tham_dinh_boi_thuong: 'UBND đang thẩm định bồi thường',
        chua_khao_sat: 'Chưa khảo sát hiện trạng'
      };
      trangthaiEl.textContent = statusMap[d.trang_thai] || d.trang_thai;
      phuongEl.textContent = 'Địa bàn đồng bộ giao thông';
      extraEl.textContent = 'Phối hợp đồng bộ hạ tầng lưới điện';

      badgeEl.className = 'grid-info-badge badge-dbgt';
      badgeEl.textContent = 'ĐBGT';
    }

    card.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  hideGridItemCard() {
    const card = document.getElementById('grid-info-card');
    if (card) card.classList.add('hidden');
    this._currentGridItemData = null;
  }

  init2DMapViewer() {
    const modal = document.getElementById('grid-map-2d-modal');
    const viewport = document.getElementById('grid-2d-viewport');
    const stage = document.getElementById('grid-2d-stage');
    const btnClose = document.getElementById('btn-close-grid-2d');
    const btnIn = document.getElementById('btn-grid-zoom-in');
    const btnOut = document.getElementById('btn-grid-zoom-out');
    const btnReset = document.getElementById('btn-grid-zoom-reset');
    const searchInput = document.getElementById('grid-2d-search');
    const searchResults = document.getElementById('grid-2d-search-results');

    if (!modal || !viewport || !stage) return;

    // Close button & ESC
    btnClose?.addEventListener('click', () => this.closeGridMap2D());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
        this.closeGridMap2D();
      }
    });

    // Zoom buttons
    btnIn?.addEventListener('click', () => {
      this.grid2dState.scale = Math.min(this.grid2dState.scale * 1.3, 4.0);
      this.update2DMapTransform();
    });

    btnOut?.addEventListener('click', () => {
      this.grid2dState.scale = Math.max(this.grid2dState.scale / 1.3, 0.4);
      this.update2DMapTransform();
    });

    btnReset?.addEventListener('click', () => {
      this.grid2dState.scale = 1.0;
      this.grid2dState.panX = 0;
      this.grid2dState.panY = 0;
      this.update2DMapTransform();
    });

    // Mouse drag to pan
    viewport.addEventListener('mousedown', (e) => {
      this.grid2dState.isDragging = true;
      this.grid2dState.startX = e.clientX - this.grid2dState.panX;
      this.grid2dState.startY = e.clientY - this.grid2dState.panY;
      viewport.classList.add('grabbing');
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.grid2dState.isDragging) return;
      this.grid2dState.panX = e.clientX - this.grid2dState.startX;
      this.grid2dState.panY = e.clientY - this.grid2dState.startY;
      this.update2DMapTransform();
    });

    window.addEventListener('mouseup', () => {
      if (this.grid2dState.isDragging) {
        this.grid2dState.isDragging = false;
        viewport.classList.remove('grabbing');
      }
    });

    // Wheel zoom
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      this.grid2dState.scale = Math.max(0.4, Math.min(4.0, this.grid2dState.scale * zoomFactor));
      this.update2DMapTransform();
    }, { passive: false });

    // Search input for 44 substations
    if (searchInput && searchResults) {
      searchInput.addEventListener('input', (e) => {
        const query = (e.target.value || '').trim().toLowerCase();
        if (!query || !this.gridMapTable?.gridData?.tram) {
          searchResults.classList.add('hidden');
          searchResults.innerHTML = '';
          return;
        }

        const hits = this.gridMapTable.gridData.tram.filter(t =>
          t.ten.toLowerCase().includes(query) || (t.phuong && t.phuong.toLowerCase().includes(query))
        );

        if (hits.length === 0) {
          searchResults.innerHTML = '<div style="padding: 10px; color: #94a3b8; font-size: 12px;">Không tìm thấy trạm phù hợp</div>';
          searchResults.classList.remove('hidden');
          return;
        }

        searchResults.innerHTML = hits.slice(0, 8).map(t => `
          <div class="grid-2d-search-item" data-id="${t.id}" data-x="${t.x}" data-y="${t.y}">
            <span style="font-weight: 700; color: #fff;">${t.ten}</span>
            <span style="color: #22d3ee; font-size: 11px;">${t.cap} • ${t.phuong || ''}</span>
          </div>
        `).join('');
        searchResults.classList.remove('hidden');

        // Click search item
        searchResults.querySelectorAll('.grid-2d-search-item').forEach(item => {
          item.addEventListener('click', () => {
            const x = parseFloat(item.dataset.x);
            const y = parseFloat(item.dataset.y);
            this.center2DMapOn(x, y);
            searchResults.classList.add('hidden');
            searchInput.value = item.querySelector('span').textContent;
          });
        });
      });
    }
  }

  openGridMap2D(targetItem = null) {
    const modal = document.getElementById('grid-map-2d-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    const viewport = document.getElementById('grid-2d-viewport');
    const img = document.getElementById('grid-2d-image');

    const vw = viewport?.clientWidth || window.innerWidth;
    const vh = viewport?.clientHeight || (window.innerHeight - 100);
    const imgW = img?.naturalWidth || 2048;
    const imgH = img?.naturalHeight || 2896;

    if (targetItem && typeof targetItem.x === 'number' && typeof targetItem.y === 'number') {
      this.center2DMapOn(targetItem.x, targetItem.y, 1.8);
    } else {
      const fitScale = Math.min((vw * 0.92) / imgW, (vh * 0.92) / imgH, 1.0);
      this.grid2dState.scale = Math.max(0.25, fitScale);
      this.grid2dState.panX = - (imgW / 2) * this.grid2dState.scale;
      this.grid2dState.panY = - (imgH / 2) * this.grid2dState.scale;
      this.update2DMapTransform();
    }
    if (window.lucide) window.lucide.createIcons();
  }

  closeGridMap2D() {
    const modal = document.getElementById('grid-map-2d-modal');
    if (modal) modal.classList.add('hidden');
  }

  center2DMapOn(nx, ny, targetScale = 2.0) {
    const img = document.getElementById('grid-2d-image');
    if (!img) return;

    const imgW = img.naturalWidth || img.offsetWidth || 2048;
    const imgH = img.naturalHeight || img.offsetHeight || 2896;

    this.grid2dState.scale = targetScale;
    this.grid2dState.panX = - (nx * imgW) * targetScale;
    this.grid2dState.panY = - (ny * imgH) * targetScale;
    this.update2DMapTransform();
  }

  update2DMapTransform() {
    const stage = document.getElementById('grid-2d-stage');
    const zoomText = document.getElementById('grid-zoom-level');
    if (stage) {
      stage.style.transform = `translate(${this.grid2dState.panX}px, ${this.grid2dState.panY}px) scale(${this.grid2dState.scale})`;
    }
    if (zoomText) {
      zoomText.textContent = `${Math.round(this.grid2dState.scale * 100)}%`;
    }
  }

  initDebugOverlay() {
    this.debugOverlay = document.createElement('div');
    this.debugOverlay.id = 'debug-perf-overlay';
    this.debugOverlay.style.cssText = `
      position: fixed; top: 12px; left: 12px; z-index: 99999;
      background: rgba(15, 23, 42, 0.90); backdrop-filter: blur(8px);
      border: 1px solid rgba(56, 189, 248, 0.5); border-radius: 8px;
      padding: 10px 14px; font-family: 'SF Mono', Monaco, Consolas, monospace;
      font-size: 13px; color: #f8fafc; pointer-events: none;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5); line-height: 1.5;
    `;
    document.body.appendChild(this.debugOverlay);
  }

  getZoneAt(x, z) {
    if (z >= 38) {
      if (x > 22) return 'khu4';
      if (x < -22) return 'khu6';
      return 'khu5';
    }
    if (z > 25) return 'hallway';
    if (z < -17 && x >= -18 && x <= 18) return 'khu2';
    if (x > 18) return 'khu3';
    if (x < -18) return 'khu1';
    return 'lobby';
  }

  initZoneCullingBoxes() {
    this._cullableGroups = [];
    this._cullProjScreenMatrix = new THREE.Matrix4();
    this._cullFrustum = new THREE.Frustum();

    const registerGroup = (grp, name) => {
      if (!grp) return;
      grp.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(grp);
      if (!box.isEmpty()) {
        this._cullableGroups.push({ group: grp, box, name });
      }
    };

    // 1. Nhóm hiện vật treo tường các khu (Mục A.3)
    if (this.exhibitBuilder?.zoneGroups) {
      for (const [k, grp] of Object.entries(this.exhibitBuilder.zoneGroups)) {
        registerGroup(grp, `exhibits_${k}`);
      }
    }

    // 2. Nhóm cây cảnh từng khu (Mục A.3)
    if (this.architect?.plantZoneGroups) {
      for (const [k, grp] of Object.entries(this.architect.plantZoneGroups)) {
        registerGroup(grp, `plant_${k}`);
      }
    }

    // 3. Nội dung Khu 3 (trụ thông tin, vạch dẫn đường - kiến trúc luôn hiện)
    if (this.architect?.k3Content) {
      registerGroup(this.architect.k3Content, 'k3Content');
    }

    // 4. Sa bàn lưới điện 3D
    if (this.gridMapTable?.rootGroup) {
      registerGroup(this.gridMapTable.rootGroup, 'gridMapTable');
    }

    // 5. Nội dung Khu HCM (ảnh, timeline, màn hình trung tâm - tường/sàn/trần kiến trúc luôn hiện)
    if (this.architect?.hcmContent) {
      registerGroup(this.architect.hcmContent, 'hcmContent');
    }
    if (this.hcmExhibitBuilder?.group) {
      registerGroup(this.hcmExhibitBuilder.group, 'hcmExhibits');
    }
    if (this.hcmTimelineBuilder?.group) {
      registerGroup(this.hcmTimelineBuilder.group, 'hcmTimeline');
    }

    // 6. Màn hình LED lớn và cờ đứng Khu 4 & 6 (Mục A.3)
    if (this.architect?.screensGroup) {
      registerGroup(this.architect.screensGroup, 'screensGroup');
    }
  }

  updateZoneCulling() {
    // Mục A (GĐ5-fix3): Bỏ hoàn toàn culling khoảng cách và culling cấp nhóm.
    // Three.js tự quản lý frustumCulled cho từng mesh con.
    if (this._cullableGroups) {
      for (let i = 0; i < this._cullableGroups.length; i++) {
        this._cullableGroups[i].group.visible = true;
      }
    }

    // Giữ phần bật/tắt trình chiếu khu 4 và khu 6 theo khu camera đang đứng:
    const camPos = this.camera.position;
    const currentZone = this.getZoneAt(camPos.x, camPos.z);
    this.currentZone = currentZone;
    if (this.slideshowKhu4) this.slideshowKhu4.setActive(currentZone === 'khu4');
    if (this.slideshowKhu6) this.slideshowKhu6.setActive(currentZone === 'khu6');
  }

  assertNoOverlapOnWalls() {
    const wallBuckets = new Map();

    const registerWallItem = (name, obj3d) => {
      if (!obj3d) return;
      obj3d.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj3d);
      if (box.isEmpty()) return;

      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);

      // Định hướng: trục có bề dày mỏng nhất là trục vuông góc với mặt tường
      let axis, wallCoord, uMin, uMax;
      if (size.z <= size.x) {
        axis = 'z';
        wallCoord = Math.round(center.z * 2) / 2; // làm tròn 0.5m
        uMin = box.min.x;
        uMax = box.max.x;
      } else {
        axis = 'x';
        wallCoord = Math.round(center.x * 2) / 2;
        uMin = box.min.z;
        uMax = box.max.z;
      }

      const key = `${axis}_${wallCoord}`;
      if (!wallBuckets.has(key)) wallBuckets.set(key, []);
      wallBuckets.get(key).push({
        id: name,
        box,
        uMin,
        uMax,
        yMin: box.min.y,
        yMax: box.max.y,
        center,
        size
      });
    };

    // 1. Toàn bộ 433 khung hiện vật
    if (this.exhibitBuilder?.exhibitMeshes) {
      for (const mesh of this.exhibitBuilder.exhibitMeshes) {
        const item = mesh.userData.item;
        const name = `Exhibit_${item?.id || 'unknown'}`;
        registerWallItem(name, mesh.parent || mesh);
      }
    }

    // 2. Màn hình LED và cờ đứng Khu 4 & 6
    if (this.architect?.screenKhu4) {
      registerWallItem('Screen_Khu4', this.architect.screenKhu4.unit);
    }
    if (this.architect?.screenKhu6) {
      registerWallItem('Screen_Khu6', this.architect.screenKhu6.unit);
    }
    if (this.architect?.screensGroup) {
      this.architect.screensGroup.children.forEach((child, idx) => {
        if (child !== this.architect?.screenKhu4?.unit && child !== this.architect?.screenKhu6?.unit) {
          registerWallItem(`StandingFlag_${idx}`, child);
        }
      });
    }

    // 3. Các bảng tiêu đề khu (sign banners)
    if (this.architect?.signBanners) {
      for (const banner of this.architect.signBanners) {
        registerWallItem(`SignBanner_${banner.title}`, banner.frameMesh);
      }
    }

    // 4. Biển mốc son danh dự / giai đoạn (chỉ số chẵn là frameMesh đại diện cho 1 biển)
    if (this.architect?.milestonesGroup) {
      this.architect.milestonesGroup.children.forEach((child, idx) => {
        if (idx % 2 === 0) {
          registerWallItem(`MilestonePlaque_${Math.floor(idx / 2)}`, child);
        }
      });
    }

    // 5. Màn hình trung tâm khu HCM
    if (this.architect?.hcmScreenMesh) {
      registerWallItem('HCM_CentralScreen', this.architect.hcmScreenMesh);
    }

    // 6. Băng tiêu đề tường và khẩu hiệu 7 bức tường Khu 3, 4, 6 (Mục D)
    if (this.exhibitBuilder?.wallBanners) {
      for (const item of this.exhibitBuilder.wallBanners) {
        registerWallItem(item.name || 'WallBanner', item);
      }
    }

    // Kiểm tra chồng nhau từng mặt tường (dung sai 2cm = 0.02m theo Mục C)
    let totalPairsChecked = 0;
    const overlappingPairs = [];
    const TOLERANCE = 0.02;

    for (const [wallKey, items] of wallBuckets.entries()) {
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          totalPairsChecked++;
          const a = items[i];
          const b = items[j];

          const overlapU = (a.uMax - TOLERANCE > b.uMin) && (b.uMax - TOLERANCE > a.uMin);
          const overlapY = (a.yMax - TOLERANCE > b.yMin) && (b.yMax - TOLERANCE > a.yMin);

          if (overlapU && overlapY) {
            overlappingPairs.push({ wall: wallKey, itemA: a.id, itemB: b.id });
            console.warn(`[assertNoOverlapOnWalls] Chồng nhau trên tường ${wallKey}:`, a.id, 'và', b.id);
          }
        }
      }
    }

    console.log(`[assertNoOverlapOnWalls] Đã kiểm tra ${totalPairsChecked} cặp vật trên ${wallBuckets.size} mặt tường -> ${overlappingPairs.length} cặp chồng nhau.`);
    if (overlappingPairs.length === 0) {
      console.log('✓ assertNoOverlapOnWalls() = 0 cặp chồng nhau trên mọi mặt tường!');
    }
    return overlappingPairs.length;
  }

  getScreenCurrentItem(zone) {
    if (zone === 'khu4' && this.slideshowKhu4) {
      return this.slideshowKhu4.getCurrentItem();
    }
    if (zone === 'khu6' && this.slideshowKhu6) {
      return this.slideshowKhu6.getCurrentItem();
    }
    return null;
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = Math.min(this.clock.getDelta(), 0.1);
    const time = this.clock.getElapsedTime();

    // Update Controls
    this.controlsManager.update(delta);

    // Update Minimap
    this.uiController.updateMinimap(this.camera.position, this.controlsManager.currentYaw);

    // GĐ5: Animate smart grid floor and power grid table
    if (this.architect && this.architect.animate) {
      this.architect.animate(delta, time);
    }
    if (this.gridMapTable && this.gridMapTable.animate) {
      this.gridMapTable.animate(delta, time, this.camera.position);
    }
    this.updateGridHudProximity();

    // GĐ5-fix2: Frustum + Distance < 45m zone culling and Zone screens slideshow
    this.updateZoneCulling();
    if (this.slideshowKhu4) this.slideshowKhu4.update(delta);
    if (this.slideshowKhu6) this.slideshowKhu6.update(delta);

    // Render Scene
    this.renderer.render(this.scene, this.camera);

    // GĐ5: Debug Overlay (Mục E.4)
    if (this.debugOverlay) {
      this.frameCount = (this.frameCount || 0) + 1;
      const now = performance.now();
      if (!this.lastFpsUpdate || now - this.lastFpsUpdate >= 500) {
        this.currentFps = Math.round((this.frameCount * 1000) / (now - (this.lastFpsUpdate || now)));
        this.frameCount = 0;
        this.lastFpsUpdate = now;
      }
      const calls = this.renderer.info.render.calls;
      const triangles = this.renderer.info.render.triangles;
      const geoms = this.renderer.info.memory.geometries;
      const texs = this.renderer.info.memory.textures;
      this.debugOverlay.innerHTML = `
        <div style="font-weight: bold; color: #38bdf8; margin-bottom: 4px;">⚡ PCVT 3D HERITAGE DEBUG</div>
        <div>FPS: <span style="font-weight: bold; color: ${this.currentFps >= 50 ? '#4ade80' : '#f87171'}">${this.currentFps || 60}</span></div>
        <div>Draw calls: <span style="font-weight: bold; color: ${calls <= 800 ? '#4ade80' : '#f87171'}">${calls}</span></div>
        <div>Triangles: ${triangles.toLocaleString()}</div>
        <div>Geometries: ${geoms} | Textures: ${texs}</div>
        <div>Khu hiện tại: <span style="color: #facc15;">${this.currentZone || 'lobby'}</span></div>
      `;
    }
  }
}

// Start
window.addEventListener('DOMContentLoaded', () => {
  window.app = new HeritageApp();
});
