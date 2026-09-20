import React, { useState, useMemo, useEffect } from 'react';
import { X, Star, Clock, Calendar, Film, Tv, Play, ExternalLink, Sparkles, Layers, Video, ChevronDown, ChevronUp, Volume2, Loader2, Clapperboard, User, Globe, ChevronLeft, Bookmark, Check } from 'lucide-react';
import { AppSettings, LibraryItem, EpisodeInfo, TrailerInfo, DiscoveryTitle } from '../types';
import { formatRuntime, calculateSeriesRuntime } from '../services/analytics';
import { getNetflixUrl, normalizeCountryName, getPriorityLanguageBadge, itemHasLanguage } from '../services/normalizer';
import { searchYouTubeTrailer } from '../services/youtubeTrailer';
import { getAllDiscoveryTitles, getAllLibraryItems, saveLibraryItems } from '../services/db';
import { convertDiscoveryTitleToLibraryItem } from '../services/discoveryService';
import { CachedImage } from './CachedImage';

interface MediaDetailModalProps {
  item: LibraryItem | null;
  onClose: () => void;
  settings: AppSettings;
  onChangeMatch?: (item: LibraryItem) => void;
  onUpdateItem?: (updatedItem: LibraryItem) => void;
  onSelectItem?: (item: LibraryItem) => void;
}

export const MediaDetailModal: React.FC<MediaDetailModalProps> = ({
  item: initialItem,
  onClose,
  settings,
  onChangeMatch,
  onUpdateItem,
  onSelectItem,
}) => {
  // Navigation stack to drill down into other titles and return back cleanly
  const [itemStack, setItemStack] = useState<LibraryItem[]>(initialItem ? [initialItem] : []);

  // Update stack when the parent changes initialItem
  useEffect(() => {
    if (initialItem) {
      setItemStack([initialItem]);
    } else {
      setItemStack([]);
    }
  }, [initialItem]);

  const currentItem = itemStack[itemStack.length - 1] || null;
  const canGoBack = itemStack.length > 1;

  const handlePopStack = () => {
    setItemStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  };

  const handlePushTitle = (title: DiscoveryTitle) => {
    // Convert DiscoveryTitle to LibraryItem format for full detail presentation
    const libItem = convertDiscoveryTitleToLibraryItem(title);
    setItemStack((prev) => [...prev, libItem]);
  };

  if (!currentItem) return null;
  const item = currentItem;

  const isMovie = item.mediaType === 'movie';
  const tvBreakdown = !isMovie ? calculateSeriesRuntime(item, settings.maxEpisodesPerSeries, settings.capSeriesEpisodes) : null;
  const displayTitle = item.externalTitle || item.originalTitle;
  const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(displayTitle + ' hindi official trailer')}`;
  const netflixUrl = getNetflixUrl(item);
  const langBadge = getPriorityLanguageBadge(item);

  const handleNetflixClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    window.open(netflixUrl, '_blank', 'noopener,noreferrer');
  };

  // Discovery catalog for director / cast / creator lookup
  const [discoveryCatalog, setDiscoveryCatalog] = useState<DiscoveryTitle[]>([]);
  const [selectedDirector, setSelectedDirector] = useState<string | null>(null);
  const [selectedCreator, setSelectedCreator] = useState<string | null>(null);
  const [selectedCastMember, setSelectedCastMember] = useState<string | null>(null);
  const [isLanguagesExpanded, setIsLanguagesExpanded] = useState(false);
  const [watchingAddedMap, setWatchingAddedMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let isMounted = true;
    getAllDiscoveryTitles().then((titles) => {
      if (isMounted && titles) {
        setDiscoveryCatalog(titles);
      }
    }).catch((err) => {
      console.warn('Failed to load discovery titles for modal', err);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Handler to add any DiscoveryTitle directly to 'Still Watching'
  const handleAddDiscoveryToWatching = async (dTitle: DiscoveryTitle, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const allLib = await getAllLibraryItems();
      const existing = allLib.find(
        (i) =>
          (dTitle.imdbId && i.imdbId === dTitle.imdbId) ||
          (dTitle.tmdbId && i.externalId === dTitle.tmdbId) ||
          (dTitle.netflixId && i.videoId === dTitle.netflixId) ||
          i.originalTitle.toLowerCase().trim() === dTitle.title.toLowerCase().trim()
      );

      if (existing) {
        const updated: LibraryItem = {
          ...existing,
          viewingStatus: 'still_watching',
          isCompleted: false,
          droppedReason: undefined,
          droppedAt: undefined,
          progress: existing.progress || { percentage: 10, watchedMinutes: 30 },
          updatedAt: new Date().toISOString(),
        };
        if (onUpdateItem) onUpdateItem(updated);
        const remapped = allLib.map((x) => (x.id === updated.id ? updated : x));
        await saveLibraryItems(remapped);
      } else {
        const converted = convertDiscoveryTitleToLibraryItem(dTitle);
        const newLibItem: LibraryItem = {
          ...converted,
          viewingStatus: 'still_watching',
          progress: { percentage: 10, watchedMinutes: 30 },
          updatedAt: new Date().toISOString(),
        };
        if (onUpdateItem) onUpdateItem(newLibItem);
        await saveLibraryItems([newLibItem, ...allLib]);
      }
      setWatchingAddedMap((prev) => ({ ...prev, [dTitle.id]: true }));
    } catch (err) {
      console.warn('Failed to add to watching:', err);
    }
  };

  // Compute other catalog titles for selected cast member
  const castTitles = useMemo(() => {
    if (!selectedCastMember) return [];
    const searchName = selectedCastMember.toLowerCase().trim();
    return discoveryCatalog.filter((t) =>
      t.cast?.some((actor) => actor.toLowerCase().includes(searchName))
    );
  }, [selectedCastMember, discoveryCatalog]);

  // Compute other catalog titles for selected director
  const directorTitles = useMemo(() => {
    if (!selectedDirector) return [];
    const searchName = selectedDirector.toLowerCase().trim();
    return discoveryCatalog.filter((t) =>
      t.director?.toLowerCase().includes(searchName)
    );
  }, [selectedDirector, discoveryCatalog]);

  // Compute other catalog titles for selected creator
  const creatorTitles = useMemo(() => {
    if (!selectedCreator) return [];
    const searchName = selectedCreator.toLowerCase().trim();
    return discoveryCatalog.filter((t) =>
      t.creator?.toLowerCase().includes(searchName) || t.director?.toLowerCase().includes(searchName)
    );
  }, [selectedCreator, discoveryCatalog]);

  // Active trailer state & language selection
  const [trailerLang, setTrailerLang] = useState<'hi' | 'en'>((item.trailer?.language === 'en' ? 'en' : 'hi'));
  const [activeTrailer, setActiveTrailer] = useState<TrailerInfo | null>(item.trailer || null);
  const [isSearchingTrailer, setIsSearchingTrailer] = useState(false);

  // Keep activeTrailer synced when current item changes
  useEffect(() => {
    setActiveTrailer(item.trailer || null);
    setTrailerLang(item.trailer?.language === 'en' ? 'en' : 'hi');
  }, [item.trailer, item.id]);

  // Automatic YouTube Hindi/English trailer lookup if missing or language toggled
  useEffect(() => {
    let isMounted = true;
    setIsSearchingTrailer(true);

    searchYouTubeTrailer(displayTitle, item.releaseYear, item.mediaType, trailerLang).then((foundTrailer) => {
      if (!isMounted) return;
      setIsSearchingTrailer(false);
      if (foundTrailer) {
        setActiveTrailer(foundTrailer);
        if (onUpdateItem) {
          onUpdateItem({
            ...item,
            trailer: foundTrailer,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }).catch(() => {
      if (isMounted) setIsSearchingTrailer(false);
    });

    return () => {
      isMounted = false;
    };
  }, [item.id, displayTitle, item.releaseYear, item.mediaType, trailerLang]);

  // Group TV episodes by season
  const seasonsMap = useMemo(() => {
    if (isMovie || !item.episodes || item.episodes.length === 0) return null;
    const map = new Map<number, EpisodeInfo[]>();
    for (const ep of item.episodes) {
      const sNum = ep.seasonNumber || 1;
      if (!map.has(sNum)) map.set(sNum, []);
      map.get(sNum)!.push(ep);
    }
    // Sort each season's episodes by episodeNumber
    for (const [sNum, eps] of map.entries()) {
      eps.sort((a, b) => a.episodeNumber - b.episodeNumber);
    }
    return map;
  }, [isMovie, item.episodes]);

  const sortedSeasonNumbers = useMemo(() => {
    if (!seasonsMap) return [];
    return Array.from(seasonsMap.keys()).sort((a, b) => a - b);
  }, [seasonsMap]);

  const [expandedSeason, setExpandedSeason] = useState<number>(() => {
    return sortedSeasonNumbers.length > 0 ? sortedSeasonNumbers[0] : 1;
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl text-white scrollbar-thin scrollbar-thumb-zinc-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Controls: Back button if nested stack, plus Close button */}
        <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
          {canGoBack ? (
            <button
              type="button"
              onClick={handlePopStack}
              className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/80 hover:bg-zinc-800 text-white transition-all border border-white/20 shadow-lg text-xs font-bold cursor-pointer backdrop-blur-md hover:scale-105"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Previous Title</span>
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={onClose}
            className="pointer-events-auto p-2 rounded-full bg-black/70 hover:bg-[#E50914] text-zinc-300 hover:text-white transition-colors border border-white/10 shadow-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hero Backdrop / Trailer Player */}
        <div className="relative aspect-video w-full max-h-[380px] bg-black overflow-hidden group">
          {activeTrailer ? (
            <div className="relative w-full h-full">
              <iframe
                id="media-detail-trailer-iframe"
                src={`https://www.youtube-nocookie.com/embed/${activeTrailer.key}?autoplay=1&mute=0&controls=1&rel=0&modestbranding=1&enablejsapi=1`}
                title={activeTrailer.name || `${displayTitle} Trailer`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                onLoad={() => {
                  // PostMessage to set 1.5x playback speed on YouTube player
                  setTimeout(() => {
                    const iframe = document.getElementById('media-detail-trailer-iframe') as HTMLIFrameElement;
                    if (iframe && iframe.contentWindow) {
                      iframe.contentWindow.postMessage(
                        JSON.stringify({ event: 'command', func: 'setPlaybackRate', args: [1.5] }),
                        '*'
                      );
                    }
                  }, 600);
                }}
                className="w-full h-full border-0"
              />
            </div>
          ) : item.backdropPath || item.posterPath ? (
            <div className="relative w-full h-full">
              <img
                src={item.backdropPath || item.posterPath}
                alt={displayTitle}
                className="w-full h-full object-cover brightness-75 group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/40 to-transparent" />
              <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between">
                {isSearchingTrailer ? (
                  <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-black/80 text-amber-300 font-bold text-xs border border-amber-500/30 backdrop-blur-md">
                    <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                    <span>Fetching Hindi / English trailer...</span>
                  </div>
                ) : (
                  <a
                    href={youtubeSearchUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#E50914] hover:bg-red-700 text-white font-bold text-xs shadow-lg transition-all transform hover:scale-105"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>Watch Trailer on YouTube</span>
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 to-black gap-3 p-6 text-center">
              {isMovie ? <Film className="w-16 h-16 text-zinc-700" /> : <Tv className="w-16 h-16 text-zinc-700" />}
              {isSearchingTrailer ? (
                <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Searching for Hindi / English trailer...</span>
                </div>
              ) : (
                <>
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
                </>
              )}
            </div>
          )}
        </div>

        {/* Content body */}
        <div className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
            {/* Poster thumbnail - visible on both mobile and desktop */}
            {item.posterPath && (
              <div className="flex-shrink-0 w-24 h-36 sm:w-36 sm:h-52 aspect-[2/3] rounded-xl overflow-hidden shadow-2xl border border-zinc-700/80 relative z-10 bg-zinc-800 mx-auto sm:mx-0">
                <img
                  src={item.posterPath}
                  alt={displayTitle}
                  className="w-full h-full object-cover object-center"
                />
              </div>
            )}

            {/* Details */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs uppercase font-black px-2.5 py-0.5 rounded bg-[#E50914] text-white">
                  {isMovie ? 'Movie' : 'TV Series'}
                </span>
                {langBadge && (
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded border shadow-sm flex items-center gap-1 ${langBadge.bgClass} ${langBadge.textClass}`}
                    title={`Available in ${langBadge.label}`}
                  >
                    <span>{langBadge.badge}</span>
                    <span className="text-[10px] opacity-90">({langBadge.label})</span>
                  </span>
                )}
                {/* Trailer Toggle Capsule (HI / EN) */}
                <div className="flex items-center rounded-full bg-zinc-800/80 border border-zinc-700/60 p-0.5 text-[10px] sm:text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setTrailerLang('hi')}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full transition-colors cursor-pointer ${
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
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full transition-colors cursor-pointer ${
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
                <button
                  type="button"
                  onClick={handleNetflixClick}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#E50914] hover:bg-red-700 text-white text-xs font-black shadow-md transition-all transform hover:scale-105 sm:ml-auto w-full sm:w-auto justify-center cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Watch on Netflix</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>

              <h2 className="text-xl sm:text-3xl font-black mt-2 text-white tracking-tight">
                {displayTitle}
              </h2>

              {item.tagline && (
                <p className="text-xs sm:text-sm font-semibold text-zinc-300 italic mt-0.5">
                  "{item.tagline}"
                </p>
              )}

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
                  {Array.from(new Set((item.countries || []).map((c) => normalizeCountryName(c)))).map((c) => (
                    <span
                      key={c}
                      className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-blue-950/40 text-blue-300 border border-blue-800/40"
                    >
                      🌍 {c}
                    </span>
                  ))}
                </div>
              )}

              {/* LANGUAGE INFORMATION (COLLAPSIBLE DISCOVERY COMPATIBLE) */}
              <div className="mt-4 bg-zinc-950/90 rounded-xl border border-zinc-800 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsLanguagesExpanded(!isLanguagesExpanded)}
                  className="w-full flex items-center justify-between p-3.5 text-xs font-bold text-zinc-300 hover:text-white transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-amber-400" />
                    <span>Languages</span>
                    <span className="text-[11px] font-normal text-zinc-400">
                      {item.audioLanguages && item.audioLanguages.length > 0
                        ? `${item.audioLanguages.slice(0, 3).map((l) => l.toUpperCase()).join(' · ')}${
                            item.audioLanguages.length > 3 ? ` + ${item.audioLanguages.length - 3} more` : ''
                          }`
                        : item.languages && item.languages.length > 0
                        ? `${item.languages.slice(0, 3).join(' · ')}${item.languages.length > 3 ? ` + ${item.languages.length - 3} more` : ''}`
                        : 'English · Hindi available'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-zinc-400 text-[11px]">
                    <span>{isLanguagesExpanded ? 'Hide' : 'Show details'}</span>
                    {isLanguagesExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                {isLanguagesExpanded && (
                  <div className="p-4 pt-1 border-t border-zinc-800/80 space-y-3 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <span className="text-zinc-500 font-medium block mb-1.5">Audio Languages:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {(item.audioLanguages && item.audioLanguages.length > 0) ? (
                            item.audioLanguages.map((lang) => (
                              <span
                                key={lang}
                                className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase ${
                                  lang.toLowerCase() === 'hi' || lang.toLowerCase() === 'hindi'
                                    ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                                    : 'bg-zinc-800 text-zinc-300 border border-zinc-700/50'
                                }`}
                              >
                                {lang.toLowerCase() === 'hi' || lang.toLowerCase() === 'hindi' ? 'हिं (Hindi)' : lang}
                              </span>
                            ))
                          ) : item.languages && item.languages.length > 0 ? (
                            item.languages.map((lang) => (
                              <span
                                key={lang}
                                className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase ${
                                  lang.toLowerCase() === 'hi' || lang.toLowerCase() === 'hindi'
                                    ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                                    : 'bg-zinc-800 text-zinc-300 border border-zinc-700/50'
                                }`}
                              >
                                {lang.toLowerCase() === 'hi' || lang.toLowerCase() === 'hindi' ? 'हिं (Hindi)' : lang}
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
                          {item.subtitleLanguages && item.subtitleLanguages.length > 0 ? (
                            item.subtitleLanguages.map((sub) => (
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
                    <div className="pt-2 border-t border-zinc-800/80 flex flex-wrap gap-4 text-[11px] text-zinc-400">
                      {item.countries && item.countries.length > 0 && (
                        <div>
                          <span className="text-zinc-500">Origin: </span>
                          <span className="text-zinc-200 font-semibold">{item.countries.join(', ')}</span>
                        </div>
                      )}
                      {item.originalLanguage && (
                        <div>
                          <span className="text-zinc-500">Original Language: </span>
                          <span className="text-zinc-200 uppercase font-semibold">{item.originalLanguage}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Synopsis with 2-paragraph format */}
              <div className="mt-5 bg-black/30 p-4 rounded-xl border border-zinc-800 space-y-2">
                <h4 className="text-xs uppercase font-bold tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                  <span>Story & Premise</span>
                </h4>
                {(() => {
                  const raw = (item.synopsis || '').trim();
                  if (!raw) {
                    return (
                      <p className="text-sm text-zinc-300 leading-relaxed italic">
                        No detailed overview available for this title.
                      </p>
                    );
                  }
                  // Split existing paragraphs if available, or split sentences into 2 readable paragraphs
                  const existingParas = raw.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
                  if (existingParas.length >= 2) {
                    return (
                      <div className="space-y-2.5 text-sm text-zinc-300 leading-relaxed">
                        {existingParas.slice(0, 3).map((para, i) => (
                          <p key={i}>{para}</p>
                        ))}
                      </div>
                    );
                  }
                  // If single paragraph, split cleanly around middle sentence
                  const sentences = raw.match(/[^.!?]+[.!?]+(\s+|$)/g) || [raw];
                  if (sentences.length >= 3) {
                    const mid = Math.ceil(sentences.length / 2);
                    const p1 = sentences.slice(0, mid).join('').trim();
                    const p2 = sentences.slice(mid).join('').trim();
                    return (
                      <div className="space-y-2.5 text-sm text-zinc-300 leading-relaxed">
                        <p>{p1}</p>
                        <p>{p2}</p>
                      </div>
                    );
                  }
                    return (
                      <div className="space-y-2.5 text-sm text-zinc-300 leading-relaxed">
                        <p>{raw}</p>
                        <p className="text-xs text-zinc-400 italic">
                          Available to stream on Netflix. Matches genre categories: {(item.genres || []).join(', ') || 'Featured title'}.
                        </p>
                      </div>
                    );
                  })()}

                  {item.themes && item.themes.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-2">
                      <span className="text-xs font-bold text-zinc-400 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                        <span>Themes:</span>
                      </span>
                      {item.themes.map((theme) => (
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

              {/* Cast & Creators with Interactive Actor, Director & Creator Click */}
              {(item.cast || item.director || item.creator) && (
                <div className="mt-4 bg-black/20 p-4 rounded-xl border border-zinc-800/80 space-y-2.5 text-xs">
                  {item.director && (
                    <div>
                      <span className="text-zinc-500 font-medium block mb-1.5">
                        Director (click to view their movies &amp; series on Netflix India):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {item.director.split(/,\s*|\s*;\s*|\s*\/\s*/).map((d) => d.trim()).filter(Boolean).map((dir) => (
                          <button
                            key={dir}
                            type="button"
                            onClick={() => setSelectedDirector(dir)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 border border-amber-500/30 hover:border-amber-500/60 text-[11px] font-bold transition-all shadow-sm group cursor-pointer"
                          >
                            <Clapperboard className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
                            <span>{dir}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {item.creator && (
                    <div>
                      <span className="text-zinc-500 font-medium block mb-1.5">
                        Creator (click to view their series &amp; movies on Netflix India):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {item.creator.split(/,\s*|\s*;\s*|\s*\/\s*/).map((c) => c.trim()).filter(Boolean).map((cr) => (
                          <button
                            key={cr}
                            type="button"
                            onClick={() => setSelectedCreator(cr)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 hover:text-purple-200 border border-purple-500/30 hover:border-purple-500/60 text-[11px] font-bold transition-all shadow-sm group cursor-pointer"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-purple-400 group-hover:scale-110 transition-transform" />
                            <span>{cr}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {item.cast && item.cast.length > 0 && (
                    <div>
                      <span className="text-zinc-500 font-medium block mb-1.5">
                        Cast (click an actor to view their other movies/shows on Netflix India):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {item.cast.map((actor) => (
                          <button
                            key={actor}
                            type="button"
                            onClick={() => setSelectedCastMember(actor)}
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

              {/* Complete Season-by-Season Episode Guide */}
              {!isMovie && seasonsMap && sortedSeasonNumbers.length > 0 && (
                <div className="mt-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs uppercase font-bold tracking-wider text-zinc-300 flex items-center gap-1.5">
                      <Tv className="w-3.5 h-3.5 text-[#E50914]" />
                      <span>All Seasons & Episodes ({item.episodes?.length || 0} total)</span>
                    </h4>
                    <span className="text-[11px] text-zinc-400 font-mono">
                      {sortedSeasonNumbers.length} {sortedSeasonNumbers.length === 1 ? 'Season' : 'Seasons'}
                    </span>
                  </div>

                  {/* Season selector tabs / accordions */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                    {sortedSeasonNumbers.map((sNum) => {
                      const count = seasonsMap.get(sNum)?.length || 0;
                      const isActive = expandedSeason === sNum;
                      return (
                        <button
                          key={sNum}
                          type="button"
                          onClick={() => setExpandedSeason(sNum)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                            isActive
                              ? 'bg-[#E50914] text-white shadow-md'
                              : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                          }`}
                        >
                          <span>Season {sNum}</span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? 'bg-black/30 text-white' : 'bg-zinc-900 text-zinc-400'}`}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Episode cards for selected season */}
                  {seasonsMap.has(expandedSeason) && (
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-700">
                      {seasonsMap.get(expandedSeason)!.map((ep) => (
                        <div
                          key={ep.id || `${ep.seasonNumber}_${ep.episodeNumber}`}
                          className="bg-black/40 border border-zinc-800 hover:border-zinc-700 rounded-xl p-3 flex gap-3 transition-colors"
                        >
                          {ep.stillPath && (
                            <img
                              src={ep.stillPath}
                              alt=""
                              className="w-24 h-14 rounded-lg object-cover bg-zinc-800 shrink-0 border border-zinc-800"
                              loading="lazy"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h5 className="text-xs font-bold text-white truncate">
                                <span className="text-[#E50914] mr-1.5 font-mono">E{ep.episodeNumber}</span>
                                {ep.name || `Episode ${ep.episodeNumber}`}
                              </h5>
                              <span className="text-[10px] font-mono text-zinc-400 shrink-0 flex items-center gap-0.5">
                                <Clock className="w-2.5 h-2.5" />
                                {ep.runtimeMinutes}m
                              </span>
                            </div>
                            {ep.overview && (
                              <p className="text-[11px] text-zinc-400 line-clamp-2 mt-1 leading-normal">
                                {ep.overview}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Footer Links & Search Alternatives */}
              <div className="mt-5 pt-3 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-wrap">
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

      {/* Cast Member Other Titles Modal */}
      {selectedCastMember && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={() => setSelectedCastMember(null)}
        >
          <div
            className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-[#181818] border border-white/10 rounded-2xl p-5 sm:p-6 shadow-2xl text-white space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-red-500" />
                <h3 className="text-base sm:text-lg font-black text-white">
                  {selectedCastMember} on Netflix India
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCastMember(null)}
                className="p-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Found <span className="text-red-400 font-bold">{castTitles.length}</span> titles featuring <span className="text-white font-semibold">{selectedCastMember}</span> on Netflix India (click any title to view full details &amp; about):
            </p>

            {castTitles.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-xs">
                No other titles found featuring {selectedCastMember} in the current catalog.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {castTitles.map((cTitle) => {
                  const netflixWatchUrl = cTitle.netflixId
                    ? `https://www.netflix.com/watch/${cTitle.netflixId}`
                    : `https://www.netflix.com/search?q=${encodeURIComponent(cTitle.title)}`;
                  const isAdded = watchingAddedMap[cTitle.id];
                  return (
                    <div
                      key={cTitle.id}
                      onClick={() => {
                        setSelectedCastMember(null);
                        handlePushTitle(cTitle);
                      }}
                      className="group bg-zinc-900 rounded-xl overflow-hidden border border-white/5 hover:border-red-600/50 transition-all p-2 flex flex-col gap-2 cursor-pointer hover:-translate-y-1 shadow-md"
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
                      <div className="space-y-1 flex-1 flex flex-col justify-between">
                        <div>
                          <h5 className="text-xs font-bold text-white line-clamp-1 group-hover:text-red-400 transition-colors">
                            {cTitle.title}
                          </h5>
                          <div className="text-[10px] text-zinc-500 flex items-center justify-between mt-0.5">
                            <span>{cTitle.releaseYear || ''}</span>
                            <span className="capitalize">{cTitle.mediaType}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 mt-2 pt-1 border-t border-white/5">
                          <button
                            type="button"
                            onClick={(e) => handleAddDiscoveryToWatching(cTitle, e)}
                            className={`py-1 px-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                              isAdded
                                ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700'
                            }`}
                            title="Add to Still Watching list"
                          >
                            {isAdded ? <Check className="w-2.5 h-2.5" /> : <Bookmark className="w-2.5 h-2.5" />}
                            <span className="truncate">{isAdded ? 'Watching' : '+ Watch'}</span>
                          </button>

                          <a
                            href={netflixWatchUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="py-1 px-1 rounded bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white text-[10px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                          >
                            <Play className="w-2.5 h-2.5 fill-current" />
                            <span>Netflix</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
                className="p-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Found <span className="text-amber-400 font-bold">{directorTitles.length}</span> movies &amp; series directed by <span className="text-white font-semibold">{selectedDirector}</span> on Netflix India (click any title to view full details &amp; about):
            </p>

            {directorTitles.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-xs">
                No other titles found directed by {selectedDirector} in the current catalog.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {directorTitles.map((dTitle) => {
                  const netflixWatchUrl = dTitle.netflixId
                    ? `https://www.netflix.com/watch/${dTitle.netflixId}`
                    : `https://www.netflix.com/search?q=${encodeURIComponent(dTitle.title)}`;
                  const isAdded = watchingAddedMap[dTitle.id];
                  return (
                    <div
                      key={dTitle.id}
                      onClick={() => {
                        setSelectedDirector(null);
                        handlePushTitle(dTitle);
                      }}
                      className="group bg-zinc-900 rounded-xl overflow-hidden border border-white/5 hover:border-amber-500/50 transition-all p-2 flex flex-col gap-2 cursor-pointer hover:-translate-y-1 shadow-md"
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
                      <div className="space-y-1 flex-1 flex flex-col justify-between">
                        <div>
                          <h5 className="text-xs font-bold text-white line-clamp-1 group-hover:text-amber-400 transition-colors">
                            {dTitle.title}
                          </h5>
                          <div className="text-[10px] text-zinc-500 flex items-center justify-between mt-0.5">
                            <span>{dTitle.releaseYear || ''}</span>
                            <span>{dTitle.genres?.[0] || ''}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 mt-2 pt-1 border-t border-white/5">
                          <button
                            type="button"
                            onClick={(e) => handleAddDiscoveryToWatching(dTitle, e)}
                            className={`py-1 px-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                              isAdded
                                ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700'
                            }`}
                            title="Add to Still Watching list"
                          >
                            {isAdded ? <Check className="w-2.5 h-2.5" /> : <Bookmark className="w-2.5 h-2.5" />}
                            <span className="truncate">{isAdded ? 'Watching' : '+ Watch'}</span>
                          </button>

                          <a
                            href={netflixWatchUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="py-1 px-1 rounded bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-black text-[10px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                          >
                            <Play className="w-2.5 h-2.5 fill-current" />
                            <span>Netflix</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
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
                className="p-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Found <span className="text-purple-400 font-bold">{creatorTitles.length}</span> series &amp; movies created by <span className="text-white font-semibold">{selectedCreator}</span> on Netflix India (click any title to view full details &amp; about):
            </p>

            {creatorTitles.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-xs">
                No other titles found created by {selectedCreator} in the current catalog.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {creatorTitles.map((crTitle) => {
                  const netflixWatchUrl = crTitle.netflixId
                    ? `https://www.netflix.com/watch/${crTitle.netflixId}`
                    : `https://www.netflix.com/search?q=${encodeURIComponent(crTitle.title)}`;
                  const isAdded = watchingAddedMap[crTitle.id];
                  return (
                    <div
                      key={crTitle.id}
                      onClick={() => {
                        setSelectedCreator(null);
                        handlePushTitle(crTitle);
                      }}
                      className="group bg-zinc-900 rounded-xl overflow-hidden border border-white/5 hover:border-purple-500/50 transition-all p-2 flex flex-col gap-2 cursor-pointer hover:-translate-y-1 shadow-md"
                    >
                      <div className="relative aspect-[2/3] w-full bg-zinc-800 rounded-lg overflow-hidden">
                        <CachedImage
                          src={crTitle.posterPath}
                          alt={crTitle.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        {crTitle.imdbRating && (
                          <div className="absolute top-1 right-1 bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-bold text-amber-400">
                            ⭐ {crTitle.imdbRating}
                          </div>
                        )}
                        <div className="absolute top-1 left-1 bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-bold text-zinc-300 capitalize">
                          {crTitle.mediaType}
                        </div>
                      </div>
                      <div className="space-y-1 flex-1 flex flex-col justify-between">
                        <div>
                          <h5 className="text-xs font-bold text-white line-clamp-1 group-hover:text-purple-400 transition-colors">
                            {crTitle.title}
                          </h5>
                          <div className="text-[10px] text-zinc-500 flex items-center justify-between mt-0.5">
                            <span>{crTitle.releaseYear || ''}</span>
                            <span className="capitalize">{crTitle.mediaType}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 mt-2 pt-1 border-t border-white/5">
                          <button
                            type="button"
                            onClick={(e) => handleAddDiscoveryToWatching(crTitle, e)}
                            className={`py-1 px-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                              isAdded
                                ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700'
                            }`}
                            title="Add to Still Watching list"
                          >
                            {isAdded ? <Check className="w-2.5 h-2.5" /> : <Bookmark className="w-2.5 h-2.5" />}
                            <span className="truncate">{isAdded ? 'Watching' : '+ Watch'}</span>
                          </button>

                          <a
                            href={netflixWatchUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="py-1 px-1 rounded bg-purple-500/20 hover:bg-purple-500 text-purple-300 hover:text-white text-[10px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                          >
                            <Play className="w-2.5 h-2.5 fill-current" />
                            <span>Netflix</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
