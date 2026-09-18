import React, { useState, useMemo } from 'react';
import { X, Sparkles, Shuffle, Play, Star, Clock, Film, Tv } from 'lucide-react';
import confetti from 'canvas-confetti';
import { LibraryItem } from '../types';
import { formatRuntime } from '../services/analytics';

interface SurpriseMeModalProps {
  isOpen: boolean;
  items: LibraryItem[];
  onClose: () => void;
  onWatchNow: (item: LibraryItem) => void;
  onOpenDetail: (item: LibraryItem) => void;
}

type PoolOption = 'all' | 'movies' | 'tv' | 'unwatched' | 'still_watching';

export const SurpriseMeModal: React.FC<SurpriseMeModalProps> = ({
  isOpen,
  items,
  onClose,
  onWatchNow,
  onOpenDetail,
}) => {
  const [selectedPool, setSelectedPool] = useState<PoolOption>('all');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [excludeDropped, setExcludeDropped] = useState<boolean>(true);
  const [result, setResult] = useState<LibraryItem | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);

  // Collect unique genres
  const allGenres = useMemo(() => {
    const s = new Set<string>();
    items.forEach((x) => x.genres?.forEach((g) => s.add(g)));
    return Array.from(s).sort();
  }, [items]);

  // Candidates pool
  const candidatePool = useMemo(() => {
    return items.filter((item) => {
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
  }, [items, selectedPool, selectedGenre, excludeDropped]);

  if (!isOpen) return null;

  const handleSpin = () => {
    if (candidatePool.length === 0) {
      setResult(null);
      return;
    }
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
            <h3 className="text-lg font-bold text-white">Surprise Me Roulette</h3>
            <p className="text-xs text-zinc-400">
              Can't decide? Let the algorithm spin your library.
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="space-y-3 bg-black/40 border border-zinc-800 rounded-xl p-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
              Source Pool ({candidatePool.length} eligible)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {(['all', 'movies', 'tv', 'unwatched', 'still_watching'] as PoolOption[]).map((pool) => (
                <button
                  key={pool}
                  onClick={() => setSelectedPool(pool)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    selectedPool === pool
                      ? 'bg-purple-600 text-white font-bold'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  {pool === 'all' && 'All Library'}
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

          <label className="flex items-center gap-2 pt-1 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={excludeDropped}
              onChange={(e) => setExcludeDropped(e.target.checked)}
              className="rounded border-zinc-700 text-purple-600 focus:ring-purple-500 bg-zinc-800"
            />
            <span>Exclude Dropped Titles</span>
          </label>
        </div>

        {/* Result Preview */}
        <div className="min-h-[160px] flex items-center justify-center border border-dashed border-zinc-800 rounded-2xl p-4 bg-zinc-950/40">
          {candidatePool.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center">No titles match your selected pool and filters.</p>
          ) : result ? (
            <div className="flex gap-4 w-full items-center">
              <div className="w-20 h-28 rounded-lg overflow-hidden bg-zinc-800 shrink-0 border border-zinc-700">
                {result.posterPath ? (
                  <img src={result.posterPath} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-600">
                    {result.mediaType === 'tv' ? <Tv className="w-8 h-8" /> : <Film className="w-8 h-8" />}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-500/20 text-purple-400 border border-purple-500/30">
                    {result.mediaType === 'tv' ? 'Series' : 'Movie'}
                  </span>
                  {result.releaseYear && <span className="text-xs text-zinc-400">{result.releaseYear}</span>}
                  {result.imdbRating && (
                    <span className="text-xs text-amber-400 flex items-center gap-0.5">
                      <Star className="w-3 h-3 fill-amber-400" />
                      {result.imdbRating}
                    </span>
                  )}
                </div>
                <h4 className="text-base font-bold text-white truncate">
                  {result.externalTitle || result.originalTitle}
                </h4>
                <p className="text-xs text-zinc-400 line-clamp-2">
                  {result.synopsis || 'No synopsis available.'}
                </p>
                <div className="flex items-center gap-2 pt-1">
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
                      onClose();
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
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
      </div>
    </div>
  );
};