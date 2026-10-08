import React, { useState, useMemo, useEffect } from 'react';
import {
  Play,
  Check,
  Trash2,
  Clock,
  Film,
  Tv,
  Search,
  Star,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Sparkles,
  Flame,
  Plus,
  ExternalLink,
  Eye,
  TrendingUp,
  X,
  Minus,
  SlidersHorizontal,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { DiscoveryTitle, LibraryItem, WatchProgress } from '../types';
import { formatRuntime } from '../services/analytics';
import { getNetflixUrl, openNetflixInNewTab } from '../services/normalizer';
import { SEED_NETFLIX_INDIA_TITLES } from '../services/discoveryService';
import { CachedImage } from './CachedImage';

interface StillWatchingViewProps {
  items: LibraryItem[];
  catalog?: DiscoveryTitle[];
  onUpdateItem: (item: LibraryItem) => void;
  onAddItem?: (item: LibraryItem) => void;
  onOpenDropModal: (item: LibraryItem) => void;
  onOpenDetail: (item: LibraryItem) => void;
  onOpenItemDetail?: (item: DiscoveryTitle | LibraryItem) => void;
}

type StillSortOption = 'recently_watched' | 'recently_added' | 'progress' | 'alphabetical';
type FilterCategory = 'all' | 'tv' | 'movie' | 'almost_done' | 'just_started';

export const StillWatchingView: React.FC<StillWatchingViewProps> = ({
  items,
  catalog,
  onUpdateItem,
  onAddItem,
  onOpenDropModal,
  onOpenDetail,
  onOpenItemDetail,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<StillSortOption>('recently_watched');
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');
  const [expandedCardIds, setExpandedCardIds] = useState<Record<string, boolean>>({});

  // Search & Add Modal state
  const [isAddSearchOpen, setIsAddSearchOpen] = useState(false);
  const [addSearchQuery, setAddSearchQuery] = useState('');
  const [addFilterType, setAddFilterType] = useState<'all' | 'tv' | 'movie'>('all');
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);
  const [visibleResultsCount, setVisibleResultsCount] = useState(50);

  // Reset pagination when search query or filter changes
  useEffect(() => {
    setVisibleResultsCount(50);
  }, [addSearchQuery, addFilterType]);

  // Esc key listener and body scroll lock for Search modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isAddSearchOpen) {
        setIsAddSearchOpen(false);
      }
    };
    if (isAddSearchOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAddSearchOpen]);

  // Filter still watching titles
  const watchingItems = useMemo(() => {
    return items.filter(
      (x) => x.viewingStatus === 'still_watching' && !x.isCompleted
    );
  }, [items]);

  // Unified candidates for Search & Add (combines library and catalog)
  const searchableCandidates = useMemo(() => {
    const results: Array<{
      id: string;
      title: string;
      mediaType: 'movie' | 'tv';
      releaseYear?: number;
      posterPath?: string;
      rating?: number;
      imdbRating?: number;
      genres?: string[];
      synopsis?: string;
      isAlreadyWatching: boolean;
      source: 'library' | 'catalog';
      libraryItem?: LibraryItem;
      catalogItem?: DiscoveryTitle;
    }> = [];

    const watchingIds = new Set(watchingItems.map((w) => w.id));
    const watchingTitles = new Set(
      watchingItems.map((w) => (w.externalTitle || w.originalTitle || '').toLowerCase().trim())
    );
    const seenKeys = new Set<string>();

    // 1. Library items (Unwatched and other library items)
    for (const lib of items) {
      const key = (lib.externalTitle || lib.originalTitle || '').toLowerCase().trim();
      if (!key) continue;
      seenKeys.add(key);
      const isAlready = watchingIds.has(lib.id) || watchingTitles.has(key);
      results.push({
        id: lib.id,
        title: lib.externalTitle || lib.originalTitle,
        mediaType: lib.mediaType === 'tv' ? 'tv' : 'movie',
        releaseYear: lib.releaseYear,
        posterPath: lib.posterPath,
        rating: lib.rating,
        imdbRating: lib.imdbRating,
        genres: lib.genres,
        synopsis: lib.synopsis || (lib as any).overview,
        isAlreadyWatching: isAlready,
        source: 'library',
        libraryItem: lib,
      });
    }

    // 2. Catalog titles (from full discovery catalog or seed catalog fallback)
    const effectiveCatalog = catalog && catalog.length > 0 ? catalog : SEED_NETFLIX_INDIA_TITLES;
    if (effectiveCatalog && effectiveCatalog.length > 0) {
      for (const cat of effectiveCatalog) {
        const key = (cat.title || '').toLowerCase().trim();
        if (!key || seenKeys.has(key)) continue;
        seenKeys.add(key);
        const isAlready =
          watchingTitles.has(key) ||
          (cat.netflixId ? watchingItems.some((w) => w.videoId === cat.netflixId) : false) ||
          (cat.tmdbId ? watchingItems.some((w) => w.externalId === cat.tmdbId) : false);
        results.push({
          id: String(cat.id || cat.netflixId || cat.tmdbId || `cat_${key}`),
          title: cat.title,
          mediaType: cat.mediaType || 'movie',
          releaseYear: cat.releaseYear,
          posterPath: cat.posterPath,
          rating: cat.rating,
          imdbRating: cat.imdbRating,
          genres: cat.genres,
          synopsis: cat.synopsis,
          isAlreadyWatching: isAlready,
          source: 'catalog',
          catalogItem: cat,
        });
      }
    }

    return results;
  }, [items, catalog, watchingItems]);

  // Filtered search results across entire discovery catalog & library
  const filteredAddResults = useMemo(() => {
    let list = searchableCandidates;
    if (addFilterType !== 'all') {
      list = list.filter((x) => x.mediaType === addFilterType);
    }
    const q = addSearchQuery.toLowerCase().trim();
    if (!q) {
      return list;
    }

    return list.filter((x) => {
      const titleMatch = (x.title || '').toLowerCase().includes(q);
      const genreMatch = (x.genres || []).some((g) => (g || '').toLowerCase().includes(q));
      const synMatch = (x.synopsis || '').toLowerCase().includes(q);
      const castMatch = (x.catalogItem?.cast || []).some((c) => (c || '').toLowerCase().includes(q));
      const directorMatch =
        (x.catalogItem?.director || '').toLowerCase().includes(q) ||
        (x.catalogItem?.creator || '').toLowerCase().includes(q);
      return titleMatch || genreMatch || synMatch || castMatch || directorMatch;
    });
  }, [searchableCandidates, addSearchQuery, addFilterType]);

  // Efficient slice to avoid freezing the browser with thousands of DOM nodes
  const displayedAddResults = useMemo(() => {
    return filteredAddResults.slice(0, visibleResultsCount);
  }, [filteredAddResults, visibleResultsCount]);

  // Stats calculation
  const stats = useMemo(() => {
    const total = watchingItems.length;
    if (total === 0) return { total: 0, avgProgress: 0, seriesCount: 0, movieCount: 0, almostDoneCount: 0 };

    let totalPct = 0;
    let seriesCount = 0;
    let movieCount = 0;
    let almostDoneCount = 0;

    for (const item of watchingItems) {
      const pct = item.progress?.percentage || 0;
      totalPct += pct;
      if (item.mediaType === 'tv') seriesCount++;
      else movieCount++;
      if (pct >= 75) almostDoneCount++;
    }

    return {
      total,
      avgProgress: Math.round(totalPct / total),
      seriesCount,
      movieCount,
      almostDoneCount,
    };
  }, [watchingItems]);

  // Spotlight Candidates: Total of up to 10 cards for "Jump Back In" spotlight carousel
  const spotlightItems = useMemo(() => {
    // 1. Primary: In-progress watching items sorted by most recently watched
    const sortedWatching = [...watchingItems].sort((a, b) => {
      const timeA = new Date(a.progress?.lastWatchedAt || a.updatedAt || a.addedAt || 0).getTime();
      const timeB = new Date(b.progress?.lastWatchedAt || b.updatedAt || b.addedAt || 0).getTime();
      return timeB - timeA;
    });

    const pool: LibraryItem[] = [...sortedWatching];

    // If watching pool has fewer than 10, fill from other library items
    if (pool.length < 10) {
      const poolIds = new Set(pool.map((x) => x.id));
      const poolTitles = new Set(pool.map((x) => (x.externalTitle || x.originalTitle).toLowerCase().trim()));

      for (const item of items) {
        if (pool.length >= 10) break;
        const key = (item.externalTitle || item.originalTitle).toLowerCase().trim();
        if (!poolIds.has(item.id) && !poolTitles.has(key) && item.viewingStatus !== 'dropped') {
          pool.push(item);
          poolIds.add(item.id);
          poolTitles.add(key);
        }
      }

      // If still fewer than 10, fill from catalog
      const effectiveCatalog = catalog && catalog.length > 0 ? catalog : SEED_NETFLIX_INDIA_TITLES;
      for (const cat of effectiveCatalog) {
        if (pool.length >= 10) break;
        const key = cat.title.toLowerCase().trim();
        if (!poolTitles.has(key)) {
          const pseudoItem: LibraryItem = {
            id: 'spotlight_cat_' + (cat.netflixId || cat.tmdbId || Math.random().toString(36).substring(2, 7)),
            originalTitle: cat.title,
            normalizedTitle: cat.title.toLowerCase().trim(),
            videoId: cat.netflixId,
            mediaType: cat.mediaType,
            status: 'matched',
            viewingStatus: 'still_watching',
            externalId: cat.tmdbId,
            externalTitle: cat.title,
            releaseYear: cat.releaseYear,
            releaseDate: cat.releaseDate,
            posterPath: cat.posterPath,
            backdropPath: cat.backdropPath,
            rating: cat.rating,
            imdbRating: cat.imdbRating,
            rottenTomatoesRating: cat.rottenTomatoesRating,
            voteCount: cat.voteCount,
            synopsis: cat.synopsis,
            genres: cat.genres,
            runtimeMinutes: cat.runtimeMinutes,
            totalSeasons: cat.totalSeasons,
            totalEpisodes: cat.totalEpisodes,
            cast: cat.cast,
            director: cat.director,
            creator: cat.creator,
            addedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            progress: {
              percentage: 0,
              currentSeason: 1,
              currentEpisode: 1,
              watchedMinutes: 0,
              lastWatchedAt: new Date().toISOString(),
            },
          };
          pool.push(pseudoItem);
          poolTitles.add(key);
        }
      }
    }

    return pool.slice(0, 10);
  }, [watchingItems, items, catalog]);

  // Spotlight Carousel state: auto-rotate every 10 seconds, forward and backward navigation
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [isSpotlightPaused, setIsSpotlightPaused] = useState(false);

  // Auto-advance spotlight every 10 seconds
  useEffect(() => {
    if (spotlightItems.length <= 1 || isSpotlightPaused) return;

    const timer = setInterval(() => {
      setSpotlightIndex((prev) => (prev + 1) % spotlightItems.length);
    }, 10000);

    return () => clearInterval(timer);
  }, [spotlightItems.length, isSpotlightPaused]);

  // Safe active spotlight item
  const activeSpotlightIndex = spotlightItems.length > 0 ? spotlightIndex % spotlightItems.length : 0;
  const spotlightItem = spotlightItems[activeSpotlightIndex] || null;

  const handlePrevSpotlight = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSpotlightIndex((prev) => (prev - 1 + spotlightItems.length) % spotlightItems.length);
  };

  const handleNextSpotlight = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSpotlightIndex((prev) => (prev + 1) % spotlightItems.length);
  };

  // Filtered & Sorted Display Items
  const displayItems = useMemo(() => {
    let filtered = watchingItems;

    // Category filter
    if (filterCategory === 'tv') {
      filtered = filtered.filter((x) => x.mediaType === 'tv');
    } else if (filterCategory === 'movie') {
      filtered = filtered.filter((x) => x.mediaType === 'movie');
    } else if (filterCategory === 'almost_done') {
      filtered = filtered.filter((x) => (x.progress?.percentage || 0) >= 70);
    } else if (filterCategory === 'just_started') {
      filtered = filtered.filter((x) => (x.progress?.percentage || 0) <= 25);
    }

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (x) =>
          x.originalTitle.toLowerCase().includes(q) ||
          (x.externalTitle && x.externalTitle.toLowerCase().includes(q)) ||
          (x.genres || []).some((g) => g.toLowerCase().includes(q))
      );
    }

    return [...filtered].sort((a, b) => {
      if (sortBy === 'progress') {
        return (b.progress?.percentage || 0) - (a.progress?.percentage || 0);
      }
      if (sortBy === 'alphabetical') {
        const tA = a.externalTitle || a.originalTitle;
        const tB = b.externalTitle || b.originalTitle;
        return tA.localeCompare(tB);
      }
      if (sortBy === 'recently_added') {
        const timeA = new Date(a.addedAt || 0).getTime();
        const timeB = new Date(b.addedAt || 0).getTime();
        return timeB - timeA;
      }
      // default: recently_watched
      const lastA = new Date(a.progress?.lastWatchedAt || a.updatedAt || a.addedAt || 0).getTime();
      const lastB = new Date(b.progress?.lastWatchedAt || b.updatedAt || b.addedAt || 0).getTime();
      return lastB - lastA;
    });
  }, [watchingItems, searchQuery, sortBy, filterCategory]);

  const toggleExpand = (itemId: string) => {
    setExpandedCardIds((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  // Mark Full Title Completed with festive confetti
  const handleMarkCompleted = (item: LibraryItem) => {
    try {
      confetti({
        particleCount: 70,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#E50914', '#ffffff', '#ffd700', '#00ffcc'],
      });
    } catch {
      // ignore
    }
    const totalSeasons = item.totalSeasons || 1;
    const allSeasons = Array.from({ length: totalSeasons }, (_, i) => i + 1);

    const updated: LibraryItem = {
      ...item,
      isCompleted: true,
      viewingStatus: 'completed',
      completedAt: new Date().toISOString(),
      progress: {
        percentage: 100,
        currentEpisode: item.totalEpisodes || item.progress?.currentEpisode || 1,
        currentSeason: totalSeasons,
        completedSeasons: allSeasons,
        watchedMinutes: item.runtimeMinutes || item.progress?.watchedMinutes || 0,
        lastWatchedAt: new Date().toISOString(),
      },
    };
    onUpdateItem(updated);
  };

  // Add title into Still Watching
  const handleAddToWatching = (item: LibraryItem) => {
    const updated: LibraryItem = {
      ...item,
      viewingStatus: 'still_watching',
      isCompleted: false,
      progress: item.progress
        ? {
            ...item.progress,
            percentage: item.progress.percentage || 0,
            lastWatchedAt: new Date().toISOString(),
          }
        : {
            currentSeason: 1,
            currentEpisode: 1,
            completedSeasons: [],
            watchedMinutes: 0,
            percentage: 0,
            lastWatchedAt: new Date().toISOString(),
          },
      updatedAt: new Date().toISOString(),
    };
    onUpdateItem(updated);
  };

  // Handle adding unified search candidate into Still Watching
  const handleAddSearchResult = (result: typeof searchableCandidates[0]) => {
    if (result.source === 'library' && result.libraryItem) {
      handleAddToWatching(result.libraryItem);
      setRecentlyAddedId(result.id);
      setTimeout(() => setRecentlyAddedId(null), 2500);
    } else if (result.source === 'catalog' && result.catalogItem) {
      const disc = result.catalogItem;
      // Check if library already has it
      const existing = items.find(
        (lib) =>
          (disc.netflixId && lib.videoId === disc.netflixId) ||
          (disc.tmdbId && lib.externalId === disc.tmdbId) ||
          (disc.imdbId && lib.imdbId === disc.imdbId) ||
          lib.originalTitle.toLowerCase().trim() === disc.title.toLowerCase().trim()
      );
      if (existing) {
        handleAddToWatching(existing);
      } else if (onAddItem) {
        const newLibItem: LibraryItem = {
          id: 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          originalTitle: disc.title,
          normalizedTitle: disc.title.toLowerCase().trim(),
          videoId: disc.netflixId,
          mediaType: disc.mediaType,
          status: 'matched',
          viewingStatus: 'still_watching',
          externalId: disc.tmdbId,
          externalTitle: disc.title,
          releaseYear: disc.releaseYear,
          releaseDate: disc.releaseDate,
          posterPath: disc.posterPath,
          backdropPath: disc.backdropPath,
          rating: disc.rating,
          imdbRating: disc.imdbRating,
          rottenTomatoesRating: disc.rottenTomatoesRating,
          voteCount: disc.voteCount,
          synopsis: disc.synopsis,
          genres: disc.genres,
          themes: disc.themes,
          countries: disc.countries,
          languages: disc.audioLanguages,
          originalLanguage: disc.originalLanguage,
          runtimeMinutes: disc.runtimeMinutes,
          totalSeasons: disc.totalSeasons,
          totalEpisodes: disc.totalEpisodes,
          director: disc.director,
          creator: disc.creator,
          cast: disc.cast,
          addedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          progress: {
            currentSeason: 1,
            currentEpisode: 1,
            completedSeasons: [],
            watchedMinutes: 0,
            percentage: 0,
            lastWatchedAt: new Date().toISOString(),
          },
        };
        onAddItem(newLibItem);
      }
      setRecentlyAddedId(result.id);
      setTimeout(() => setRecentlyAddedId(null), 2500);
    }
  };

  // Open Movie/Series details modal when clicking any search result title or thumbnail
  const handleOpenSearchTitleDetail = (res: typeof searchableCandidates[0]) => {
    if (onOpenItemDetail) {
      if (res.source === 'library' && res.libraryItem) {
        onOpenItemDetail(res.libraryItem);
      } else if (res.source === 'catalog' && res.catalogItem) {
        onOpenItemDetail(res.catalogItem);
      }
    } else if (res.source === 'library' && res.libraryItem) {
      onOpenDetail(res.libraryItem);
    }
  };

  // Remove from Still Watching (back to unwatched)
  const handleRemoveFromWatching = (item: LibraryItem) => {
    const updated: LibraryItem = {
      ...item,
      viewingStatus: 'unwatched',
    };
    onUpdateItem(updated);
  };

  // Helper to calculate episodes per season
  const getSeasonEpisodeCounts = (item: LibraryItem) => {
    const totalSeasons = Math.max(1, item.totalSeasons || 1);
    const result: Record<number, number> = {};

    if (item.episodes && item.episodes.length > 0) {
      for (const ep of item.episodes) {
        if (ep.seasonNumber > 0) {
          result[ep.seasonNumber] = (result[ep.seasonNumber] || 0) + 1;
        }
      }
    }

    const totalEp = item.totalEpisodes || 10;
    const avgPerSeason = Math.max(1, Math.round(totalEp / totalSeasons));
    for (let s = 1; s <= totalSeasons; s++) {
      if (!result[s]) {
        result[s] = avgPerSeason;
      }
    }

    return result;
  };

  // Overall Series Progress % calculation
  const computeTvOverallPercentage = (
    item: LibraryItem,
    completedSeasons: number[],
    currentSeason: number,
    currentEpisode: number
  ) => {
    const totalEp = item.totalEpisodes || 10;
    const seasonCounts = getSeasonEpisodeCounts(item);
    let watchedCount = 0;

    const completedSet = new Set(completedSeasons);
    const totalSeasons = Math.max(1, item.totalSeasons || 1);

    for (let s = 1; s <= totalSeasons; s++) {
      const epInSeason = seasonCounts[s] || 10;
      if (completedSet.has(s)) {
        watchedCount += epInSeason;
      } else if (s === currentSeason) {
        watchedCount += Math.min(currentEpisode, epInSeason);
      }
    }

    return Math.min(100, Math.round((watchedCount / Math.max(1, totalEp)) * 100));
  };

  // Clicking a Season Box (e.g. Season 4)
  const handleSelectSeason = (item: LibraryItem, seasonNum: number) => {
    const priorSeasons = Array.from({ length: seasonNum - 1 }, (_, i) => i + 1);
    const currentCompleted = item.progress?.completedSeasons || [];
    const newCompletedSeasons = Array.from(new Set([...currentCompleted, ...priorSeasons])).filter(
      (s) => s < seasonNum
    );

    const curEp = item.progress?.currentSeason === seasonNum ? (item.progress?.currentEpisode || 1) : 1;
    const pct = computeTvOverallPercentage(item, newCompletedSeasons, seasonNum, curEp);

    const updated: LibraryItem = {
      ...item,
      progress: {
        ...item.progress,
        currentSeason: seasonNum,
        currentEpisode: curEp,
        completedSeasons: newCompletedSeasons,
        percentage: pct,
        watchedMinutes: item.progress?.watchedMinutes || 0,
        lastWatchedAt: new Date().toISOString(),
      },
    };

    onUpdateItem(updated);

    // Expand slider for this card
    setExpandedCardIds((prev) => ({
      ...prev,
      [item.id]: true,
    }));
  };

  // Clicking the Tick Mark on a Season Box
  const handleToggleSeasonCompleted = (item: LibraryItem, seasonNum: number, e: React.MouseEvent) => {
    e.stopPropagation();

    const currentCompleted = new Set(item.progress?.completedSeasons || []);
    const isCurrentlyDone = currentCompleted.has(seasonNum);
    const totalSeasons = Math.max(1, item.totalSeasons || 1);

    let nextCompleted: number[];
    let nextActiveSeason = item.progress?.currentSeason || 1;
    let nextEpisode = item.progress?.currentEpisode || 1;

    if (isCurrentlyDone) {
      currentCompleted.delete(seasonNum);
      nextCompleted = Array.from(currentCompleted);
      nextActiveSeason = seasonNum;
      nextEpisode = 1;
    } else {
      for (let s = 1; s <= seasonNum; s++) {
        currentCompleted.add(s);
      }
      nextCompleted = Array.from(currentCompleted);

      if (seasonNum < totalSeasons) {
        nextActiveSeason = seasonNum + 1;
        nextEpisode = 1;
      } else {
        handleMarkCompleted(item);
        return;
      }
    }

    const pct = computeTvOverallPercentage(item, nextCompleted, nextActiveSeason, nextEpisode);

    const updated: LibraryItem = {
      ...item,
      progress: {
        ...item.progress,
        currentSeason: nextActiveSeason,
        currentEpisode: nextEpisode,
        completedSeasons: nextCompleted,
        percentage: pct,
        watchedMinutes: item.progress?.watchedMinutes || 0,
        lastWatchedAt: new Date().toISOString(),
      },
    };

    onUpdateItem(updated);
  };

  // Update Episode for TV (within active season)
  const handleUpdateEpisode = (item: LibraryItem, ep: number) => {
    const curSeason = item.progress?.currentSeason || 1;
    const seasonCounts = getSeasonEpisodeCounts(item);
    const maxEpInSeason = seasonCounts[curSeason] || 10;
    const boundedEp = Math.max(1, Math.min(ep, maxEpInSeason));

    const completedSeasons = item.progress?.completedSeasons || [];
    const pct = computeTvOverallPercentage(item, completedSeasons, curSeason, boundedEp);

    const updated: LibraryItem = {
      ...item,
      progress: {
        ...item.progress,
        currentSeason: curSeason,
        currentEpisode: boundedEp,
        completedSeasons,
        percentage: pct,
        watchedMinutes: item.progress?.watchedMinutes || 0,
        lastWatchedAt: new Date().toISOString(),
      },
    };
    onUpdateItem(updated);
  };

  // Update Minutes for Movie
  const handleUpdateMinutes = (item: LibraryItem, minutes: number) => {
    const totalMin = item.runtimeMinutes || 120;
    const boundedMin = Math.max(0, Math.min(minutes, totalMin));
    const pct = Math.round((boundedMin / totalMin) * 100);

    const updated: LibraryItem = {
      ...item,
      progress: {
        ...item.progress,
        watchedMinutes: boundedMin,
        percentage: pct,
        lastWatchedAt: new Date().toISOString(),
      },
    };
    onUpdateItem(updated);
  };

  // Helper for quick episode stepper (+1 / -1)
  const handleStepEpisode = (item: LibraryItem, delta: number) => {
    const curSeason = item.progress?.currentSeason || 1;
    const seasonCounts = getSeasonEpisodeCounts(item);
    const maxEpInSeason = seasonCounts[curSeason] || 10;
    const curEp = item.progress?.currentEpisode || 1;
    const nextEp = curEp + delta;

    if (nextEp > maxEpInSeason) {
      // Completed this season!
      const totalSeasons = Math.max(1, item.totalSeasons || 1);
      if (curSeason < totalSeasons) {
        handleSelectSeason(item, curSeason + 1);
      } else {
        handleMarkCompleted(item);
      }
      return;
    }

    if (nextEp >= 1) {
      handleUpdateEpisode(item, nextEp);
    }
  };

  return (
    <div className="w-full min-h-screen bg-[#141414] text-white pb-24 select-none">
      {/* Ambient Top Glow */}
      <div className="relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-b from-red-600/10 via-blue-600/5 to-transparent blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-4 relative z-10">
          {/* Top Title & Header Navigation Bar */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 text-[#E50914] mb-1.5">
                <Flame className="w-4 h-4 fill-red-500 animate-pulse" />
                <span className="text-xs font-black uppercase tracking-widest text-zinc-400">
                  Live Watch Tracker
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight flex items-center gap-3">
                <span>Still Watching</span>
                <span className="text-sm font-black px-3 py-1 rounded-full bg-red-600/20 text-[#E50914] border border-red-500/30">
                  {stats.total}
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-xl">
                Seamlessly resume shows and films right where you left off. Update episodes and track seasons with precision.
              </p>
            </div>

            {/* Search & Add Movies / Series Trigger */}
            <div className="flex items-center gap-2 self-start md:self-auto relative z-20">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsAddSearchOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold bg-[#E50914] hover:bg-red-700 text-white shadow-xl shadow-red-900/40 hover:shadow-red-700/50 transition-all active:scale-95 group cursor-pointer"
                title="Search movies and series to add to Still Watching"
              >
                <Search className="w-3.5 h-3.5 text-white group-hover:scale-110 transition-transform" />
                <span>Search & Add to Watching</span>
                <Plus className="w-3.5 h-3.5 text-white/80" />
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          {stats.total > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              <div className="bg-zinc-900/60 backdrop-blur-md border border-white/5 p-3.5 rounded-2xl flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                  <Tv className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-base font-black text-white">{stats.seriesCount}</div>
                  <div className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Series In Progress</div>
                </div>
              </div>

              <div className="bg-zinc-900/60 backdrop-blur-md border border-white/5 p-3.5 rounded-2xl flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                  <Film className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-base font-black text-white">{stats.movieCount}</div>
                  <div className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Movies Started</div>
                </div>
              </div>

              <div className="bg-zinc-900/60 backdrop-blur-md border border-white/5 p-3.5 rounded-2xl flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-base font-black text-white">{stats.avgProgress}%</div>
                  <div className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Average Progress</div>
                </div>
              </div>

              <div className="bg-zinc-900/60 backdrop-blur-md border border-white/5 p-3.5 rounded-2xl flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                  <Flame className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <div className="text-base font-black text-white">{stats.almostDoneCount}</div>
                  <div className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Near Finish (&gt;75%)</div>
                </div>
              </div>
            </div>
          )}

          {/* Spotlight Hero: Quick Resume Banner (Auto-rotates every 10s across 10 cards, with Prev/Next controls) */}
          {spotlightItem && (
            <div
              onMouseEnter={() => setIsSpotlightPaused(true)}
              onMouseLeave={() => setIsSpotlightPaused(false)}
              className="relative rounded-3xl overflow-hidden border border-white/10 mb-8 bg-zinc-950 shadow-2xl group transition-all"
            >
              <style>{`
                @keyframes spotlightTimerBar {
                  0% { width: 0%; }
                  100% { width: 100%; }
                }
              `}</style>

              {/* Background Backdrop with Gradient Overlays */}
              <div key={spotlightItem.id + '-backdrop'} className="absolute inset-0 z-0 animate-in fade-in duration-500 overflow-hidden">
                <CachedImage
                  src={spotlightItem.backdropPath || spotlightItem.posterPath}
                  fallbackSrc={spotlightItem.posterPath}
                  alt={spotlightItem.externalTitle || spotlightItem.originalTitle}
                  className="w-full h-full object-cover object-top opacity-30 group-hover:scale-105 transition-transform duration-700 ease-out"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-[#141414]/90 to-transparent pointer-events-none" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-[#141414]/50 pointer-events-none" />
              </div>

              {/* Top Banner Navigation Header */}
              <div className="relative z-10 px-5 pt-4 sm:px-8 sm:pt-6 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#E50914] text-white uppercase tracking-wider shadow-sm flex items-center gap-1.5">
                    <Flame className="w-3 h-3 fill-white" />
                    <span>Jump Back In</span>
                  </span>

                  <span className="text-xs text-zinc-400 font-semibold">
                    {spotlightItem.mediaType === 'tv' ? 'Series' : 'Movie'}
                  </span>

                  {spotlightItem.imdbRating && (
                    <span className="flex items-center gap-1 text-xs font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
                      <Star className="w-3 h-3 fill-amber-400" />
                      {spotlightItem.imdbRating}
                    </span>
                  )}

                  {/* Card position counter */}
                  <span className="text-xs font-mono text-zinc-400 bg-black/50 px-2.5 py-0.5 rounded-full border border-white/5">
                    {activeSpotlightIndex + 1} of {spotlightItems.length}
                  </span>
                </div>

                {/* Forward & Backward Navigation Arrows */}
                {spotlightItems.length > 1 && (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline">
                      {isSpotlightPaused ? 'PAUSED' : 'AUTO 10S'}
                    </span>
                    <button
                      type="button"
                      onClick={handlePrevSpotlight}
                      className="p-1.5 sm:p-2 rounded-full bg-black/60 hover:bg-[#E50914] text-zinc-300 hover:text-white border border-white/10 transition-all active:scale-90 cursor-pointer shadow-md"
                      title="Previous Card"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleNextSpotlight}
                      className="p-1.5 sm:p-2 rounded-full bg-black/60 hover:bg-[#E50914] text-zinc-300 hover:text-white border border-white/10 transition-all active:scale-90 cursor-pointer shadow-md"
                      title="Next Card"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Main Banner Content */}
              <div key={spotlightItem.id + '-content'} className="relative z-10 p-5 sm:p-8 pt-3 sm:pt-4 flex flex-col md:flex-row md:items-center justify-between gap-6 animate-in fade-in duration-300">
                <div className="max-w-2xl space-y-3">
                  <h2
                    onClick={() => onOpenDetail(spotlightItem)}
                    className="text-2xl sm:text-3xl lg:text-4xl font-black text-white hover:text-red-400 cursor-pointer transition-colors tracking-tight line-clamp-1"
                  >
                    {spotlightItem.externalTitle || spotlightItem.originalTitle}
                  </h2>

                  {spotlightItem.synopsis && (
                    <p className="text-xs sm:text-sm text-zinc-300 line-clamp-2 max-w-xl font-normal leading-relaxed">
                      {spotlightItem.synopsis}
                    </p>
                  )}

                  {/* Progress Line */}
                  <div className="pt-2 max-w-md space-y-1.5">
                    <div className="flex justify-between items-center text-xs font-bold">
                      <span className="text-zinc-300">
                        {spotlightItem.mediaType === 'tv' ? (
                          <>Season {spotlightItem.progress?.currentSeason || 1} • Episode {spotlightItem.progress?.currentEpisode || 1}</>
                        ) : (
                          <>{spotlightItem.progress?.watchedMinutes || 0} / {spotlightItem.runtimeMinutes || 120} mins</>
                        )}
                      </span>
                      <span className="text-red-500 font-mono">
                        {spotlightItem.progress?.percentage || 0}% Complete
                      </span>
                    </div>
                    <div className="w-full h-2 bg-zinc-800/80 rounded-full overflow-hidden border border-white/5">
                      <div
                        className="h-full bg-gradient-to-r from-red-600 via-orange-500 to-amber-400 rounded-full transition-all duration-500"
                        style={{ width: `${spotlightItem.progress?.percentage || 0}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* CTAs */}
                <div className="flex items-center gap-3 shrink-0">
                  <a
                    href={getNetflixUrl(spotlightItem)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => openNetflixInNewTab(getNetflixUrl(spotlightItem), e)}
                    className="flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold bg-[#E50914] text-white hover:bg-red-700 transition-all shadow-xl shadow-red-900/40 transform active:scale-95"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>Resume on Netflix</span>
                  </a>

                  <button
                    onClick={() => onOpenDetail(spotlightItem)}
                    className="flex items-center gap-2 px-4 py-3 rounded-full text-sm font-semibold bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 border border-white/10 transition-colors cursor-pointer"
                  >
                    <Eye className="w-4 h-4" />
                    <span className="hidden sm:inline">Details</span>
                  </button>
                </div>
              </div>

              {/* Bottom Carousel Pagination Dots */}
              {spotlightItems.length > 1 && (
                <div className="relative z-10 px-5 sm:px-8 pb-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1.5">
                    {spotlightItems.map((item, idx) => (
                      <button
                        key={item.id + '-dot-' + idx}
                        onClick={() => setSpotlightIndex(idx)}
                        className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                          idx === activeSpotlightIndex
                            ? 'w-6 bg-[#E50914]'
                            : 'w-2 bg-white/20 hover:bg-white/40'
                        }`}
                        title={`Go to ${item.externalTitle || item.originalTitle} (${idx + 1}/${spotlightItems.length})`}
                      />
                    ))}
                  </div>

                  <span className="text-[11px] text-zinc-500 font-mono hidden sm:inline">
                    Changes every 10s • Click arrows or dots to navigate
                  </span>
                </div>
              )}

              {/* 10-Second Auto-Rotation Progress Bar */}
              {spotlightItems.length > 1 && (
                <div className="w-full h-1 bg-white/5 overflow-hidden">
                  <div
                    key={`${activeSpotlightIndex}-${isSpotlightPaused}`}
                    className="h-full bg-gradient-to-r from-red-600 to-amber-500"
                    style={{
                      animation: !isSpotlightPaused ? 'spotlightTimerBar 10s linear infinite' : 'none',
                      width: isSpotlightPaused ? '100%' : undefined,
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Controls Bar: Filter Pills + Search + Sort */}
          <div className="bg-zinc-900/70 backdrop-blur-xl p-3 sm:p-4 rounded-2xl border border-white/5 flex flex-col lg:flex-row items-center justify-between gap-4 mb-6 shadow-xl">
            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto w-full lg:w-auto scrollbar-none pb-1 lg:pb-0">
              <button
                onClick={() => setFilterCategory('all')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                  filterCategory === 'all'
                    ? 'bg-[#E50914] text-white shadow-md shadow-red-900/30'
                    : 'bg-zinc-800/60 text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                All ({watchingItems.length})
              </button>
              <button
                onClick={() => setFilterCategory('tv')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                  filterCategory === 'tv'
                    ? 'bg-[#E50914] text-white shadow-md shadow-red-900/30'
                    : 'bg-zinc-800/60 text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <Tv className="w-3.5 h-3.5" />
                <span>Series ({stats.seriesCount})</span>
              </button>
              <button
                onClick={() => setFilterCategory('movie')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                  filterCategory === 'movie'
                    ? 'bg-[#E50914] text-white shadow-md shadow-red-900/30'
                    : 'bg-zinc-800/60 text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                <span>Movies ({stats.movieCount})</span>
              </button>
              <button
                onClick={() => setFilterCategory('almost_done')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                  filterCategory === 'almost_done'
                    ? 'bg-[#E50914] text-white shadow-md shadow-red-900/30'
                    : 'bg-zinc-800/60 text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                <span>Almost Done ({stats.almostDoneCount})</span>
              </button>
            </div>

            {/* Search and Sort */}
            <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-end">
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search in-progress titles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-1.5 bg-black/50 border border-zinc-700/80 rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-red-500 transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-400 hidden sm:block" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as StillSortOption)}
                  className="bg-black/50 border border-zinc-700/80 rounded-xl px-3 py-1.5 text-xs text-zinc-200 font-semibold focus:outline-none focus:border-red-500 cursor-pointer"
                >
                  <option value="recently_watched" className="bg-zinc-900 text-white">Recently Watched</option>
                  <option value="progress" className="bg-zinc-900 text-white">Highest Progress</option>
                  <option value="recently_added" className="bg-zinc-900 text-white">Recently Added</option>
                  <option value="alphabetical" className="bg-zinc-900 text-white">A - Z</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid View */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {displayItems.length === 0 ? (
          <div className="py-24 text-center space-y-4 bg-zinc-900/30 border border-white/5 rounded-3xl max-w-xl mx-auto p-8">
            <div className="w-14 h-14 rounded-full bg-red-600/10 border border-red-500/20 flex items-center justify-center mx-auto text-[#E50914]">
              <Play className="w-6 h-6 fill-red-500" />
            </div>
            <h3 className="text-lg font-bold text-white">No titles match your filter</h3>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
              {searchQuery
                ? `No titles found matching "${searchQuery}". Clear your search or filter.`
                : 'You have no titles currently in Still Watching. Search and pick any movie or series to start tracking right away.'}
            </p>
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="px-4 py-2 rounded-full text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
              >
                Clear Search
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsAddSearchOpen(true);
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold bg-[#E50914] hover:bg-red-700 text-white shadow-lg shadow-red-900/40 transition-all active:scale-95 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Search & Add Movies or Series</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
            {displayItems.map((item) => {
              const isTV = item.mediaType === 'tv';
              const progress: WatchProgress = item.progress || { percentage: 0, watchedMinutes: 0 };
              const pct = progress.percentage || 0;
              const isExpanded = !!expandedCardIds[item.id];

              const totalSeasons = Math.max(1, item.totalSeasons || 1);
              const completedSeasonsSet = new Set(progress.completedSeasons || []);
              const currentSeason = progress.currentSeason || 1;
              const currentEpisode = progress.currentEpisode || 1;

              const seasonCounts = isTV ? getSeasonEpisodeCounts(item) : {};
              const episodesInActiveSeason = seasonCounts[currentSeason] || 10;

              // Remaining runtime calculation
              let remainingText = '';
              if (isTV) {
                const totalEp = item.totalEpisodes || 10;
                let watchedEps = 0;
                for (let s = 1; s <= totalSeasons; s++) {
                  const count = seasonCounts[s] || 10;
                  if (completedSeasonsSet.has(s)) {
                    watchedEps += count;
                  } else if (s === currentSeason) {
                    watchedEps += Math.min(currentEpisode, count);
                  }
                }
                const remainingEp = Math.max(0, totalEp - watchedEps);
                const perEp = item.averageEpisodeMinutes || item.runtimeMinutes || 45;
                remainingText = `${formatRuntime(remainingEp * perEp)} left (${remainingEp} eps)`;
              } else {
                const totalMin = item.runtimeMinutes || 120;
                const watched = progress.watchedMinutes || 0;
                const left = Math.max(0, totalMin - watched);
                remainingText = `${formatRuntime(left)} remaining`;
              }

              return (
                <div
                  key={item.id}
                  className="bg-zinc-900/80 hover:bg-zinc-900 border border-white/10 hover:border-zinc-700 rounded-3xl p-5 flex flex-col space-y-4 shadow-xl hover:shadow-2xl hover:shadow-black/60 transition-all duration-300 group"
                >
                  {/* Poster & Header Meta */}
                  <div className="flex gap-4 items-start">
                    {/* Poster with Hover Zoom */}
                    <div
                      onClick={() => onOpenDetail(item)}
                      className="w-20 h-28 sm:w-24 sm:h-32 rounded-2xl overflow-hidden bg-zinc-800 shrink-0 border border-white/10 cursor-pointer relative shadow-md group/poster flex items-center justify-center"
                    >
                      <CachedImage
                        src={item.posterPath}
                        fallbackSrc={item.backdropPath}
                        alt={item.externalTitle || item.originalTitle}
                        className="w-full h-full object-cover group-hover/poster:scale-108 transition-transform duration-500 ease-out"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/poster:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                        <Eye className="w-6 h-6 text-white drop-shadow" />
                      </div>
                    </div>

                    {/* Information */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-red-600/15 text-[#E50914] border border-red-500/20">
                            {isTV ? 'Series' : 'Movie'}
                          </span>
                          {item.releaseYear && (
                            <span className="text-[11px] text-zinc-400 font-medium font-mono">
                              {item.releaseYear}
                            </span>
                          )}
                        </div>

                        {item.imdbRating && (
                          <span className="text-xs text-amber-400 flex items-center gap-0.5 font-bold">
                            <Star className="w-3 h-3 fill-amber-400" />
                            {item.imdbRating}
                          </span>
                        )}
                      </div>

                      <h3
                        onClick={() => onOpenDetail(item)}
                        className="text-base font-bold text-white hover:text-red-400 transition-colors line-clamp-1 cursor-pointer tracking-tight"
                        title={item.externalTitle || item.originalTitle}
                      >
                        {item.externalTitle || item.originalTitle}
                      </h3>

                      <p className="text-xs text-zinc-300 font-semibold flex items-center gap-1.5">
                        {isTV ? (
                          <>
                            <span className="text-white">Season {currentSeason}</span>
                            <span className="text-zinc-500">•</span>
                            <span className="text-zinc-400">Ep {currentEpisode} of {episodesInActiveSeason}</span>
                          </>
                        ) : (
                          <>
                            <span>{progress.watchedMinutes || 0}m</span>
                            <span className="text-zinc-500">/</span>
                            <span>{item.runtimeMinutes || 120}m</span>
                          </>
                        )}
                      </p>

                      <p className="text-[11px] text-zinc-400 flex items-center gap-1 font-medium pt-0.5">
                        <Clock className="w-3 h-3 text-zinc-500 shrink-0" />
                        <span className="line-clamp-1">{remainingText}</span>
                      </p>
                    </div>
                  </div>

                  {/* TV Seasons Selector Grid */}
                  {isTV && totalSeasons > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between items-center text-[10px] text-zinc-400 uppercase font-bold tracking-wider">
                        <span>Seasons</span>
                        <span className="text-zinc-500">{totalSeasons} total</span>
                      </div>

                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1 scrollbar-thin">
                        {Array.from({ length: totalSeasons }, (_, i) => i + 1).map((sNum) => {
                          const isDone = completedSeasonsSet.has(sNum);
                          const isCurrent = currentSeason === sNum && !isDone;

                          return (
                            <div
                              key={sNum}
                              onClick={() => handleSelectSeason(item, sNum)}
                              className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold cursor-pointer transition-all border ${
                                isDone
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  : isCurrent
                                  ? 'bg-red-600 text-white border-red-500 shadow-md shadow-red-900/40'
                                  : 'bg-zinc-800/60 text-zinc-400 border-white/5 hover:bg-zinc-800 hover:text-white'
                              }`}
                              title={isDone ? `Season ${sNum} Completed` : `Jump to Season ${sNum}`}
                            >
                              <span>S{sNum}</span>

                              {/* Tick Mark Checkbox */}
                              <button
                                type="button"
                                onClick={(e) => handleToggleSeasonCompleted(item, sNum, e)}
                                className={`p-0.5 rounded transition-transform hover:scale-125 ${
                                  isDone
                                    ? 'text-emerald-400'
                                    : isCurrent
                                    ? 'text-red-200 hover:text-white'
                                    : 'text-zinc-500 hover:text-emerald-400'
                                }`}
                                title={isDone ? 'Mark season incomplete' : 'Mark season complete'}
                              >
                                <CheckCircle2 className={`w-3.5 h-3.5 ${isDone ? 'fill-emerald-500/20' : ''}`} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Overall Progress Bar + Toggle Expansion */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between items-center text-xs font-bold">
                      <span className="text-zinc-400">Total Completion</span>
                      <span className="text-red-400 font-mono font-bold">{pct}%</span>
                    </div>

                    <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden border border-white/5 relative">
                      <div
                        className="h-full bg-gradient-to-r from-red-600 via-orange-500 to-amber-400 rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Tactile Quick Stepper & Slider Drawer */}
                  <div className="bg-black/50 p-3.5 rounded-2xl border border-white/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                        {isTV ? (
                          <>
                            <Tv className="w-3.5 h-3.5 text-red-500" />
                            <span>Season {currentSeason} Episodes</span>
                          </>
                        ) : (
                          <>
                            <Film className="w-3.5 h-3.5 text-red-500" />
                            <span>Runtime Watched</span>
                          </>
                        )}
                      </span>

                      {/* Episode Quick Steppers (+1 / -1) */}
                      {isTV ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleStepEpisode(item, -1)}
                            disabled={currentEpisode <= 1}
                            className="w-6 h-6 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-zinc-200 flex items-center justify-center transition-colors"
                            title="Previous Episode"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-mono font-bold text-white px-1">
                            Ep {currentEpisode} / {episodesInActiveSeason}
                          </span>
                          <button
                            onClick={() => handleStepEpisode(item, 1)}
                            className="w-6 h-6 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center justify-center transition-colors"
                            title="Next Episode"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs font-mono font-bold text-white">
                          {progress.watchedMinutes || 0}m / {item.runtimeMinutes || 120}m
                        </span>
                      )}
                    </div>

                    {/* Interactive Slider */}
                    <div>
                      {isTV ? (
                        <input
                          type="range"
                          min={1}
                          max={episodesInActiveSeason}
                          value={currentEpisode}
                          onChange={(e) => handleUpdateEpisode(item, parseInt(e.target.value))}
                          className="w-full accent-red-600 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                        />
                      ) : (
                        <input
                          type="range"
                          min={0}
                          max={item.runtimeMinutes || 120}
                          value={progress.watchedMinutes || 0}
                          onChange={(e) => handleUpdateMinutes(item, parseInt(e.target.value))}
                          className="w-full accent-red-600 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                        />
                      )}
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                    <div className="flex items-center gap-2">
                      <a
                        href={getNetflixUrl(item)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => openNetflixInNewTab(getNetflixUrl(item), e)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#E50914] text-white hover:bg-red-700 transition-colors shadow-sm active:scale-95"
                        title="Resume on Netflix in new tab"
                      >
                        <Play className="w-3.5 h-3.5 fill-white" />
                        <span>Watch</span>
                      </a>

                      <button
                        onClick={() => handleMarkCompleted(item)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors active:scale-95"
                        title="Mark Finished"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Finish</span>
                      </button>

                      <button
                        onClick={() => onOpenDropModal(item)}
                        className="p-1.5 rounded-xl text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Drop title"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <button
                      onClick={() => handleRemoveFromWatching(item)}
                      className="text-[11px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
                      title="Move back to Unwatched list"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Search & Add Movies / Series Modal */}
      {isAddSearchOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fade-in"
          onClick={() => {
            setIsAddSearchOpen(false);
            setAddSearchQuery('');
          }}
        >
          <div
            className="w-full max-w-3xl max-h-[85vh] bg-[#141414] border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between gap-3 bg-zinc-950/80">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-[#E50914]">
                  <Search className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
                    <span>Add to Still Watching</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 uppercase">
                      Live Search
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Search movies & series from your library and Netflix catalog to track right away.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsAddSearchOpen(false);
                  setAddSearchQuery('');
                }}
                className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input Bar + Filter Pills */}
            <div className="p-4 sm:p-5 border-b border-white/5 bg-zinc-900/50 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Type title, actor, or genre (e.g. Stranger Things, Dark, Tenet, RRR)..."
                  value={addSearchQuery}
                  onChange={(e) => setAddSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-9 py-2.5 bg-black/60 border border-zinc-700/80 rounded-2xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/30 transition-all"
                />
                {addSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setAddSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setAddFilterType('all')}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    addFilterType === 'all'
                      ? 'bg-[#E50914] text-white shadow-sm'
                      : 'bg-zinc-800/70 text-zinc-400 hover:text-white'
                  }`}
                >
                  All Titles
                </button>
                <button
                  type="button"
                  onClick={() => setAddFilterType('tv')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    addFilterType === 'tv'
                      ? 'bg-[#E50914] text-white shadow-sm'
                      : 'bg-zinc-800/70 text-zinc-400 hover:text-white'
                  }`}
                >
                  <Tv className="w-3 h-3" />
                  <span>Series Only</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAddFilterType('movie')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    addFilterType === 'movie'
                      ? 'bg-[#E50914] text-white shadow-sm'
                      : 'bg-zinc-800/70 text-zinc-400 hover:text-white'
                  }`}
                >
                  <Film className="w-3 h-3" />
                  <span>Movies Only</span>
                </button>

                <span className="ml-auto text-[11px] text-zinc-400 font-mono font-medium">
                  {filteredAddResults.length} titles available
                </span>
              </div>
            </div>

            {/* Results List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5 divide-y divide-white/5">
              {displayedAddResults.length === 0 ? (
                <div className="py-16 text-center text-zinc-400 space-y-2">
                  <Film className="w-8 h-8 mx-auto text-zinc-600" />
                  <p className="text-sm font-semibold text-zinc-300">
                    No titles found matching "{addSearchQuery}"
                  </p>
                  <p className="text-xs text-zinc-500">
                    Try another keyword, actor name, or clear the search.
                  </p>
                </div>
              ) : (
                displayedAddResults.map((res) => {
                  const isWatchingNow = res.isAlreadyWatching;
                  const justAdded = recentlyAddedId === res.id;

                  return (
                    <div
                      key={res.id}
                      className="pt-2.5 first:pt-0 flex items-center justify-between gap-3 p-2.5 rounded-2xl hover:bg-white/5 transition-all group"
                    >
                      {/* Left: Thumbnail & Details (Click anywhere here to open Movie/Series Modal) */}
                      <div
                        onClick={() => handleOpenSearchTitleDetail(res)}
                        className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer group/title"
                        title={`Click to view ${res.title} details, trailer & cast`}
                      >
                        <div className="relative w-12 h-16 sm:w-14 sm:h-20 rounded-xl overflow-hidden shrink-0 shadow-md border border-white/10 group-hover/title:border-red-500/60 transition-all bg-zinc-800 flex items-center justify-center">
                          <CachedImage
                            src={res.posterPath}
                            alt={res.title}
                            className="w-full h-full object-cover group-hover/title:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/title:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                            <Eye className="w-4 h-4 text-white drop-shadow" />
                          </div>
                        </div>

                        <div className="min-w-0 space-y-1 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-white group-hover/title:text-red-400 group-hover/title:underline underline-offset-2 transition-colors truncate">
                              {res.title}
                            </span>
                            {res.releaseYear && (
                              <span className="text-[11px] text-zinc-400 font-medium">
                                ({res.releaseYear})
                              </span>
                            )}
                            <span
                              className={`text-[10px] font-bold px-2 py-0.2 rounded-full uppercase ${
                                res.mediaType === 'tv'
                                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                  : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              }`}
                            >
                              {res.mediaType === 'tv' ? 'Series' : 'Movie'}
                            </span>
                            {res.imdbRating && (
                              <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.2 rounded-full">
                                <Star className="w-2.5 h-2.5 fill-amber-400" />
                                {res.imdbRating}
                              </span>
                            )}
                            {res.source === 'library' && (
                              <span className="text-[10px] font-medium text-emerald-400/80 bg-emerald-500/10 px-1.5 py-0.2 rounded-full border border-emerald-500/20">
                                In Library
                              </span>
                            )}
                          </div>

                          {res.genres && res.genres.length > 0 && (
                            <p className="text-[11px] text-zinc-400 truncate">
                              {res.genres.slice(0, 3).join(' • ')}
                            </p>
                          )}

                          {res.synopsis && (
                            <p className="text-xs text-zinc-400 line-clamp-1 hidden sm:block font-normal">
                              {res.synopsis}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right: Actions (View Details & Trailer Modal Button + Add to Watching Button) */}
                      <div className="shrink-0 pl-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenSearchTitleDetail(res)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer text-xs"
                          title="Open full movie/series modal"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span className="hidden md:inline">Details</span>
                        </button>

                        {justAdded ? (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-bold animate-in fade-in">
                            <Check className="w-3.5 h-3.5" />
                            <span>Added!</span>
                          </div>
                        ) : isWatchingNow ? (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-400 text-xs font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5 text-zinc-500" />
                            <span>Watching</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAddSearchResult(res)}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#E50914] hover:bg-red-700 text-white shadow-md shadow-red-900/30 hover:shadow-red-700/40 transition-all active:scale-95 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Add to Watching</span>
                            <span className="sm:hidden">Add</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {/* Load more button when catalog has more matches */}
              {filteredAddResults.length > visibleResultsCount && (
                <div className="pt-3 pb-2 text-center">
                  <button
                    type="button"
                    onClick={() => setVisibleResultsCount((prev) => prev + 50)}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white transition-all border border-white/10 shadow-md cursor-pointer"
                  >
                    Load More Titles ({filteredAddResults.length - visibleResultsCount} more)
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 border-t border-white/5 bg-zinc-950/80 flex items-center justify-between text-xs text-zinc-500">
              <span>Tip: Added titles appear instantly in your in-progress list</span>
              <button
                type="button"
                onClick={() => {
                  setIsAddSearchOpen(false);
                  setAddSearchQuery('');
                }}
                className="px-4 py-1.5 rounded-full text-xs font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};