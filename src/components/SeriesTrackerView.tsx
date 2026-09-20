import React, { useState, useMemo } from 'react';
import {
  Search,
  CheckCircle2,
  Star,
  Clock,
  Calendar,
  Film,
  Tv,
  Plus,
  Trash2,
  Award,
  Play,
  BookmarkCheck,
  RotateCw,
  X,
  Sparkles,
  Dice5,
  SlidersHorizontal,
  Flame,
  Check,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { AppSettings, LibraryItem } from '../types';
import { formatRuntime, calculateSeriesRuntime } from '../services/analytics';
import { searchTMDB, enrichLibraryItem } from '../services/tmdb';
import { getNetflixUrl } from '../services/normalizer';

interface SeriesTrackerViewProps {
  items: LibraryItem[];
  settings: AppSettings;
  onUpdateItem: (item: LibraryItem) => void;
  onAddNewItem: (item: LibraryItem) => void;
  onOpenDetail?: (item: LibraryItem) => void;
}

export const SeriesTrackerView: React.FC<SeriesTrackerViewProps> = ({
  items,
  settings,
  onUpdateItem,
  onAddNewItem,
  onOpenDetail,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState<'all' | 'unrated' | '5' | '4' | '3' | '2' | '1'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'movie' | 'tv'>('all');
  const [isSearchingExternal, setIsSearchingExternal] = useState(false);
  const [externalCandidates, setExternalCandidates] = useState<any[]>([]);
  const [roulettePick, setRoulettePick] = useState<LibraryItem | null>(null);
  const [isRolling, setIsRolling] = useState(false);

  // Completed items list
  const completedItems = useMemo(() => {
    return items
      .filter((i) => i.isCompleted)
      .sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime());
  }, [items]);

  // Will Watch Again items (subset of completedItems with willWatchAgain: true)
  const willWatchAgainItems = useMemo(() => {
    return completedItems.filter((i) => i.willWatchAgain);
  }, [completedItems]);

  // Total stats for completed items
  const stats = useMemo(() => {
    let moviesCount = 0;
    let seriesCount = 0;
    let totalMinutesInvested = 0;
    const genreMap: Record<string, number> = {};

    completedItems.forEach((item) => {
      if (item.mediaType === 'movie') {
        moviesCount++;
        totalMinutesInvested += item.timeInvestedMinutes || item.runtimeMinutes || 110;
      } else {
        seriesCount++;
        if (item.timeInvestedMinutes && item.timeInvestedMinutes > 0) {
          totalMinutesInvested += item.timeInvestedMinutes;
        } else {
          const breakdown = calculateSeriesRuntime(item, settings.maxEpisodesPerSeries, settings.capSeriesEpisodes);
          totalMinutesInvested += breakdown.includedRuntimeMinutes || (breakdown.totalEpisodes * 45);
        }
      }

      // Tally genres
      (item.genres || []).forEach((g) => {
        genreMap[g] = (genreMap[g] || 0) + 1;
      });
    });

    const topGenres = Object.entries(genreMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name, count]) => ({ name, count }));

    const hours = Math.round(totalMinutesInvested / 60);

    return {
      moviesCount,
      seriesCount,
      totalHours: hours,
      topGenres,
    };
  }, [completedItems, settings.maxEpisodesPerSeries, settings.capSeriesEpisodes]);

  // Filtered completed items for display
  const filteredCompletedItems = useMemo(() => {
    let res = completedItems;

    // Filter by rating
    if (ratingFilter !== 'all') {
      if (ratingFilter === 'unrated') {
        res = res.filter((i) => !i.userStarRating);
      } else {
        const targetStars = parseInt(ratingFilter, 10);
        res = res.filter((i) => i.userStarRating === targetStars);
      }
    }

    // Filter by type
    if (typeFilter !== 'all') {
      res = res.filter((i) => i.mediaType === typeFilter);
    }

    // Filter by search query within completed
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      res = res.filter(
        (i) =>
          i.originalTitle.toLowerCase().includes(q) ||
          i.externalTitle?.toLowerCase().includes(q) ||
          (i.genres || []).some((g) => g.toLowerCase().includes(q))
      );
    }

    return res;
  }, [completedItems, ratingFilter, typeFilter, searchQuery]);

  // Toggle Will Watch Again
  const handleToggleWillWatchAgain = (item: LibraryItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const updated: LibraryItem = {
      ...item,
      willWatchAgain: !item.willWatchAgain,
      updatedAt: new Date().toISOString(),
    };
    onUpdateItem(updated);
  };

  // Handle Mark Done toggle
  const handleToggleDone = (item: LibraryItem) => {
    const isNowDone = !item.isCompleted;
    const now = new Date().toISOString();

    let timeInvested = item.timeInvestedMinutes;
    if (!timeInvested || timeInvested <= 0) {
      if (item.mediaType === 'movie') {
        timeInvested = item.runtimeMinutes || 110;
      } else {
        const breakdown = calculateSeriesRuntime(item, settings.maxEpisodesPerSeries, settings.capSeriesEpisodes);
        timeInvested = breakdown.includedRuntimeMinutes || (breakdown.totalEpisodes * 45);
      }
    }

    const updated: LibraryItem = {
      ...item,
      isCompleted: isNowDone,
      viewingStatus: isNowDone ? 'completed' : (item.progress && item.progress.percentage > 0 ? 'still_watching' : 'unwatched'),
      completedAt: isNowDone ? now : undefined,
      userStarRating: isNowDone ? (item.userStarRating || 5) : item.userStarRating,
      timeInvestedMinutes: timeInvested,
      progress: !isNowDone && item.progress ? {
        ...item.progress,
        percentage: item.progress.percentage === 100 ? 0 : item.progress.percentage,
      } : item.progress,
      updatedAt: now,
    };

    onUpdateItem(updated);

    if (isNowDone) {
      try {
        confetti({
          particleCount: 70,
          spread: 50,
          origin: { y: 0.6 },
        });
      } catch {}
    }
  };

  // Handle 5-star rating click
  const handleRate = (item: LibraryItem, rating: number) => {
    const updated: LibraryItem = {
      ...item,
      userStarRating: rating,
      updatedAt: new Date().toISOString(),
    };
    onUpdateItem(updated);
  };

  // Live search across local library
  const localSearchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return items.filter(
      (i) =>
        i.originalTitle.toLowerCase().includes(q) ||
        i.externalTitle?.toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  // Trigger online external search if not found in library
  const handleExternalSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearchingExternal(true);
    try {
      const candidates = await searchTMDB(searchQuery.trim(), settings.tmdbApiKey);
      setExternalCandidates(candidates);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearchingExternal(false);
    }
  };

  // Add new external title as completed directly
  const handleAddExternalAsDone = async (candidate: any) => {
    const rawTitle = candidate.title || candidate.name;
    const baseItem: LibraryItem = {
      id: 'item_' + Math.random().toString(36).slice(2, 9) + '_' + Date.now(),
      originalTitle: rawTitle,
      normalizedTitle: rawTitle.toLowerCase().trim(),
      mediaType: candidate.mediaType || 'tv',
      status: 'matched',
      externalId: candidate.id,
      externalTitle: rawTitle,
      posterPath: candidate.posterPath,
      backdropPath: candidate.backdropPath,
      rating: candidate.rating,
      imdbRating: candidate.imdbRating,
      rottenTomatoesRating: candidate.rottenTomatoesRating,
      synopsis: candidate.overview,
      releaseYear: candidate.releaseYear,
      isCompleted: true,
      completedAt: new Date().toISOString(),
      userStarRating: 5,
      timeInvestedMinutes: candidate.mediaType === 'movie' ? 120 : 360,
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const enriched = await enrichLibraryItem(
      baseItem,
      settings.tmdbApiKey,
      settings.maxEpisodesPerSeries,
      settings.capSeriesEpisodes
    );

    onAddNewItem(enriched);
    setSearchQuery('');
    setExternalCandidates([]);

    try {
      confetti({ particleCount: 80, spread: 60 });
    } catch {}
  };

  // Fun Feature: "Rewatch Roulette" random picker from completed or will watch again titles
  const handleRewatchRoulette = () => {
    const pool = willWatchAgainItems.length > 0 ? willWatchAgainItems : completedItems;
    if (pool.length === 0) return;
    setIsRolling(true);
    let count = 0;
    const interval = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * pool.length);
      setRoulettePick(pool[randomIndex]);
      count++;
      if (count > 10) {
        clearInterval(interval);
        setIsRolling(false);
        try {
          confetti({ particleCount: 60, spread: 55, origin: { y: 0.5 } });
        } catch {}
      }
    }, 100);
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 lg:px-8 space-y-8 animate-in fade-in duration-300">
      {/* Header Banner & Stats Counters */}
      <div className="rounded-3xl bg-gradient-to-r from-neutral-900 via-[#1c1c1e] to-black border border-white/10 p-6 sm:p-8 shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold uppercase">
            <Award className="w-3.5 h-3.5" />
            <span>Completed Watchlist & Series Tracker</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Completed Library & Trackers
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 max-w-xl">
            Keep track of finished movies and series, view total hours watched, filter by star ratings, and pin titles to rewatch anytime.
          </p>
        </div>

        {/* Counters Grid */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full md:w-auto flex-shrink-0">
          <div className="bg-black/40 px-3 sm:px-4 py-3 rounded-2xl border border-white/10 text-center">
            <span className="text-[10px] text-gray-400 block uppercase font-bold tracking-wider">Hours Watched</span>
            <span className="text-xl sm:text-2xl font-black text-amber-400 font-mono flex items-center justify-center gap-1">
              <Clock className="w-4 h-4 text-amber-400" />
              {stats.totalHours}h
            </span>
          </div>

          <div className="bg-black/40 px-3 sm:px-4 py-3 rounded-2xl border border-white/10 text-center">
            <span className="text-[10px] text-gray-400 block uppercase font-bold tracking-wider">Series Watched</span>
            <span className="text-xl sm:text-2xl font-black text-purple-400 font-mono flex items-center justify-center gap-1">
              <Tv className="w-4 h-4 text-purple-400" />
              {stats.seriesCount}
            </span>
          </div>

          <div className="bg-black/40 px-3 sm:px-4 py-3 rounded-2xl border border-white/10 text-center">
            <span className="text-[10px] text-gray-400 block uppercase font-bold tracking-wider">Movies Watched</span>
            <span className="text-xl sm:text-2xl font-black text-emerald-400 font-mono flex items-center justify-center gap-1">
              <Film className="w-4 h-4 text-emerald-400" />
              {stats.moviesCount}
            </span>
          </div>
        </div>
      </div>

      {/* Top Favorite Genres & Rewatch Roulette Fun Feature */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Favorite Genres Card */}
        <div className="md:col-span-2 bg-[#1c1c1e] p-5 rounded-3xl border border-white/10 shadow-lg flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-[#E50914]" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Your Favorite Genres</h3>
            </div>
            <span className="text-[11px] text-gray-400">Based on completed titles</span>
          </div>

          {stats.topGenres.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {stats.topGenres.map((g, idx) => (
                <div
                  key={g.name}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-white"
                >
                  <span className={`w-2 h-2 rounded-full ${
                    idx === 0 ? 'bg-red-500' : idx === 1 ? 'bg-amber-500' : idx === 2 ? 'bg-purple-500' : 'bg-emerald-500'
                  }`} />
                  <span>{g.name}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 bg-black/40 rounded-md text-gray-400">
                    {g.count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500">Mark shows or movies as completed to reveal your top genres!</p>
          )}
        </div>

        {/* Fun Feature: Rewatch Roulette */}
        <div className="bg-gradient-to-br from-indigo-950/40 via-[#1c1c1e] to-black p-5 rounded-3xl border border-indigo-500/30 shadow-lg flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Dice5 className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Rewatch Roulette</h3>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold">
              FUN
            </span>
          </div>

          <p className="text-xs text-gray-400">
            Can't decide what to rewatch? Let the roulette pick from your finished or rewatch list!
          </p>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleRewatchRoulette}
              disabled={completedItems.length === 0 || isRolling}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              <Dice5 className={`w-3.5 h-3.5 ${isRolling ? 'animate-spin' : ''}`} />
              <span>{isRolling ? 'Spinning...' : 'Spin Roulette'}</span>
            </button>

            {roulettePick && (
              <div
                onClick={() => onOpenDetail?.(roulettePick)}
                className="flex items-center gap-2 px-2.5 py-1.5 bg-black/60 border border-indigo-400/40 rounded-xl cursor-pointer hover:border-indigo-400 transition-colors truncate min-w-0 flex-1"
                title="Click to view details"
              >
                <Sparkles className="w-3 h-3 text-yellow-400 shrink-0" />
                <span className="text-xs text-white font-bold truncate">
                  {roulettePick.externalTitle || roulettePick.originalTitle}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Will Watch Again Section */}
      {willWatchAgainItems.length > 0 && (
        <div className="bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-black border border-emerald-500/30 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-emerald-500/20 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-500/20 rounded-xl border border-emerald-500/40 text-emerald-400">
                <RotateCw className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <span>Will Watch Again</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                    {willWatchAgainItems.length}
                  </span>
                </h2>
                <p className="text-xs text-zinc-400">
                  Your all-time favorites queued for a future rewatch. Click the cross button to remove them while keeping them in completed.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 pt-2">
            {willWatchAgainItems.map((item) => (
              <div
                key={`wwa-${item.id}`}
                onClick={() => onOpenDetail?.(item)}
                className="group relative bg-zinc-900 border border-emerald-500/40 hover:border-emerald-400 rounded-2xl p-2.5 flex flex-col justify-between shadow-lg cursor-pointer transition-all hover:-translate-y-1 hover:shadow-emerald-500/10"
              >
                {/* Cross Button on the top to remove from Will Watch Again */}
                <button
                  onClick={(e) => handleToggleWillWatchAgain(item, e)}
                  className="absolute top-1.5 right-1.5 z-20 w-6 h-6 rounded-full bg-black/80 hover:bg-red-600 text-zinc-300 hover:text-white flex items-center justify-center transition-colors border border-white/10 shadow-md"
                  title="Remove from Will Watch Again (stays in Completed)"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                <div className="aspect-[2/3] w-full rounded-xl overflow-hidden bg-zinc-800 mb-2 relative">
                  {item.posterPath ? (
                    <img
                      src={item.posterPath}
                      alt={item.externalTitle || item.originalTitle}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600">
                      {item.mediaType === 'tv' ? <Tv className="w-6 h-6" /> : <Film className="w-6 h-6" />}
                    </div>
                  )}
                  <div className="absolute bottom-1 left-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-black/80 text-yellow-400 text-[10px] font-bold">
                    <Star className="w-2.5 h-2.5 fill-yellow-400" />
                    <span>{item.userStarRating || 5}</span>
                  </div>
                </div>

                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-white truncate group-hover:text-emerald-400 transition-colors">
                    {item.externalTitle || item.originalTitle}
                  </h4>
                  <p className="text-[10px] text-zinc-400 uppercase font-mono mt-0.5">
                    {item.mediaType} · {item.releaseYear || ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revamped Search Bar & Rating Filter Toolbar */}
      <div className="bg-[#1c1c1e] p-4 sm:p-5 rounded-3xl border border-white/10 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Smaller, sleeker search input */}
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in completed or find title to mark done..."
              className="w-full pl-9 pr-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-[#E50914] placeholder-gray-500"
            />
          </div>

          {/* Rating & Media Filters */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            {/* Type selector */}
            <div className="flex items-center bg-black/40 rounded-xl border border-white/10 p-0.5 text-xs">
              <button
                onClick={() => setTypeFilter('all')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  typeFilter === 'all' ? 'bg-white/20 text-white font-bold' : 'text-gray-400 hover:text-white'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setTypeFilter('movie')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  typeFilter === 'movie' ? 'bg-white/20 text-white font-bold' : 'text-gray-400 hover:text-white'
                }`}
              >
                Movies
              </button>
              <button
                onClick={() => setTypeFilter('tv')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  typeFilter === 'tv' ? 'bg-white/20 text-white font-bold' : 'text-gray-400 hover:text-white'
                }`}
              >
                Series
              </button>
            </div>

            {/* Rating Filter Dropdown */}
            <div className="flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 text-yellow-400" />
              <select
                value={ratingFilter}
                onChange={(e) => setRatingFilter(e.target.value as any)}
                className="bg-black/50 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-yellow-400 cursor-pointer"
              >
                <option value="all" className="bg-zinc-900 text-white">All Ratings ({completedItems.length})</option>
                <option value="5" className="bg-zinc-900 text-white">5 Stars ⭐⭐⭐⭐⭐</option>
                <option value="4" className="bg-zinc-900 text-white">4 Stars ⭐⭐⭐⭐</option>
                <option value="3" className="bg-zinc-900 text-white">3 Stars ⭐⭐⭐</option>
                <option value="2" className="bg-zinc-900 text-white">2 Stars ⭐⭐</option>
                <option value="1" className="bg-zinc-900 text-white">1 Star ⭐</option>
                <option value="unrated" className="bg-zinc-900 text-white">Unrated</option>
              </select>
            </div>

            {/* External Search button if user typed something */}
            {searchQuery.trim() && (
              <button
                onClick={handleExternalSearch}
                disabled={isSearchingExternal}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl text-xs transition-colors border border-white/10 whitespace-nowrap"
              >
                {isSearchingExternal ? 'Searching...' : 'Search Online'}
              </button>
            )}
          </div>
        </div>

        {/* Local Library Search Hits (for marking done directly) */}
        {localSearchResults.length > 0 && (
          <div className="mt-3 border border-white/10 rounded-2xl bg-black/40 divide-y divide-white/5 max-h-[250px] overflow-y-auto">
            <div className="p-2 text-[10px] font-bold uppercase text-gray-400 bg-white/5">
              Found in your library to mark done ({localSearchResults.length}):
            </div>
            {localSearchResults.map((it) => (
              <div
                key={it.id}
                className="p-2.5 flex items-center justify-between gap-3 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {it.posterPath ? (
                    <img
                      src={it.posterPath}
                      alt={it.originalTitle}
                      className="w-8 h-12 object-cover rounded-md flex-shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-12 bg-neutral-800 rounded-md flex items-center justify-center flex-shrink-0">
                      {it.mediaType === 'movie' ? <Film className="w-4 h-4 text-gray-500" /> : <Tv className="w-4 h-4 text-gray-500" />}
                    </div>
                  )}
                  <div className="truncate">
                    <h4 className="text-xs font-bold text-white truncate">
                      {it.externalTitle || it.originalTitle}
                    </h4>
                    <span className="text-[10px] text-gray-400 uppercase font-mono">
                      {it.mediaType} · {it.releaseYear || ''}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleToggleDone(it)}
                  className={'px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 flex-shrink-0 ' + (it.isCompleted ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 hover:bg-red-950 hover:text-red-300' : 'bg-[#E50914] hover:bg-red-700 text-white shadow-md')}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{it.isCompleted ? 'Completed ✓' : 'Mark Done'}</span>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* External Search Candidates */}
        {externalCandidates.length > 0 && (
          <div className="mt-3 border border-white/10 rounded-2xl bg-black/40 divide-y divide-white/5 max-h-[250px] overflow-y-auto">
            <div className="p-2 text-[10px] font-bold uppercase text-gray-400 bg-white/5">
              Online search results ({externalCandidates.length}):
            </div>
            {externalCandidates.map((c) => (
              <div
                key={c.id}
                className="p-2.5 flex items-center justify-between gap-3 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {c.posterPath ? (
                    <img
                      src={c.posterPath}
                      alt={c.title}
                      className="w-8 h-12 object-cover rounded-md flex-shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-12 bg-neutral-800 rounded-md flex items-center justify-center flex-shrink-0">
                      <Tv className="w-4 h-4 text-gray-500" />
                    </div>
                  )}
                  <div className="truncate">
                    <h4 className="text-xs font-bold text-white truncate">{c.title}</h4>
                    <span className="text-[10px] text-gray-400 uppercase font-mono">
                      {c.mediaType} · {c.releaseYear || ''}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleAddExternalAsDone(c)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 flex-shrink-0 shadow-md"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add & Mark Done</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed Series / Movies List */}
      <div className="bg-[#1c1c1e] rounded-3xl border border-white/10 p-6 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/10 pb-4 gap-2">
          <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span>Completed Titles Log ({filteredCompletedItems.length})</span>
          </h2>
          <span className="text-xs text-gray-400">
            Rate with stars, add to "Will Watch Again", or open detail view
          </span>
        </div>

        {filteredCompletedItems.length > 0 ? (
          <div className="divide-y divide-white/5 space-y-3">
            {filteredCompletedItems.map((item) => {
              const compDate = item.completedAt ? new Date(item.completedAt) : new Date();
              const dateStr = compDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              });
              const isWillWatch = !!item.willWatchAgain;

              return (
                <div
                  key={item.id}
                  className="pt-3 pb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group hover:bg-white/[0.02] p-2.5 rounded-2xl transition-colors"
                >
                  {/* Left: Thumbnail & Title (clickable to open detail modal) */}
                  <div
                    onClick={() => onOpenDetail?.(item)}
                    className="flex items-center gap-3.5 min-w-0 cursor-pointer flex-1"
                  >
                    <div className="w-14 h-20 rounded-xl overflow-hidden bg-neutral-900 flex-shrink-0 shadow-md border border-white/10 group-hover:border-emerald-500/40 transition-colors">
                      {item.posterPath ? (
                        <img
                          src={item.posterPath}
                          alt={item.externalTitle || item.originalTitle}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-600">
                          {item.mediaType === 'movie' ? <Film className="w-5 h-5" /> : <Tv className="w-5 h-5" />}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-neutral-800 text-gray-300">
                          {item.mediaType}
                        </span>
                        {isWillWatch && (
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            Rewatch Queued
                          </span>
                        )}
                        {item.rottenTomatoesRating !== undefined && (
                          <span className="text-[10px] text-red-400 font-bold">
                            🍅 {item.rottenTomatoesRating}%
                          </span>
                        )}
                        {item.imdbRating && (
                          <span className="text-[10px] text-yellow-400 font-bold">
                            IMDb {item.imdbRating}
                          </span>
                        )}
                      </div>
                      <h4 className="text-base font-bold text-white truncate mt-1 group-hover:text-emerald-400 transition-colors">
                        {item.externalTitle || item.originalTitle}
                      </h4>
                      <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">
                        {item.synopsis || 'No overview'}
                      </p>
                    </div>
                  </div>

                  {/* Right Side: Date of completion, Time invested, Will Watch Again, 5-Star Rating */}
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-5 self-end sm:self-auto flex-shrink-0">
                    {/* Will Watch Again Button */}
                    <button
                      onClick={(e) => handleToggleWillWatchAgain(item, e)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                        isWillWatch
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                          : 'bg-white/5 hover:bg-emerald-950 hover:text-emerald-300 text-gray-300 border border-white/10'
                      }`}
                      title={isWillWatch ? 'Remove from Will Watch Again' : 'Add to Will Watch Again'}
                    >
                      <RotateCw className={`w-3.5 h-3.5 ${isWillWatch ? 'text-emerald-400' : 'text-gray-400'}`} />
                      <span>{isWillWatch ? 'In Rewatch List' : 'Will Watch Again'}</span>
                    </button>

                    {/* Date of completion */}
                    <div className="text-right hidden sm:block">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500 block">
                        Date Completed
                      </span>
                      <div className="flex items-center gap-1 text-xs text-gray-300 font-medium mt-0.5">
                        <Calendar className="w-3 h-3 text-emerald-400" />
                        <span>{dateStr}</span>
                      </div>
                    </div>

                    {/* Time invested */}
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500 block">
                        Time Invested
                      </span>
                      <div className="flex items-center gap-1 text-xs text-white font-mono font-bold mt-0.5">
                        <Clock className="w-3 h-3 text-[#E50914]" />
                        <span>{formatRuntime(item.timeInvestedMinutes || item.runtimeMinutes || 110)}</span>
                      </div>
                    </div>

                    {/* 5-Star Rating */}
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500 block mb-1">
                        Your Rating
                      </span>
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            onClick={() => handleRate(item, star)}
                            className="p-0.5 hover:scale-125 transition-transform"
                            title={'Rate ' + star + ' stars'}
                          >
                            <Star
                              className={'w-4 h-4 ' + ((item.userStarRating || 0) >= star ? 'fill-yellow-400 text-yellow-400 drop-shadow' : 'text-gray-600 hover:text-yellow-400')}
                            />
                          </button>
                        ))}
                      </div>
                    </div>

                    <a
                      href={getNetflixUrl(item)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 rounded-xl bg-[#E50914] hover:bg-red-700 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition-all hover:scale-105"
                      title="Watch on Netflix (opens in new tab)"
                    >
                      <Play className="w-3 h-3 fill-white" />
                      <span>Netflix</span>
                    </a>

                    {/* Unmark */}
                    <button
                      onClick={() => handleToggleDone(item)}
                      className="p-2 rounded-xl bg-white/5 hover:bg-red-950/60 hover:text-red-400 text-gray-400 border border-white/5 transition-colors"
                      title="Unmark as completed"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-16 text-center text-gray-500">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-gray-600" />
            <h3 className="text-base font-bold text-gray-300">No completed titles match your filter</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              {ratingFilter !== 'all' || typeFilter !== 'all' || searchQuery.trim()
                ? 'Try resetting the rating or search filters above.'
                : 'Use the search bar above to mark your finished movies or series and rate them with 5 stars!'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
