import React, { useState, useMemo } from 'react';
import {
  X,
  Sparkles,
  Shuffle,
  Play,
  Star,
  Clock,
  Film,
  Tv,
  Plus,
  Check,
  RotateCw,
  ExternalLink,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { LibraryItem, DiscoveryTitle } from '../types';
import { formatRuntime } from '../services/analytics';
import { getNetflixUrl } from '../services/normalizer';

interface SurpriseMeModalProps {
  isOpen: boolean;
  items: LibraryItem[];
  customPool?: LibraryItem[] | null;
  onClose: () => void;
  onWatchNow: (item: LibraryItem) => void;
  onOpenDetail: (item: LibraryItem) => void;
  onAddToLibrary?: (item: LibraryItem) => void | Promise<void>;
  onMarkWatched?: (item: LibraryItem) => void | Promise<void>;
}

type PoolOption = 'all' | 'movies' | 'tv' | 'unwatched' | 'still_watching';

export const SurpriseMeModal: React.FC<SurpriseMeModalProps> = ({
  isOpen,
  items,
  customPool,
  onClose,
  onWatchNow,
  onOpenDetail,
  onAddToLibrary,
  onMarkWatched,
}) => {
  const isCustomPool = Boolean(customPool && customPool.length > 0);
  const activePoolItems = useMemo(() => {
    return isCustomPool ? (customPool as LibraryItem[]) : items;
  }, [isCustomPool, customPool, items]);

  const [selectedPool, setSelectedPool] = useState<PoolOption>('all');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [excludeDropped, setExcludeDropped] = useState<boolean>(true);
  const [result, setResult] = useState<LibraryItem | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [showAddChoiceModal, setShowAddChoiceModal] = useState(false);

  // Collect unique genres
  const allGenres = useMemo(() => {
    const s = new Set<string>();
    activePoolItems.forEach((x) => x.genres?.forEach((g) => s.add(g)));
    return Array.from(s).sort();
  }, [activePoolItems]);

  // Candidates pool
  const candidatePool = useMemo(() => {
    return activePoolItems.filter((item) => {
      // If user provided a custom pool directly (e.g. from Discovery filters), respect their exact filtered items
      if (isCustomPool) {
        if (selectedGenre !== 'all') {
          if (!item.genres || !item.genres.includes(selectedGenre)) return false;
        }
        if (selectedPool === 'movies' && item.mediaType !== 'movie') return false;
        if (selectedPool === 'tv' && item.mediaType !== 'tv') return false;
        return true;
      }

      if (excludeDropped && (item.viewingStatus === 'dropped' || (!item.viewingStatus && item.droppedReason))) {
        return false;
      }
      if (item.isCompleted) return false;

      if (selectedPool === 'movies' && item.mediaType !== 'movie') return false;
      if (selectedPool === 'tv' && item.mediaType !== 'tv') return false;
      if (selectedPool === 'unwatched' && item.viewingStatus !== 'unwatched') return false;
      if (selectedPool === 'still_watching' && item.viewingStatus !== 'still_watching') return false;

      if (selectedGenre !== 'all') {
        if (!item.genres || !item.genres.includes(selectedGenre)) return false;
      }

      return true;
    });
  }, [activePoolItems, isCustomPool, selectedPool, selectedGenre, excludeDropped]);

  if (!isOpen) return null;

  const handleSpin = () => {
    if (candidatePool.length === 0) {
      setResult(null);
      return;
    }
    setShowAddChoiceModal(false);
    setIsSpinning(true);
    setResult(null);

    let counter = 0;
    const interval = setInterval(() => {
      const randomIdx = Math.floor(Math.random() * candidatePool.length);
      setResult(candidatePool[randomIdx]);
      counter++;
      if (counter > 15) {
        clearInterval(interval);
        const finalIdx = Math.floor(Math.random() * candidatePool.length);
        const chosen = candidatePool[finalIdx];
        setResult(chosen);
        setIsSpinning(false);
        try {
          confetti({ particleCount: 40, spread: 60, origin: { y: 0.6 } });
        } catch (e) {
          // ignore
        }
      }
    }, 80);
  };

  // Helper to check if currently displayed result is in library
  const isResultInLibrary = Boolean(
    result &&
      items.some(
        (i) =>
          (result.id && i.id === result.id) ||
          (result.externalId && i.externalId === result.externalId) ||
          (result.videoId && i.videoId === result.videoId) ||
          i.originalTitle.toLowerCase().trim() === result.originalTitle.toLowerCase().trim()
      )
  );

  // Helper to check if result is watched
  const isResultWatched = Boolean(
    result &&
      (result.isCompleted ||
        result.viewingStatus === 'completed' ||
        items.some(
          (i) =>
            i.isCompleted &&
            ((result.id && i.id === result.id) ||
              (result.externalId && i.externalId === result.externalId) ||
              (result.videoId && i.videoId === result.videoId) ||
              i.originalTitle.toLowerCase().trim() === result.originalTitle.toLowerCase().trim())
        ))
  );

  const handleAddToLibraryClicked = async (item: LibraryItem) => {
    if (onAddToLibrary) {
      await onAddToLibrary(item);
    }
    // Ask 2 questions blurring everything:
    // 1. Go to that movie on Netflix
    // 2. Surprise me again
    setShowAddChoiceModal(true);
  };

  const handleWatchedClicked = async (item: LibraryItem) => {
    if (onMarkWatched) {
      await onMarkWatched(item);
    }
    // After clicking watched, spin automatically and bring a new movie/series!
    handleSpin();
  };

  const netflixLink = result
    ? getNetflixUrl({
        videoId: result.videoId,
        originalTitle: result.originalTitle,
        externalTitle: result.externalTitle,
      })
    : 'https://www.netflix.com';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-zinc-900 border border-purple-500/30 rounded-2xl p-6 shadow-2xl space-y-5">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>Surprise Me Roulette</span>
              {isCustomPool && (
                <span className="text-[11px] font-semibold bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">
                  🎯 Filtered Discovery Pool
                </span>
              )}
            </h3>
            <p className="text-xs text-zinc-400">
              {isCustomPool
                ? `Spinning exclusively from your currently filtered Discovery selection (${activePoolItems.length} titles)`
                : "Can't decide? Let the algorithm spin your library."}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="space-y-3 bg-black/40 border border-zinc-800 rounded-xl p-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                {isCustomPool ? 'Type Filter' : 'Source Pool'} ({candidatePool.length} eligible)
              </label>
              {isCustomPool && (
                <span className="text-[11px] text-zinc-400">
                  Total filtered: <strong className="text-white">{activePoolItems.length}</strong>
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(isCustomPool
                ? (['all', 'movies', 'tv'] as PoolOption[])
                : (['all', 'movies', 'tv', 'unwatched', 'still_watching'] as PoolOption[])
              ).map((pool) => (
                <button
                  key={pool}
                  onClick={() => setSelectedPool(pool)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    selectedPool === pool
                      ? 'bg-purple-600 text-white font-bold'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  {pool === 'all' && (isCustomPool ? 'All Filtered' : 'All Library')}
                  {pool === 'movies' && 'Movies Only'}
                  {pool === 'tv' && 'TV Series'}
                  {pool === 'unwatched' && 'Unwatched'}
                  {pool === 'still_watching' && 'Still Watching'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
              Genre Filter
            </label>
            <select
              value={selectedGenre}
              onChange={(e) => setSelectedGenre(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white font-medium focus:outline-none focus:border-purple-500 cursor-pointer"
            >
              <option value="all" className="bg-zinc-900 text-white font-medium">All Genres</option>
              {allGenres.map((g) => (
                <option key={g} value={g} className="bg-zinc-900 text-white font-medium">{g}</option>
              ))}
            </select>
          </div>

          {!isCustomPool && (
            <label className="flex items-center gap-2 pt-1 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={excludeDropped}
                onChange={(e) => setExcludeDropped(e.target.checked)}
                className="rounded border-zinc-700 text-purple-600 focus:ring-purple-500 bg-zinc-800"
              />
              <span>Exclude Dropped Titles</span>
            </label>
          )}
        </div>

        {/* Result Preview (Card with thumbnail, ratings, Add to Library, Watched, & Surprise Again inside thumbnail) */}
        <div className="min-h-[180px] flex items-center justify-center border border-dashed border-zinc-800 rounded-2xl p-4 bg-zinc-950/40 relative">
          {candidatePool.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center">No titles match your selected pool and filters.</p>
          ) : result ? (
            <div className="flex flex-col sm:flex-row gap-4 w-full items-center">
              {/* Thumbnail Container with Surprise Again button at bottom */}
              <div className="relative w-28 sm:w-28 h-40 rounded-xl overflow-hidden bg-zinc-800 shrink-0 border border-zinc-700 shadow-md group">
                {result.posterPath ? (
                  <img src={result.posterPath} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-600">
                    {result.mediaType === 'tv' ? <Tv className="w-8 h-8" /> : <Film className="w-8 h-8" />}
                  </div>
                )}

                {/* Surprise Again button at the bottom of the thumbnail inside the card */}
                <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/95 via-black/80 to-transparent flex justify-center z-10">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSpin();
                    }}
                    disabled={isSpinning || candidatePool.length === 0}
                    className="w-full py-1 px-1.5 rounded-lg text-[10px] font-bold bg-purple-600/90 hover:bg-purple-600 text-white flex items-center justify-center gap-1 shadow-md transition-all active:scale-95 disabled:opacity-50"
                    title="Surprise Again"
                  >
                    <RotateCw className={`w-3 h-3 ${isSpinning ? 'animate-spin' : ''}`} />
                    <span className="truncate">Surprise Again</span>
                  </button>
                </div>
              </div>

              {/* Card Meta & Action Buttons */}
              <div className="flex-1 min-w-0 space-y-2 w-full">
                {/* Badges & Multiple Ratings Row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-500/20 text-purple-400 border border-purple-500/30">
                    {result.mediaType === 'tv' ? 'Series' : 'Movie'}
                  </span>
                  {result.releaseYear && <span className="text-xs text-zinc-400">{result.releaseYear}</span>}

                  {/* Rotten Tomatoes */}
                  {result.rottenTomatoesRating !== undefined && (
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-0.5 border ${
                        result.rottenTomatoesRating >= 60
                          ? 'bg-red-950/80 border-red-500/40 text-red-400'
                          : 'bg-green-950/80 border-green-500/40 text-green-400'
                      }`}
                      title="Rotten Tomatoes"
                    >
                      🍅 {result.rottenTomatoesRating}%
                    </span>
                  )}

                  {/* IMDb Rating */}
                  {result.imdbRating && (
                    <span className="bg-black/80 border border-amber-500/30 px-1.5 py-0.5 rounded text-[10px] font-bold text-amber-400 flex items-center gap-1">
                      <span className="text-amber-500 font-black text-[9px]">IMDb</span>
                      <span>{result.imdbRating}</span>
                    </span>
                  )}

                  {/* General / TMDB Rating */}
                  {!result.imdbRating && result.rating && (
                    <span className="bg-black/80 border border-amber-500/30 px-1.5 py-0.5 rounded text-[10px] font-bold text-amber-400 flex items-center gap-1">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      <span>{result.rating}</span>
                    </span>
                  )}
                </div>

                <h4 className="text-base font-bold text-white truncate">
                  {result.externalTitle || result.originalTitle}
                </h4>
                <p className="text-xs text-zinc-400 line-clamp-2">
                  {result.synopsis || 'No synopsis available.'}
                </p>

                {/* Card Action Row with Add to Library and Watched Buttons */}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  {/* Add to Library Button */}
                  {isResultInLibrary ? (
                    <span className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
                      <Check className="w-3.5 h-3.5" />
                      <span>In Library</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleAddToLibraryClicked(result)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-white/10 hover:bg-[#E50914] text-white rounded-lg transition-colors shadow-sm active:scale-95"
                      title="Add to Watchlist Library"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add to Library</span>
                    </button>
                  )}

                  {/* Watched Button */}
                  <button
                    type="button"
                    onClick={() => handleWatchedClicked(result)}
                    className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors border active:scale-95 ${
                      isResultWatched
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30'
                        : 'bg-black/50 text-gray-300 border-white/10 hover:text-white hover:border-emerald-500/40 hover:bg-emerald-950/30'
                    }`}
                    title="Mark as watched and automatically spin next surprise"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{isResultWatched ? 'Watched ✓' : 'Watched'}</span>
                  </button>

                  <button
                    onClick={() => {
                      onWatchNow(result);
                      onClose();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Watch Now</span>
                  </button>
                  <button
                    onClick={() => {
                      onOpenDetail(result);
                      // Surprise modal remains open underneath!
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors border border-zinc-700"
                  >
                    Details
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-2">
              <Shuffle className="w-8 h-8 mx-auto text-zinc-600" />
              <p className="text-xs text-zinc-400 font-medium">Ready to roll the dice?</p>
            </div>
          )}
        </div>

        {/* Action Button */}
        <button
          onClick={handleSpin}
          disabled={isSpinning || candidatePool.length === 0}
          className="w-full py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-lg shadow-purple-600/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Shuffle className={`w-4 h-4 ${isSpinning ? 'animate-spin' : ''}`} />
          <span>{isSpinning ? 'Spinning...' : 'Spin the Wheel!'}</span>
        </button>

        {/* Two-Choice Overlay when Added to Library: Blurring everything */}
        {showAddChoiceModal && result && (
          <div className="absolute inset-0 z-30 rounded-2xl bg-black/75 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
            <div className="w-full max-w-sm bg-zinc-900 border border-purple-500/40 rounded-2xl p-5 shadow-2xl space-y-4 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
                <Check className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">Added to Your Library!</h4>
                <p className="text-xs text-zinc-400 mt-1 line-clamp-1">
                  "{result.externalTitle || result.originalTitle}" is now saved.
                </p>
              </div>

              {/* 2 Choice Options */}
              <div className="space-y-2 pt-1">
                {/* 1. Go to that movie/series on Netflix */}
                <a
                  href={netflixLink}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    setShowAddChoiceModal(false);
                    onClose();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-[#E50914] hover:bg-red-700 text-white flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition-all active:scale-95"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>1. Go to that on Netflix</span>
                </a>

                {/* 2. Surprise me again */}
                <button
                  type="button"
                  onClick={() => {
                    setShowAddChoiceModal(false);
                    handleSpin();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 transition-all active:scale-95"
                >
                  <Shuffle className="w-4 h-4" />
                  <span>2. Surprise me again</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowAddChoiceModal(false)}
                className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors pt-1"
              >
                Close prompt
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};