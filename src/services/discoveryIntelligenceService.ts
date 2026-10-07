/**
 * Advanced Semantic Search, Natural Language Intent Parser & Re-ranking Engine.
 * Analyzes all movies and TV shows from the Discovery catalog and active library,
 * matching mood tags, canonical themes, genres, cast, directors, runtimes, and ratings.
 */

import { DiscoveryTitle, LibraryItem } from '../types';
import { extractThemesFromKeywords } from './themeMapper';

export interface SemanticQueryIntent {
  raw: string;
  count: number;
  mode: 'standard' | 'hidden_gem' | 'surprise_me';
  mediaType?: 'movie' | 'tv';
  maxRuntimeMinutes?: number;
  minImdb?: number;
  minYear?: number;
  maxYear?: number;
  targetCountryOrLang?: string;
  referenceTitles: string[];
  referenceProfile?: {
    genres: string[];
    themes: string[];
    keywords: string[];
    params: Record<string, number>;
    vibe: string;
  };
  targetConcepts: string[];
  hardExclusions: string[];
  moods: string[];
  genres: string[];
  themes: string[];
  keywords: string[];
  contentTokens: string[];
  residualText: string;
}

export interface ScoredTitleResult {
  item: DiscoveryTitle;
  score: number;
  semanticMatchScore: number;
  themeMatchScore: number;
  genreMatchScore: number;
  qualityScore: number;
  explanation: string;
  badges: string[];
}

/**
 * Common English query stopwords to ignore when extracting plot/synopsis search tokens.
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'about', 'like',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'from', 'up',
  'down', 'movie', 'movies', 'film', 'films', 'show', 'shows', 'series', 'tv', 'watch',
  'recommend', 'give', 'me', 'find', 'suggest', 'something', 'anything', 'i', 'want',
  'need', 'looking', 'some', 'any', 'good', 'best', 'top', 'new', 'old', 'please', 'can', 'you'
]);

/**
 * Synonym clusters for semantic plot concepts (e.g. strong female lead).
 */
export const CONCEPT_FEMALE_TOKENS = ['girl', 'girls', 'woman', 'women', 'female', 'daughter', 'sister', 'heroine', 'mother', 'lady', 'queen', 'actress', 'princess'];
export const CONCEPT_STRENGTH_TOKENS = ['strong', 'resilient', 'tough', 'brave', 'courageous', 'fierce', 'badass', 'powerful', 'warrior', 'fighter', 'determined', 'independent', 'empowered', 'fearless', 'heroic', 'rebel'];

/**
 * Curated benchmark profiles for landmark films commonly used in "like [Movie]" queries.
 */
export const BENCHMARK_REFERENCE_PROFILES: Record<string, {
  genres: string[];
  themes: string[];
  keywords: string[];
  params: Record<string, number>;
  vibe: string;
}> = {
  tenet: {
    genres: ['Action', 'Sci-Fi', 'Thriller'],
    themes: ['Time Travel / Multiverse', 'Espionage / Spy', 'Mind-Bending / Mind Game', 'Survival'],
    keywords: ['time', 'inversion', 'inverted', 'temporal', 'spy', 'conspiracy', 'quantum', 'algorithm', 'loop', 'future', 'espionage', 'timeline', 'world war'],
    params: {
      time_travel_multiverse: 0.98,
      intellectual_complexity: 0.95,
      sci_fi: 0.95,
      espionage_spy: 0.92,
      plot_twist_surprise: 0.90,
      action_spectacle: 0.90,
      tension_suspense: 0.90,
    },
    vibe: "Tenet's mind-bending time manipulation and high-stakes espionage",
  },
  interstellar: {
    genres: ['Sci-Fi', 'Drama', 'Adventure'],
    themes: ['Deep Space / Cosmic', 'Survival', 'Family Dynamics', 'Time Travel / Multiverse'],
    keywords: ['space', 'wormhole', 'black hole', 'astronaut', 'quantum', 'gravity', 'spacecraft', 'relativity', 'nasa', 'galaxy'],
    params: {
      deep_space_cosmic: 0.98,
      sci_fi: 0.95,
      intellectual_complexity: 0.92,
      emotional_intensity: 0.88,
      time_travel_multiverse: 0.82,
    },
    vibe: "Interstellar's grand cosmic scale and emotional heart",
  },
  inception: {
    genres: ['Action', 'Sci-Fi', 'Thriller'],
    themes: ['Mind-Bending / Mind Game', 'Heist / Con', 'Psychological'],
    keywords: ['dream', 'subconscious', 'heist', 'reality', 'mind game', 'architect', 'memory', 'simulation', 'incept'],
    params: {
      intellectual_complexity: 0.96,
      heist_con: 0.92,
      sci_fi: 0.90,
      plot_twist_surprise: 0.92,
      tension_suspense: 0.88,
    },
    vibe: "Inception's cerebral dream-heist architecture",
  },
  'gone girl': {
    genres: ['Thriller', 'Mystery', 'Drama'],
    themes: ['Dark Mystery', 'Psychological', 'Marriage'],
    keywords: ['disappearance', 'wife', 'manipulation', 'deception', 'investigation', 'media', 'sociopath', 'murder'],
    params: {
      plot_twist_surprise: 0.96,
      darkness_bleakness: 0.88,
      tension_suspense: 0.92,
      moral_ambiguity: 0.92,
    },
    vibe: "Gone Girl's dark psychological deceit and media manipulation",
  },
  dark: {
    genres: ['Sci-Fi', 'Mystery', 'Thriller', 'Drama'],
    themes: ['Time Travel / Multiverse', 'Dark Mystery', 'Family Dynamics'],
    keywords: ['time travel', 'cave', 'loop', 'generations', 'nuclear', 'paradox', 'missing child', 'timeline', 'cycle'],
    params: {
      time_travel_multiverse: 0.98,
      intellectual_complexity: 0.95,
      tension_suspense: 0.92,
      eeriness_creepy: 0.88,
    },
    vibe: "Dark's intricate multi-generational time-travel paradoxes",
  },
  'shutter island': {
    genres: ['Mystery', 'Thriller', 'Drama'],
    themes: ['Psychological', 'Dark Mystery', 'Unreliable Narrator'],
    keywords: ['asylum', 'marshal', 'island', 'hallucination', 'delusion', 'twist', 'patient', 'conspiracy'],
    params: {
      unreliable_narrator: 0.98,
      paranoia: 0.95,
      plot_twist_surprise: 0.95,
      psychological_horror: 0.88,
    },
    vibe: "Shutter Island's paranoid psychological unravelling",
  },
  'john wick': {
    genres: ['Action', 'Thriller', 'Crime'],
    themes: ['Revenge', 'Mob / Underworld', 'Survival'],
    keywords: ['assassin', 'underworld', 'gunfight', 'hitman', 'bounty', 'continental', 'martial arts', 'vengeance'],
    params: {
      revenge: 0.98,
      action_spectacle: 0.96,
      adrenaline_rush: 0.96,
      violence_gore: 0.88,
    },
    vibe: "John Wick's relentless kinetic action and underworld mythology",
  },
  parasite: {
    genres: ['Thriller', 'Drama', 'Comedy'],
    themes: ['Class Warfare / Inequality', 'Dark Mystery', 'Family Dynamics'],
    keywords: ['rich', 'poor', 'basement', 'social class', 'infiltration', 'tutor', 'inequality', 'con'],
    params: {
      class_warfare_inequality: 0.98,
      moral_ambiguity: 0.92,
      satire_parody: 0.88,
      plot_twist_surprise: 0.90,
    },
    vibe: "Parasite's razor-sharp social satire and gripping suspense",
  },
  'stranger things': {
    genres: ['Sci-Fi', 'Horror', 'Drama', 'Fantasy'],
    themes: ['Supernatural Powers', 'Coming of Age', 'Friendship / Camaraderie', 'Nostalgia'],
    keywords: ['upside down', 'telekinetic', 'monsters', 'kids', '80s', 'secret lab', 'portal', 'demogorgon'],
    params: {
      supernatural_powers: 0.96,
      nostalgia: 0.95,
      coming_of_age: 0.92,
      friendship_camaraderie: 0.90,
    },
    vibe: "Stranger Things' 80s nostalgia and supernatural mystery",
  },
};

/**
 * Mood & atmosphere semantic lexicon mapping abstract user terms
 * to genres, themes, and narrative atmosphere tokens.
 */
const MOOD_LEXICON: Record<string, { genres?: string[]; themes?: string[]; keywords: string[] }> = {
  heartwarming: {
    genres: ['Comedy', 'Drama', 'Romance', 'Family', 'Animation'],
    themes: ['Family Drama', 'Coming of Age', 'Romantic Tension', 'Underdog / Sports'],
    keywords: ['wholesome', 'warm', 'feel-good', 'uplifting', 'love', 'kindness', 'friendship', 'healing', 'heartwarming'],
  },
  'heart warming': {
    genres: ['Comedy', 'Drama', 'Romance', 'Family', 'Animation'],
    themes: ['Family Drama', 'Coming of Age', 'Romantic Tension', 'Underdog / Sports'],
    keywords: ['wholesome', 'warm', 'feel-good', 'uplifting', 'love', 'kindness', 'friendship', 'healing', 'heartwarming'],
  },
  'feel-good': {
    genres: ['Comedy', 'Romance', 'Drama', 'Animation'],
    themes: ['Coming of Age', 'Family Drama', 'Underdog / Sports'],
    keywords: ['feel-good', 'optimistic', 'happy', 'laugh', 'smile', 'joy', 'charming', 'fun'],
  },
  cozy: {
    genres: ['Comedy', 'Romance', 'Drama'],
    themes: ['Coming of Age', 'Family Drama'],
    keywords: ['cozy', 'comfort', 'gentle', 'peaceful', 'rainy night', 'warmth', 'small town'],
  },
  dark: {
    genres: ['Thriller', 'Crime', 'Mystery', 'Drama', 'Horror'],
    themes: ['Dark Mystery', 'Serial Killer', 'Psychological', 'Mob / Underworld', 'Revenge'],
    keywords: ['cynical', 'gloomy', 'gritty', 'bleak', 'sinister', 'morbid', 'disturbing', 'twisted', 'dark'],
  },
  'mind-bending': {
    genres: ['Sci-Fi', 'Mystery', 'Thriller', 'Drama'],
    themes: ['Mind-Bending / Mind Game', 'Time Travel / Multiverse', 'Psychological'],
    keywords: ['twist', 'parallel', 'simulation', 'reality', 'puzzle', 'philosophical', 'mind-bending', 'complex'],
  },
  disturbing: {
    genres: ['Thriller', 'Horror', 'Crime', 'Drama'],
    themes: ['Psychological', 'Serial Killer', 'Dark Mystery'],
    keywords: ['unsettling', 'creepy', 'chilling', 'obsessive', 'sociopath', 'psychopath', 'disturbing'],
  },
  tense: {
    genres: ['Thriller', 'Action', 'Crime'],
    themes: ['Survival', 'Heist / Con', 'Espionage / Spy'],
    keywords: ['edge of your seat', 'high stakes', 'breathless', 'urgency', 'suspense', 'ticking clock'],
  },
  underrated: {
    keywords: ['hidden gem', 'overlooked', 'underappreciated', 'sleeper hit', 'cult classic'],
  },
  romantic: {
    genres: ['Romance', 'Comedy', 'Drama'],
    themes: ['Romantic Tension', 'Family Drama'],
    keywords: ['love', 'passion', 'relationship', 'dating', 'chemistry', 'crush', 'lovers'],
  },
  emotional: {
    genres: ['Drama', 'Romance'],
    themes: ['Family Drama', 'Romantic Tension', 'Coming of Age'],
    keywords: ['tearjerker', 'crying', 'moving', 'touching', 'poignant', 'loss', 'grief', 'deeply emotional'],
  },
  funny: {
    genres: ['Comedy'],
    themes: ['Coming of Age'],
    keywords: ['hilarious', 'satire', 'laughter', 'witty', 'goofy', 'sarcastic', 'comedy'],
  },
  action: {
    genres: ['Action', 'Action & Adventure', 'Adventure', 'Thriller'],
    themes: ['Survival', 'Revenge', 'Espionage / Spy'],
    keywords: ['fight', 'combat', 'gunfight', 'explosive', 'martial arts', 'adrenaline', 'chase'],
  },
  scifi: {
    genres: ['Sci-Fi', 'Science Fiction'],
    themes: ['Space / Cosmic', 'Dystopian / Cyberpunk', 'Time Travel / Multiverse'],
    keywords: ['future', 'alien', 'technology', 'space', 'galaxy', 'scientific', 'universe', 'cyberpunk'],
  },
};

/**
 * Parses user input into a deep structured intent.
 */
export function analyzeQueryIntent(query: string, allTitles: DiscoveryTitle[]): SemanticQueryIntent {
  const text = query.trim();
  const lower = text.toLowerCase();

  const intent: SemanticQueryIntent = {
    raw: query,
    count: 10,
    mode: 'standard',
    referenceTitles: [],
    targetConcepts: [],
    hardExclusions: [],
    moods: [],
    genres: [],
    themes: [],
    keywords: [],
    contentTokens: [],
    residualText: text,
  };

  // 1. Detect Mode
  if (/\b(underrated|hidden\s*gems?|overlooked|underappreciated)\b/i.test(lower)) {
    intent.mode = 'hidden_gem';
  } else if (/\b(surprise\s*me|unexpected|wildcard|adventurous)\b/i.test(lower)) {
    intent.mode = 'surprise_me';
  }

  // 2. Extract Count (e.g. "give me 7", "find 10", "exactly 12", "top 5", "7 movies")
  const explicitCountMatch = lower.match(/\b(?:give\s*me|find(?:\s*me)?|top|show|recommend|exactly)\s*(\d+)\b/i) ||
                             lower.match(/\b(\d+)\s*(?:movies?|shows?|films?|titles?|thrillers?|comedies?|series)\b/i);
  if (explicitCountMatch && explicitCountMatch[1]) {
    const num = parseInt(explicitCountMatch[1], 10);
    if (num >= 1 && num <= 50) {
      intent.count = num;
    }
  }

  // 3. Media Type (Movies vs TV Shows)
  if (/\b(shows?|tv\s*series|series|seasons?|episodes?)\b/i.test(lower)) {
    intent.mediaType = 'tv';
  } else if (/\b(movies?|films?)\b/i.test(lower)) {
    intent.mediaType = 'movie';
  }

  // 4. Runtime Constraints (e.g. "under 2 hours", "90 minutes")
  const hourMatch = lower.match(/\b(?:under|less\s*than|max|within|around)\s*(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
  if (hourMatch) {
    intent.maxRuntimeMinutes = Math.round(parseFloat(hourMatch[1]) * 60);
  } else {
    const minMatch = lower.match(/\b(?:under|less\s*than|max|within|I\s*have)\s*(\d+)\s*(?:minutes?|mins?|m)\b/i);
    if (minMatch) {
      intent.maxRuntimeMinutes = parseInt(minMatch[1], 10);
    }
  }

  // 5. Rating Constraints
  const ratingMatch = lower.match(/\b(?:imdb|rating|rated)?\s*(?:above|over|>|at\s*least)\s*(\d+(?:\.\d+)?)\b/i);
  if (ratingMatch) {
    const r = parseFloat(ratingMatch[1]);
    if (r >= 1 && r <= 10) intent.minImdb = r;
  }

  // 6. Hard Exclusions (e.g. "not horror", "without comedy", "no gore")
  const exclMatches = lower.matchAll(/\b(?:not|without|no|except)\s+([a-zA-Z\s]+?)(?:$|\b(?:under|with|above|and|released)\b)/gi);
  for (const m of exclMatches) {
    const terms = m[1].split(/\s+(?:or|and)\s+|,/);
    for (const t of terms) {
      const clean = t.trim();
      if (clean && !['a', 'the', 'any', 'too'].includes(clean)) {
        intent.hardExclusions.push(clean);
      }
    }
  }

  // 7. Reference Movie Lookup (e.g. "like Tenet", "similar to Gone Girl", "movie like Interstellar")
  // Check known benchmark titles first
  for (const [benchKey, benchProfile] of Object.entries(BENCHMARK_REFERENCE_PROFILES)) {
    const pattern = new RegExp(`\\b(?:like|similar\\s*to|same\\s*as)?\\s*${benchKey}\\b`, 'i');
    if (pattern.test(lower) || lower.includes(benchKey)) {
      if (!intent.referenceTitles.includes(benchKey)) {
        intent.referenceTitles.push(benchKey);
        intent.referenceProfile = benchProfile;
        intent.genres.push(...benchProfile.genres);
        intent.themes.push(...benchProfile.themes);
        intent.keywords.push(...benchProfile.keywords);
      }
    }
  }

  // Also check against catalog titles
  for (const t of allTitles) {
    const tLower = t.title.toLowerCase();
    if (tLower.length >= 4) {
      const likePattern = new RegExp(`\\b(?:like|similar\\s*to)\\s+${tLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (likePattern.test(lower)) {
        if (!intent.referenceTitles.some(rt => rt.toLowerCase() === tLower)) {
          intent.referenceTitles.push(t.title);
        }
      }
    }
  }

  // 8. Extract Clean Content Tokens for Freeform Plot Synopsis Search
  const words = lower
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const contentTokens = words.filter(w => !STOP_WORDS.has(w) && w.length >= 2);
  intent.contentTokens = contentTokens;

  // 9. Semantic Concept Intent Detection
  // Concept A: Strong Female Lead / Strong Girl
  const hasFemaleToken = words.some(w => CONCEPT_FEMALE_TOKENS.includes(w));
  const hasStrengthToken = words.some(w => CONCEPT_STRENGTH_TOKENS.includes(w));
  if ((hasFemaleToken && hasStrengthToken) || /\b(?:strong\s*girl|strong\s*woman|female\s*lead|heroine|female\s*protagonist|badass\s*(?:girl|woman))\b/i.test(lower)) {
    intent.targetConcepts.push('strong_female_lead');
    intent.keywords.push('woman', 'female', 'girl', 'heroine', 'fighter', 'strong');
  }

  // Concept B: Time Travel / Time Loop / Multiverse
  if (/\b(?:time\s*travel|time\s*loop|time\s*paradox|multiverse|timeline|temporal)\b/i.test(lower)) {
    intent.targetConcepts.push('time_travel');
    intent.themes.push('Time Travel / Multiverse');
    intent.genres.push('Sci-Fi');
    intent.keywords.push('time', 'loop', 'temporal', 'future', 'past');
  }

  // Concept C: Heist / Con / Robbery
  if (/\b(?:heist|bank\s*robbery|robbery|thief|stealing|vault)\b/i.test(lower)) {
    intent.targetConcepts.push('heist');
    intent.themes.push('Heist / Con');
    intent.genres.push('Crime', 'Thriller');
  }

  // Concept D: Revenge / Vengeance
  if (/\b(?:revenge|vengeance|avenge|payback|retribution)\b/i.test(lower)) {
    intent.targetConcepts.push('revenge');
    intent.themes.push('Revenge');
  }

  // 10. Mood & Genre lexicon identification
  for (const [moodKey, moodDef] of Object.entries(MOOD_LEXICON)) {
    if (lower.includes(moodKey)) {
      intent.moods.push(moodKey);
      if (moodDef.genres) intent.genres.push(...moodDef.genres);
      if (moodDef.themes) intent.themes.push(...moodDef.themes);
      intent.keywords.push(...moodDef.keywords);
    }
  }

  // Direct Genre tokens
  const GENRE_TOKENS = ['action', 'adventure', 'animation', 'comedy', 'crime', 'documentary', 'drama', 'family', 'fantasy', 'history', 'horror', 'music', 'mystery', 'romance', 'sci-fi', 'thriller'];
  for (const g of GENRE_TOKENS) {
    if (lower.includes(g)) {
      const proper = g.charAt(0).toUpperCase() + g.slice(1);
      intent.genres.push(proper === 'Sci-fi' ? 'Sci-Fi' : proper);
    }
  }

  // 11. Country / Language Filter
  if (/\b(indian|hindi|bollywood|india)\b/i.test(lower)) {
    intent.targetCountryOrLang = 'India';
  } else if (/\b(korean|k-drama|korea)\b/i.test(lower)) {
    intent.targetCountryOrLang = 'Korea';
  } else if (/\b(japanese|anime|japan)\b/i.test(lower)) {
    intent.targetCountryOrLang = 'Japan';
  } else if (/\b(spanish|spain)\b/i.test(lower)) {
    intent.targetCountryOrLang = 'Spain';
  }

  // 12. Year filters
  const yearAfterMatch = lower.match(/\b(?:after|since|from)\s+(\d{4})\b/i);
  if (yearAfterMatch) {
    intent.minYear = parseInt(yearAfterMatch[1], 10);
  }
  const yearBeforeMatch = lower.match(/\b(?:before|prior\s*to)\s+(\d{4})\b/i);
  if (yearBeforeMatch) {
    intent.maxYear = parseInt(yearBeforeMatch[1], 10);
  }

  // Deduplicate
  intent.genres = Array.from(new Set(intent.genres));
  intent.themes = Array.from(new Set(intent.themes));
  intent.keywords = Array.from(new Set(intent.keywords));

  return intent;
}

/**
 * Deep semantic match scorer between user intent and a catalog item.
 */
function scoreItem(
  item: DiscoveryTitle,
  intent: SemanticQueryIntent,
  allTitles: DiscoveryTitle[],
  stochasticVariance = 0.12
): ScoredTitleResult | null {
  // Hard Constraint Checks
  if (intent.mediaType && item.mediaType !== intent.mediaType) {
    return null;
  }

  if (intent.maxRuntimeMinutes && item.runtimeMinutes && item.runtimeMinutes > intent.maxRuntimeMinutes) {
    return null;
  }

  if (intent.minImdb && (item.imdbRating || item.rating || 0) < intent.minImdb) {
    return null;
  }

  if (intent.minYear && item.releaseYear && item.releaseYear < intent.minYear) {
    return null;
  }

  if (intent.maxYear && item.releaseYear && item.releaseYear > intent.maxYear) {
    return null;
  }

  if (intent.targetCountryOrLang) {
    const target = intent.targetCountryOrLang.toLowerCase();
    const itemCountries = (item.countries || []).map((c) => c.toLowerCase());
    const itemOrigLang = (item.originalLanguage || '').toLowerCase();
    const isTargetMatch =
      itemCountries.some((c) => c.includes(target)) ||
      (target === 'india' && (itemOrigLang === 'hi' || itemOrigLang === 'te' || itemOrigLang === 'ta' || itemOrigLang === 'pa' || itemCountries.includes('india'))) ||
      (target === 'korea' && (itemOrigLang === 'ko' || itemCountries.includes('south korea') || itemCountries.includes('korea'))) ||
      (target === 'japan' && (itemOrigLang === 'ja' || itemCountries.includes('japan'))) ||
      (target === 'spain' && (itemOrigLang === 'es' || itemCountries.includes('spain')));

    if (!isTargetMatch) {
      return null;
    }
  }

  // Defensive array parsing for genres and themes
  const rawGenres = item.genres as any;
  const safeGenres: string[] = Array.isArray(rawGenres)
    ? rawGenres
    : (typeof rawGenres === 'string' && rawGenres.startsWith('[') ? (JSON.parse(rawGenres || '[]')) : (rawGenres ? [String(rawGenres)] : []));
  const rawThemes = item.themes as any;
  const safeThemes: string[] = Array.isArray(rawThemes)
    ? rawThemes
    : (typeof rawThemes === 'string' && rawThemes.startsWith('[') ? (JSON.parse(rawThemes || '[]')) : (rawThemes ? [String(rawThemes)] : []));

  // Check Exclusions
  const itemGenresLower = safeGenres.map((g: string) => String(g).toLowerCase());
  const itemThemesLower = safeThemes.map((t: string) => String(t).toLowerCase());
  const synLower = (item.synopsis || '').toLowerCase();
  const titleLower = item.title.toLowerCase();

  for (const excl of intent.hardExclusions) {
    if (itemGenresLower.includes(excl) || itemThemesLower.some((t: string) => t.includes(excl)) || synLower.includes(excl)) {
      return null;
    }
  }

  // 1. Strict Genre Constraint Check
  let genreMatchScore = 0.20;
  if (intent.genres.length > 0) {
    const hits = intent.genres.filter((g) =>
      safeGenres.some((sg: string) => sg.toLowerCase() === g.toLowerCase())
    );

    // Also check parameters_100 continuous score
    let paramGenreHit = false;
    if (item.parameters_100) {
      for (const g of intent.genres) {
        const paramKey = g.toLowerCase().replace(/[^a-z0-9]/g, '_');
        if ((item.parameters_100[paramKey] || 0) >= 0.55) {
          paramGenreHit = true;
          break;
        }
      }
    }

    // Synopsis genre mention
    const synGenreHit = intent.genres.some((g) =>
      synLower.includes(g.toLowerCase()) || titleLower.includes(g.toLowerCase())
    );

    // HARD REJECTION: If user explicitly asked for a genre (e.g. "thriller", "comedy", "action"),
    // and this title does NOT have that genre, DISQUALIFY IT IMMEDIATELY!
    if (hits.length === 0 && !paramGenreHit && !synGenreHit) {
      return null;
    }

    genreMatchScore = hits.length > 0
      ? 0.70 + (hits.length / intent.genres.length) * 0.30
      : (paramGenreHit ? 0.65 : 0.50);
  }

  // 2. Theme Match Score
  const enrichedThemes = safeThemes.length > 0
    ? safeThemes
    : extractThemesFromKeywords(item.tmdbKeywords || [], safeGenres, item.synopsis);

  let themeMatchScore = 0.15;
  if (intent.themes.length > 0) {
    const hits = intent.themes.filter((t) => enrichedThemes.some((et: string) => et.toLowerCase().includes(t.toLowerCase())));
    themeMatchScore = hits.length > 0 ? 0.85 : 0.05;
  }

  // 3. Deep Plot Synopsis NLP & Freeform Search
  let synopsisMatchScore = 0.1;
  let synopsisMatchDetail = '';

  // Exact phrase match (e.g. "strong girl", "time travel")
  if (intent.contentTokens.length >= 2) {
    const joinedPhrase = intent.contentTokens.join(' ');
    if (synLower.includes(joinedPhrase)) {
      synopsisMatchScore += 0.65;
      synopsisMatchDetail = `Synopsis directly matches "${joinedPhrase}"`;
    }
  }

  // Token co-occurrence in synopsis & title
  let contentTokenHits = 0;
  const matchedTokensList: string[] = [];
  for (const tok of intent.contentTokens) {
    if (synLower.includes(tok) || titleLower.includes(tok)) {
      contentTokenHits++;
      matchedTokensList.push(tok);
    }
  }
  if (intent.contentTokens.length > 0) {
    const hitRatio = contentTokenHits / intent.contentTokens.length;
    synopsisMatchScore = Math.max(synopsisMatchScore, hitRatio * 0.70);
    if (contentTokenHits > 0 && !synopsisMatchDetail) {
      synopsisMatchDetail = `Synopsis matches keywords (${matchedTokensList.slice(0, 3).join(', ')})`;
    }
  }

  // Concept Match: Strong Female Lead
  if (intent.targetConcepts.includes('strong_female_lead')) {
    const hasFemale = CONCEPT_FEMALE_TOKENS.some(t => synLower.includes(t) || titleLower.includes(t));
    const hasStrength = CONCEPT_STRENGTH_TOKENS.some(t => synLower.includes(t));
    if (hasFemale && hasStrength) {
      synopsisMatchScore += 0.60;
      synopsisMatchDetail = 'Synopsis highlights a resilient and powerful female lead';
    } else if (hasFemale) {
      synopsisMatchScore += 0.35;
      if (!synopsisMatchDetail) synopsisMatchDetail = 'Features a prominent female protagonist';
    }

    if (item.parameters_100) {
      const heroVal = Math.max(
        item.parameters_100.reluctant_hero || 0,
        item.parameters_100.underdog_triumph || 0,
        item.parameters_100.survival || 0
      );
      if (heroVal > 0.5) {
        synopsisMatchScore += heroVal * 0.25;
      }
    }
  }

  // 4. Local 100-Parameter Continuous AI Knowledge Base Match
  let paramMatchScore = 0.1;
  if (item.parameters_100 && Object.keys(item.parameters_100).length > 0) {
    let paramBoost = 0;
    let paramMatches = 0;
    const rawLower = intent.raw.toLowerCase();

    for (const [paramName, scoreVal] of Object.entries(item.parameters_100)) {
      const cleanParam = paramName.replace(/_/g, ' ').toLowerCase();
      if (rawLower.includes(cleanParam) || rawLower.includes(paramName.toLowerCase())) {
        paramBoost += scoreVal;
        paramMatches++;
      }
    }
    if (paramMatches > 0) {
      paramMatchScore = paramBoost / paramMatches;
    }
  }

  // 5. Reference Movie Similarity (e.g. "like Tenet", "like Interstellar")
  let referenceMatchScore = 0.0;
  let referenceMatchDetail = '';

  if (intent.referenceTitles.length > 0) {
    const refTitleKey = intent.referenceTitles[0].toLowerCase();

    // Never return the reference movie itself
    if (titleLower === refTitleKey || titleLower.includes(refTitleKey)) {
      return null;
    }

    if (intent.referenceProfile) {
      const profile = intent.referenceProfile;

      // A. Multi-parameter vector similarity
      if (item.parameters_100) {
        let dotProduct = 0;
        let countedParams = 0;
        for (const [pName, pWeight] of Object.entries(profile.params)) {
          if (item.parameters_100[pName] !== undefined) {
            dotProduct += item.parameters_100[pName] * pWeight;
            countedParams++;
          }
        }
        if (countedParams > 0) {
          const avgSim = dotProduct / countedParams;
          referenceMatchScore += avgSim * 0.55;
        }
      }

      // B. Key elements overlap in synopsis
      let refKwHits = 0;
      for (const kw of profile.keywords) {
        if (synLower.includes(kw) || titleLower.includes(kw)) {
          refKwHits++;
        }
      }
      if (refKwHits > 0) {
        referenceMatchScore += Math.min(0.35, (refKwHits / 3) * 0.35);
      }

      // C. Genre overlap
      const sharedRefGenres = safeGenres.filter((g: string) => profile.genres.includes(g));
      if (sharedRefGenres.length > 0) {
        referenceMatchScore += (sharedRefGenres.length / profile.genres.length) * 0.25;
      }

      referenceMatchDetail = `Shares ${profile.vibe}`;
    } else {
      // Reference item in catalog
      const refCatalogItem = allTitles.find(t => t.title.toLowerCase() === refTitleKey);
      if (refCatalogItem) {
        const refG = Array.isArray(refCatalogItem.genres) ? refCatalogItem.genres : [];
        const refT = Array.isArray(refCatalogItem.themes) ? refCatalogItem.themes : [];
        const sharedG = safeGenres.filter((g: string) => refG.includes(g));
        const sharedT = safeThemes.filter((t: string) => refT.includes(t));
        referenceMatchScore += (sharedG.length * 0.2) + (sharedT.length * 0.3);
        referenceMatchDetail = `Similar atmosphere and genre DNA as ${refCatalogItem.title}`;
      } else {
        referenceMatchScore += 0.2;
      }
    }
  }

  // 6. Quality Bayesian Score
  const rating = item.imdbRating || item.rating || 6.5;
  const votes = item.voteCount || 500;
  const bayesianQuality = ((votes / (votes + 500)) * rating + (500 / (votes + 500)) * 6.5 - 1) / 9;

  // Composite Score Calculation
  const semanticMatchScore = Math.max(synopsisMatchScore, paramMatchScore);

  let finalScore =
    0.35 * semanticMatchScore +
    0.20 * genreMatchScore +
    0.15 * themeMatchScore +
    0.15 * bayesianQuality +
    referenceMatchScore +
    (synopsisMatchScore > 0.4 ? 0.25 : 0);

  // Stochastic Exploration (Ensures diversity each run)
  const randomJitter = (Math.random() - 0.5) * stochasticVariance;
  finalScore = Math.max(0, finalScore + randomJitter);

  // Hidden Gem mode adjustment
  const badges: string[] = [];
  if (intent.mode === 'hidden_gem') {
    if (rating >= 7.0 && votes <= 100000) {
      finalScore += 0.4;
      badges.push('💎 Hidden Gem');
    }
  } else if (rating >= 8.0 && votes <= 80000) {
    badges.push('💎 Hidden Gem');
  }

  if (rating >= 8.5) {
    badges.push('⭐ Masterpiece');
  }

  // Create crisp explanation
  const explanations: string[] = [];
  if (referenceMatchDetail) {
    explanations.push(referenceMatchDetail);
  } else if (synopsisMatchDetail) {
    explanations.push(synopsisMatchDetail);
  } else if (intent.moods.length > 0) {
    explanations.push(`Features a ${intent.moods.join(' and ')} tone`);
  }
  if (enrichedThemes.length > 0 && explanations.length < 2) {
    explanations.push(`Explores ${enrichedThemes.slice(0, 2).join(' & ')}`);
  }
  if (item.runtimeMinutes && intent.maxRuntimeMinutes) {
    explanations.push(`${item.runtimeMinutes}m fits your ${intent.maxRuntimeMinutes}m limit`);
  }
  if (explanations.length === 0) {
    explanations.push(`Highly rated title matching your vibe`);
  }

  return {
    item,
    score: finalScore,
    semanticMatchScore,
    themeMatchScore,
    genreMatchScore,
    qualityScore: bayesianQuality,
    explanation: explanations.join(' • '),
    badges,
  };
}

/**
 * Searches and ranks titles with intelligent discovery catalog analysis.
 */
export function queryCatalogIntelligence(
  allTitles: DiscoveryTitle[],
  query: string,
  customCount?: number
): ScoredTitleResult[] {
  const intent = analyzeQueryIntent(query, allTitles);
  const targetCount = customCount || intent.count;

  const scoredResults: ScoredTitleResult[] = [];

  for (const item of allTitles) {
    const res = scoreItem(item, intent, allTitles, 0.15);
    if (res) {
      scoredResults.push(res);
    }
  }

  // Sort descending by preliminary score
  scoredResults.sort((a, b) => b.score - a.score);

  // If strict constraints were specified (like negative exclusions or explicit max runtime or explicit genres),
  // NEVER relax them just to pad results with garbage.
  const hasHardConstraints =
    intent.hardExclusions.length > 0 ||
    intent.maxRuntimeMinutes !== undefined ||
    intent.targetCountryOrLang !== undefined ||
    intent.genres.length > 0;
  if (scoredResults.length === 0 && !hasHardConstraints) {
    const relaxed = analyzeQueryIntent(query, allTitles);
    relaxed.minImdb = undefined;
    for (const item of allTitles) {
      const res = scoreItem(item, relaxed, allTitles, 0.15);
      if (res) scoredResults.push(res);
    }
    scoredResults.sort((a, b) => b.score - a.score);
  }

  // MMR (Maximal Marginal Relevance) Diversification
  // Ensures variety across directors and subgenres while keeping top relevance
  const selected: ScoredTitleResult[] = [];
  const pool = [...scoredResults];
  const lambda = (intent.genres.length > 0 || intent.referenceTitles.length > 0) ? 0.92 : 0.70;

  while (selected.length < targetCount && pool.length > 0) {
    if (selected.length === 0) {
      selected.push(pool.shift()!);
      continue;
    }

    let bestIdx = 0;
    let bestMmrScore = -Infinity;

    for (let i = 0; i < pool.length; i++) {
      const candidate = pool[i];
      let maxOverlap = 0;
      for (const sel of selected) {
        let overlap = 0;
        // Same director penalty
        if (candidate.item.director && sel.item.director && candidate.item.director === sel.item.director) {
          overlap += 0.3;
        }

        // Genre overlap: ONLY penalize subgenres NOT in the user's requested query!
        // Never penalize sharing the target genre the user specifically searched for!
        const nonTargetCandGenres = (candidate.item.genres || []).filter(
          cg => !intent.genres.some(tg => tg.toLowerCase() === cg.toLowerCase())
        );
        const sharedNonTarget = nonTargetCandGenres.filter(
          g => (sel.item.genres || []).includes(g)
        );
        if (nonTargetCandGenres.length > 0) {
          overlap += (sharedNonTarget.length / nonTargetCandGenres.length) * 0.25;
        }

        if (overlap > maxOverlap) {
          maxOverlap = overlap;
        }
      }

      const mmrScore = lambda * candidate.score - (1 - lambda) * maxOverlap;
      if (mmrScore > bestMmrScore) {
        bestMmrScore = mmrScore;
        bestIdx = i;
      }
    }

    selected.push(pool.splice(bestIdx, 1)[0]);
  }

  return selected.slice(0, targetCount);
}
