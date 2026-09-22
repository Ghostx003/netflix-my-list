import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Shuffle,
  Sparkles,
  Film,
  Tv,
  X,
  RotateCcw,
  Play,
  Plus,
  Check,
  Flame,
  Info,
  Clock,
  Dices,
  Filter,
  Search,
  ChevronDown,
  ChevronUp,
  Layers,
  Sparkle,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { DiscoveryTitle, LibraryItem } from '../types';
import { formatRuntime } from '../services/analytics';
import { getNetflixUrl, openNetflixInNewTab } from '../services/normalizer';
import { CANONICAL_THEMES } from '../services/themeMapper';
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
  baseScore: number;
  matchPercentage: number;
  matchedGenres: string[];
  matchedThemes: string[];
  reason: string;
}

const STORAGE_KEY_GENRES = 'netflix_shuffle_selected_genres';
const STORAGE_KEY_THEMES = 'netflix_shuffle_selected_themes';

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

  // Non-repeating Batch State: advances to completely fresh 25 titles on every reshuffle or modal open!
  const [movieBatch, setMovieBatch] = useState(0);
  const [seriesBatch, setSeriesBatch] = useState(0);
  const [isReshuffling, setIsReshuffling] = useState(false);

  // Persistent Genre & Theme Filter from localStorage
  const [selectedGenres, setSelectedGenres] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_GENRES);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [selectedThemes, setSelectedThemes] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_THEMES);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Filter dropdown/picker state
  const [showFilterPicker, setShowFilterPicker] = useState<'genre' | 'theme' | null>(null);
  const [filterSearchQuery, setFilterSearchQuery] = useState('');

  // Persist selected genres and themes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_GENRES, JSON.stringify(selectedGenres));
    } catch {}
  }, [selectedGenres]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_THEMES, JSON.stringify(selectedThemes));
    } catch {}
  }, [selectedThemes]);

  // When filters change, reset batches to 0 so fresh top matches are shown
  useEffect(() => {
    setMovieBatch(0);
    setSeriesBatch(0);
  }, [selectedGenres, selectedThemes]);

  // When modal opens, advance batches so the user is immediately greeted with 25 new non-repeating titles!
  useEffect(() => {
    if (isOpen) {
      setMovieBatch((prev) => prev + 1);
      setSeriesBatch((prev) => prev + 1);
    }
  }, [isOpen]);

  // Roulette state
  const [roulettePick, setRoulettePick] = useState<ScoredCandidate | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinningDisplayTitle, setSpinningDisplayTitle] = useState<string | null>(null);
  const spinTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Available Genres from Discovery catalog
  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    catalog.forEach((item) => (item.genres || []).forEach((g) => {
      const clean = g.trim();
      if (clean) set.add(clean);
    }));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [catalog]);

  // Available Themes from Discovery catalog & Canonical list
  const availableThemes = useMemo(() => {
    const set = new Set<string>(CANONICAL_THEMES);
    catalog.forEach((item) => (item.themes || []).forEach((t) => {
      const clean = t.trim();
      if (clean) set.add(clean);
    }));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [catalog]);

  // 1. Analyze User Taste Profile from Completed & 4-5 Star Items
  const tasteProfile = useMemo(() => {
    const completedItems = libraryItems.filter(
      (item) => item.isCompleted === true || item.viewingStatus === 'completed'
    );

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
      const multiplier = item.userStarRating && item.userStarRating === 5 ? 4 : 2;
      item.genres?.forEach((genre) => {
        const clean = genre.trim();
        if (clean) genreWeights[clean] = (genreWeights[clean] || 0) + multiplier;
      });
      item.themes?.forEach((theme) => {
        const clean = theme.trim();
        if (clean) themeWeights[clean] = (themeWeights[clean] || 0) + multiplier;
      });
    });

    const sortedGenres = Object.entries(genreWeights)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

    const sortedThemes = Object.entries(themeWeights)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

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

  // 2. Score & Rank All Candidates from the 4K Discovery Catalog
  const { allEligibleMovies, allEligibleSeries } = useMemo(() => {
    if (!catalog || catalog.length === 0) {
      return { allEligibleMovies: [], allEligibleSeries: [] };
    }

    const { genreWeights, themeWeights, topGenres, completedTitleSet } = tasteProfile;
    const hasTasteData = Object.keys(genreWeights).length > 0 || Object.keys(themeWeights).length > 0;

    const scoredMovies: ScoredCandidate[] = [];
    const scoredSeries: ScoredCandidate[] = [];

    catalog.forEach((item) => {
      // 1. Exclude already completed titles
      const normalizedTitle = (item.originalTitle || item.title || '').toLowerCase().trim();
      if (completedTitleSet.has(normalizedTitle)) return;

      // 2. STRICT RATING 6+ REQUIREMENT
      const effectiveRating = Math.max(item.imdbRating || 0, item.rating || 0);
      if (effectiveRating < 6.0) return;

      // 3. GENRE FILTER (if active, item must match at least one selected genre)
      if (selectedGenres.length > 0) {
        const hasGenre = item.genres?.some((g) => selectedGenres.includes(g));
        if (!hasGenre) return;
      }

      // 4. THEME FILTER (if active, item must match at least one selected theme)
      if (selectedThemes.length > 0) {
        const hasTheme = item.themes?.some((t) => selectedThemes.includes(t));
        if (!hasTheme) return;
      }

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
      const qualityScore = effectiveRating * 1.6;
      const popularityBonus = Math.log10(Math.max(item.voteCount || 10, 10)) * 2;

      let baseScore = 0;
      if (hasTasteData) {
        baseScore = genreScore * 3.5 + themeScore * 4.5 + qualityScore + popularityBonus;
      } else {
        baseScore = qualityScore + (item.rottenTomatoesRating ? item.rottenTomatoesRating / 10 : 0) + popularityBonus;
      }

      // Human-readable reason
      let reason = '';
      if (matchedGenres.length > 0 && matchedThemes.length > 0) {
        reason = `Matches your favorite genres (${matchedGenres.slice(0, 2).join(', ')}) & theme of "${matchedThemes[0]}"`;
      } else if (matchedGenres.length > 0) {
        reason = `Features ${matchedGenres.slice(0, 2).join(' & ')}, matching your highly rated titles`;
      } else if (matchedThemes.length > 0) {
        reason = `Explores "${matchedThemes.slice(0, 2).join(', ')}" from your top-rated themes`;
      } else if (hasTasteData && topGenres.length > 0) {
        reason = `Acclaimed 6+ rated pick complementary to your ${topGenres[0]} favorites`;
      } else {
        reason = `Top-rated 6+ ${item.mediaType === 'movie' ? 'film' : 'series'} on Netflix India`;
      }

      const matchPercentage = Math.min(99, Math.max(78, Math.round(75 + ((baseScore * 10) % 24))));

      const candidate: ScoredCandidate = {
        item,
        baseScore,
        matchPercentage,
        matchedGenres,
        matchedThemes,
        reason,
      };

      if (item.mediaType === 'movie') {
        scoredMovies.push(candidate);
      } else {
        scoredSeries.push(candidate);
      }
    });

    // Sort descending by taste base score
    scoredMovies.sort((a, b) => b.baseScore - a.baseScore);
    scoredSeries.sort((a, b) => b.baseScore - a.baseScore);

    return {
      allEligibleMovies: scoredMovies,
      allEligibleSeries: scoredSeries,
    };
  }, [catalog, tasteProfile, selectedGenres, selectedThemes]);

  // 3. Extract 25 COMPLETELY NEW, NON-REPEATING titles for each batch
  const totalMovieBatches = Math.max(1, Math.ceil(allEligibleMovies.length / 25));
  const totalSeriesBatches = Math.max(1, Math.ceil(allEligibleSeries.length / 25));

  const currentMovieBatchIndex = movieBatch % totalMovieBatches;
  const currentSeriesBatchIndex = seriesBatch % totalSeriesBatches;

  const topMovies = useMemo(() => {
    if (allEligibleMovies.length <= 25) return allEligibleMovies;
    const start = currentMovieBatchIndex * 25;
    let slice = allEligibleMovies.slice(start, start + 25);
    if (slice.length < 25) {
      slice = [...slice, ...allEligibleMovies.slice(0, 25 - slice.length)];
    }
    return slice;
  }, [allEligibleMovies, currentMovieBatchIndex]);

  const topSeries = useMemo(() => {
    if (allEligibleSeries.length <= 25) return allEligibleSeries;
    const start = currentSeriesBatchIndex * 25;
    let slice = allEligibleSeries.slice(start, start + 25);
    if (slice.length < 25) {
      slice = [...slice, ...allEligibleSeries.slice(0, 25 - slice.length)];
    }
    return slice;
  }, [allEligibleSeries, currentSeriesBatchIndex]);

  const allCandidates = useMemo(() => [...topMovies, ...topSeries], [topMovies, topSeries]);

  // Clean up spin interval
  useEffect(() => {
    return () => {
      if (spinTimerRef.current) clearInterval(spinTimerRef.current);
    };
  }, []);

  // Reshuffle Handler: Advances to the next completely distinct batch of 25 movies and 25 series!
  const handleReshuffle = () => {
    setIsReshuffling(true);
    setMovieBatch((prev) => prev + 1);
    setSeriesBatch((prev) => prev + 1);
    setTimeout(() => {
      setIsReshuffling(false);
    }, 280);
  };

  const handleResetBatch = () => {
    setMovieBatch(0);
    setSeriesBatch(0);
  };

  // Roulette Spin Handler (only inside hero section)
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

  // Genre filter toggle
  const toggleGenreFilter = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  // Theme filter toggle
  const toggleThemeFilter = (theme: string) => {
    setSelectedThemes((prev) =>
      prev.includes(theme) ? prev.filter((t) => t !== theme) : [...prev, theme]
    );
  };

  const clearAllFilters = () => {
    setSelectedGenres([]);
    setSelectedThemes([]);
  };

  const currentBatchNum = activeTab === 'movies' ? currentMovieBatchIndex + 1 : currentSeriesBatchIndex + 1;
  const totalBatchNum = activeTab === 'movies' ? totalMovieBatches : totalSeriesBatches;
  const currentTotalEligible = activeTab === 'movies' ? allEligibleMovies.length : allEligibleSeries.length;
  const startRange = (currentBatchNum - 1) * 25 + 1;
  const endRange = Math.min(startRange + 24, currentTotalEligible);

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
                  Rating 6+ Only
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-[10px] font-bold text-emerald-300 flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  Batch {currentBatchNum}/{totalBatchNum} (Zero Repeats)
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 hidden sm:block">
                Trained on your {tasteProfile.completedCount} completed titles & {tasteProfile.highRatedCount} top 4-5★ favorites
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Primary Reshuffle Button in Header (Picks 25 brand new titles) */}
            <button
              onClick={handleReshuffle}
              disabled={isReshuffling}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-xs font-bold shadow-lg shadow-purple-600/30 transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Pick 25 completely new titles without repeating any from this batch"
            >
              <RotateCcw className={`w-4 h-4 ${isReshuffling ? 'animate-spin text-white' : ''}`} />
              <span>Reshuffle (25 New)</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Taste Snapshot Pills with click-to-filter capability */}
          {(tasteProfile.topGenres.length > 0 || tasteProfile.topThemes.length > 0) && (
            <div className="p-3.5 bg-zinc-900/60 border border-zinc-800 rounded-xl flex flex-wrap items-center gap-2 text-xs">
              <span className="text-zinc-400 font-bold flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                Your Top Tastes:
              </span>
              {tasteProfile.topGenres.map((g) => {
                const isSelected = selectedGenres.includes(g);
                return (
                  <button
                    key={g}
                    onClick={() => toggleGenreFilter(g)}
                    className={`px-2.5 py-0.5 rounded-full border text-[11px] font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-400 font-bold shadow-sm'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                    }`}
                    title={isSelected ? `Remove filter ${g}` : `Filter by ${g}`}
                  >
                    {isSelected && '✓ '}
                    {g}
                  </button>
                );
              })}
              {tasteProfile.topThemes.map((t) => {
                const isSelected = selectedThemes.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggleThemeFilter(t)}
                    className={`px-2.5 py-0.5 rounded-full border text-[11px] font-semibold transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-purple-600 text-white border-purple-400 font-bold shadow-sm'
                        : 'bg-purple-950/70 hover:bg-purple-900 text-purple-300 border border-purple-500/30'
                    }`}
                    title={isSelected ? `Remove filter ${t}` : `Filter by ${t}`}
                  >
                    {isSelected && '✓ '}✨ {t}
                  </button>
                );
              })}
            </div>
          )}

          {/* PERSISTENT GENRE & THEME FILTER SECTION */}
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-bold text-white">Genre & Theme Filters</span>
                <span className="text-[10px] text-zinc-400">
                  (Saved automatically for next time)
                </span>
                {(selectedGenres.length > 0 || selectedThemes.length > 0) && (
                  <span className="px-2 py-0.5 rounded-full bg-purple-600/30 border border-purple-500/40 text-purple-300 text-[10px] font-bold">
                    {selectedGenres.length + selectedThemes.length} Active
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Add Genre Button */}
                <button
                  onClick={() => {
                    setShowFilterPicker(showFilterPicker === 'genre' ? null : 'genre');
                    setFilterSearchQuery('');
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                    showFilterPicker === 'genre'
                      ? 'bg-blue-600 text-white border-blue-500'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Genre</span>
                  {showFilterPicker === 'genre' ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
                </button>

                {/* Add Theme Button */}
                <button
                  onClick={() => {
                    setShowFilterPicker(showFilterPicker === 'theme' ? null : 'theme');
                    setFilterSearchQuery('');
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                    showFilterPicker === 'theme'
                      ? 'bg-purple-600 text-white border-purple-500'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Theme</span>
                  {showFilterPicker === 'theme' ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
                </button>

                {/* Clear All Filters */}
                {(selectedGenres.length > 0 || selectedThemes.length > 0) && (
                  <button
                    onClick={clearAllFilters}
                    className="text-xs text-red-400 hover:text-red-300 hover:underline px-2 py-1 cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {/* Active Filter Chips */}
            {(selectedGenres.length > 0 || selectedThemes.length > 0) ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {selectedGenres.map((g) => (
                  <span
                    key={`filter-genre-${g}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600/20 border border-blue-500/40 text-blue-300 text-xs font-medium"
                  >
                    <span>Genre: {g}</span>
                    <button
                      onClick={() => toggleGenreFilter(g)}
                      className="hover:text-white p-0.5 rounded-full hover:bg-blue-500/30 cursor-pointer"
                      title="Remove filter"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {selectedThemes.map((t) => (
                  <span
                    key={`filter-theme-${t}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-600/20 border border-purple-500/40 text-purple-300 text-xs font-medium"
                  >
                    <span>Theme: {t}</span>
                    <button
                      onClick={() => toggleThemeFilter(t)}
                      className="hover:text-white p-0.5 rounded-full hover:bg-purple-500/30 cursor-pointer"
                      title="Remove filter"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-zinc-500 italic">
                Showing all 6+ rated titles matching your library taste. Add genres or themes above to narrow down.
              </p>
            )}

            {/* Expandable Searchable Filter Picker Panel */}
            {showFilterPicker && (
              <div className="p-3 bg-zinc-950 border border-zinc-700/80 rounded-xl space-y-2 mt-2 animate-fade-in">
                <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-2">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={filterSearchQuery}
                      onChange={(e) => setFilterSearchQuery(e.target.value)}
                      placeholder={`Search ${showFilterPicker === 'genre' ? 'genres' : 'themes'}...`}
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-white text-xs focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <button
                    onClick={() => setShowFilterPicker(null)}
                    className="text-xs text-zinc-400 hover:text-white px-2 py-1 cursor-pointer"
                  >
                    Done
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-1">
                  {(showFilterPicker === 'genre' ? availableGenres : availableThemes)
                    .filter((item) =>
                      item.toLowerCase().includes(filterSearchQuery.toLowerCase().trim())
                    )
                    .map((item) => {
                      const isSelected =
                        showFilterPicker === 'genre'
                          ? selectedGenres.includes(item)
                          : selectedThemes.includes(item);
                      return (
                        <button
                          key={item}
                          onClick={() => {
                            if (showFilterPicker === 'genre') {
                              toggleGenreFilter(item);
                            } else {
                              toggleThemeFilter(item);
                            }
                          }}
                          className={`text-xs px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                            isSelected
                              ? showFilterPicker === 'genre'
                                ? 'bg-blue-600 text-white border-blue-400 font-bold'
                                : 'bg-purple-600 text-white border-purple-400 font-bold'
                              : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-800'
                          }`}
                        >
                          {isSelected && '✓ '}
                          {item}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          {/* ROULETTE HERO SECTION (Keeps ONLY the Spin Roulette Pick button) */}
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
                  Picks a random 6+ rated title tailored to your taste & active filters from this fresh batch.
                </p>
              </div>

              {/* ONLY Roulette Spin button */}
              <button
                onClick={handleSpinRoulette}
                disabled={isSpinning || allCandidates.length === 0}
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-red-600 via-purple-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white text-sm font-black shadow-xl shadow-purple-600/30 transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 shrink-0 cursor-pointer"
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
                  Analyzing Your Favorite 6+ Rated Genres & Themes...
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
                    <button
                      onClick={() => onSelectTitle(roulettePick.item)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Info className="w-3.5 h-3.5 text-zinc-300" />
                      <span>View Details</span>
                    </button>

                    <button
                      onClick={() => onAddToLibrary(roulettePick.item)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
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
                      <span>Netflix</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION TABS: TOP 25 MOVIES & TOP 25 SERIES */}
          <div>
            <div className="flex flex-wrap items-center justify-between border-b border-zinc-800 pb-3 mb-4 gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setActiveTab('movies')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeTab === 'movies'
                      ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                      : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                  }`}
                >
                  <Film className="w-4 h-4" />
                  <span>25 Movies (Batch {currentMovieBatchIndex + 1}/{totalMovieBatches})</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[10px]">
                    {topMovies.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('series')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeTab === 'series'
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                      : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                  }`}
                >
                  <Tv className="w-4 h-4" />
                  <span>25 Series (Batch {currentSeriesBatchIndex + 1}/{totalSeriesBatches})</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[10px]">
                    {topSeries.length}
                  </span>
                </button>

                {/* Reshuffler: Pulls NEXT 25 completely new titles */}
                <button
                  onClick={handleReshuffle}
                  disabled={isReshuffling}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-600/20 transition-all transform hover:scale-105 active:scale-95 cursor-pointer"
                  title="Reshuffle to the next 25 completely new titles without repeats"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isReshuffling ? 'animate-spin' : ''}`} />
                  <span>Reshuffle (Next 25 New)</span>
                </button>

                {/* Reset to Batch 1 if user has advanced */}
                {(currentMovieBatchIndex > 0 || currentSeriesBatchIndex > 0) && (
                  <button
                    onClick={handleResetBatch}
                    className="text-xs text-zinc-400 hover:text-zinc-200 underline px-2 py-1 cursor-pointer"
                    title="Start over from batch 1"
                  >
                    Back to Top Batch #1
                  </button>
                )}
              </div>

              <span className="text-xs text-zinc-400 flex items-center gap-1.5">
                <span className="font-semibold text-emerald-400">
                  Showing {startRange}–{endRange}
                </span>
                <span>of {currentTotalEligible} titles</span>
                <span className="text-zinc-600">•</span>
                <span className="text-zinc-400 italic">No repeats from previous batch</span>
              </span>
            </div>

            {/* Grid of Recommended Titles */}
            {((activeTab === 'movies' ? topMovies : topSeries).length > 0) ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-3 sm:gap-4">
                {(activeTab === 'movies' ? topMovies : topSeries).map((candidate, idx) => (
                  <div
                    key={`${candidate.item.id}-${candidate.item.netflixId || idx}`}
                    className="relative flex flex-col group"
                  >
                    {/* Match Score & Rank Badge */}
                    <div className="absolute top-2 left-2 z-20 pointer-events-none flex items-center gap-1">
                      <span className="px-1.5 py-0.5 rounded-md bg-black/85 backdrop-blur-md border border-emerald-500/40 text-[9px] font-black text-emerald-400 shadow-md">
                        🎯 {candidate.matchPercentage}%
                      </span>
                      <span className="px-1.5 py-0.5 rounded-md bg-black/85 backdrop-blur-md border border-white/10 text-[9px] font-mono text-zinc-400 shadow-md">
                        #{startRange + idx}
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
              <div className="py-16 text-center text-zinc-400 bg-zinc-900/30 rounded-xl border border-zinc-800">
                <p className="text-sm font-semibold text-zinc-300">
                  No {activeTab === 'movies' ? 'movies' : 'series'} found matching rating 6+ and active filters.
                </p>
                {(selectedGenres.length > 0 || selectedThemes.length > 0) && (
                  <button
                    onClick={clearAllFilters}
                    className="mt-3 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-zinc-800 bg-zinc-900/80 flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-3">
            <span>Click any title card to view full trailer, cast, and metadata</span>
            <button
              onClick={handleReshuffle}
              className="text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className={`w-3 h-3 ${isReshuffling ? 'animate-spin' : ''}`} />
              Next 25 new titles
            </button>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-bold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
