export interface CatalogFilterState {
  searchQuery: string;
  filterType: 'all' | 'with_trailers';
  mediaTypeFilter: 'all' | 'movie' | 'tv';
  statusFilter: 'all' | 'active' | 'unwatched' | 'still_watching' | 'completed' | 'dropped';
  languageFilter: string;
  sortBy: 'rottenTomatoes' | 'imdb' | 'rating' | 'runtime' | 'title' | 'year' | 'recently_added';
  sortOrder: 'asc' | 'desc';
  selectedGenres: string[];
  excludedGenres: string[];
  selectedThemes: string[];
  excludedThemes: string[];
  genreMatchMode: 'any' | 'all';
  selectedCountries: string[];
  excludedCountries: string[];
  minYear: string;
  maxYear: string;
  minRating: number;
  activePreset: string;
  ignoreAnime: boolean;
}

export const DEFAULT_FILTER_STATE: CatalogFilterState = {
  searchQuery: '',
  filterType: 'all',
  mediaTypeFilter: 'all',
  statusFilter: 'all',
  languageFilter: 'all',
  sortBy: 'recently_added',
  sortOrder: 'desc',
  selectedGenres: [],
  excludedGenres: [],
  selectedThemes: [],
  excludedThemes: [],
  genreMatchMode: 'any',
  selectedCountries: [],
  excludedCountries: [],
  minYear: '',
  maxYear: '',
  minRating: 0,
  activePreset: 'all',
  ignoreAnime: false,
};

const STORAGE_KEY = 'netflix_catalog_filters';

/**
 * Checks if the URL currently has any catalog filter search params
 */
export function hasFilterParamsInUrl(search: string = window.location.search): boolean {
  const params = new URLSearchParams(search);
  const filterKeys = [
    'q', 'filterType', 'mediaType', 'status', 'lang',
    'sortBy', 'sortOrder', 'genres', 'excludeGenres', 'themes', 'excludeThemes', 'genreMode',
    'countries', 'excludeCountries', 'minYear', 'maxYear', 'minRating', 'preset', 'ignoreAnime'
  ];
  return filterKeys.some(key => params.has(key));
}

/**
 * Parses URL search params or fallback to localStorage
 */
export function parseInitialFilters(): CatalogFilterState {
  const params = new URLSearchParams(window.location.search);
  const hasUrlFilters = hasFilterParamsInUrl(window.location.search);

  if (hasUrlFilters) {
    const filters: CatalogFilterState = { ...DEFAULT_FILTER_STATE };
    
    if (params.has('q')) filters.searchQuery = params.get('q') || '';
    if (params.has('filterType')) {
      const ft = params.get('filterType');
      if (ft === 'with_trailers' || ft === 'all') filters.filterType = ft;
    }
    if (params.has('mediaType')) {
      const mt = params.get('mediaType') as any;
      if (['all', 'movie', 'tv'].includes(mt)) filters.mediaTypeFilter = mt;
    }
    if (params.has('status')) {
      const st = params.get('status') as any;
      if (['all', 'active', 'unwatched', 'still_watching', 'completed', 'dropped'].includes(st)) filters.statusFilter = st;
    }
    if (params.has('lang')) {
      filters.languageFilter = params.get('lang') || 'all';
    }
    if (params.has('sortBy')) {
      const sb = params.get('sortBy') as any;
      if (['rottenTomatoes', 'imdb', 'rating', 'runtime', 'title', 'year', 'recently_added'].includes(sb)) {
        filters.sortBy = sb;
      }
    }
    if (params.has('sortOrder')) {
      const so = params.get('sortOrder') as any;
      if (so === 'asc' || so === 'desc') filters.sortOrder = so;
    }
    if (params.has('genres')) {
      const g = params.get('genres');
      filters.selectedGenres = g ? g.split(',').map(s => s.trim()).filter(Boolean) : [];
    }
    if (params.has('excludeGenres')) {
      const eg = params.get('excludeGenres');
      filters.excludedGenres = eg ? eg.split(',').map(s => s.trim()).filter(Boolean) : [];
    }
    if (params.has('themes')) {
      const t = params.get('themes');
      filters.selectedThemes = t ? t.split(',').map(s => s.trim()).filter(Boolean) : [];
    }
    if (params.has('excludeThemes')) {
      const et = params.get('excludeThemes');
      filters.excludedThemes = et ? et.split(',').map(s => s.trim()).filter(Boolean) : [];
    }
    if (params.has('genreMode')) {
      const gm = params.get('genreMode') as any;
      if (gm === 'all' || gm === 'any') filters.genreMatchMode = gm;
    }
    if (params.has('countries')) {
      const c = params.get('countries');
      filters.selectedCountries = c ? c.split(',').map(s => s.trim()).filter(Boolean) : [];
    }
    if (params.has('excludeCountries')) {
      const ec = params.get('excludeCountries');
      filters.excludedCountries = ec ? ec.split(',').map(s => s.trim()).filter(Boolean) : [];
    }
    if (params.has('minYear')) filters.minYear = params.get('minYear') || '';
    if (params.has('maxYear')) filters.maxYear = params.get('maxYear') || '';
    if (params.has('minRating')) {
      const mr = parseFloat(params.get('minRating') || '0');
      if (!isNaN(mr)) filters.minRating = mr;
    }
    if (params.has('preset')) {
      filters.activePreset = params.get('preset') || 'all';
    }
    if (params.has('ignoreAnime')) {
      filters.ignoreAnime = params.get('ignoreAnime') === 'true';
    }

    return filters;
  }

  // Fallback to localStorage if no filter query params in URL
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...DEFAULT_FILTER_STATE,
        ...parsed,
      };
    }
  } catch (e) {
    console.warn('Failed to parse saved filters from localStorage:', e);
  }

  return { ...DEFAULT_FILTER_STATE };
}

/**
 * Serializes filters to URLSearchParams without removing unrelated params (like `tab`)
 */
export function syncFiltersToUrlAndStorage(filters: CatalogFilterState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch (e) {
    console.warn('Failed to save filters to localStorage:', e);
  }

  const currentParams = new URLSearchParams(window.location.search);

  // Helper to set or delete param
  const updateParam = (key: string, value: string | undefined | null, defaultValue?: string) => {
    if (value && value !== defaultValue) {
      currentParams.set(key, value);
    } else {
      currentParams.delete(key);
    }
  };

  updateParam('q', filters.searchQuery ? filters.searchQuery.trim() : undefined);
  updateParam('filterType', filters.filterType, 'all');
  updateParam('mediaType', filters.mediaTypeFilter, 'all');
  updateParam('status', filters.statusFilter, 'all');
  updateParam('lang', filters.languageFilter, 'all');
  updateParam('sortBy', filters.sortBy, 'recently_added');
  updateParam('sortOrder', filters.sortOrder, 'desc');
  
  if (filters.selectedGenres.length > 0) {
    currentParams.set('genres', filters.selectedGenres.join(','));
  } else {
    currentParams.delete('genres');
  }

  if (filters.excludedGenres.length > 0) {
    currentParams.set('excludeGenres', filters.excludedGenres.join(','));
  } else {
    currentParams.delete('excludeGenres');
  }

  if (filters.selectedThemes.length > 0) {
    currentParams.set('themes', filters.selectedThemes.join(','));
  } else {
    currentParams.delete('themes');
  }

  if (filters.excludedThemes.length > 0) {
    currentParams.set('excludeThemes', filters.excludedThemes.join(','));
  } else {
    currentParams.delete('excludeThemes');
  }

  updateParam('genreMode', filters.genreMatchMode, 'any');

  if (filters.selectedCountries.length > 0) {
    currentParams.set('countries', filters.selectedCountries.join(','));
  } else {
    currentParams.delete('countries');
  }

  if (filters.excludedCountries.length > 0) {
    currentParams.set('excludeCountries', filters.excludedCountries.join(','));
  } else {
    currentParams.delete('excludeCountries');
  }

  updateParam('minYear', filters.minYear);
  updateParam('maxYear', filters.maxYear);
  updateParam('minRating', filters.minRating > 0 ? filters.minRating.toString() : undefined);
  updateParam('preset', filters.activePreset, 'all');
  if (filters.ignoreAnime) {
    currentParams.set('ignoreAnime', 'true');
  } else {
    currentParams.delete('ignoreAnime');
  }

  const queryString = currentParams.toString();
  const newRelativePathQuery = window.location.pathname + (queryString ? '?' + queryString : '') + window.location.hash;
  window.history.replaceState(null, '', newRelativePathQuery);
}

/**
 * Clears saved filter storage and URL search parameters for filters
 */
export function clearFiltersFromUrlAndStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear filters from localStorage:', e);
  }

  const currentParams = new URLSearchParams(window.location.search);
  const filterKeys = [
    'q', 'filterType', 'mediaType', 'status', 'lang',
    'sortBy', 'sortOrder', 'genres', 'excludeGenres', 'themes', 'excludeThemes', 'genreMode',
    'countries', 'excludeCountries', 'minYear', 'maxYear', 'minRating', 'preset', 'ignoreAnime'
  ];
  filterKeys.forEach(key => currentParams.delete(key));

  const queryString = currentParams.toString();
  const newRelativePathQuery = window.location.pathname + (queryString ? '?' + queryString : '') + window.location.hash;
  window.history.replaceState(null, '', newRelativePathQuery);
}
