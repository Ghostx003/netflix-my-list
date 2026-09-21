import React, { useState, useMemo } from 'react';
import {
  X,
  Calendar,
  Film,
  Tv,
  Star,
  Clock,
  Play,
  Compass,
  Search,
  Layers,
  Sparkles,
} from 'lucide-react';
import { DiscoveryTitle } from '../types';
import { formatRuntime } from '../services/analytics';
import { getNetflixUrl, openNetflixInNewTab } from '../services/normalizer';
import { CachedImage } from './CachedImage';

interface YearExploreModalProps {
  isOpen: boolean;
  onClose: () => void;
  year: number;
  catalog: DiscoveryTitle[];
  onSelectTitle: (title: DiscoveryTitle) => void;
  onAddToLibrary?: (item: DiscoveryTitle) => void;
  onStartWatching?: (item: DiscoveryTitle) => void;
  isInLibrary?: (item: DiscoveryTitle) => boolean;
}

export const YearExploreModal: React.FC<YearExploreModalProps> = ({
  isOpen,
  onClose,
  year,
  catalog,
  onSelectTitle,
}) => {
  // Tab filter: 'all' | 'movie' | 'tv'
  const [activeTab, setActiveTab] = useState<'all' | 'movie' | 'tv'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Get all catalog titles for the specified year
  const allYearTitles = useMemo(() => {
    return catalog.filter((t) => t.releaseYear === year);
  }, [catalog, year]);

  // 2. Filter by search query if user searches inside the modal
  const filteredTitles = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return allYearTitles;
    return allYearTitles.filter((t) => {
      const matchTitle = (t.title || '').toLowerCase().includes(q);
      const matchOriginal = (t.originalTitle || '').toLowerCase().includes(q);
      const matchGenre = (t.genres || []).some((g) => g.toLowerCase().includes(q));
      const matchTheme = (t.themes || []).some((th) => th.toLowerCase().includes(q));
      return matchTitle || matchOriginal || matchGenre || matchTheme;
    });
  }, [allYearTitles, searchQuery]);

  // 3. Separate into Movies and TV Shows sections
  const moviesList = useMemo(() => {
    return filteredTitles
      .filter((t) => t.mediaType === 'movie')
      .sort((a, b) => (b.imdbRating || 0) - (a.imdbRating || 0));
  }, [filteredTitles]);

  const tvList = useMemo(() => {
    return filteredTitles
      .filter((t) => t.mediaType === 'tv')
      .sort((a, b) => (b.imdbRating || 0) - (a.imdbRating || 0));
  }, [filteredTitles]);

  if (!isOpen) return null;

  const renderCard = (item: DiscoveryTitle) => {
    const isMovie = item.mediaType === 'movie';
    const netflixUrl = getNetflixUrl({
      videoId: item.netflixId,
      originalTitle: item.title,
      externalTitle: item.title,
    });
    const totalEpisodes =
      item.totalEpisodes || (item.totalSeasons ? item.totalSeasons * 8 : undefined);
    const avgMinutes = item.averageEpisodeMinutes || 45;
    const seriesTotalMinutes = totalEpisodes ? totalEpisodes * avgMinutes : undefined;
    const displayRuntimeMinutes = isMovie ? item.runtimeMinutes : seriesTotalMinutes;

    const originCountry =
      item.watchmodeOriginCountry ||
      item.tmdbOriginCountry ||
      (item.countries && item.countries.length > 0 ? item.countries[0] : undefined);

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
              <div className="bg-black/85 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-black text-red-400 border border-red-500/30 shadow-sm">
                🍅 {item.rottenTomatoesRating}%
              </div>
            )}
            {item.imdbRating && (
              <div className="bg-black/85 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-black text-amber-400 border border-amber-500/30 shadow-sm">
                IMDb {item.imdbRating}
              </div>
            )}
          </div>

          {/* Media Type Overlay Top-Left */}
          <div className="absolute top-1.5 left-1.5 z-10 flex flex-col items-start gap-1">
            <span
              className={`text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider ${
                isMovie ? 'bg-red-600 text-white' : 'bg-purple-600 text-white'
              }`}
            >
              {isMovie ? 'Movie' : 'Series'}
            </span>
            {!isMovie && item.totalSeasons && (
              <span className="bg-black/85 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-bold text-purple-300 border border-purple-500/30">
                {item.totalSeasons}S
              </span>
            )}
          </div>

          {/* Runtime Overlay Bottom-Left */}
          {displayRuntimeMinutes ? (
            <div className="absolute bottom-1.5 left-1.5 z-10 bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold text-zinc-300 border border-white/10 flex items-center gap-1 shadow-sm">
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

            {/* Tags Pills */}
            <div className="flex flex-wrap gap-1 mt-1.5">
              {item.genres?.slice(0, 2).map((g) => (
                <span
                  key={g}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700/50"
                >
                  {g}
                </span>
              ))}
              {item.themes?.slice(0, 1).map((t) => (
                <span
                  key={t}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-purple-950/70 text-purple-300 border border-purple-500/40 font-semibold"
                >
                  ✨ {t}
                </span>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="pt-2 border-t border-zinc-800 flex items-center justify-between gap-1">
            <span className="text-[10px] text-zinc-500 font-mono">Released {year}</span>
            <a
              href={netflixUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.stopPropagation();
                openNetflixInNewTab(netflixUrl, e);
              }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#E50914] hover:bg-red-700 text-white text-[10px] font-black cursor-pointer no-underline"
            >
              <Play className="w-2.5 h-2.5 fill-white" />
              <span>Netflix</span>
            </a>
          </div>
        </div>
      </div>
    );
  };

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
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300">
              <Calendar className="w-6 h-6 text-amber-400" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-2xl font-black text-white">
                  Released in {year}
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 font-bold">
                  {allYearTitles.length} titles
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Available on Netflix India from release year {year}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-zinc-800 hover:bg-[#E50914] text-zinc-300 hover:text-white transition-colors border border-zinc-700 cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls Bar: Section Toggle + Search */}
        <div className="p-5 border-b border-zinc-800/80 bg-zinc-950/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-900 border border-zinc-800">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-[#E50914] text-white shadow-md'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              All ({filteredTitles.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('movie')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'movie'
                  ? 'bg-[#E50914] text-white shadow-md'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Movies ({moviesList.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tv')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'tv'
                  ? 'bg-[#E50914] text-white shadow-md'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
              <span>TV Shows ({tvList.length})</span>
            </button>
          </div>

          {/* Quick Search inside year */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search within ${year}...`}
              className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500"
            />
          </div>
        </div>

        {/* Content Body: Movies Section & TV Shows Section */}
        <div className="p-5 space-y-8 flex-1 overflow-y-auto">
          {/* SECTION 1: MOVIES */}
          {(activeTab === 'all' || activeTab === 'movie') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2 uppercase tracking-wider">
                  <Film className="w-4 h-4 text-red-500" />
                  <span>Movies ({moviesList.length})</span>
                </h3>
                <span className="text-xs text-zinc-400 font-medium">
                  Released in {year}
                </span>
              </div>

              {moviesList.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                  {moviesList.map(renderCard)}
                </div>
              ) : (
                <p className="text-xs text-zinc-500 italic py-4">
                  No movies found for {year} with active search filter.
                </p>
              )}
            </div>
          )}

          {/* SECTION 2: TV SHOWS & SERIES */}
          {(activeTab === 'all' || activeTab === 'tv') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2 uppercase tracking-wider">
                  <Tv className="w-4 h-4 text-purple-400" />
                  <span>TV Shows & Series ({tvList.length})</span>
                </h3>
                <span className="text-xs text-zinc-400 font-medium">
                  Premiered in {year}
                </span>
              </div>

              {tvList.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                  {tvList.map(renderCard)}
                </div>
              ) : (
                <p className="text-xs text-zinc-500 italic py-4">
                  No TV shows found for {year} with active search filter.
                </p>
              )}
            </div>
          )}

          {/* Overall Empty State */}
          {filteredTitles.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-zinc-950/40 rounded-2xl border border-zinc-800 space-y-3">
              <Compass className="w-12 h-12 text-zinc-600" />
              <h3 className="text-base font-bold text-white">
                No titles found for year {year}
              </h3>
              <p className="text-xs text-zinc-400 max-w-md">
                No titles match your query "{searchQuery}". Try searching for something else.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
