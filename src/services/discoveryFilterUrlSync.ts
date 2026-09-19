export interface DiscoveryFilterState {
  searchQuery: string;
  mediaType: 'all' | 'movie' | 'tv';
  statusFilter:
    | 'all'
    | 'not_in_library'
    | 'not_in_library_unwatched'
    | 'in_library'
    | 'unwatched';
  preset: string;
  sortBy:
    | 'netflix_newest'
    | 'recently_added'
    | 'year_desc'
    | 'year_asc'
    | 'imdb_desc'
    | 'imdb_asc'
    | 'tmdb_desc'
    | 'tmdb_asc'
    | 'rt_desc'
    | 'alpha_asc'
    | 'alpha_desc'
    | 'runtime_shortest'
    | 'runtime_longest'
    | 'episodes_fewest'
    | 'episodes_most';
  sortOrder: 'asc' | 'desc';
  selectedGenres: string[];
  excludedGenres: string[];
  genreMatchMode: 'any' | 'all';
  selectedCountries: string[];
  excludedCountries: string[];
  language: string; // 'all' | 'hindi' | 'en' etc.
  audioFilter: string; // 'all' | 'hi' | 'en' etc.
  minYear: string;
  maxYear: string;
  minRating: number;
}

export const DEFAULT_DISCOVERY_FILTER_STATE: DiscoveryFilterState = {
  searchQuery: '',
  mediaType: 'all',
  statusFilter: 'all',
  preset: 'all',
  sortBy: 'netflix_newest',
  sortOrder: 'desc',
  selectedGenres: [],
  excludedGenres: [],
  genreMatchMode: 'any',
  selectedCountries: [],
  excludedCountries: [],
  language: 'all',
  audioFilter: 'all',
  minYear: '',
  maxYear: '',
  minRating: 0,
};

const STORAGE_KEY = 'netflix_discovery_filters';

export function hasDiscoveryFilterParamsInUrl(search: string = window.location.search): boolean {
  const params = new URLSearchParams(search);
  const filterKeys = [
    'dq',
    'dMediaType',
    'dStatus',
    'dPreset',
    'dSortBy',
    'dSortOrder',
    'dGenres',
    'dExcludeGenres',
    'dGenreMode',
    'dCountries',
    'dExcludeCountries',
    'dLang',
    'dAudio',
    'dMinYear',
    'dMaxYear',
    'dMinRating',
  ];
  return filterKeys.some((key) => params.has(key));
}

export function parseInitialDiscoveryFilters(): DiscoveryFilterState {
  const params = new URLSearchParams(window.location.search);
  const hasUrl = hasDiscoveryFilterParamsInUrl(window.location.search);

  if (hasUrl) {
    const filters: DiscoveryFilterState = { ...DEFAULT_DISCOVERY_FILTER_STATE };
    if (params.has('dq')) filters.searchQuery = params.get('dq') || '';
    if (params.has('dMediaType')) {
      const mt = params.get('dMediaType') as any;
      if (['all', 'movie', 'tv'].includes(mt)) filters.mediaType = mt;
    }
    if (params.has('dStatus')) {
      const st = params.get('dStatus') as any;
      if (['all', 'not_in_library', 'not_in_library_unwatched', 'in_library', 'unwatched'].includes(st)) {
        filters.statusFilter = st;
      }
    }
    if (params.has('dPreset')) filters.preset = params.get('dPreset') || 'all';
    if (params.has('dSortBy')) {
      filters.sortBy = (params.get('dSortBy') as any) || 'netflix_newest';
    }
    if (params.has('dSortOrder')) {
      const so = params.get('dSortOrder') as any;
      if (so === 'asc' || so === 'desc') filters.sortOrder = so;
    }
    if (params.has('dGenres')) {
      const g = params.get('dGenres');
      filters.selectedGenres = g ? g.split(',').map((s) => s.trim()).filter(Boolean) : [];
    }
    if (params.has('dExcludeGenres')) {
      const eg = params.get('dExcludeGenres');
      filters.excludedGenres = eg ? eg.split(',').map((s) => s.trim()).filter(Boolean) : [];
    }
    if (params.has('dGenreMode')) {
      const gm = params.get('dGenreMode') as any;
      if (gm === 'all' || gm === 'any') filters.genreMatchMode = gm;
    }
    if (params.has('dCountries')) {
      const c = params.get('dCountries');
      filters.selectedCountries = c ? c.split(',').map((s) => s.trim()).filter(Boolean) : [];
    }
    if (params.has('dExcludeCountries')) {
      const ec = params.get('dExcludeCountries');
      filters.excludedCountries = ec ? ec.split(',').map((s) => s.trim()).filter(Boolean) : [];
    }
    if (params.has('dLang')) filters.language = params.get('dLang') || 'all';
    if (params.has('dAudio')) filters.audioFilter = params.get('dAudio') || 'all';
    if (params.has('dMinYear')) filters.minYear = params.get('dMinYear') || '';
    if (params.has('dMaxYear')) filters.maxYear = params.get('dMaxYear') || '';
    if (params.has('dMinRating')) {
      const mr = parseFloat(params.get('dMinRating') || '0');
      if (!isNaN(mr)) filters.minRating = mr;
    }
    return filters;
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return {
        ...DEFAULT_DISCOVERY_FILTER_STATE,
        ...JSON.parse(saved),
      };
    }
  } catch {}

  return { ...DEFAULT_DISCOVERY_FILTER_STATE };
}

export function syncDiscoveryFiltersToUrlAndStorage(filters: DiscoveryFilterState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {}

  const currentParams = new URLSearchParams(window.location.search);

  const updateParam = (key: string, value: string | undefined | null, defaultValue?: string) => {
    if (value && value !== defaultValue) {
      currentParams.set(key, value);
    } else {
      currentParams.delete(key);
    }
  };

  updateParam('dq', filters.searchQuery ? filters.searchQuery.trim() : undefined);
  updateParam('dMediaType', filters.mediaType, 'all');
  updateParam('dStatus', filters.statusFilter, 'all');
  updateParam('dPreset', filters.preset, 'all');
  updateParam('dSortBy', filters.sortBy, 'netflix_newest');
  updateParam('dSortOrder', filters.sortOrder, 'desc');

  if (filters.selectedGenres.length > 0) {
    currentParams.set('dGenres', filters.selectedGenres.join(','));
  } else {
    currentParams.delete('dGenres');
  }

  if (filters.excludedGenres.length > 0) {
    currentParams.set('dExcludeGenres', filters.excludedGenres.join(','));
  } else {
    currentParams.delete('dExcludeGenres');
  }

  updateParam('dGenreMode', filters.genreMatchMode, 'any');

  if (filters.selectedCountries.length > 0) {
    currentParams.set('dCountries', filters.selectedCountries.join(','));
  } else {
    currentParams.delete('dCountries');
  }

  if (filters.excludedCountries.length > 0) {
    currentParams.set('dExcludeCountries', filters.excludedCountries.join(','));
  } else {
    currentParams.delete('dExcludeCountries');
  }

  updateParam('dLang', filters.language, 'all');
  updateParam('dAudio', filters.audioFilter, 'all');
  updateParam('dMinYear', filters.minYear);
  updateParam('dMaxYear', filters.maxYear);
  updateParam('dMinRating', filters.minRating > 0 ? filters.minRating.toString() : undefined);

  const queryString = currentParams.toString();
  const newRelativePathQuery = window.location.pathname + (queryString ? '?' + queryString : '') + window.location.hash;
  window.history.replaceState(null, '', newRelativePathQuery);
}

export function clearDiscoveryFiltersFromUrlAndStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}

  const currentParams = new URLSearchParams(window.location.search);
  const filterKeys = [
    'dq',
    'dMediaType',
    'dStatus',
    'dPreset',
    'dSortBy',
    'dSortOrder',
    'dGenres',
    'dExcludeGenres',
    'dGenreMode',
    'dCountries',
    'dExcludeCountries',
    'dLang',
    'dAudio',
    'dMinYear',
    'dMaxYear',
    'dMinRating',
  ];
  filterKeys.forEach((k) => currentParams.delete(k));

  const queryString = currentParams.toString();
  const newRelativePathQuery = window.location.pathname + (queryString ? '?' + queryString : '') + window.location.hash;
  window.history.replaceState(null, '', newRelativePathQuery);
}
