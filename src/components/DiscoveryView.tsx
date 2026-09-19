import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Compass,
  Search,
  SlidersHorizontal,
  RotateCcw,
  Sparkles,
  Plus,
  Check,
  Play,
  Film,
  Tv,
  Star,
  Layers,
  ChevronDown,
  ChevronUp,
  X,
  BookmarkPlus,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Filter,
  RefreshCw,
  Database,
  BarChart2,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { AppSettings, DiscoveryTitle, LibraryItem, SavedDiscoveryFilter } from '../types';
import {
  fetchNetflixIndiaDiscovery,
  syncNetflixIndiaCatalog,
  getWatchmodeQuotaStatus,
  SyncProgressCallback,
  WatchmodeStatusResponse,
} from '../services/discoveryService';
import {
  getAllDiscoveryTitles,
  saveDiscoveryTitles,
  getDiscoveryCatalogMeta,
  setDiscoveryCatalogMeta,
} from '../services/db';
import { getNetflixUrl, normalizeCountryName } from '../services/normalizer';
import { formatRuntime } from '../services/analytics';
import { CachedImage } from './CachedImage';
import confetti from 'canvas-confetti';

interface DiscoveryViewProps {
  settings: AppSettings;
  libraryItems: LibraryItem[];
  onAddToLibrary: (item: DiscoveryTitle) => void;
  onStartWatching: (item: DiscoveryTitle) => void;
  onOpenDetail: (item: LibraryItem) => void;
  onOpenSurpriseMeModal?: (filteredPool?: LibraryItem[]) => void;
}

type ContentType = 'all' | 'movie' | 'tv';
type PresetType =
  | 'all'
  | 'hollywood'
  | 'bollywood'
  | 'kdramas'
  | 'anime'
  | 'european'
  | 'hindi_dubbed'
  | 'highly_rated'
  | 'recently_added';

const EUROPEAN_COUNTRIES = new Set([
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

const ITEMS_PER_BATCH = 40;

export const DiscoveryView: React.FC<DiscoveryViewProps> = ({
  settings,
  libraryItems,
  onAddToLibrary,
  onStartWatching,
  onOpenDetail,
}) => {
  // Discovery catalog data - persistent from local IndexedDB
  const [catalog, setCatalog] = useState<DiscoveryTitle[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [quotaInfo, setQuotaInfo] = useState<WatchmodeStatusResponse | null>(null);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [showStats, setShowStats] = useState(false);

  // Syncing Pipeline State
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgressCallback | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // UI pagination state
  const [visibleCount, setVisibleCount] = useState<number>(ITEMS_PER_BATCH);
  const [viewMode, setViewMode] = useState<'infinite' | 'pages'>('infinite');
  const [currentPage, setCurrentPage] = useState(1);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activePreset, setActivePreset] = useState<PresetType>('all');
  const [contentType, setContentType] = useState<ContentType>('all');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [genreMatchMode, setGenreMatchMode] = useState<'any' | 'all'>('any');
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [audioFilter, setAudioFilter] = useState<string>('all');
  const [minYear, setMinYear] = useState<string>('');
  const [maxYear, setMaxYear] = useState<string>('');
  const [minImdbRating, setMinImdbRating] = useState<number>(0);
  const [minTmdbScore, setMinTmdbScore] = useState<number>(0);
  const [minRtScore, setMinRtScore] = useState<number>(0);
  const [sortBy, setSortBy] = useState<
    | 'netflix_newest'
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
    | 'episodes_most'
  >('netflix_newest');

  // UI filter modal state
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [savedFilters, setSavedFilters] = useState<SavedDiscoveryFilter[]>(() => {
    try {
      const raw = localStorage.getItem('netflix_saved_discovery_filters');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [filterSaveName, setFilterSaveName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
      setCurrentPage(1);
      setVisibleCount(ITEMS_PER_BATCH);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Initial load: load from local IndexedDB first
  useEffect(() => {
    let isMounted = true;
    async function loadInitialCatalog() {
      setLoading(true);
      try {
        const [localTitles, meta] = await Promise.all([
          getAllDiscoveryTitles(),
          getDiscoveryCatalogMeta(),
        ]);

        if (isMounted) {
          if (meta) {
            if (meta.lastSync) setLastSyncTime(meta.lastSync);
            if (meta.watchmodeQuota) {
              setQuotaInfo({
                quota: meta.watchmodeQuota,
                quotaUsed: meta.watchmodeQuotaUsed || 0,
              });
            }
          }

          if (localTitles && localTitles.length > 0) {
            setCatalog(localTitles);
          } else {
            // First time: fetch on-demand live TMDB discovery batch so screen isn't completely blank
            const live = await fetchNetflixIndiaDiscovery({
              page: 1,
              apiKey: settings.tmdbApiKey,
              pagesToFetch: 4,
            });
            if (live.titles && live.titles.length > 0) {
              setCatalog(live.titles);
              await saveDiscoveryTitles(live.titles);
            }
          }
        }
      } catch (err) {
        console.error('Failed loading discovery catalog from IndexedDB:', err);
      } finally {
        if (isMounted) setLoading(false);
      }

      // Check Watchmode quota in background
      try {
        const q = await getWatchmodeQuotaStatus(settings.watchmodeApiKey);
        if (isMounted && q) {
          setQuotaInfo(q);
          const currentMeta = (await getDiscoveryCatalogMeta()) || {};
          await setDiscoveryCatalogMeta({
            ...currentMeta,
            watchmodeQuota: q.quota,
            watchmodeQuotaUsed: q.quotaUsed,
          });
        }
      } catch {}
    }

    loadInitialCatalog();
    return () => {
      isMounted = false;
    };
  }, [settings.tmdbApiKey, settings.watchmodeApiKey]);

  // Handle manual "Sync Netflix India Catalogue"
  const handleStartCatalogueSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncError(null);

    try {
      const res = await syncNetflixIndiaCatalog({
        watchmodeApiKey: settings.watchmodeApiKey,
        tmdbApiKey: settings.tmdbApiKey,
        existingTitles: catalog,
        onProgress: (prog) => {
          setSyncProgress(prog);
        },
      });

      // Save complete synced catalog to IndexedDB
      setCatalog(res.allTitles);
      await saveDiscoveryTitles(res.allTitles);

      const syncIso = new Date().toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      setLastSyncTime(syncIso);

      // Refresh quota
      const q = await getWatchmodeQuotaStatus(settings.watchmodeApiKey);
      if (q) setQuotaInfo(q);

      await setDiscoveryCatalogMeta({
        lastSync: syncIso,
        totalAvailable: res.allTitles.filter((t) => t.availabilityState === 'available').length,
        totalTitles: res.allTitles.length,
        watchmodeQuota: q?.quota,
        watchmodeQuotaUsed: q?.quotaUsed,
      });

      try {
        confetti({ particleCount: 50, spread: 70, origin: { y: 0.6 } });
      } catch {}

      setTimeout(() => {
        setIsSyncing(false);
        setSyncProgress(null);
      }, 2500);
    } catch (err: any) {
      console.error('Catalogue sync failed:', err);
      setSyncError(err.message || 'Catalogue sync failed. Check your API key or network.');
      setIsSyncing(false);
    }
  };

  // Dynamic genres from catalog
  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    catalog.forEach((item) => (item.genres || []).forEach((g) => set.add(g)));
    return Array.from(set).sort();
  }, [catalog]);

  // Dynamic countries from catalog
  const availableCountries = useMemo(() => {
    const set = new Set<string>();
    catalog.forEach((item) =>
      (item.countries || []).forEach((c) => {
        const norm = normalizeCountryName(c);
        if (norm) set.add(norm);
      })
    );
    return Array.from(set).sort();
  }, [catalog]);

  // Dynamic original languages from catalog
  const availableOriginalLanguages = useMemo(() => {
    const set = new Set<string>();
    catalog.forEach((item) => {
      if (item.originalLanguage) set.add(item.originalLanguage.toLowerCase());
    });
    return Array.from(set).sort();
  }, [catalog]);

  // Quick preset apply
  const handleApplyPreset = (preset: PresetType) => {
    setActivePreset(preset);
    setCurrentPage(1);

    if (preset === 'all') {
      setContentType('all');
      setSelectedCountries([]);
      setSelectedGenres([]);
      setAudioFilter('all');
      setMinImdbRating(0);
      setSortBy('netflix_newest');
    } else if (preset === 'hollywood') {
      setContentType('all');
      setSelectedCountries(['United States']);
      setSelectedGenres([]);
      setAudioFilter('all');
      setMinImdbRating(0);
    } else if (preset === 'bollywood') {
      setContentType('all');
      setSelectedCountries(['India']);
      setSelectedGenres([]);
      setAudioFilter('all');
      setMinImdbRating(0);
    } else if (preset === 'kdramas') {
      setContentType('tv');
      setSelectedCountries(['South Korea']);
      setSelectedGenres([]);
      setAudioFilter('all');
      setMinImdbRating(0);
    } else if (preset === 'anime') {
      setContentType('all');
      setSelectedCountries(['Japan']);
      setSelectedGenres(['Animation']);
      setAudioFilter('all');
      setMinImdbRating(0);
    } else if (preset === 'european') {
      setContentType('all');
      setSelectedCountries(Array.from(EUROPEAN_COUNTRIES));
      setSelectedGenres([]);
      setAudioFilter('all');
      setMinImdbRating(0);
    } else if (preset === 'hindi_dubbed') {
      setContentType('all');
      setSelectedCountries([]);
      setSelectedGenres([]);
      setAudioFilter('hi');
      setMinImdbRating(0);
    } else if (preset === 'highly_rated') {
      setContentType('all');
      setSelectedCountries([]);
      setSelectedGenres([]);
      setAudioFilter('all');
      setMinImdbRating(8.0);
      setSortBy('imdb_desc');
    } else if (preset === 'recently_added') {
      setContentType('all');
      setSelectedCountries([]);
      setSelectedGenres([]);
      setAudioFilter('all');
      setMinImdbRating(0);
      setSortBy('netflix_newest');
    }
  };

  // Clear all filters
  const handleClearAllFilters = () => {
    setSearchQuery('');
    setDebouncedQuery('');
    setActivePreset('all');
    setContentType('all');
    setSelectedGenres([]);
    setGenreMatchMode('any');
    setSelectedCountries([]);
    setSelectedLanguage('all');
    setAudioFilter('all');
    setMinYear('');
    setMaxYear('');
    setMinImdbRating(0);
    setMinTmdbScore(0);
    setMinRtScore(0);
    setSortBy('netflix_newest');
    setCurrentPage(1);
  };

  // Check if title is already in user's library
  const librarySet = useMemo(() => {
    const set = new Set<string>();
    libraryItems.forEach((i) => {
      if (i.imdbId) set.add(`imdb_${i.imdbId}`);
      if (i.externalId) set.add(`ext_${i.externalId}`);
      if (i.videoId) set.add(`vid_${i.videoId}`);
      const norm = (i.externalTitle || i.originalTitle || '').toLowerCase().trim();
      set.add(norm);
    });
    return set;
  }, [libraryItems]);

  const isInLibrary = useCallback(
    (item: DiscoveryTitle) => {
      if (item.imdbId && librarySet.has(`imdb_${item.imdbId}`)) return true;
      if (item.tmdbId && librarySet.has(`ext_${item.tmdbId}`)) return true;
      if (item.netflixId && librarySet.has(`vid_${item.netflixId}`)) return true;
      const norm = (item.title || '').toLowerCase().trim();
      return librarySet.has(norm);
    },
    [librarySet]
  );

  // Filter & Sort Logic
  const filteredCatalog = useMemo(() => {
    let result = catalog;

    // 1. Content Type (Movies / TV Shows)
    if (contentType !== 'all') {
      result = result.filter((x) => x.mediaType === contentType);
    }

    // 2. Search query (Title, alternate/original title, genre, country, language)
    if (debouncedQuery) {
      const q = debouncedQuery.toLowerCase();
      result = result.filter((x) => {
        const titleMatch = x.title.toLowerCase().includes(q);
        const origMatch = x.originalTitle?.toLowerCase().includes(q);
        const genreMatch = (x.genres || []).some((g) => g.toLowerCase().includes(q));
        const countryMatch = (x.countries || []).some((c) => c.toLowerCase().includes(q));
        const castMatch = (x.cast || []).some((actor) => actor.toLowerCase().includes(q));
        const dirMatch = x.director?.toLowerCase().includes(q);
        return titleMatch || origMatch || genreMatch || countryMatch || castMatch || dirMatch;
      });
    }

    // 3. European preset check
    if (activePreset === 'european') {
      result = result.filter((x) => (x.countries || []).some((c) => EUROPEAN_COUNTRIES.has(normalizeCountryName(c))));
    } else if (selectedCountries.length > 0) {
      // 4. Country filter
      result = result.filter((x) => {
        const normalizedItemCountries = (x.countries || []).map(normalizeCountryName);
        return selectedCountries.some((c) => normalizedItemCountries.includes(c));
      });
    }

    // 5. Genres filter
    if (selectedGenres.length > 0) {
      if (genreMatchMode === 'all') {
        result = result.filter((x) => selectedGenres.every((g) => (x.genres || []).includes(g)));
      } else {
        result = result.filter((x) => selectedGenres.some((g) => (x.genres || []).includes(g)));
      }
    }

    // 6. Original Language filter
    if (selectedLanguage !== 'all') {
      result = result.filter((x) => (x.originalLanguage || '').toLowerCase() === selectedLanguage.toLowerCase());
    }

    // 7. Audio Language (Strict check)
    if (audioFilter !== 'all') {
      result = result.filter((x) => {
        if (!x.audioLanguages || x.audioLanguages.length === 0) {
          // If original language matches, audio is guaranteed in that language
          return (x.originalLanguage || '').toLowerCase() === audioFilter.toLowerCase();
        }
        return x.audioLanguages.map((l) => l.toLowerCase()).includes(audioFilter.toLowerCase());
      });
    }

    // 8. Release Year filter
    if (minYear) {
      const minY = parseInt(minYear, 10);
      if (!isNaN(minY)) {
        result = result.filter((x) => x.releaseYear !== undefined && x.releaseYear >= minY);
      }
    }
    if (maxYear) {
      const maxY = parseInt(maxYear, 10);
      if (!isNaN(maxY)) {
        result = result.filter((x) => x.releaseYear !== undefined && x.releaseYear <= maxY);
      }
    }

    // 9. Ratings filters
    if (minImdbRating > 0) {
      result = result.filter((x) => x.imdbRating !== undefined && x.imdbRating >= minImdbRating);
    }
    if (minTmdbScore > 0) {
      result = result.filter((x) => x.rating !== undefined && x.rating >= minTmdbScore);
    }
    if (minRtScore > 0) {
      result = result.filter((x) => x.rottenTomatoesRating !== undefined && x.rottenTomatoesRating >= minRtScore);
    }

    // Availability filter (Default: show only available on Netflix India)
    if (!showUnavailable) {
      result = result.filter((x) => x.availabilityState !== 'no_longer_available');
    }

    // 10. Sorting
    const sorted = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'netflix_newest': {
          const dateA = a.netflixAddedDate || a.releaseDate || '0';
          const dateB = b.netflixAddedDate || b.releaseDate || '0';
          return dateB.localeCompare(dateA);
        }
        case 'year_desc':
          return (b.releaseYear || 0) - (a.releaseYear || 0);
        case 'year_asc':
          return (a.releaseYear || 0) - (b.releaseYear || 0);
        case 'imdb_desc':
          return (b.imdbRating || 0) - (a.imdbRating || 0);
        case 'imdb_asc':
          return (a.imdbRating || 0) - (b.imdbRating || 0);
        case 'tmdb_desc':
          return (b.rating || 0) - (a.rating || 0);
        case 'tmdb_asc':
          return (a.rating || 0) - (b.rating || 0);
        case 'rt_desc':
          return (b.rottenTomatoesRating || 0) - (a.rottenTomatoesRating || 0);
        case 'alpha_asc':
          return a.title.localeCompare(b.title);
        case 'alpha_desc':
          return b.title.localeCompare(a.title);
        case 'runtime_shortest': {
          const rtA = a.mediaType === 'movie' ? a.runtimeMinutes || 999 : (a.totalEpisodes || 1) * (a.averageEpisodeMinutes || 45);
          const rtB = b.mediaType === 'movie' ? b.runtimeMinutes || 999 : (b.totalEpisodes || 1) * (b.averageEpisodeMinutes || 45);
          return rtA - rtB;
        }
        case 'runtime_longest': {
          const rtA = a.mediaType === 'movie' ? a.runtimeMinutes || 0 : (a.totalEpisodes || 1) * (a.averageEpisodeMinutes || 45);
          const rtB = b.mediaType === 'movie' ? b.runtimeMinutes || 0 : (b.totalEpisodes || 1) * (b.averageEpisodeMinutes || 45);
          return rtB - rtA;
        }
        case 'episodes_fewest':
          return (a.totalEpisodes || 0) - (b.totalEpisodes || 0);
        case 'episodes_most':
          return (b.totalEpisodes || 0) - (a.totalEpisodes || 0);
        default:
          return 0;
      }
    });

    return sorted;
  }, [
    catalog,
    contentType,
    debouncedQuery,
    activePreset,
    selectedCountries,
    selectedGenres,
    genreMatchMode,
    selectedLanguage,
    audioFilter,
    minYear,
    maxYear,
    minImdbRating,
    minTmdbScore,
    minRtScore,
    sortBy,
    showUnavailable,
  ]);

  // Catalogue Analytics (calculated dynamically from actual local catalog)
  const catalogStats = useMemo(() => {
    let movies = 0;
    let tvShows = 0;
    let hindiAudioCount = 0;
    let englishAudioCount = 0;
    let kdramas = 0;
    let anime = 0;
    let availableCount = 0;
    let unavailableCount = 0;

    for (const item of catalog) {
      if (item.availabilityState === 'no_longer_available') {
        unavailableCount++;
      } else {
        availableCount++;
      }

      if (item.mediaType === 'movie') movies++;
      else if (item.mediaType === 'tv') tvShows++;

      if (item.hindiAudio === true || item.audioLanguages?.includes('hi') || item.originalLanguage === 'hi') {
        hindiAudioCount++;
      }
      if (item.englishAudio === true || item.audioLanguages?.includes('en') || item.originalLanguage === 'en') {
        englishAudioCount++;
      }
      if (item.mediaType === 'tv' && (item.countries?.includes('South Korea') || item.originalLanguage === 'ko')) {
        kdramas++;
      }
      if (item.genres?.includes('Animation') && (item.countries?.includes('Japan') || item.originalLanguage === 'ja')) {
        anime++;
      }
    }

    return {
      total: catalog.length,
      availableCount,
      unavailableCount,
      movies,
      tvShows,
      hindiAudioCount,
      englishAudioCount,
      kdramas,
      anime,
    };
  }, [catalog]);

  // Displayed titles based on view mode (infinite scroll shows sliced visibleCount, pages mode slices by page)
  const totalPages = Math.ceil(filteredCatalog.length / ITEMS_PER_BATCH) || 1;
  const paginatedTitles = useMemo(() => {
    if (viewMode === 'infinite') {
      return filteredCatalog.slice(0, visibleCount);
    }
    const start = (currentPage - 1) * ITEMS_PER_BATCH;
    return filteredCatalog.slice(start, start + ITEMS_PER_BATCH);
  }, [filteredCatalog, currentPage, viewMode, visibleCount]);

  // Infinite Scroll IntersectionObserver: When user scrolls to bottom sentinel, reveal more titles
  useEffect(() => {
    if (!sentinelRef.current || viewMode !== 'infinite') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && visibleCount < filteredCatalog.length) {
          setVisibleCount((prev) => Math.min(prev + ITEMS_PER_BATCH, filteredCatalog.length));
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [visibleCount, filteredCatalog.length, viewMode]);

  // Convert DiscoveryTitle to LibraryItem format for modal preview
  const convertToLibraryItem = (item: DiscoveryTitle): LibraryItem => {
    return {
      id: item.id,
      originalTitle: item.title,
      normalizedTitle: item.title.toLowerCase().trim(),
      videoId: item.netflixId,
      mediaType: item.mediaType,
      status: 'matched',
      viewingStatus: 'unwatched',
      externalId: item.tmdbId,
      externalTitle: item.title,
      releaseYear: item.releaseYear,
      releaseDate: item.releaseDate,
      posterPath: item.posterPath,
      backdropPath: item.backdropPath,
      rating: item.rating,
      imdbRating: item.imdbRating,
      rottenTomatoesRating: item.rottenTomatoesRating,
      voteCount: item.voteCount,
      synopsis: item.synopsis,
      genres: item.genres,
      countries: item.countries,
      languages: item.audioLanguages,
      originalLanguage: item.originalLanguage,
      runtimeMinutes: item.runtimeMinutes,
      totalSeasons: item.totalSeasons,
      totalEpisodes: item.totalEpisodes,
      averageEpisodeMinutes: item.averageEpisodeMinutes,
      episodes: item.episodes,
      trailer: item.trailer,
      cast: item.cast,
      director: item.director,
      creator: item.creator,
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  // Surprise Me from filtered results
  const handleSurpriseMe = () => {
    if (filteredCatalog.length === 0) return;
    const randomItem = filteredCatalog[Math.floor(Math.random() * filteredCatalog.length)];
    try {
      confetti({ particleCount: 35, spread: 55, origin: { y: 0.6 } });
    } catch {}
    onOpenDetail(convertToLibraryItem(randomItem));
  };

  // Save current filter configuration
  const handleSaveFilter = () => {
    if (!filterSaveName.trim()) return;
    const newFilter: SavedDiscoveryFilter = {
      id: 'filt_' + Date.now(),
      name: filterSaveName.trim(),
      createdAt: new Date().toISOString(),
      state: {
        contentType,
        preset: activePreset,
        searchQuery,
        selectedGenres,
        genreMatchMode,
        selectedCountries,
        selectedLanguages: selectedLanguage !== 'all' ? [selectedLanguage] : [],
        audioLanguage: audioFilter,
        minYear,
        maxYear,
        minImdb: minImdbRating,
        minTmdb: minTmdbScore,
        minRottenTomatoes: minRtScore,
        sortBy,
        sortOrder: 'desc',
      },
    };
    const updated = [newFilter, ...savedFilters];
    setSavedFilters(updated);
    try {
      localStorage.setItem('netflix_saved_discovery_filters', JSON.stringify(updated));
    } catch {}
    setFilterSaveName('');
    setShowSaveInput(false);
  };

  const handleApplySavedFilter = (saved: SavedDiscoveryFilter) => {
    setContentType(saved.state.contentType);
    setActivePreset(saved.state.preset as PresetType);
    setSearchQuery(saved.state.searchQuery || '');
    setSelectedGenres(saved.state.selectedGenres || []);
    setGenreMatchMode(saved.state.genreMatchMode || 'any');
    setSelectedCountries(saved.state.selectedCountries || []);
    setSelectedLanguage(saved.state.selectedLanguages?.[0] || 'all');
    setAudioFilter(saved.state.audioLanguage || 'all');
    setMinYear(saved.state.minYear || '');
    setMaxYear(saved.state.maxYear || '');
    setMinImdbRating(saved.state.minImdb || 0);
    setMinTmdbScore(saved.state.minTmdb || 0);
    setMinRtScore(saved.state.minRottenTomatoes || 0);
    if (saved.state.sortBy) setSortBy(saved.state.sortBy as any);
    setCurrentPage(1);
  };

  const handleDeleteSavedFilter = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedFilters.filter((x) => x.id !== id);
    setSavedFilters(updated);
    try {
      localStorage.setItem('netflix_saved_discovery_filters', JSON.stringify(updated));
    } catch {}
  };

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (contentType !== 'all') count++;
    if (activePreset !== 'all') count++;
    if (selectedGenres.length > 0) count++;
    if (selectedCountries.length > 0) count++;
    if (selectedLanguage !== 'all') count++;
    if (audioFilter !== 'all') count++;
    if (minYear || maxYear) count++;
    if (minImdbRating > 0) count++;
    if (minTmdbScore > 0) count++;
    if (minRtScore > 0) count++;
    if (debouncedQuery) count++;
    return count;
  }, [
    contentType,
    activePreset,
    selectedGenres,
    selectedCountries,
    selectedLanguage,
    audioFilter,
    minYear,
    maxYear,
    minImdbRating,
    minTmdbScore,
    minRtScore,
    debouncedQuery,
  ]);

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {/* 1. Header & Hero Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-zinc-900/90 via-zinc-900/60 to-black/90 p-5 sm:p-6 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="p-1.5 rounded-lg bg-[#E50914]/20 text-[#E50914] border border-[#E50914]/30">
              <Compass className="w-5 h-5 animate-pulse" />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-widest text-[#E50914]">
              Netflix India Catalog Explorer
            </span>
            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">
              <ShieldCheck className="w-3 h-3" /> Watchmode Verified
            </span>
            {quotaInfo && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-mono">
                Quota: {quotaInfo.quotaUsed} / {quotaInfo.quota}
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            DISCOVERY
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-xl">
            Complete Netflix India streaming catalogue with persistent IndexedDB caching, multi-API metadata enrichment, and instant local filters.
            {lastSyncTime && (
              <span className="block text-[11px] text-zinc-500 mt-0.5 font-mono">
                Last Catalogue Sync: {lastSyncTime}
              </span>
            )}
          </p>
        </div>

        {/* Sync, Analytics, Surprise Me & Filter Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Sync Netflix India Catalogue Button */}
          <button
            onClick={handleStartCatalogueSync}
            disabled={isSyncing}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all shadow-lg ${
              isSyncing
                ? 'bg-zinc-800 text-zinc-400 cursor-not-allowed border border-white/10'
                : 'bg-[#E50914] hover:bg-red-700 text-white shadow-red-600/30 active:scale-95'
            }`}
            title="Sync Netflix India streaming catalog from Watchmode and enrich with TMDB"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-red-400' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Netflix India'}</span>
          </button>

          {/* Toggle Catalog Analytics Stats */}
          <button
            onClick={() => setShowStats(!showStats)}
            className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
              showStats
                ? 'bg-blue-600 text-white border-blue-500 shadow-blue-500/30'
                : 'bg-white/10 hover:bg-white/20 text-zinc-300 border-white/10'
            }`}
            title="View Catalogue Analytics & Statistics"
          >
            <BarChart2 className="w-4 h-4" />
          </button>

          {/* Surprise Me Roulette */}
          <button
            onClick={handleSurpriseMe}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-600/30 transition-all transform hover:scale-105 active:scale-95"
            title="Randomize title from current filtered catalog"
          >
            <Sparkles className="w-4 h-4 text-purple-200" />
            <span className="hidden sm:inline">Surprise Me</span>
          </button>

          {/* Filters Toggle Button */}
          <button
            onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-all ${
              isFilterPanelOpen || activeFiltersCount > 0
                ? 'bg-[#E50914] text-white border-[#E50914] shadow-lg shadow-red-600/30'
                : 'bg-white/10 hover:bg-white/20 text-zinc-200 border-white/10'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Filters</span>
            {activeFiltersCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 bg-black/50 text-white rounded-full text-[10px] font-mono">
                {activeFiltersCount}
              </span>
            )}
            {isFilterPanelOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Sync Error Banner */}
      {syncError && (
        <div className="bg-red-950/80 border border-red-500/50 rounded-xl p-4 flex items-start gap-3 text-red-200 text-xs">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-bold text-red-300">Catalogue Sync Notice</div>
            <div>{syncError}</div>
          </div>
          <button
            onClick={() => setSyncError(null)}
            className="text-red-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Catalogue Analytics Bar */}
      {showStats && (
        <div className="bg-zinc-900/90 border border-blue-500/20 rounded-2xl p-4 shadow-xl animate-fade-in grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 text-center">
          <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
            <div className="text-[10px] text-zinc-400 font-bold uppercase">Total Catalog</div>
            <div className="text-lg font-black text-white">{catalogStats.total.toLocaleString()}</div>
          </div>
          <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
            <div className="text-[10px] text-emerald-400 font-bold uppercase">Available</div>
            <div className="text-lg font-black text-emerald-400">{catalogStats.availableCount.toLocaleString()}</div>
          </div>
          <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
            <div className="text-[10px] text-zinc-400 font-bold uppercase">Movies</div>
            <div className="text-lg font-black text-white">{catalogStats.movies.toLocaleString()}</div>
          </div>
          <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
            <div className="text-[10px] text-zinc-400 font-bold uppercase">TV Shows</div>
            <div className="text-lg font-black text-white">{catalogStats.tvShows.toLocaleString()}</div>
          </div>
          <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
            <div className="text-[10px] text-amber-400 font-bold uppercase">Hindi Audio</div>
            <div className="text-lg font-black text-amber-300">{catalogStats.hindiAudioCount.toLocaleString()}</div>
          </div>
          <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
            <div className="text-[10px] text-purple-400 font-bold uppercase">K-Dramas</div>
            <div className="text-lg font-black text-purple-300">{catalogStats.kdramas.toLocaleString()}</div>
          </div>
          <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
            <div className="text-[10px] text-pink-400 font-bold uppercase">Anime</div>
            <div className="text-lg font-black text-pink-300">{catalogStats.anime.toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* Syncing Progress Drawer / Modal */}
      {isSyncing && syncProgress && (
        <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border border-red-500/40 rounded-2xl p-5 shadow-2xl animate-fade-in space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-[#E50914] animate-spin" />
              <div>
                <h4 className="text-sm font-bold text-white">Syncing Netflix India Catalogue</h4>
                <p className="text-xs text-zinc-400">{syncProgress.message}</p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-[#E50914] bg-red-950/60 px-2.5 py-1 rounded-lg border border-red-500/30">
              {syncProgress.phase === 'fetching_watchmode'
                ? `Page ${syncProgress.currentPage} / ${syncProgress.totalPages}`
                : syncProgress.phase === 'enriching_tmdb'
                ? `${syncProgress.metadataProcessed} / ${syncProgress.totalToProcess}`
                : 'Processing'}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-[#E50914] to-amber-500 h-full transition-all duration-300"
              style={{
                width: `${
                  syncProgress.phase === 'fetching_watchmode'
                    ? (syncProgress.currentPage / (syncProgress.totalPages || 1)) * 50
                    : syncProgress.phase === 'enriching_tmdb'
                    ? 50 + (syncProgress.metadataProcessed / (syncProgress.totalToProcess || 1)) * 50
                    : 100
                }%`,
              }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1 font-mono">
            <span>Discovered: {syncProgress.titlesDiscovered.toLocaleString()}</span>
            <span>New: {syncProgress.newTitlesAdded.toLocaleString()}</span>
            <span>Updated: {syncProgress.titlesUpdated.toLocaleString()}</span>
            <span>Deduplicated: {syncProgress.duplicatesRemoved.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* 2. Search & Preset Shortcuts */}
      <div className="space-y-3">
        {/* Search Bar */}
        <div className="relative">
          <Search className="w-5 h-5 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Netflix India by title, genre, actor, director, or country..."
            className="w-full pl-11 pr-10 py-3 bg-zinc-900/90 border border-white/10 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#E50914] transition-all shadow-inner"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Discovery Presets */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {(
            [
              { id: 'all', label: 'All Catalog' },
              { id: 'hollywood', label: '🎬 Hollywood' },
              { id: 'bollywood', label: '🇮🇳 Bollywood' },
              { id: 'kdramas', label: '🇰🇷 K-Dramas' },
              { id: 'anime', label: '⚔️ Anime' },
              { id: 'european', label: '🏰 European' },
              { id: 'hindi_dubbed', label: 'हिं Hindi Dubbed' },
              { id: 'highly_rated', label: '⭐ Highly Rated (8.0+)' },
              { id: 'recently_added', label: '✨ Recently Added' },
            ] as const
          ).map((preset) => (
            <button
              key={preset.id}
              onClick={() => handleApplyPreset(preset.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
                activePreset === preset.id
                  ? 'bg-[#E50914] text-white border-[#E50914] shadow-md shadow-red-600/30'
                  : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 border-white/5 hover:border-white/15'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Comprehensive Filter Toolbar (Collapsible) */}
      {isFilterPanelOpen && (
        <div className="bg-zinc-900/95 border border-white/10 rounded-2xl p-5 space-y-5 shadow-2xl backdrop-blur-md animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Filter className="w-4 h-4 text-[#E50914]" />
              <span>Advanced Discovery Filters</span>
            </h3>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSaveInput(!showSaveInput)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 text-zinc-200 border border-white/10 transition-colors"
                title="Save current filter preset"
              >
                <BookmarkPlus className="w-3.5 h-3.5 text-amber-400" />
                <span>Save Preset</span>
              </button>

              {activeFiltersCount > 0 && (
                <button
                  onClick={handleClearAllFilters}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Clear All</span>
                </button>
              )}
            </div>
          </div>

          {/* Save Filter Form */}
          {showSaveInput && (
            <div className="flex items-center gap-2 bg-black/40 p-3 rounded-xl border border-white/10">
              <input
                type="text"
                value={filterSaveName}
                onChange={(e) => setFilterSaveName(e.target.value)}
                placeholder="Preset Name (e.g. 'My K-Drama Thriller')..."
                className="flex-1 bg-black/60 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#E50914]"
              />
              <button
                onClick={handleSaveFilter}
                disabled={!filterSaveName.trim()}
                className="px-3 py-1.5 rounded-lg bg-[#E50914] text-white text-xs font-bold disabled:opacity-50"
              >
                Save
              </button>
            </div>
          )}

          {/* Saved Filters Chips */}
          {savedFilters.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-zinc-400 font-semibold mr-1">Saved Presets:</span>
              {savedFilters.map((sf) => (
                <div
                  key={sf.id}
                  onClick={() => handleApplySavedFilter(sf)}
                  className="group flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 text-xs cursor-pointer"
                >
                  <span>{sf.name}</span>
                  <button
                    onClick={(e) => handleDeleteSavedFilter(sf.id, e)}
                    className="opacity-60 hover:opacity-100 hover:text-red-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {/* Content Type Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-300">Content Type</label>
              <div className="grid grid-cols-3 gap-1 bg-black/40 p-1 rounded-xl border border-white/5">
                {(['all', 'movie', 'tv'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setContentType(type);
                      setCurrentPage(1);
                    }}
                    className={`py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                      contentType === type
                        ? 'bg-[#E50914] text-white shadow-md'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {type === 'all' ? 'All' : type === 'movie' ? 'Movies' : 'TV Shows'}
                  </button>
                ))}
              </div>
            </div>

            {/* Audio Language Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-300">Audio Language</label>
              <select
                value={audioFilter}
                onChange={(e) => {
                  setAudioFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#E50914]"
              >
                <option value="all">Any Audio Language</option>
                <option value="hi">हिं Hindi Audio</option>
                <option value="en">English Audio</option>
                <option value="ko">Korean Audio</option>
                <option value="ja">Japanese Audio</option>
                <option value="es">Spanish Audio</option>
                <option value="fr">French Audio</option>
                <option value="de">German Audio</option>
                <option value="te">Telugu Audio</option>
                <option value="ta">Tamil Audio</option>
              </select>
            </div>

            {/* Original Language Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-300">Original Language</label>
              <select
                value={selectedLanguage}
                onChange={(e) => {
                  setSelectedLanguage(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#E50914]"
              >
                <option value="all">Any Original Language</option>
                {availableOriginalLanguages.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort Options */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-300">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#E50914]"
              >
                <option value="netflix_newest">Newest Addition</option>
                <option value="year_desc">Release Year (Newest → Oldest)</option>
                <option value="year_asc">Release Year (Oldest → Newest)</option>
                <option value="imdb_desc">IMDb Rating (High → Low)</option>
                <option value="imdb_asc">IMDb Rating (Low → High)</option>
                <option value="tmdb_desc">TMDB Score (High → Low)</option>
                <option value="tmdb_asc">TMDB Score (Low → High)</option>
                <option value="rt_desc">Rotten Tomatoes (High → Low)</option>
                <option value="alpha_asc">Alphabetical (A → Z)</option>
                <option value="alpha_desc">Alphabetical (Z → A)</option>
                <option value="runtime_shortest">Runtime (Shortest → Longest)</option>
                <option value="runtime_longest">Runtime (Longest → Shortest)</option>
                <option value="episodes_fewest">Episode Count (Fewest)</option>
                <option value="episodes_most">Episode Count (Most)</option>
              </select>
            </div>

            {/* Release Year Range */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-300">Release Year Range</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Min (e.g. 2015)"
                  value={minYear}
                  onChange={(e) => {
                    setMinYear(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#E50914]"
                />
                <span className="text-zinc-500">—</span>
                <input
                  type="number"
                  placeholder="Max (e.g. 2026)"
                  value={maxYear}
                  onChange={(e) => {
                    setMaxYear(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#E50914]"
                />
              </div>
            </div>

            {/* Minimum IMDb Rating */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-300">Minimum IMDb</label>
                <span className="text-xs font-mono font-bold text-amber-400">
                  {minImdbRating > 0 ? `${minImdbRating.toFixed(1)}+` : 'Any'}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={9.0}
                step={0.5}
                value={minImdbRating}
                onChange={(e) => {
                  setMinImdbRating(parseFloat(e.target.value));
                  setCurrentPage(1);
                }}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            {/* Minimum TMDB Score */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-300">Minimum TMDB</label>
                <span className="text-xs font-mono font-bold text-amber-400">
                  {minTmdbScore > 0 ? `${minTmdbScore.toFixed(1)}+` : 'Any'}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={9.0}
                step={0.5}
                value={minTmdbScore}
                onChange={(e) => {
                  setMinTmdbScore(parseFloat(e.target.value));
                  setCurrentPage(1);
                }}
                className="w-full accent-[#E50914] cursor-pointer"
              />
            </div>

            {/* Minimum Rotten Tomatoes */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-300">Minimum Rotten Tomatoes</label>
                <span className="text-xs font-mono font-bold text-red-400">
                  {minRtScore > 0 ? `${minRtScore}%+` : 'Any'}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={95}
                step={5}
                value={minRtScore}
                onChange={(e) => {
                  setMinRtScore(parseInt(e.target.value, 10));
                  setCurrentPage(1);
                }}
                className="w-full accent-red-600 cursor-pointer"
              />
            </div>
          </div>

          {/* Genres Multi-Select */}
          <div className="space-y-2 pt-2 border-t border-white/5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-300">Genres & Categories</label>
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-zinc-500">Match:</span>
                <button
                  type="button"
                  onClick={() => setGenreMatchMode('any')}
                  className={`px-2 py-0.5 rounded font-semibold ${
                    genreMatchMode === 'any' ? 'bg-[#E50914] text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  ANY
                </button>
                <button
                  type="button"
                  onClick={() => setGenreMatchMode('all')}
                  className={`px-2 py-0.5 rounded font-semibold ${
                    genreMatchMode === 'all' ? 'bg-[#E50914] text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  ALL
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
              {availableGenres.map((genre) => {
                const isSelected = selectedGenres.includes(genre);
                return (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => {
                      setSelectedGenres((prev) =>
                        isSelected ? prev.filter((g) => g !== genre) : [...prev, genre]
                      );
                      setCurrentPage(1);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                      isSelected
                        ? 'bg-red-600/30 border-red-500 text-red-300 font-bold'
                        : 'bg-black/30 border-white/5 text-zinc-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {genre}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Countries Multi-Select */}
          <div className="space-y-2 pt-2 border-t border-white/5">
            <label className="text-xs font-bold text-zinc-300">Production Countries</label>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
              {availableCountries.map((country) => {
                const isSelected = selectedCountries.includes(country);
                return (
                  <button
                    key={country}
                    type="button"
                    onClick={() => {
                      setSelectedCountries((prev) =>
                        isSelected ? prev.filter((c) => c !== country) : [...prev, country]
                      );
                      setCurrentPage(1);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                      isSelected
                        ? 'bg-blue-600/30 border-blue-500 text-blue-300 font-bold'
                        : 'bg-black/30 border-white/5 text-zinc-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {country}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 4. Active Filter Summary Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900/60 p-3.5 rounded-xl border border-white/5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-white">
            {filteredCatalog.length.toLocaleString()} {filteredCatalog.length === 1 ? 'title' : 'titles'} matching
          </span>
          <span className="text-zinc-500">•</span>
          <span className="text-xs text-zinc-400 font-medium">
            Local Database: {catalog.length.toLocaleString()} | Netflix India: {catalogStats.availableCount > 0 ? catalogStats.availableCount.toLocaleString() : '4,200+'} available
          </span>

          {/* Active filter pills */}
          {contentType !== 'all' && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 text-zinc-200 text-xs">
              {contentType === 'movie' ? 'Movies' : 'TV Shows'}
              <button onClick={() => setContentType('all')}>
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {activePreset !== 'all' && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#E50914]/20 border border-[#E50914]/30 text-red-300 text-xs font-bold capitalize">
              {activePreset.replace('_', ' ')}
              <button onClick={() => handleApplyPreset('all')}>
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {audioFilter !== 'all' && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold">
              {audioFilter === 'hi' ? 'हिं Hindi Audio' : `${audioFilter.toUpperCase()} Audio`}
              <button onClick={() => setAudioFilter('all')}>
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {selectedGenres.map((g) => (
            <span
              key={g}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-600/20 border border-red-500/30 text-red-300 text-xs"
            >
              {g}
              <button onClick={() => setSelectedGenres((prev) => prev.filter((x) => x !== g))}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {selectedCountries.map((c) => (
            <span
              key={c}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-600/20 border border-blue-500/30 text-blue-300 text-xs"
            >
              {c}
              <button onClick={() => setSelectedCountries((prev) => prev.filter((x) => x !== c))}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {minImdbRating > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-xs font-bold">
              IMDb {minImdbRating.toFixed(1)}+
              <button onClick={() => setMinImdbRating(0)}>
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {/* Availability Toggle */}
          <button
            onClick={() => setShowUnavailable(!showUnavailable)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
              showUnavailable
                ? 'bg-amber-600/30 border-amber-500 text-amber-300'
                : 'bg-black/30 border-white/10 text-zinc-400 hover:text-white'
            }`}
          >
            <span>{showUnavailable ? 'Showing All (incl. Expired)' : 'Netflix India Available Only'}</span>
          </button>

          {activeFiltersCount > 0 && (
            <button
              onClick={handleClearAllFilters}
              className="text-xs text-[#E50914] hover:underline font-semibold ml-1"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Pagination / Infinite Scroll View Mode Toggle & Summary */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-black/40 rounded-lg p-0.5 border border-white/5 text-[11px]">
            <button
              onClick={() => setViewMode('infinite')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                viewMode === 'infinite'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Infinite Scroll
            </button>
            <button
              onClick={() => setViewMode('pages')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                viewMode === 'pages'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Pages
            </button>
          </div>

          {filteredCatalog.length > 0 && (
            <div className="text-xs text-zinc-400 whitespace-nowrap">
              {viewMode === 'infinite' ? (
                <span>Showing all {filteredCatalog.length} titles</span>
              ) : (
                <span>
                  Showing {(currentPage - 1) * ITEMS_PER_BATCH + 1}–
                  {Math.min(currentPage * ITEMS_PER_BATCH, filteredCatalog.length)} of {filteredCatalog.length}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 5. Main Title Card Grid */}
      {filteredCatalog.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
          {paginatedTitles.map((item) => {
            const alreadyInLibrary = isInLibrary(item);
            const netflixUrl = getNetflixUrl({
              videoId: item.netflixId,
              originalTitle: item.title,
              externalTitle: item.title,
            });

            return (
              <div
                key={item.id}
                onClick={() => onOpenDetail(convertToLibraryItem(item))}
                className="group relative bg-[#181818] hover:bg-[#222222] rounded-xl overflow-hidden border border-white/5 hover:border-red-600/40 transition-all duration-300 shadow-lg hover:shadow-2xl hover:-translate-y-1.5 cursor-pointer flex flex-col justify-between"
              >
                {/* Poster Area */}
                <div className="relative aspect-[2/3] w-full overflow-hidden bg-neutral-900">
                  <CachedImage
                    src={item.posterPath}
                    alt={item.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    fallbackIcon={
                      <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center text-zinc-500 bg-gradient-to-b from-neutral-800 to-neutral-950">
                        {item.mediaType === 'movie' ? (
                          <Film className="w-10 h-10 mb-2 text-zinc-600" />
                        ) : (
                          <Tv className="w-10 h-10 mb-2 text-zinc-600" />
                        )}
                        <span className="text-xs line-clamp-2 font-medium">{item.title}</span>
                      </div>
                    }
                  />

                  {/* Hover Play Button Overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-11 h-11 rounded-full bg-[#E50914] text-white flex items-center justify-center shadow-xl shadow-red-600/50 transform scale-75 group-hover:scale-100 transition-transform">
                      <Play className="w-5 h-5 fill-white ml-0.5" />
                    </div>
                  </div>

                  {/* Top-Right: Ratings (Rotten Tomatoes, IMDb, TMDB) */}
                  <div className="absolute top-1.5 sm:top-2 right-1.5 sm:right-2 flex flex-col gap-1 items-end z-10">
                    {item.rottenTomatoesRating !== undefined && (
                      <div
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 shadow-md backdrop-blur-md border ${
                          item.rottenTomatoesRating >= 60
                            ? 'bg-red-950/80 border-red-500/40 text-red-400'
                            : 'bg-green-950/80 border-green-500/40 text-green-400'
                        }`}
                        title="Rotten Tomatoes Score"
                      >
                        <span>🍅 {item.rottenTomatoesRating}%</span>
                      </div>
                    )}

                    {item.imdbRating ? (
                      <div
                        className="bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded flex items-center gap-1 text-[10px] font-bold text-amber-400 shadow-md border border-amber-500/30"
                        title="IMDb Rating"
                      >
                        <span className="text-[9px] text-amber-500 font-black">IMDb</span>
                        <span>{item.imdbRating}</span>
                      </div>
                    ) : item.rating ? (
                      <div
                        className="bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded flex items-center gap-1 text-[10px] font-bold text-amber-400 shadow-md border border-amber-500/30"
                        title="TMDB Score"
                      >
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        <span>{item.rating}</span>
                      </div>
                    ) : null}
                  </div>

                  {/* Top-Left: Media Type / Year & Language Badge */}
                  <div className="absolute top-1.5 sm:top-2 left-1.5 sm:left-2 flex flex-col gap-1 items-start z-10">
                    <div className="bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-bold text-zinc-300 border border-white/10 flex items-center gap-1 shadow-sm">
                      {item.mediaType === 'movie' ? (
                        <>
                          <Film className="w-2.5 h-2.5 text-[#E50914]" />
                          <span>{item.releaseYear || 'Movie'}</span>
                        </>
                      ) : (
                        <>
                          <Tv className="w-2.5 h-2.5 text-amber-400" />
                          <span>{item.totalEpisodes ? `${item.totalEpisodes} eps` : item.releaseYear || 'TV'}</span>
                        </>
                      )}
                    </div>

                    {/* Netflix India Status Pill */}
                    {item.availabilityState === 'no_longer_available' ? (
                      <div
                        className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-zinc-900/90 text-zinc-400 border border-white/10 shadow-md"
                        title="No longer streaming on Netflix India"
                      >
                        Expired
                      </div>
                    ) : (
                      <div
                        className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-black/80 text-emerald-400 border border-emerald-500/40 shadow-md flex items-center gap-0.5"
                        title="Verified available on Netflix India"
                      >
                        <span>Netflix IN ✓</span>
                      </div>
                    )}

                    {/* Hindi Audio Badge */}
                    {(item.hindiAudio === true || item.audioLanguages?.includes('hi') || item.originalLanguage === 'hi') && (
                      <div
                        className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-500 text-black border border-amber-400 shadow-md"
                        title="Verified Hindi Audio Track Available"
                      >
                        हिं Hindi ✓
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Content & Action Footer */}
                <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-white line-clamp-1 group-hover:text-red-400 transition-colors">
                      {item.title}
                    </h4>

                    {/* Runtime or Season info */}
                    <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-1">
                      {item.mediaType === 'movie' ? (
                        <span>{item.runtimeMinutes ? formatRuntime(item.runtimeMinutes) : 'Movie'}</span>
                      ) : (
                        <span>
                          {item.totalSeasons ? `${item.totalSeasons} ${item.totalSeasons === 1 ? 'Season' : 'Seasons'}` : 'Series'}
                        </span>
                      )}
                      {item.countries.length > 0 && (
                        <>
                          <span>•</span>
                          <span className="line-clamp-1">{item.countries[0]}</span>
                        </>
                      )}
                    </div>

                    {/* Genre Tags */}
                    {item.genres.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap mt-1.5">
                        {item.genres.slice(0, 2).map((g) => (
                          <span
                            key={g}
                            className="text-[10px] px-1.5 py-0.2 rounded bg-white/5 border border-white/5 text-zinc-400"
                          >
                            {g}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Available Languages Preview */}
                    {item.audioLanguages && item.audioLanguages.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap mt-1 text-[10px] text-zinc-400">
                        {item.audioLanguages.slice(0, 3).map((l) => (
                          <span key={l} className="px-1 py-0.2 rounded bg-black/40 border border-white/5 text-zinc-300 uppercase font-mono">
                            {l} ✓
                          </span>
                        ))}
                        {item.audioLanguages.length > 3 && (
                          <span className="text-[9px] text-zinc-500">+{item.audioLanguages.length - 3}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Quick Card Action Buttons */}
                  <div className="pt-2 border-t border-white/5 flex items-center gap-1.5">
                    {alreadyInLibrary ? (
                      <span className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold">
                        <Check className="w-3.5 h-3.5" />
                        <span>In Library</span>
                      </span>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddToLibrary(item);
                        }}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-white/10 hover:bg-[#E50914] text-white text-[11px] font-bold transition-colors"
                        title="Add to My Watchlist Library"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartWatching(item);
                      }}
                      className="px-2 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-400 hover:text-black transition-all border border-amber-500/30 text-[11px] font-bold flex items-center gap-1"
                      title="Start Watching (moves into Still Watching)"
                    >
                      <Tv className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Watch</span>
                    </button>

                    <a
                      href={netflixUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-red-600 text-zinc-400 hover:text-white transition-colors"
                      title="Open in official Netflix India"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center bg-zinc-900/40 rounded-2xl border border-white/5">
          <Compass className="w-12 h-12 text-zinc-600 mb-3" />
          <h3 className="text-base sm:text-lg font-bold text-white">No matching titles found</h3>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-md">
            No Netflix India titles match your currently active filter combination. Try adjusting your filters or resetting them.
          </p>
          <button
            onClick={handleClearAllFilters}
            className="mt-4 px-4 py-2 rounded-xl bg-[#E50914] text-white text-xs font-bold shadow-lg transition-transform hover:scale-105"
          >
            Reset All Filters
          </button>
        </div>
      )}

      {/* 6. Infinite Scroll Sentinel & Pagination Controls */}
      <div ref={sentinelRef} className="pt-6 flex flex-col items-center justify-center gap-3">
        {loading && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900 border border-white/10 text-xs text-zinc-300 shadow-xl">
            <div className="w-3.5 h-3.5 border-2 border-[#E50914] border-t-transparent rounded-full animate-spin" />
            <span>Loading dynamic Netflix India titles from TMDB...</span>
          </div>
        )}

        {viewMode === 'pages' && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-2 rounded-xl bg-zinc-900 border border-white/10 text-zinc-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-xs font-mono font-bold text-zinc-300 px-3 py-1 bg-zinc-900 rounded-xl border border-white/10">
              Page {currentPage} of {totalPages}
            </span>

            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-2 rounded-xl bg-zinc-900 border border-white/10 text-zinc-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Load More Button (reveals next slice in infinite scroll mode or advances in page mode) */}
        {filteredCatalog.length > visibleCount && viewMode === 'infinite' && (
          <button
            onClick={() => setVisibleCount((prev) => Math.min(prev + ITEMS_PER_BATCH, filteredCatalog.length))}
            className="px-6 py-2.5 rounded-xl bg-[#E50914]/20 hover:bg-[#E50914]/30 border border-[#E50914]/40 text-xs font-bold text-red-300 transition-all shadow-md active:scale-95 flex items-center gap-2"
          >
            <span>+ Load More Titles (Showing {Math.min(visibleCount, filteredCatalog.length)} of {filteredCatalog.length.toLocaleString()})</span>
          </button>
        )}
      </div>
    </div>
  );
};
