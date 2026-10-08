import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Search,
  Plus,
  X,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  AlertCircle,
  SlidersHorizontal,
} from 'lucide-react';
import { CustomPreference, DiscoveryTitle, RecommendationCandidate } from '../../types';
import { CANONICAL_THEMES } from '../../services/themeMapper';
import { RecommendationCard } from './RecommendationCard';

// Comprehensive baseline film and TV genres
const BASELINE_GENRES = [
  'Action',
  'Action & Adventure',
  'Adventure',
  'Animation',
  'Anime',
  'Biography',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'Film-Noir',
  'History',
  'Horror',
  'Indie',
  'International',
  'K-Drama',
  'Kids',
  'Music',
  'Musical',
  'Mystery',
  'Reality-TV',
  'Romance',
  'Sci-Fi',
  'Science Fiction',
  'Short',
  'Sport',
  'Stand-Up Comedy',
  'Supernatural',
  'Talk-Show',
  'Thriller',
  'True Crime',
  'TV Movie',
  'War',
  'War & Politics',
  'Western',
];

// Comprehensive baseline cinematic themes & narrative styles
const BASELINE_THEMES = [
  ...CANONICAL_THEMES,
  'Alternate Reality',
  'Amnesia',
  'Artificial Intelligence',
  'Assassins',
  'Battle Royale',
  'Betrayal',
  'Cat-and-Mouse Game',
  'Conspiracy',
  'Corruption',
  'Countdown / Ticking Clock',
  'Cyber / Hacker',
  'Cyberpunk',
  'Dark Secrets',
  'Death Game',
  'Deep Space / Cosmic',
  'Dystopian',
  'Espionage',
  'Existential Crisis',
  'Family Secrets',
  'Fast Paced',
  'Found Family',
  'Grief & Loss',
  'Hallucination / Paranoia',
  'Heist',
  'High IQ / Mind Game',
  'Isolation',
  'Legal Battle / Courtroom',
  'Locked Room Mystery',
  'Mafia / Mob',
  'Mastermind Scheme',
  'Mental Illness',
  'Mind-Bending',
  'Moral Dilemma',
  'Multiverse',
  'Neo-Noir',
  'Parallel Worlds',
  'Plot Twist',
  'Political Conspiracy',
  'Post-Apocalyptic',
  'Psychological',
  'Redemption',
  'Revenge',
  'Satirical',
  'Serial Killer',
  'Simulation',
  'Slow Burn',
  'Social Class Struggle',
  'Supernatural Mystery',
  'Survival',
  'Temporal Paradox',
  'Time Loop',
  'Time Travel',
  'True Crime',
  'Undercover',
  'Underdog',
  'Unpredictable',
  'Unreliable Narrator',
  'Vengeance',
  'Whodunit',
];

interface RecommendationEngineUIProps {
  selectedGenres: string[];
  onChangeGenres: (genres: string[]) => void;
  selectedThemes: string[];
  onChangeThemes: (themes: string[]) => void;
  customPreferences: CustomPreference[];
  onChangePreferences: (prefs: CustomPreference[]) => void;
  onFindRecommendations: () => void;
  onResetFilters: () => void;
  isSearching: boolean;
  results: RecommendationCandidate[];
  isFallback: boolean;
  fallbackMessage?: string;
  libraryItems: any[];
  onOpenDetail: (item: DiscoveryTitle) => void;
  onAddToLibrary: (item: DiscoveryTitle) => void;
  onStartWatching?: (item: DiscoveryTitle) => void;
  catalog?: DiscoveryTitle[];
}

export const RecommendationEngineUI: React.FC<RecommendationEngineUIProps> = ({
  selectedGenres,
  onChangeGenres,
  selectedThemes,
  onChangeThemes,
  customPreferences,
  onChangePreferences,
  onFindRecommendations,
  onResetFilters,
  isSearching,
  results,
  isFallback,
  fallbackMessage,
  libraryItems,
  onOpenDetail,
  onAddToLibrary,
  onStartWatching,
  catalog = [],
}) => {
  const [newPromptInput, setNewPromptInput] = useState('');
  const [genreSearch, setGenreSearch] = useState('');
  const [themeSearch, setThemeSearch] = useState('');

  // Extract every single unique genre from the catalog combined with baseline genres
  const allGenres = useMemo(() => {
    const set = new Set<string>(BASELINE_GENRES);
    if (catalog && catalog.length > 0) {
      for (const item of catalog) {
        if (Array.isArray(item.genres)) {
          for (const g of item.genres) {
            if (g && g.trim()) set.add(g.trim());
          }
        }
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [catalog]);

  // Extract every single unique theme from the catalog combined with baseline themes
  const allThemes = useMemo(() => {
    const set = new Set<string>(BASELINE_THEMES);
    if (catalog && catalog.length > 0) {
      for (const item of catalog) {
        if (Array.isArray(item.themes)) {
          for (const t of item.themes) {
            if (t && t.trim()) set.add(t.trim());
          }
        }
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [catalog]);

  const filteredGenres = useMemo(() => {
    if (!genreSearch.trim()) return allGenres;
    const term = genreSearch.toLowerCase();
    return allGenres.filter((g) => g.toLowerCase().includes(term));
  }, [allGenres, genreSearch]);

  const filteredThemes = useMemo(() => {
    if (!themeSearch.trim()) return allThemes;
    const term = themeSearch.toLowerCase();
    return allThemes.filter((t) => t.toLowerCase().includes(term));
  }, [allThemes, themeSearch]);

  // Toggle Genre
  const handleToggleGenre = (g: string) => {
    if (selectedGenres.includes(g)) {
      onChangeGenres(selectedGenres.filter((item) => item !== g));
    } else {
      onChangeGenres([...selectedGenres, g]);
    }
  };

  // Toggle Theme
  const handleToggleTheme = (t: string) => {
    if (selectedThemes.includes(t)) {
      onChangeThemes(selectedThemes.filter((item) => item !== t));
    } else {
      onChangeThemes([...selectedThemes, t]);
    }
  };


  // Add Custom Preference Chip
  const handleAddPrompt = (e: React.FormEvent) => {
    e.preventDefault();
    const text = newPromptInput.trim();
    if (!text) return;
    const newPref: CustomPreference = {
      id: 'pref_' + Date.now(),
      text,
      weight: 1.0,
    };
    onChangePreferences([...customPreferences, newPref]);
    setNewPromptInput('');
  };

  // Remove Preference Chip
  const handleRemovePrompt = (id: string) => {
    onChangePreferences(customPreferences.filter((p) => p.id !== id));
  };

  // Reorder Preference Priority
  const handleMovePrompt = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= customPreferences.length) return;
    const updated = [...customPreferences];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    onChangePreferences(updated);
  };

  const isTitleInLibrary = (item: DiscoveryTitle) => {
    return libraryItems.some(
      (lib) =>
        (item.netflixId && lib.videoId === item.netflixId) ||
        (item.tmdbId && lib.externalId === item.tmdbId) ||
        (item.imdbId && lib.imdbId === item.imdbId) ||
        lib.originalTitle.toLowerCase().trim() === item.title.toLowerCase().trim()
    );
  };

  return (
    <div className="mt-12 py-10 px-4 sm:px-8 lg:px-14 border-t border-white/10 bg-gradient-to-b from-black/40 via-zinc-950/60 to-black select-none">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 text-[#E50914] mb-1">
              <Sparkles className="w-5 h-5" />
              <span className="text-xs font-black uppercase tracking-wider">AI Discovery Matrix</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Recommendation Engine
            </h2>
            <p className="text-sm text-zinc-400 mt-1">
              Construct high-precision recommendation queries with multi-genre blending, canonical themes, and natural language AI prompts.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {(selectedGenres.length > 0 || selectedThemes.length > 0 || customPreferences.length > 0) && (
              <button
                onClick={onResetFilters}
                className="px-4 py-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold border border-white/10 transition-colors"
              >
                Clear Filters
              </button>
            )}

            <button
              onClick={onFindRecommendations}
              disabled={isSearching}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#E50914] hover:bg-red-700 text-white font-bold text-sm tracking-wide shadow-lg shadow-red-600/30 transition-all transform active:scale-95 disabled:opacity-50"
            >
              {isSearching ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Synthesizing...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Find Recommendations</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Filter Controls Grid */}
        <div className="space-y-6 bg-zinc-900/60 backdrop-blur-md p-6 rounded-2xl border border-white/5">
          {/* 1. Genres */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block">
                1. Select Genres ({selectedGenres.length} selected / {allGenres.length} available)
              </label>
              <div className="relative w-full sm:w-56">
                <input
                  type="text"
                  placeholder="Filter genres..."
                  value={genreSearch}
                  onChange={(e) => setGenreSearch(e.target.value)}
                  className="w-full bg-zinc-950/80 border border-zinc-700/60 rounded-lg px-3 py-1 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-red-500"
                />
                {genreSearch && (
                  <button
                    onClick={() => setGenreSearch('')}
                    className="absolute right-2 top-1 text-zinc-400 hover:text-white text-xs font-bold"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
              {filteredGenres.map((g) => {
                const active = selectedGenres.includes(g);
                return (
                  <button
                    key={g}
                    onClick={() => handleToggleGenre(g)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-all border ${
                      active
                        ? 'bg-[#E50914] text-white border-red-500 shadow-md shadow-red-600/20'
                        : 'bg-zinc-800/80 text-zinc-300 border-white/5 hover:border-white/20 hover:text-white'
                    }`}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Themes */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block">
                2. Atmospheric Themes ({selectedThemes.length} selected / {allThemes.length} available)
              </label>
              <div className="relative w-full sm:w-56">
                <input
                  type="text"
                  placeholder="Filter themes..."
                  value={themeSearch}
                  onChange={(e) => setThemeSearch(e.target.value)}
                  className="w-full bg-zinc-950/80 border border-zinc-700/60 rounded-lg px-3 py-1 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                />
                {themeSearch && (
                  <button
                    onClick={() => setThemeSearch('')}
                    className="absolute right-2 top-1 text-zinc-400 hover:text-white text-xs font-bold"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-52 overflow-y-auto pr-1 scrollbar-thin">
              {filteredThemes.map((t) => {
                const active = selectedThemes.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => handleToggleTheme(t)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-all border ${
                      active
                        ? 'bg-amber-600 text-white border-amber-500 shadow-md shadow-amber-600/20'
                        : 'bg-zinc-800/80 text-zinc-300 border-white/5 hover:border-white/20 hover:text-white'
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>


          {/* 3. Custom AI Preference Prompts with Priority Order */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block">
                3. Custom Natural Language Preferences (Priority Weighted)
              </label>
              <span className="text-[11px] text-zinc-500 font-mono">
                Top prompts receive higher priority weights
              </span>
            </div>

            {/* Input Form */}
            <form onSubmit={handleAddPrompt} className="flex gap-2 mb-3">
              <input
                type="text"
                value={newPromptInput}
                onChange={(e) => setNewPromptInput(e.target.value)}
                placeholder='E.g. "Detective type shit", "Like Tenet but darker", "Smart characters", "Courtroom drama"'
                className="flex-1 bg-black/60 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#E50914] transition-colors"
              />
              <button
                type="submit"
                disabled={!newPromptInput.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/10 transition-colors disabled:opacity-40"
              >
                <Plus className="w-4 h-4" />
                <span>Add</span>
              </button>
            </form>

            {/* Custom Preference Chips List with Priority Order */}
            {customPreferences.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {customPreferences.map((pref, idx) => {
                  const priorityWeight = Math.max(0.3, 1.0 - idx * 0.18);
                  return (
                    <div
                      key={pref.id}
                      className="flex items-center gap-2 bg-gradient-to-r from-red-950/60 to-zinc-900 border border-red-500/30 px-3 py-1.5 rounded-xl text-xs text-white shadow-sm"
                    >
                      <span className="w-4 h-4 rounded-full bg-red-600/40 text-[10px] font-mono flex items-center justify-center font-bold text-red-300">
                        {idx + 1}
                      </span>
                      <span className="font-medium text-zinc-200">{pref.text}</span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        ({Math.round(priorityWeight * 100)}%)
                      </span>

                      {/* Reorder Up / Down */}
                      <div className="flex items-center gap-0.5 ml-1 border-l border-white/10 pl-1.5">
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={() => handleMovePrompt(idx, 'up')}
                            className="text-zinc-400 hover:text-white p-0.5"
                            title="Move Priority Up"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                        )}
                        {idx < customPreferences.length - 1 && (
                          <button
                            type="button"
                            onClick={() => handleMovePrompt(idx, 'down')}
                            className="text-zinc-400 hover:text-white p-0.5"
                            title="Move Priority Down"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemovePrompt(pref.id)}
                          className="text-zinc-400 hover:text-red-400 p-0.5 ml-1"
                          title="Remove Preference"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="text-xs text-zinc-500 font-mono">Try one-click quick prompts:</span>
                {[
                  'Detective type shit',
                  'Like Tenet but darker',
                  'High stakes heist',
                  'Mind bending sci fi',
                  'Gritty Indian crime',
                ].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => {
                      onChangePreferences([
                        ...customPreferences,
                        { id: 'pref_' + Date.now() + Math.random(), text: sample, weight: 1.0 },
                      ]);
                    }}
                    className="text-[11px] bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-zinc-200 px-2.5 py-1 rounded-full border border-white/5 transition-colors"
                  >
                    + {sample}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Results Section */}
        {results.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#E50914]" />
                <h3 className="text-xl font-extrabold text-white">Your AI Custom Picks</h3>
                <span className="text-xs text-zinc-400 font-mono">({results.length} titles matched)</span>
              </div>
            </div>

            {/* Fallback Notice if progressive relaxation occurred */}
            {isFallback && fallbackMessage && (
              <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs sm:text-sm text-amber-200 font-medium">
                    {fallbackMessage}
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Relaxed exact constraints to surface the closest thematic and conceptual titles available in Netflix India.
                  </p>
                </div>
              </div>
            )}

            {/* Candidate Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
              {results.map((candidate) => (
                <RecommendationCard
                  key={candidate.item.id || candidate.item.title}
                  candidate={candidate}
                  isInLibrary={isTitleInLibrary(candidate.item)}
                  onClick={() => onOpenDetail(candidate.item)}
                  onAddToLibrary={onAddToLibrary}
                  onStartWatching={onStartWatching}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
