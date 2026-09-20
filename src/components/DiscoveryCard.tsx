import React from 'react';
import { Star, Clock, Film, Tv, Play, Plus, Check, Layers, ExternalLink } from 'lucide-react';
import { DiscoveryTitle } from '../types';
import { formatRuntime } from '../services/analytics';
import { getNetflixUrl, getPriorityLanguageBadge } from '../services/normalizer';
import { CachedImage } from './CachedImage';

interface DiscoveryCardProps {
  item: DiscoveryTitle;
  isInLibrary: boolean;
  isWatched?: boolean;
  onClick: () => void;
  onAddToLibrary: (item: DiscoveryTitle) => void;
  onStartWatching: (item: DiscoveryTitle) => void;
  onMarkWatched?: (item: DiscoveryTitle) => void;
}

export const DiscoveryCard: React.FC<DiscoveryCardProps> = ({
  item,
  isInLibrary,
  isWatched,
  onClick,
  onAddToLibrary,
  onStartWatching,
  onMarkWatched,
}) => {
  const isMovie = item.mediaType === 'movie';
  const netflixUrl = getNetflixUrl({
    videoId: item.netflixId,
    originalTitle: item.title,
    externalTitle: item.title,
  });

  // Convert DiscoveryTitle to pseudo-LibraryItem for priority language badge
  const pseudoLibItem = {
    originalTitle: item.title,
    externalTitle: item.title,
    originalLanguage: item.originalLanguage,
    languages: item.audioLanguages,
  } as any;
  const langBadge = getPriorityLanguageBadge(pseudoLibItem);

  // Runtime calculation:
  // For movies: item.runtimeMinutes
  // For series: totalEpisodes * averageEpisodeMinutes (or totalEpisodes * 45m)
  const totalEpisodes = item.totalEpisodes || (item.totalSeasons ? item.totalSeasons * 8 : undefined);
  const avgMinutes = item.averageEpisodeMinutes || 45;
  const seriesTotalMinutes = totalEpisodes ? totalEpisodes * avgMinutes : undefined;
  const displayRuntimeMinutes = isMovie ? item.runtimeMinutes : seriesTotalMinutes;

  return (
    <div
      onClick={onClick}
      className="group relative bg-[#181818] hover:bg-[#232323] rounded-xl overflow-hidden border border-white/5 hover:border-red-600/40 transition-all duration-300 shadow-lg hover:shadow-2xl hover:-translate-y-1.5 cursor-pointer flex flex-col"
    >
      {/* Poster area */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-neutral-900">
        <CachedImage
          src={item.posterPath}
          alt={item.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          fallbackIcon={
            <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center text-zinc-500 bg-gradient-to-b from-neutral-800 to-neutral-950">
              {isMovie ? (
                <Film className="w-12 h-12 mb-2 text-zinc-600" />
              ) : (
                <Tv className="w-12 h-12 mb-2 text-zinc-600" />
              )}
              <span className="text-xs line-clamp-2 font-medium">{item.title}</span>
            </div>
          }
        />

        {/* Hover play icon overlay like Netflix */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-11 h-11 rounded-full bg-red-600/90 text-white flex items-center justify-center shadow-xl shadow-red-600/50 transform scale-75 group-hover:scale-100 transition-transform">
            <Play className="w-5 h-5 fill-white ml-0.5" />
          </div>
        </div>

        {/* Top-Right: Ratings (Rotten Tomatoes, IMDb, TMDB) */}
        <div className="absolute top-1.5 sm:top-2 right-1.5 sm:right-2 flex flex-col gap-1 items-end z-10">
          {item.rottenTomatoesRating !== undefined && (
            <div
              className={`px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] font-black flex items-center gap-1 shadow-md backdrop-blur-md border ${
                item.rottenTomatoesRating >= 60
                  ? 'bg-red-950/85 border-red-500/50 text-red-400'
                  : 'bg-green-950/85 border-green-500/50 text-green-400'
              }`}
              title="Rotten Tomatoes Score"
            >
              <span>🍅 {item.rottenTomatoesRating}%</span>
            </div>
          )}

          {item.imdbRating && (
            <div
              className="bg-black/85 backdrop-blur-md px-1.5 py-0.5 rounded flex items-center gap-1 text-[10px] sm:text-[11px] font-black text-amber-400 shadow-md border border-amber-500/40"
              title="IMDb Rating"
            >
              <span className="text-[9px] sm:text-[10px] text-amber-500 font-black">IMDb</span>
              <span>{item.imdbRating}</span>
            </div>
          )}

          {item.rating && (
            <div
              className="bg-black/85 backdrop-blur-md px-1.5 py-0.5 rounded flex items-center gap-1 text-[10px] sm:text-[11px] font-bold text-sky-300 shadow-md border border-sky-500/30"
              title="TMDB Score"
            >
              <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-sky-400 text-sky-400" />
              <span>{item.rating}</span>
            </div>
          )}
        </div>

        {/* Top-Left: Year/Series info & Priority Language Badge */}
        <div className="absolute top-1.5 sm:top-2 left-1.5 sm:left-2 flex flex-col gap-1 items-start z-10">
          {isMovie ? (
            item.releaseYear ? (
              <div className="bg-black/85 backdrop-blur-md px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-bold text-zinc-200 border border-white/10 shadow-sm">
                {item.releaseYear}
              </div>
            ) : null
          ) : (
            <div className="bg-black/85 backdrop-blur-md px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-bold text-zinc-200 border border-white/10 flex items-center gap-1 shadow-sm">
              <Layers className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#E50914]" />
              <span>
                {item.totalSeasons ? `${item.totalSeasons}S` : ''}
                {item.totalSeasons && totalEpisodes ? ' · ' : ''}
                {totalEpisodes ? `${totalEpisodes} eps` : 'TV'}
              </span>
            </div>
          )}

          {langBadge && (
            <div
              className={`px-1.5 sm:px-2 py-0.5 rounded shadow-lg backdrop-blur-md border flex items-center justify-center text-[10px] sm:text-xs font-black ${langBadge.bgClass} ${langBadge.textClass}`}
              title={`Available in ${langBadge.label}`}
            >
              <span>{langBadge.badge}</span>
            </div>
          )}
        </div>

        {/* Bottom-Left of Thumbnail: Runtime Capsule */}
        {displayRuntimeMinutes ? (
          <div className="absolute bottom-1.5 left-1.5 sm:bottom-2 sm:left-2 z-10 bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-mono font-semibold text-zinc-300 border border-white/10 flex items-center gap-1 shadow-sm">
            <Clock className="w-2.5 h-2.5 text-zinc-400" />
            <span>{formatRuntime(displayRuntimeMinutes)}</span>
          </div>
        ) : null}
      </div>

      {/* Card Content & Action Footer */}
      <div className="p-2.5 sm:p-3.5 flex flex-col justify-between flex-1">
        <div>
          <div className="flex items-center justify-between gap-1 mb-0.5 sm:mb-1">
            <h3
              className="text-xs sm:text-sm font-bold text-white line-clamp-1 group-hover:text-[#E50914] transition-colors"
              title={item.title}
            >
              {item.title}
            </h3>
            <span
              className={`text-[8px] sm:text-[9px] px-1 sm:px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                isMovie
                  ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                  : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
              }`}
            >
              {isMovie ? 'Movie' : 'Series'}
            </span>
          </div>

          {item.originalTitle && item.originalTitle !== item.title && (
            <p className="text-[10px] sm:text-[11px] text-zinc-400 line-clamp-1 italic mb-0.5">
              {item.originalTitle}
            </p>
          )}

          {item.tagline && (
            <p className="text-[10px] sm:text-[11px] text-zinc-300 font-medium italic line-clamp-1 mb-1" title={item.tagline}>
              "{item.tagline}"
            </p>
          )}

          {/* Season & Episode count line for TV Series */}
          {!isMovie && (
            <div className="text-[11px] text-zinc-300 flex items-center flex-wrap gap-1.5 font-medium mb-1">
              <span className="font-semibold text-white">
                {item.totalSeasons ? `${item.totalSeasons} ${item.totalSeasons === 1 ? 'Season' : 'Seasons'}` : 'Series'}
              </span>
              {totalEpisodes ? (
                <>
                  <span className="text-zinc-600">•</span>
                  <span>{totalEpisodes} Episodes</span>
                </>
              ) : null}
              {seriesTotalMinutes ? (
                <>
                  <span className="text-zinc-600">•</span>
                  <span className="text-amber-400/90 font-mono text-[10px]">
                    {formatRuntime(seriesTotalMinutes)} total
                  </span>
                </>
              ) : null}
            </div>
          )}

          {/* Genre & Theme Tags - Show all themes and genres */}
          {(item.genres && item.genres.length > 0) || (item.themes && item.themes.length > 0) ? (
            <div className="flex flex-wrap gap-1 mt-1.5 sm:mt-2 items-center">
              {item.themes && item.themes.map((t) => (
                <span
                  key={`theme-${t}`}
                  className="text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded bg-purple-950/70 text-purple-300 border border-purple-500/40 font-semibold"
                  title={`Theme: ${t}`}
                >
                  ✨ {t}
                </span>
              ))}
              {item.genres && item.genres.map((g) => (
                <span
                  key={`genre-${g}`}
                  className="text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/50 font-medium"
                >
                  {g}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* Action Row: Total Hours / Runtime + Direct Netflix Link + Add to Library + Watch */}
        <div className="mt-2 sm:mt-3 pt-2 border-t border-zinc-800/80 flex flex-col gap-1.5 sm:gap-2">
          <div className="flex items-center justify-between gap-1 text-xs text-zinc-300">
            <div className="flex items-center gap-1 font-mono text-zinc-400 whitespace-nowrap text-[10px] sm:text-[11px] min-w-0">
              <Clock className="w-3 h-3 text-zinc-500 shrink-0" />
              <span className="truncate" title={isMovie ? 'Movie Duration' : 'Total Series Duration'}>
                {displayRuntimeMinutes ? formatRuntime(displayRuntimeMinutes) : isMovie ? 'Movie' : 'Series'}
              </span>
            </div>

            <a
              href={netflixUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-[#E50914] hover:bg-red-700 text-white font-black text-[10px] sm:text-[11px] flex items-center gap-1 shadow-md shadow-red-600/30 transition-transform active:scale-95 shrink-0 whitespace-nowrap"
              title="Watch on official Netflix India"
            >
              <Play className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-white" />
              <span>Netflix</span>
            </a>
          </div>

          {/* Add to Library, Start Watching & Mark Watched Buttons */}
          <div className="flex items-center gap-1.5 pt-1 border-t border-zinc-800/40">
            {isInLibrary ? (
              <span className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 text-[10px] sm:text-[11px] font-bold">
                <Check className="w-3 h-3" />
                <span>In Library</span>
              </span>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToLibrary(item);
                }}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-white/10 hover:bg-[#E50914] text-white text-[10px] sm:text-[11px] font-bold transition-colors active:scale-95"
                title="Add to Watchlist Library"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            )}

            {/* Quick Watched Action Button */}
            {onMarkWatched && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkWatched(item);
                }}
                className={`px-2 sm:px-2.5 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-bold flex items-center gap-1 transition-all border active:scale-95 ${
                  isWatched
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30'
                    : 'bg-zinc-800/90 hover:bg-emerald-600 hover:text-white text-zinc-300 border-zinc-700/60'
                }`}
                title={isWatched ? 'Completed / Watched' : 'Mark as Watched'}
              >
                <Check className="w-3 h-3" />
                <span className="hidden xs:inline sm:inline">Watched</span>
              </button>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                onStartWatching(item);
              }}
              className="px-2 sm:px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-black transition-all border border-amber-500/30 text-[10px] sm:text-[11px] font-bold flex items-center gap-1 active:scale-95"
              title="Start Watching"
            >
              <Tv className="w-3 h-3" />
              <span>Watch</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
