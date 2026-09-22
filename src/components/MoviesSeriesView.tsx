import React, { useState, useMemo, useEffect } from 'react';
import { Film, Tv, Search, RefreshCw, AlertCircle, ArrowUpDown, Sliders, Globe, Calendar, X, Sparkles, Languages, Ban, Check, Star } from 'lucide-react';
import { AppSettings, LibraryItem } from '../types';
import { MovieCard } from './MovieCard';
import { TvSeriesCard } from './TvSeriesCard';
import { itemHasLanguage, normalizeCountryName, calculateSearchRelevance } from '../services/normalizer';
import { MovieSearchEngine } from '../services/searchEngine';
import { calculateSeriesRuntime } from '../services/analytics';
import { CANONICAL_THEMES } from '../services/themeMapper';
import {
  parseInitialFilters,
  syncFiltersToUrlAndStorage,
  clearFiltersFromUrlAndStorage,
  DEFAULT_FILTER_STATE,
  CatalogFilterState,
} from '../services/filterUrlSync';

export const EUROPEAN_COUNTRIES = new Set([
  'United Kingdom',
  'Spain',
  'France',
  'Germany',
  'Italy',
  'Belgium',
  'Netherlands',
  'Sweden',
  'Denmark',
  'Norway',
  'Finland',
  'Poland',
  'Ireland',
  'Portugal',
  'Czech Republic',
  'Austria',
  'Switzerland',
]);

export const ASIAN_COUNTRIES = new Set([
  'Japan',
  'South Korea',
  'India',
  'China',
  'Hong Kong',
  'Taiwan',
  'Thailand',
  'Indonesia',
  'Vietnam',
  'Philippines',
  'Singapore',
  'Malaysia',
  'Turkey',
]);

interface MoviesSeriesViewProps {
  items: LibraryItem[];
  settings: AppSettings;
  onSelectItem: (item: LibraryItem) => void;
  onChangeMatch: (item: LibraryItem) => void;
  onRescan: () => void;
  isRescanning: boolean;
  onOpenSurpriseMe?: () => void;
  onUpdateItem?: (item: LibraryItem) => void;
  onOpenDropModal?: (item: LibraryItem) => void;
  onSyncWithDiscovery?: () => Promise<void> | void;
}

type SortField = 'rottenTomatoes' | 'imdb' | 'rating' | 'runtime' | 'title' | 'year' | 'recently_added';
type MediaFilterType = 'all' | 'movie' | 'tv';
type StatusFilterType = 'all' | 'active' | 'unwatched' | 'still_watching' | 'completed' | 'dropped';
type PresetType =
  | 'all'
  | 'hollywood'
  | 'bollywood'
  | 'kdramas'
  | 'anime'
  | 'ignore_anime'
  | 'european'
  | 'asian'
  | 'hindi_dubbed'
  | 'highly_rated'
  | 'recently_added';

export const MoviesSeriesView: React.FC<MoviesSeriesViewProps> = ({
  items,
  settings,
  onSelectItem,
  onChangeMatch,
  onRescan,
  isRescanning,
  onOpenSurpriseMe,
  onUpdateItem,
  onOpenDropModal,
  onSyncWithDiscovery,
}) => {
  const [isSyncingDiscovery, setIsSyncingDiscovery] = useState(false);
  // Load initial filters from URL search params or localStorage
  const initialFilters = useMemo(() => parseInitialFilters(), []);

  const [searchQuery, setSearchQuery] = useState(initialFilters.searchQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialFilters.searchQuery);

  // Debounce search query (150ms for snappy responsiveness)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Scoped MovieSearchEngine for user Library items
  const searchEngine = useMemo(() => {
    const engine = new MovieSearchEngine();
    if (items.length > 0) {
      engine.initializeIndex([], items);
    }
    return engine;
  }, [items]);

  // Debounced smart search execution
  const searchEngineResponse = useMemo(() => {
    if (!debouncedQuery.trim() || !searchEngine.getIsReady()) {
      return null;
    }
    return searchEngine.search(debouncedQuery, 0); // 0 = all matches
  }, [debouncedQuery, searchEngine]);

  const [filterType, setFilterType] = useState<'all' | 'with_trailers'>(initialFilters.filterType);
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaFilterType>(initialFilters.mediaTypeFilter);
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>(initialFilters.statusFilter);
  
  // Language filter: 'all' | 'hindi' | 'english' | 'japanese' | 'korean' | custom
  const [languageFilter, setLanguageFilter] = useState<string>(initialFilters.languageFilter);

  // Active quick preset and ignore anime flag
  const [activePreset, setActivePreset] = useState<string>(initialFilters.activePreset || 'all');
  const [ignoreAnime, setIgnoreAnime] = useState<boolean>(initialFilters.ignoreAnime || false);

  // Country search inside modal
  const [countrySearchQuery, setCountrySearchQuery] = useState('');

  // Sorting
  const [sortBy, setSortBy] = useState<SortField>(initialFilters.sortBy);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(initialFilters.sortOrder);

  // Multi-genre filter (include & exclude)
  const [selectedGenres, setSelectedGenres] = useState<string[]>(initialFilters.selectedGenres);
  const [excludedGenres, setExcludedGenres] = useState<string[]>(initialFilters.excludedGenres || []);
  const [genreModalTab, setGenreModalTab] = useState<'include' | 'exclude'>('include');
  const [genreSearchQuery, setGenreSearchQuery] = useState('');
  const [genreMatchMode, setGenreMatchMode] = useState<'any' | 'all'>(initialFilters.genreMatchMode);
  const [showGenreModal, setShowGenreModal] = useState(false);

  // Multi-theme filter (include & exclude)
  const [selectedThemes, setSelectedThemes] = useState<string[]>(initialFilters.selectedThemes || []);
  const [excludedThemes, setExcludedThemes] = useState<string[]>(initialFilters.excludedThemes || []);
  const [themeModalTab, setThemeModalTab] = useState<'include' | 'exclude'>('include');
  const [themeSearchQuery, setThemeSearchQuery] = useState('');
  const [showThemeModal, setShowThemeModal] = useState(false);

  // Multi-country filter (include & exclude)
  const [selectedCountries, setSelectedCountries] = useState<string[]>(initialFilters.selectedCountries);
  const [excludedCountries, setExcludedCountries] = useState<string[]>(initialFilters.excludedCountries);
  const [countryModalTab, setCountryModalTab] = useState<'include' | 'exclude'>('include');
  const [showCountryModal, setShowCountryModal] = useState(false);

  // Year range filter
  const [minYear, setMinYear] = useState<string>(initialFilters.minYear);
  const [maxYear, setMaxYear] = useState<string>(initialFilters.maxYear);
  const [showYearModal, setShowYearModal] = useState(false);

  // Min rating filter & modal
  const [minRating, setMinRating] = useState<number>(initialFilters.minRating);
  const [showRatingModal, setShowRatingModal] = useState(false);

  // Synchronize state changes to URL query params and localStorage
  useEffect(() => {
    const currentState: CatalogFilterState = {
      searchQuery,
      filterType,
      mediaTypeFilter,
      statusFilter,
      languageFilter,
      sortBy,
      sortOrder,
      selectedGenres,
      excludedGenres,
      selectedThemes,
      excludedThemes,
      genreMatchMode,
      selectedCountries,
      excludedCountries,
      minYear,
      maxYear,
      minRating,
      activePreset,
      ignoreAnime,
    };
    syncFiltersToUrlAndStorage(currentState);
  }, [
    searchQuery,
    filterType,
    mediaTypeFilter,
    statusFilter,
    languageFilter,
    sortBy,
    sortOrder,
    selectedGenres,
    excludedGenres,
    selectedThemes,
    excludedThemes,
    genreMatchMode,
    selectedCountries,
    excludedCountries,
    minYear,
    maxYear,
    minRating,
    activePreset,
    ignoreAnime,
  ]);

  // Support browser back/forward buttons (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const updated = parseInitialFilters();
      setSearchQuery(updated.searchQuery);
      setFilterType(updated.filterType);
      setMediaTypeFilter(updated.mediaTypeFilter);
      setStatusFilter(updated.statusFilter);
      setLanguageFilter(updated.languageFilter);
      setSortBy(updated.sortBy);
      setSortOrder(updated.sortOrder);
      setSelectedGenres(updated.selectedGenres);
      setExcludedGenres(updated.excludedGenres || []);
      setSelectedThemes(updated.selectedThemes || []);
      setExcludedThemes(updated.excludedThemes || []);
      setGenreMatchMode(updated.genreMatchMode);
      setSelectedCountries(updated.selectedCountries);
      setExcludedCountries(updated.excludedCountries);
      setMinYear(updated.minYear);
      setMaxYear(updated.maxYear);
      setMinRating(updated.minRating);
      setActivePreset(updated.activePreset || 'all');
      setIgnoreAnime(updated.ignoreAnime || false);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Dynamic available genres from library
  const allGenres = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => (item.genres || []).forEach((g) => set.add(g)));
    return Array.from(set).sort();
  }, [items]);

  // Dynamic available themes from library + canonical themes
  const availableThemes = useMemo(() => {
    const set = new Set<string>(CANONICAL_THEMES);
    items.forEach((item) => (item.themes || []).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [items]);

  // Dynamic available countries from library (canonicalized & merged)
  const allCountries = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      (item.countries || []).forEach((c) => {
        const norm = normalizeCountryName(c);
        if (norm) set.add(norm);
      });
    });
    return Array.from(set).sort();
  }, [items]);

  // Handle Preset Quick Filter (matching Discovery View exactly)
  const handleApplyPreset = (preset: PresetType) => {
    setActivePreset(preset);

    if (preset === 'all') {
      setMediaTypeFilter('all');
      setSelectedCountries([]);
      setSelectedGenres([]);
      setSelectedThemes([]);
      setLanguageFilter('all');
      setMinRating(0);
      setIgnoreAnime(false);
    } else if (preset === 'hollywood') {
      setMediaTypeFilter('all');
      setSelectedCountries(['United States']);
      setSelectedGenres([]);
      setSelectedThemes([]);
      setLanguageFilter('all');
      setMinRating(0);
    } else if (preset === 'bollywood') {
      setMediaTypeFilter('all');
      setSelectedCountries(['India']);
      setSelectedGenres([]);
      setSelectedThemes([]);
      setLanguageFilter('all');
      setMinRating(0);
    } else if (preset === 'kdramas') {
      setMediaTypeFilter('tv');
      setSelectedCountries(['South Korea']);
      setSelectedGenres([]);
      setSelectedThemes([]);
      setLanguageFilter('all');
      setMinRating(0);
    } else if (preset === 'anime') {
      setMediaTypeFilter('all');
      setSelectedCountries(['Japan']);
      setSelectedGenres(['Animation']);
      setSelectedThemes([]);
      setLanguageFilter('all');
      setMinRating(0);
    } else if (preset === 'ignore_anime') {
      setIgnoreAnime((prev) => !prev);
      return;
    } else if (preset === 'european') {
      setMediaTypeFilter('all');
      setSelectedCountries(Array.from(EUROPEAN_COUNTRIES));
      setSelectedGenres([]);
      setSelectedThemes([]);
      setLanguageFilter('all');
      setMinRating(0);
    } else if (preset === 'asian') {
      setMediaTypeFilter('all');
      setSelectedCountries(Array.from(ASIAN_COUNTRIES));
      setSelectedGenres([]);
      setSelectedThemes([]);
      setLanguageFilter('all');
      setMinRating(0);
    } else if (preset === 'hindi_dubbed') {
      setMediaTypeFilter('all');
      setSelectedCountries([]);
      setSelectedGenres([]);
      setSelectedThemes([]);
      setLanguageFilter('hindi');
      setMinRating(0);
    } else if (preset === 'highly_rated') {
      setMediaTypeFilter('all');
      setSelectedCountries([]);
      setSelectedGenres([]);
      setSelectedThemes([]);
      setLanguageFilter('all');
      setMinRating(8.0);
      setSortBy('imdb');
    } else if (preset === 'recently_added') {
      setMediaTypeFilter('all');
      setSelectedCountries([]);
      setSelectedGenres([]);
      setSelectedThemes([]);
      setLanguageFilter('all');
      setMinRating(0);
      setSortBy('recently_added');
    }
  };

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (activePreset !== 'all') count++;
    if (ignoreAnime) count++;
    if (mediaTypeFilter !== 'all') count++;
    if (statusFilter !== 'all') count++;
    if (languageFilter !== 'all') count++;
    if (selectedGenres.length > 0) count++;
    if (excludedGenres.length > 0) count++;
    if (selectedThemes.length > 0) count++;
    if (excludedThemes.length > 0) count++;
    if (selectedCountries.length > 0) count++;
    if (excludedCountries.length > 0) count++;
    if (minYear || maxYear) count++;
    if (minRating > 0) count++;
    if (filterType !== 'all') count++;
    if (searchQuery.trim()) count++;
    return count;
  }, [
    activePreset,
    ignoreAnime,
    mediaTypeFilter,
    statusFilter,
    languageFilter,
    selectedGenres,
    excludedGenres,
    selectedThemes,
    excludedThemes,
    selectedCountries,
    excludedCountries,
    minYear,
    maxYear,
    minRating,
    filterType,
    searchQuery,
  ]);

  const clearAllFilters = () => {
    setActivePreset('all');
    setIgnoreAnime(false);
    setMediaTypeFilter('all');
    setStatusFilter('all');
    setLanguageFilter('all');
    setSelectedGenres([]);
    setExcludedGenres([]);
    setSelectedThemes([]);
    setExcludedThemes([]);
    setThemeSearchQuery('');
    setGenreSearchQuery('');
    setSelectedCountries([]);
    setExcludedCountries([]);
    setCountrySearchQuery('');
    setMinYear('');
    setMaxYear('');
    setMinRating(0);
    setFilterType('all');
    setSearchQuery('');
    clearFiltersFromUrlAndStorage();
  };

  // Quick action: Mark watched directly from card
  const handleQuickMarkWatched = (item: LibraryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onUpdateItem) return;
    const isCurrentlyCompleted = item.isCompleted || item.viewingStatus === 'completed';
    const updated: LibraryItem = {
      ...item,
      isCompleted: !isCurrentlyCompleted,
      viewingStatus: !isCurrentlyCompleted ? 'completed' : 'unwatched',
      completedAt: !isCurrentlyCompleted ? new Date().toISOString() : undefined,
      updatedAt: new Date().toISOString(),
    };
    onUpdateItem(updated);
  };

  // Quick action: Drop directly from card
  const handleQuickDrop = (item: LibraryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenDropModal) {
      onOpenDropModal(item);
    } else if (onUpdateItem) {
      const updated: LibraryItem = {
        ...item,
        viewingStatus: 'dropped',
        droppedReason: 'Dropped from catalog',
        droppedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      onUpdateItem(updated);
    }
  };

  // Quick action: Toggle still_watching from card
  const handleQuickAddToWatching = (item: LibraryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onUpdateItem) return;
    const isCurrentlyWatching = item.viewingStatus === 'still_watching';
    const updated: LibraryItem = {
      ...item,
      viewingStatus: isCurrentlyWatching ? 'unwatched' : 'still_watching',
      isCompleted: false,
      droppedReason: undefined,
      droppedAt: undefined,
      updatedAt: new Date().toISOString(),
    };
    onUpdateItem(updated);
  };

  const sortedItems = useMemo(() => {
    let result = items;

    // 1. Media Type
    if (mediaTypeFilter !== 'all') {
      result = result.filter((x) => x.mediaType === mediaTypeFilter);
    }

    // 2. Status
    if (statusFilter === 'active') {
      // Active: Unwatched and in progress (still watching), excluding completed and dropped
      result = result.filter((x) => {
        const isDone = x.isCompleted || x.viewingStatus === 'completed';
        const isDropped = x.viewingStatus === 'dropped' || !!x.droppedReason;
        return !isDone && !isDropped;
      });
    } else if (statusFilter === 'dropped') {
      // Explicitly viewing dropped items
      result = result.filter((x) => x.viewingStatus === 'dropped' || !!x.droppedReason);
    } else if (statusFilter !== 'all') {
      // Specific status (unwatched, still_watching, completed) - also exclude dropped
      result = result.filter((x) => {
        const isDropped = x.viewingStatus === 'dropped' || !!x.droppedReason;
        if (isDropped) return false;
        const status = x.viewingStatus || (x.isCompleted ? 'completed' : 'unwatched');
        return status === statusFilter;
      });
    } else {
      // statusFilter === 'all': Hide dropped items from the catalog view altogether unless explicitly viewing 'dropped'
      result = result.filter((x) => {
        const isDropped = x.viewingStatus === 'dropped' || !!x.droppedReason;
        return !isDropped;
      });
    }

    // 3. Language filter (Available in Hindi, English, Japanese, etc.)
    if (languageFilter !== 'all') {
      result = result.filter((x) => itemHasLanguage(x, languageFilter));
    }

    // 4. Search query with intelligent relevance scoring, fuzzy typo-tolerance, and year parsing
    let searchRelevanceMap: Map<string, number> | null = null;
    if (debouncedQuery && debouncedQuery.trim()) {
      if (searchEngineResponse && searchEngineResponse.results.length > 0) {
        searchRelevanceMap = new Map();
        for (const r of searchEngineResponse.results) {
          searchRelevanceMap.set(r.item.id, r.score);
          if (r.item.videoId) {
            searchRelevanceMap.set(r.item.videoId, r.score);
          }
        }
        result = result.filter((item) => {
          return (
            searchRelevanceMap!.has(item.id) ||
            (item.videoId ? searchRelevanceMap!.has(item.videoId) : false)
          );
        });
      } else {
        result = [];
      }
    }

    // 5. European & Asian preset check
    if (activePreset === 'european') {
      result = result.filter((x) => (x.countries || []).some((c) => EUROPEAN_COUNTRIES.has(normalizeCountryName(c))));
    } else if (activePreset === 'asian') {
      result = result.filter((x) => (x.countries || []).some((c) => ASIAN_COUNTRIES.has(normalizeCountryName(c))));
    } else if (selectedCountries.length > 0) {
      // 5b. Multi-country filter (compares canonical names)
      result = result.filter((x) => {
        const itemCountries = (x.countries || []).map((c) => normalizeCountryName(c));
        return selectedCountries.some((selected) => itemCountries.includes(selected));
      });
    }

    // 5c. Ignore Anime filter (Applies whenever activePreset is ignore_anime OR ignoreAnime toggle is ON)
    if (ignoreAnime || activePreset === 'ignore_anime') {
      result = result.filter((x) => {
        const isAnimation = (x.genres || []).some((g) => g.toLowerCase() === 'animation');
        return !isAnimation;
      });
    }

    // 6. Quick filter types
    if (filterType === 'with_trailers') {
      result = result.filter((x) => !!x.trailer);
    }

    // 7. Exclude Countries filter
    if (excludedCountries.length > 0) {
      result = result.filter((x) => {
        const itemCountries = (x.countries || []).map((c) => normalizeCountryName(c));
        return !excludedCountries.some((excluded) => itemCountries.includes(excluded));
      });
    }

    // 8. Multi-genre filter (Includes)
    if (selectedGenres.length > 0) {
      result = result.filter((x) => {
        const genres = x.genres || [];
        if (genreMatchMode === 'all') {
          return selectedGenres.every((g) => genres.includes(g));
        } else {
          return selectedGenres.some((g) => genres.includes(g));
        }
      });
    }

    // 8b. Multi-genre filter (Excludes)
    if (excludedGenres.length > 0) {
      result = result.filter((x) => !(x.genres || []).some((g) => excludedGenres.includes(g)));
    }

    // 9. Themes filter (Includes)
    if (selectedThemes.length > 0) {
      if (genreMatchMode === 'all') {
        result = result.filter((x) => selectedThemes.every((t) => (x.themes || []).includes(t)));
      } else {
        result = result.filter((x) => selectedThemes.some((t) => (x.themes || []).includes(t)));
      }
    }

    // 9b. Themes filter (Excludes)
    if (excludedThemes.length > 0) {
      result = result.filter((x) => !(x.themes || []).some((t) => excludedThemes.includes(t)));
    }

    // 10. Year range
    if (minYear) {
      const y = parseInt(minYear, 10);
      if (!isNaN(y)) result = result.filter((x) => (x.releaseYear ? x.releaseYear >= y : true));
    }
    if (maxYear) {
      const y = parseInt(maxYear, 10);
      if (!isNaN(y)) result = result.filter((x) => (x.releaseYear ? x.releaseYear <= y : true));
    }

    // 11. Min rating
    if (minRating > 0) {
      result = result.filter((x) => {
        const score = x.rottenTomatoesRating !== undefined ? x.rottenTomatoesRating / 10 : (x.imdbRating || x.rating || 0);
        return score >= minRating;
      });
    }

    // 12. Sort
    return [...result].sort((a, b) => {
      if (searchRelevanceMap) {
        const scoreA = searchRelevanceMap.get(a.id) || 0;
        const scoreB = searchRelevanceMap.get(b.id) || 0;
        if (scoreA !== scoreB) {
          return scoreB - scoreA; // Higher relevance first
        }
      }

      let comparison = 0;

      if (sortBy === 'recently_added') {
        const dateA = new Date(a.addedAt || 0).getTime();
        const dateB = new Date(b.addedAt || 0).getTime();
        comparison = dateB - dateA;
      } else if (sortBy === 'runtime') {
        const runtimeA = a.mediaType === 'movie' ? (a.runtimeMinutes || 0) : calculateSeriesRuntime(a, settings.maxEpisodesPerSeries, settings.capSeriesEpisodes).includedRuntimeMinutes;
        const runtimeB = b.mediaType === 'movie' ? (b.runtimeMinutes || 0) : calculateSeriesRuntime(b, settings.maxEpisodesPerSeries, settings.capSeriesEpisodes).includedRuntimeMinutes;
        comparison = runtimeB - runtimeA;
      } else if (sortBy === 'rottenTomatoes') {
        const rtA = a.rottenTomatoesRating !== undefined ? a.rottenTomatoesRating : -1;
        const rtB = b.rottenTomatoesRating !== undefined ? b.rottenTomatoesRating : -1;
        comparison = rtB - rtA;
      } else if (sortBy === 'imdb') {
        const imdbA = a.imdbRating || a.rating || 0;
        const imdbB = b.imdbRating || b.rating || 0;
        comparison = imdbB - imdbA;
      } else if (sortBy === 'title') {
        const titleA = a.externalTitle || a.originalTitle;
        const titleB = b.externalTitle || b.originalTitle;
        comparison = titleA.localeCompare(titleB);
      } else if (sortBy === 'year') {
        const yearA = a.releaseYear || 0;
        const yearB = b.releaseYear || 0;
        comparison = yearB - yearA;
      } else if (sortBy === 'rating') {
        const rA = a.rating || 0;
        const rB = b.rating || 0;
        comparison = rB - rA;
      }

      return sortOrder === 'asc' ? -comparison : comparison;
    });
  }, [
    items,
    settings.maxEpisodesPerSeries,
    settings.capSeriesEpisodes,
    mediaTypeFilter,
    statusFilter,
    languageFilter,
    debouncedQuery,
    searchEngineResponse,
    filterType,
    activePreset,
    ignoreAnime,
    selectedGenres,
    excludedGenres,
    selectedThemes,
    excludedThemes,
    genreMatchMode,
    selectedCountries,
    excludedCountries,
    minYear,
    maxYear,
    minRating,
    sortBy,
    sortOrder,
  ]);

  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  return (
    <div className="max-w-7xl mx-auto py-4 sm:py-8 px-3 sm:px-6 lg:px-8 space-y-4 sm:space-y-6 animate-in fade-in duration-300 pb-20 xl:pb-8">
      {/* Top Header & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-white tracking-tight">
            Movies & Series Catalog
          </h1>
          <p className="text-[11px] sm:text-xs md:text-sm text-gray-400 mt-0.5 sm:mt-1">
            Browse, filter, and sort your streaming collection with live genre & country tags.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onSyncWithDiscovery && (
            <button
              onClick={async () => {
                if (isSyncingDiscovery) return;
                setIsSyncingDiscovery(true);
                try {
                  await onSyncWithDiscovery();
                } finally {
                  setIsSyncingDiscovery(false);
                }
              }}
              disabled={isSyncingDiscovery}
              title="Replace and upgrade library items with metadata enriched from the Discovery Catalog"
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all shadow-md active:scale-95 ${
                isSyncingDiscovery
                  ? 'bg-white/5 border-white/10 text-gray-500 cursor-not-allowed'
                  : 'bg-zinc-800/90 hover:bg-zinc-700 border-white/10 text-gray-200'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${isSyncingDiscovery ? 'animate-spin' : ''}`} />
              <span>{isSyncingDiscovery ? 'Syncing...' : 'Sync with Discovery'}</span>
            </button>
          )}

          {onOpenSurpriseMe && (
            <button
              onClick={onOpenSurpriseMe}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-red-600 to-purple-600 hover:from-red-500 hover:to-purple-500 text-white shadow-lg shadow-red-600/20 transition-all active:scale-95"
            >
              <Sparkles className="w-4 h-4" />
              <span>Surprise Me!</span>
            </button>
          )}

          <button
            onClick={onRescan}
            disabled={isRescanning}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all shadow-md active:scale-95 ${
              isRescanning
                ? 'bg-white/5 border-white/10 text-gray-500 cursor-not-allowed'
                : 'bg-[#E50914] border-transparent text-white hover:bg-red-700'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRescanning ? 'animate-spin' : ''}`} />
            <span>{isRescanning ? 'Scanning...' : 'Re-scan'}</span>
          </button>
        </div>
      </div>

      {/* Filter & Sort Toolbar */}
      <div className="bg-[#1c1c1e] p-3 sm:p-4 rounded-2xl border border-white/10 space-y-2.5 sm:space-y-3 shadow-md">
        {/* Row 1: Search & Controls Row */}
        <div className="flex flex-col gap-2.5">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, cast, director, country..."
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 pl-10 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#E50914]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Smart "Did you mean?" Suggestion Banner */}
          {searchEngineResponse?.didYouMean && (
            <div className="flex items-center gap-2 px-3.5 py-2 bg-red-950/40 border border-red-500/30 rounded-xl text-xs text-gray-300 animate-in fade-in duration-200">
              <Sparkles className="w-3.5 h-3.5 text-[#E50914] shrink-0" />
              <span>Did you mean:</span>
              <button
                type="button"
                onClick={() => setSearchQuery(searchEngineResponse.didYouMean!.suggestedTitle)}
                className="text-white font-semibold underline decoration-[#E50914] decoration-2 underline-offset-2 hover:text-red-400 transition-colors cursor-pointer"
              >
                {searchEngineResponse.didYouMean.suggestedTitle}
              </button>
            </div>
          )}

          {/* Primary Filter Grid on mobile (2 cols on small screen, row on desktop) */}
          <div className="grid grid-cols-2 md:flex md:flex-wrap items-center gap-2">
            {/* Type selector */}
            <select
              value={mediaTypeFilter}
              onChange={(e) => setMediaTypeFilter(e.target.value as MediaFilterType)}
              className="w-full md:w-auto bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-medium focus:outline-none focus:border-[#E50914] cursor-pointer"
            >
              <option value="all" className="bg-zinc-900 text-white">All Types</option>
              <option value="movie" className="bg-zinc-900 text-white">Movies Only</option>
              <option value="tv" className="bg-zinc-900 text-white">TV Shows Only</option>
            </select>

            {/* Status selector */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilterType)}
              className="w-full md:w-auto bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-medium focus:outline-none focus:border-[#E50914] cursor-pointer truncate"
            >
              <option value="all" className="bg-zinc-900 text-white">All Active ({items.filter(x => x.viewingStatus !== 'dropped' && !x.droppedReason).length})</option>
              <option value="active" className="bg-zinc-900 text-white">Active (Unwatched &amp; Watching)</option>
              <option value="unwatched" className="bg-zinc-900 text-white">Unwatched Only</option>
              <option value="still_watching" className="bg-zinc-900 text-white">Still Watching</option>
              <option value="completed" className="bg-zinc-900 text-white">Completed (Watched)</option>
              <option value="dropped" className="bg-zinc-900 text-white">Dropped ({items.filter(x => x.viewingStatus === 'dropped' || !!x.droppedReason).length})</option>
            </select>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortField)}
              className="w-full md:w-auto bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#E50914] font-medium cursor-pointer"
            >
              <option value="recently_added" className="bg-zinc-900 text-white">Recently Added</option>
              <option value="runtime" className="bg-zinc-900 text-white">⏱️ Runtime</option>
              <option value="rottenTomatoes" className="bg-zinc-900 text-white">🍅 Rotten Tomatoes</option>
              <option value="imdb" className="bg-zinc-900 text-white">⭐ IMDb Rating</option>
              <option value="title" className="bg-zinc-900 text-white">Alphabetical (A - Z)</option>
              <option value="year" className="bg-zinc-900 text-white">Release Year</option>
              <option value="rating" className="bg-zinc-900 text-white">TMDB Score</option>
            </select>

            {/* Sort Order Toggle */}
            <button
              onClick={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
              className={`w-full md:w-auto flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-colors ${
                sortOrder === 'desc'
                  ? 'bg-red-600/20 border-red-500/50 text-red-400 hover:bg-red-600/30'
                  : 'bg-blue-600/20 border-blue-500/50 text-blue-400 hover:bg-blue-600/30'
              }`}
              title={`Order: ${sortOrder === 'desc' ? 'Descending' : 'Ascending'}`}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>{sortOrder === 'desc' ? 'DESC (High → Low)' : 'ASC (Low → High)'}</span>
            </button>
          </div>
        </div>

        {/* Row 2: Category, Themes, Country, Year, Hindi & Language filter tags */}
        <div className="pt-2 border-t border-white/5 space-y-2">
          {/* Preset Quick Buttons & Selectable Rating */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'hollywood', label: '🎬 Hollywood' },
                { id: 'bollywood', label: '🇮🇳 Bollywood' },
                { id: 'kdramas', label: '🇰🇷 K-Dramas' },
                { id: 'anime', label: '⚔️ Anime' },
                { id: 'european', label: '🏰 European' },
                { id: 'asian', label: '🌏 Asian' },
              ] as const
            ).map((preset) => (
              <button
                key={preset.id}
                onClick={() => handleApplyPreset(preset.id)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
                  activePreset === preset.id
                    ? 'bg-[#E50914] text-white border-[#E50914] shadow-md shadow-red-600/30'
                    : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 border-white/5 hover:border-white/15'
                }`}
              >
                {preset.label}
              </button>
            ))}

            {/* Toggleable Ignore Anime Filter - Selectable with ANY filter (Asian, Hollywood, etc.) */}
            <button
              type="button"
              onClick={() => setIgnoreAnime((prev) => !prev)}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all whitespace-nowrap border flex items-center gap-1.5 ${
                ignoreAnime
                  ? 'bg-red-600/25 text-red-300 border-red-500/60 shadow-md shadow-red-600/20 ring-1 ring-red-500/40'
                  : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-white/5 hover:border-white/15'
              }`}
              title="Filter out anime and animation titles while keeping all other movies and shows"
            >
              <span>🚫 Ignore Anime</span>
              {ignoreAnime && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />}
            </button>

            {/* Selectable Highly Rated Preset / Rating Threshold */}
            <div className="flex items-center gap-1 bg-zinc-900/80 border border-white/10 rounded-xl px-2 py-0.5 text-xs shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (activePreset === 'highly_rated') {
                    setActivePreset('all');
                    setMinRating(0);
                  } else {
                    handleApplyPreset('highly_rated');
                  }
                }}
                className={`flex items-center gap-1 font-bold transition-colors ${
                  activePreset === 'highly_rated' || minRating > 0
                    ? 'text-amber-400'
                    : 'text-zinc-300 hover:text-white'
                }`}
              >
                <span>⭐ Highly Rated</span>
              </button>
              <select
                value={minRating > 0 ? minRating.toFixed(1) : '8.0'}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setMinRating(val);
                  setActivePreset('highly_rated');
                  setSortBy('imdb');
                }}
                className="bg-zinc-800 text-amber-300 text-[11px] font-bold rounded px-1.5 py-0.5 border border-white/10 focus:outline-none cursor-pointer"
                title="Select minimum rating threshold"
              >
                <option value="6.5">6.5+</option>
                <option value="7.0">7.0+</option>
                <option value="7.5">7.5+</option>
                <option value="8.0">8.0+</option>
                <option value="8.5">8.5+</option>
                <option value="9.0">9.0+</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {/* Quick Filter: Available in Hindi */}
            <button
              onClick={() => setLanguageFilter((prev) => (prev === 'hindi' ? 'all' : 'hindi'))}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all shrink-0 ${
                languageFilter === 'hindi'
                  ? 'bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/20'
                  : 'bg-black/40 border-white/10 text-gray-300 hover:text-white hover:border-amber-500/40'
              }`}
              title="Filter titles available in Hindi"
            >
              <span className="font-black text-sm">हिं</span>
              <span>Hindi Dub</span>
            </button>

            {/* Categories Multi-select Trigger */}
            <button
              onClick={() => setShowGenreModal(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all shrink-0 ${
                selectedGenres.length > 0 || excludedGenres.length > 0
                  ? 'bg-red-600/20 border-red-500/50 text-red-300'
                  : 'bg-black/40 border-white/10 text-gray-300 hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Categories</span>
              {selectedGenres.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-red-500/30 text-[10px] font-bold">
                  +{selectedGenres.length}
                </span>
              )}
              {excludedGenres.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-red-500/30 text-red-200 text-[10px] font-bold">
                  -{excludedGenres.length}
                </span>
              )}
            </button>

            {/* Themes Multi-select Trigger */}
            <button
              onClick={() => setShowThemeModal(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all shrink-0 ${
                selectedThemes.length > 0 || excludedThemes.length > 0
                  ? 'bg-purple-600/20 border-purple-500/50 text-purple-300'
                  : 'bg-black/40 border-white/10 text-gray-300 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Themes</span>
              {selectedThemes.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-purple-500/30 text-[10px] font-bold">
                  +{selectedThemes.length}
                </span>
              )}
              {excludedThemes.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-red-500/30 text-red-200 text-[10px] font-bold">
                  -{excludedThemes.length}
                </span>
              )}
            </button>

            {/* Country Trigger (Includes & Excludes) */}
            <button
              onClick={() => setShowCountryModal(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all shrink-0 ${
                selectedCountries.length > 0 || excludedCountries.length > 0
                  ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                  : 'bg-black/40 border-white/10 text-gray-300 hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Country</span>
              {selectedCountries.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-blue-500/30 text-blue-200 text-[10px] font-bold">
                  +{selectedCountries.length}
                </span>
              )}
              {excludedCountries.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-red-500/30 text-red-200 text-[10px] font-bold">
                  -{excludedCountries.length}
                </span>
              )}
            </button>

            {/* Year Range Trigger */}
            <button
              onClick={() => setShowYearModal(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all shrink-0 ${
                minYear || maxYear
                  ? 'bg-yellow-600/20 border-yellow-500/50 text-yellow-300'
                  : 'bg-black/40 border-white/10 text-gray-300 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{minYear || maxYear ? `${minYear || 'Any'}–${maxYear || 'Any'}` : 'Year'}</span>
            </button>

            {/* Rating Trigger */}
            <button
              onClick={() => setShowRatingModal(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all shrink-0 ${
                minRating > 0
                  ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                  : 'bg-black/40 border-white/10 text-gray-300 hover:text-white'
              }`}
            >
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span>{minRating > 0 ? `Rating: ${minRating.toFixed(1)}+` : 'Rating'}</span>
            </button>

            {/* Language Selector Dropdown */}
            <div className="flex items-center gap-1 bg-zinc-900 border border-white/10 rounded-xl px-2 py-1 text-xs shrink-0">
              <Languages className="w-3.5 h-3.5 text-zinc-400" />
              <select
                value={languageFilter}
                onChange={(e) => setLanguageFilter(e.target.value)}
                className="bg-transparent text-white font-medium focus:outline-none cursor-pointer pr-1"
                title="Filter by Audio / Spoken Language"
              >
                <option value="all" className="bg-zinc-900 text-white">All Languages</option>
                <option value="hindi" className="bg-zinc-900 text-amber-400 font-bold">हिं Hindi</option>
                <option value="english" className="bg-zinc-900 text-white">EN English</option>
                <option value="japanese" className="bg-zinc-900 text-white">JAP Japanese</option>
                <option value="korean" className="bg-zinc-900 text-white">KOR Korean</option>
                <option value="chinese" className="bg-zinc-900 text-white">CHN Chinese</option>
                <option value="spanish" className="bg-zinc-900 text-white">Spanish</option>
                <option value="french" className="bg-zinc-900 text-white">French</option>
                <option value="german" className="bg-zinc-900 text-white">German</option>
                <option value="asian" className="bg-zinc-900 text-white">🌏 Asian (All)</option>
              </select>
            </div>
          </div>

          {/* Counts & Clear status row */}
          <div className="flex items-center justify-between text-xs pt-1 text-gray-400">
            <span className="font-medium">
              Showing <span className="text-white font-bold">{sortedItems.length}</span> of {items.length} titles
            </span>

            {activeFiltersCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="text-red-400 hover:text-red-300 font-semibold underline"
              >
                Clear Filters ({activeFiltersCount})
              </button>
            )}
          </div>
        </div>

        {/* Row 3: Active Filter Chips */}
        {activeFiltersCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/5">
            {selectedGenres.map((g) => (
              <span
                key={'inc_g_' + g}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-600/20 border border-red-500/30 text-red-300 text-[11px]"
              >
                <span>{g}</span>
                <button
                  onClick={() => setSelectedGenres((prev) => prev.filter((x) => x !== g))}
                  className="hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            {excludedGenres.map((g) => (
              <span
                key={'exc_g_' + g}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-600/20 border border-red-500/30 text-red-300 text-[11px]"
              >
                <span>🚫 Exclude: {g}</span>
                <button
                  onClick={() => setExcludedGenres((prev) => prev.filter((x) => x !== g))}
                  className="hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            {selectedThemes.map((t) => (
              <span
                key={'inc_t_' + t}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-300 text-[11px]"
              >
                <span>✨ {t}</span>
                <button
                  onClick={() => setSelectedThemes((prev) => prev.filter((x) => x !== t))}
                  className="hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            {excludedThemes.map((t) => (
              <span
                key={'exc_t_' + t}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-600/20 border border-red-500/30 text-red-300 text-[11px]"
              >
                <span>🚫 Theme: {t}</span>
                <button
                  onClick={() => setExcludedThemes((prev) => prev.filter((x) => x !== t))}
                  className="hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            {selectedCountries.map((c) => (
              <span
                key={'inc_' + c}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-300 text-[11px]"
              >
                <span>🌍 {c}</span>
                <button
                  onClick={() => setSelectedCountries((prev) => prev.filter((x) => x !== c))}
                  className="hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            {excludedCountries.map((c) => (
              <span
                key={'exc_' + c}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-600/20 border border-red-500/30 text-red-300 text-[11px]"
              >
                <span>🚫 Exclude: {c}</span>
                <button
                  onClick={() => setExcludedCountries((prev) => prev.filter((x) => x !== c))}
                  className="hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            {languageFilter !== 'all' && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-medium">
                <span>Language: {languageFilter === 'hindi' ? 'हिं Hindi' : languageFilter.toUpperCase()}</span>
                <button onClick={() => setLanguageFilter('all')} className="hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {mediaTypeFilter !== 'all' && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/10 text-gray-300 text-[11px]">
                <span>{mediaTypeFilter === 'tv' ? 'TV Shows' : 'Movies'}</span>
                <button onClick={() => setMediaTypeFilter('all')}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {statusFilter !== 'all' && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/10 text-gray-300 text-[11px]">
                <span className="capitalize">{statusFilter.replace('_', ' ')}</span>
                <button onClick={() => setStatusFilter('all')}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {activePreset !== 'all' && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-600/20 border border-red-500/30 text-red-300 text-[11px]">
                <span>Preset: {activePreset}</span>
                <button onClick={() => setActivePreset('all')}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {(minYear || maxYear) && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-yellow-600/20 border border-yellow-500/30 text-yellow-300 text-[11px]">
                <span>Year: {minYear || 'Any'}–{maxYear || 'Any'}</span>
                <button onClick={() => { setMinYear(''); setMaxYear(''); }}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {minRating > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[11px]">
                <span>⭐ Rating: ≥{minRating.toFixed(1)}</span>
                <button
                  onClick={() => {
                    setMinRating(0);
                    if (activePreset === 'highly_rated') {
                      setActivePreset('all');
                    }
                  }}
                  className="hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {ignoreAnime && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-600/20 border border-red-500/30 text-red-300 text-[11px]">
                <span>🚫 Ignore Anime</span>
                <button onClick={() => setIgnoreAnime(false)} className="hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Catalog Grid */}
      {sortedItems.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-4">
          {sortedItems.map((item) =>
            item.mediaType === 'movie' ? (
              <MovieCard
                key={item.id}
                item={item}
                onClick={() => onSelectItem(item)}
                onChangeMatch={(e) => {
                  e.stopPropagation();
                  onChangeMatch(item);
                }}
                onMarkWatched={handleQuickMarkWatched}
                onAddToWatching={handleQuickAddToWatching}
                onDrop={handleQuickDrop}
              />
            ) : (
              <TvSeriesCard
                key={item.id}
                item={item}
                maxEpisodesLimit={settings.maxEpisodesPerSeries}
                capEpisodes={settings.capSeriesEpisodes}
                onClick={() => onSelectItem(item)}
                onChangeMatch={(e) => {
                  e.stopPropagation();
                  onChangeMatch(item);
                }}
                onMarkWatched={handleQuickMarkWatched}
                onAddToWatching={handleQuickAddToWatching}
                onDrop={handleQuickDrop}
              />
            )
          )}
        </div>
      ) : (
        <div className="py-20 text-center text-gray-500 bg-[#1c1c1e] rounded-2xl border border-white/10">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-600" />
          <h3 className="text-base font-bold text-gray-300">No titles match these filters</h3>
          <p className="text-xs text-gray-500 mt-1">
            Try adjusting your search keywords, active categories, or release year filters.
          </p>
          <button
            onClick={clearAllFilters}
            className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition-all"
          >
            Clear All Filters
          </button>
        </div>
      )}

      {/* Categories Multi-select Modal with Include & Exclude Tabs */}
      {showGenreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-[#1c1c1e] border border-white/15 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-[#E50914]" />
                  <span>Category Filter & Exclusion</span>
                </h3>
                <p className="text-[11px] sm:text-xs text-gray-400">
                  Include or exclude specific genres & categories from your view.
                </p>
              </div>
              <button
                onClick={() => setShowGenreModal(false)}
                className="p-1.5 rounded-full text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Switcher Tabs: Include vs Exclude */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-black/50 rounded-xl border border-white/10 mb-3">
              <button
                type="button"
                onClick={() => setGenreModalTab('include')}
                className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  genreModalTab === 'include'
                    ? 'bg-[#E50914] text-white shadow-md'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
                <span>Include Categories</span>
                {selectedGenres.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[10px]">
                    {selectedGenres.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setGenreModalTab('exclude')}
                className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  genreModalTab === 'exclude'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Ban className="w-3.5 h-3.5 text-red-200" />
                <span>Exclude Categories</span>
                {excludedGenres.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[10px]">
                    {excludedGenres.length}
                  </span>
                )}
              </button>
            </div>

            {genreModalTab === 'include' && (
              <div className="flex items-center gap-4 p-2.5 bg-black/40 rounded-xl border border-white/5 mb-4 text-xs">
                <span className="text-gray-400">Match rule:</span>
                <label className="flex items-center gap-1.5 cursor-pointer text-white">
                  <input
                    type="radio"
                    name="genreMatchMode"
                    checked={genreMatchMode === 'any'}
                    onChange={() => setGenreMatchMode('any')}
                    className="text-red-600"
                  />
                  <span>Match ANY selected</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-white">
                  <input
                    type="radio"
                    name="genreMatchMode"
                    checked={genreMatchMode === 'all'}
                    onChange={() => setGenreMatchMode('all')}
                    className="text-red-600"
                  />
                  <span>Match ALL selected</span>
                </label>
              </div>
            )}

            {/* Category Search Input */}
            <div className="relative mb-3">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-400" />
              <input
                type="text"
                value={genreSearchQuery}
                onChange={(e) => setGenreSearchQuery(e.target.value)}
                placeholder="Search categories / tags (e.g. Thriller, Crime, Anime)..."
                className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-8 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/60"
              />
              {genreSearchQuery && (
                <button
                  onClick={() => setGenreSearchQuery('')}
                  className="absolute right-2.5 top-2 text-zinc-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto p-1">
              {allGenres
                .filter((g) => g.toLowerCase().includes(genreSearchQuery.toLowerCase().trim()))
                .map((g) => {
                  const isChecked =
                    genreModalTab === 'include'
                      ? selectedGenres.includes(g)
                      : excludedGenres.includes(g);
                  return (
                    <label
                      key={g}
                      className={`flex items-center gap-2 py-1.5 px-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                        isChecked
                          ? genreModalTab === 'include'
                            ? 'bg-red-600/20 border-red-500/40 text-white font-semibold'
                            : 'bg-red-600/30 border-red-500/60 text-red-200 font-semibold'
                          : 'bg-black/30 border-white/5 text-gray-400 hover:text-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (genreModalTab === 'include') {
                            setSelectedGenres((prev) =>
                              isChecked ? prev.filter((x) => x !== g) : [...prev, g]
                            );
                          } else {
                            setExcludedGenres((prev) =>
                              isChecked ? prev.filter((x) => x !== g) : [...prev, g]
                            );
                          }
                        }}
                        className="rounded bg-neutral-800 border-white/20 text-red-600"
                      />
                      <span>{g}</span>
                    </label>
                  );
                })}
            </div>

            <div className="flex items-center justify-between mt-5 pt-3 border-t border-white/10">
              <button
                onClick={() => {
                  if (genreModalTab === 'include') {
                    setSelectedGenres([]);
                  } else {
                    setExcludedGenres([]);
                  }
                }}
                className="text-xs text-gray-400 hover:text-white underline"
              >
                Reset {genreModalTab === 'include' ? 'Included' : 'Excluded'} Categories
              </button>
              <button
                onClick={() => setShowGenreModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Themes Multi-select Modal with Include & Exclude */}
      {showThemeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-[#1c1c1e] border border-white/15 rounded-2xl p-5 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span>Cinematic Themes</span>
                </h3>
                <p className="text-xs text-zinc-400">
                  Select narrative concepts and moods to include or exclude.
                </p>
              </div>
              <button
                onClick={() => setShowThemeModal(false)}
                className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Include / Exclude Tabs */}
            <div className="grid grid-cols-2 gap-2 bg-black/40 p-1 rounded-xl mb-4 border border-white/5">
              <button
                type="button"
                onClick={() => setThemeModalTab('include')}
                className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  themeModalTab === 'include'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
                <span>Include Themes</span>
                {selectedThemes.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[10px]">
                    {selectedThemes.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setThemeModalTab('exclude')}
                className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  themeModalTab === 'exclude'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Ban className="w-3.5 h-3.5 text-red-200" />
                <span>Exclude Themes</span>
                {excludedThemes.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[10px]">
                    {excludedThemes.length}
                  </span>
                )}
              </button>
            </div>

            {/* Theme Search Input */}
            <div className="relative mb-3">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-400" />
              <input
                type="text"
                value={themeSearchQuery}
                onChange={(e) => setThemeSearchQuery(e.target.value)}
                placeholder="Search themes (e.g. Heist, Serial Killer, Mind-Bending)..."
                className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-8 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500/60"
              />
              {themeSearchQuery && (
                <button
                  onClick={() => setThemeSearchQuery('')}
                  className="absolute right-2.5 top-2 text-zinc-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto p-1">
              {availableThemes
                .filter((t) => t.toLowerCase().includes(themeSearchQuery.toLowerCase().trim()))
                .map((t) => {
                  const isChecked =
                    themeModalTab === 'include'
                      ? selectedThemes.includes(t)
                      : excludedThemes.includes(t);
                  return (
                    <label
                      key={t}
                      className={`flex items-center gap-2 py-1.5 px-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                        isChecked
                          ? themeModalTab === 'include'
                            ? 'bg-purple-600/20 border-purple-500/40 text-purple-200 font-semibold'
                            : 'bg-red-600/30 border-red-500/60 text-red-200 font-semibold'
                          : 'bg-black/30 border-white/5 text-gray-400 hover:text-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (themeModalTab === 'include') {
                            setSelectedThemes((prev) =>
                              isChecked ? prev.filter((x) => x !== t) : [...prev, t]
                            );
                          } else {
                            setExcludedThemes((prev) =>
                              isChecked ? prev.filter((x) => x !== t) : [...prev, t]
                            );
                          }
                        }}
                        className="rounded bg-neutral-800 border-white/20 text-purple-600"
                      />
                      <span className="truncate">{t}</span>
                    </label>
                  );
                })}
            </div>

            <div className="flex items-center justify-between mt-5 pt-3 border-t border-white/10">
              <button
                onClick={() => {
                  if (themeModalTab === 'include') {
                    setSelectedThemes([]);
                  } else {
                    setExcludedThemes([]);
                  }
                }}
                className="text-xs text-gray-400 hover:text-white underline"
              >
                Reset {themeModalTab === 'include' ? 'Included' : 'Excluded'} Themes
              </button>
              <button
                onClick={() => setShowThemeModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rating Range & Preset Modal */}
      {showRatingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-[#1c1c1e] border border-white/15 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Star className="w-4 h-4 fill-amber-400" />
                </span>
                <h3 className="text-lg font-bold text-white">Filter by Rating</h3>
              </div>
              <button
                onClick={() => setShowRatingModal(false)}
                className="p-1.5 rounded-full text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
              Show only movies and TV series with an IMDb or TMDB rating at or above your selected score.
            </p>

            {/* Quick threshold presets */}
            <div className="mb-5">
              <label className="block text-xs font-semibold text-gray-300 mb-2">Quick Presets</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Any', value: 0 },
                  { label: '6.0+', value: 6.0 },
                  { label: '6.5+', value: 6.5 },
                  { label: '7.0+', value: 7.0 },
                  { label: '7.5+', value: 7.5 },
                  { label: '8.0+', value: 8.0 },
                  { label: '8.5+', value: 8.5 },
                  { label: '9.0+', value: 9.0 },
                ].map((p) => {
                  const isSelected = minRating === p.value;
                  return (
                    <button
                      key={'ms_rating_p_' + p.value}
                      type="button"
                      onClick={() => setMinRating(p.value)}
                      className={`py-2 px-1 rounded-xl text-xs font-bold border transition-all text-center ${
                        isSelected
                          ? 'bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/20 scale-[1.02]'
                          : 'bg-black/40 border-white/10 text-gray-300 hover:text-white hover:border-white/20'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Slider control */}
            <div className="mb-5 p-4 rounded-xl bg-black/40 border border-white/5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400 font-medium">Custom Minimum Rating:</span>
                <span className="text-amber-400 font-black text-sm">
                  {minRating > 0 ? `≥ ${minRating.toFixed(1)} / 10` : 'Any Rating'}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="9.5"
                step="0.5"
                value={minRating}
                onChange={(e) => setMinRating(parseFloat(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                <span>Any (0)</span>
                <span>5.0</span>
                <span>7.0</span>
                <span>8.0</span>
                <span>9.5</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setMinRating(0)}
                className="text-xs text-gray-400 hover:text-white underline"
              >
                Reset Rating
              </button>
              <button
                type="button"
                onClick={() => setShowRatingModal(false)}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Country Multi-select Modal with Include & Exclude */}
      {showCountryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-[#1c1c1e] border border-white/15 rounded-2xl p-5 sm:p-6 shadow-2xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <Globe className="w-4 h-4 text-blue-400" />
                  <span>Country Filter & Exclusion</span>
                </h3>
                <p className="text-[11px] sm:text-xs text-gray-400">
                  Include or exclude specific production countries from your view.
                </p>
              </div>
              <button
                onClick={() => setShowCountryModal(false)}
                className="p-1.5 rounded-full text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Switcher Tabs: Include vs Exclude */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-black/50 rounded-xl border border-white/10 mb-3">
              <button
                type="button"
                onClick={() => setCountryModalTab('include')}
                className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  countryModalTab === 'include'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
                <span>Include Countries</span>
                {selectedCountries.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[10px]">
                    {selectedCountries.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setCountryModalTab('exclude')}
                className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  countryModalTab === 'exclude'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Ban className="w-3.5 h-3.5 text-red-200" />
                <span>Exclude Countries</span>
                {excludedCountries.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[10px]">
                    {excludedCountries.length}
                  </span>
                )}
              </button>
            </div>

            {/* Explanation banner */}
            <div className="text-[11px] px-3 py-1.5 rounded-lg mb-3 bg-white/5 border border-white/5 text-zinc-300">
              {countryModalTab === 'include' ? (
                <span>Showing titles made in <strong>any</strong> selected country. (Leave empty for all).</span>
              ) : (
                <span className="text-red-300">Hiding titles originating from any of the selected excluded countries.</span>
              )}
            </div>

            {/* Search Country Input */}
            <div className="relative mb-3">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-400" />
              <input
                type="text"
                value={countrySearchQuery}
                onChange={(e) => setCountrySearchQuery(e.target.value)}
                placeholder="Search countries..."
                className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-8 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/60"
              />
              {countrySearchQuery && (
                <button
                  onClick={() => setCountrySearchQuery('')}
                  className="absolute right-2.5 top-2 text-zinc-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto p-1 scrollbar-thin">
              {allCountries
                .filter((c) => c.toLowerCase().includes(countrySearchQuery.toLowerCase()))
                .map((c) => {
                  const isIncluded = selectedCountries.includes(c);
                  const isExcluded = excludedCountries.includes(c);

                  if (countryModalTab === 'include') {
                    return (
                      <label
                        key={c}
                        className={`flex items-center justify-between py-2 px-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                          isIncluded
                            ? 'bg-blue-600/20 border-blue-500/50 text-white font-semibold shadow-sm'
                            : 'bg-black/30 border-white/5 text-gray-400 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isIncluded}
                            onChange={() => {
                              if (isIncluded) {
                                setSelectedCountries((prev) => prev.filter((x) => x !== c));
                              } else {
                                setSelectedCountries((prev) => [...prev, c]);
                                // Remove from excluded if user wants to include it
                                setExcludedCountries((prev) => prev.filter((x) => x !== c));
                              }
                            }}
                            className="rounded bg-neutral-800 border-white/20 text-blue-600"
                          />
                          <span>{c}</span>
                        </div>
                        {isExcluded && (
                          <span className="text-[10px] text-red-400 font-normal">Excluded</span>
                        )}
                      </label>
                    );
                  } else {
                    return (
                      <label
                        key={c}
                        className={`flex items-center justify-between py-2 px-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                          isExcluded
                            ? 'bg-red-600/20 border-red-500/50 text-red-200 font-semibold shadow-sm'
                            : 'bg-black/30 border-white/5 text-gray-400 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isExcluded}
                            onChange={() => {
                              if (isExcluded) {
                                setExcludedCountries((prev) => prev.filter((x) => x !== c));
                              } else {
                                setExcludedCountries((prev) => [...prev, c]);
                                // Remove from included if user excludes it
                                setSelectedCountries((prev) => prev.filter((x) => x !== c));
                              }
                            }}
                            className="rounded bg-neutral-800 border-white/20 text-red-600"
                          />
                          <span>{c}</span>
                        </div>
                        {isIncluded && (
                          <span className="text-[10px] text-blue-400 font-normal">Included</span>
                        )}
                      </label>
                    );
                  }
                })}
              {allCountries.filter((c) => c.toLowerCase().includes(countrySearchQuery.toLowerCase())).length === 0 && (
                <div className="col-span-2 text-center py-6 text-xs text-zinc-500">
                  No countries match "{countrySearchQuery}"
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/10 text-xs">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (countryModalTab === 'include') {
                      setSelectedCountries([]);
                    } else {
                      setExcludedCountries([]);
                    }
                  }}
                  className="text-gray-400 hover:text-white underline text-[11px]"
                >
                  Reset {countryModalTab === 'include' ? 'Included' : 'Excluded'}
                </button>
                {(selectedCountries.length > 0 || excludedCountries.length > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCountries([]);
                      setExcludedCountries([]);
                    }}
                    className="text-red-400 hover:text-red-300 underline text-[11px]"
                  >
                    Clear Both
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowCountryModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#E50914] hover:bg-red-700 text-white shadow-md transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Year Range Modal */}
      {showYearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-[#1c1c1e] border border-white/15 rounded-2xl p-6 shadow-2xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Filter by Release Year</h3>
              <button
                onClick={() => setShowYearModal(false)}
                className="p-1.5 rounded-full text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-xs text-gray-400 mb-1">From Year</label>
                <input
                  type="number"
                  placeholder="e.g. 2010"
                  value={minYear}
                  onChange={(e) => setMinYear(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">To Year</label>
                <input
                  type="number"
                  placeholder="e.g. 2026"
                  value={maxYear}
                  onChange={(e) => setMaxYear(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-white/10">
              <button
                onClick={() => {
                  setMinYear('');
                  setMaxYear('');
                }}
                className="text-xs text-gray-400 hover:text-white underline"
              >
                Reset
              </button>
              <button
                onClick={() => setShowYearModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-yellow-600 hover:bg-yellow-700 text-black"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
