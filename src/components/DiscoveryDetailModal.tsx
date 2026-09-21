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
  Clapperboard,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Search,
} from 'lucide-react';
import { AppSettings, DiscoveryTitle, EpisodeInfo, TrailerInfo, LibraryItem } from '../types';
import { formatRuntime } from '../services/analytics';
import { getNetflixUrl, getPriorityLanguageBadge, openNetflixInNewTab } from '../services/normalizer';
import { searchYouTubeTrailer, searchYouTubeReview, searchYouTubeByKeywords } from '../services/youtubeTrailer';
import { findLocalSimilarTitles } from '../services/discoverySimilarity';
import { CachedImage } from './CachedImage';
import { TagExploreModal } from './TagExploreModal';
import { YearExploreModal } from './YearExploreModal';
import { resolveNetflixIdForTitle } from '../services/discoveryService';
import { saveDiscoveryTitles } from '../services/db';

interface DiscoveryDetailModalProps {
  // Stack navigation support: current title and stack history
  titleStack: DiscoveryTitle[];
  catalog: DiscoveryTitle[];
  onClose: () => void;
  onPushTitle: (title: DiscoveryTitle) => void;
  onPopTitle: () => void;
  onAddToLibrary: (item: DiscoveryTitle) => void;
  onStartWatching: (item: DiscoveryTitle) => void;
  onGoToLibrary?: (item: DiscoveryTitle) => void;
  isInLibrary: (item: DiscoveryTitle) => boolean;
  settings: AppSettings;
  libraryItems?: LibraryItem[];
  ignoredTitleIds?: string[];
}

export const DiscoveryDetailModal: React.FC<DiscoveryDetailModalProps> = ({
  titleStack,
  catalog,
  onClose,
  onPushTitle,
  onPopTitle,
  onAddToLibrary,
  onStartWatching,
  onGoToLibrary,
  isInLibrary,
  settings,
  libraryItems,
  ignoredTitleIds,
}) => {
  const currentTitle = titleStack[titleStack.length - 1];
  if (!currentTitle) return null;

  const modalContainerRef = useRef<HTMLDivElement>(null);
  const isMovie = currentTitle.mediaType === 'movie';
  const displayTitle = currentTitle.title;

  const [resolvedNetflixId, setResolvedNetflixId] = useState<string | undefined>(currentTitle.netflixId);

  // On-demand background resolution of Netflix ID from Watchmode if missing
  useEffect(() => {
    setResolvedNetflixId(currentTitle.netflixId);
    let isMounted = true;
    if (!currentTitle.netflixId || !/^\d+$/.test(currentTitle.netflixId.trim())) {
      resolveNetflixIdForTitle(currentTitle, settings.watchmodeApiKey)
        .then(async (id) => {
          if (!isMounted || !id) return;
          setResolvedNetflixId(id);
          currentTitle.netflixId = id;
          await saveDiscoveryTitles([currentTitle]);
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [currentTitle.id, currentTitle.netflixId, settings.watchmodeApiKey]);

  const netflixUrl = getNetflixUrl({
    videoId: resolvedNetflixId || currentTitle.netflixId,
    netflixId: resolvedNetflixId || currentTitle.netflixId,
    originalTitle: currentTitle.title,
    externalTitle: currentTitle.title,
  });
  const originCountry =
    currentTitle.watchmodeOriginCountry ||
    currentTitle.tmdbOriginCountry ||
    (currentTitle.countries && currentTitle.countries.length > 0 ? currentTitle.countries[0] : undefined) ||
    (currentTitle.tmdbProductionCountries && currentTitle.tmdbProductionCountries.length > 0 ? currentTitle.tmdbProductionCountries[0] : undefined);
  const inLib = isInLibrary(currentTitle);
  const isWatching = useMemo(() => {
    if (!libraryItems || !currentTitle) return false;
    return libraryItems.some(
      (i) =>
        i.viewingStatus === 'still_watching' &&
        ((currentTitle.imdbId && i.imdbId === currentTitle.imdbId) ||
          (currentTitle.tmdbId && i.externalId === currentTitle.tmdbId) ||
          (currentTitle.netflixId && i.videoId === currentTitle.netflixId) ||
          (i.externalTitle || i.originalTitle || '').toLowerCase().trim() ===
            (currentTitle.title || '').toLowerCase().trim())
    );
  }, [libraryItems, currentTitle]);



  // Active video mode: 'trailer' or 'review'
  const [mediaMode, setMediaMode] = useState<'trailer' | 'review'>('trailer');
  const [trailerLang, setTrailerLang] = useState<'hi' | 'en'>('hi');
  const [activeTrailer, setActiveTrailer] = useState<TrailerInfo | null>(currentTitle.trailer || null);
  const [isSearchingTrailer, setIsSearchingTrailer] = useState(false);

  // Short 1-second notification banner (e.g. "Hindi trailer not found. Playing available trailer.")
  const [trailerAlert, setTrailerAlert] = useState<string | null>(null);
  const alertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerAlert = (message: string, durationMs = 1500) => {
    if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    setTrailerAlert(message);
    alertTimerRef.current = setTimeout(() => {
      setTrailerAlert(null);
    }, durationMs);
  };

  // Custom keyword search input state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [customKeywords, setCustomKeywords] = useState('');

  // Collapsible Languages State (collapsed by default as requested)
  const [isLanguagesExpanded, setIsLanguagesExpanded] = useState(false);

  // Actor / Cast modal state
  const [selectedCastMember, setSelectedCastMember] = useState<string | null>(null);
  // Director modal state
  const [selectedDirector, setSelectedDirector] = useState<string | null>(null);
  // Creator modal state
  const [selectedCreator, setSelectedCreator] = useState<string | null>(null);
  // Theme & Genre Tag Explore Modal state
  const [selectedTagModal, setSelectedTagModal] = useState<{ tag: string; type: 'genre' | 'theme' } | null>(null);
  // Year Explore Modal state
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  // Track wrong trailer & review keys for skipping
  const [wrongTrailerKeys, setWrongTrailerKeys] = useState<string[]>([]);
  const [wrongReviewKeys, setWrongReviewKeys] = useState<string[]>([]);

  // Function to pause active trailer playback when modals or exploration opens
  const pauseTrailer = () => {
    const iframe = document.getElementById('discovery-detail-trailer-iframe') as HTMLIFrameElement;
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
        '*'
      );
    }
  };

  // Immediate Hindi/English trailer search and refresh
  const handleSelectTrailerLanguage = (lang: 'hi' | 'en') => {
    setMediaMode('trailer');
    setTrailerLang(lang);
    setIsSearchingTrailer(true);
    setActiveTrailer(null);

    searchYouTubeTrailer(displayTitle, currentTitle.releaseYear, currentTitle.mediaType, lang, {
      skipCache: true,
      excludeVideoIds: wrongTrailerKeys,
    })
      .then((found) => {
        setIsSearchingTrailer(false);
        if (found) {
          setActiveTrailer(found);
          if (lang === 'hi' && found.isHindiFallback) {
            triggerAlert('Hindi trailer not found, playing available trailer');
          }
        } else {
          setActiveTrailer(currentTitle.trailer || null);
          if (lang === 'hi') {
            triggerAlert('Hindi trailer not found');
          }
        }
      })
      .catch(() => {
        setIsSearchingTrailer(false);
      });
  };

  // Fetch YouTube review: [title] + [year] + [movie/series] + review
  const handleFetchReview = (skipCurrent = false) => {
    setMediaMode('review');
    setIsSearchingTrailer(true);

    const currentKey = activeTrailer?.key;
    const updatedWrong = skipCurrent && currentKey ? [...wrongReviewKeys, currentKey] : wrongReviewKeys;
    if (skipCurrent && currentKey) {
      setWrongReviewKeys(updatedWrong);
    }
    setActiveTrailer(null);

    searchYouTubeReview(displayTitle, currentTitle.releaseYear, currentTitle.mediaType, {
      skipCache: true,
      excludeVideoIds: updatedWrong,
    })
      .then((found) => {
        setIsSearchingTrailer(false);
        if (found) {
          setActiveTrailer(found);
        } else {
          triggerAlert(`No review found for ${displayTitle}`);
        }
      })
      .catch(() => {
        setIsSearchingTrailer(false);
      });
  };

  // Wrong trailer or next review handler: skips current video and plays next related result
  const handleWrongTrailer = () => {
    if (mediaMode === 'review') {
      handleFetchReview(true);
      return;
    }

    const currentKey = activeTrailer?.key;
    const updatedWrong = currentKey ? [...wrongTrailerKeys, currentKey] : wrongTrailerKeys;
    if (currentKey) {
      setWrongTrailerKeys(updatedWrong);
    }

    setIsSearchingTrailer(true);
    setActiveTrailer(null);

    searchYouTubeTrailer(displayTitle, currentTitle.releaseYear, currentTitle.mediaType, trailerLang, {
      skipCache: true,
      excludeVideoIds: updatedWrong,
    })
      .then((found) => {
        setIsSearchingTrailer(false);
        if (found) {
          setActiveTrailer(found);
          if (trailerLang === 'hi' && found.isHindiFallback) {
            triggerAlert('Hindi trailer not found, playing available trailer');
          }
        } else {
          triggerAlert('No additional trailer found');
        }
      })
      .catch(() => {
        setIsSearchingTrailer(false);
      });
  };

  // Custom keyword search handler: searches exact user keywords and plays result directly in app iframe
  const handleCustomKeywordSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = customKeywords.trim();
    if (!query) return;

    setIsSearchingTrailer(true);
    setActiveTrailer(null);
    setIsSearchOpen(false);

    searchYouTubeByKeywords(query, {
      skipCache: true,
      excludeVideoIds: wrongTrailerKeys,
    })
      .then((found) => {
        setIsSearchingTrailer(false);
        if (found) {
          setActiveTrailer(found);
          triggerAlert(`Playing: ${found.name}`, 1500);
        } else {
          triggerAlert(`No video found for "${query}"`);
        }
      })
      .catch(() => {
        setIsSearchingTrailer(false);
      });
  };

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
          if (trailerLang === 'hi' && found.isHindiFallback) {
            triggerAlert('Hindi trailer not found, playing available trailer');
          }
        }
      })
      .catch(() => {
        if (isMounted) setIsSearchingTrailer(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentTitle.id, displayTitle, currentTitle.releaseYear, currentTitle.mediaType, trailerLang]);

  // Compute "Movies & TV Shows Like This" (Upgraded similarity scoring using themes, genres, ratings, excluding watched/dropped/watching/ignored)
  const localSimilarTitles = useMemo(() => {
    return findLocalSimilarTitles(currentTitle, catalog, {
      limit: 6,
      libraryItems,
      ignoredTitleIds,
    });
  }, [currentTitle, catalog, libraryItems, ignoredTitleIds]);

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

  // Compute other catalog titles for selected director
  const directorTitles = useMemo(() => {
    if (!selectedDirector) return [];
    const searchName = selectedDirector.toLowerCase().trim();
    return catalog.filter((t) =>
      t.director?.toLowerCase().includes(searchName)
    );
  }, [selectedDirector, catalog]);

  // Compute other catalog titles for selected creator
  const creatorTitles = useMemo(() => {
    if (!selectedCreator) return [];
    const searchName = selectedCreator.toLowerCase().trim();
    return catalog.filter((t) =>
      t.creator?.toLowerCase().includes(searchName) || t.director?.toLowerCase().includes(searchName)
    );
  }, [selectedCreator, catalog]);

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
              id="discovery-detail-trailer-iframe"
              src={`https://www.youtube-nocookie.com/embed/${activeTrailer.key}?autoplay=1&mute=0&controls=1&rel=0&modestbranding=1&enablejsapi=1&vq=hd1080&hd=1`}
              title={activeTrailer.name || `${displayTitle} Trailer`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              onLoad={() => {
                // Request 1080p max playback quality and 1.5x speed on YouTube player
                setTimeout(() => {
                  const iframe = document.getElementById('discovery-detail-trailer-iframe') as HTMLIFrameElement;
                  if (iframe && iframe.contentWindow) {
                    iframe.contentWindow.postMessage(
                      JSON.stringify({ event: 'command', func: 'setPlaybackQuality', args: ['hd1080'] }),
                      '*'
                    );
                    iframe.contentWindow.postMessage(
                      JSON.stringify({ event: 'command', func: 'setPlaybackQualityRange', args: ['hd1080'] }),
                      '*'
                    );
                    iframe.contentWindow.postMessage(
                      JSON.stringify({ event: 'command', func: 'setPlaybackRate', args: [1.5] }),
                      '*'
                    );
                  }
                }, 600);
              }}
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

          {/* 1-Second Alert notification banner (e.g. Hindi trailer not found) */}
          {trailerAlert && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-1.5 rounded-full bg-amber-500 text-black font-bold text-xs shadow-2xl flex items-center gap-2 border border-amber-300 animate-fade-in pointer-events-none whitespace-nowrap">
              <span>⚠️</span>
              <span>{trailerAlert}</span>
            </div>
          )}

          {/* Active video indicator */}
          {activeTrailer && (
            <div className="absolute bottom-3 left-4 z-20 pointer-events-none">
              <div className="px-2.5 py-1 rounded-md bg-black/80 backdrop-blur-md border border-white/10 text-[10px] font-semibold text-zinc-300 flex items-center gap-1.5 max-w-xs sm:max-w-md truncate">
                {mediaMode === 'review' ? (
                  <span className="text-purple-400 font-black">Review:</span>
                ) : activeTrailer.type === 'Custom' ? (
                  <span className="text-amber-400 font-black">Custom:</span>
                ) : (
                  <span className="text-emerald-400 font-black">
                    {activeTrailer.language === 'hi' ? 'Hindi Trailer:' : 'Trailer:'}
                  </span>
                )}
                <span className="truncate">{activeTrailer.name}</span>
              </div>
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

              {/* Trailer & Review Toggle Capsule */}
              <div className="flex items-center rounded-full bg-zinc-800/80 border border-zinc-700/60 p-0.5 text-[10px] sm:text-xs font-bold">
                <button
                  type="button"
                  onClick={() => handleSelectTrailerLanguage('hi')}
                  className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full transition-colors cursor-pointer ${
                    mediaMode === 'trailer' && trailerLang === 'hi'
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
                  onClick={() => handleSelectTrailerLanguage('en')}
                  className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full transition-colors cursor-pointer ${
                    mediaMode === 'trailer' && trailerLang === 'en'
                      ? 'bg-amber-500 text-black font-black'
                      : 'text-zinc-300 hover:text-white'
                  }`}
                  title="Switch to English Trailer"
                >
                  <Play className="w-2.5 h-2.5 fill-current" />
                  <span>Trailer: EN</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleFetchReview(false)}
                  className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full transition-colors cursor-pointer ${
                    mediaMode === 'review'
                      ? 'bg-purple-600 text-white font-black'
                      : 'text-zinc-300 hover:text-white'
                  }`}
                  title="Watch YouTube Review"
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>Review</span>
                </button>
              </div>

              {/* Wrong trailer? / Next review button */}
              <button
                type="button"
                onClick={handleWrongTrailer}
                disabled={isSearchingTrailer}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700/60 text-[10px] sm:text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                title={
                  mediaMode === 'review'
                    ? 'Fetch another review of this subject'
                    : 'Trailer incorrect? Click to fetch an alternative trailer'
                }
              >
                <RotateCcw className={`w-3 h-3 ${isSearchingTrailer ? 'animate-spin' : ''}`} />
                <span>{mediaMode === 'review' ? 'Next review' : 'Wrong trailer?'}</span>
              </button>

              {/* Small search icon button to search exact keywords directly in app player */}
              {isSearchOpen ? (
                <form
                  onSubmit={handleCustomKeywordSubmit}
                  className="flex items-center gap-1 bg-zinc-900 border border-amber-500/50 rounded-full px-2.5 py-0.5 text-xs shadow-lg animate-fade-in"
                >
                  <Search className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <input
                    type="text"
                    value={customKeywords}
                    onChange={(e) => setCustomKeywords(e.target.value)}
                    placeholder="Type exact keywords & press Enter..."
                    className="bg-transparent border-0 text-[11px] text-white placeholder-zinc-500 focus:outline-none w-44 sm:w-56"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-black hover:bg-amber-400 cursor-pointer"
                  >
                    Search
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSearchOpen(false)}
                    className="text-zinc-400 hover:text-white px-1 text-xs cursor-pointer"
                    title="Close search"
                  >
                    ✕
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsSearchOpen(true);
                    setCustomKeywords(displayTitle);
                  }}
                  className="p-1.5 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700/60 transition-colors cursor-pointer"
                  title="Search exact video keywords"
                >
                  <Search className="w-3 h-3" />
                </button>
              )}

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
                onClick={async (e) => {
                  let targetUrl = netflixUrl;
                  const activeId = resolvedNetflixId || currentTitle.netflixId;
                  if (!activeId || !/^\d+$/.test(activeId.trim())) {
                    try {
                      const foundId = await resolveNetflixIdForTitle(currentTitle, settings.watchmodeApiKey);
                      if (foundId) {
                        setResolvedNetflixId(foundId);
                        currentTitle.netflixId = foundId;
                        targetUrl = getNetflixUrl({ videoId: foundId, netflixId: foundId });
                        saveDiscoveryTitles([currentTitle]).catch(() => {});
                      }
                    } catch {}
                  }
                  openNetflixInNewTab(targetUrl, e);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#E50914] hover:bg-red-700 text-white text-xs font-black shadow-lg shadow-red-600/30 transition-transform active:scale-95 whitespace-nowrap cursor-pointer no-underline"
                title="Watch on Netflix (opens in new tab)"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Watch on Netflix</span>
              </a>

              <button
                type="button"
                onClick={() => onStartWatching(currentTitle)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all whitespace-nowrap active:scale-95 cursor-pointer ${
                  isWatching
                    ? 'bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/30 font-bold'
                    : 'bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-black border-amber-500/30'
                }`}
                title={isWatching ? 'Currently on Watching List' : 'Add to Watching List'}
              >
                <Tv className="w-3.5 h-3.5" />
                <span>{isWatching ? '✓ Watching' : 'Watching'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (inLib) {
                    onGoToLibrary?.(currentTitle);
                  } else {
                    onAddToLibrary(currentTitle);
                  }
                }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${
                  inLib
                    ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-600/30 cursor-pointer active:scale-95'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-white border-white/10 active:scale-95'
                }`}
                title={inLib ? 'View in Movies & Series Library' : 'Add to Library'}
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

              {/* Compact Meta & Ratings Pill Row matching Screenshot 2 */}
              <div className="flex items-center gap-2 flex-wrap text-xs pt-1">
                {/* 1. Rotten Tomatoes Rating Pill */}
                {currentTitle.rottenTomatoesRating !== undefined && (
                  <div
                    className="px-3 py-1 rounded-full bg-red-950/70 border border-red-800/70 text-red-200 font-bold flex items-center gap-1.5 shadow-sm"
                    title="Rotten Tomatoes Score"
                  >
                    <span className="text-xs">🍅</span>
                    <span>{currentTitle.rottenTomatoesRating}%</span>
                    <span className="text-[11px] font-medium text-red-300/90">Rotten Tomatoes</span>
                  </div>
                )}

                {/* 2. IMDb Rating Pill */}
                {currentTitle.imdbRating !== undefined && (
                  <div
                    className="px-3 py-1 rounded-full bg-zinc-900/90 border border-amber-500/50 text-amber-200 font-bold flex items-center gap-1.5 shadow-sm"
                    title="IMDb Rating"
                  >
                    <span className="px-1 py-0.5 rounded bg-amber-400 text-black font-black text-[9px] tracking-tight leading-none">
                      IMDb
                    </span>
                    <span>{currentTitle.imdbRating}</span>
                    <span className="text-[10px] font-normal text-zinc-400">/10</span>
                  </div>
                )}

                {/* 3. TMDB Rating Pill (if available and compact) */}
                {currentTitle.rating !== undefined && (
                  <div
                    className="px-2.5 py-1 rounded-full bg-zinc-900/90 border border-sky-500/40 text-sky-200 font-bold flex items-center gap-1.5 shadow-sm"
                    title="TMDB Rating"
                  >
                    <Star className="w-3 h-3 fill-sky-400 text-sky-400" />
                    <span>{currentTitle.rating}</span>
                    <span className="text-[10px] font-normal text-zinc-400">/10</span>
                  </div>
                )}

                {/* 4. Release Year Pill (Clickable to explore titles from this year) */}
                {currentTitle.releaseYear && (
                  <button
                    type="button"
                    onClick={() => {
                      pauseTrailer();
                      setSelectedYear(currentTitle.releaseYear || null);
                    }}
                    className="px-3 py-1 rounded-full bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-zinc-700/60 hover:border-zinc-500 flex items-center gap-1.5 font-semibold shadow-sm transition-all hover:scale-105 cursor-pointer"
                    title={`Click to explore all movies & series released in ${currentTitle.releaseYear}`}
                  >
                    <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                    <span>{currentTitle.releaseYear}</span>
                  </button>
                )}

                {/* 5. Runtime Pill */}
                {displayRuntimeMinutes ? (
                  <div className="px-3 py-1 rounded-full bg-zinc-800/90 text-zinc-200 border border-zinc-700/60 flex items-center gap-1.5 font-mono font-semibold shadow-sm">
                    <Clock className="w-3.5 h-3.5 text-zinc-400" />
                    <span>{formatRuntime(displayRuntimeMinutes)}</span>
                  </div>
                ) : null}

                {/* 6. TV Seasons Pill */}
                {!isMovie && currentTitle.totalSeasons && (
                  <div className="px-3 py-1 rounded-full bg-purple-950/60 text-purple-200 border border-purple-500/40 flex items-center gap-1.5 font-semibold shadow-sm">
                    <Layers className="w-3.5 h-3.5 text-purple-400" />
                    <span>
                      {currentTitle.totalSeasons} {currentTitle.totalSeasons === 1 ? 'Season' : 'Seasons'}
                      {currentTitle.totalEpisodes ? ` (${currentTitle.totalEpisodes} eps)` : ''}
                    </span>
                  </div>
                )}

                {/* 7. Country of Origin Pill */}
                {originCountry && (
                  <div className="px-3 py-1 rounded-full bg-emerald-950/60 text-emerald-200 border border-emerald-500/40 flex items-center gap-1.5 font-semibold shadow-sm">
                    <Globe className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{originCountry}</span>
                  </div>
                )}
              </div>

              {/* Genres Pills (Clickable to explore similar titles) */}
              {currentTitle.genres && currentTitle.genres.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  {currentTitle.genres.map((genre) => (
                    <button
                      key={genre}
                      type="button"
                      onClick={() => {
                        pauseTrailer();
                        setSelectedTagModal({ tag: genre, type: 'genre' });
                      }}
                      className="px-2.5 py-0.5 rounded-full bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700/60 hover:border-zinc-500 text-xs font-medium cursor-pointer transition-all hover:scale-105 shadow-sm"
                      title={`Click to explore all titles with genre "${genre}"`}
                    >
                      {genre}
                    </button>
                  ))}
                </div>
              )}

              {/* Synopsis */}
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

              {/* Themes & Keywords Badges (Clickable to explore similar titles) */}
              {currentTitle.themes && currentTitle.themes.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span className="text-xs font-bold text-zinc-400 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    <span>Themes:</span>
                  </span>
                  {currentTitle.themes.map((theme) => (
                    <button
                      key={theme}
                      type="button"
                      onClick={() => {
                        pauseTrailer();
                        setSelectedTagModal({ tag: theme, type: 'theme' });
                      }}
                      className="text-[11px] px-2.5 py-0.5 rounded-full bg-purple-950/70 hover:bg-purple-900 text-purple-300 hover:text-purple-100 border border-purple-500/40 hover:border-purple-400 font-semibold cursor-pointer transition-all hover:scale-105 shadow-sm"
                      title={`Click to explore all titles with theme "${theme}"`}
                    >
                      ✨ {theme}
                    </button>
                  ))}
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
                  <span className="text-zinc-500 font-medium block mb-1.5">
                    Director (click to view their movies & series on Netflix India):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {currentTitle.director.split(/,\s*|\s*;\s*|\s*\/\s*/).map((dir) => dir.trim()).filter(Boolean).map((dir) => (
                      <button
                        key={dir}
                        type="button"
                        onClick={() => {
                          pauseTrailer();
                          setSelectedDirector(dir);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 border border-amber-500/30 hover:border-amber-500/60 text-[11px] font-bold transition-all shadow-sm group cursor-pointer"
                      >
                        <Clapperboard className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
                        <span>{dir}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {currentTitle.creator && (
                <div>
                  <span className="text-zinc-500 font-medium block mb-1.5">
                    Creator (click to view their series & movies on Netflix India):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {currentTitle.creator.split(/,\s*|\s*;\s*|\s*\/\s*/).map((c) => c.trim()).filter(Boolean).map((creatorName) => (
                      <button
                        key={creatorName}
                        type="button"
                        onClick={() => {
                          pauseTrailer();
                          setSelectedCreator(creatorName);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 hover:text-purple-200 border border-purple-500/30 hover:border-purple-500/60 text-[11px] font-bold transition-all shadow-sm group cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-purple-400 group-hover:scale-110 transition-transform" />
                        <span>{creatorName}</span>
                      </button>
                    ))}
                  </div>
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
                        onClick={() => {
                          pauseTrailer();
                          setSelectedCastMember(actor);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-red-600/20 text-zinc-300 hover:text-red-300 border border-zinc-700/60 hover:border-red-500/40 text-[11px] font-medium transition-all cursor-pointer"
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
                  const activeEpId = resolvedNetflixId || currentTitle.netflixId;
                  const epWatchUrl = activeEpId
                    ? `https://www.netflix.com/watch/${activeEpId}`
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
                          onClick={(e) => openNetflixInNewTab(epWatchUrl, e)}
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover/ep:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                          title="Watch episode on Netflix (opens in new tab)"
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

      {/* Director Catalog Modal */}
      {selectedDirector && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={() => setSelectedDirector(null)}
        >
          <div
            className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-[#181818] border border-amber-500/30 rounded-2xl p-5 sm:p-6 shadow-2xl text-white space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Clapperboard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white">
                    {selectedDirector}
                  </h3>
                  <p className="text-[11px] text-amber-400/80 font-medium">Director's Work on Netflix India</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDirector(null)}
                className="p-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Found <span className="text-amber-400 font-bold">{directorTitles.length}</span> movies & series directed by <span className="text-white font-semibold">{selectedDirector}</span> on Netflix India:
            </p>

            {directorTitles.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-xs">
                No other titles found directed by {selectedDirector} in the current catalog.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {directorTitles.map((dTitle) => (
                  <div
                    key={dTitle.id}
                    onClick={() => {
                      setSelectedDirector(null);
                      handleSelectSimilarTitle(dTitle);
                    }}
                    className="group cursor-pointer bg-zinc-900 rounded-xl overflow-hidden border border-white/5 hover:border-amber-500/50 transition-all p-2 flex flex-col gap-2 hover:-translate-y-1"
                  >
                    <div className="relative aspect-[2/3] w-full bg-zinc-800 rounded-lg overflow-hidden">
                      <CachedImage
                        src={dTitle.posterPath}
                        alt={dTitle.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      {dTitle.imdbRating && (
                        <div className="absolute top-1 right-1 bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-bold text-amber-400">
                          ⭐ {dTitle.imdbRating}
                        </div>
                      )}
                      <div className="absolute top-1 left-1 bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-bold text-zinc-300 capitalize">
                        {dTitle.mediaType}
                      </div>
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-white line-clamp-1 group-hover:text-amber-400 transition-colors">
                        {dTitle.title}
                      </h5>
                      <div className="text-[10px] text-zinc-500 flex items-center justify-between">
                        <span>{dTitle.releaseYear || ''}</span>
                        <span>{dTitle.genres?.[0] || ''}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Creator Catalog Modal */}
      {selectedCreator && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={() => setSelectedCreator(null)}
        >
          <div
            className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-[#181818] border border-purple-500/30 rounded-2xl p-5 sm:p-6 shadow-2xl text-white space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white">
                    {selectedCreator}
                  </h3>
                  <p className="text-[11px] text-purple-400/80 font-medium">Creator's Work on Netflix India</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCreator(null)}
                className="p-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Found <span className="text-purple-400 font-bold">{creatorTitles.length}</span> movies & series created/directed by <span className="text-white font-semibold">{selectedCreator}</span> on Netflix India:
            </p>

            {creatorTitles.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-xs">
                No other titles found created by {selectedCreator} in the current catalog.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {creatorTitles.map((cTitle) => (
                  <div
                    key={cTitle.id}
                    onClick={() => {
                      setSelectedCreator(null);
                      handleSelectSimilarTitle(cTitle);
                    }}
                    className="group cursor-pointer bg-zinc-900 rounded-xl overflow-hidden border border-white/5 hover:border-purple-500/50 transition-all p-2 flex flex-col gap-2 hover:-translate-y-1"
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
                      <div className="absolute top-1 left-1 bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-bold text-zinc-300 capitalize">
                        {cTitle.mediaType}
                      </div>
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-white line-clamp-1 group-hover:text-purple-400 transition-colors">
                        {cTitle.title}
                      </h5>
                      <div className="text-[10px] text-zinc-500 flex items-center justify-between">
                        <span>{cTitle.releaseYear || ''}</span>
                        <span>{cTitle.genres?.[0] || ''}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Theme & Genre Tag Explore Modal with Exclusions & Type Filter */}
      {selectedTagModal && (
        <TagExploreModal
          isOpen={!!selectedTagModal}
          onClose={() => setSelectedTagModal(null)}
          tag={selectedTagModal.tag}
          tagType={selectedTagModal.type}
          catalog={catalog}
          onSelectTitle={(t) => {
            setSelectedTagModal(null);
            handleSelectSimilarTitle(t);
          }}
          onAddToLibrary={onAddToLibrary}
          onStartWatching={onStartWatching}
          isInLibrary={isInLibrary}
        />
      )}

      {/* Year Explore Modal */}
      {selectedYear && (
        <YearExploreModal
          isOpen={!!selectedYear}
          onClose={() => setSelectedYear(null)}
          year={selectedYear}
          catalog={catalog}
          onSelectTitle={(t) => {
            setSelectedYear(null);
            handleSelectSimilarTitle(t);
          }}
          onAddToLibrary={onAddToLibrary}
          onStartWatching={onStartWatching}
          isInLibrary={isInLibrary}
        />
      )}
    </div>
  );
};
