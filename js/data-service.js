/**
 * Data Service for 3D Heritage Room
 * Loads, parses, filters, and manages all 205 awards & flags
 */
export class DataService {
  constructor() {
    this.raw = null;
    this.items = [];
    this.itemsById = new Map();
    this.halls = {};
    this.matchingCohorts = {};
    this.activeFilters = {
      search: '',
      category: 'all',
      org: 'all',
      period: 'all',
      hall: 'all',
      pairsOnly: false,
      year: null
    };
    this.filteredItems = [];
    this.isLoaded = false;
  }

  async load() {
    try {
      const response = await fetch('assets/heritage_data.json');
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      this.raw = await response.json();
      this.items = this.raw.items || [];
      this.halls = this.raw.halls || {};
      this.matchingCohorts = this.raw.matching_cohorts || {};

      this.items.forEach(item => {
        this.itemsById.set(item.id, item);
      });

      this.filteredItems = [...this.items];
      this.isLoaded = true;
      return this.raw;
    } catch (err) {
      console.error('Failed to load heritage_data.json:', err);
      throw err;
    }
  }

  getItemById(id) {
    return this.itemsById.get(id);
  }

  getRelatedItems(item) {
    if (!item) return [];
    // Find items in the same cohort (same year and same organization)
    const cohortKey = `${item.year}_${item.org}`;
    const cohort = this.matchingCohorts[cohortKey];
    if (cohort) {
      const allIds = [...cohort.bangkhen, ...cohort.co];
      return allIds
        .filter(id => id !== item.id)
        .map(id => this.itemsById.get(id))
        .filter(Boolean);
    }
    // Fallback: items in same year
    return this.items.filter(it => it.year === item.year && it.id !== item.id).slice(0, 4);
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
    this.activeFilters = { ...this.activeFilters, ...newFilters };
    const { search, category, org, period, hall, pairsOnly, year } = this.activeFilters;

    const query = search.trim().toLowerCase();

    this.filteredItems = this.items.filter(item => {
      // 1. Category (BẰNG KHEN / CỜ)
      if (category !== 'all' && item.category !== category) {
        return false;
      }

      // 2. Org
      if (org !== 'all') {
        if (org === 'CTN' && !['CTN', 'TTCP'].includes(item.org)) return false;
        else if (org !== 'CTN' && item.org !== org) return false;
      }

      // 3. Hall
      if (hall !== 'all' && item.hall_id !== hall) {
        return false;
      }

      // 4. Period (Decades)
      if (period !== 'all') {
        const [startY, endY] = period.split('-').map(Number);
        if (item.year < startY || item.year > endY) {
          return false;
        }
      }

      // 5. Specific Year (from timeline slider if set)
      if (year !== null && item.year !== year) {
        return false;
      }

      // 6. Pairs only toggle (Matches requested by user: Bằng khen & Cờ cùng năm)
      if (pairsOnly) {
        const cohortKey = `${item.year}_${item.org}`;
        if (!this.matchingCohorts[cohortKey]) {
          return false;
        }
      }

      // 7. Search Query
      if (query) {
        const fullText = `${item.title} ${item.year} ${item.org} ${item.org_name} ${item.item_type} ${item.hall_name}`.toLowerCase();
        if (!fullText.includes(query)) {
          return false;
        }
      }

      return true;
    });

    return this.filteredItems;
  }
}
