import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  X,
  Sparkles,
  Play,
  Film,
  Tv,
  Star,
  Clock,
  Check,
  Plus,
  ArrowRight,
  Info,
  Calendar,
  AlertCircle,
  Command,
} from 'lucide-react';
import {
  globalSearchEngine,
  SearchQueryResult,
  DidYouMeanSuggestion,
  SearchIndexItem,
  SEARCH_CONFIG,
} from '../services/searchEngine';
import { DiscoveryTitle, LibraryItem } from '../types';
import { getNetflixUrl, openNetflixInNewTab } from '../services/normalizer';
import { formatRuntime } from '../services/analytics';
import { CachedImage } from './CachedImage';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  catalog: DiscoveryTitle[];
  libraryItems: LibraryItem[];
  onOpenItemDetail: (item: DiscoveryTitle | LibraryItem) => void;
  onAddToLibrary?: (item: DiscoveryTitle | LibraryItem) => void;
  isInLibrary?: (item: DiscoveryTitle | LibraryItem) => boolean;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  catalog,
  libraryItems,
  onOpenItemDetail,
  onAddToLibrary,
  isInLibrary,
}) => {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  // Initialize or re-index search engine whenever catalog or library changes
  useEffect(() => {
    if (catalog.length > 0 || libraryItems.length > 0) {
      globalSearchEngine.initializeIndex(catalog, libraryItems);
    }
  }, [catalog, libraryItems]);

  // Focus input and reset selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(-1);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen]);

  // Debounce query input to avoid stuttering on fast typing
  useEffect(() => {
    setIsSearching(true);
    const handler = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setIsSearching(false);
      setSelectedIndex(-1); // Reset keyboard navigation when query changes
    }, SEARCH_CONFIG.DEBOUNCE_MS);

    return () => clearTimeout(handler);
  }, [query]);

  // Execute search through searchEngine
  const searchResponse = useMemo(() => {
    if (!debouncedQuery) {
      return {
        results: [],
        didYouMean: null,
        totalMatches: 0,
        parsedQuery: { originalQuery: '', titleQuery: '', yearCandidate: null },
      };
    }
    return globalSearchEngine.search(debouncedQuery);
  }, [debouncedQuery]);

  const { results, didYouMean, parsedQuery } = searchResponse;

  // Keyboard navigation handler inside modal
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    const totalNavigableItems = (didYouMean ? 1 : 0) + results.length;
    if (totalNavigableItems === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 >= totalNavigableItems ? 0 : prev + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 < 0 ? totalNavigableItems - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex === -1) {
        // If didYouMean exists and no item selected, Enter defaults to first result or correction
        if (results.length > 0) {
          handleSelectResult(results[0].item);
        } else if (didYouMean) {
          handleApplyDidYouMean(didYouMean.suggestedTitle);
        }
        return;
      }

      if (didYouMean && selectedIndex === 0) {
        // "Did you mean?" suggestion is selected
        handleApplyDidYouMean(didYouMean.suggestedTitle);
      } else {
        // Result item is selected
        const resultIdx = didYouMean ? selectedIndex - 1 : selectedIndex;
        if (results[resultIdx]) {
          handleSelectResult(results[resultIdx].item);
        }
      }
    }
  };

  // When user clicks or presses Enter on "Did you mean?"
  // STRICT REQUIREMENT: Does NOT navigate to movie page! Replaces search input, re-runs search, leaves user on search interface.
  const handleApplyDidYouMean = (suggestedTitle: string) => {
    setQuery(suggestedTitle);
    setDebouncedQuery(suggestedTitle);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  // When user explicitly clicks a movie result
  const handleSelectResult = (item: SearchIndexItem) => {
    onClose();
    onOpenItemDetail(item.sourceItem);
  };

  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-8 sm:pt-16 p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full max-w-3xl bg-[#141414] border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header Bar */}
        <div className="p-3.5 sm:p-4 border-b border-white/10 flex items-center gap-3 bg-zinc-900/90 relative">
          <Search className="w-5 h-5 text-red-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search 4,000+ movies & TV series (e.g. Inception 2010, Breaking Bad)..."
            className="w-full bg-transparent text-white placeholder-zinc-500 text-sm sm:text-base font-medium focus:outline-none pr-16"
            autoComplete="off"
            spellCheck="false"
          />

          <div className="flex items-center gap-1.5 absolute right-3.5 top-1/2 -translate-y-1/2">
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setDebouncedQuery('');
                  inputRef.current?.focus();
                }}
                className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Clear query"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded bg-black/40 border border-white/10 text-[10px] font-mono text-zinc-400">
              <span>{isMac ? '⌘' : 'Ctrl'}</span>
              <span>+</span>
              <span>Space</span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
              title="Close search (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Results / Suggestions Container */}
        <div
          ref={resultsContainerRef}
          className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3.5 scrollbar-thin scrollbar-thumb-zinc-700"
        >
          {/* Index loading banner if database empty or still indexing */}
          {!globalSearchEngine.getIsReady() && (
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-white/10 text-center text-xs text-zinc-400">
              <div className="inline-block w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin mr-2 align-middle" />
              <span>Indexing local database of {catalog.length.toLocaleString()} titles...</span>
            </div>
          )}

          {/* "Did you mean?" Suggestion Banner */}
          {didYouMean && (
            <div
              onClick={() => handleApplyDidYouMean(didYouMean.suggestedTitle)}
              className={`p-3 sm:p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                selectedIndex === 0
                  ? 'bg-purple-950/80 border-purple-400 text-white shadow-lg ring-2 ring-purple-500/50'
                  : 'bg-purple-950/40 hover:bg-purple-950/70 border-purple-500/30 text-purple-200'
              }`}
            >
              <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                <span className="p-1.5 rounded-lg bg-purple-600/30 border border-purple-500/40 text-purple-300 shrink-0">
                  <Sparkles className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <span className="text-xs text-purple-300 font-semibold uppercase tracking-wider block sm:inline mr-2">
                    Did you mean:
                  </span>
                  <span className="text-sm sm:text-base font-black text-white hover:underline">
                    {didYouMean.suggestedTitle}
                  </span>
                  {didYouMean.item.releaseYear && (
                    <span className="ml-2 px-1.5 py-0.5 rounded bg-black/40 text-[10px] text-zinc-300 font-mono">
                      {didYouMean.item.releaseYear}
                    </span>
                  )}
                  <span className="ml-1.5 px-1.5 py-0.5 rounded bg-black/40 text-[10px] uppercase font-bold text-zinc-400">
                    {didYouMean.item.mediaType === 'movie' ? 'Movie' : 'Series'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-purple-300 font-bold shrink-0 self-end sm:self-center">
                <span>Search this instead</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          )}

          {/* Year candidate indication badge */}
          {parsedQuery.yearCandidate && (
            <div className="flex items-center gap-2 text-[11px] text-zinc-400 px-1">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>
                Searching for title <span className="text-white font-bold">"{parsedQuery.titleQuery}"</span> with target release year <span className="text-amber-400 font-bold">{parsedQuery.yearCandidate}</span>
              </span>
            </div>
          )}

          {/* Search Results List */}
          {results.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400 px-1 pb-1 border-b border-white/5">
                <span>Found <strong className="text-white">{results.length}</strong> relevant matches</span>
                <span className="text-[10px] text-zinc-500 font-mono">Ranked by intent relevance</span>
              </div>

              {results.map((res, idx) => {
                const item = res.item;
                const visualIndex = didYouMean ? idx + 1 : idx;
                const isSelected = selectedIndex === visualIndex;
                const netflixUrl = getNetflixUrl({
                  videoId: item.netflixId || item.videoId,
                  netflixId: item.netflixId || item.videoId,
                  originalTitle: item.title,
                  externalTitle: item.externalTitle || item.title,
                });

                const inLib = isInLibrary ? isInLibrary(item.sourceItem) : false;

                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelectResult(item)}
                    className={`p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 group ${
                      isSelected
                        ? 'bg-zinc-800/90 border-red-500 text-white shadow-xl ring-2 ring-red-500/40'
                        : 'bg-zinc-900/60 hover:bg-zinc-800/60 border-white/5 text-zinc-200'
                    }`}
                  >
                    {/* Poster + Info */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-12 sm:w-14 aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800 shrink-0 border border-white/10 shadow relative">
                        <CachedImage
                          src={item.posterPath}
                          alt={item.title}
                          className="w-full h-full object-cover"
                          fallbackIcon={<Film className="w-5 h-5 text-zinc-600 m-auto" />}
                        />
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h4 className="text-sm sm:text-base font-bold text-white truncate group-hover:text-red-400 transition-colors">
                            {item.title}
                          </h4>

                          {/* Media Type Badge */}
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-black uppercase tracking-wider ${
                              item.mediaType === 'movie'
                                ? 'bg-red-600/30 text-red-300 border border-red-500/40'
                                : 'bg-purple-600/30 text-purple-300 border border-purple-500/40'
                            }`}
                          >
                            {item.mediaType === 'movie' ? 'Movie' : 'Series'}
                          </span>

                          {/* Release Year */}
                          {item.releaseYear && (
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${
                                res.yearMatchStatus === 'exact'
                                  ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40'
                                  : 'bg-black/40 text-zinc-400'
                              }`}
                              title={res.yearMatchStatus === 'exact' ? 'Exact year match' : undefined}
                            >
                              {item.releaseYear}
                              {res.yearMatchStatus === 'exact' && ' ✓'}
                            </span>
                          )}

                          {/* Ratings */}
                          {item.imdbRating && (
                            <span className="px-1.5 py-0.2 rounded bg-black/40 border border-amber-500/30 text-amber-400 text-[10px] font-black flex items-center gap-0.5">
                              <Star className="w-2.5 h-2.5 fill-amber-400" />
                              {item.imdbRating}
                            </span>
                          )}

                          {item.rottenTomatoesRating !== undefined && item.rottenTomatoesRating > 0 && (
                            <span className="px-1.5 py-0.2 rounded bg-black/40 border border-red-500/30 text-red-300 text-[10px] font-bold">
                              🍅 {item.rottenTomatoesRating}%
                            </span>
                          )}
                        </div>

                        {/* Subtitle / Genres / Match Reason */}
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
                          {item.genres?.slice(0, 3).map((g) => (
                            <span key={g} className="text-[10px] text-zinc-400 bg-white/5 px-1.5 py-0.2 rounded">
                              {g}
                            </span>
                          ))}

                          {item.director && (
                            <span className="text-[10px] text-zinc-500 truncate max-w-[140px]">
                              Dir: {item.director}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quick Action Buttons */}
                    <div
                      className="flex items-center gap-1.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {onAddToLibrary && (
                        <button
                          type="button"
                          onClick={() => onAddToLibrary(item.sourceItem)}
                          className={`p-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                            inLib
                              ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-zinc-800 hover:bg-zinc-700 text-white border border-white/10'
                          }`}
                          title={inLib ? 'In your library' : 'Add to library'}
                        >
                          {inLib ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        </button>
                      )}

                      <a
                        href={netflixUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => openNetflixInNewTab(netflixUrl, e)}
                        className="flex items-center gap-1 px-3 py-2 rounded-xl bg-[#E50914] hover:bg-red-700 text-white text-xs font-bold shadow-md shadow-red-600/30 transition-transform active:scale-95 no-underline cursor-pointer"
                        title="Watch on Netflix (opens in new tab)"
                      >
                        <Play className="w-3 h-3 fill-white" />
                        <span className="hidden sm:inline">Netflix</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => handleSelectResult(item)}
                        className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer border border-white/5"
                        title="View Full Details"
                      >
                        <Info className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : debouncedQuery && !isSearching ? (
            /* Empty State */
            <div className="py-12 px-4 text-center space-y-3">
              <AlertCircle className="w-10 h-10 text-zinc-600 mx-auto" />
              <h3 className="text-base font-bold text-white">
                No matching movies or series found
              </h3>
              <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
                No titles in your local database match <span className="text-white font-mono">"{debouncedQuery}"</span>. Try checking for typos or searching by character, director, or release year.
              </p>
            </div>
          ) : !debouncedQuery ? (
            /* Idle Quick Guide State */
            <div className="py-10 px-4 text-center space-y-4 text-zinc-400">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center mx-auto text-red-500">
                <Search className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white">
                  Instant Netflix Catalog & Library Search
                </h3>
                <p className="text-xs max-w-md mx-auto text-zinc-400">
                  Search across all {catalog.length.toLocaleString()} titles. Typo tolerant, year-aware, and ranked by relevance.
                </p>
              </div>

              {/* Sample Queries */}
              <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
                <span className="text-[11px] text-zinc-500 mr-1">Try searching:</span>
                {['Inception', 'The Batman 2022', 'Breaking Bad', 'Stranger Things', 'Harry Potter'].map((ex) => (
                  <button
                    key={ex}
                    onClick={() => {
                      setQuery(ex);
                      setDebouncedQuery(ex);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10 text-xs transition-colors cursor-pointer"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer with keyboard hints */}
        <div className="p-2.5 sm:p-3 border-t border-white/10 bg-zinc-950/80 flex items-center justify-between text-[11px] text-zinc-500 px-4">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-white/10 font-mono text-[10px] text-zinc-300">↑</kbd>{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-white/10 font-mono text-[10px] text-zinc-300">↓</kbd> to navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-white/10 font-mono text-[10px] text-zinc-300">Enter</kbd> to select
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-white/10 font-mono text-[10px] text-zinc-300">Esc</kbd> to close
            </span>
          </div>

          <span className="text-[10px] font-mono text-zinc-500 hidden sm:inline">
            Local IndexedDB Engine
          </span>
        </div>
      </div>
    </div>
  );
};
