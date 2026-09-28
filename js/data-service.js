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
      this.items = this.allItems.filter(it => it.treo !== false);
      this.allItems.forEach(item => this.itemsById.set(item.id, item));
      this.filteredItems = [...this.items];
      this.isLoaded = true;
      return this.raw;
    } catch (err) {
      console.error('Failed to load room_data.json:', err);
      throw err;
    }
  }

  getItemById(id) {
    return this.itemsById.get(id);
  }

  getRelatedItems(item) {
    if (!item) return [];
    // Cùng năm, cùng khu
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
        const fullText = `${item.caption || ''} ${item.year} ${item.org_name || ''} ${item.source} ${item.khu}`.toLowerCase();
        if (!fullText.includes(query)) return false;
      }

      return true;
    });

    return this.filteredItems;
  }
}
