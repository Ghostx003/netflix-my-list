import React, { useState } from 'react';
import { Play, Plus, Check, Star, Info, Sparkles } from 'lucide-react';
import { DiscoveryTitle, RecommendationCandidate } from '../../types';
import { CachedImage } from '../CachedImage';
import { getNetflixUrl, openNetflixInNewTab } from '../../services/normalizer';

interface RecommendationCardProps {
  candidate: RecommendationCandidate;
  isInLibrary: boolean;
  onClick: () => void;
  onAddToLibrary: (item: DiscoveryTitle) => void;
  onStartWatching?: (item: DiscoveryTitle) => void;
}

export const RecommendationCard: React.FC<RecommendationCardProps> = ({
  candidate,
  isInLibrary,
  onClick,
  onAddToLibrary,
  onStartWatching,
}) => {
  const item = candidate.item;
  const rating = item.imdbRating || item.rating;
  const netflixUrl = getNetflixUrl(item);

  return (
    <div
      className="relative flex-none w-[170px] sm:w-[210px] md:w-[240px] aspect-[2/3] rounded-lg overflow-hidden cursor-pointer group select-none transition-all duration-300 ease-out hover:z-30 hover:scale-105 hover:shadow-2xl hover:shadow-black/80"
      onClick={onClick}
    >
      {/* Poster Image */}
      <div className="w-full h-full bg-zinc-900">
        <CachedImage
          src={item.posterPath || item.backdropPath}
          fallbackSrc={item.backdropPath || item.posterPath}
          alt={item.title}
          className="w-full h-full object-cover rounded-lg group-hover:brightness-90 transition-all duration-300"
        />
      </div>

      {/* Match Percentage Badge (Always Top-Right) */}
      <div className="absolute top-2 right-2 z-10">
        <span className="px-2 py-0.5 rounded-full bg-black/75 backdrop-blur-md text-emerald-400 font-extrabold text-[10px] sm:text-xs border border-emerald-500/30 shadow-md">
          {candidate.matchPercentage}% Match
        </span>
      </div>

      {/* Media Type Badge (Top-Left) */}
      <div className="absolute top-2 left-2 z-10">
        <span className="px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md text-zinc-300 font-mono text-[9px] uppercase border border-white/10">
          {item.mediaType === 'tv' ? 'Series' : 'Movie'}
        </span>
      </div>

      {/* Gradient Overlay for Titles & Info */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-90 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
        {/* Title */}
        <h3 className="text-xs sm:text-sm font-bold text-white leading-tight line-clamp-1 group-hover:text-red-400 transition-colors">
          {item.title}
        </h3>

        {/* Quick Metadata Row */}
        <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-zinc-300 mt-1">
          {rating && (
            <span className="flex items-center gap-0.5 text-amber-400 font-bold">
              <Star className="w-3 h-3 fill-current" />
              {rating}
            </span>
          )}
          {item.releaseYear && <span>{item.releaseYear}</span>}
          {item.runtimeMinutes && <span>{item.runtimeMinutes}m</span>}
        </div>

        {/* Dynamic Netflix-Style Reason */}
        {candidate.reason && (
          <div className="mt-1.5 flex items-start gap-1 text-[10px] text-zinc-400 line-clamp-1 italic">
            <Sparkles className="w-2.5 h-2.5 text-[#E50914] flex-shrink-0 mt-0.5" />
            <span>{candidate.reason}</span>
          </div>
        )}

        {/* Quick Action Icons on Hover */}
        <div className="mt-2.5 flex items-center justify-between gap-1.5 pt-2 border-t border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-1.5">
            <a
              href={netflixUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                openNetflixInNewTab(netflixUrl, e);
                if (onStartWatching) onStartWatching(item);
              }}
              className="w-7 h-7 rounded-full bg-white text-black flex items-center justify-center hover:bg-zinc-200 transition-transform active:scale-90 shadow cursor-pointer"
              title={`Watch "${item.title}" on Netflix India`}
            >
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            </a>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddToLibrary(item);
              }}
              disabled={isInLibrary}
              className={`w-7 h-7 rounded-full flex items-center justify-center border transition-all active:scale-90 ${
                isInLibrary
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                  : 'bg-zinc-800/80 border-white/30 text-white hover:bg-zinc-700'
              }`}
              title={isInLibrary ? 'Already in My List' : 'Add to My List'}
            >
              {isInLibrary ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            </button>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className="w-7 h-7 rounded-full bg-zinc-800/80 border border-white/20 text-zinc-300 flex items-center justify-center hover:text-white hover:bg-zinc-700 active:scale-90 transition-all"
            title="More Information"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
