import React, { useState, useEffect, useRef } from 'react';
import { Play, Info, Plus, Check, Volume2, VolumeX, Sparkles, Star, Film } from 'lucide-react';
import { DiscoveryTitle, RecommendationCandidate } from '../../types';
import { searchYouTubeTrailer } from '../../services/youtubeTrailer';
import { CachedImage } from '../CachedImage';
import { getNetflixUrl, openNetflixInNewTab } from '../../services/normalizer';

interface HeroRecommendationProps {
  candidate: RecommendationCandidate | null;
  isInLibrary: boolean;
  onOpenDetail: (item: DiscoveryTitle) => void;
  onAddToLibrary: (item: DiscoveryTitle) => void;
}

export const HeroRecommendation: React.FC<HeroRecommendationProps> = ({
  candidate,
  isInLibrary,
  onOpenDetail,
  onAddToLibrary,
}) => {
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [isTrailerActive, setIsTrailerActive] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  const item = candidate?.item;

  // Reset trailer when hero candidate changes
  useEffect(() => {
    setIsTrailerActive(false);
    setTrailerKey(null);
  }, [item?.id]);

  // Stop trailer playback immediately when user scrolls down
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 200 && isTrailerActive) {
        setIsTrailerActive(false);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isTrailerActive]);

  // IntersectionObserver: stop trailer if hero banner leaves viewport
  useEffect(() => {
    if (!heroRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.25) {
            setIsTrailerActive(false);
          }
        });
      },
      { threshold: [0, 0.25, 0.6] }
    );

    observer.observe(heroRef.current);
    return () => observer.disconnect();
  }, []);

  // Load trailer info on user interaction or hover
  const handleLoadTrailer = async () => {
    if (!item) return;
    if (trailerKey) {
      setIsTrailerActive(true);
      return;
    }
    try {
      if (item.trailer?.key) {
        setTrailerKey(item.trailer.key);
        setIsTrailerActive(true);
        return;
      }
      const found = await searchYouTubeTrailer(
        item.title,
        item.releaseYear,
        item.mediaType,
        'en'
      );
      if (found?.key) {
        setTrailerKey(found.key);
        setIsTrailerActive(true);
      }
    } catch (err) {
      console.warn('Hero trailer search error:', err);
    }
  };

  const handleToggleTrailer = async () => {
    if (isTrailerActive) {
      setIsTrailerActive(false);
    } else {
      await handleLoadTrailer();
    }
  };

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    // User can intentionally hover for 2.2s to trigger subtle trailer preview
    hoverTimeoutRef.current = setTimeout(() => {
      handleLoadTrailer();
    }, 2200);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  if (!item) {
    return (
      <div className="relative w-full h-[55vh] min-h-[420px] bg-gradient-to-b from-zinc-900 to-[#141414] flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-red-600/20 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-[#E50914] animate-spin" />
          </div>
          <p className="text-zinc-400 text-sm font-medium">Curating your top personalized pick...</p>
        </div>
      </div>
    );
  }

  const backdropUrl = item.backdropPath || item.posterPath;
  const netflixUrl = getNetflixUrl({
    netflixId: item.netflixId,
    videoId: item.netflixId,
    title: item.title,
    originalTitle: item.originalTitle,
  });

  return (
    <div
      ref={heroRef}
      className="relative w-full min-h-[500px] sm:min-h-[540px] lg:min-h-[600px] h-[58vh] sm:h-[64vh] max-h-[760px] flex items-end select-none overflow-hidden group"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Background Media / Video Player */}
      <div className="absolute inset-0 z-0">
        {isTrailerActive && trailerKey ? (
          <div className="w-full h-full relative overflow-hidden pointer-events-none flex items-center justify-center">
            {/* Fully visible, crisp trailer video without aggressive cropping or blur */}
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=${isMuted ? 1 : 0}&controls=0&modestbranding=1&rel=0&loop=1&playlist=${trailerKey}&enablejsapi=1`}
              className="w-full h-[115%] -mt-[3%] object-cover scale-[1.02] pointer-events-none transition-opacity duration-700"
              allow="autoplay; encrypted-media"
              title={item.title}
            />
          </div>
        ) : (
          backdropUrl && (
            <div className="w-full h-full relative">
              <CachedImage
                src={backdropUrl}
                fallbackSrc={item.posterPath}
                alt={item.title}
                className="w-full h-full object-cover object-top scale-100 group-hover:scale-105 transition-transform duration-1000 ease-out"
              />
            </div>
          )
        )}

        {/* Netflix Gradients - softened when trailer is active so video is fully visible */}
        <div
          className={`absolute inset-0 bg-gradient-to-t from-[#141414] ${
            isTrailerActive ? 'via-[#141414]/30 via-80%' : 'via-[#141414]/50 via-70%'
          } to-transparent transition-all duration-500`}
        />
        <div
          className={`absolute inset-0 bg-gradient-to-r from-[#141414]/90 ${
            isTrailerActive ? 'via-[#141414]/25 w-full md:w-1/2' : 'via-[#141414]/40 w-full md:w-3/4'
          } to-transparent transition-all duration-500`}
        />
      </div>

      {/* Hero Content */}
      <div className="relative z-10 w-full px-4 sm:px-8 lg:px-14 pb-6 sm:pb-8 max-w-4xl">
        {/* Recommendation Badge */}
        <div className="flex items-center gap-2 mb-3">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E50914] text-white text-[11px] font-black uppercase tracking-wider shadow-lg shadow-red-600/30">
            <Sparkles className="w-3.5 h-3.5" />
            Top Pick For You • {candidate?.matchPercentage || 95}% Match
          </span>
          {candidate?.reason && (
            <span className="hidden sm:inline-block text-xs font-semibold text-zinc-300 bg-white/10 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
              {candidate.reason}
            </span>
          )}
        </div>

        {/* Title */}
        <h1
          onClick={() => onOpenDetail(item)}
          className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-none mb-3 drop-shadow-md cursor-pointer hover:text-zinc-200 transition-colors"
        >
          {item.title}
        </h1>

        {/* Metadata Line */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm font-semibold text-zinc-300 mb-3 drop-shadow">
          {(item.imdbRating || item.rating) && (
            <span className="flex items-center gap-1 text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              <Star className="w-3.5 h-3.5 fill-current" />
              {item.imdbRating || item.rating}
            </span>
          )}
          {item.releaseYear && <span>{item.releaseYear}</span>}
          <span className="border border-zinc-600 px-1.5 py-0.2 rounded text-[10px] text-zinc-400 uppercase font-mono">
            {item.mediaType === 'tv' ? `${item.totalSeasons || 1} Seasons` : `${item.runtimeMinutes || 115}m`}
          </span>
          <span className="text-zinc-400">•</span>
          <span className="text-zinc-300">{(item.genres || []).slice(0, 3).join(' • ')}</span>
        </div>

        {/* Synopsis */}
        <p className="text-sm sm:text-base text-zinc-300 line-clamp-3 mb-6 max-w-2xl font-normal leading-relaxed drop-shadow">
          {item.synopsis || 'An exceptional cinematic journey chosen specifically for your watch habits and preferences.'}
        </p>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Watch Now - Opens directly on Netflix in a new tab */}
          <a
            href={netflixUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              openNetflixInNewTab(netflixUrl, e);
            }}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#E50914] hover:bg-red-700 text-white font-bold text-sm sm:text-base transition-all transform active:scale-95 shadow-lg shadow-red-600/30"
            title={`Watch "${item.title}" on Netflix`}
          >
            <Play className="w-5 h-5 fill-current" />
            <span>Watch Now</span>
          </a>

          {/* Preview / Stop Trailer Toggle */}
          <button
            onClick={handleToggleTrailer}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm sm:text-base backdrop-blur-md border transition-all transform active:scale-95 ${
              isTrailerActive
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
                : 'bg-white/20 hover:bg-white/30 border-white/20 text-white'
            }`}
            title={isTrailerActive ? 'Stop Trailer Preview' : 'Play Trailer Preview'}
          >
            <Film className="w-4 h-4" />
            <span>{isTrailerActive ? 'Stop Trailer' : 'Preview Trailer'}</span>
          </button>

          {/* More Info */}
          <button
            onClick={() => onOpenDetail(item)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-zinc-600/70 hover:bg-zinc-600/90 text-white font-semibold text-sm sm:text-base backdrop-blur-md border border-white/10 transition-all transform active:scale-95"
          >
            <Info className="w-5 h-5" />
            <span>More Info</span>
          </button>

          {/* Add to / In My List */}
          <button
            onClick={() => onAddToLibrary(item)}
            disabled={isInLibrary}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm sm:text-base font-semibold backdrop-blur-md transition-all ${
              isInLibrary
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-zinc-800/80 hover:bg-zinc-700/80 border-white/20 text-white active:scale-95'
            }`}
            title={isInLibrary ? 'Already in My List' : 'Add to My List'}
          >
            {isInLibrary ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            <span className="hidden sm:inline">{isInLibrary ? 'In My List' : 'My List'}</span>
          </button>
        </div>
      </div>

      {/* Audio Mute/Unmute Control if trailer is playing */}
      {isTrailerActive && (
        <button
          onClick={() => setIsMuted((prev) => !prev)}
          className="absolute right-4 sm:right-14 bottom-7 sm:bottom-9 z-20 w-10 h-10 rounded-full border border-white/20 bg-black/60 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/90 transition-all"
          title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      )}
    </div>
  );
};
