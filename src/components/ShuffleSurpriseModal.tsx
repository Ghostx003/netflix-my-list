import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Shuffle,
  Sparkles,
  Film,
  Tv,
  Star,
  X,
  RotateCcw,
  Play,
  Plus,
  Check,
  Flame,
  Info,
  Layers,
  Clock,
  Dices,
  Trophy,
  Heart,
  ChevronRight,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { DiscoveryTitle, LibraryItem } from '../types';
import { formatRuntime } from '../services/analytics';
import { getNetflixUrl, openNetflixInNewTab } from '../services/normalizer';
import { CachedImage } from './CachedImage';
import { DiscoveryCard } from './DiscoveryCard';

interface ShuffleSurpriseModalProps {
  isOpen: boolean;
  onClose: () => void;
  catalog: DiscoveryTitle[];
  libraryItems: LibraryItem[];
  onSelectTitle: (title: DiscoveryTitle) => void;
  onAddToLibrary: (item: DiscoveryTitle) => void;
  onStartWatching: (item: DiscoveryTitle) => void;
  isInLibrary: (item: DiscoveryTitle) => boolean;
  isWatchedInLibrary?: (item: DiscoveryTitle) => boolean;
  isWatchingInLibrary?: (item: DiscoveryTitle) => boolean;
}

interface ScoredCandidate {
  item: DiscoveryTitle;
  score: number;
  matchPercentage: number;
  matchedGenres: string[];
  matchedThemes: string[];
  reason: string;
}

export const ShuffleSurpriseModal: React.FC<ShuffleSurpriseModalProps> = ({
  isOpen,
  onClose,
  catalog,
  libraryItems,
  onSelectTitle,
  onAddToLibrary,
  onStartWatching,
  isInLibrary,
  isWatchedInLibrary,
  isWatchingInLibrary,
}) => {
  // Tab state: 'movies' | 'series'
  const [activeTab, setActiveTab] = useState<'movies' | 'series'>('movies');

  // Roulette state
  const [roulettePick, setRoulettePick] = useState<ScoredCandidate | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinningDisplayTitle, setSpinningDisplayTitle] = useState<string | null>(null);
  const spinTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 1. Analyze User Taste Profile from Completed & 4-5 Star Items
  const tasteProfile = useMemo(() => {
    // Completed items
    const completedItems = libraryItems.filter(
      (item) => item.isCompleted === true || item.viewingStatus === 'completed'
    );

    // 4-star and 5-star items (either userStarRating >= 4 or external ratings >= 8.0)
    const highRatedItems = libraryItems.filter((item) => {
      const userStar = item.userStarRating;
      if (userStar !== undefined && userStar >= 4) return true;
      const imdb = item.imdbRating;
      if (imdb !== undefined && imdb >= 8.0) return true;
      const tmdb = item.rating;
      if (tmdb !== undefined && tmdb >= 8.0) return true;
      return false;
    });

    const genreWeights: Record<string, number> = {};
    const themeWeights: Record<string, number> = {};

    // Completed genres tally (+1 weight)
    completedItems.forEach((item) => {
      item.genres?.forEach((genre) => {
        const clean = genre.trim();
        if (clean) genreWeights[clean] = (genreWeights[clean] || 0) + 1;
      });
      item.themes?.forEach((theme) => {
        const clean = theme.trim();
        if (clean) themeWeights[clean] = (themeWeights[clean] || 0) + 1;
      });
    });

    // 4-star & 5-star heavy boost (+2 for 4-star, +4 for 5-star)
    highRatedItems.forEach((item) => {
      const multiplier = (item.userStarRating && item.userStarRating === 5) ? 4 : 2;
      item.genres?.forEach((genre) => {
        const clean = genre.trim();
        if (clean) genreWeights[clean] = (genreWeights[clean] || 0) + multiplier;
      });
      item.themes?.forEach((theme) => {
        const clean = theme.trim();
        if (clean) themeWeights[clean] = (themeWeights[clean] || 0) + multiplier;
      });
    });

    // Sort top genres and themes
    const sortedGenres = Object.entries(genreWeights)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

    const sortedThemes = Object.entries(themeWeights)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

    // Set of completed normalized titles to avoid recommending what user already completed
    const completedTitleSet = new Set(
      completedItems.map((i) => (i.normalizedTitle || i.originalTitle || '').toLowerCase().trim())
    );

    return {
      genreWeights,
      themeWeights,
      topGenres: sortedGenres.slice(0, 6),
      topThemes: sortedThemes.slice(0, 6),
      completedCount: completedItems.length,
      highRatedCount: highRatedItems.length,
      completedTitleSet,
    };
  }, [libraryItems]);

  // 2. Score Discovery Catalog Against User Preferences
  const { topMovies, topSeries, allCandidates } = useMemo(() => {
    if (!catalog || catalog.length === 0) {
      return { topMovies: [], topSeries: [], allCandidates: [] };
    }

    const { genreWeights, themeWeights, topGenres, completedTitleSet } = tasteProfile;
    const hasTasteData = Object.keys(genreWeights).length > 0 || Object.keys(themeWeights).length > 0;

    const scored: ScoredCandidate[] = [];

    catalog.forEach((item) => {
      // Exclude already completed titles
      const normalizedTitle = (item.originalTitle || item.title || '').toLowerCase().trim();
      if (completedTitleSet.has(normalizedTitle)) return;

      const itemGenres = item.genres || [];
      const itemThemes = item.themes || [];

      let genreScore = 0;
      const matchedGenres: string[] = [];
      itemGenres.forEach((g) => {
        const weight = genreWeights[g] || 0;
        if (weight > 0) {
          genreScore += weight;
          matchedGenres.push(g);
        }
      });

      let themeScore = 0;
      const matchedThemes: string[] = [];
      itemThemes.forEach((t) => {
        const weight = themeWeights[t] || 0;
        if (weight > 0) {
          themeScore += weight;
          matchedThemes.push(t);
        }
      });

      // Rating quality score
      const qualityScore = (item.imdbRating || item.rating || 6.5) * 1.5;
      const popularityBonus = Math.log10(Math.max(item.voteCount || 10, 10)) * 2;

      let totalScore = 0;
      if (hasTasteData) {
        totalScore = (genreScore * 3.5) + (themeScore * 4.5) + qualityScore + popularityBonus;
      } else {
        // Fallback when library is fresh: sort by ratings & critical acclaim
        totalScore = qualityScore + (item.rottenTomatoesRating ? item.rottenTomatoesRating / 10 : 0) + popularityBonus;
      }

      // Generate human-readable reason
      let reason = '';
      if (matchedGenres.length > 0 && matchedThemes.length > 0) {
        reason = `Matches your favorite genres (${matchedGenres.slice(0, 2).join(', ')}) & theme of "${matchedThemes[0]}"`;
      } else if (matchedGenres.length > 0) {
        reason = `Features ${matchedGenres.slice(0, 2).join(' & ')}, which you loved in your completed library`;
      } else if (matchedThemes.length > 0) {
        reason = `Explores "${matchedThemes.slice(0, 2).join(', ')}" based on your top-rated themes`;
      } else if (hasTasteData && topGenres.length > 0) {
        reason = `Highly acclaimed Netflix India pick complementary to your ${topGenres[0]} favorites`;
      } else {
        reason = `Top-rated critically acclaimed ${item.mediaType === 'movie' ? 'film' : 'series'} on Netflix India`;
      }

      // Normalized match percentage for UI badge (between 78% and 99%)
      const matchPercentage = Math.min(99, Math.max(78, Math.round(75 + (totalScore % 25))));

      scored.push({
        item,
        score: totalScore,
        matchPercentage,
        matchedGenres,
        matchedThemes,
        reason,
      });
    });

    // Partition and take top 25 for each category
    const movies = scored
      .filter((sc) => sc.item.mediaType === 'movie')
      .sort((a, b) => b.score - a.score)
      .slice(0, 25);

    const series = scored
      .filter((sc) => sc.item.mediaType === 'tv')
      .sort((a, b) => b.score - a.score)
      .slice(0, 25);

    return {
      topMovies: movies,
      topSeries: series,
      allCandidates: [...movies, ...series],
    };
  }, [catalog, tasteProfile]);

  // Clean up spin interval
  useEffect(() => {
    return () => {
      if (spinTimerRef.current) clearInterval(spinTimerRef.current);
    };
  }, []);

  // 3. Roulette Spin Handler
  const handleSpinRoulette = () => {
    const candidatePool = allCandidates.length > 0 ? allCandidates : [];
    if (candidatePool.length === 0) return;

    setIsSpinning(true);
    let counter = 0;
    const totalTicks = 18;

    if (spinTimerRef.current) clearInterval(spinTimerRef.current);

    spinTimerRef.current = setInterval(() => {
      counter++;
      const randomIdx = Math.floor(Math.random() * candidatePool.length);
      setSpinningDisplayTitle(candidatePool[randomIdx].item.title);

      if (counter >= totalTicks) {
        if (spinTimerRef.current) clearInterval(spinTimerRef.current);
        // Final pick
        const finalPick = candidatePool[Math.floor(Math.random() * candidatePool.length)];
        setRoulettePick(finalPick);
        setIsSpinning(false);
        setSpinningDisplayTitle(null);

        try {
          confetti({
            particleCount: 50,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#E50914', '#A855F7', '#3B82F6', '#F59E0B'],
          });
        } catch {}
      }
    }, 90);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fade-in">
      <div className="bg-[#141414] border border-zinc-800 rounded-2xl w-full max-w-6xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/80 backdrop-blur-sm sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-600 via-pink-600 to-red-600 text-white shadow-lg shadow-purple-600/30">
              <Shuffle className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-white tracking-wide flex items-center gap-2">
                  Shuffle Surprise
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-purple-950/80 border border-purple-500/40 text-[10px] font-bold text-purple-300">
                  AI Taste Match
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 hidden sm:block">
                Trained on your {tasteProfile.completedCount} completed titles & {tasteProfile.highRatedCount} top 4-5★ favorites
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Direct Roulette Trigger in Header */}
            <button
              onClick={handleSpinRoulette}
              disabled={isSpinning}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-xs font-bold shadow-lg shadow-purple-600/30 transition-transform active:scale-95 disabled:opacity-50"
            >
              <Dices className={`w-4 h-4 ${isSpinning ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Spin Roulette</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Taste Snapshot Pills */}
          {(tasteProfile.topGenres.length > 0 || tasteProfile.topThemes.length > 0) && (
            <div className="p-3.5 bg-zinc-900/60 border border-zinc-800 rounded-xl flex flex-wrap items-center gap-2 text-xs">
              <span className="text-zinc-400 font-bold flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                Your Top Tastes:
              </span>
              {tasteProfile.topGenres.map((g) => (
                <span
                  key={g}
                  className="px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-200 border border-zinc-700 text-[11px] font-medium"
                >
                  {g}
                </span>
              ))}
              {tasteProfile.topThemes.map((t) => (
                <span
                  key={t}
                  className="px-2.5 py-0.5 rounded-full bg-purple-950/70 text-purple-300 border border-purple-500/30 text-[11px] font-semibold"
                >
                  ✨ {t}
                </span>
              ))}
            </div>
          )}

          {/* ROULETTE HERO SECTION */}
          <div className="bg-gradient-to-br from-purple-950/40 via-zinc-900 to-zinc-950 border border-purple-500/30 rounded-2xl p-4 sm:p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-purple-600 text-white text-[10px] font-black uppercase tracking-wider">
                    Roulette Engine
                  </span>
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    Need an instant recommendation?
                  </h3>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  Spin the roulette to pick a tailored movie or series matched to your 4-5★ favorites.
                </p>
              </div>

              <button
                onClick={handleSpinRoulette}
                disabled={isSpinning}
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-red-600 via-purple-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white text-sm font-black shadow-xl shadow-purple-600/30 transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 shrink-0"
              >
                <Dices className={`w-5 h-5 ${isSpinning ? 'animate-spin' : ''}`} />
                <span>{isSpinning ? 'Spinning Roulette...' : 'Spin Roulette Pick'}</span>
              </button>
            </div>

            {/* Spinning Indicator */}
            {isSpinning && spinningDisplayTitle && (
              <div className="py-10 text-center flex flex-col items-center justify-center animate-pulse">
                <div className="w-12 h-12 rounded-full border-4 border-purple-500 border-t-transparent animate-spin mb-3" />
                <span className="text-xs text-purple-300 font-mono uppercase tracking-wider">
                  Analyzing Your Favorite Genres & Themes...
                </span>
                <span className="text-lg sm:text-2xl font-black text-white mt-1">
                  {spinningDisplayTitle}
                </span>
              </div>
            )}

            {/* Roulette Pick Spotlight Card */}
            {!isSpinning && roulettePick && (
              <div className="bg-zinc-900/90 border border-purple-500/40 rounded-xl p-4 sm:p-5 flex flex-col md:flex-row gap-5 items-start animate-fade-in shadow-2xl">
                {/* Poster */}
                <div className="w-28 sm:w-36 aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800 shrink-0 shadow-lg border border-white/10 relative group">
                  <CachedImage
                    src={roulettePick.item.posterPath}
                    alt={roulettePick.item.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-1.5 left-1.5">
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase text-white ${
                        roulettePick.item.mediaType === 'movie' ? 'bg-red-600' : 'bg-purple-600'
                      }`}
                    >
                      {roulettePick.item.mediaType === 'movie' ? 'Movie' : 'Series'}
                    </span>
                  </div>
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 flex flex-col justify-between h-full space-y-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-black">
                        🎯 {roulettePick.matchPercentage}% Taste Match
                      </span>
                      {roulettePick.item.imdbRating && (
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-black">
                          IMDb {roulettePick.item.imdbRating}
                        </span>
                      )}
                      {roulettePick.item.releaseYear && (
                        <span className="text-xs text-zinc-400">{roulettePick.item.releaseYear}</span>
                      )}
                      {roulettePick.item.runtimeMinutes && (
                        <span className="text-xs text-zinc-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatRuntime(roulettePick.item.runtimeMinutes)}
                        </span>
                      )}
                    </div>

                    <h4 className="text-lg sm:text-2xl font-black text-white">
                      {roulettePick.item.title}
                    </h4>

                    {/* Personalized Reason Callout */}
                    <div className="mt-2 p-2.5 rounded-lg bg-purple-950/60 border border-purple-500/30 text-xs text-purple-200 flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-white">Why we picked this for you: </span>
                        <span>{roulettePick.reason}</span>
                      </div>
                    </div>

                    {roulettePick.item.synopsis && (
                      <p className="text-xs text-zinc-300 line-clamp-2 mt-2 leading-relaxed">
                        {roulettePick.item.synopsis}
                      </p>
                    )}

                    {/* Genres & Themes */}
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {roulettePick.item.genres?.slice(0, 3).map((g) => (
                        <span
                          key={g}
                          className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700"
                        >
                          {g}
                        </span>
                      ))}
                      {roulettePick.item.themes?.slice(0, 2).map((t) => (
                        <span
                          key={t}
                          className="text-[10px] px-2 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-500/40"
                        >
                          ✨ {t}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Roulette Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-800/80">
                    {/* View Details */}
                    <button
                      onClick={() => onSelectTitle(roulettePick.item)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition-colors"
                    >
                      <Info className="w-3.5 h-3.5 text-zinc-300" />
                      <span>View Details</span>
                    </button>

                    {/* Add to Library */}
                    <button
                      onClick={() => onAddToLibrary(roulettePick.item)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                        isInLibrary(roulettePick.item)
                          ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700'
                      }`}
                    >
                      {isInLibrary(roulettePick.item) ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>In Library</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add to Library</span>
                        </>
                      )}
                    </button>

                    {/* Watch on Netflix */}
                    <button
                      onClick={(e) => {
                        const url = getNetflixUrl({
                          videoId: roulettePick.item.netflixId,
                          netflixId: roulettePick.item.netflixId,
                          originalTitle: roulettePick.item.title,
                          externalTitle: roulettePick.item.title,
                        });
                        openNetflixInNewTab(url, e);
                        onStartWatching(roulettePick.item);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#E50914] hover:bg-red-700 text-white text-xs font-black shadow-lg shadow-red-600/30 transition-transform active:scale-95 cursor-pointer ml-auto"
                    >
                      <Play className="w-3.5 h-3.5 fill-white" />
                      <span>▶ Netflix</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION TABS: TOP 25 MOVIES & TOP 25 SERIES */}
          <div>
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('movies')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeTab === 'movies'
                      ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                      : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                  }`}
                >
                  <Film className="w-4 h-4" />
                  <span>Top 25 Movies</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[10px]">
                    {topMovies.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('series')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeTab === 'series'
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                      : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                  }`}
                >
                  <Tv className="w-4 h-4" />
                  <span>Top 25 Series</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[10px]">
                    {topSeries.length}
                  </span>
                </button>
              </div>

              <span className="text-xs text-zinc-400 hidden sm:block">
                Showing top 25 scored against your 4-5★ preferences
              </span>
            </div>

            {/* Grid of Recommended Titles */}
            {((activeTab === 'movies' ? topMovies : topSeries).length > 0) ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-3 sm:gap-4">
                {(activeTab === 'movies' ? topMovies : topSeries).map((candidate) => (
                  <div
                    key={candidate.item.id}
                    className="relative flex flex-col group"
                  >
                    {/* Match Score Badge */}
                    <div className="absolute top-2 left-2 z-20 pointer-events-none">
                      <span className="px-1.5 py-0.5 rounded-md bg-black/85 backdrop-blur-md border border-emerald-500/40 text-[9px] font-black text-emerald-400 shadow-md">
                        🎯 {candidate.matchPercentage}%
                      </span>
                    </div>

                    <DiscoveryCard
                      item={candidate.item}
                      isInLibrary={isInLibrary(candidate.item)}
                      isWatched={isWatchedInLibrary?.(candidate.item)}
                      isWatching={isWatchingInLibrary?.(candidate.item)}
                      onClick={() => onSelectTitle(candidate.item)}
                      onAddToLibrary={onAddToLibrary}
                      onStartWatching={onStartWatching}
                    />

                    {/* Personalized Reason Capsule underneath card */}
                    <div className="mt-1 px-1 text-[10px] text-zinc-400 italic line-clamp-1">
                      💡 {candidate.reason}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-16 text-center text-zinc-400">
                <p className="text-sm">No titles found in this category from current discovery catalog.</p>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-zinc-800 bg-zinc-900/80 flex items-center justify-between text-xs text-zinc-400">
          <span>Click any title card to view full trailer, cast, and metadata</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-bold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
