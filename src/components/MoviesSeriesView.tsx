import React, { useState, useMemo } from 'react';
import { Film, Tv, Search, RefreshCw, AlertCircle, ArrowUpDown, Sliders, Globe, Calendar, X, Sparkles, Languages } from 'lucide-react';
import { AppSettings, LibraryItem } from '../types';
import { MovieCard } from './MovieCard';
import { TvSeriesCard } from './TvSeriesCard';
import { itemHasLanguage, normalizeCountryName, normalizeCountriesList } from '../services/normalizer';
import { calculateSeriesRuntime } from '../services/analytics';

interface MoviesSeriesViewProps {
  items: LibraryItem[];
  settings: AppSettings;
  onSelectItem: (item: LibraryItem) => void;
  onChangeMatch: (item: LibraryItem) => void;
  onRescan: () => void;
  isRescanning: boolean;
  onOpenSurpriseMe?: () => void;
  onUpdateItem?: (item: LibraryItem) => void;
  onOpenDropModal?: (item: LibraryItem) => void;
}

type SortField = 'rottenTomatoes' | 'imdb' | 'rating' | 'runtime' | 'title' | 'year' | 'recently_added';
type MediaFilterType = 'all' | 'movie' | 'tv';
type StatusFilterType = 'all' | 'unwatched' | 'still_watching' | 'completed' | 'dropped';

export const MoviesSeriesView: React.FC<MoviesSeriesViewProps> = ({
  items,
  settings,
  onSelectItem,
  onChangeMatch,
  onRescan,
  isRescanning,
  onOpenSurpriseMe,
  onUpdateItem,
  onOpenDropModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'with_trailers'>('all');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaFilterType>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('all');
  
  // Language filter: 'all' | 'hindi' | 'english' | 'japanese' | 'korean' | custom
  const [languageFilter, setLanguageFilter] = useState<string>('all');

  // Country search inside modal
  const [countrySearchQuery, setCountrySearchQuery] = useState('');

  // Sorting
  const [sortBy, setSortBy] = useState<SortField>('recently_added');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Multi-genre filter
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [genreMatchMode, setGenreMatchMode] = useState<'any' | 'all'>('any');
  const [showGenreModal, setShowGenreModal] = useState(false);

  // Multi-country filter
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [showCountryModal, setShowCountryModal] = useState(false);

  // Year range filter
  const [minYear, setMinYear] = useState<string>('');
  const [maxYear, setMaxYear] = useState<string>('');
  const [showYearModal, setShowYearModal] = useState(false);

  // Min rating filter
  const [minRating, setMinRating] = useState<number>(0);

  // Dynamic available genres from library
  const allGenres = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => (item.genres || []).forEach((g) => set.add(g)));
    return Array.from(set).sort();
  }, [items]);

  // Dynamic available countries from library (canonicalized & merged)
  const allCountries = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      (item.countries || []).forEach((c) => {
        const norm = normalizeCountryName(c);
        if (norm) set.add(norm);
      });
    });
    return Array.from(set).sort();
  }, [items]);

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (mediaTypeFilter !== 'all') count++;
    if (statusFilter !== 'all') count++;
    if (languageFilter !== 'all') count++;
    if (selectedGenres.length > 0) count++;
    if (selectedCountries.length > 0) count++;
    if (minYear || maxYear) count++;
    if (minRating > 0) count++;
    if (filterType !== 'all') count++;
    if (searchQuery.trim()) count++;
    return count;
  }, [mediaTypeFilter, statusFilter, languageFilter, selectedGenres, selectedCountries, minYear, maxYear, minRating, filterType, searchQuery]);

  const clearAllFilters = () => {
    setMediaTypeFilter('all');
    setStatusFilter('all');
    setLanguageFilter('all');
    setSelectedGenres([]);
    setSelectedCountries([]);
    setCountrySearchQuery('');
    setMinYear('');
    setMaxYear('');
    setMinRating(0);
    setFilterType('all');
    setSearchQuery('');
  };

  // Quick action: Mark watched directly from card
  const handleQuickMarkWatched = (item: LibraryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onUpdateItem) return;
    const isCurrentlyCompleted = item.isCompleted || item.viewingStatus === 'completed';
    const updated: LibraryItem = {
      ...item,
      isCompleted: !isCurrentlyCompleted,
      viewingStatus: !isCurrentlyCompleted ? 'completed' : 'unwatched',
      completedAt: !isCurrentlyCompleted ? new Date().toISOString() : undefined,
      updatedAt: new Date().toISOString(),
    };
    onUpdateItem(updated);
  };

  // Quick action: Drop directly from card
  const handleQuickDrop = (item: LibraryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenDropModal) {
      onOpenDropModal(item);
    } else if (onUpdateItem) {
      const updated: LibraryItem = {
        ...item,
        viewingStatus: 'dropped',
        droppedReason: 'Dropped from catalog',
        droppedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      onUpdateItem(updated);
    }
  };

  const sortedItems = useMemo(() => {
    let result = items;

    // 1. Media Type
    if (mediaTypeFilter !== 'all') {
      result = result.filter((x) => x.mediaType === mediaTypeFilter);
    }

    // 2. Status
    if (statusFilter !== 'all') {
      result = result.filter((x) => {
        const status = x.viewingStatus || (x.isCompleted ? 'completed' : 'unwatched');
        return status === statusFilter;
      });
    }

    // 3. Language filter (Available in Hindi, English, Japanese, etc.)
    if (languageFilter !== 'all') {
      result = result.filter((x) => itemHasLanguage(x, languageFilter));
    }

    // 4. Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (x) =>
          x.originalTitle.toLowerCase().includes(q) ||
          (x.externalTitle && x.externalTitle.toLowerCase().includes(q))
      );
    }

    // 5. Quick filter types
    if (filterType === 'with_trailers') {
      result = result.filter((x) => !!x.trailer);
    }

    // 6. Multi-genre filter
    if (selectedGenres.length > 0) {
      result = result.filter((x) => {
        const genres = x.genres || [];
        if (genreMatchMode === 'all') {
          return selectedGenres.every((g) => genres.includes(g));
        } else {
          return selectedGenres.some((g) => genres.includes(g));
        }
      });
    }

    // 7. Multi-country filter (compares canonical names)
    if (selectedCountries.length > 0) {
      result = result.filter((x) => {
        const itemCountries = (x.countries || []).map((c) => normalizeCountryName(c));
        return selectedCountries.some((selected) => itemCountries.includes(selected));
      });
    }

    // 8. Year range
    if (minYear) {
      const y = parseInt(minYear, 10);
      if (!isNaN(y)) result = result.filter((x) => (x.releaseYear ? x.releaseYear >= y : true));
    }
    if (maxYear) {
      const y = parseInt(maxYear, 10);
      if (!isNaN(y)) result = result.filter((x) => (x.releaseYear ? x.releaseYear <= y : true));
    }

    // 9. Min rating
    if (minRating > 0) {
      result = result.filter((x) => {
        const r = x.imdbRating || x.rating || 0;
        return r >= minRating;
      });
    }

    // Helper to get total effective runtime for any item (movie or series)
    const getItemRuntime = (item: LibraryItem): number => {
      if (item.mediaType === 'movie') {
        return item.runtimeMinutes || 0;
      }
      // For TV series, accurately calculate included/total series runtime
      const b = calculateSeriesRuntime(
        item,
        settings.maxEpisodesPerSeries,
        settings.capSeriesEpisodes
      );
      return b.includedRuntimeMinutes || item.includedRuntimeMinutes || (b.totalEpisodes * 45) || 0;
    };

    // 10. Sorting
    return [...result].sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'rottenTomatoes') {
        const rtA = a.rottenTomatoesRating !== undefined ? a.rottenTomatoesRating : -1;
        const rtB = b.rottenTomatoesRating !== undefined ? b.rottenTomatoesRating : -1;
        comparison = rtA - rtB;
      } else if (sortBy === 'imdb') {
        const imdbA = a.imdbRating !== undefined ? a.imdbRating : (a.rating || -1);
        const imdbB = b.imdbRating !== undefined ? b.imdbRating : (b.rating || -1);
        comparison = imdbA - imdbB;
      } else if (sortBy === 'runtime') {
        const rA = getItemRuntime(a);
        const rB = getItemRuntime(b);
        comparison = rA - rB;
      } else if (sortBy === 'rating') {
        comparison = (a.rating || 0) - (b.rating || 0);
      } else if (sortBy === 'title') {
        comparison = (a.externalTitle || a.originalTitle).localeCompare(b.externalTitle || b.originalTitle);
      } else if (sortBy === 'year') {
        comparison = (a.releaseYear || 0) - (b.releaseYear || 0);
      } else {
        // recently_added
        comparison = (a.addedAt || '').localeCompare(b.addedAt || '');
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }, [
    items,
    settings.maxEpisodesPerSeries,
    settings.capSeriesEpisodes,
    mediaTypeFilter,
    statusFilter,
    languageFilter,
    searchQuery,
    filterType,
    selectedGenres,
    genreMatchMode,
    selectedCountries,
    minYear,
    maxYear,
    minRating,
    sortBy,
    sortOrder,
  ]);

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 lg:px-8 space-y-6 animate-in fade-in duration-300">
      {/* Top Header & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Movies & Series Catalog
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">
            Browse, filter, and sort your streaming collection with live genre & country tags.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {onOpenSurpriseMe && (
            <button
              onClick={onOpenSurpriseMe}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-red-600 to-purple-600 hover:from-red-500 hover:to-purple-500 text-white shadow-lg shadow-red-600/20 transition-all"
            >
              <Sparkles className="w-4 h-4" />
              <span>Surprise Me!</span>
            </button>
          )}

          <button
            onClick={onRescan}
            disabled={isRescanning}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition-all shadow-md ${
              isRescanning
                ? 'bg-white/5 border-white/10 text-gray-500 cursor-not-allowed'
                : 'bg-[#E50914] border-transparent text-white hover:bg-red-700'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${isRescanning ? 'animate-spin' : ''}`} />
            <span>{isRescanning ? 'Scanning...' : 'Re-scan'}</span>
          </button>
        </div>
      </div>

      {/* Filter & Sort Toolbar */}
      <div className="bg-[#1c1c1e] p-4 rounded-2xl border border-white/10 space-y-3 shadow-md">
        {/* Row 1: Search, Media Type, Status, Sort */}
        <div className="flex flex-col md:flex-row gap-3 justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title..."
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 pl-10 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#E50914]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Type selector */}
            <select
              value={mediaTypeFilter}
              onChange={(e) => setMediaTypeFilter(e.target.value as MediaFilterType)}
              className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-medium focus:outline-none focus:border-[#E50914] cursor-pointer"
            >
              <option value="all" className="bg-zinc-900 text-white">All Types</option>
              <option value="movie" className="bg-zinc-900 text-white">Movies Only</option>
              <option value="tv" className="bg-zinc-900 text-white">TV Shows Only</option>
            </select>

            {/* Status selector */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilterType)}
              className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-medium focus:outline-none focus:border-[#E50914] cursor-pointer"
            >
              <option value="all" className="bg-zinc-900 text-white">All Statuses</option>
              <option value="unwatched" className="bg-zinc-900 text-white">Unwatched</option>
              <option value="still_watching" className="bg-zinc-900 text-white">Still Watching</option>
              <option value="completed" className="bg-zinc-900 text-white">Completed</option>
              <option value="dropped" className="bg-zinc-900 text-white">Dropped</option>
            </select>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortField)}
              className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#E50914] font-medium cursor-pointer"
            >
              <option value="recently_added" className="bg-zinc-900 text-white">Recently Added</option>
              <option value="runtime" className="bg-zinc-900 text-white">⏱️ Duration / Runtime</option>
              <option value="rottenTomatoes" className="bg-zinc-900 text-white">🍅 Rotten Tomatoes</option>
              <option value="imdb" className="bg-zinc-900 text-white">⭐ IMDb Rating</option>
              <option value="title" className="bg-zinc-900 text-white">Alphabetical (A - Z)</option>
              <option value="year" className="bg-zinc-900 text-white">Release Year</option>
              <option value="rating" className="bg-zinc-900 text-white">TMDB Score</option>
            </select>

            <button
              onClick={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-colors ${
                sortOrder === 'desc'
                  ? 'bg-red-600/20 border-red-500/50 text-red-400 hover:bg-red-600/30'
                  : 'bg-blue-600/20 border-blue-500/50 text-blue-400 hover:bg-blue-600/30'
              }`}
              title={`Click to change order. Current: ${sortOrder === 'desc' ? 'Descending (Highest / Longest first)' : 'Ascending (Lowest / Shortest first)'}`}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>{sortOrder === 'desc' ? 'DESC (High → Low)' : 'ASC (Low → High)'}</span>
            </button>
          </div>
        </div>

        {/* Row 2: Category, Country, Year, Rating modals triggers & active count */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5">
          <div className="flex flex-wrap items-center gap-2">
            {/* Categories Multi-select Trigger */}
            <button
              onClick={() => setShowGenreModal(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                selectedGenres.length > 0
                  ? 'bg-red-600/20 border-red-500/50 text-red-300'
                  : 'bg-black/30 border-white/5 text-gray-400 hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Categories</span>
              {selectedGenres.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-red-500/30 text-[10px]">
                  {selectedGenres.length}
                </span>
              )}
            </button>

            {/* Country Trigger */}
            <button
              onClick={() => setShowCountryModal(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                selectedCountries.length > 0
                  ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                  : 'bg-black/30 border-white/5 text-gray-400 hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Country</span>
              {selectedCountries.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-blue-500/30 text-[10px]">
                  {selectedCountries.length}
                </span>
              )}
            </button>

            {/* Year Range Trigger */}
            <button
              onClick={() => setShowYearModal(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                minYear || maxYear
                  ? 'bg-yellow-600/20 border-yellow-500/50 text-yellow-300'
                  : 'bg-black/30 border-white/5 text-gray-400 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{minYear || maxYear ? `${minYear || 'Any'}–${maxYear || 'Any'}` : 'Year'}</span>
            </button>

            {/* Quick Filter: Available in Hindi */}
            <button
              onClick={() => setLanguageFilter((prev) => prev === 'hindi' ? 'all' : 'hindi')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                languageFilter === 'hindi'
                  ? 'bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/20'
                  : 'bg-black/30 border-white/5 text-gray-300 hover:text-white hover:border-amber-500/40'
              }`}
              title="Filter titles available in Hindi"
            >
              <span className="font-black text-sm">हिं</span>
              <span>Available in Hindi</span>
            </button>

            {/* Language Selector Dropdown */}
            <div className="flex items-center gap-1 bg-zinc-900 border border-white/10 rounded-xl px-2 py-1 text-xs">
              <Languages className="w-3.5 h-3.5 text-zinc-400" />
              <select
                value={languageFilter}
                onChange={(e) => setLanguageFilter(e.target.value)}
                className="bg-transparent text-white font-medium focus:outline-none cursor-pointer pr-1"
                title="Filter by Audio / Spoken Language"
              >
                <option value="all" className="bg-zinc-900 text-white">All Languages</option>
                <option value="hindi" className="bg-zinc-900 text-amber-400 font-bold">हिं Hindi (Top)</option>
                <option value="english" className="bg-zinc-900 text-white">EN English</option>
                <option value="japanese" className="bg-zinc-900 text-white">JAP Japanese</option>
                <option value="korean" className="bg-zinc-900 text-white">KOR Korean</option>
                <option value="spanish" className="bg-zinc-900 text-white">Spanish</option>
                <option value="french" className="bg-zinc-900 text-white">French</option>
                <option value="german" className="bg-zinc-900 text-white">German</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {activeFiltersCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 font-medium">
                  {activeFiltersCount} active filter{activeFiltersCount > 1 ? 's' : ''}
                </span>
                <button
                  onClick={clearAllFilters}
                  className="text-xs text-red-400 hover:text-red-300 underline"
                >
                  Clear All Filters
                </button>
              </div>
            )}

            <span className="text-xs text-gray-400 font-medium">
              Showing <span className="text-white font-bold">{sortedItems.length}</span> of {items.length}
            </span>
          </div>
        </div>

        {/* Row 3: Active Filter Chips */}
        {activeFiltersCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/5">
            {selectedGenres.map((g) => (
              <span
                key={g}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-600/20 border border-red-500/30 text-red-300 text-[11px]"
              >
                <span>{g}</span>
                <button
                  onClick={() => setSelectedGenres((prev) => prev.filter((x) => x !== g))}
                  className="hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            {selectedCountries.map((c) => (
              <span
                key={c}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-300 text-[11px]"
              >
                <span>{c}</span>
                <button
                  onClick={() => setSelectedCountries((prev) => prev.filter((x) => x !== c))}
                  className="hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            {languageFilter !== 'all' && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-medium">
                <span>Language: {languageFilter === 'hindi' ? 'हिं Hindi' : languageFilter.toUpperCase()}</span>
                <button onClick={() => setLanguageFilter('all')} className="hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {mediaTypeFilter !== 'all' && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/10 text-gray-300 text-[11px]">
                <span>{mediaTypeFilter === 'tv' ? 'TV Shows' : 'Movies'}</span>
                <button onClick={() => setMediaTypeFilter('all')}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {statusFilter !== 'all' && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/10 text-gray-300 text-[11px]">
                <span className="capitalize">{statusFilter.replace('_', ' ')}</span>
                <button onClick={() => setStatusFilter('all')}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Catalog Grid */}
      {sortedItems.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {sortedItems.map((item) =>
            item.mediaType === 'movie' ? (
              <MovieCard
                key={item.id}
                item={item}
                onClick={() => onSelectItem(item)}
                onChangeMatch={(e) => {
                  e.stopPropagation();
                  onChangeMatch(item);
                }}
                onMarkWatched={handleQuickMarkWatched}
                onDrop={handleQuickDrop}
              />
            ) : (
              <TvSeriesCard
                key={item.id}
                item={item}
                maxEpisodesLimit={settings.maxEpisodesPerSeries}
                capEpisodes={settings.capSeriesEpisodes}
                onClick={() => onSelectItem(item)}
                onChangeMatch={(e) => {
                  e.stopPropagation();
                  onChangeMatch(item);
                }}
                onMarkWatched={handleQuickMarkWatched}
                onDrop={handleQuickDrop}
              />
            )
          )}
        </div>
      ) : (
        <div className="py-20 text-center text-gray-500 bg-[#1c1c1e] rounded-2xl border border-white/10">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-600" />
          <h3 className="text-base font-bold text-gray-300">No titles match these filters</h3>
          <p className="text-xs text-gray-500 mt-1">
            Try adjusting your search keywords, active categories, or release year filters.
          </p>
          <button
            onClick={clearAllFilters}
            className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition-all"
          >
            Clear All Filters
          </button>
        </div>
      )}

      {/* Categories Multi-select Modal */}
      {showGenreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-[#1c1c1e] border border-white/15 rounded-2xl p-6 shadow-2xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-white">Categories & Genres</h3>
                <p className="text-xs text-gray-400">Select one or more categories from your library.</p>
              </div>
              <button
                onClick={() => setShowGenreModal(false)}
                className="p-1.5 rounded-full text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-4 p-2.5 bg-black/40 rounded-xl border border-white/5 mb-4 text-xs">
              <span className="text-gray-400">Match rule:</span>
              <label className="flex items-center gap-1.5 cursor-pointer text-white">
                <input
                  type="radio"
                  name="genreMatchMode"
                  checked={genreMatchMode === 'any'}
                  onChange={() => setGenreMatchMode('any')}
                  className="text-red-600"
                />
                <span>Match ANY selected</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-white">
                <input
                  type="radio"
                  name="genreMatchMode"
                  checked={genreMatchMode === 'all'}
                  onChange={() => setGenreMatchMode('all')}
                  className="text-red-600"
                />
                <span>Match ALL selected</span>
              </label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto p-1">
              {allGenres.map((g) => {
                const isChecked = selectedGenres.includes(g);
                return (
                  <label
                    key={g}
                    className={`flex items-center gap-2 py-1.5 px-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                      isChecked
                        ? 'bg-red-600/20 border-red-500/40 text-white font-semibold'
                        : 'bg-black/30 border-white/5 text-gray-400 hover:text-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        setSelectedGenres((prev) =>
                          isChecked ? prev.filter((x) => x !== g) : [...prev, g]
                        );
                      }}
                      className="rounded bg-neutral-800 border-white/20 text-red-600"
                    />
                    <span>{g}</span>
                  </label>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-5 pt-3 border-t border-white/10">
              <button
                onClick={() => setSelectedGenres([])}
                className="text-xs text-gray-400 hover:text-white underline"
              >
                Reset Categories
              </button>
              <button
                onClick={() => setShowGenreModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Country Multi-select Modal */}
      {showCountryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-[#1c1c1e] border border-white/15 rounded-2xl p-6 shadow-2xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-white">Filter by Country</h3>
                <p className="text-xs text-gray-400">Production or origin countries from your titles.</p>
              </div>
              <button
                onClick={() => setShowCountryModal(false)}
                className="p-1.5 rounded-full text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Country Input */}
            <div className="relative mb-3">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-400" />
              <input
                type="text"
                value={countrySearchQuery}
                onChange={(e) => setCountrySearchQuery(e.target.value)}
                placeholder="Search countries..."
                className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-8 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/60"
              />
              {countrySearchQuery && (
                <button
                  onClick={() => setCountrySearchQuery('')}
                  className="absolute right-2.5 top-2 text-zinc-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto p-1">
              {allCountries
                .filter((c) => c.toLowerCase().includes(countrySearchQuery.toLowerCase()))
                .map((c) => {
                  const isChecked = selectedCountries.includes(c);
                  return (
                    <label
                      key={c}
                      className={`flex items-center gap-2 py-1.5 px-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-blue-600/20 border-blue-500/40 text-white font-semibold'
                          : 'bg-black/30 border-white/5 text-gray-400 hover:text-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          setSelectedCountries((prev) =>
                            isChecked ? prev.filter((x) => x !== c) : [...prev, c]
                          );
                        }}
                        className="rounded bg-neutral-800 border-white/20 text-blue-600"
                      />
                      <span>{c}</span>
                    </label>
                  );
                })}
              {allCountries.filter((c) => c.toLowerCase().includes(countrySearchQuery.toLowerCase())).length === 0 && (
                <div className="col-span-2 text-center py-6 text-xs text-zinc-500">
                  No countries match "{countrySearchQuery}"
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-5 pt-3 border-t border-white/10">
              <button
                onClick={() => setSelectedCountries([])}
                className="text-xs text-gray-400 hover:text-white underline"
              >
                Reset Countries
              </button>
              <button
                onClick={() => setShowCountryModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Year Range Modal */}
      {showYearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-[#1c1c1e] border border-white/15 rounded-2xl p-6 shadow-2xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Filter by Release Year</h3>
              <button
                onClick={() => setShowYearModal(false)}
                className="p-1.5 rounded-full text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-xs text-gray-400 mb-1">From Year</label>
                <input
                  type="number"
                  placeholder="e.g. 2010"
                  value={minYear}
                  onChange={(e) => setMinYear(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">To Year</label>
                <input
                  type="number"
                  placeholder="e.g. 2026"
                  value={maxYear}
                  onChange={(e) => setMaxYear(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-white/10">
              <button
                onClick={() => {
                  setMinYear('');
                  setMaxYear('');
                }}
                className="text-xs text-gray-400 hover:text-white underline"
              >
                Reset
              </button>
              <button
                onClick={() => setShowYearModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-yellow-600 hover:bg-yellow-700 text-black"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
