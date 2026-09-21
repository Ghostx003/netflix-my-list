import React, { useState, useMemo } from 'react';
import {
  X,
  Sparkles,
  Film,
  Tv,
  Star,
  Clock,
  Calendar,
  Layers,
  Play,
  Filter,
  MinusCircle,
  RotateCcw,
  Search,
  Check,
  Plus,
  Compass,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { DiscoveryTitle } from '../types';
import { formatRuntime } from '../services/analytics';
import { getNetflixUrl, openNetflixInNewTab } from '../services/normalizer';
import { CachedImage } from './CachedImage';

interface TagExploreModalProps {
  isOpen: boolean;
  onClose: () => void;
  tag: string;
  tagType?: 'genre' | 'theme';
  catalog: DiscoveryTitle[];
  onSelectTitle: (title: DiscoveryTitle) => void;
  onAddToLibrary?: (item: DiscoveryTitle) => void;
  onStartWatching?: (item: DiscoveryTitle) => void;
  isInLibrary?: (item: DiscoveryTitle) => boolean;
}

export const TagExploreModal: React.FC<TagExploreModalProps> = ({
  isOpen,
  onClose,
  tag: initialTag,
  tagType: initialTagType = 'genre',
  catalog,
  onSelectTitle,
  onAddToLibrary,
  onStartWatching,
  isInLibrary,
}) => {
  // Active primary tag (supports switching within modal)
  const [activeTag, setActiveTag] = useState(initialTag);
  const [activeTagType, setActiveTagType] = useState(initialTagType);
  const [tagHistory, setTagHistory] = useState<Array<{ tag: string; type: 'genre' | 'theme' }>>([]);

  // Type Filter: 'all' | 'movie' | 'tv'
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'movie' | 'tv'>('all');

  // Excluded categories (Set of genre/theme names to exclude, e.g. "Romance")
  const [excludedCategories, setExcludedCategories] = useState<string[]>([]);
  // Collapsible toggle for category exclusions (hidden by default)
  const [isExclusionsExpanded, setIsExclusionsExpanded] = useState(false);

  // Search input to filter co-occurring categories to exclude
  const [categorySearchQuery, setCategorySearchQuery] = useState('');

  // Keep activeTag in sync if initialTag changes
  React.useEffect(() => {
    setActiveTag(initialTag);
    setActiveTagType(initialTagType);
    setExcludedCategories([]);
    setTagHistory([]);
  }, [initialTag, initialTagType]);

  const handleSwitchTag = (newTag: string, newType: 'genre' | 'theme') => {
    setTagHistory((prev) => [...prev, { tag: activeTag, type: activeTagType }]);
    setActiveTag(newTag);
    setActiveTagType(newType);
    setExcludedCategories([]);
  };

  const handleBackTag = () => {
    if (tagHistory.length === 0) return;
    const prev = tagHistory[tagHistory.length - 1];
    setTagHistory((h) => h.slice(0, -1));
    setActiveTag(prev.tag);
    setActiveTagType(prev.type);
    setExcludedCategories([]);
  };

  const handleToggleExclude = (cat: string) => {
    const norm = cat.trim();
    setExcludedCategories((prev) => {
      const exists = prev.some((c) => c.toLowerCase() === norm.toLowerCase());
      if (exists) {
        return prev.filter((c) => c.toLowerCase() !== norm.toLowerCase());
      } else {
        return [...prev, norm];
      }
    });
  };

  const handleClearExclusions = () => {
    setExcludedCategories([]);
  };

  // 1. Raw pool of titles matching the primary tag
  const matchingPool = useMemo(() => {
    const targetNorm = activeTag.toLowerCase().trim();
    if (!targetNorm) return [];

    return catalog.filter((title) => {
      // Check genres
      const hasGenre = (title.genres || []).some(
        (g) => g.toLowerCase().trim() === targetNorm
      );
      // Check themes
      const hasTheme = (title.themes || []).some(
        (t) => t.toLowerCase().trim() === targetNorm
      );
      // Check keywords
      const hasKeyword = (title.tmdbKeywords || []).some(
        (k) => k.toLowerCase().trim() === targetNorm
      );

      return hasGenre || hasTheme || hasKeyword;
    });
  }, [catalog, activeTag]);

  // Counts for media type toggle (before exclusions)
  const allCount = matchingPool.length;
  const moviesCount = matchingPool.filter((t) => t.mediaType === 'movie').length;
  const tvCount = matchingPool.filter((t) => t.mediaType === 'tv').length;

  // 2. Titles filtered by media type
  const typeFilteredTitles = useMemo(() => {
    if (mediaTypeFilter === 'all') return matchingPool;
    return matchingPool.filter((t) => t.mediaType === mediaTypeFilter);
  }, [matchingPool, mediaTypeFilter]);

  // 3. Find all co-occurring categories (genres and themes) present in typeFilteredTitles
  const coOccurringCategories = useMemo(() => {
    const counts = new Map<string, { name: string; count: number; isTheme: boolean }>();
    const activeNorm = activeTag.toLowerCase().trim();

    for (const title of typeFilteredTitles) {
      // Collect genres
      for (const g of title.genres || []) {
        const norm = g.trim();
        if (norm.toLowerCase() !== activeNorm) {
          const key = `genre_${norm.toLowerCase()}`;
          const existing = counts.get(key) || { name: norm, count: 0, isTheme: false };
          existing.count++;
          counts.set(key, existing);
        }
      }

      // Collect themes
      for (const t of title.themes || []) {
        const norm = t.trim();
        if (norm.toLowerCase() !== activeNorm) {
          const key = `theme_${norm.toLowerCase()}`;
          const existing = counts.get(key) || { name: norm, count: 0, isTheme: true };
          existing.count++;
          counts.set(key, existing);
        }
      }
    }

    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }, [typeFilteredTitles, activeTag]);

  // Filter co-occurring categories by search input
  const visibleCoOccurring = useMemo(() => {
    const q = categorySearchQuery.toLowerCase().trim();
    if (!q) return coOccurringCategories;
    return coOccurringCategories.filter((c) => c.name.toLowerCase().includes(q));
  }, [coOccurringCategories, categorySearchQuery]);

  // 4. Final filtered titles applying category exclusions
  const finalTitles = useMemo(() => {
    if (excludedCategories.length === 0) return typeFilteredTitles;

    const excludedNorms = new Set(
      excludedCategories.map((c) => c.toLowerCase().trim())
    );

    return typeFilteredTitles.filter((title) => {
      // Check if title has ANY of the excluded genres
      const hasExcludedGenre = (title.genres || []).some((g) =>
        excludedNorms.has(g.toLowerCase().trim())
      );
      if (hasExcludedGenre) return false;

      // Check if title has ANY of the excluded themes
      const hasExcludedTheme = (title.themes || []).some((t) =>
        excludedNorms.has(t.toLowerCase().trim())
      );
      if (hasExcludedTheme) return false;

      return true;
    });
  }, [typeFilteredTitles, excludedCategories]);

  const excludedCount = typeFilteredTitles.length - finalTitles.length;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl text-white scrollbar-thin scrollbar-thumb-zinc-700 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Header Bar */}
        <div className="sticky top-0 z-30 px-5 py-4 bg-zinc-900/95 backdrop-blur-md border-b border-zinc-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {tagHistory.length > 0 && (
              <button
                type="button"
                onClick={handleBackTag}
                className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-zinc-200 border border-zinc-700 cursor-pointer flex items-center gap-1 shrink-0"
              >
                ← Back
              </button>
            )}

            <div className="flex items-center gap-2 min-w-0">
              <span className="p-2 rounded-xl bg-purple-950/80 border border-purple-500/40 text-purple-300">
                {activeTagType === 'theme' ? (
                  <Sparkles className="w-5 h-5 text-purple-400" />
                ) : (
                  <Filter className="w-5 h-5 text-red-500" />
                )}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-xl font-black text-white truncate">
                    {activeTag}
                  </h2>
                  <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                    {activeTagType}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 truncate">
                  Available in Netflix India catalog ({allCount} total)
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-zinc-800 hover:bg-[#E50914] text-zinc-300 hover:text-white transition-colors border border-zinc-700 cursor-pointer shrink-0"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Controls: Media Type Toggle + Category Exclusions */}
        <div className="p-5 border-b border-zinc-800/80 bg-zinc-950/50 space-y-4">
          {/* Row 1: Content Type Toggle Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-900 border border-zinc-800">
              <button
                type="button"
                onClick={() => setMediaTypeFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  mediaTypeFilter === 'all'
                    ? 'bg-[#E50914] text-white shadow-md'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                All ({allCount})
              </button>
              <button
                type="button"
                onClick={() => setMediaTypeFilter('movie')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  mediaTypeFilter === 'movie'
                    ? 'bg-[#E50914] text-white shadow-md'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                <span>Movies ({moviesCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setMediaTypeFilter('tv')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  mediaTypeFilter === 'tv'
                    ? 'bg-[#E50914] text-white shadow-md'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <Tv className="w-3.5 h-3.5" />
                <span>TV Shows ({tvCount})</span>
              </button>
            </div>

            {/* Title Results Count Info */}
            <div className="text-xs text-zinc-400 font-medium">
              Showing <span className="text-white font-bold">{finalTitles.length}</span> titles
              {excludedCount > 0 && (
                <span className="text-red-400 ml-1.5 font-semibold">
                  ({excludedCount} excluded via -minus filters)
                </span>
              )}
            </div>
          </div>

          {/* Row 2: EXCLUDE CATEGORIES BAR (Collapsible & Minimized by default) */}
          <div className="space-y-2 pt-1 border-t border-zinc-800/60">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsExclusionsExpanded(!isExclusionsExpanded)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-xs font-bold text-zinc-200 hover:text-white cursor-pointer transition-colors shadow-sm"
              >
                <MinusCircle className={`w-4 h-4 ${excludedCategories.length > 0 ? 'text-red-400' : 'text-zinc-400'}`} />
                <span>Exclude / Minus Categories</span>
                {excludedCategories.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-red-600 text-white text-[10px] font-black">
                    {excludedCategories.length} active
                  </span>
                )}
                {isExclusionsExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5 text-zinc-400 ml-0.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-400 ml-0.5" />
                )}
              </button>

              {excludedCategories.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearExclusions}
                  className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 font-bold hover:underline cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Clear all exclusions ({excludedCategories.length})</span>
                </button>
              )}
            </div>

            {/* Currently Active Excluded Pills (Always visible if any category is excluded) */}
            {excludedCategories.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl bg-red-950/30 border border-red-900/40">
                <span className="text-[11px] font-bold text-red-300 flex items-center gap-1">
                  Active Exclusions:
                </span>
                {excludedCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleToggleExclude(cat)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md cursor-pointer transition-all transform hover:scale-105"
                    title={`Click to remove exclusion for ${cat}`}
                  >
                    <span>- {cat}</span>
                    <X className="w-3 h-3 ml-0.5" />
                  </button>
                ))}
              </div>
            )}

            {/* Expanded List of Co-occurring Category Chips & Search (Hidden by default) */}
            {isExclusionsExpanded && (
              <div className="space-y-2 p-3 bg-zinc-900/90 rounded-xl border border-zinc-800 animate-fade-in">
                <p className="text-[11px] text-zinc-400">
                  Click any category to minus/exclude it from the titles matching "{activeTag}":
                </p>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  {coOccurringCategories.length > 8 && (
                    <div className="relative shrink-0 w-full sm:w-48">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <input
                        type="text"
                        value={categorySearchQuery}
                        onChange={(e) => setCategorySearchQuery(e.target.value)}
                        placeholder="Search category to minus..."
                        className="w-full bg-zinc-950 border border-zinc-700/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500"
                      />
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5 max-h-28 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 p-1">
                    {visibleCoOccurring.slice(0, 30).map((cat) => {
                      const isExcluded = excludedCategories.some(
                        (c) => c.toLowerCase() === cat.name.toLowerCase()
                      );
                      return (
                        <button
                          key={cat.name}
                          type="button"
                          onClick={() => handleToggleExclude(cat.name)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                            isExcluded
                              ? 'bg-red-600 text-white border-red-500 shadow-md font-bold'
                              : 'bg-zinc-950 hover:bg-red-950/60 text-zinc-300 hover:text-red-300 border-zinc-800 hover:border-red-800/60'
                          }`}
                          title={
                            isExcluded
                              ? `Excluded: click to restore ${cat.name}`
                              : `Click to exclude / minus ${cat.name}`
                          }
                        >
                          <span className={isExcluded ? 'text-white' : 'text-red-400 font-black'}>
                            {isExcluded ? '✕' : '−'}
                          </span>
                          <span>{cat.name}</span>
                          <span className="text-[10px] opacity-70 font-mono">({cat.count})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Content Body: Title Cards Grid */}
        <div className="p-5 flex-1 overflow-y-auto">
          {finalTitles.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
              {finalTitles.map((item) => {
                const isMovie = item.mediaType === 'movie';
                const netflixUrl = getNetflixUrl({
                  videoId: item.netflixId,
                  originalTitle: item.title,
                  externalTitle: item.title,
                });
                const totalEpisodes =
                  item.totalEpisodes ||
                  (item.totalSeasons ? item.totalSeasons * 8 : undefined);
                const avgMinutes = item.averageEpisodeMinutes || 45;
                const seriesTotalMinutes = totalEpisodes
                  ? totalEpisodes * avgMinutes
                  : undefined;
                const displayRuntimeMinutes = isMovie
                  ? item.runtimeMinutes
                  : seriesTotalMinutes;

                const originCountry =
                  item.watchmodeOriginCountry ||
                  item.tmdbOriginCountry ||
                  (item.countries && item.countries.length > 0
                    ? item.countries[0]
                    : undefined);

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      onClose();
                      onSelectTitle(item);
                    }}
                    className="group cursor-pointer bg-zinc-900/90 hover:bg-zinc-850 rounded-xl overflow-hidden border border-zinc-800 hover:border-red-600/50 transition-all shadow-lg hover:shadow-2xl hover:-translate-y-1.5 flex flex-col"
                  >
                    {/* Thumbnail Poster */}
                    <div className="relative aspect-[2/3] w-full bg-zinc-800 overflow-hidden">
                      <CachedImage
                        src={item.posterPath}
                        alt={item.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />

                      {/* Ratings Overlay Top-Right */}
                      <div className="absolute top-1.5 right-1.5 z-10 flex flex-col items-end gap-1">
                        {item.rottenTomatoesRating !== undefined && (
                          <div className="bg-black/85 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-black text-red-400 border border-red-500/30">
                            🍅 {item.rottenTomatoesRating}%
                          </div>
                        )}
                        {item.imdbRating && (
                          <div className="bg-black/85 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-black text-amber-400 border border-amber-500/30">
                            IMDb {item.imdbRating}
                          </div>
                        )}
                      </div>

                      {/* Media Type & Year Overlay Top-Left */}
                      <div className="absolute top-1.5 left-1.5 z-10 flex flex-col items-start gap-1">
                        <span
                          className={`text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider ${
                            isMovie
                              ? 'bg-red-600 text-white'
                              : 'bg-purple-600 text-white'
                          }`}
                        >
                          {isMovie ? 'Movie' : 'Series'}
                        </span>
                        {item.releaseYear && (
                          <span className="bg-black/85 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-bold text-zinc-200 border border-white/10">
                            {item.releaseYear}
                          </span>
                        )}
                      </div>

                      {/* Runtime Overlay Bottom-Left */}
                      {displayRuntimeMinutes ? (
                        <div className="absolute bottom-1.5 left-1.5 z-10 bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold text-zinc-300 border border-white/10 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5 text-zinc-400" />
                          <span>{formatRuntime(displayRuntimeMinutes)}</span>
                        </div>
                      ) : null}
                    </div>

                    {/* Card Content */}
                    <div className="p-3 flex flex-col justify-between flex-1 gap-2">
                      <div>
                        <h4
                          className="text-xs sm:text-sm font-bold text-white line-clamp-1 group-hover:text-red-400 transition-colors"
                          title={item.title}
                        >
                          {item.title}
                        </h4>

                        {item.tagline && (
                          <p className="text-[10px] text-zinc-400 italic line-clamp-1 mt-0.5">
                            "{item.tagline}"
                          </p>
                        )}

                        {originCountry && (
                          <p className="text-[10px] text-emerald-400 font-medium mt-0.5">
                            🌐 {originCountry}
                          </p>
                        )}

                        {/* Co-occurring tags pills on card */}
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {item.genres?.slice(0, 2).map((g) => (
                            <span
                              key={g}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSwitchTag(g, 'genre');
                              }}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/50 cursor-pointer"
                              title={`Explore ${g}`}
                            >
                              {g}
                            </span>
                          ))}
                          {item.themes?.slice(0, 1).map((t) => (
                            <span
                              key={t}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSwitchTag(t, 'theme');
                              }}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-purple-950/70 hover:bg-purple-900 text-purple-300 border border-purple-500/40 font-semibold cursor-pointer"
                              title={`Explore theme ${t}`}
                            >
                              ✨ {t}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Card Footer: Watch on Netflix */}
                      <div className="pt-2 border-t border-zinc-800 flex items-center justify-between gap-1">
                        <a
                          href={netflixUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => {
                            e.stopPropagation();
                            openNetflixInNewTab(netflixUrl, e);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#E50914] hover:bg-red-700 text-white text-[10px] font-black cursor-pointer no-underline ml-auto"
                        >
                          <Play className="w-2.5 h-2.5 fill-white" />
                          <span>Watch</span>
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Empty State */
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-zinc-950/40 rounded-2xl border border-zinc-800 space-y-3">
              <Compass className="w-12 h-12 text-zinc-600" />
              <h3 className="text-base font-bold text-white">
                No titles matching your current filter criteria
              </h3>
              <p className="text-xs text-zinc-400 max-w-md">
                {excludedCategories.length > 0
                  ? `All ${typeFilteredTitles.length} titles tagged with "${activeTag}" contain one or more of your excluded categories: ${excludedCategories.join(', ')}.`
                  : `No ${mediaTypeFilter !== 'all' ? mediaTypeFilter : ''} titles found with "${activeTag}".`}
              </p>
              {excludedCategories.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearExclusions}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-lg transition-all"
                >
                  Clear Exclusions
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
