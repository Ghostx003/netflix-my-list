import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Compass,
  Search,
  RotateCcw,
  Sparkles,
  ArrowUpDown,
  Sliders,
  Globe,
  Calendar,
  Languages,
  Ban,
  Check,
  X,
  ShieldCheck,
  RefreshCw,
  BarChart2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Film,
  Tv,
  Star,
  Eye,
  EyeOff,
  PlusCircle,
} from 'lucide-react';
import { AppSettings, DiscoveryTitle, LibraryItem } from '../types';
import {
  fetchNetflixIndiaDiscovery,
  fetchInitialWatchmodeDiscovery,
  syncNetflixIndiaCatalog,
  syncAndEnrichLibraryItemsToDiscovery,
  getWatchmodeQuotaStatus,
  deduplicateDiscoveryTitles,
  ensureTvThrillerGenres,
  SEED_NETFLIX_INDIA_TITLES,
  SyncProgressCallback,
  WatchmodeStatusResponse,
} from '../services/discoveryService';
import {
  getAllDiscoveryTitles,
  saveDiscoveryTitles,
  getDiscoveryCatalogMeta,
  setDiscoveryCatalogMeta,
} from '../services/db';
import { normalizeCountryName } from '../services/normalizer';
import { DiscoveryCard } from './DiscoveryCard';
import { DiscoveryDetailModal } from './DiscoveryDetailModal';
import { TagExploreModal } from './TagExploreModal';
import {
  enrichCatalogWithTMDB,
  TMDBEnrichmentProgress,
} from '../services/tmdbEnrichmentService';
import { CANONICAL_THEMES } from '../services/themeMapper';
import {
  DiscoveryFilterState,
  parseInitialDiscoveryFilters,
  syncDiscoveryFiltersToUrlAndStorage,
  clearDiscoveryFiltersFromUrlAndStorage,
} from '../services/discoveryFilterUrlSync';
import confetti from 'canvas-confetti';

interface DiscoveryViewProps {
  settings: AppSettings;
  libraryItems: LibraryItem[];
  onAddToLibrary: (item: DiscoveryTitle) => void;
  onStartWatching: (item: DiscoveryTitle) => void;
  onMarkWatched?: (item: DiscoveryTitle) => void;
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
  | 'ignore_anime'
  | 'european'
  | 'asian'
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
  'Pakistan',
  'Bangladesh',
  'Nepal',
  'Sri Lanka',
  'Israel',
  'United Arab Emirates',
  'Saudi Arabia',
  'Iran',
  'Iraq',
  'Lebanon',
  'Jordan',
  'Kuwait',
  'Qatar',
  'Kazakhstan',
  'Uzbekistan',
]);

const ITEMS_PER_BATCH = 40;

export const DiscoveryView: React.FC<DiscoveryViewProps> = ({
  settings,
  libraryItems,
  onAddToLibrary,
  onStartWatching,
  onMarkWatched,
  onOpenDetail,
  onOpenSurpriseMeModal,
}) => {
  // Discovery catalog data - persistent from local IndexedDB
  const [catalog, setCatalog] = useState<DiscoveryTitle[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [quotaInfo, setQuotaInfo] = useState<WatchmodeStatusResponse | null>(null);
  const [showStats, setShowStats] = useState(false);

  // Syncing Pipeline State
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgressCallback | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncMode, setSyncMode] = useState<'all' | 'custom'>('custom');
  const [syncMoviesCount, setSyncMoviesCount] = useState<number>(100);
  const [syncTvShowsCount, setSyncTvShowsCount] = useState<number>(100);

  // Initial filter state from URL or localStorage
  const initialFilters = useMemo(() => parseInitialDiscoveryFilters(), []);

  // UI pagination state
  const [visibleCount, setVisibleCount] = useState<number>(ITEMS_PER_BATCH);
  const [viewMode, setViewMode] = useState<'infinite' | 'pages'>('infinite');
  const [currentPage, setCurrentPage] = useState(1);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Synchronized Filters State
  const [searchQuery, setSearchQuery] = useState(initialFilters.searchQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialFilters.searchQuery);
  const [contentType, setContentType] = useState<'all' | 'movie' | 'tv'>(initialFilters.mediaType);
  const [statusFilter, setStatusFilter] = useState<'all' | 'not_in_library' | 'not_in_library_unwatched' | 'in_library' | 'unwatched'>(initialFilters.statusFilter);
  const [activePreset, setActivePreset] = useState<PresetType>(initialFilters.preset as PresetType);
  const [sortBy, setSortBy] = useState(initialFilters.sortBy);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(initialFilters.sortOrder);
  const [selectedGenres, setSelectedGenres] = useState<string[]>(initialFilters.selectedGenres);
  const [excludedGenres, setExcludedGenres] = useState<string[]>(initialFilters.excludedGenres || []);
  const [genreMatchMode, setGenreMatchMode] = useState<'any' | 'all'>(initialFilters.genreMatchMode);
  const [selectedCountries, setSelectedCountries] = useState<string[]>(initialFilters.selectedCountries);
  const [excludedCountries, setExcludedCountries] = useState<string[]>(initialFilters.excludedCountries);
  const [selectedLanguage, setSelectedLanguage] = useState<string>(initialFilters.language);
  const [audioFilter, setAudioFilter] = useState<string>(initialFilters.audioFilter);
  const [minYear, setMinYear] = useState<string>(initialFilters.minYear);
  const [maxYear, setMaxYear] = useState<string>(initialFilters.maxYear);
  const [minRating, setMinRating] = useState<number>(initialFilters.minRating);
  const [ignoreAnime, setIgnoreAnime] = useState<boolean>(initialFilters.ignoreAnime ?? (initialFilters.preset === 'ignore_anime'));

  const [selectedThemes, setSelectedThemes] = useState<string[]>(initialFilters.selectedThemes || []);
  const [excludedThemes, setExcludedThemes] = useState<string[]>(initialFilters.excludedThemes || []);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [themeModalTab, setThemeModalTab] = useState<'include' | 'exclude'>('include');
  const [themeSearchQuery, setThemeSearchQuery] = useState('');

  // Theme & Genre Tag Explore Modal state
  const [tagExploreModal, setTagExploreModal] = useState<{ tag: string; type: 'genre' | 'theme' } | null>(null);

  // Ignored / Hidden titles state (stored in localStorage for permanence)
  const [ignoredTitleIds, setIgnoredTitleIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('netflix_discovery_ignored_titles');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleIgnoreTitle = useCallback((item: DiscoveryTitle) => {
    setIgnoredTitleIds((prev) => {
      const updated = prev.includes(item.id) ? prev : [...prev, item.id];
      try {
        localStorage.setItem('netflix_discovery_ignored_titles', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    setRefreshNotification(`🚫 "${item.title}" hidden from Discovery catalogue`);
    setTimeout(() => setRefreshNotification(null), 3500);
  }, []);

  const handleUnignoreAll = useCallback(() => {
    setIgnoredTitleIds([]);
    try {
      localStorage.removeItem('netflix_discovery_ignored_titles');
    } catch {}
    setRefreshNotification('👁️ All ignored titles are now restored & unhidden!');
    setTimeout(() => setRefreshNotification(null), 3500);
  }, []);

  // Library Sync + TMDB Enrichment state
  const [isSyncingLibrary, setIsSyncingLibrary] = useState(false);
  const cancelLibrarySyncRef = useRef(false);

  // Discovery Detail Modal Stack Navigation
  const [titleStack, setTitleStack] = useState<DiscoveryTitle[]>([]);

  // API Manager Modal State
  const [showApiModal, setShowApiModal] = useState(false);

  // TMDB Catalog Enrichment State
  const [showEnrichModal, setShowEnrichModal] = useState(false);
  const [enrichmentProgress, setEnrichmentProgress] = useState<TMDBEnrichmentProgress | null>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const cancelEnrichmentRef = useRef(false);

  // Modal dialog states matching MoviesSeriesView
  const [showGenreModal, setShowGenreModal] = useState(false);
  const [genreModalTab, setGenreModalTab] = useState<'include' | 'exclude'>('include');
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [showYearModal, setShowYearModal] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [countryModalTab, setCountryModalTab] = useState<'include' | 'exclude'>('include');
  const [countrySearchQuery, setCountrySearchQuery] = useState('');
  const [genreSearchQuery, setGenreSearchQuery] = useState('');

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
      setCurrentPage(1);
      setVisibleCount(ITEMS_PER_BATCH);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Synchronize Discovery filters to URL parameters and LocalStorage
  useEffect(() => {
    const filterState: DiscoveryFilterState = {
      searchQuery,
      mediaType: contentType,
      statusFilter,
      preset: activePreset,
      sortBy: sortBy as any,
      sortOrder,
      selectedGenres,
      excludedGenres,
      selectedThemes,
      excludedThemes,
      genreMatchMode,
      selectedCountries,
      excludedCountries,
      language: selectedLanguage,
      audioFilter,
      minYear,
      maxYear,
      minRating,
      ignoreAnime,
    };
    syncDiscoveryFiltersToUrlAndStorage(filterState);
  }, [
    searchQuery,
    contentType,
    statusFilter,
    activePreset,
    sortBy,
    sortOrder,
    selectedGenres,
    excludedGenres,
    selectedThemes,
    excludedThemes,
    genreMatchMode,
    selectedCountries,
    excludedCountries,
    selectedLanguage,
    audioFilter,
    minYear,
    maxYear,
    minRating,
    ignoreAnime,
  ]);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const parsed = parseInitialDiscoveryFilters();
      setSearchQuery(parsed.searchQuery);
      setDebouncedQuery(parsed.searchQuery);
      setContentType(parsed.mediaType);
      setStatusFilter(parsed.statusFilter);
      setActivePreset(parsed.preset as PresetType);
      setSortBy(parsed.sortBy as any);
      setSortOrder(parsed.sortOrder);
      setSelectedGenres(parsed.selectedGenres);
      setExcludedGenres(parsed.excludedGenres || []);
      setGenreMatchMode(parsed.genreMatchMode);
      setSelectedCountries(parsed.selectedCountries);
      setExcludedCountries(parsed.excludedCountries);
      setSelectedLanguage(parsed.language);
      setAudioFilter(parsed.audioFilter);
      setMinYear(parsed.minYear);
      setMaxYear(parsed.maxYear);
      setMinRating(parsed.minRating);
      setIgnoreAnime(parsed.ignoreAnime ?? (parsed.preset === 'ignore_anime'));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Real-time synchronization: listen for auto-added titles from Library feature and refresh catalog immediately
  useEffect(() => {
    const handleDiscoveryUpdated = async (e: Event) => {
      try {
        const customEvt = e as CustomEvent<{ title?: DiscoveryTitle }>;
        const freshTitles = await getAllDiscoveryTitles();
        if (freshTitles && freshTitles.length > 0) {
          setCatalog(ensureTvThrillerGenres(freshTitles));
        } else if (customEvt.detail?.title) {
          setCatalog((prev) => {
            const exists = prev.some((t) => t.id === customEvt.detail?.title?.id || (customEvt.detail?.title?.tmdbId && t.tmdbId === customEvt.detail.title.tmdbId));
            return exists ? prev : [customEvt.detail.title!, ...prev];
          });
        }
      } catch (err) {
        console.warn('Error updating live Discovery catalog on event:', err);
      }
    };

    window.addEventListener('netflix-discovery-updated', handleDiscoveryUpdated);
    return () => window.removeEventListener('netflix-discovery-updated', handleDiscoveryUpdated);
  }, []);

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
            const enhanced = ensureTvThrillerGenres(localTitles);
            setCatalog(enhanced);
            saveDiscoveryTitles(enhanced).catch(() => {});
          } else {
            // First time: fetch on-demand live Watchmode Page 1 enriched with TMDB posters,
            // with fallback to TMDB discover and verified seed titles so Discovery is NEVER empty.
            let initialTitles: DiscoveryTitle[] = [];

            try {
              initialTitles = await fetchInitialWatchmodeDiscovery({
                watchmodeApiKey: settings.watchmodeApiKey,
                tmdbApiKey: settings.tmdbApiKey,
                limit: 250,
              });
            } catch (e) {
              console.warn('Initial Watchmode discovery fetch failed:', e);
            }

            if (!initialTitles || initialTitles.length === 0) {
              const liveTmdb = await fetchNetflixIndiaDiscovery({
                page: 1,
                apiKey: settings.tmdbApiKey,
                pagesToFetch: 5,
              });
              initialTitles = liveTmdb.titles || [];
            }

            // Merge curated verified Netflix India seed titles with initial fetched titles
            // so rich genres (like Thriller, Crime, Drama) always have full catalogues
            const combinedInitial = ensureTvThrillerGenres(
              deduplicateDiscoveryTitles([
                ...SEED_NETFLIX_INDIA_TITLES,
                ...(initialTitles || []),
              ])
            );

            if (combinedInitial.length > 0) {
              setCatalog(combinedInitial);
              await saveDiscoveryTitles(combinedInitial);
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
  const handleStartCatalogueSync = async (options?: { maxMovies?: number; maxTvShows?: number }) => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncError(null);
    setShowSyncModal(false);

    try {
      const res = await syncNetflixIndiaCatalog({
        watchmodeApiKey: settings.watchmodeApiKey,
        tmdbApiKey: settings.tmdbApiKey,
        existingTitles: catalog,
        maxMovies: options?.maxMovies,
        maxTvShows: options?.maxTvShows,
        onBatchEnriched: (updatedTitles) => {
          // Immediately update state so user sees titles rendered as each batch finishes enriching!
          setCatalog([...updatedTitles]);
        },
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

  // Dedicated "Refresh from API" handler - fetches live Netflix India titles from TMDB API with forceRefresh, merges and updates tags
  const [isRefreshingApi, setIsRefreshingApi] = useState(false);
  const [refreshNotification, setRefreshNotification] = useState<string | null>(null);

  const handleRefreshCatalogFromApi = async () => {
    if (isRefreshingApi || isSyncing) return;
    setIsRefreshingApi(true);
    setSyncError(null);
    setRefreshNotification('Contacting TMDB API to discover & refresh Netflix India titles and tags...');

    try {
      // Fetch 6 pages of live Netflix India titles (with_genres for Thriller & Crime included)
      const res = await fetchNetflixIndiaDiscovery({
        page: 1,
        apiKey: settings.tmdbApiKey,
        pagesToFetch: 6,
        forceRefresh: true,
      });

      const freshTitles = res.titles || [];
      if (freshTitles.length > 0) {
        // Merge with seed titles and current catalog so existing enrichments and verified seeds are preserved
        const combined = ensureTvThrillerGenres(
          deduplicateDiscoveryTitles([
            ...SEED_NETFLIX_INDIA_TITLES,
            ...catalog,
            ...freshTitles,
          ])
        );

        setCatalog(combined);
        await saveDiscoveryTitles(combined);

        const syncIso = new Date().toLocaleString('en-IN', {
          dateStyle: 'medium',
          timeStyle: 'short',
        });
        setLastSyncTime(syncIso);

        const currentMeta = (await getDiscoveryCatalogMeta()) || {};
        await setDiscoveryCatalogMeta({
          ...currentMeta,
          lastSync: syncIso,
          totalAvailable: combined.filter((t) => t.availabilityState === 'available').length,
          totalTitles: combined.length,
        });

        setRefreshNotification(`✨ Refreshed successfully! Catalogue updated with ${combined.length} titles and categorized tags.`);
        try {
          confetti({ particleCount: 40, spread: 60, origin: { y: 0.5 } });
        } catch {}
      } else {
        setRefreshNotification('Catalog is already up to date with the latest titles.');
      }
    } catch (err: any) {
      console.error('API Refresh failed:', err);
      setSyncError(err.message || 'Failed refreshing catalog from TMDB API.');
    } finally {
      setIsRefreshingApi(false);
      setTimeout(() => {
        setRefreshNotification(null);
      }, 4000);
    }
  };

  // Dedicated "Refresh With Library & Enrich via TMDB" handler:
  // Refreshes the discovery catalogue with all items in the user's library and runs TMDB API on newly added stuff
  const handleRefreshLibraryToDiscoveryAndEnrich = async () => {
    if (isSyncingLibrary || isSyncing || isRefreshingApi) return;
    if (!libraryItems || libraryItems.length === 0) {
      setRefreshNotification('Your library is currently empty. Add items first to sync them!');
      setTimeout(() => setRefreshNotification(null), 3000);
      return;
    }

    cancelLibrarySyncRef.current = false;
    setIsSyncingLibrary(true);
    setSyncError(null);
    setRefreshNotification(`Matching Discovery catalogue with ${libraryItems.length} library titles...`);

    try {
      const res = await syncAndEnrichLibraryItemsToDiscovery({
        libraryItems,
        tmdbApiKey: settings.tmdbApiKey,
        onProgress: (msg) => {
          setRefreshNotification(msg);
        },
        shouldCancel: () => cancelLibrarySyncRef.current,
      });

      // Reload fresh discovery titles from IndexedDB
      const allUpdated = await getAllDiscoveryTitles();
      if (allUpdated && allUpdated.length > 0) {
        setCatalog(allUpdated);
      }

      if (res.wasCancelled) {
        setRefreshNotification(
          `⏸️ Library sync paused. Saved ${res.enrichedCount} newly enriched title(s). You can resume anytime!`
        );
      } else if (res.enrichedCount === 0 && res.skippedCount > 0) {
        setRefreshNotification(
          `✨ Done! All ${res.syncedCount} library titles were already enriched and matched.`
        );
      } else {
        setRefreshNotification(
          `✨ Done! Enriched ${res.enrichedCount} new title(s) (skimmed ${res.skippedCount} already completed) from ${res.syncedCount} library items.`
        );
        try {
          confetti({ particleCount: 45, spread: 65, origin: { y: 0.5 } });
        } catch {}
      }
    } catch (err: any) {
      console.error('Failed syncing & enriching library items to Discovery:', err);
      setSyncError(err.message || 'Failed refreshing library items with TMDB.');
    } finally {
      setIsSyncingLibrary(false);
      setTimeout(() => setRefreshNotification(null), 5000);
    }
  };


  // Dynamic genres from catalog
  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    catalog.forEach((item) => (item.genres || []).forEach((g) => set.add(g)));
    return Array.from(set).sort();
  }, [catalog]);

  // Dynamic & Canonical themes from catalog
  const availableThemes = useMemo(() => {
    const set = new Set<string>(CANONICAL_THEMES);
    catalog.forEach((item) => (item.themes || []).forEach((t) => set.add(t)));
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
      setMinRating(0);
      setSortBy('netflix_newest');
    } else if (preset === 'hollywood') {
      setContentType('all');
      setSelectedCountries(['United States']);
      setSelectedGenres([]);
      setAudioFilter('all');
      setMinRating(0);
    } else if (preset === 'bollywood') {
      setContentType('all');
      setSelectedCountries(['India']);
      setSelectedGenres([]);
      setAudioFilter('all');
      setMinRating(0);
    } else if (preset === 'kdramas') {
      setContentType('tv');
      setSelectedCountries(['South Korea']);
      setSelectedGenres([]);
      setAudioFilter('all');
      setMinRating(0);
    } else if (preset === 'anime') {
      setContentType('all');
      setSelectedCountries(['Japan']);
      setSelectedGenres(['Animation']);
      setAudioFilter('all');
      setMinRating(0);
    } else if (preset === 'ignore_anime') {
      // Toggle ignore anime on/off independently
      setIgnoreAnime((prev) => !prev);
      return;
    } else if (preset === 'european') {
      setContentType('all');
      setSelectedCountries(Array.from(EUROPEAN_COUNTRIES));
      setSelectedGenres([]);
      setAudioFilter('all');
      setMinRating(0);
    } else if (preset === 'asian') {
      setContentType('all');
      setSelectedCountries(Array.from(ASIAN_COUNTRIES));
      setSelectedGenres([]);
      setAudioFilter('all');
      setMinRating(0);
    } else if (preset === 'hindi_dubbed') {
      setContentType('all');
      setSelectedCountries([]);
      setSelectedGenres([]);
      setAudioFilter('hi');
      setMinRating(0);
    } else if (preset === 'highly_rated') {
      setContentType('all');
      setSelectedCountries([]);
      setSelectedGenres([]);
      setAudioFilter('all');
      setMinRating(8.0);
      setSortBy('imdb_desc');
    } else if (preset === 'recently_added') {
      setContentType('all');
      setSelectedCountries([]);
      setSelectedGenres([]);
      setAudioFilter('all');
      setMinRating(0);
      setSortBy('netflix_newest');
    }
  };

  // Clear all filters
  const handleClearAllFilters = () => {
    setSearchQuery('');
    setDebouncedQuery('');
    setActivePreset('all');
    setContentType('all');
    setStatusFilter('all');
    setSelectedGenres([]);
    setExcludedGenres([]);
    setSelectedThemes([]);
    setExcludedThemes([]);
    setThemeSearchQuery('');
    setGenreMatchMode('any');
    setSelectedCountries([]);
    setExcludedCountries([]);
    setCountrySearchQuery('');
    setSelectedLanguage('all');
    setAudioFilter('all');
    setMinYear('');
    setMaxYear('');
    setMinRating(0);
    setIgnoreAnime(false);
    setSortBy('netflix_newest');
    setSortOrder('desc');
    setCurrentPage(1);
    clearDiscoveryFiltersFromUrlAndStorage();
  };

  // Check if title is already in user's library and watched status
  const { librarySet, completedLibrarySet } = useMemo(() => {
    const libSet = new Set<string>();
    const compSet = new Set<string>();
    libraryItems.forEach((i) => {
      const isComp = i.viewingStatus === 'completed' || i.isCompleted === true;
      if (i.imdbId) {
        libSet.add(`imdb_${i.imdbId}`);
        if (isComp) compSet.add(`imdb_${i.imdbId}`);
      }
      if (i.externalId) {
        libSet.add(`ext_${i.externalId}`);
        if (isComp) compSet.add(`ext_${i.externalId}`);
      }
      if (i.videoId) {
        libSet.add(`vid_${i.videoId}`);
        if (isComp) compSet.add(`vid_${i.videoId}`);
      }
      const norm = (i.externalTitle || i.originalTitle || '').toLowerCase().trim();
      if (norm) {
        libSet.add(norm);
        if (isComp) compSet.add(norm);
      }
    });
    return { librarySet: libSet, completedLibrarySet: compSet };
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

  const isWatchedInLibrary = useCallback(
    (item: DiscoveryTitle) => {
      if (item.imdbId && completedLibrarySet.has(`imdb_${item.imdbId}`)) return true;
      if (item.tmdbId && completedLibrarySet.has(`ext_${item.tmdbId}`)) return true;
      if (item.netflixId && completedLibrarySet.has(`vid_${item.netflixId}`)) return true;
      const norm = (item.title || '').toLowerCase().trim();
      return completedLibrarySet.has(norm);
    },
    [completedLibrarySet]
  );

  // Filter & Sort Logic
  const filteredCatalog = useMemo(() => {
    let result = catalog;

    // Filter out user-ignored / hidden titles
    if (ignoredTitleIds.length > 0) {
      const ignoredSet = new Set(ignoredTitleIds);
      result = result.filter((x) => !ignoredSet.has(x.id));
    }

    // 1. Content Type (Movies / TV Shows)
    if (contentType !== 'all') {
      result = result.filter((x) => x.mediaType === contentType);
    }

    // 1b. Status Filter:
    // 'all' = Active Catalog (all titles)
    // 'not_in_library' = Not in Library
    // 'not_in_library_unwatched' = Not in Library & Unwatched
    // 'in_library' = In Library
    // 'unwatched' = Unwatched (not completed)
    if (statusFilter === 'in_library') {
      result = result.filter((x) => isInLibrary(x));
    } else if (statusFilter === 'not_in_library') {
      result = result.filter((x) => !isInLibrary(x));
    } else if (statusFilter === 'not_in_library_unwatched') {
      result = result.filter((x) => !isInLibrary(x) && !isWatchedInLibrary(x));
    } else if (statusFilter === 'unwatched') {
      result = result.filter((x) => !isWatchedInLibrary(x));
    }

    // 2. Search query (Title, alternate/original title, genre, country, language, cast, director)
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

    // 3. European & Asian preset check
    if (activePreset === 'european') {
      result = result.filter((x) => (x.countries || []).some((c) => EUROPEAN_COUNTRIES.has(normalizeCountryName(c))));
    } else if (activePreset === 'asian') {
      result = result.filter((x) => (x.countries || []).some((c) => ASIAN_COUNTRIES.has(normalizeCountryName(c))));
    } else if (selectedCountries.length > 0) {
      // 4. Country include filter
      result = result.filter((x) => {
        const normalizedItemCountries = (x.countries || []).map(normalizeCountryName);
        return selectedCountries.some((c) => normalizedItemCountries.includes(c));
      });
    }

    // 3b. Ignore Anime filter (Applies whenever activePreset is ignore_anime OR ignoreAnime toggle is ON)
    if (ignoreAnime || activePreset === 'ignore_anime') {
      // Exclude titles that have Animation genre or anime keywords, but KEEP live-action Japanese/Asian titles
      result = result.filter((x) => {
        const isAnimation = (x.genres || []).some((g) => g.toLowerCase() === 'animation');
        const isAnimeKeyword = (x.tmdbKeywords || []).some((k) => k.toLowerCase().includes('anime'));
        return !isAnimation && !isAnimeKeyword;
      });
    }

    // 4b. Country exclude filter
    if (excludedCountries.length > 0) {
      result = result.filter((x) => {
        const normalizedItemCountries = (x.countries || []).map(normalizeCountryName);
        return !excludedCountries.some((c) => normalizedItemCountries.includes(c));
      });
    }

    // 5. Genres filter (Includes)
    if (selectedGenres.length > 0) {
      if (genreMatchMode === 'all') {
        result = result.filter((x) => selectedGenres.every((g) => (x.genres || []).includes(g)));
      } else {
        result = result.filter((x) => selectedGenres.some((g) => (x.genres || []).includes(g)));
      }
    }

    // 5b. Genres filter (Excludes)
    if (excludedGenres.length > 0) {
      result = result.filter((x) => !(x.genres || []).some((g) => excludedGenres.includes(g)));
    }

    // 5c. Themes filter (Includes)
    if (selectedThemes.length > 0) {
      if (genreMatchMode === 'all') {
        result = result.filter((x) => selectedThemes.every((t) => (x.themes || []).includes(t)));
      } else {
        result = result.filter((x) => selectedThemes.some((t) => (x.themes || []).includes(t)));
      }
    }

    // 5d. Themes filter (Excludes)
    if (excludedThemes.length > 0) {
      result = result.filter((x) => !(x.themes || []).some((t) => excludedThemes.includes(t)));
    }

    // 6. Original Language / Spoken Language filter
    if (selectedLanguage !== 'all') {
      if (selectedLanguage === 'hindi') {
        result = result.filter((x) =>
          x.originalLanguage === 'hi' ||
          x.hindiAudio === true ||
          (x.audioLanguages || []).includes('hi')
        );
      } else if (selectedLanguage === 'english') {
        result = result.filter((x) =>
          x.originalLanguage === 'en' ||
          x.englishAudio === true ||
          (x.audioLanguages || []).includes('en')
        );
      } else if (selectedLanguage === 'asian') {
        const asianLangs = ['ja', 'ko', 'zh', 'hi', 'te', 'ta', 'th', 'id', 'tl', 'vi'];
        result = result.filter((x) =>
          asianLangs.includes((x.originalLanguage || '').toLowerCase())
        );
      } else if (selectedLanguage === 'japanese') {
        result = result.filter((x) => (x.originalLanguage || '').toLowerCase() === 'ja');
      } else if (selectedLanguage === 'korean') {
        result = result.filter((x) => (x.originalLanguage || '').toLowerCase() === 'ko');
      } else if (selectedLanguage === 'chinese') {
        result = result.filter((x) => (x.originalLanguage || '').toLowerCase() === 'zh');
      } else if (selectedLanguage === 'spanish') {
        result = result.filter((x) => (x.originalLanguage || '').toLowerCase() === 'es');
      } else if (selectedLanguage === 'french') {
        result = result.filter((x) => (x.originalLanguage || '').toLowerCase() === 'fr');
      } else if (selectedLanguage === 'german') {
        result = result.filter((x) => (x.originalLanguage || '').toLowerCase() === 'de');
      } else {
        result = result.filter((x) => (x.originalLanguage || '').toLowerCase() === selectedLanguage.toLowerCase());
      }
    }

    // 7. Audio Language (Strict check)
    if (audioFilter !== 'all') {
      result = result.filter((x) => {
        if (!x.audioLanguages || x.audioLanguages.length === 0) {
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

    // 9. Min rating filter (IMDb, TMDB, or RT)
    if (minRating > 0) {
      result = result.filter((x) => {
        const score = x.rottenTomatoesRating !== undefined
          ? x.rottenTomatoesRating / 10
          : (x.imdbRating || x.rating || 0);
        return score >= minRating;
      });
    }

    // 10. Sorting
    return [...result].sort((a, b) => {
      let comparison = 0;

      if (sortBy === 'netflix_newest' || sortBy === 'recently_added') {
        const dateA = a.netflixAddedDate || a.releaseDate || '0';
        const dateB = b.netflixAddedDate || b.releaseDate || '0';
        comparison = dateB.localeCompare(dateA);
      } else if (sortBy === 'year_desc') {
        comparison = (b.releaseYear || 0) - (a.releaseYear || 0);
      } else if (sortBy === 'year_asc') {
        comparison = (a.releaseYear || 0) - (b.releaseYear || 0);
      } else if (sortBy === 'imdb_desc') {
        comparison = (b.imdbRating || 0) - (a.imdbRating || 0);
      } else if (sortBy === 'imdb_asc') {
        comparison = (a.imdbRating || 0) - (b.imdbRating || 0);
      } else if (sortBy === 'tmdb_desc') {
        comparison = (b.rating || 0) - (a.rating || 0);
      } else if (sortBy === 'tmdb_asc') {
        comparison = (a.rating || 0) - (b.rating || 0);
      } else if (sortBy === 'rt_desc') {
        comparison = (b.rottenTomatoesRating || 0) - (a.rottenTomatoesRating || 0);
      } else if (sortBy === 'alpha_asc') {
        comparison = a.title.localeCompare(b.title);
      } else if (sortBy === 'alpha_desc') {
        comparison = b.title.localeCompare(a.title);
      } else if (sortBy === 'runtime_shortest') {
        const rtA = a.mediaType === 'movie' ? a.runtimeMinutes || 999 : (a.totalEpisodes || 1) * (a.averageEpisodeMinutes || 45);
        const rtB = b.mediaType === 'movie' ? b.runtimeMinutes || 999 : (b.totalEpisodes || 1) * (b.averageEpisodeMinutes || 45);
        comparison = rtA - rtB;
      } else if (sortBy === 'runtime_longest') {
        const rtA = a.mediaType === 'movie' ? a.runtimeMinutes || 0 : (a.totalEpisodes || 1) * (a.averageEpisodeMinutes || 45);
        const rtB = b.mediaType === 'movie' ? b.runtimeMinutes || 0 : (b.totalEpisodes || 1) * (b.averageEpisodeMinutes || 45);
        comparison = rtB - rtA;
      } else if (sortBy === 'episodes_fewest') {
        comparison = (a.totalEpisodes || 0) - (b.totalEpisodes || 0);
      } else if (sortBy === 'episodes_most') {
        comparison = (b.totalEpisodes || 0) - (a.totalEpisodes || 0);
      }

      return sortOrder === 'asc' ? -comparison : comparison;
    });
  }, [
    catalog,
    contentType,
    statusFilter,
    isInLibrary,
    isWatchedInLibrary,
    debouncedQuery,
    activePreset,
    selectedCountries,
    excludedCountries,
    selectedGenres,
    excludedGenres,
    selectedThemes,
    excludedThemes,
    genreMatchMode,
    selectedLanguage,
    audioFilter,
    minYear,
    maxYear,
    minRating,
    ignoreAnime,
    ignoredTitleIds,
    sortBy,
    sortOrder,
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

  // Surprise Me: open SurpriseMeModal roulette with all currently filtered Discovery titles
  const handleSurpriseMe = () => {
    const convertedPool = filteredCatalog.map(convertToLibraryItem);
    if (onOpenSurpriseMeModal) {
      onOpenSurpriseMeModal(convertedPool);
      return;
    }
    if (convertedPool.length === 0) return;
    const randomItem = convertedPool[Math.floor(Math.random() * convertedPool.length)];
    try {
      confetti({ particleCount: 35, spread: 55, origin: { y: 0.6 } });
    } catch {}
    onOpenDetail(randomItem);
  };

  // Handlers for Discovery Detail Modal Stack Navigation
  const handleOpenDiscoveryDetail = (title: DiscoveryTitle) => {
    setTitleStack([title]);
  };

  const handlePushDiscoveryDetail = (title: DiscoveryTitle) => {
    setTitleStack((prev) => [...prev, title]);
  };

  const handlePopDiscoveryDetail = () => {
    setTitleStack((prev) => (prev.length > 1 ? prev.slice(0, prev.length - 1) : []));
  };

  const handleCloseDiscoveryDetail = () => {
    setTitleStack([]);
  };

  // TMDB Catalogue Enrichment Execution
  const handleStartTMDBEnrichment = async (force: boolean = false) => {
    if (isEnriching || catalog.length === 0) return;
    setIsEnriching(true);
    cancelEnrichmentRef.current = false;

    try {
      const result = await enrichCatalogWithTMDB({
        titles: catalog,
        apiKey: settings.tmdbApiKey,
        concurrency: 2,
        delayBetweenBatchesMs: 200,
        forceReenrich: force,
        shouldCancel: () => cancelEnrichmentRef.current,
        onProgress: (p) => {
          setEnrichmentProgress(p);
        },
        onBatchSaved: async (batch) => {
          // Update catalog in memory and save to IndexedDB incrementally
          setCatalog((prev) => {
            const map = new Map<string, DiscoveryTitle>(prev.map((t) => [t.id, t]));
            batch.forEach((b) => map.set(b.id, b));
            return Array.from(map.values());
          });
          await saveDiscoveryTitles(batch);
        },
      });

      // Save full enriched catalog to IndexedDB and update meta
      setCatalog(result.enrichedTitles);
      await saveDiscoveryTitles(result.enrichedTitles);

      const syncIso = new Date().toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      const currentMeta = (await getDiscoveryCatalogMeta()) || {};
      await setDiscoveryCatalogMeta({
        ...currentMeta,
        lastTMDBEnrichment: syncIso,
      });

      setRefreshNotification(
        `✨ TMDB Enrichment finished! ${result.completedCount} titles enriched, ${result.skippedCount} already up-to-date.`
      );
      try {
        confetti({ particleCount: 50, spread: 70, origin: { y: 0.6 } });
      } catch {}
    } catch (err: any) {
      console.error('TMDB Enrichment error:', err);
      setSyncError(`TMDB Enrichment paused: ${err.message || 'Rate limit or network error'}`);
    } finally {
      setIsEnriching(false);
      setTimeout(() => setRefreshNotification(null), 5000);
    }
  };

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (contentType !== 'all') count++;
    if (statusFilter !== 'all') count++;
    if (activePreset !== 'all') count++;
    if (selectedGenres.length > 0) count++;
    if (excludedGenres.length > 0) count++;
    if (selectedThemes.length > 0) count++;
    if (excludedThemes.length > 0) count++;
    if (selectedCountries.length > 0) count++;
    if (excludedCountries.length > 0) count++;
    if (selectedLanguage !== 'all') count++;
    if (audioFilter !== 'all') count++;
    if (minYear || maxYear) count++;
    if (minRating > 0) count++;
    if (ignoreAnime) count++;
    if (debouncedQuery) count++;
    return count;
  }, [
    contentType,
    statusFilter,
    activePreset,
    selectedGenres,
    excludedGenres,
    selectedThemes,
    excludedThemes,
    selectedCountries,
    excludedCountries,
    selectedLanguage,
    audioFilter,
    minYear,
    maxYear,
    minRating,
    ignoreAnime,
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
              <span
                className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-mono cursor-help"
                title={`Watchmode API Request Quota: ${quotaInfo.quotaUsed} used out of ${quotaInfo.quota} allocated calls for this monthly billing cycle (${quotaInfo.quota - quotaInfo.quotaUsed} remaining).`}
              >
                Quota: {quotaInfo.quotaUsed} / {quotaInfo.quota}
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            DISCOVERY
          </h1>
          {lastSyncTime && (
            <p className="text-[11px] text-zinc-500 mt-1 font-mono">
              Last Catalogue Sync: {lastSyncTime}
            </p>
          )}
        </div>

        {/* API, Analytics, Surprise Me & Filter Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Single Consolidated API Button */}
          <button
            onClick={() => setShowApiModal(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs bg-zinc-800 hover:bg-zinc-700 text-white border border-white/10 shadow-md transition-all active:scale-95"
            title="Open API Management: Netflix Enrichment, TMDB Enrichment, and Refresh API"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${(isEnriching || isSyncing || isRefreshingApi) ? 'animate-spin text-purple-400' : 'text-zinc-400'}`} />
            <span>API</span>
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
        </div>
      </div>

      {/* Persistent Background TMDB Enrichment Banner (Visible when enriching even if modal is closed) */}
      {isEnriching && enrichmentProgress && !showEnrichModal && (
        <div className="bg-gradient-to-r from-purple-950/90 via-zinc-900 to-purple-950/90 border border-purple-500/50 rounded-2xl p-3.5 shadow-xl animate-fade-in flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 shrink-0">
              <Sparkles className="w-4 h-4 animate-spin text-purple-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">Enriching Catalogue in Background:</span>
                <span className="text-purple-300 truncate max-w-[220px]">
                  {enrichmentProgress.currentTitle || 'Processing queue...'}
                </span>
                <span className="font-mono text-purple-400 font-bold bg-purple-950/80 px-2 py-0.5 rounded border border-purple-500/30 text-[10px]">
                  {enrichmentProgress.percentage}%
                </span>
              </div>
              <div className="text-[11px] text-zinc-400 flex items-center gap-3 mt-0.5">
                <span>Processed: {enrichmentProgress.processedCount} / {enrichmentProgress.totalTitles}</span>
                <span className="text-emerald-400">Enriched: {enrichmentProgress.completedCount}</span>
                <span className="text-blue-400">Skipped: {enrichmentProgress.skippedCount}</span>
                {enrichmentProgress.failedCount > 0 && (
                  <span className="text-red-400">Failed: {enrichmentProgress.failedCount}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <button
              onClick={() => setShowEnrichModal(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10"
            >
              View Details
            </button>
            <button
              onClick={() => {
                cancelEnrichmentRef.current = true;
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-300 bg-red-950/80 border border-red-500/40 hover:bg-red-900"
            >
              Pause
            </button>
          </div>
        </div>
      )}

      {/* Refresh / Library Sync Notification Banner */}
      {refreshNotification && (
        <div className="bg-amber-950/80 border border-amber-500/50 rounded-xl p-4 flex items-center gap-3 text-amber-200 text-xs animate-fade-in shadow-lg">
          <RefreshCw className={`w-4 h-4 text-amber-400 shrink-0 ${isRefreshingApi || isSyncingLibrary ? 'animate-spin' : ''}`} />
          <div className="flex-1 font-medium">{refreshNotification}</div>
          {isSyncingLibrary ? (
            <button
              onClick={() => {
                cancelLibrarySyncRef.current = true;
              }}
              className="px-2.5 py-1 rounded-lg bg-red-600/30 hover:bg-red-600 border border-red-500/40 text-red-200 hover:text-white text-[11px] font-bold transition-all active:scale-95"
              title="Pause / Stop TMDB enrichment. Progress will be saved!"
            >
              Cancel / Pause
            </button>
          ) : !isRefreshingApi ? (
            <button
              onClick={() => setRefreshNotification(null)}
              className="text-amber-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      )}

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

      {/* API Management Modal */}
      {showApiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-5">
            <button
              onClick={() => setShowApiModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                <RefreshCw className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">API Management</h3>
                <p className="text-xs text-zinc-400">
                  Manage catalogue enrichment, external sync pipelines, and local database cache.
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              {/* TMDB Enrichment Action */}
              <div className="flex items-center justify-between p-4 bg-zinc-800/60 border border-white/5 rounded-xl hover:border-purple-500/30 transition-all">
                <div className="space-y-0.5 max-w-[70%]">
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span>TMDB Enrichment</span>
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Enrich titles with IMDb ratings, Rotten Tomatoes scores, taglines, cast, themes & similar titles.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowApiModal(false);
                    setShowEnrichModal(true);
                  }}
                  disabled={isEnriching || isSyncing || catalog.length === 0}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-md transition-all active:scale-95 disabled:opacity-50"
                >
                  {isEnriching ? 'Enriching...' : 'Open TMDB'}
                </button>
              </div>

              {/* Netflix Enrichment (Watchmode Sync) Action */}
              <div className="flex items-center justify-between p-4 bg-zinc-800/60 border border-white/5 rounded-xl hover:border-red-500/30 transition-all">
                <div className="space-y-0.5 max-w-[70%]">
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <Film className="w-4 h-4 text-[#E50914]" />
                    <span>Netflix Enrichment</span>
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Sync official Netflix India catalog titles from Watchmode and cache locally.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowApiModal(false);
                    setShowSyncModal(true);
                  }}
                  disabled={isSyncing || isRefreshingApi}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#E50914] hover:bg-red-700 text-white shadow-md transition-all active:scale-95 disabled:opacity-50"
                >
                  {isSyncing ? 'Syncing...' : 'Sync Netflix'}
                </button>
              </div>

              {/* Refresh With Library & TMDB Enrichment Action */}
              <div className="flex items-center justify-between p-4 bg-zinc-800/60 border border-white/5 rounded-xl hover:border-emerald-500/30 transition-all">
                <div className="space-y-0.5 max-w-[70%]">
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <PlusCircle className={`w-4 h-4 text-emerald-400 ${isSyncingLibrary ? 'animate-spin' : ''}`} />
                    <span>Refresh With Library & TMDB</span>
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Sync your personal library titles directly into the Discovery catalogue and fetch full TMDB metadata & ratings.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowApiModal(false);
                    handleRefreshLibraryToDiscoveryAndEnrich();
                  }}
                  disabled={isSyncingLibrary || isSyncing || isRefreshingApi || libraryItems.length === 0}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-all active:scale-95 disabled:opacity-50"
                >
                  {isSyncingLibrary ? 'Syncing...' : 'Sync & Enrich'}
                </button>
              </div>

              {/* Refresh API Action */}
              <div className="flex items-center justify-between p-4 bg-zinc-800/60 border border-white/5 rounded-xl hover:border-amber-500/30 transition-all">
                <div className="space-y-0.5 max-w-[70%]">
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <RefreshCw className={`w-4 h-4 text-amber-400 ${isRefreshingApi ? 'animate-spin' : ''}`} />
                    <span>Refresh API</span>
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Force re-pull fresh catalog updates and re-verify streaming availability directly.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowApiModal(false);
                    handleRefreshCatalogFromApi();
                  }}
                  disabled={isRefreshingApi || isSyncing}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-md transition-all active:scale-95 disabled:opacity-50"
                >
                  {isRefreshingApi ? 'Refreshing...' : 'Refresh API'}
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={() => setShowApiModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Configuration Modal */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-5">
            <button
              onClick={() => setShowSyncModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-[#E50914]/20 text-[#E50914] border border-[#E50914]/30">
                <RefreshCw className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Sync Netflix India Catalogue</h3>
                <p className="text-xs text-zinc-400">
                  Select how many movies and TV series to discover and enrich from Watchmode & TMDB.
                </p>
              </div>
            </div>

            {/* Mode selection tabs */}
            <div className="grid grid-cols-2 gap-2 bg-black/40 p-1.5 rounded-xl border border-white/5 text-xs font-bold">
              <button
                type="button"
                onClick={() => setSyncMode('custom')}
                className={`py-2 rounded-lg transition-all ${
                  syncMode === 'custom'
                    ? 'bg-[#E50914] text-white shadow-md'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Custom Counts
              </button>
              <button
                type="button"
                onClick={() => setSyncMode('all')}
                className={`py-2 rounded-lg transition-all ${
                  syncMode === 'all'
                    ? 'bg-[#E50914] text-white shadow-md'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Entire Catalogue (All 4,200+)
              </button>
            </div>

            {syncMode === 'custom' ? (
              <div className="space-y-4 bg-black/30 p-4 rounded-xl border border-white/5">
                {/* Movies Count Slider & Input */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
                    <span className="flex items-center gap-1.5">
                      <Film className="w-3.5 h-3.5 text-[#E50914]" />
                      <span>Number of Movies to Sync</span>
                    </span>
                    <input
                      type="number"
                      min={10}
                      max={2500}
                      value={syncMoviesCount}
                      onChange={(e) => setSyncMoviesCount(Math.max(10, Math.min(2500, parseInt(e.target.value, 10) || 10)))}
                      className="w-20 px-2 py-1 rounded-lg bg-zinc-800 border border-white/10 text-right text-xs font-mono font-bold text-white focus:outline-none focus:border-[#E50914]"
                    />
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={1000}
                    step={10}
                    value={syncMoviesCount}
                    onChange={(e) => setSyncMoviesCount(parseInt(e.target.value, 10))}
                    className="w-full accent-[#E50914] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                    <span>10 movies</span>
                    <span>100</span>
                    <span>250</span>
                    <span>500</span>
                    <span>1000+</span>
                  </div>
                </div>

                {/* TV Series Count Slider & Input */}
                <div className="space-y-1.5 pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
                    <span className="flex items-center gap-1.5">
                      <Tv className="w-3.5 h-3.5 text-purple-400" />
                      <span>Number of TV Series to Sync</span>
                    </span>
                    <input
                      type="number"
                      min={10}
                      max={1500}
                      value={syncTvShowsCount}
                      onChange={(e) => setSyncTvShowsCount(Math.max(10, Math.min(1500, parseInt(e.target.value, 10) || 10)))}
                      className="w-20 px-2 py-1 rounded-lg bg-zinc-800 border border-white/10 text-right text-xs font-mono font-bold text-white focus:outline-none focus:border-[#E50914]"
                    />
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={1000}
                    step={10}
                    value={syncTvShowsCount}
                    onChange={(e) => setSyncTvShowsCount(parseInt(e.target.value, 10))}
                    className="w-full accent-purple-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                    <span>10 series</span>
                    <span>100</span>
                    <span>250</span>
                    <span>500</span>
                    <span>1000+</span>
                  </div>
                </div>

                <div className="text-[11px] text-zinc-400 bg-zinc-950/60 p-2.5 rounded-lg border border-white/5">
                  ⚡ Total to sync: <span className="font-bold text-white">{(syncMoviesCount + syncTvShowsCount).toLocaleString()} titles</span>. Titles will be displayed and saved immediately in batches as they are enriched.
                </div>
              </div>
            ) : (
              <div className="bg-black/30 p-4 rounded-xl border border-white/5 space-y-2 text-xs text-zinc-300">
                <p>
                  Will sync the entire Netflix India catalog across all available Watchmode pages (~4,200+ titles) and enrich posters/metadata progressively.
                </p>
                <p className="text-zinc-400 text-[11px]">
                  Enriched titles will appear on screen live as each small batch completes.
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSyncModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (syncMode === 'custom') {
                    handleStartCatalogueSync({
                      maxMovies: syncMoviesCount,
                      maxTvShows: syncTvShowsCount,
                    });
                  } else {
                    handleStartCatalogueSync();
                  }
                }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-[#E50914] hover:bg-red-700 text-white shadow-lg shadow-red-600/30 transition-all active:scale-95"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Start Sync</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Filter & Sort Toolbar (Matches Movies/Series layout exactly) */}
      <div className="bg-[#1c1c1e] p-3 sm:p-4 rounded-2xl border border-white/10 space-y-2.5 sm:space-y-3 shadow-md">
        {/* Row 1: Search & Controls Row */}
        <div className="flex flex-col gap-2.5">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Netflix India catalog by title, cast, director, country..."
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

          {/* Primary Filter Grid / Row */}
          <div className="grid grid-cols-2 md:flex md:flex-wrap items-center gap-2">
            {/* Type selector */}
            <select
              value={contentType}
              onChange={(e) => setContentType(e.target.value as 'all' | 'movie' | 'tv')}
              className="w-full md:w-auto bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-medium focus:outline-none focus:border-[#E50914] cursor-pointer"
            >
              <option value="all" className="bg-zinc-900 text-white">All Types</option>
              <option value="movie" className="bg-zinc-900 text-white">Movies Only</option>
              <option value="tv" className="bg-zinc-900 text-white">TV Shows Only</option>
            </select>

            {/* Status selector (matching Movies & Series) */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full md:w-auto bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-medium focus:outline-none focus:border-[#E50914] cursor-pointer truncate"
            >
              <option value="all" className="bg-zinc-900 text-white">Active Catalog</option>
              <option value="not_in_library" className="bg-zinc-900 text-white">Not in Library</option>
              <option value="not_in_library_unwatched" className="bg-zinc-900 text-white">Not in Library & Unwatched</option>
              <option value="in_library" className="bg-zinc-900 text-white">Already in Library</option>
              <option value="unwatched" className="bg-zinc-900 text-white">Unwatched</option>
            </select>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full md:w-auto bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#E50914] font-medium cursor-pointer"
            >
              <option value="netflix_newest" className="bg-zinc-900 text-white">Recently Added</option>
              <option value="runtime_shortest" className="bg-zinc-900 text-white">⏱️ Runtime</option>
              <option value="rt_desc" className="bg-zinc-900 text-white">🍅 Rotten Tomatoes</option>
              <option value="imdb_desc" className="bg-zinc-900 text-white">⭐ IMDb Rating</option>
              <option value="alpha_asc" className="bg-zinc-900 text-white">Alphabetical (A - Z)</option>
              <option value="year_desc" className="bg-zinc-900 text-white">Release Year</option>
              <option value="tmdb_desc" className="bg-zinc-900 text-white">TMDB Score</option>
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

        {/* Row 2: Category, Country, Year, Hindi & Language filters */}
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
                  setSortBy('imdb_desc');
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
            {/* Quick Filter: Hindi Dub */}
            <button
              onClick={() => setSelectedLanguage((prev) => (prev === 'hindi' ? 'all' : 'hindi'))}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all shrink-0 ${
                selectedLanguage === 'hindi'
                  ? 'bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/20'
                  : 'bg-black/40 border-white/10 text-gray-300 hover:text-white hover:border-amber-500/40'
              }`}
              title="Filter titles available with Hindi Audio"
            >
              <span className="font-black text-sm">हिं</span>
              <span>Hindi Dub</span>
            </button>

            {/* Categories Multi-select Trigger */}
            <button
              onClick={() => setShowGenreModal(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all shrink-0 ${
                selectedGenres.length > 0 || excludedGenres.length > 0
                  ? selectedGenres.length > 0
                    ? 'bg-red-600/20 border-red-500/50 text-red-300'
                    : 'bg-red-600/20 border-red-500/50 text-red-300'
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
                  ? selectedThemes.length > 0
                    ? 'bg-purple-600/20 border-purple-500/50 text-purple-300'
                    : 'bg-red-600/20 border-red-500/50 text-red-300'
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
                  ? selectedCountries.length > 0
                    ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                    : 'bg-red-600/20 border-red-500/50 text-red-300'
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

            {/* Audio / Spoken Language Selector Dropdown */}
            <div className="flex items-center gap-1 bg-zinc-900 border border-white/10 rounded-xl px-2 py-1 text-xs shrink-0">
              <Languages className="w-3.5 h-3.5 text-zinc-400" />
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="bg-transparent text-white font-medium focus:outline-none cursor-pointer pr-1"
                title="Filter by Audio / Language"
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

            {/* Hidden / Ignored Titles Button (Next to All Languages dropdown) */}
            {ignoredTitleIds.length > 0 && (
              <button
                type="button"
                onClick={handleUnignoreAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all shrink-0 bg-red-950/70 hover:bg-red-900/90 text-red-300 hover:text-white border-red-500/50 shadow-md shadow-red-950/40 active:scale-95 ring-1 ring-red-500/30"
                title="Click to unhide / unignore all hidden titles"
              >
                <Eye className="w-3.5 h-3.5 text-red-400" />
                <span>Hidden ({ignoredTitleIds.length})</span>
                <span className="text-[10px] text-red-400/80 font-normal underline ml-0.5">Unhide All</span>
              </button>
            )}
          </div>

          {/* Counts & Clear status row */}
          <div className="flex items-center justify-between text-xs pt-1 text-gray-400">
            <span className="font-medium">
              Showing <span className="text-white font-bold">{filteredCatalog.length}</span> of {catalog.length} titles
            </span>

            {activeFiltersCount > 0 && (
              <button
                onClick={handleClearAllFilters}
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

            {selectedLanguage !== 'all' && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-medium">
                <span>Language: {selectedLanguage === 'hindi' ? 'हिं Hindi' : selectedLanguage.toUpperCase()}</span>
                <button onClick={() => setSelectedLanguage('all')} className="hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {contentType !== 'all' && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/10 text-gray-300 text-[11px]">
                <span>{contentType === 'tv' ? 'TV Shows' : 'Movies'}</span>
                <button onClick={() => setContentType('all')}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {statusFilter !== 'all' && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/10 text-gray-300 text-[11px]">
                <span>
                  {statusFilter === 'in_library'
                    ? 'In Library'
                    : statusFilter === 'not_in_library'
                    ? 'Not in Library'
                    : statusFilter === 'not_in_library_unwatched'
                    ? 'Not in Library & Unwatched'
                    : 'Unwatched'}
                </span>
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

      {/* 3. Main Title Card Grid using DiscoveryCard */}
      {loading && catalog.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-4">
          {Array.from({ length: 18 }).map((_, idx) => (
            <div
              key={idx}
              className="bg-[#181818] rounded-xl overflow-hidden border border-white/5 animate-pulse flex flex-col justify-between h-[340px]"
            >
              <div className="aspect-[2/3] bg-zinc-800/60 w-full" />
              <div className="p-3 space-y-2">
                <div className="h-4 bg-zinc-800 rounded w-3/4" />
                <div className="h-3 bg-zinc-800/60 rounded w-1/2" />
                <div className="h-3 bg-zinc-800/40 rounded w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredCatalog.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-4">
          {paginatedTitles.map((item) => (
            <DiscoveryCard
              key={item.id}
              item={item}
              isInLibrary={isInLibrary(item)}
              isWatched={isWatchedInLibrary(item)}
              onClick={() => handleOpenDiscoveryDetail(item)}
              onAddToLibrary={onAddToLibrary}
              onStartWatching={onStartWatching}
              onMarkWatched={onMarkWatched}
              onIgnoreTitle={handleIgnoreTitle}
              onTagClick={(tag, type) => setTagExploreModal({ tag, type })}
            />
          ))}
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

      {/* 4. Infinite Scroll Sentinel & Pagination Controls */}
      <div ref={sentinelRef} className="pt-6 flex flex-col items-center justify-center gap-3">
        {loading && catalog.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900 border border-white/10 text-xs text-zinc-300 shadow-xl">
            <div className="w-3.5 h-3.5 border-2 border-[#E50914] border-t-transparent rounded-full animate-spin" />
            <span>Loading dynamic Netflix India titles from Watchmode & TMDB...</span>
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

        {/* Load More Button */}
        {filteredCatalog.length > visibleCount && viewMode === 'infinite' && (
          <button
            onClick={() => setVisibleCount((prev) => Math.min(prev + ITEMS_PER_BATCH, filteredCatalog.length))}
            className="px-6 py-2.5 rounded-xl bg-[#E50914]/20 hover:bg-[#E50914]/30 border border-[#E50914]/40 text-xs font-bold text-red-300 transition-all shadow-md active:scale-95 flex items-center gap-2"
          >
            <span>+ Load More Titles (Showing {Math.min(visibleCount, filteredCatalog.length)} of {filteredCatalog.length.toLocaleString()})</span>
          </button>
        )}
      </div>

      {/* 5. Modals: Categories, Country (Include/Exclude), Year Range */}
      {/* Category Multi-select Modal with Include & Exclude Tabs */}
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
              {availableGenres
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

      {/* Country Multi-select Modal with Include & Exclude */}
      {showCountryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-[#1c1c1e] border border-white/15 rounded-2xl p-5 sm:p-6 shadow-2xl">
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
              {availableCountries
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-[#1c1c1e] border border-white/15 rounded-2xl p-6 shadow-2xl">
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
                      key={'rating_p_' + p.value}
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

      {/* TMDB Catalog Enrichment Modal / Progress Monitor */}
      {showEnrichModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-5">
            <button
              onClick={() => {
                // Closing the modal lets enrichment continue running in the background!
                setShowEnrichModal(false);
              }}
              className="absolute top-4 right-4 p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Close modal (enrichment will continue running in background)"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Enrich Catalogue with TMDB</h3>
                <p className="text-xs text-zinc-400">
                  Enrich titles with taglines, themes, ratings, cast, trailers, and recommendations.
                </p>
              </div>
            </div>

            {/* Status overview */}
            {isEnriching && enrichmentProgress ? (
              <div className="space-y-4 bg-black/40 p-4 rounded-xl border border-white/5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
                    <span>Enriching: {enrichmentProgress.currentTitle || 'Processing queue...'}</span>
                  </span>
                  <span className="font-mono text-purple-400 font-black">
                    {enrichmentProgress.percentage}%
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-purple-600 to-indigo-500 h-full transition-all duration-300"
                    style={{ width: `${enrichmentProgress.percentage}%` }}
                  />
                </div>

                {/* Counters */}
                <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-mono pt-1">
                  <div className="bg-zinc-900 p-2 rounded-lg border border-white/5">
                    <div className="text-zinc-500">Processed</div>
                    <div className="text-white font-bold">{enrichmentProgress.processedCount}</div>
                  </div>
                  <div className="bg-zinc-900 p-2 rounded-lg border border-emerald-500/30">
                    <div className="text-emerald-400">Enriched</div>
                    <div className="text-emerald-300 font-bold">{enrichmentProgress.completedCount}</div>
                  </div>
                  <div className="bg-zinc-900 p-2 rounded-lg border border-blue-500/30">
                    <div className="text-blue-400">Skipped</div>
                    <div className="text-blue-300 font-bold">{enrichmentProgress.skippedCount}</div>
                  </div>
                  <div className="bg-zinc-900 p-2 rounded-lg border border-red-500/30">
                    <div className="text-red-400">Failed</div>
                    <div className="text-red-300 font-bold">{enrichmentProgress.failedCount}</div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-[11px] text-zinc-500">
                    Total in Catalog: {catalog.length} titles
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      cancelEnrichmentRef.current = true;
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-300 bg-red-950/60 border border-red-500/40 hover:bg-red-900"
                  >
                    Pause / Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-black/30 p-4 rounded-xl border border-white/5 space-y-2 text-xs text-zinc-300">
                  <p>
                    This process is completely <strong className="text-white font-semibold">idempotent</strong>: it will inspect the local Netflix catalog ({catalog.length.toLocaleString()} titles) and safely enrich titles with TMDB data.
                  </p>
                  <p className="text-zinc-400 text-[11px]">
                    Already enriched titles are skipped automatically to respect API quotas and rate limits.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowEnrichModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700"
                  >
                    Close
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStartTMDBEnrichment(true)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-white/10"
                    title="Force re-enrichment of all titles even if already marked completed"
                  >
                    Force Re-Enrich All
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStartTMDBEnrichment(false)}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/30 transition-all active:scale-95"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Start Enrichment</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Discovery Detail Modal with Stack Navigation */}
      {titleStack.length > 0 && (
        <DiscoveryDetailModal
          titleStack={titleStack}
          catalog={catalog}
          onClose={handleCloseDiscoveryDetail}
          onPushTitle={handlePushDiscoveryDetail}
          onPopTitle={handlePopDiscoveryDetail}
          onAddToLibrary={onAddToLibrary}
          onStartWatching={onStartWatching}
          isInLibrary={isInLibrary}
          settings={settings}
          libraryItems={libraryItems}
          ignoredTitleIds={ignoredTitleIds}
        />
      )}

      {/* Theme & Genre Tag Explore Modal with Exclusions & Type Filter */}
      {tagExploreModal && (
        <TagExploreModal
          isOpen={!!tagExploreModal}
          onClose={() => setTagExploreModal(null)}
          tag={tagExploreModal.tag}
          tagType={tagExploreModal.type}
          catalog={catalog}
          onSelectTitle={handleOpenDiscoveryDetail}
          onAddToLibrary={onAddToLibrary}
          onStartWatching={onStartWatching}
          isInLibrary={isInLibrary}
        />
      )}
    </div>
  );
};
