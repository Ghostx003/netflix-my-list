import React, { useState, useMemo } from 'react';
import { Play, Check, Trash2, Clock, Film, Tv, Search, Star, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { LibraryItem, WatchProgress } from '../types';
import { formatRuntime } from '../services/analytics';
import { getNetflixUrl } from '../services/normalizer';

interface StillWatchingViewProps {
  items: LibraryItem[];
  onUpdateItem: (item: LibraryItem) => void;
  onOpenDropModal: (item: LibraryItem) => void;
  onOpenDetail: (item: LibraryItem) => void;
}

type StillSortOption = 'recently_watched' | 'recently_added' | 'progress' | 'alphabetical';

export const StillWatchingView: React.FC<StillWatchingViewProps> = ({
  items,
  onUpdateItem,
  onOpenDropModal,
  onOpenDetail,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<StillSortOption>('recently_watched');
  // Tracks which card IDs have their slider / editor expanded
  const [expandedCardIds, setExpandedCardIds] = useState<Record<string, boolean>>({});

  // Filter still watching titles
  const watchingItems = useMemo(() => {
    return items.filter(
      (x) => x.viewingStatus === 'still_watching' && !x.isCompleted
    );
  }, [items]);

  // Available items to add into Still Watching
  const availableToAdd = useMemo(() => {
    return items.filter((x) => x.viewingStatus !== 'still_watching' && !x.isCompleted);
  }, [items]);

  // Filtered & Sorted
  const displayItems = useMemo(() => {
    let filtered = watchingItems;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (x) =>
          x.originalTitle.toLowerCase().includes(q) ||
          (x.externalTitle && x.externalTitle.toLowerCase().includes(q))
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
      const lastA = new Date(a.progress?.lastWatchedAt || a.addedAt || 0).getTime();
      const lastB = new Date(b.progress?.lastWatchedAt || b.addedAt || 0).getTime();
      return lastB - lastA;
    });
  }, [watchingItems, searchQuery, sortBy]);

  const toggleExpand = (itemId: string) => {
    setExpandedCardIds((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  // Mark Full Title Completed
  const handleMarkCompleted = (item: LibraryItem) => {
    try {
      confetti({ particleCount: 50, spread: 70, origin: { y: 0.6 } });
    } catch (e) {
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

  // Add into Still Watching
  const handleAddToWatching = (item: LibraryItem) => {
    const updated: LibraryItem = {
      ...item,
      viewingStatus: 'still_watching',
      progress: item.progress || {
        currentSeason: 1,
        currentEpisode: 1,
        completedSeasons: [],
        watchedMinutes: 0,
        percentage: 0,
        lastWatchedAt: new Date().toISOString(),
      },
    };
    onUpdateItem(updated);
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

    // Fill any missing seasons with sensible defaults
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
  // - Marks everything before Season 4 as completed
  // - Sets active currentSeason to 4, currentEpisode to 1
  // - Ensures slider is open!
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
  // - Marks that season and all seasons before it as completed
  const handleToggleSeasonCompleted = (item: LibraryItem, seasonNum: number, e: React.MouseEvent) => {
    e.stopPropagation();

    const currentCompleted = new Set(item.progress?.completedSeasons || []);
    const isCurrentlyDone = currentCompleted.has(seasonNum);
    const totalSeasons = Math.max(1, item.totalSeasons || 1);

    let nextCompleted: number[];
    let nextActiveSeason = item.progress?.currentSeason || 1;
    let nextEpisode = item.progress?.currentEpisode || 1;

    if (isCurrentlyDone) {
      // Unmark this season
      currentCompleted.delete(seasonNum);
      nextCompleted = Array.from(currentCompleted);
      nextActiveSeason = seasonNum;
      nextEpisode = 1;
    } else {
      // Mark this season AND all prior seasons as completed
      for (let s = 1; s <= seasonNum; s++) {
        currentCompleted.add(s);
      }
      nextCompleted = Array.from(currentCompleted);

      // If there is a next season, advance active to next season
      if (seasonNum < totalSeasons) {
        nextActiveSeason = seasonNum + 1;
        nextEpisode = 1;
      } else {
        // Completed all seasons!
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

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-2.5">
            <span>Still Watching</span>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
              {watchingItems.length} active
            </span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Track seasons and episodes. Click on any season to jump right in.
          </p>
        </div>

        {/* Quick Add from Library */}
        {availableToAdd.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              onChange={(e) => {
                const found = availableToAdd.find((x) => x.id === e.target.value);
                if (found) handleAddToWatching(found);
                e.target.value = '';
              }}
              defaultValue=""
              className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-medium focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="" disabled className="bg-zinc-900 text-zinc-400 font-medium">+ Add Title to Still Watching...</option>
              {availableToAdd.slice(0, 50).map((t) => (
                <option key={t.id} value={t.id} className="bg-zinc-900 text-white font-medium py-1">
                  {t.mediaType === 'tv' ? '📺' : '🎬'} {t.externalTitle || t.originalTitle}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Search & Sort Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-zinc-900/60 p-3 rounded-2xl border border-zinc-800">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search active titles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-black/40 border border-zinc-700 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <span className="text-xs text-zinc-400 font-medium">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as StillSortOption)}
            className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-100 font-medium focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="recently_watched" className="bg-zinc-900 text-white">Recently Watched</option>
            <option value="recently_added" className="bg-zinc-900 text-white">Recently Added</option>
            <option value="progress" className="bg-zinc-900 text-white">Progress %</option>
            <option value="alphabetical" className="bg-zinc-900 text-white">Alphabetical</option>
          </select>
        </div>
      </div>

      {/* Grid */}
      {displayItems.length === 0 ? (
        <div className="py-20 text-center space-y-3 bg-zinc-900/20 border border-zinc-800/80 rounded-2xl">
          <Play className="w-10 h-10 mx-auto text-zinc-600" />
          <h3 className="text-base font-bold text-zinc-300">No titles in Still Watching</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Click "Watch Now" on any title in your library or use the dropdown above to begin tracking progress.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-start">
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
              // Compute remaining episodes
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
                className="bg-zinc-900/90 border border-zinc-800 hover:border-zinc-700/80 rounded-2xl p-4 flex flex-col space-y-4 shadow-xl transition-all h-fit"
              >
                {/* Header Row: Poster + Title Info */}
                <div className="flex gap-3">
                  {/* Poster */}
                  <div
                    onClick={() => onOpenDetail(item)}
                    className="w-20 h-28 rounded-xl overflow-hidden bg-zinc-800 shrink-0 border border-zinc-700/80 cursor-pointer group relative shadow-md"
                  >
                    {item.posterPath ? (
                      <img
                        src={item.posterPath}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-600">
                        {isTV ? <Tv className="w-8 h-8" /> : <Film className="w-8 h-8" />}
                      </div>
                    )}
                  </div>

                  {/* Title & Metadata */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30">
                        {isTV ? 'Series' : 'Movie'}
                      </span>
                      {item.imdbRating && (
                        <span className="text-[10px] text-amber-400 flex items-center gap-0.5 font-bold">
                          <Star className="w-2.5 h-2.5 fill-amber-400" />
                          {item.imdbRating}
                        </span>
                      )}
                    </div>

                    {/* Click title to expand/collapse slider */}
                    <div
                      onClick={() => toggleExpand(item.id)}
                      className="cursor-pointer group flex items-start justify-between gap-1"
                      title="Click to adjust episode progress"
                    >
                      <h3 className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors line-clamp-1">
                        {item.externalTitle || item.originalTitle}
                      </h3>
                      <button
                        type="button"
                        className="text-zinc-500 group-hover:text-zinc-300 p-0.5 shrink-0 transition-colors"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>

                    <p className="text-[11px] text-zinc-300 font-medium">
                      {isTV ? (
                        <>Season {currentSeason} • Ep {currentEpisode} of {episodesInActiveSeason}</>
                      ) : (
                        <>{progress.watchedMinutes || 0} / {item.runtimeMinutes || 120} min</>
                      )}
                    </p>

                    <p className="text-[11px] text-zinc-400 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-zinc-500" />
                      <span>{remainingText}</span>
                    </p>
                  </div>
                </div>

                {/* TV Season Selectors (Pills) */}
                {isTV && totalSeasons > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between items-center text-[10px] text-zinc-400 uppercase font-semibold">
                      <span>Seasons</span>
                      <span className="text-zinc-500">{totalSeasons} total</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                      {Array.from({ length: totalSeasons }, (_, i) => i + 1).map((sNum) => {
                        const isDone = completedSeasonsSet.has(sNum);
                        const isCurrent = currentSeason === sNum && !isDone;

                        return (
                          <div
                            key={sNum}
                            onClick={() => handleSelectSeason(item, sNum)}
                            className={`group flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all border ${
                              isDone
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : isCurrent
                                ? 'bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-900/40'
                                : 'bg-zinc-800/80 text-zinc-400 border-zinc-700/80 hover:bg-zinc-800 hover:text-white'
                            }`}
                            title={isDone ? `Season ${sNum} Completed` : `Switch to Season ${sNum}`}
                          >
                            <span>S{sNum}</span>

                            {/* Tick Button */}
                            <button
                              type="button"
                              onClick={(e) => handleToggleSeasonCompleted(item, sNum, e)}
                              className={`p-0.5 rounded transition-transform hover:scale-125 ${
                                isDone
                                  ? 'text-emerald-400'
                                  : isCurrent
                                  ? 'text-blue-200 hover:text-white'
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

                {/* Overall Progress Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-semibold">
                    <span className="text-zinc-400">Total Progress</span>
                    <span className="text-blue-400 font-mono font-bold">{pct}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Expandable Slider (Only shows when title/season is clicked) */}
                {isExpanded && (
                  <div className="space-y-2 bg-black/60 p-3.5 rounded-xl border border-blue-500/20 animate-in fade-in duration-200">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-white flex items-center gap-1.5">
                        {isTV ? (
                          <>
                            <Tv className="w-3.5 h-3.5 text-blue-400" />
                            <span>Season {currentSeason} Episodes</span>
                          </>
                        ) : (
                          <>
                            <Film className="w-3.5 h-3.5 text-blue-400" />
                            <span>Movie Runtime</span>
                          </>
                        )}
                      </span>
                      <span className="text-[11px] font-mono font-bold text-blue-400">
                        {isTV ? `Ep ${currentEpisode} / ${episodesInActiveSeason}` : `${progress.watchedMinutes || 0}m / ${item.runtimeMinutes || 120}m`}
                      </span>
                    </div>

                    {/* Interactive Slider */}
                    <div className="pt-1">
                      {isTV ? (
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-zinc-400 font-medium">Ep 1</span>
                          <input
                            type="range"
                            min={1}
                            max={episodesInActiveSeason}
                            value={currentEpisode}
                            onChange={(e) => handleUpdateEpisode(item, parseInt(e.target.value))}
                            className="w-full accent-blue-500 h-1.5 bg-zinc-700 rounded-lg cursor-pointer"
                          />
                          <span className="text-[10px] text-zinc-400 font-medium">Ep {episodesInActiveSeason}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-zinc-400 font-medium">0m</span>
                          <input
                            type="range"
                            min={0}
                            max={item.runtimeMinutes || 120}
                            value={progress.watchedMinutes || 0}
                            onChange={(e) => handleUpdateMinutes(item, parseInt(e.target.value))}
                            className="w-full accent-blue-500 h-1.5 bg-zinc-700 rounded-lg cursor-pointer"
                          />
                          <span className="text-[10px] text-zinc-400 font-medium">{item.runtimeMinutes || 120}m</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-800/80">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <a
                      href={getNetflixUrl(item)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#E50914] text-white hover:bg-red-700 transition-colors shadow-sm"
                      title="Continue Watching on Netflix (opens in new tab)"
                    >
                      <Play className="w-3.5 h-3.5 fill-white" />
                      <span>Netflix</span>
                    </a>
                    <button
                      onClick={() => handleMarkCompleted(item)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 transition-colors"
                      title="Mark Entire Series / Movie Finished"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Finish</span>
                    </button>
                    <button
                      onClick={() => onOpenDropModal(item)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Drop title"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Drop</span>
                    </button>
                  </div>

                  <button
                    onClick={() => handleRemoveFromWatching(item)}
                    className="px-2 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
                    title="Move back to Unwatched"
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
  );
};