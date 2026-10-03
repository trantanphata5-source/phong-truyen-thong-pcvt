/**
 * Data Service for 3D Heritage Room
 * GĐ3-fix: chỉ dùng room_data.json, bỏ heritage_data.json
 */
export class DataService {
  constructor() {
    this.raw = null;
    /** items có treo === true (hiện vật trên tường) */
    this.items = [];
    /** Tất cả items (cả treo và chỉ album) */
    this.allItems = [];
    this.itemsById = new Map();
    this.activeFilters = {
      search: '',
      source: 'all',
      org: 'all',
      khu: 'all',
      period: 'all',
      year: null
    };
    this.filteredItems = [];
    this.isLoaded = false;
  }

  async load() {
    try {
      const response = await fetch('assets/room_data.json');
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      this.raw = await response.json();
      this.allItems = this.raw.items || [];
      this.allItems.forEach(item => this.itemsById.set(item.id, item));

      // GĐ6-fix1 A1: gộp thuyết minh lúc chạy (KHÔNG ghi đè room_data.json)
      await this.loadNarratives();
      // GĐ6-fix1 B: bố trí khu 3 theo dòng thời gian; mọi id trong file được treo
      await this.loadKhu3Layout();

      this.items = this.allItems.filter(it => it.treo !== false);
      this.filteredItems = [...this.items];
      this.isLoaded = true;
      return this.raw;
    } catch (err) {
      console.error('Failed to load room_data.json:', err);
      throw err;
    }
  }

  async loadNarratives() {
    this.narratives = {};
    this.narrativeByPath = new Map();
    try {
      const res = await fetch('assets/thuyet_minh_anh.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.narrativeSource = data.nguon || '';
      this.narratives = data.items || {};
      let merged = 0;
      for (const [id, tm] of Object.entries(this.narratives)) {
        const item = this.itemsById.get(id);
        if (!item) continue;
        if (tm.tieu_de) item.tieu_de = tm.tieu_de;
        if (tm.thuyet_minh) item.thuyet_minh = tm.thuyet_minh;
        if (tm.ngay) item.tm_ngay = tm.ngay;
        merged++;
        // Khóa tra cứu cho album: full_path, wall_path, tên file
        for (const p of [item.full_path, item.wall_path, item.thumb_path]) {
          if (!p) continue;
          this.narrativeByPath.set(p, item);
          this.narrativeByPath.set(p.split('/').pop().toLowerCase(), item);
        }
      }
      console.log(`[DataService] Gộp thuyết minh: ${merged}/${Object.keys(this.narratives).length} ảnh`);
    } catch (err) {
      console.warn('[DataService] Không nạp được thuyet_minh_anh.json:', err);
    }
  }

  async loadKhu3Layout() {
    this.khu3Layout = null;
    try {
      const res = await fetch('docs/khu3_bo_tri.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.khu3Layout = await res.json();
      let forced = 0;
      for (const wall of this.khu3Layout.tuong || []) {
        for (const a of wall.thu_tu_anh || []) {
          const item = this.itemsById.get(a.id);
          if (item && item.treo === false) forced++;
          if (item) item.treo = true;
        }
      }
      console.log(`[DataService] Bố trí khu 3: ${forced} ảnh chuyển treo=false → true theo khu3_bo_tri.json`);
    } catch (err) {
      console.warn('[DataService] Không nạp được docs/khu3_bo_tri.json:', err);
    }
  }

  /** Tìm item có thuyết minh theo đường dẫn ảnh (album) */
  findNarrativeItemByPath(path) {
    if (!path || !this.narrativeByPath) return null;
    return this.narrativeByPath.get(path)
      || this.narrativeByPath.get(path.split('/').pop().toLowerCase())
      || null;
  }

  getItemById(id) {
    return this.itemsById.get(id);
  }

  getRelatedItems(item) {
    if (!item) return [];
    // Với ảnh có event_folder: trả về các ảnh cùng sự kiện
    if (item.event_folder) {
      const sameEvent = this.items.filter(it => it.event_folder === item.event_folder && it.id !== item.id);
      if (sameEvent.length > 0) return sameEvent.slice(0, 6);
    }
    // Với bằng khen/cờ hoặc ảnh không có event_folder: cùng năm, cùng khu
    return this.items
      .filter(it => it.year === item.year && it.khu === item.khu && it.id !== item.id)
      .slice(0, 4);
  }

  getSiblingItem(currentId, direction = 'next') {
    const list = this.filteredItems.length > 0 ? this.filteredItems : this.items;
    const idx = list.findIndex(it => it.id === currentId);
    if (idx === -1) return null;
    if (direction === 'next') {
      return list[(idx + 1) % list.length];
    } else {
      return list[(idx - 1 + list.length) % list.length];
    }
  }

  applyFilter(newFilters = {}) {
    // Map legacy keys if passed
    if (newFilters.category !== undefined) {
      const cat = newFilters.category;
      if (cat === 'all') newFilters.source = 'all';
      else if (cat === 'BẰNG KHEN' || cat === 'bang_khen') newFilters.source = 'bang_khen';
      else if (cat === 'CỜ' || cat === 'co') newFilters.source = 'co';
      else newFilters.source = cat;
      delete newFilters.category;
    }
    if (newFilters.hall !== undefined) {
      newFilters.khu = newFilters.hall;
      delete newFilters.hall;
    }

    this.activeFilters = { ...this.activeFilters, ...newFilters };
    const { search, source, org, khu, period, year } = this.activeFilters;
    const query = search.trim().toLowerCase();

    this.filteredItems = this.items.filter(item => {
      // 1. Source (anh_tu_lieu / bang_khen / co / pcvt / …)
      if (source && source !== 'all' && item.source !== source) return false;

      // 2. Org
      if (org && org !== 'all' && item.org_code !== org && item.org_name !== org) return false;

      // 3. Khu
      if (khu && khu !== 'all' && item.khu !== khu) return false;

      // 4. Period
      if (period && period !== 'all') {
        const [startY, endY] = period.split('-').map(Number);
        if (item.year < startY || item.year > endY) return false;
      }

      // 5. Year
      if (year !== null && item.year !== year) return false;

      // 6. Search
      if (query) {
        const fullText = `${item.tieu_de || ''} ${item.caption || ''} ${item.year} ${item.org_name || ''} ${item.source} ${item.khu}`.toLowerCase();
        if (!fullText.includes(query)) return false;
      }

      return true;
    });

    return this.filteredItems;
  }
}
