import React from 'react';
import { Star, Clock, Film, Play, CheckCircle2, UserX, Tv } from 'lucide-react';
import { LibraryItem } from '../types';
import { formatRuntime } from '../services/analytics';
import { getNetflixUrl, getPriorityLanguageBadge, openNetflixInNewTab } from '../services/normalizer';
import { resolveNetflixIdForTitle } from '../services/discoveryService';
import { CachedImage } from './CachedImage';

interface MovieCardProps {
  item: LibraryItem;
  onClick: () => void;
  onChangeMatch?: (e: React.MouseEvent) => void;
  onDrop?: (item: LibraryItem, e: React.MouseEvent) => void;
  onMarkWatched?: (item: LibraryItem, e: React.MouseEvent) => void;
  onAddToWatching?: (item: LibraryItem, e: React.MouseEvent) => void;
}

export const MovieCard: React.FC<MovieCardProps> = ({
  item,
  onClick,
  onChangeMatch,
  onDrop,
  onMarkWatched,
  onAddToWatching,
}) => {
  const netflixUrl = getNetflixUrl(item);
  const langBadge = getPriorityLanguageBadge(item);
  const isCompleted = item.isCompleted || item.viewingStatus === 'completed';
  const isDropped = item.viewingStatus === 'dropped' || !!item.droppedReason;
  const isWatching = item.viewingStatus === 'still_watching';



  return (
    <div
      onClick={onClick}
      className="group relative bg-[#181818] hover:bg-[#232323] rounded-xl overflow-hidden border border-white/5 hover:border-red-600/40 transition-all duration-300 shadow-lg hover:shadow-2xl hover:-translate-y-1.5 cursor-pointer flex flex-col"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-neutral-900">
        <CachedImage
          src={item.posterPath}
          alt={item.externalTitle || item.originalTitle}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          fallbackIcon={
            <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center text-zinc-500 bg-gradient-to-b from-neutral-800 to-neutral-950">
              <Film className="w-12 h-12 mb-2 text-zinc-600" />
              <span className="text-xs line-clamp-2 font-medium">{item.originalTitle}</span>
            </div>
          }
        />

        {/* Hover play icon overlay like Netflix */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
          <a
            href={netflixUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={async (e) => {
              let targetUrl = netflixUrl;
              if (!item.videoId || !/^\d+$/.test(item.videoId.trim())) {
                try {
                  const foundId = await resolveNetflixIdForTitle({
                    imdbId: item.imdbId,
                    tmdbId: typeof item.externalId === 'number' ? item.externalId : (item.externalId ? parseInt(String(item.externalId), 10) || undefined : undefined),
                    mediaType: 'movie',
                    title: item.externalTitle || item.originalTitle,
                    videoId: item.videoId,
                  });
                  if (foundId) {
                    item.videoId = foundId;
                    targetUrl = getNetflixUrl({ videoId: foundId, netflixId: foundId });
                  }
                } catch {}
              }
              openNetflixInNewTab(targetUrl, e);
            }}
            className="pointer-events-auto w-11 h-11 rounded-full bg-red-600/90 hover:bg-red-600 text-white flex items-center justify-center shadow-xl shadow-red-600/50 transform scale-75 group-hover:scale-100 hover:scale-110 active:scale-95 transition-all cursor-pointer"
            title="Watch on Netflix (opens in new tab)"
          >
            <Play className="w-5 h-5 fill-white ml-0.5" />
          </a>
        </div>

        {/* Ratings Pills */}
        <div className="absolute top-1.5 sm:top-2 right-1.5 sm:right-2 flex flex-col gap-1 items-end z-10">
          {item.rottenTomatoesRating !== undefined ? (
            <div
              className={`px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] font-bold flex items-center gap-1 shadow-md backdrop-blur-md border ${
                item.rottenTomatoesRating >= 60
                  ? 'bg-red-950/80 border-red-500/40 text-red-400'
                  : 'bg-green-950/80 border-green-500/40 text-green-400'
              }`}
              title="Rotten Tomatoes Score"
            >
              <span>🍅 {item.rottenTomatoesRating}%</span>
            </div>
          ) : null}

          {item.imdbRating ? (
            <div
              className="bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded flex items-center gap-1 text-[10px] sm:text-[11px] font-bold text-amber-400 shadow-md border border-amber-500/30"
              title="IMDb Rating"
            >
              <span className="text-[9px] sm:text-[10px] text-amber-500 font-black">IMDb</span>
              <span>{item.imdbRating}</span>
            </div>
          ) : item.rating ? (
            <div className="bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded flex items-center gap-1 text-[10px] sm:text-[11px] font-bold text-amber-400 shadow-md border border-amber-500/30">
              <Star className="w-3 h-3 fill-amber-400" />
              <span>{item.rating}</span>
            </div>
          ) : null}
        </div>

        {/* Top-left: Release year & Language badge */}
        <div className="absolute top-1.5 sm:top-2 left-1.5 sm:left-2 flex flex-col gap-1 items-start z-10">
          {item.releaseYear ? (
            <div className="bg-black/80 backdrop-blur-md px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-semibold text-zinc-300 border border-white/10 shadow-sm">
              {item.releaseYear}
            </div>
          ) : null}

          {langBadge && (
            <div
              className={`px-1.5 sm:px-2 py-0.5 rounded shadow-lg backdrop-blur-md border flex items-center justify-center text-[10px] sm:text-xs font-bold ${langBadge.bgClass} ${langBadge.textClass}`}
              title={`Available in ${langBadge.label}`}
            >
              <span>{langBadge.badge}</span>
            </div>
          )}
        </div>
      </div>

      <div className="p-2.5 sm:p-3.5 flex flex-col justify-between flex-1">
        <div>
          <div className="flex items-center justify-between gap-1 mb-0.5 sm:mb-1">
            <h3
              className="text-xs sm:text-sm font-bold text-white line-clamp-1 group-hover:text-[#E50914] transition-colors"
              title={item.externalTitle || item.originalTitle}
            >
              {item.externalTitle || item.originalTitle}
            </h3>
            {item.viewingStatus && item.viewingStatus !== 'unwatched' && (
              <span className={`text-[8px] sm:text-[9px] px-1 sm:px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                item.viewingStatus === 'still_watching' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                item.viewingStatus === 'completed' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                'bg-red-500/20 text-red-300 border border-red-500/30'
              }`}>
                {item.viewingStatus === 'still_watching' ? 'Watching' : item.viewingStatus}
              </span>
            )}
          </div>
          {item.tagline && (
            <p className="text-[10px] sm:text-[11px] text-zinc-300 font-medium italic line-clamp-1 mb-1">
              "{item.tagline}"
            </p>
          )}

          {/* Genre & Theme Tags */}
          {(item.genres && item.genres.length > 0) || (item.themes && item.themes.length > 0) ? (
            <div className="flex flex-wrap gap-1 mt-0.5 sm:mt-1 items-center">
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

        {/* Action Row */}
        <div className="mt-2 sm:mt-3 pt-2 border-t border-zinc-800/80 flex flex-col gap-1.5 sm:gap-2">
          <div className="flex items-center justify-between gap-1 text-xs text-zinc-300">
            <div className="flex items-center gap-1 font-mono text-zinc-400 whitespace-nowrap text-[10px] sm:text-[11px] min-w-0">
              <Clock className="w-3 h-3 text-zinc-500 shrink-0" />
              <span className="truncate">{formatRuntime(item.runtimeMinutes || 0)}</span>
            </div>

            <a
              href={netflixUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => openNetflixInNewTab(netflixUrl, e)}
              className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-[#E50914] hover:bg-red-700 text-white font-black text-[10px] sm:text-[11px] flex items-center gap-1 shadow-md shadow-red-600/30 transition-transform active:scale-95 shrink-0 whitespace-nowrap cursor-pointer no-underline"
              title="Watch on Netflix (opens in new tab)"
            >
              <Play className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-white" />
              <span>Netflix</span>
            </a>
          </div>

          {/* Quick Action Buttons: Watched, Watching, Drop & Match */}
          <div className="flex flex-wrap items-center justify-between gap-1 pt-1 border-t border-zinc-800/40">
            <div className="flex flex-wrap items-center gap-1 min-w-0">
              {onMarkWatched && (
                <button
                  onClick={(e) => onMarkWatched(item, e)}
                  className={`px-1.5 py-0.5 sm:py-1 rounded-md text-[9px] sm:text-[10px] font-bold flex items-center gap-1 transition-all active:scale-95 shrink-0 ${
                    isCompleted
                      ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                      : 'bg-zinc-800 hover:bg-emerald-600 hover:text-white text-zinc-300 border border-zinc-700'
                  }`}
                  title={isCompleted ? 'Completed' : 'Mark as Watched'}
                >
                  <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  <span>{isCompleted ? 'Watched' : 'Watched'}</span>
                </button>
              )}

              {onAddToWatching && (
                <button
                  onClick={(e) => onAddToWatching(item, e)}
                  className={`px-1.5 py-0.5 sm:py-1 rounded-md text-[9px] sm:text-[10px] font-bold flex items-center gap-1 transition-all active:scale-95 shrink-0 ${
                    isWatching
                      ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40'
                      : 'bg-zinc-800 hover:bg-amber-500 hover:text-black text-zinc-300 border border-zinc-700'
                  }`}
                  title={isWatching ? 'Currently Watching' : 'Add to Watching'}
                >
                  <Tv className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  <span>{isWatching ? 'Watching' : 'Watching'}</span>
                </button>
              )}

              {onDrop && (
                <button
                  onClick={(e) => onDrop(item, e)}
                  className={`px-1.5 py-0.5 sm:py-1 rounded-md text-[9px] sm:text-[10px] font-bold flex items-center gap-1 transition-all active:scale-95 shrink-0 ${
                    isDropped
                      ? 'bg-red-900/30 text-red-300 border border-red-500/40'
                      : 'bg-zinc-800 hover:bg-red-800 hover:text-white text-zinc-300 border border-zinc-700'
                  }`}
                  title={isDropped ? 'Dropped' : 'Drop Movie'}
                >
                  <UserX className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  <span>Drop</span>
                </button>
              )}
            </div>

            {onChangeMatch && (
              <button
                onClick={onChangeMatch}
                className="text-[9px] sm:text-[10px] text-zinc-400 hover:text-white underline hover:no-underline transition-colors shrink-0 py-0.5 ml-auto"
                title="Change TMDB Match"
              >
                Match
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
