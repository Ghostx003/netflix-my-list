import React, { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Film, Tv, Shuffle, Sparkles } from 'lucide-react';
import { DiscoveryTitle, RecommendationRowData } from '../../types';
import { RecommendationCard } from './RecommendationCard';

interface RecommendationRowProps {
  row: RecommendationRowData;
  libraryItems: any[];
  onOpenDetail: (item: DiscoveryTitle) => void;
  onAddToLibrary: (item: DiscoveryTitle) => void;
  onStartWatching?: (item: DiscoveryTitle) => void;
  onSelectLovedTitle?: (title: string) => void;
}

export const RecommendationRow: React.FC<RecommendationRowProps> = ({
  row,
  libraryItems,
  onOpenDetail,
  onAddToLibrary,
  onStartWatching,
  onSelectLovedTitle,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Toggle state for Movie vs Series when supported by row
  const [activeMode, setActiveMode] = useState<'movie' | 'tv'>(
    row.toggleOptions?.activeMode || 'movie'
  );

  // Synchronize toggle state when row changes
  useEffect(() => {
    if (row.toggleOptions?.activeMode) {
      setActiveMode(row.toggleOptions.activeMode);
    }
  }, [row.id, row.toggleOptions?.anchorTitle]);

  const displayedItems = row.toggleOptions
    ? activeMode === 'movie'
      ? row.toggleOptions.movieItems
      : row.toggleOptions.tvItems
    : row.items;

  // Dynamic row title
  const displayedTitle = row.toggleOptions
    ? activeMode === 'movie'
      ? `Since you loved "${row.toggleOptions.anchorTitle}", here are some movies`
      : `Since you loved "${row.toggleOptions.anchorTitle}", here are some series`
    : row.title;

  const displayedSubtitle = row.toggleOptions
    ? activeMode === 'movie'
      ? 'Feature films sharing the same concept, tension, and storytelling'
      : 'Binge-worthy shows with deep world-building and mind-bending mystery'
    : row.subtitle;

  const checkScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
    setCanScrollLeft(scrollLeft > 20);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 20);
  };

  const handleScroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    const { clientWidth } = scrollContainerRef.current;
    const scrollAmount = direction === 'left' ? -clientWidth * 0.75 : clientWidth * 0.75;
    scrollContainerRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    setTimeout(checkScroll, 350);
  };

  const isTitleInLibrary = (item: DiscoveryTitle) => {
    return libraryItems.some(
      (lib) =>
        (item.netflixId && lib.videoId === item.netflixId) ||
        (item.tmdbId && lib.externalId === item.tmdbId) ||
        (item.imdbId && lib.imdbId === item.imdbId) ||
        lib.originalTitle.toLowerCase().trim() === item.title.toLowerCase().trim()
    );
  };

  const handleShuffleLoved = () => {
    if (!row.toggleOptions?.availableLovedTitles || !onSelectLovedTitle) return;
    const available = row.toggleOptions.availableLovedTitles.filter(
      (t) => t.toLowerCase() !== row.toggleOptions?.anchorTitle.toLowerCase()
    );
    if (available.length > 0) {
      const nextTitle = available[Math.floor(Math.random() * available.length)];
      onSelectLovedTitle(nextTitle);
    }
  };

  if (!displayedItems || displayedItems.length === 0) return null;

  const isLovedRow = row.type === 'loved_similar';

  return (
    <div
      className={`relative py-5 px-4 sm:px-8 lg:px-14 group/row select-none transition-all ${
        isLovedRow
          ? 'bg-gradient-to-r from-red-950/25 via-zinc-950/40 to-transparent border-y border-red-900/20 sm:rounded-3xl shadow-xl'
          : ''
      }`}
    >
      {/* Row Header */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          {isLovedRow && (
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-600/25 text-red-400 border border-red-500/40 shadow-sm shadow-red-950/50">
                <Sparkles className="w-3 h-3 text-red-400 animate-pulse" />
                BECAUSE YOU LOVED
              </span>
            </div>
          )}

          <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-2 group-hover/row:text-red-400 transition-colors">
            {row.toggleOptions?.anchorTitle ? (
              <span className="flex items-center gap-2 flex-wrap">
                <span className="text-zinc-200">Since you loved</span>
                <span className="text-[#E50914] font-black underline decoration-red-600/40 underline-offset-4 drop-shadow-md">
                  "{row.toggleOptions.anchorTitle}"
                </span>
                <span className="text-zinc-200">, here are some {activeMode === 'movie' ? 'movies' : 'series'}</span>
              </span>
            ) : (
              <span>{displayedTitle}</span>
            )}
          </h2>

          {displayedSubtitle && (
            <p className="text-xs sm:text-sm text-zinc-300 font-medium mt-1">
              {displayedSubtitle}
            </p>
          )}
        </div>

        {/* Interactive Movie / Series Toggle */}
        {row.toggleOptions && (
          <div className="flex items-center gap-1.5 self-start sm:self-auto bg-zinc-900/95 p-1.5 rounded-full border border-white/10 shadow-xl backdrop-blur-xl shrink-0">
            <button
              onClick={() => setActiveMode('movie')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                activeMode === 'movie'
                  ? 'bg-[#E50914] text-white shadow-lg shadow-red-900/40'
                  : 'text-zinc-300 hover:text-white hover:bg-white/5'
              }`}
              title="Show movies similar to your loved title"
            >
              <Film className="w-3.5 h-3.5" />
              <span>Movies ({row.toggleOptions.movieItems.length})</span>
            </button>

            <button
              onClick={() => setActiveMode('tv')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                activeMode === 'tv'
                  ? 'bg-[#E50914] text-white shadow-lg shadow-red-900/40'
                  : 'text-zinc-300 hover:text-white hover:bg-white/5'
              }`}
              title="Show series similar to your loved title"
            >
              <Tv className="w-3.5 h-3.5" />
              <span>Series ({row.toggleOptions.tvItems.length})</span>
            </button>

            {row.toggleOptions.availableLovedTitles && row.toggleOptions.availableLovedTitles.length > 1 && (
              <button
                onClick={handleShuffleLoved}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-white/10 rounded-full transition-all ml-1 cursor-pointer active:scale-95"
                title="Shuffle to another loved 5-star title from your history"
              >
                <Shuffle className="w-3 h-3 text-red-500" />
                <span className="hidden md:inline">Try Another</span>
              </button>
            )}
          </div>
        )}
      </div>


      {/* Slider Carousel Container */}
      <div className="relative">
        {/* Left Arrow Button */}
        {canScrollLeft && (
          <button
            onClick={() => handleScroll('left')}
            className="absolute left-0 top-0 bottom-0 z-40 w-10 sm:w-12 bg-black/60 hover:bg-black/90 text-white flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity backdrop-blur-sm rounded-r"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
        )}

        {/* Scrollable Items Container */}
        <div
          ref={scrollContainerRef}
          onScroll={checkScroll}
          className="flex items-center gap-3 sm:gap-4 overflow-x-auto scrollbar-none scroll-smooth py-2 px-1"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {displayedItems.map((candidate) => (
            <RecommendationCard
              key={candidate.item.id || candidate.item.title}
              candidate={candidate}
              isInLibrary={isTitleInLibrary(candidate.item)}
              onClick={() => onOpenDetail(candidate.item)}
              onAddToLibrary={onAddToLibrary}
              onStartWatching={onStartWatching}
            />
          ))}
        </div>

        {/* Right Arrow Button */}
        {canScrollRight && (
          <button
            onClick={() => handleScroll('right')}
            className="absolute right-0 top-0 bottom-0 z-40 w-10 sm:w-12 bg-black/60 hover:bg-black/90 text-white flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity backdrop-blur-sm rounded-l"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-8 h-8" />
          </button>
        )}
      </div>
    </div>
  );
};
