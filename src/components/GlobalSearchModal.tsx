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
import {
  analyzeSearchQueryWithQwen,
  findSimilarCatalogTitles,
  AISearchAnalysis,
  SimilarRecommendationResult,
} from '../services/aiSearchIntelligence';
import { DiscoveryTitle, LibraryItem } from '../types';
import { getNetflixUrl, openNetflixInNewTab } from '../services/normalizer';
import { formatRuntime } from '../services/analytics';
import { CachedImage } from './CachedImage';
import { CardMetadataPills } from './CardMetadataPills';

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

  // Qwen 28B AI Search Intelligence & Spell Check State
  const [aiAnalysis, setAiAnalysis] = useState<AISearchAnalysis | null>(null);
  const [similarRecommendations, setSimilarRecommendations] = useState<SimilarRecommendationResult[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);

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

  // Parallel Qwen 28B AI Query Analysis & Landmark Discovery
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setAiAnalysis(null);
      setSimilarRecommendations([]);
      setIsAiThinking(false);
      return;
    }

    let isMounted = true;
    setIsAiThinking(true);

    analyzeSearchQueryWithQwen(debouncedQuery)
      .then((analysis) => {
        if (!isMounted) return;
        setIsAiThinking(false);
        if (analysis) {
          setAiAnalysis(analysis);
          const similar = findSimilarCatalogTitles(analysis, catalog, libraryItems, debouncedQuery);
          setSimilarRecommendations(similar);
        } else {
          setAiAnalysis(null);
          setSimilarRecommendations([]);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setIsAiThinking(false);
        console.warn('AI search query analysis error:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [debouncedQuery, catalog, libraryItems]);

  // Execute search through local fast searchEngine (<10ms)
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

  // Media Type Filter: 'all' | 'movie' | 'tv'
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'movie' | 'tv'>('all');

  // Filtered results based on mediaTypeFilter
  const filteredResults = useMemo(() => {
    if (mediaTypeFilter === 'all') return results;
    return results.filter((r) => r.item.mediaType === mediaTypeFilter);
  }, [results, mediaTypeFilter]);

  // Exact or Top Match
  const exactOrTopMatch = useMemo(() => {
    if (filteredResults.length === 0) return null;
    const cleanQ = debouncedQuery.toLowerCase().replace(/[^a-z0-9]/g, '');
    const foundExact = filteredResults.find((r) => {
      const cleanT = (r.item.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return r.isExactMatch || cleanT === cleanQ || cleanT.startsWith(cleanQ);
    });
    return foundExact || filteredResults[0];
  }, [filteredResults, debouncedQuery]);

  // "Movies / Shows Like {xyz}" - taking genre, mood, and theme from the matched title
  const titlesLikeTarget = useMemo(() => {
    if (!exactOrTopMatch) return [];
    const target = exactOrTopMatch.item;
    const targetTitleClean = (target.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    const targetGenres = new Set((target.genres || []).map((g) => g.toLowerCase()));
    const targetThemes = new Set((target.themes || []).map((t) => t.toLowerCase()));
    const targetMoods = new Set(((target.sourceItem as any)?.moods || []).map((m: string) => m.toLowerCase()));
    const targetPace = (target.sourceItem as any)?.storyPace;

    const pool: (DiscoveryTitle | LibraryItem)[] = [...catalog, ...libraryItems];
    const seenIds = new Set<string>([target.id]);
    const candidates: Array<{
      item: DiscoveryTitle | LibraryItem;
      similarityScore: number;
      matchReason: string;
      vibeBadge?: string;
    }> = [];

    for (const item of pool) {
      if (!item || seenIds.has(item.id)) continue;
      const itemTitle = (item as any).title || (item as any).originalTitle || '';
      const itemTitleClean = itemTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (itemTitleClean === targetTitleClean) continue;

      const itemMediaType = item.mediaType === 'tv' ? 'tv' : 'movie';
      if (mediaTypeFilter !== 'all' && itemMediaType !== mediaTypeFilter) continue;

      seenIds.add(item.id);

      let score = 0;
      const reasons: string[] = [];

      // Genre match
      const itemGenres = (item.genres || []).map((g) => g.toLowerCase());
      const commonGenres = itemGenres.filter((g) => targetGenres.has(g));
      if (commonGenres.length > 0) {
        score += commonGenres.length * 20;
        reasons.push(commonGenres.slice(0, 2).map((g) => g.charAt(0).toUpperCase() + g.slice(1)).join(' & '));
      }

      // Theme match
      const itemThemes = (item.themes || []).map((t) => t.toLowerCase());
      const commonThemes = itemThemes.filter((t) => targetThemes.has(t));
      if (commonThemes.length > 0) {
        score += commonThemes.length * 30;
        reasons.push(itemThemes[0]);
      }

      // Mood match
      const itemMoods = ((item as any).moods || []).map((m: string) => m.toLowerCase());
      const commonMoods = itemMoods.filter((m: string) => targetMoods.has(m));
      if (commonMoods.length > 0) {
        score += commonMoods.length * 25;
        reasons.push(itemMoods[0]);
      }

      // Story pace
      if (targetPace && (item as any).storyPace === targetPace) {
        score += 15;
      }

      const rating = (item as any).imdbRating || (item as any).rating || 0;
      score += (rating / 10) * 10;

      if (score >= 25) {
        candidates.push({
          item,
          similarityScore: score,
          matchReason: reasons.slice(0, 2).join(' • ') || 'Shares style DNA',
          vibeBadge: commonThemes[0] || commonMoods[0] || commonGenres[0] || (item as any).audienceVibe,
        });
      }
    }

    candidates.sort((a, b) => b.similarityScore - a.similarityScore);
    return candidates.slice(0, 10);
  }, [exactOrTopMatch, catalog, libraryItems, mediaTypeFilter]);

  // Unified spell check recommendation: prioritize Qwen AI typo detection, fallback to local Trie
  const effectiveDidYouMean = useMemo(() => {
    const cleanQuery = debouncedQuery.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (aiAnalysis?.isTypo && aiAnalysis.correctedQuery) {
      const cleanCorrected = aiAnalysis.correctedQuery.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanCorrected !== cleanQuery) {
        return {
          suggestedTitle: aiAnalysis.correctedQuery,
          source: 'qwen' as const,
          vibe: aiAnalysis.vibe,
        };
      }
    }
    if (didYouMean) {
      return {
        suggestedTitle: didYouMean.suggestedTitle,
        source: 'local' as const,
        vibe: undefined,
      };
    }
    return null;
  }, [aiAnalysis, didYouMean, debouncedQuery]);

  // Keyboard navigation handler inside modal
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    const totalNavigableItems = (effectiveDidYouMean ? 1 : 0) + filteredResults.length;
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
        if (filteredResults.length > 0) {
          handleSelectResult(filteredResults[0].item);
        } else if (effectiveDidYouMean) {
          handleApplyDidYouMean(effectiveDidYouMean.suggestedTitle);
        }
        return;
      }

      if (effectiveDidYouMean && selectedIndex === 0) {
        handleApplyDidYouMean(effectiveDidYouMean.suggestedTitle);
      } else {
        const resultIdx = effectiveDidYouMean ? selectedIndex - 1 : selectedIndex;
        if (filteredResults[resultIdx]) {
          handleSelectResult(filteredResults[resultIdx].item);
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

        {/* Media Type Filter Tabs (All / Movies / TV Shows) */}
        <div className="px-3.5 sm:px-4 py-2 border-b border-white/5 bg-zinc-950/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-zinc-500 font-semibold mr-1">Type:</span>
            <button
              type="button"
              onClick={() => setMediaTypeFilter('all')}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                mediaTypeFilter === 'all'
                  ? 'bg-white text-black shadow'
                  : 'bg-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-700'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setMediaTypeFilter('movie')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                mediaTypeFilter === 'movie'
                  ? 'bg-[#E50914] text-white shadow shadow-red-600/30'
                  : 'bg-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-700'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Movies</span>
            </button>
            <button
              type="button"
              onClick={() => setMediaTypeFilter('tv')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                mediaTypeFilter === 'tv'
                  ? 'bg-purple-600 text-white shadow shadow-purple-600/30'
                  : 'bg-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-700'
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
              <span>TV Shows</span>
            </button>
          </div>
          {filteredResults.length > 0 && debouncedQuery && (
            <span className="text-[11px] text-zinc-400 font-mono hidden sm:inline">
              {filteredResults.length} {mediaTypeFilter === 'all' ? 'matches' : mediaTypeFilter === 'movie' ? 'movies' : 'shows'}
            </span>
          )}
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

          {/* AI Thinking banner */}
          {isAiThinking && debouncedQuery && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-purple-950/30 border border-purple-500/20 text-xs text-purple-300 animate-pulse">
              <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-spin" />
              <span>Qwen 28B analyzing vibe, landmark recommendations & spell-checking...</span>
            </div>
          )}

          {/* "Did you mean?" Suggestion Banner (AI Spell-Check or Local Trie) */}
          {effectiveDidYouMean && (
            <div
              onClick={() => handleApplyDidYouMean(effectiveDidYouMean.suggestedTitle)}
              className={`p-3 sm:p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                selectedIndex === 0
                  ? 'bg-purple-950/90 border-purple-400 text-white shadow-xl ring-2 ring-purple-500/50'
                  : 'bg-gradient-to-r from-purple-950/50 via-indigo-950/40 to-zinc-900/60 hover:bg-purple-950/70 border-purple-500/40 text-purple-200'
              }`}
            >
              <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                <span className="p-1.5 rounded-lg bg-purple-600/30 border border-purple-500/40 text-purple-300 shrink-0">
                  <Sparkles className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <span className="text-xs text-purple-300 font-bold uppercase tracking-wider block sm:inline mr-2">
                    {effectiveDidYouMean.source === 'qwen' ? '✨ AI Spell Check — Did you mean:' : 'Did you mean:'}
                  </span>
                  <span className="text-sm sm:text-base font-black text-white hover:underline">
                    {effectiveDidYouMean.suggestedTitle}
                  </span>
                  {effectiveDidYouMean.vibe && (
                    <span className="ml-2 text-xs text-purple-300/80 font-normal hidden sm:inline">
                      • {effectiveDidYouMean.vibe}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-purple-300 font-bold shrink-0 self-end sm:self-center bg-purple-900/40 px-2.5 py-1 rounded-lg border border-purple-500/30">
                <span>Search "{effectiveDidYouMean.suggestedTitle}" instead</span>
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
              {filteredResults.length > 0 ? (
                <div className="space-y-3.5">
                  {/* 1. EXACT / TOP MATCH HIGHLIGHT CARD */}
                  {exactOrTopMatch && (
                    <div className="p-3 sm:p-4 rounded-2xl bg-gradient-to-r from-red-950/40 via-zinc-900/90 to-zinc-950 border-2 border-red-500/50 shadow-xl space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
                            🎯 Exact Match
                          </span>
                          <span className="text-xs text-zinc-400 font-medium">Top match for "{debouncedQuery}"</span>
                        </div>
                        <span className="text-[10px] text-zinc-500 font-mono">Rank #1</span>
                      </div>

                      <div className="flex items-start sm:items-center justify-between gap-3.5">
                        <div
                          className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1 cursor-pointer group"
                          onClick={() => handleSelectResult(exactOrTopMatch.item)}
                        >
                          <div className="w-14 sm:w-16 aspect-[2/3] rounded-xl overflow-hidden bg-zinc-800 shrink-0 border border-white/20 shadow-lg relative">
                            <CachedImage
                              src={exactOrTopMatch.item.posterPath}
                              alt={exactOrTopMatch.item.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              fallbackIcon={<Film className="w-6 h-6 text-zinc-600 m-auto" />}
                            />
                          </div>

                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base sm:text-lg font-black text-white group-hover:text-red-400 transition-colors">
                                {exactOrTopMatch.item.title}
                              </h3>
                              <span
                                className={`text-[9px] px-1.5 py-0.2 rounded font-black uppercase ${
                                  exactOrTopMatch.item.mediaType === 'movie'
                                    ? 'bg-red-600/30 text-red-300 border border-red-500/40'
                                    : 'bg-purple-600/30 text-purple-300 border border-purple-500/40'
                                }`}
                              >
                                {exactOrTopMatch.item.mediaType === 'movie' ? 'Movie' : 'Series'}
                              </span>
                              {exactOrTopMatch.item.releaseYear && (
                                <span className="text-xs font-mono font-bold text-amber-300 bg-black/40 px-2 py-0.5 rounded border border-amber-500/30">
                                  {exactOrTopMatch.item.releaseYear}
                                </span>
                              )}
                              {exactOrTopMatch.item.imdbRating && (
                                <span className="text-xs font-bold text-amber-400 bg-black/40 px-2 py-0.5 rounded border border-amber-500/30 flex items-center gap-1">
                                  ⭐ {exactOrTopMatch.item.imdbRating}
                                </span>
                              )}
                            </div>

                            {/* 2-line Motto / Tagline */}
                            {((exactOrTopMatch.item.sourceItem as any)?.tagline || (exactOrTopMatch.item as any).tagline) && (
                              <div className="my-1 px-2.5 py-1 rounded bg-amber-500/10 border-l-2 border-amber-500/70">
                                <p className="text-xs sm:text-sm font-semibold text-amber-200/90 italic line-clamp-2 leading-snug">
                                  "{((exactOrTopMatch.item.sourceItem as any)?.tagline || (exactOrTopMatch.item as any).tagline)}"
                                </p>
                              </div>
                            )}

                            {/* 6 Rich Narrative Metadata Dimensions */}
                            <CardMetadataPills item={exactOrTopMatch.item.sourceItem as any} />
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center gap-2 shrink-0">
                          <a
                            href={getNetflixUrl({
                              videoId: exactOrTopMatch.item.netflixId || exactOrTopMatch.item.videoId,
                              netflixId: exactOrTopMatch.item.netflixId || exactOrTopMatch.item.videoId,
                              originalTitle: exactOrTopMatch.item.title,
                              externalTitle: exactOrTopMatch.item.externalTitle || exactOrTopMatch.item.title,
                            })}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => openNetflixInNewTab(getNetflixUrl({
                              videoId: exactOrTopMatch.item.netflixId || exactOrTopMatch.item.videoId,
                              netflixId: exactOrTopMatch.item.netflixId || exactOrTopMatch.item.videoId,
                              originalTitle: exactOrTopMatch.item.title,
                              externalTitle: exactOrTopMatch.item.externalTitle || exactOrTopMatch.item.title,
                            }), e)}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#E50914] hover:bg-red-700 text-white text-xs font-bold shadow-lg shadow-red-600/40 transition-transform active:scale-95 no-underline cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5 fill-white" />
                            <span>Watch</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => handleSelectResult(exactOrTopMatch.item)}
                            className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white transition-colors cursor-pointer border border-white/10 text-xs font-bold"
                            title="Details"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 2. DEDICATED ROW: "Movies / Shows like {xyz}" (taking genre, mood, theme) */}
                  {exactOrTopMatch && titlesLikeTarget.length > 0 && (
                    <div className="p-3 sm:p-3.5 rounded-2xl bg-zinc-900/80 border border-purple-500/30 space-y-2.5 shadow-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 rounded-lg bg-purple-600/30 text-purple-300 border border-purple-500/40">
                            <Sparkles className="w-4 h-4" />
                          </span>
                          <div>
                            <h4 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
                              <span>
                                {mediaTypeFilter === 'movie'
                                  ? 'Movies'
                                  : mediaTypeFilter === 'tv'
                                  ? 'Shows'
                                  : 'Movies & Shows'}{' '}
                                like <strong className="text-purple-300">"{exactOrTopMatch.item.title}"</strong>
                              </span>
                            </h4>
                            <span className="text-[10px] text-zinc-400">
                              Matched via shared genres, moods & themes
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] text-purple-300 font-mono bg-purple-950/80 px-2.5 py-0.5 rounded-full border border-purple-500/30 font-bold hidden sm:inline">
                          ✨ Genre & Mood DNA
                        </span>
                      </div>

                      {/* Horizontal Scroll Row */}
                      <div className="flex gap-3 overflow-x-auto pb-2 pt-1 scrollbar-thin scrollbar-thumb-zinc-700">
                        {titlesLikeTarget.map((cand) => {
                          const cItem = cand.item;
                          const cTitle = (cItem as any).title || (cItem as any).originalTitle || '';
                          const cPoster = (cItem as any).posterPath;
                          const cYear = (cItem as any).releaseYear;
                          const cRating = (cItem as any).imdbRating || (cItem as any).rating;
                          const cIsMovie = cItem.mediaType === 'movie';
                          const cNetUrl = getNetflixUrl({
                            videoId: (cItem as any).netflixId || (cItem as any).videoId,
                            netflixId: (cItem as any).netflixId || (cItem as any).videoId,
                            originalTitle: cTitle,
                            externalTitle: (cItem as any).externalTitle || cTitle,
                          });

                          return (
                            <div
                              key={`sim-row-${cItem.id}`}
                              onClick={() => {
                                onClose();
                                onOpenItemDetail(cItem);
                              }}
                              className="w-[140px] sm:w-[155px] shrink-0 group cursor-pointer bg-zinc-950 rounded-xl overflow-hidden border border-white/10 hover:border-purple-500/60 transition-all shadow-md hover:-translate-y-1 flex flex-col justify-between"
                            >
                              <div>
                                <div className="relative aspect-[2/3] w-full bg-zinc-800">
                                  <CachedImage
                                    src={cPoster}
                                    alt={cTitle}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                    fallbackIcon={<Film className="w-5 h-5 text-zinc-600 m-auto" />}
                                  />
                                  <span
                                    className={`absolute top-1.5 left-1.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded shadow ${
                                      cIsMovie
                                        ? 'bg-red-600/90 text-white'
                                        : 'bg-purple-600/90 text-white'
                                    }`}
                                  >
                                    {cIsMovie ? 'Movie' : 'Series'}
                                  </span>
                                  {cRating && (
                                    <span className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/80 text-amber-400 border border-amber-500/30 flex items-center gap-0.5">
                                      ⭐ {cRating}
                                    </span>
                                  )}
                                </div>

                                <div className="p-2 space-y-1">
                                  <h5 className="text-xs font-bold text-white line-clamp-1 group-hover:text-purple-300 transition-colors">
                                    {cTitle}
                                  </h5>
                                  {cand.vibeBadge && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-purple-600/20 text-purple-300 border border-purple-500/30 line-clamp-1 inline-block">
                                      {cand.vibeBadge}
                                    </span>
                                  )}
                                  <p className="text-[9px] text-zinc-400 line-clamp-1">
                                    {cand.matchReason}
                                  </p>
                                </div>
                              </div>

                              <div className="p-2 pt-0 flex items-center justify-between gap-1 border-t border-white/5 mt-1">
                                <span className="text-[10px] text-zinc-500 font-mono">{cYear || ''}</span>
                                <a
                                  href={cNetUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openNetflixInNewTab(cNetUrl, e);
                                  }}
                                  className="p-1 rounded bg-[#E50914] text-white hover:bg-red-700 transition-colors"
                                  title="Watch on Netflix"
                                >
                                  <Play className="w-3 h-3 fill-white" />
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 3. ALL MATCHING RESULTS LIST */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between text-xs text-zinc-400 px-1 pb-1 border-b border-white/5">
                      <span>All Matching Titles (<strong className="text-white">{filteredResults.length}</strong>)</span>
                      <span className="text-[10px] text-zinc-500 font-mono">Ranked by intent relevance</span>
                    </div>

                    {filteredResults.map((res, idx) => {
                      const item = res.item;
                      const visualIndex = effectiveDidYouMean ? idx + 1 : idx;
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

                              {/* 2-line Tagline if available */}
                              {((item.sourceItem as any)?.tagline || (item as any).tagline) && (
                                <div className="my-1 px-2 py-0.5 rounded bg-amber-500/10 border-l-2 border-amber-500/70">
                                  <p className="text-[11px] text-amber-200/90 font-medium italic line-clamp-2 leading-snug">
                                    "{((item.sourceItem as any)?.tagline || (item as any).tagline)}"
                                  </p>
                                </div>
                              )}

                              {/* 6 Rich Narrative Metadata Dimensions */}
                              <CardMetadataPills item={item.sourceItem as any} />
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
                </div>
              ) : debouncedQuery && !isSearching ? (
                /* Empty State */
                <div className="py-8 px-4 text-center space-y-2.5 bg-zinc-900/40 rounded-xl border border-white/5">
                  <AlertCircle className="w-8 h-8 text-zinc-500 mx-auto" />
                  <h3 className="text-sm font-bold text-white">
                    No direct title matches for "{debouncedQuery}"
                  </h3>
                  <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                    {effectiveDidYouMean ? (
                      <>
                        Did you mean <button type="button" onClick={() => handleApplyDidYouMean(effectiveDidYouMean.suggestedTitle)} className="text-purple-400 font-bold underline hover:text-purple-300">"{effectiveDidYouMean.suggestedTitle}"</button>?
                      </>
                    ) : (
                      'Check spelling or explore landmark titles matching this vibe below.'
                    )}
                  </p>
                </div>
              ) : null}

              {/* AI Similar Titles Section ("Tenet"-type recommendations) */}
              {debouncedQuery && similarRecommendations.length > 0 && (
                <div className="pt-3 border-t border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <span className="p-1 rounded-md bg-purple-600/20 border border-purple-500/30 text-purple-400">
                        <Sparkles className="w-3.5 h-3.5" />
                      </span>
                      <h4 className="text-xs sm:text-sm font-bold text-white">
                        Similar to "{aiAnalysis?.similarReferenceTitle || debouncedQuery}"
                        {aiAnalysis?.vibe && (
                          <span className="text-zinc-400 font-normal ml-1.5 text-xs hidden sm:inline">
                            — {aiAnalysis.vibe}
                          </span>
                        )}
                      </h4>
                    </div>
                    <span className="text-[10px] text-purple-300 font-mono bg-purple-950/60 border border-purple-500/30 px-2 py-0.5 rounded-full font-bold">
                      ✨ Qwen 28B Vibe Match
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {similarRecommendations.map((rec) => {
                      const item = rec.title;
                      const netflixUrl = getNetflixUrl({
                        videoId: item.netflixId || (item as any).videoId,
                        netflixId: item.netflixId || (item as any).videoId,
                        originalTitle: item.title,
                        externalTitle: (item as any).externalTitle || item.title,
                      });
                      const inLib = isInLibrary ? isInLibrary(item) : false;

                      return (
                        <div
                          key={`sim-${item.id}`}
                          onClick={() => {
                            onClose();
                            onOpenItemDetail(item);
                          }}
                          className="p-2.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-white/5 hover:border-purple-500/40 transition-all cursor-pointer flex items-center justify-between gap-3 group relative overflow-hidden shadow"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-11 sm:w-12 aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800 shrink-0 border border-white/10 shadow relative">
                              <CachedImage
                                src={item.posterPath}
                                alt={item.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                fallbackIcon={<Film className="w-5 h-5 text-zinc-600 m-auto" />}
                              />
                            </div>

                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-1.5">
                                <h5 className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-purple-300 transition-colors">
                                  {item.title}
                                </h5>
                                {item.releaseYear && (
                                  <span className="text-[10px] text-zinc-400 font-mono">
                                    {item.releaseYear}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-purple-600/20 text-purple-300 border border-purple-500/30">
                                  {rec.vibeBadge}
                                </span>
                                {(item.rating || item.imdbRating) && (
                                  <span className="text-[9px] px-1 py-0.2 rounded bg-black/40 text-amber-400 font-bold flex items-center gap-0.5">
                                    <Star className="w-2.5 h-2.5 fill-amber-400" />
                                    {item.rating || item.imdbRating}
                                  </span>
                                )}
                              </div>

                              <p className="text-[10px] text-zinc-400 line-clamp-1">
                                {rec.matchReason}
                              </p>
                            </div>
                          </div>

                          <div
                            className="flex items-center gap-1.5 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {onAddToLibrary && (
                              <button
                                type="button"
                                onClick={() => onAddToLibrary(item)}
                                className={`p-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                                  inLib
                                    ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-zinc-800 hover:bg-zinc-700 text-white border border-white/10'
                                }`}
                                title={inLib ? 'In your library' : 'Add to library'}
                              >
                                {inLib ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                              </button>
                            )}
                            <a
                              href={netflixUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => openNetflixInNewTab(netflixUrl, e)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#E50914] hover:bg-red-700 text-white text-xs font-bold shadow transition-transform active:scale-95 no-underline cursor-pointer"
                              title="Watch on Netflix"
                            >
                              <Play className="w-3 h-3 fill-white" />
                              <span className="hidden sm:inline text-[11px]">Watch</span>
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

          {!debouncedQuery ? (
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
