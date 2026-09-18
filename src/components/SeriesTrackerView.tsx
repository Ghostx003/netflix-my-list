import React, { useState, useMemo } from 'react';
import { Search, CheckCircle2, Star, Clock, Calendar, Film, Tv, Plus, Trash2, Award, Play } from 'lucide-react';
import confetti from 'canvas-confetti';
import { AppSettings, LibraryItem } from '../types';
import { formatRuntime, calculateSeriesRuntime } from '../services/analytics';
import { searchTMDB, enrichLibraryItem } from '../services/tmdb';
import { getNetflixUrl } from '../services/normalizer';

interface SeriesTrackerViewProps {
  items: LibraryItem[];
  settings: AppSettings;
  onUpdateItem: (item: LibraryItem) => void;
  onAddNewItem: (item: LibraryItem) => void;
}

export const SeriesTrackerView: React.FC<SeriesTrackerViewProps> = ({
  items,
  settings,
  onUpdateItem,
  onAddNewItem,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchingExternal, setIsSearchingExternal] = useState(false);
  const [externalCandidates, setExternalCandidates] = useState<any[]>([]);

  // Completed items list
  const completedItems = useMemo(() => {
    return items
      .filter((i) => i.isCompleted)
      .sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime());
  }, [items]);

  // Handle Mark Done toggle
  const handleToggleDone = (item: LibraryItem) => {
    const isNowDone = !item.isCompleted;
    const now = new Date().toISOString();

    let timeInvested = item.timeInvestedMinutes;
    if (!timeInvested || timeInvested <= 0) {
      if (item.mediaType === 'movie') {
        timeInvested = item.runtimeMinutes || 110;
      } else {
        const breakdown = calculateSeriesRuntime(item, settings.maxEpisodesPerSeries, settings.capSeriesEpisodes);
        timeInvested = breakdown.includedRuntimeMinutes || (breakdown.totalEpisodes * 45);
      }
    }

    const updated: LibraryItem = {
      ...item,
      isCompleted: isNowDone,
      completedAt: isNowDone ? now : undefined,
      userStarRating: isNowDone ? (item.userStarRating || 5) : item.userStarRating,
      timeInvestedMinutes: timeInvested,
      updatedAt: now,
    };

    onUpdateItem(updated);

    if (isNowDone) {
      try {
        confetti({
          particleCount: 70,
          spread: 50,
          origin: { y: 0.6 },
        });
      } catch {}
    }
  };

  // Handle 5-star rating click
  const handleRate = (item: LibraryItem, rating: number) => {
    const updated: LibraryItem = {
      ...item,
      userStarRating: rating,
      updatedAt: new Date().toISOString(),
    };
    onUpdateItem(updated);
  };

  // Live search across local library
  const localSearchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return items.filter(
      (i) =>
        i.originalTitle.toLowerCase().includes(q) ||
        i.externalTitle?.toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  // Trigger online external search if not found in library
  const handleExternalSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearchingExternal(true);
    try {
      const candidates = await searchTMDB(searchQuery.trim(), settings.tmdbApiKey);
      setExternalCandidates(candidates);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearchingExternal(false);
    }
  };

  // Add new external title as completed directly
  const handleAddExternalAsDone = async (candidate: any) => {
    const rawTitle = candidate.title || candidate.name;
    const baseItem: LibraryItem = {
      id: 'item_' + Math.random().toString(36).slice(2, 9) + '_' + Date.now(),
      originalTitle: rawTitle,
      normalizedTitle: rawTitle.toLowerCase().trim(),
      mediaType: candidate.mediaType || 'tv',
      status: 'matched',
      externalId: candidate.id,
      externalTitle: rawTitle,
      posterPath: candidate.posterPath,
      backdropPath: candidate.backdropPath,
      rating: candidate.rating,
      imdbRating: candidate.imdbRating,
      rottenTomatoesRating: candidate.rottenTomatoesRating,
      synopsis: candidate.overview,
      releaseYear: candidate.releaseYear,
      isCompleted: true,
      completedAt: new Date().toISOString(),
      userStarRating: 5,
      timeInvestedMinutes: candidate.mediaType === 'movie' ? 120 : 360,
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const enriched = await enrichLibraryItem(
      baseItem,
      settings.tmdbApiKey,
      settings.maxEpisodesPerSeries,
      settings.capSeriesEpisodes
    );

    onAddNewItem(enriched);
    setSearchQuery('');
    setExternalCandidates([]);

    try {
      confetti({ particleCount: 80, spread: 60 });
    } catch {}
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 lg:px-8 space-y-8 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-neutral-900 via-[#1c1c1e] to-black border border-white/10 p-8 shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold uppercase mb-3">
            <Award className="w-3.5 h-3.5" />
            <span>Completed Watchlist & Series Tracker</span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            Series & Movie Tracker
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-1 max-w-xl">
            Search any series or movie, mark it as completed, record the exact date watched, time invested, and rate it with 5 stars.
          </p>
        </div>

        <div className="bg-black/40 px-6 py-4 rounded-2xl border border-white/10 text-center flex-shrink-0">
          <span className="text-xs text-gray-400 block uppercase font-bold tracking-wider">Completed Titles</span>
          <span className="text-3xl font-black text-emerald-400 font-mono">
            {completedItems.length}
          </span>
          <span className="text-[11px] text-gray-500 block">
            {items.length > 0 ? (Math.round((completedItems.length / items.length) * 100) + '% of library') : ''}
          </span>
        </div>
      </div>

      {/* Interactive Search Bar to Mark Done */}
      <div className="bg-[#1c1c1e] p-6 rounded-3xl border border-white/10 shadow-xl space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Search className="w-4 h-4 text-[#E50914]" />
          <span>Search Any Series or Movie to Mark Done</span>
        </h3>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in library or type a new series to add..."
              className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#E50914]"
            />
          </div>
          <button
            onClick={handleExternalSearch}
            disabled={isSearchingExternal || !searchQuery.trim()}
            className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-2xl text-xs transition-colors border border-white/10"
          >
            {isSearchingExternal ? 'Searching...' : 'Search Online'}
          </button>
        </div>

        {/* Local Library Search Hits */}
        {localSearchResults.length > 0 && (
          <div className="mt-4 border border-white/10 rounded-2xl bg-black/40 divide-y divide-white/5 max-h-[300px] overflow-y-auto">
            <div className="p-2.5 text-[11px] font-bold uppercase text-gray-400 bg-white/5">
              Found in your library ({localSearchResults.length}):
            </div>
            {localSearchResults.map((it) => (
              <div
                key={it.id}
                className="p-3.5 flex items-center justify-between gap-4 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {it.posterPath ? (
                    <img
                      src={it.posterPath}
                      alt={it.originalTitle}
                      className="w-10 h-14 object-cover rounded-md flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-14 bg-neutral-800 rounded-md flex items-center justify-center flex-shrink-0">
                      {it.mediaType === 'movie' ? <Film className="w-4 h-4 text-gray-500" /> : <Tv className="w-4 h-4 text-gray-500" />}
                    </div>
                  )}
                  <div className="truncate">
                    <h4 className="text-sm font-bold text-white truncate">
                      {it.externalTitle || it.originalTitle}
                    </h4>
                    <span className="text-[11px] text-gray-400 uppercase font-mono">
                      {it.mediaType} · {it.releaseYear || ''}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleToggleDone(it)}
                  className={'px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 flex-shrink-0 ' + (it.isCompleted ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 hover:bg-red-950 hover:text-red-300' : 'bg-[#E50914] hover:bg-red-700 text-white shadow-md')}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{it.isCompleted ? 'Completed ✓' : 'Mark as Done'}</span>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* External Search Candidates */}
        {externalCandidates.length > 0 && (
          <div className="mt-4 border border-white/10 rounded-2xl bg-black/40 divide-y divide-white/5 max-h-[300px] overflow-y-auto">
            <div className="p-2.5 text-[11px] font-bold uppercase text-gray-400 bg-white/5">
              Online TMDB / OMDB search results ({externalCandidates.length}):
            </div>
            {externalCandidates.map((c) => (
              <div
                key={c.id}
                className="p-3.5 flex items-center justify-between gap-4 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {c.posterPath ? (
                    <img
                      src={c.posterPath}
                      alt={c.title}
                      className="w-10 h-14 object-cover rounded-md flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-14 bg-neutral-800 rounded-md flex items-center justify-center flex-shrink-0">
                      <Tv className="w-4 h-4 text-gray-500" />
                    </div>
                  )}
                  <div className="truncate">
                    <h4 className="text-sm font-bold text-white truncate">{c.title}</h4>
                    <span className="text-[11px] text-gray-400 uppercase font-mono">
                      {c.mediaType} · {c.releaseYear || ''}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleAddExternalAsDone(c)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 flex-shrink-0 shadow-md"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add & Mark Done</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed Series / Movies List */}
      <div className="bg-[#1c1c1e] rounded-3xl border border-white/10 p-6 shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span>Completed Titles Log ({completedItems.length})</span>
          </h2>
          <span className="text-xs text-gray-400">
            Click stars to rate or toggle completion state
          </span>
        </div>

        {completedItems.length > 0 ? (
          <div className="divide-y divide-white/5 space-y-3">
            {completedItems.map((item) => {
              const compDate = item.completedAt ? new Date(item.completedAt) : new Date();
              const dateStr = compDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              });

              return (
                <div
                  key={item.id}
                  className="pt-3 pb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group hover:bg-white/[0.02] p-2 rounded-2xl transition-colors"
                >
                  {/* Left: Thumbnail & Title */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-14 h-20 rounded-xl overflow-hidden bg-neutral-900 flex-shrink-0 shadow-md border border-white/10">
                      {item.posterPath ? (
                        <img
                          src={item.posterPath}
                          alt={item.externalTitle || item.originalTitle}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-600">
                          {item.mediaType === 'movie' ? <Film className="w-5 h-5" /> : <Tv className="w-5 h-5" />}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-neutral-800 text-gray-300">
                          {item.mediaType}
                        </span>
                        {item.rottenTomatoesRating !== undefined && (
                          <span className="text-[10px] text-red-400 font-bold">
                            🍅 {item.rottenTomatoesRating}%
                          </span>
                        )}
                        {item.imdbRating && (
                          <span className="text-[10px] text-yellow-400 font-bold">
                            IMDb {item.imdbRating}
                          </span>
                        )}
                      </div>
                      <h4 className="text-base font-bold text-white truncate mt-1">
                        {item.externalTitle || item.originalTitle}
                      </h4>
                      <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">
                        {item.synopsis || 'No overview'}
                      </p>
                    </div>
                  </div>

                  {/* Right Side: Date of completion, Time invested, 5-Star Rating */}
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 sm:gap-6 self-end sm:self-auto flex-shrink-0">
                    {/* Date of completion */}
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500 block">
                        Date Completed
                      </span>
                      <div className="flex items-center gap-1 text-xs text-gray-300 font-medium mt-0.5">
                        <Calendar className="w-3 h-3 text-emerald-400" />
                        <span>{dateStr}</span>
                      </div>
                    </div>

                    {/* Time invested */}
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500 block">
                        Time Invested
                      </span>
                      <div className="flex items-center gap-1 text-xs text-white font-mono font-bold mt-0.5">
                        <Clock className="w-3 h-3 text-[#E50914]" />
                        <span>{formatRuntime(item.timeInvestedMinutes || item.runtimeMinutes || 110)}</span>
                      </div>
                    </div>

                    {/* 5-Star Rating */}
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500 block mb-1">
                        Your Rating
                      </span>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            onClick={() => handleRate(item, star)}
                            className="p-1 hover:scale-125 transition-transform"
                            title={'Rate ' + star + ' stars'}
                          >
                            <Star
                              className={'w-4 h-4 ' + ((item.userStarRating || 0) >= star ? 'fill-yellow-400 text-yellow-400 drop-shadow' : 'text-gray-600 hover:text-yellow-400')}
                            />
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Official Netflix Watch Link */}
                    <a
                      href={getNetflixUrl(item)}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1.5 rounded-xl bg-[#E50914] hover:bg-red-700 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition-all hover:scale-105"
                      title="Watch on Netflix"
                    >
                      <Play className="w-3 h-3 fill-white" />
                      <span>Netflix</span>
                    </a>

                    {/* Unmark */}
                    <button
                      onClick={() => handleToggleDone(item)}
                      className="p-2 rounded-xl bg-white/5 hover:bg-red-950/60 hover:text-red-400 text-gray-400 border border-white/5 transition-colors"
                      title="Unmark as completed"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-16 text-center text-gray-500">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-gray-600" />
            <h3 className="text-base font-bold text-gray-300">No completed titles yet</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              Use the search bar above to mark your finished movies or series and rate them with 5 stars!
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
