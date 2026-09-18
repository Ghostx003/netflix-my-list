import React from 'react';
import { Star, Tv, Clock, Layers, Play, CheckCircle2, UserX } from 'lucide-react';
import { LibraryItem } from '../types';
import { formatRuntime, calculateSeriesRuntime } from '../services/analytics';
import { getNetflixUrl, getPriorityLanguageBadge } from '../services/normalizer';

interface TvSeriesCardProps {
  item: LibraryItem;
  maxEpisodesLimit: number;
  capEpisodes?: boolean;
  onClick: () => void;
  onChangeMatch?: (e: React.MouseEvent) => void;
  onDrop?: (item: LibraryItem, e: React.MouseEvent) => void;
  onMarkWatched?: (item: LibraryItem, e: React.MouseEvent) => void;
}

export const TvSeriesCard: React.FC<TvSeriesCardProps> = ({
  item,
  maxEpisodesLimit,
  capEpisodes = false,
  onClick,
  onChangeMatch,
  onDrop,
  onMarkWatched,
}) => {
  const breakdown = calculateSeriesRuntime(item, maxEpisodesLimit, capEpisodes);
  const netflixUrl = getNetflixUrl(item);
  const langBadge = getPriorityLanguageBadge(item);
  const isCompleted = item.isCompleted || item.viewingStatus === 'completed';
  const isDropped = item.viewingStatus === 'dropped' || !!item.droppedReason;

  return (
    <div
      onClick={onClick}
      className="group relative bg-[#181818] hover:bg-[#232323] rounded-xl overflow-hidden border border-white/5 hover:border-red-600/40 transition-all duration-300 shadow-lg hover:shadow-2xl hover:-translate-y-1.5 cursor-pointer flex flex-col"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-neutral-900">
        {item.posterPath ? (
          <img
            src={item.posterPath}
            alt={item.externalTitle || item.originalTitle}
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center text-zinc-500 bg-gradient-to-b from-neutral-800 to-neutral-950">
            <Tv className="w-12 h-12 mb-2 text-zinc-600" />
            <span className="text-xs line-clamp-2 font-medium">{item.originalTitle}</span>
          </div>
        )}

        {/* Hover play icon overlay like Netflix */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-11 h-11 rounded-full bg-red-600/90 text-white flex items-center justify-center shadow-xl shadow-red-600/50 transform scale-75 group-hover:scale-100 transition-transform">
            <Play className="w-5 h-5 fill-white ml-0.5" />
          </div>
        </div>

        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end z-10">
          {item.rottenTomatoesRating !== undefined ? (
            <div
              className={'px-1.5 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 shadow-md backdrop-blur-md border ' + (item.rottenTomatoesRating >= 60 ? 'bg-red-950/80 text-red-400 border-red-500/40' : 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40')}
              title="Rotten Tomatoes Score"
            >
              <span>🍅 {item.rottenTomatoesRating}%</span>
            </div>
          ) : null}

          {item.imdbRating ? (
            <div
              className="bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded flex items-center gap-1 text-[11px] font-bold text-amber-400 shadow-md border border-amber-500/30"
              title="IMDb Rating"
            >
              <span className="text-[10px] text-amber-500 font-black">IMDb</span>
              <span>{item.imdbRating}</span>
            </div>
          ) : item.rating ? (
            <div className="bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded flex items-center gap-1 text-[11px] font-bold text-amber-400 shadow-md border border-amber-500/30">
              <Star className="w-3 h-3 fill-amber-400" />
              <span>{item.rating}</span>
            </div>
          ) : null}
        </div>

        {/* Top-left: Episodes count & Language badge */}
        <div className="absolute top-2 left-2 flex flex-col gap-1 items-start z-10">
          <div className="bg-black/80 backdrop-blur-md px-2 py-0.5 rounded text-[11px] font-semibold text-zinc-300 border border-white/10 flex items-center gap-1 shadow-sm">
            <Layers className="w-3 h-3 text-[#E50914]" />
            <span>{breakdown.totalEpisodes} eps</span>
          </div>

          {langBadge && (
            <div
              className={`px-2 py-0.5 rounded shadow-lg backdrop-blur-md border flex items-center justify-center ${langBadge.bgClass} ${langBadge.textClass}`}
              title={`Available in ${langBadge.label}`}
            >
              <span>{langBadge.badge}</span>
            </div>
          )}
        </div>
      </div>

      <div className="p-3.5 flex flex-col justify-between flex-1">
        <div>
          <div className="flex items-center justify-between gap-1 mb-1">
            <h3
              className="text-sm font-bold text-white line-clamp-1 group-hover:text-[#E50914] transition-colors"
              title={item.externalTitle || item.originalTitle}
            >
              {item.externalTitle || item.originalTitle}
            </h3>
            {item.viewingStatus && item.viewingStatus !== 'unwatched' && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                item.viewingStatus === 'still_watching' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                item.viewingStatus === 'completed' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                'bg-red-500/20 text-red-300 border border-red-500/30'
              }`}>
                {item.viewingStatus === 'still_watching' ? 'Watching' : item.viewingStatus}
              </span>
            )}
          </div>
          {item.externalTitle && item.externalTitle !== item.originalTitle && (
            <p className="text-[11px] text-zinc-400 line-clamp-1 italic mb-1.5">
              {item.originalTitle}
            </p>
          )}

          {/* Compact Genre Tags */}
          {item.genres && item.genres.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {item.genres.slice(0, 3).map((g) => (
                <span
                  key={g}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/50 font-medium"
                >
                  {g}
                </span>
              ))}
              {item.genres.length > 3 && (
                <span className="text-[10px] text-zinc-500 font-mono self-center">
                  +{item.genres.length - 3}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Action Row */}
        <div className="mt-3 pt-2.5 border-t border-zinc-800/80 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-zinc-300">
            <div className="flex items-center gap-1 font-mono text-zinc-400">
              <Clock className="w-3.5 h-3.5 text-zinc-500" />
              <span>{formatRuntime(breakdown.includedRuntimeMinutes)}</span>
            </div>

            <a
              href={netflixUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="px-2.5 py-1 rounded-lg bg-[#E50914] hover:bg-red-700 text-white font-black text-[11px] flex items-center gap-1 shadow-md shadow-red-600/30 transition-transform hover:scale-105"
              title="Watch Series on Netflix"
            >
              <Play className="w-3 h-3 fill-white" />
              <span>Netflix</span>
            </a>
          </div>

          {/* Quick Action Buttons: Watched & Drop */}
          <div className="flex items-center justify-between gap-1.5 pt-1">
            <div className="flex items-center gap-1">
              {onMarkWatched && (
                <button
                  onClick={(e) => onMarkWatched(item, e)}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition-all ${
                    isCompleted
                      ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                      : 'bg-zinc-800 hover:bg-emerald-600 hover:text-white text-zinc-300 border border-zinc-700'
                  }`}
                  title={isCompleted ? 'Completed' : 'Mark as Watched'}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{isCompleted ? 'Watched' : 'Watched'}</span>
                </button>
              )}

              {onDrop && (
                <button
                  onClick={(e) => onDrop(item, e)}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition-all ${
                    isDropped
                      ? 'bg-red-900/30 text-red-300 border border-red-500/40'
                      : 'bg-zinc-800 hover:bg-red-800 hover:text-white text-zinc-300 border border-zinc-700'
                  }`}
                  title={isDropped ? 'Dropped' : 'Drop Series'}
                >
                  <UserX className="w-3 h-3" />
                  <span>Drop</span>
                </button>
              )}
            </div>

            {onChangeMatch && (
              <button
                onClick={onChangeMatch}
                className="text-[10px] text-zinc-400 hover:text-white underline hover:no-underline transition-colors ml-auto"
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
