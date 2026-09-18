import React, { useState, useMemo } from 'react';
import { Play, Check, Trash2, Clock, Film, Tv, Search, Star } from 'lucide-react';
import confetti from 'canvas-confetti';
import { LibraryItem, WatchProgress } from '../types';
import { formatRuntime } from '../services/analytics';

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

  // Mark Completed
  const handleMarkCompleted = (item: LibraryItem) => {
    try {
      confetti({ particleCount: 50, spread: 70, origin: { y: 0.6 } });
    } catch (e) {
      // ignore
    }
    const updated: LibraryItem = {
      ...item,
      isCompleted: true,
      viewingStatus: 'completed',
      completedAt: new Date().toISOString(),
      progress: {
        percentage: 100,
        currentEpisode: item.totalEpisodes || item.progress?.currentEpisode || 1,
        currentSeason: item.totalSeasons || item.progress?.currentSeason || 1,
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

  // Update Episode for TV
  const handleUpdateEpisode = (item: LibraryItem, ep: number) => {
    const totalEp = item.totalEpisodes || 10;
    const boundedEp = Math.max(1, Math.min(ep, totalEp));
    const pct = Math.round((boundedEp / totalEp) * 100);

    const updated: LibraryItem = {
      ...item,
      progress: {
        currentSeason: item.progress?.currentSeason || 1,
        currentEpisode: boundedEp,
        watchedMinutes: item.progress?.watchedMinutes || 0,
        percentage: pct,
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
        currentSeason: item.progress?.currentSeason || 1,
        currentEpisode: item.progress?.currentEpisode || 1,
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
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <span>Still Watching</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
              {watchingItems.length}
            </span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Pick up right where you left off. Track granular episode & runtime progress.
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
              className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
            >
              <option value="" disabled>+ Add Title to Still Watching...</option>
              {availableToAdd.slice(0, 50).map((t) => (
                <option key={t.id} value={t.id}>
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
            className="bg-black/40 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
          >
            <option value="recently_watched">Recently Watched</option>
            <option value="recently_added">Recently Added</option>
            <option value="progress">Progress %</option>
            <option value="alphabetical">Alphabetical</option>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayItems.map((item) => {
            const isTV = item.mediaType === 'tv';
            const progress: WatchProgress = item.progress || { percentage: 0, watchedMinutes: 0 };
            const pct = progress.percentage || 0;

            // Remaining runtime calculation
            let remainingText = '';
            if (isTV) {
              const currentEp = progress.currentEpisode || 1;
              const totalEp = item.totalEpisodes || 10;
              const remainingEp = Math.max(0, totalEp - currentEp);
              const perEp = item.runtimeMinutes || 45;
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
                className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-4 flex flex-col justify-between space-y-4 shadow-lg transition-all"
              >
                <div className="flex gap-3">
                  {/* Poster */}
                  <div
                    onClick={() => onOpenDetail(item)}
                    className="w-20 h-28 rounded-xl overflow-hidden bg-zinc-800 shrink-0 border border-zinc-700 cursor-pointer group relative"
                  >
                    {item.posterPath ? (
                      <img src={item.posterPath} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-600">
                        {isTV ? <Tv className="w-8 h-8" /> : <Film className="w-8 h-8" />}
                      </div>
                    )}
                  </div>

                  {/* Title & Metadata */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30">
                        {item.mediaType === 'tv' ? 'Series' : 'Movie'}
                      </span>
                      {item.imdbRating && (
                        <span className="text-[10px] text-amber-400 flex items-center gap-0.5 font-bold">
                          <Star className="w-2.5 h-2.5 fill-amber-400" />
                          {item.imdbRating}
                        </span>
                      )}
                    </div>
                    <h3
                      onClick={() => onOpenDetail(item)}
                      className="text-sm font-bold text-white truncate cursor-pointer hover:text-blue-400 transition-colors"
                    >
                      {item.externalTitle || item.originalTitle}
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      {isTV ? (
                        <>Season {progress.currentSeason || 1} • Episode {progress.currentEpisode || 1} / {item.totalEpisodes || '?'}</>
                      ) : (
                        <>{progress.watchedMinutes || 0} / {item.runtimeMinutes || 120} min</>
                      )}
                    </p>
                    <p className="text-[11px] text-zinc-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{remainingText}</span>
                    </p>
                  </div>
                </div>

                {/* Progress Bar & Slider */}
                <div className="space-y-1.5 bg-black/40 p-3 rounded-xl border border-zinc-800/80">
                  <div className="flex justify-between text-[11px] font-semibold">
                    <span className="text-zinc-400">Progress</span>
                    <span className="text-blue-400 font-bold">{pct}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {/* Interactive Slider */}
                  <div className="pt-2">
                    {isTV ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-400 font-medium">Ep:</span>
                        <input
                          type="range"
                          min={1}
                          max={item.totalEpisodes || 20}
                          value={progress.currentEpisode || 1}
                          onChange={(e) => handleUpdateEpisode(item, parseInt(e.target.value))}
                          className="w-full accent-blue-500 h-1 bg-zinc-700 rounded-lg cursor-pointer"
                        />
                        <span className="text-[10px] text-zinc-300 font-bold w-6 text-right">
                          {progress.currentEpisode || 1}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-400 font-medium">Min:</span>
                        <input
                          type="range"
                          min={0}
                          max={item.runtimeMinutes || 120}
                          value={progress.watchedMinutes || 0}
                          onChange={(e) => handleUpdateMinutes(item, parseInt(e.target.value))}
                          className="w-full accent-blue-500 h-1 bg-zinc-700 rounded-lg cursor-pointer"
                        />
                        <span className="text-[10px] text-zinc-300 font-bold w-8 text-right">
                          {progress.watchedMinutes || 0}m
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-800/80">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleMarkCompleted(item)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 transition-colors"
                      title="Mark Completed"
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