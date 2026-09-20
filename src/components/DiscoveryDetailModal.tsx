import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  X,
  Star,
  Clock,
  Calendar,
  Film,
  Tv,
  Play,
  Sparkles,
  Layers,
  ChevronLeft,
  Volume2,
  Globe,
  Tag,
  User,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { AppSettings, DiscoveryTitle, EpisodeInfo, TrailerInfo } from '../types';
import { formatRuntime } from '../services/analytics';
import { getNetflixUrl, getPriorityLanguageBadge } from '../services/normalizer';
import { searchYouTubeTrailer } from '../services/youtubeTrailer';
import { findLocalSimilarTitles } from '../services/discoverySimilarity';
import { CachedImage } from './CachedImage';

interface DiscoveryDetailModalProps {
  // Stack navigation support: current title and stack history
  titleStack: DiscoveryTitle[];
  catalog: DiscoveryTitle[];
  onClose: () => void;
  onPushTitle: (title: DiscoveryTitle) => void;
  onPopTitle: () => void;
  onAddToLibrary: (item: DiscoveryTitle) => void;
  onStartWatching: (item: DiscoveryTitle) => void;
  isInLibrary: (item: DiscoveryTitle) => boolean;
  settings: AppSettings;
}

export const DiscoveryDetailModal: React.FC<DiscoveryDetailModalProps> = ({
  titleStack,
  catalog,
  onClose,
  onPushTitle,
  onPopTitle,
  onAddToLibrary,
  onStartWatching,
  isInLibrary,
  settings,
}) => {
  const currentTitle = titleStack[titleStack.length - 1];
  if (!currentTitle) return null;

  const modalContainerRef = useRef<HTMLDivElement>(null);
  const isMovie = currentTitle.mediaType === 'movie';
  const displayTitle = currentTitle.title;
  const netflixUrl = getNetflixUrl({
    videoId: currentTitle.netflixId,
    originalTitle: currentTitle.title,
    externalTitle: currentTitle.title,
  });
  const inLib = isInLibrary(currentTitle);

  // Active trailer state & language selection
  const [trailerLang, setTrailerLang] = useState<'hi' | 'en'>('hi');
  const [activeTrailer, setActiveTrailer] = useState<TrailerInfo | null>(currentTitle.trailer || null);
  const [isSearchingTrailer, setIsSearchingTrailer] = useState(false);

  // Collapsible Languages State (collapsed by default as requested)
  const [isLanguagesExpanded, setIsLanguagesExpanded] = useState(false);

  // Actor / Cast modal state
  const [selectedCastMember, setSelectedCastMember] = useState<string | null>(null);

  // TV Series Season Selector State
  const seasonsMap = useMemo(() => {
    if (isMovie || !currentTitle.episodes || currentTitle.episodes.length === 0) return null;
    const map = new Map<number, EpisodeInfo[]>();
    for (const ep of currentTitle.episodes) {
      const sNum = ep.seasonNumber || 1;
      if (!map.has(sNum)) map.set(sNum, []);
      map.get(sNum)!.push(ep);
    }
    for (const eps of map.values()) {
      eps.sort((a, b) => a.episodeNumber - b.episodeNumber);
    }
    return map;
  }, [isMovie, currentTitle.episodes]);

  const sortedSeasonNumbers = useMemo(() => {
    if (!seasonsMap) return [];
    return Array.from(seasonsMap.keys()).sort((a, b) => a - b);
  }, [seasonsMap]);

  const [selectedSeason, setSelectedSeason] = useState<number>(() => {
    return sortedSeasonNumbers.length > 0 ? sortedSeasonNumbers[0] : 1;
  });

  // Keep trailer synced when current title changes
  useEffect(() => {
    setActiveTrailer(currentTitle.trailer || null);
    if (sortedSeasonNumbers.length > 0) {
      setSelectedSeason(sortedSeasonNumbers[0]);
    }
    // Default languages to collapsed whenever a new title is viewed
    setIsLanguagesExpanded(false);
  }, [currentTitle.id, sortedSeasonNumbers]);

  // Automatic YouTube Hindi/English trailer lookup if missing or language toggled
  useEffect(() => {
    let isMounted = true;
    setIsSearchingTrailer(true);

    searchYouTubeTrailer(displayTitle, currentTitle.releaseYear, currentTitle.mediaType, trailerLang)
      .then((found) => {
        if (!isMounted) return;
        setIsSearchingTrailer(false);
        if (found) {
          setActiveTrailer(found);
        }
      })
      .catch(() => {
        if (isMounted) setIsSearchingTrailer(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentTitle.id, displayTitle, currentTitle.releaseYear, currentTitle.mediaType, trailerLang]);

  // Compute "Movies & TV Shows Like This" (Local similarity scoring across local catalog)
  const localSimilarTitles = useMemo(() => {
    return findLocalSimilarTitles(currentTitle, catalog, 6);
  }, [currentTitle, catalog]);

  // Compute "TMDB Recommendations" (Filtered strictly against existing local catalog titles)
  const tmdbRecommendationTitles = useMemo(() => {
    if (!currentTitle.tmdbRecommendationIds || currentTitle.tmdbRecommendationIds.length === 0) {
      return [];
    }
    const recIdSet = new Set(currentTitle.tmdbRecommendationIds);
    return catalog.filter((t) => t.id !== currentTitle.id && t.tmdbId && recIdSet.has(t.tmdbId)).slice(0, 6);
  }, [currentTitle, catalog]);

  // Compute other catalog titles for selected cast member
  const castTitles = useMemo(() => {
    if (!selectedCastMember) return [];
    const searchName = selectedCastMember.toLowerCase().trim();
    return catalog.filter((t) =>
      t.cast?.some((actor) => actor.toLowerCase().includes(searchName))
    );
  }, [selectedCastMember, catalog]);

  // Priority language badge
  const pseudoLibItem = {
    originalTitle: currentTitle.title,
    externalTitle: currentTitle.title,
    originalLanguage: currentTitle.originalLanguage,
    languages: currentTitle.audioLanguages,
  } as any;
  const langBadge = getPriorityLanguageBadge(pseudoLibItem);

  // Runtime calculation for series or movies
  const totalEpisodes = currentTitle.totalEpisodes || (currentTitle.totalSeasons ? currentTitle.totalSeasons * 8 : undefined);
  const avgMinutes = currentTitle.averageEpisodeMinutes || 45;
  const seriesTotalMinutes = totalEpisodes ? totalEpisodes * avgMinutes : undefined;
  const displayRuntimeMinutes = isMovie ? currentTitle.runtimeMinutes : seriesTotalMinutes;

  const handleSelectSimilarTitle = (title: DiscoveryTitle) => {
    onPushTitle(title);
    if (modalContainerRef.current) {
      modalContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div
        ref={modalContainerRef}
        className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-[#141414] border border-zinc-800 rounded-2xl shadow-2xl text-white scrollbar-thin scrollbar-thumb-zinc-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Navigation Header / Back Button if Stack > 1 */}
        <div className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-[#141414]/95 backdrop-blur-md border-b border-white/10">
          <div className="flex items-center gap-2">
            {titleStack.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  onPopTitle();
                  if (modalContainerRef.current) {
                    modalContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-zinc-200 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back to {titleStack[titleStack.length - 2].title}</span>
              </button>
            )}
            <span className="text-xs text-zinc-400 font-mono">
              {titleStack.length > 1 ? `Step ${titleStack.length} of exploration` : 'Title Details'}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1. TOP: Trailer / Video Player Header */}
        <div className="relative aspect-video w-full max-h-[400px] bg-black overflow-hidden">
          {activeTrailer ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${activeTrailer.key}?autoplay=1&mute=0&controls=1&rel=0&modestbranding=1`}
              title={activeTrailer.name || `${displayTitle} Trailer`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full border-0"
            />
          ) : currentTitle.backdropPath || currentTitle.posterPath ? (
            <div className="relative w-full h-full">
              <CachedImage
                src={currentTitle.backdropPath || currentTitle.posterPath}
                alt={displayTitle}
                className="w-full h-full object-cover opacity-60"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-black/40 to-transparent" />
              {isSearchingTrailer && (
                <div className="absolute bottom-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/70 backdrop-blur-md text-xs text-amber-300 border border-amber-500/30">
                  <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  <span>Searching official {trailerLang === 'hi' ? 'Hindi' : 'English'} trailer...</span>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-zinc-900 text-zinc-600">
              {isMovie ? <Film className="w-16 h-16" /> : <Tv className="w-16 h-16" />}
            </div>
          )}
        </div>

        {/* 2. MAIN INFORMATION CARD (POSTER ON LEFT, CONTENT/METADATA ON RIGHT) */}
        <div className="p-5 sm:p-7 space-y-6">
          {/* Top Pill Bar: Badges & Netflix Button */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {/* MOVIE / TV SERIES Capsule */}
              <span
                className={`text-[10px] sm:text-xs font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${
                  isMovie
                    ? 'bg-red-600/20 text-red-400 border border-red-500/40'
                    : 'bg-purple-600/20 text-purple-300 border border-purple-500/40'
                }`}
              >
                {isMovie ? 'Movie' : 'TV Series'}
              </span>

              {/* Priority Language Badge Capsule */}
              {langBadge && (
                <span
                  className={`text-[10px] sm:text-xs font-black px-2.5 py-1 rounded-full border shadow-sm ${langBadge.bgClass} ${langBadge.textClass}`}
                  title={`Priority Audio: ${langBadge.label}`}
                >
                  {langBadge.badge} ({langBadge.label})
                </span>
              )}

              {/* Trailer Toggle Capsule */}
              <div className="flex items-center rounded-full bg-zinc-800/80 border border-zinc-700/60 p-0.5 text-[10px] sm:text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setTrailerLang('hi')}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full transition-colors ${
                    trailerLang === 'hi'
                      ? 'bg-amber-500 text-black font-black'
                      : 'text-zinc-300 hover:text-white'
                  }`}
                  title="Switch to Hindi Trailer"
                >
                  <Play className="w-2.5 h-2.5 fill-current" />
                  <span>Trailer: HI</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTrailerLang('en')}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full transition-colors ${
                    trailerLang === 'en'
                      ? 'bg-amber-500 text-black font-black'
                      : 'text-zinc-300 hover:text-white'
                  }`}
                  title="Switch to English Trailer"
                >
                  <Play className="w-2.5 h-2.5 fill-current" />
                  <span>Trailer: EN</span>
                </button>
              </div>

              {currentTitle.status && (
                <span className="text-[10px] sm:text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300 border border-white/10 font-semibold">
                  {currentTitle.status}
                </span>
              )}
            </div>

            {/* Direct Action Buttons */}
            <div className="flex items-center gap-2">
              <a
                href={netflixUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onStartWatching(currentTitle)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#E50914] hover:bg-red-700 text-white text-xs font-black shadow-lg shadow-red-600/30 transition-transform active:scale-95 whitespace-nowrap"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Watch on Netflix</span>
              </a>

              <button
                type="button"
                onClick={() => onAddToLibrary(currentTitle)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${
                  inLib
                    ? 'bg-zinc-800 text-emerald-400 border-emerald-500/40'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-white border-white/10'
                }`}
              >
                {inLib ? '✓ In Library' : '+ Add to Library'}
              </button>
            </div>
          </div>

          {/* TWO COLUMN CARD LAYOUT: POSTER ON LEFT, DETAILS ON RIGHT */}
          <div className="flex flex-col sm:flex-row gap-5 items-start bg-[#181818] p-4 sm:p-6 rounded-2xl border border-white/10 shadow-xl">
            {/* LEFT: Poster Thumbnail */}
            <div className="w-full sm:w-48 md:w-56 shrink-0 aspect-[2/3] rounded-xl overflow-hidden bg-zinc-900 border border-white/10 shadow-2xl relative">
              <CachedImage
                src={currentTitle.posterPath}
                alt={displayTitle}
                className="w-full h-full object-cover"
                fallbackIcon={
                  <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center text-zinc-500 bg-zinc-900">
                    {isMovie ? <Film className="w-12 h-12 mb-2" /> : <Tv className="w-12 h-12 mb-2" />}
                    <span className="text-xs font-medium">{displayTitle}</span>
                  </div>
                }
              />
              {displayRuntimeMinutes ? (
                <div className="absolute bottom-2 left-2 bg-black/80 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono font-semibold text-zinc-200 border border-white/10 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-zinc-400" />
                  <span>{formatRuntime(displayRuntimeMinutes)}</span>
                </div>
              ) : null}
            </div>

            {/* RIGHT: Title, Tagline, Metadata Capsules, Synopsis */}
            <div className="flex-1 min-w-0 space-y-3.5">
              <div className="space-y-1">
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  {displayTitle}
                </h1>
                {currentTitle.originalTitle && currentTitle.originalTitle !== currentTitle.title && (
                  <p className="text-xs sm:text-sm text-zinc-400 italic">
                    {currentTitle.originalTitle}
                  </p>
                )}
                {currentTitle.tagline && (
                  <p className="text-sm font-semibold text-zinc-300 italic pt-0.5">
                    "{currentTitle.tagline}"
                  </p>
                )}
              </div>

              {/* Meta Capsule Row: Year, Runtime, Genres, Country */}
              <div className="flex items-center gap-2 flex-wrap text-xs font-semibold">
                {currentTitle.releaseYear && (
                  <span className="px-2.5 py-0.5 rounded-full bg-zinc-800/90 text-zinc-200 border border-white/10 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-zinc-400" />
                    <span>{currentTitle.releaseYear}</span>
                  </span>
                )}

                {displayRuntimeMinutes ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-zinc-800/90 text-zinc-200 border border-white/10 flex items-center gap-1 font-mono">
                    <Clock className="w-3 h-3 text-zinc-400" />
                    <span>{formatRuntime(displayRuntimeMinutes)}</span>
                  </span>
                ) : null}

                {!isMovie && currentTitle.totalSeasons && (
                  <span className="px-2.5 py-0.5 rounded-full bg-zinc-800/90 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                    <Layers className="w-3 h-3 text-purple-400" />
                    <span>
                      {currentTitle.totalSeasons} {currentTitle.totalSeasons === 1 ? 'Season' : 'Seasons'}
                      {currentTitle.totalEpisodes ? ` (${currentTitle.totalEpisodes} eps)` : ''}
                    </span>
                  </span>
                )}

                {currentTitle.genres &&
                  currentTitle.genres.map((genre) => (
                    <span
                      key={genre}
                      className="px-2.5 py-0.5 rounded-full bg-zinc-800/90 text-zinc-300 border border-zinc-700/60"
                    >
                      {genre}
                    </span>
                  ))}

                {(currentTitle.watchmodeOriginCountry || currentTitle.tmdbOriginCountry) && (
                  <span className="px-2.5 py-0.5 rounded-full bg-zinc-800/90 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <Globe className="w-3 h-3 text-emerald-400" />
                    <span>{currentTitle.watchmodeOriginCountry || currentTitle.tmdbOriginCountry}</span>
                  </span>
                )}
              </div>

              {/* Synopsis (Bigger & Clearer via TMDB) */}
              <div className="space-y-1.5 pt-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Synopsis</h3>
                {currentTitle.synopsis ? (
                  <p className="text-xs sm:text-sm text-zinc-200 leading-relaxed font-normal bg-zinc-900/50 p-3.5 rounded-xl border border-white/5">
                    {currentTitle.synopsis}
                  </p>
                ) : (
                  <p className="text-xs text-zinc-500 italic">No synopsis available yet for this title.</p>
                )}
              </div>

              {/* Themes & Keywords Badges */}
              {currentTitle.themes && currentTitle.themes.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span className="text-xs font-bold text-zinc-400 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    <span>Themes:</span>
                  </span>
                  {currentTitle.themes.map((theme) => (
                    <span
                      key={theme}
                      className="text-[11px] px-2.5 py-0.5 rounded-full bg-purple-950/70 text-purple-300 border border-purple-500/40 font-semibold"
                    >
                      ✨ {theme}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* DEDICATED RATINGS SECTION: IMDb + Rotten Tomatoes + TMDB (ALL THREE MANDATORY) */}
          <div className="bg-black/50 p-5 rounded-2xl border border-white/10 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Star className="w-4 h-4 text-amber-400" />
              <span>RATINGS</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-1">
              {/* 1. IMDb Rating */}
              <div className="bg-zinc-900/90 p-3 rounded-xl border border-amber-500/40 shadow-md">
                <div className="text-[11px] text-amber-400 font-black tracking-wider uppercase">IMDb</div>
                <div className="text-lg font-black text-amber-300 flex items-baseline gap-1 mt-0.5">
                  <span>{currentTitle.imdbRating !== undefined ? currentTitle.imdbRating : '—'}</span>
                  {currentTitle.imdbRating !== undefined && (
                    <span className="text-[10px] text-zinc-500 font-normal">/ 10</span>
                  )}
                </div>
              </div>

              {/* 2. Rotten Tomatoes Rating */}
              <div className="bg-zinc-900/90 p-3 rounded-xl border border-red-500/40 shadow-md">
                <div className="text-[11px] text-red-400 font-bold uppercase">Rotten Tomatoes</div>
                <div className="text-lg font-black text-red-300 mt-0.5">
                  {currentTitle.rottenTomatoesRating !== undefined ? (
                    <span>🍅 {currentTitle.rottenTomatoesRating}%</span>
                  ) : (
                    <span>—</span>
                  )}
                </div>
              </div>

              {/* 3. TMDB Rating */}
              <div className="bg-zinc-900/90 p-3 rounded-xl border border-sky-500/40 shadow-md">
                <div className="text-[11px] text-sky-400 font-bold uppercase">TMDB Score</div>
                <div className="text-lg font-black text-sky-300 flex items-baseline gap-1 mt-0.5">
                  {currentTitle.rating !== undefined ? (
                    <>
                      <Star className="w-3.5 h-3.5 fill-sky-400 text-sky-400 self-center" />
                      <span>{currentTitle.rating}</span>
                      <span className="text-[10px] text-zinc-500 font-normal">/ 10</span>
                    </>
                  ) : (
                    <span>—</span>
                  )}
                </div>
              </div>

              {/* 4. User Enjoyment (from Watchmode) */}
              {currentTitle.watchmodeUserEnjoyment !== undefined && (
                <div className="bg-zinc-900/90 p-3 rounded-xl border border-emerald-500/30 shadow-md">
                  <div className="text-[11px] text-emerald-400 font-bold">User Enjoyment</div>
                  <div className="text-lg font-black text-emerald-300 mt-0.5">
                    {currentTitle.watchmodeUserEnjoyment}%
                  </div>
                </div>
              )}

              {/* 5. Critic Score (from Watchmode) */}
              {currentTitle.watchmodeCriticScore !== undefined && (
                <div className="bg-zinc-900/90 p-3 rounded-xl border border-purple-500/30 shadow-md">
                  <div className="text-[11px] text-purple-400 font-bold">Critic Score</div>
                  <div className="text-lg font-black text-purple-300 mt-0.5">
                    {currentTitle.watchmodeCriticScore}%
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* LANGUAGE INFORMATION (COLLAPSED BY DEFAULT AS REQUIRED) */}
          <div className="bg-black/30 rounded-xl border border-white/5 overflow-hidden">
            <button
              type="button"
              onClick={() => setIsLanguagesExpanded(!isLanguagesExpanded)}
              className="w-full flex items-center justify-between p-3.5 text-xs font-bold text-zinc-300 hover:text-white transition-colors"
            >
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-amber-400" />
                <span>Languages</span>
                <span className="text-[11px] font-normal text-zinc-400">
                  {currentTitle.audioLanguages && currentTitle.audioLanguages.length > 0
                    ? `${currentTitle.audioLanguages.slice(0, 3).map((l) => l.toUpperCase()).join(' · ')}${
                        currentTitle.audioLanguages.length > 3 ? ` + ${currentTitle.audioLanguages.length - 3} more` : ''
                      }`
                    : 'English · Hindi available'}
                </span>
              </div>
              <div className="flex items-center gap-1 text-zinc-400 text-[11px]">
                <span>{isLanguagesExpanded ? 'Hide' : 'Show details'}</span>
                {isLanguagesExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            {isLanguagesExpanded && (
              <div className="p-4 pt-1 border-t border-white/5 space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <span className="text-zinc-500 font-medium block mb-1.5">Audio Languages:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {currentTitle.audioLanguages && currentTitle.audioLanguages.length > 0 ? (
                        currentTitle.audioLanguages.map((lang) => (
                          <span
                            key={lang}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase ${
                              lang === 'hi'
                                ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                                : 'bg-zinc-800 text-zinc-300 border border-zinc-700/50'
                            }`}
                          >
                            {lang === 'hi' ? 'हिं (Hindi)' : lang}
                          </span>
                        ))
                      ) : (
                        <span className="text-zinc-500">Not specified</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-zinc-500 font-medium block mb-1.5">Subtitle Languages:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {currentTitle.subtitleLanguages && currentTitle.subtitleLanguages.length > 0 ? (
                        currentTitle.subtitleLanguages.map((sub) => (
                          <span
                            key={sub}
                            className="px-2.5 py-1 rounded-md text-[10px] bg-zinc-800 text-zinc-300 uppercase border border-zinc-700/50"
                          >
                            {sub}
                          </span>
                        ))
                      ) : (
                        <span className="text-zinc-400">English, Hindi subtitles available on Netflix</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Country Provenance */}
                <div className="pt-2 border-t border-white/5 flex flex-wrap gap-4 text-[11px] text-zinc-400">
                  {currentTitle.watchmodeOriginCountry && (
                    <div>
                      <span className="text-zinc-500">Catalog Origin: </span>
                      <span className="text-zinc-200 font-semibold">{currentTitle.watchmodeOriginCountry}</span>
                    </div>
                  )}
                  {currentTitle.tmdbOriginCountry && currentTitle.tmdbOriginCountry !== currentTitle.watchmodeOriginCountry && (
                    <div>
                      <span className="text-zinc-500">TMDB Origin: </span>
                      <span className="text-zinc-200 font-semibold">{currentTitle.tmdbOriginCountry}</span>
                    </div>
                  )}
                  {currentTitle.productionCompanies && currentTitle.productionCompanies.length > 0 && (
                    <div>
                      <span className="text-zinc-500">Production: </span>
                      <span className="text-zinc-200">{currentTitle.productionCompanies.slice(0, 3).join(', ')}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Cast & Creators with Interactive Actor Click */}
          {(currentTitle.cast || currentTitle.director || currentTitle.creator) && (
            <div className="bg-black/20 p-4 rounded-xl border border-white/5 space-y-2.5 text-xs">
              {currentTitle.director && (
                <div>
                  <span className="text-zinc-500 font-medium">Director: </span>
                  <span className="text-zinc-200 font-semibold">{currentTitle.director}</span>
                </div>
              )}
              {currentTitle.creator && (
                <div>
                  <span className="text-zinc-500 font-medium">Creator: </span>
                  <span className="text-zinc-200 font-semibold">{currentTitle.creator}</span>
                </div>
              )}
              {currentTitle.cast && currentTitle.cast.length > 0 && (
                <div>
                  <span className="text-zinc-500 font-medium block mb-1.5">
                    Cast (click an actor to view their other movies/shows on Netflix India):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {currentTitle.cast.map((actor) => (
                      <button
                        key={actor}
                        type="button"
                        onClick={() => setSelectedCastMember(actor)}
                        className="px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-red-600/20 text-zinc-300 hover:text-red-300 border border-zinc-700/60 hover:border-red-500/40 text-[11px] font-medium transition-all"
                      >
                        {actor}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TV Series Seasons & Episodes Navigation */}
          {!isMovie && seasonsMap && sortedSeasonNumbers.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <span>Seasons & Episodes</span>
                </h3>

                {sortedSeasonNumbers.length > 1 && (
                  <select
                    value={selectedSeason}
                    onChange={(e) => setSelectedSeason(parseInt(e.target.value, 10))}
                    className="bg-zinc-800 border border-zinc-700 text-xs font-bold rounded-lg px-2.5 py-1 text-white focus:outline-none cursor-pointer"
                  >
                    {sortedSeasonNumbers.map((sNum) => (
                      <option key={sNum} value={sNum}>
                        Season {sNum} ({seasonsMap.get(sNum)?.length || 0} episodes)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[360px] overflow-y-auto pr-1">
                {(seasonsMap.get(selectedSeason) || []).map((ep) => {
                  const epWatchUrl = currentTitle.netflixId
                    ? `https://www.netflix.com/watch/${currentTitle.netflixId}`
                    : `https://www.netflix.com/search?q=${encodeURIComponent(displayTitle)}`;

                  return (
                    <div
                      key={ep.id || ep.episodeNumber}
                      className="group/ep bg-zinc-900/80 hover:bg-zinc-850 p-3 rounded-xl border border-white/5 flex gap-3 items-start"
                    >
                      <div className="relative w-28 aspect-video rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                        {ep.stillPath ? (
                          <CachedImage src={ep.stillPath} alt={ep.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-500 font-bold">
                            EP {ep.episodeNumber}
                          </div>
                        )}
                        <a
                          href={epWatchUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover/ep:opacity-100 transition-opacity flex items-center justify-center"
                        >
                          <Play className="w-4 h-4 fill-white text-white" />
                        </a>
                      </div>

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-white line-clamp-1">
                            {ep.episodeNumber}. {ep.name}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono shrink-0 ml-1">
                            {ep.runtimeMinutes ? `${ep.runtimeMinutes}m` : ''}
                          </span>
                        </div>
                        {ep.overview ? (
                          <p className="text-[11px] text-zinc-400 line-clamp-2 leading-tight">
                            {ep.overview}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section: "Movies & TV Shows Like This" (with Thumbnail, Match %, RT/IMDb/TMDB ratings, and Runtime) */}
          {localSimilarTitles.length > 0 && (
            <div className="pt-4 border-t border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#E50914]" />
                  <span>Movies & TV Shows Like This (Available on Netflix India)</span>
                </h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {localSimilarTitles.map(({ item: simItem, matchPercentage }) => {
                  const simIsMovie = simItem.mediaType === 'movie';
                  const simLangBadge = getPriorityLanguageBadge({
                    originalTitle: simItem.title,
                    externalTitle: simItem.title,
                    originalLanguage: simItem.originalLanguage,
                    languages: simItem.audioLanguages,
                  } as any);

                  const simTotalEpisodes = simItem.totalEpisodes || (simItem.totalSeasons ? simItem.totalSeasons * 8 : undefined);
                  const simAvgMin = simItem.averageEpisodeMinutes || 45;
                  const simSeriesMinutes = simTotalEpisodes ? simTotalEpisodes * simAvgMin : undefined;
                  const simDisplayRuntime = simIsMovie ? simItem.runtimeMinutes : simSeriesMinutes;

                  return (
                    <div
                      key={simItem.id}
                      onClick={() => handleSelectSimilarTitle(simItem)}
                      className="group cursor-pointer bg-zinc-900/90 hover:bg-zinc-850 rounded-xl overflow-hidden border border-white/5 hover:border-red-600/50 transition-all shadow-md hover:-translate-y-1 flex flex-col"
                    >
                      {/* Thumbnail with Match %, Ratings, and Language */}
                      <div className="relative aspect-[16/10] w-full bg-zinc-800 overflow-hidden">
                        <CachedImage
                          src={simItem.backdropPath || simItem.posterPath}
                          alt={simItem.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />

                        {/* Top-Left: Match Percentage Badge */}
                        <div className="absolute top-1.5 left-1.5 z-10 bg-emerald-950/90 border border-emerald-500/50 text-emerald-400 px-1.5 py-0.5 rounded text-[10px] font-black shadow-md">
                          {matchPercentage}% Match
                        </div>

                        {/* Top-Right: Ratings */}
                        <div className="absolute top-1.5 right-1.5 z-10 flex flex-col items-end gap-1">
                          {simItem.rottenTomatoesRating !== undefined && (
                            <div className="bg-black/85 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-black text-red-400 border border-red-500/30">
                              🍅 {simItem.rottenTomatoesRating}%
                            </div>
                          )}
                          {simItem.imdbRating ? (
                            <div className="bg-black/85 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-black text-amber-400 border border-amber-500/30">
                              IMDb {simItem.imdbRating}
                            </div>
                          ) : simItem.rating ? (
                            <div className="bg-black/85 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-bold text-sky-300 border border-sky-500/30 flex items-center gap-0.5">
                              <Star className="w-2.5 h-2.5 fill-sky-400 text-sky-400" />
                              <span>{simItem.rating}</span>
                            </div>
                          ) : null}
                        </div>

                        {/* Bottom-Left: Runtime/Hours badge */}
                        {simDisplayRuntime ? (
                          <div className="absolute bottom-1.5 left-1.5 z-10 bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold text-zinc-300 border border-white/10 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5 text-zinc-400" />
                            <span>{formatRuntime(simDisplayRuntime)}</span>
                          </div>
                        ) : null}

                        {/* Bottom-Right: Priority Language */}
                        {simLangBadge && (
                          <div
                            className={`absolute bottom-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded text-[9px] font-black border shadow-md ${simLangBadge.bgClass} ${simLangBadge.textClass}`}
                          >
                            {simLangBadge.badge}
                          </div>
                        )}
                      </div>

                      {/* Content Area */}
                      <div className="p-2.5 space-y-1.5 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <h4 className="text-xs font-bold text-white line-clamp-1 group-hover:text-[#E50914] transition-colors">
                              {simItem.title}
                            </h4>
                            <span
                              className={`text-[8px] px-1 py-0.5 rounded font-bold uppercase ${
                                simIsMovie
                                  ? 'bg-red-500/20 text-red-300'
                                  : 'bg-purple-500/20 text-purple-300'
                              }`}
                            >
                              {simIsMovie ? 'Movie' : 'Series'}
                            </span>
                          </div>

                          {/* Series details */}
                          {!simIsMovie && (
                            <div className="text-[10px] text-zinc-400 font-mono pt-0.5">
                              {simItem.totalSeasons ? `${simItem.totalSeasons}S` : ''}
                              {simItem.totalEpisodes ? ` · ${simItem.totalEpisodes} eps` : ''}
                              {simDisplayRuntime ? ` · ~${formatRuntime(simDisplayRuntime)}` : ''}
                            </div>
                          )}

                          {/* Mini Genre & Theme Capsules */}
                          <div className="flex flex-wrap gap-1 pt-1 items-center">
                            {simItem.themes && simItem.themes.length > 0 && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-950/70 text-purple-300 border border-purple-500/40 font-semibold truncate max-w-[110px]">
                                ✨ {simItem.themes[0]}
                              </span>
                            )}
                            {simItem.genres &&
                              simItem.genres.slice(0, 1).map((g) => (
                                <span
                                  key={g}
                                  className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700/50 font-medium truncate max-w-[90px]"
                                >
                                  {g}
                                </span>
                              ))}
                          </div>
                        </div>

                        <div className="text-[10px] text-zinc-500 flex items-center justify-between pt-1 border-t border-white/5">
                          <span>{simItem.releaseYear || ''}</span>
                          <span>Click to explore ➔</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section: "TMDB Recommendations" (Filtered strictly against local Netflix catalog) */}
          {tmdbRecommendationTitles.length > 0 && (
            <div className="pt-4 border-t border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                  <Tag className="w-4 h-4 text-blue-400" />
                  <span>TMDB Recommendations in Netflix India</span>
                </h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                {tmdbRecommendationTitles.map((recItem) => {
                  const recIsMovie = recItem.mediaType === 'movie';
                  const recDisplayRuntime = recIsMovie
                    ? recItem.runtimeMinutes
                    : (recItem.totalEpisodes || 1) * (recItem.averageEpisodeMinutes || 45);

                  return (
                    <div
                      key={recItem.id}
                      onClick={() => handleSelectSimilarTitle(recItem)}
                      className="group cursor-pointer bg-zinc-900 rounded-xl overflow-hidden border border-white/5 hover:border-blue-500/50 transition-all shadow-md hover:-translate-y-1 flex flex-col"
                    >
                      <div className="relative aspect-[2/3] w-full bg-zinc-800">
                        <CachedImage
                          src={recItem.posterPath}
                          alt={recItem.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        {recItem.imdbRating ? (
                          <div className="absolute top-1 right-1 bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-bold text-amber-400">
                            ⭐ {recItem.imdbRating}
                          </div>
                        ) : null}
                        {recDisplayRuntime ? (
                          <div className="absolute bottom-1 left-1 bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[8px] font-mono text-zinc-300">
                            {formatRuntime(recDisplayRuntime)}
                          </div>
                        ) : null}
                      </div>
                      <div className="p-1.5">
                        <h4 className="text-[11px] font-bold text-white line-clamp-1 group-hover:text-blue-400 transition-colors">
                          {recItem.title}
                        </h4>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cast Member Catalog Modal */}
      {selectedCastMember && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={() => setSelectedCastMember(null)}
        >
          <div
            className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-[#181818] border border-zinc-700 rounded-2xl p-5 sm:p-6 shadow-2xl text-white space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-red-500" />
                <h3 className="text-base sm:text-lg font-black text-white">
                  {selectedCastMember} in Netflix India
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCastMember(null)}
                className="p-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Found {castTitles.length} titles featuring <span className="text-white font-semibold">{selectedCastMember}</span> in your local Netflix India catalog:
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {castTitles.map((cTitle) => (
                <div
                  key={cTitle.id}
                  onClick={() => {
                    setSelectedCastMember(null);
                    handleSelectSimilarTitle(cTitle);
                  }}
                  className="group cursor-pointer bg-zinc-900 rounded-xl overflow-hidden border border-white/5 hover:border-red-600/50 transition-all p-2 flex flex-col gap-2 hover:-translate-y-1"
                >
                  <div className="relative aspect-[2/3] w-full bg-zinc-800 rounded-lg overflow-hidden">
                    <CachedImage
                      src={cTitle.posterPath}
                      alt={cTitle.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {cTitle.imdbRating && (
                      <div className="absolute top-1 right-1 bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-bold text-amber-400">
                        ⭐ {cTitle.imdbRating}
                      </div>
                    )}
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-white line-clamp-1 group-hover:text-red-400 transition-colors">
                      {cTitle.title}
                    </h5>
                    <div className="text-[10px] text-zinc-500 flex items-center justify-between">
                      <span>{cTitle.releaseYear || ''}</span>
                      <span className="capitalize">{cTitle.mediaType}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
