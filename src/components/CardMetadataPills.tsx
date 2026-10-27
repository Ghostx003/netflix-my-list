import React from 'react';

export interface CardMetadata {
  primaryGenre?: string;
  secondaryGenres?: string[];
  audienceVibe?: string;
  storyPace?: string;
  moods?: string[];
  themes?: string[];
  genres?: string[];
  synopsis?: string;
  tagline?: string;
}

/**
 * Resolves narrative metadata dimensions with smart fallback inferences
 * so that 100% of titles render all core dimensions on cards.
 */
export function resolveCardMetadata(item: CardMetadata) {
  const allGenres = item.genres || [];
  const primaryGenre =
    item.primaryGenre ||
    allGenres[0] ||
    'Drama';

  const secondaryGenres =
    (item.secondaryGenres && item.secondaryGenres.length > 0)
      ? item.secondaryGenres
      : (allGenres.length > 1 ? allGenres.filter((g) => g.toLowerCase() !== primaryGenre.toLowerCase()) : []);

  // Smart Audience Vibe fallback
  let audienceVibe = item.audienceVibe;
  if (!audienceVibe) {
    const pLower = primaryGenre.toLowerCase();
    const synLower = (item.synopsis || '').toLowerCase();
    if (pLower.includes('sci-fi') || synLower.includes('mind') || synLower.includes('time loop')) {
      audienceVibe = 'Mind-Bending';
    } else if (pLower.includes('horror') || synLower.includes('ghost') || synLower.includes('curse')) {
      audienceVibe = 'Chilling & Suspenseful';
    } else if (pLower.includes('thriller') || pLower.includes('crime') || synLower.includes('murder')) {
      audienceVibe = 'Dark & Gritty';
    } else if (pLower.includes('action') || synLower.includes('fight') || synLower.includes('mission')) {
      audienceVibe = 'Adrenaline Rush';
    } else if (pLower.includes('comedy') || pLower.includes('family')) {
      audienceVibe = 'Feel-Good & Fun';
    } else if (pLower.includes('romance') || synLower.includes('love')) {
      audienceVibe = 'Heartwarming & Romantic';
    } else if (pLower.includes('documentary')) {
      audienceVibe = 'Eye-Opening & Informative';
    } else {
      audienceVibe = 'Binge-Worthy & Compelling';
    }
  }

  // Smart Story Pace fallback
  let storyPace = item.storyPace;
  if (!storyPace) {
    const pLower = primaryGenre.toLowerCase();
    if (pLower.includes('action') || pLower.includes('thriller')) {
      storyPace = 'Fast-Paced';
    } else if (pLower.includes('drama') || pLower.includes('documentary')) {
      storyPace = 'Slow-Burn';
    } else {
      storyPace = 'Moderate';
    }
  }

  // Moods fallback
  let moods = (item.moods && item.moods.length > 0) ? item.moods : [];
  if (moods.length === 0) {
    const pLower = primaryGenre.toLowerCase();
    if (pLower.includes('action')) moods = ['Thrilling', 'Energetic', 'Action-Packed'];
    else if (pLower.includes('thriller') || pLower.includes('crime')) moods = ['Tense', 'Suspenseful', 'Dark'];
    else if (pLower.includes('sci-fi')) moods = ['Thought-Provoking', 'Mysterious', 'Mind-Bending'];
    else if (pLower.includes('comedy')) moods = ['Humorous', 'Lighthearted', 'Witty'];
    else if (pLower.includes('romance')) moods = ['Romantic', 'Emotional', 'Heartfelt'];
    else if (pLower.includes('horror')) moods = ['Eerie', 'Ominous', 'Terrifying'];
    else moods = ['Captivating', 'Reflective', 'Compelling'];
  }

  // Themes fallback
  let themes = (item.themes && item.themes.length > 0) ? item.themes : [];
  if (themes.length === 0) {
    const pLower = primaryGenre.toLowerCase();
    if (pLower.includes('action') || pLower.includes('thriller')) themes = ['Survival', 'Justice vs Revenge', 'High Stakes'];
    else if (pLower.includes('sci-fi')) themes = ['Identity', 'Future Tech', 'Time & Destiny'];
    else if (pLower.includes('crime')) themes = ['Morality', 'Power & Greed', 'Corruption'];
    else if (pLower.includes('comedy') || pLower.includes('romance')) themes = ['Relationships', 'Self-Discovery', 'Love'];
    else themes = ['Human Condition', 'Destiny', 'Family Dynamics'];
  }

  const allGenresCombined = Array.from(new Set([primaryGenre, ...secondaryGenres, ...allGenres].filter(Boolean)));

  return {
    primaryGenre,
    secondaryGenres,
    allGenresCombined,
    audienceVibe,
    storyPace,
    moods,
    themes,
  };
}

/**
 * Creative Floating Overlay for OUTSIDE the card (on top of the poster image):
 * - Displays Audience Vibe in a frosted-glass bottom marquee ribbon
 * - Displays Story Pace speed ticker
 * - Displays Primary Genre ruby badge
 */
export const CardPosterOverlay: React.FC<{
  item: CardMetadata;
  onTagClick?: (tag: string, type: 'genre' | 'theme' | 'vibe' | 'mood' | 'pace', e: React.MouseEvent) => void;
}> = ({ item, onTagClick }) => {
  const resolved = resolveCardMetadata(item);

  return (
    <>
      {/* Top Floating Story Pace Ticker (Outside card / on poster top) */}
      {resolved.storyPace && (
        <div className="absolute top-10 left-1.5 sm:left-2 z-10 animate-fade-in pointer-events-auto">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTagClick?.(resolved.storyPace, 'pace', e);
            }}
            className="px-1.5 sm:px-2 py-0.5 rounded-md backdrop-blur-md bg-amber-950/85 hover:bg-amber-900 text-amber-300 hover:text-white border border-amber-500/50 shadow-md text-[9px] sm:text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all hover:scale-105 cursor-pointer ring-1 ring-amber-500/30"
            title={`Story Pace: ${resolved.storyPace} - Click to explore titles with similar pace`}
          >
            <span className="text-amber-400">⚡</span>
            <span>{resolved.storyPace}</span>
          </button>
        </div>
      )}

      {/* Bottom Floating Ticker Marquee Ribbon (Outside card / poster footer) */}
      <div className="absolute bottom-0 inset-x-0 z-10 px-2 sm:px-2.5 py-1 sm:py-1.5 bg-gradient-to-r from-purple-950/95 via-indigo-950/90 to-purple-950/95 backdrop-blur-md border-t border-purple-500/40 flex items-center justify-between gap-1 shadow-lg pointer-events-auto">
        {/* Audience Vibe Ticker */}
        {resolved.audienceVibe && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTagClick?.(resolved.audienceVibe, 'vibe', e);
            }}
            className="flex items-center gap-1 text-[9px] sm:text-[10px] font-black text-purple-200 hover:text-white truncate transition-colors cursor-pointer group/vibe"
            title={`Audience Vibe: ${resolved.audienceVibe} - Click to explore this vibe`}
          >
            <span className="text-purple-300 group-hover/vibe:scale-110 transition-transform">🎭</span>
            <span className="truncate max-w-[130px] sm:max-w-[150px]">{resolved.audienceVibe}</span>
          </button>
        )}

        {/* Primary Genre Ticker Badge */}
        {resolved.primaryGenre && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTagClick?.(resolved.primaryGenre, 'genre', e);
            }}
            className="text-[8px] sm:text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider bg-red-600/40 hover:bg-red-600 text-red-200 hover:text-white border border-red-500/50 shrink-0 transition-all hover:scale-105 cursor-pointer"
            title={`Primary Genre: ${resolved.primaryGenre} - Click to explore this genre`}
          >
            🎯 {resolved.primaryGenre}
          </button>
        )}
      </div>
    </>
  );
};

interface CardMetadataPillsProps {
  item: CardMetadata;
  onTagClick?: (tag: string, type: 'genre' | 'theme' | 'vibe' | 'mood' | 'pace', e: React.MouseEvent) => void;
  maxMoods?: number;
  maxThemes?: number;
  maxGenres?: number;
  maxSecondaryGenres?: number;
  className?: string;
  showVibeAndPaceInline?: boolean;
}

/**
 * Creative Rich Narrative Metadata Dimensions INSIDE the card body:
 * Mentions ALL moods, ALL themes, ALL genres, plus Audience Vibe and Story Pace.
 */
export const CardMetadataPills: React.FC<CardMetadataPillsProps> = ({
  item,
  onTagClick,
  maxMoods,
  maxThemes,
  maxGenres,
  className = '',
  showVibeAndPaceInline = false,
}) => {
  const resolved = resolveCardMetadata(item);

  const moodsToDisplay = maxMoods ? resolved.moods.slice(0, maxMoods) : resolved.moods;
  const themesToDisplay = maxThemes ? resolved.themes.slice(0, maxThemes) : resolved.themes;
  const genresToDisplay = maxGenres ? resolved.allGenresCombined.slice(0, maxGenres) : resolved.allGenresCombined;

  return (
    <div className={`flex flex-col gap-1.5 mt-2 ${className}`}>
      {/* Optional Inline Vibe & Story Pace (for modals or cards without poster overlay) */}
      {showVibeAndPaceInline && (
        <div className="flex flex-wrap items-center gap-1 pb-0.5">
          {resolved.audienceVibe && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTagClick?.(resolved.audienceVibe, 'vibe', e);
              }}
              className="text-[9px] sm:text-[10px] px-2 py-0.5 rounded-md font-bold bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 hover:text-white border border-indigo-500/40 flex items-center gap-1 shadow-sm transition-all hover:scale-105 cursor-pointer"
              title={`Audience Vibe: ${resolved.audienceVibe}`}
            >
              <span>🎭</span>
              <span>{resolved.audienceVibe}</span>
            </button>
          )}

          {resolved.storyPace && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTagClick?.(resolved.storyPace, 'pace', e);
              }}
              className="text-[9px] sm:text-[10px] px-2 py-0.5 rounded-md font-bold bg-amber-950/80 hover:bg-amber-900 text-amber-300 hover:text-white border border-amber-500/40 flex items-center gap-1 shadow-sm transition-all hover:scale-105 cursor-pointer"
              title={`Story Pace: ${resolved.storyPace}`}
            >
              <span>⚡</span>
              <span>{resolved.storyPace} Pace</span>
            </button>
          )}
        </div>
      )}

      {/* 1. ALL GENRES */}
      {genresToDisplay.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[9px] font-black text-rose-400 uppercase tracking-wider shrink-0 flex items-center gap-0.5">
            🎯 Genres:
          </span>
          {genresToDisplay.map((g, idx) => {
            const isPrimary = g.toLowerCase() === resolved.primaryGenre?.toLowerCase();
            return (
              <button
                key={`genre-${g}-${idx}`}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTagClick?.(g, 'genre', e);
                }}
                className={`text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-md transition-all hover:scale-105 cursor-pointer shadow-sm ${
                  isPrimary
                    ? 'font-black bg-red-950/90 hover:bg-red-900 text-red-200 border border-red-500/50'
                    : 'font-medium bg-zinc-850 hover:bg-zinc-750 text-zinc-300 hover:text-white border border-zinc-700/60'
                }`}
                title={`Explore genre: ${g}`}
              >
                {isPrimary ? `★ ${g}` : g}
              </button>
            );
          })}
        </div>
      )}

      {/* 2. ALL MOODS */}
      {moodsToDisplay.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[9px] font-black text-cyan-400 uppercase tracking-wider shrink-0 flex items-center gap-0.5">
            💭 Moods:
          </span>
          {moodsToDisplay.map((m) => (
            <button
              key={`mood-${m}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTagClick?.(m, 'mood', e);
              }}
              className="text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-md font-semibold bg-cyan-950/70 hover:bg-cyan-900 text-cyan-300 hover:text-white border border-cyan-500/30 transition-all hover:scale-105 cursor-pointer shadow-sm"
              title={`Explore mood: ${m}`}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {/* 3. ALL THEMES */}
      {themesToDisplay.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[9px] font-black text-purple-400 uppercase tracking-wider shrink-0 flex items-center gap-0.5">
            ✨ Themes:
          </span>
          {themesToDisplay.map((t) => (
            <button
              key={`theme-${t}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTagClick?.(t, 'theme', e);
              }}
              className="text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-md font-semibold bg-purple-950/70 hover:bg-purple-900 text-purple-300 hover:text-white border border-purple-500/30 transition-all hover:scale-105 cursor-pointer shadow-sm"
              title={`Explore theme: ${t}`}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
