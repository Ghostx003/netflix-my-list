import React from 'react';
import { X, Star, Clock, Calendar, Film, Tv, Play, ExternalLink, Sparkles, Layers, Video } from 'lucide-react';
import { AppSettings, LibraryItem } from '../types';
import { formatRuntime, calculateSeriesRuntime } from '../services/analytics';
import { getNetflixUrl } from '../services/normalizer';

interface MediaDetailModalProps {
  item: LibraryItem | null;
  onClose: () => void;
  settings: AppSettings;
  onChangeMatch?: (item: LibraryItem) => void;
}

export const MediaDetailModal: React.FC<MediaDetailModalProps> = ({
  item,
  onClose,
  settings,
  onChangeMatch,
}) => {
  if (!item) return null;

  const isMovie = item.mediaType === 'movie';
  const tvBreakdown = !isMovie ? calculateSeriesRuntime(item, settings.maxEpisodesPerSeries, settings.capSeriesEpisodes) : null;
  const displayTitle = item.externalTitle || item.originalTitle;
  const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(displayTitle + ' official trailer')}`;
  const netflixUrl = getNetflixUrl(item);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl text-white scrollbar-thin scrollbar-thumb-zinc-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2 rounded-full bg-black/70 hover:bg-[#E50914] text-zinc-300 hover:text-white transition-colors border border-white/10 shadow-lg"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Hero Backdrop / Trailer Player */}
        <div className="relative aspect-video w-full max-h-[380px] bg-black overflow-hidden group">
          {item.trailer ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${item.trailer.key}?autoplay=1&rel=0`}
              title={item.trailer.name || 'Trailer'}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full border-0"
            />
          ) : item.backdropPath || item.posterPath ? (
            <div className="relative w-full h-full">
              <img
                src={item.backdropPath || item.posterPath}
                alt={displayTitle}
                className="w-full h-full object-cover brightness-75 group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/40 to-transparent" />
              <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between">
                <a
                  href={youtubeSearchUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#E50914] hover:bg-red-700 text-white font-bold text-xs shadow-lg transition-all transform hover:scale-105"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Search Trailer on YouTube</span>
                </a>
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 to-black gap-3 p-6 text-center">
              {isMovie ? <Film className="w-16 h-16 text-zinc-700" /> : <Tv className="w-16 h-16 text-zinc-700" />}
              <p className="text-zinc-400 text-xs font-medium">No embedded video found for this title</p>
              <a
                href={youtubeSearchUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold border border-zinc-700 transition-colors"
              >
                <Video className="w-4 h-4 text-red-500" />
                <span>Find Official Trailer on YouTube</span>
                <ExternalLink className="w-3.5 h-3.5 ml-1 text-zinc-400" />
              </a>
            </div>
          )}
        </div>

        {/* Content body */}
        <div className="p-6">
          <div className="flex flex-col sm:flex-row gap-6">
            {/* Poster thumbnail */}
            {item.posterPath && (
              <div className="hidden sm:block flex-shrink-0 w-36 aspect-[2/3] rounded-xl overflow-hidden shadow-2xl border border-zinc-700 -mt-16 relative z-10 bg-zinc-800">
                <img
                  src={item.posterPath}
                  alt={displayTitle}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Details */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs uppercase font-black px-2.5 py-0.5 rounded bg-[#E50914] text-white">
                  {isMovie ? 'Movie' : 'TV Series'}
                </span>
                {item.trailer ? (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-500/30 flex items-center gap-1">
                    <Play className="w-3 h-3 text-red-500 fill-red-500" />
                    <span>Trailer: {item.trailer.language.toUpperCase()}</span>
                  </span>
                ) : (
                  <a
                    href={youtubeSearchUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center gap-1 border border-zinc-700 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3 text-red-400" />
                    <span>Search Web Trailer</span>
                  </a>
                )}
                <a
                  href={netflixUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#E50914] hover:bg-red-700 text-white text-xs font-black shadow-md transition-all transform hover:scale-105 ml-auto"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Watch on Netflix</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <h2 className="text-2xl sm:text-3xl font-black mt-2 text-white tracking-tight">
                {displayTitle}
              </h2>

              {item.externalTitle && item.externalTitle !== item.originalTitle && (
                <p className="text-xs text-zinc-400 mt-0.5 italic">
                  Netflix Original Title: "{item.originalTitle}"
                </p>
              )}

              {/* Metrics Pill Row */}
              <div className="flex flex-wrap items-center gap-2.5 mt-4 text-xs font-semibold text-zinc-300">
                {item.rottenTomatoesRating !== undefined && (
                  <div className="flex items-center gap-1 bg-red-950/80 text-red-400 px-2.5 py-1 rounded-lg border border-red-500/40">
                    <span>🍅 {item.rottenTomatoesRating}% Rotten Tomatoes</span>
                  </div>
                )}

                {item.imdbRating && (
                  <div className="flex items-center gap-1.5 text-amber-400 bg-black/80 px-2.5 py-1 rounded-lg border border-amber-500/30">
                    <span className="text-[10px] text-amber-500 font-black">IMDb</span>
                    <span>{item.imdbRating}</span>
                    <span className="text-[10px] text-zinc-500 font-normal">/10</span>
                  </div>
                )}

                {item.releaseYear && (
                  <div className="flex items-center gap-1 bg-zinc-800 px-2.5 py-1 rounded-lg border border-zinc-700">
                    <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                    <span>{item.releaseYear}</span>
                  </div>
                )}

                {isMovie ? (
                  <div className="flex items-center gap-1 font-mono bg-zinc-800 px-2.5 py-1 rounded-lg border border-zinc-700">
                    <Clock className="w-3.5 h-3.5 text-zinc-400" />
                    <span>{formatRuntime(item.runtimeMinutes || 0)}</span>
                  </div>
                ) : tvBreakdown ? (
                  <div className="flex items-center gap-1 font-mono bg-zinc-800 px-2.5 py-1 rounded-lg border border-zinc-700">
                    <Clock className="w-3.5 h-3.5 text-[#E50914]" />
                    <span>{formatRuntime(tvBreakdown.includedRuntimeMinutes)}</span>
                    <span className="text-[11px] text-zinc-400">({tvBreakdown.includedEpisodes} episodes)</span>
                  </div>
                ) : null}
              </div>

              {/* TV Specific Episode Calculation Highlight */}
              {!isMovie && tvBreakdown && (
                <div className="mt-4 p-3.5 rounded-xl bg-black/40 border border-zinc-800 text-xs">
                  <div className="flex items-center justify-between font-semibold text-zinc-200">
                    <span className="flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-[#E50914]" />
                      Series Runtime Calculation:
                    </span>
                    <span className="text-zinc-400">
                      All episodes included
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-zinc-800 text-zinc-300">
                    <div>
                      <span className="text-zinc-500 block text-[10px]">Total Available</span>
                      <span className="font-semibold text-white">{tvBreakdown.totalEpisodes} episodes</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">Included in Calc</span>
                      <span className="font-semibold text-white">{tvBreakdown.includedEpisodes} episodes</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">Average Episode</span>
                      <span className="font-semibold text-white">~{tvBreakdown.averageEpisodeMinutes}m</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Genres & Countries */}
              {(item.genres || item.countries) && (
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {item.genres?.map((g) => (
                    <span
                      key={g}
                      className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700"
                    >
                      {g}
                    </span>
                  ))}
                  {item.countries?.map((c) => (
                    <span
                      key={c}
                      className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-blue-950/40 text-blue-300 border border-blue-800/40"
                    >
                      🌍 {c}
                    </span>
                  ))}
                </div>
              )}

              {/* Synopsis */}
              <div className="mt-4">
                <h4 className="text-xs uppercase font-semibold tracking-wider text-zinc-400 mb-1">
                  Synopsis
                </h4>
                <p className="text-sm text-zinc-300 leading-relaxed">
                  {item.synopsis || 'No detailed overview available for this title.'}
                </p>
              </div>

              {/* Footer Links & Search Alternatives */}
              <div className="mt-5 pt-3 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <a
                    href={netflixUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-[#E50914] hover:underline font-bold"
                  >
                    <Play className="w-3.5 h-3.5 fill-[#E50914]" />
                    <span>Open on Netflix ({displayTitle})</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>

                  <span className="text-zinc-600">•</span>

                  <a
                    href={youtubeSearchUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white hover:underline font-semibold"
                  >
                    <Video className="w-3.5 h-3.5 text-red-400" />
                    <span>Search Trailers on YouTube</span>
                    <ExternalLink className="w-3 h-3 text-zinc-500" />
                  </a>
                </div>

                {onChangeMatch && (
                  <button
                    onClick={() => onChangeMatch(item)}
                    className="text-xs text-zinc-400 hover:text-white underline transition-colors"
                  >
                    Wrong match? Search TMDB & Multi-API
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
