import Fuse, { IFuseOptions } from 'fuse.js';
import { DiscoveryTitle, LibraryItem, MediaType } from '../types';
import { normalizeTitle, createDuplicateKey } from './normalizer';

export interface SearchIndexItem {
  id: string;
  title: string;
  originalTitle?: string;
  externalTitle?: string;
  normalizedTitle: string;
  collapsedTitle: string;
  primaryTitle: string;
  normalizedPrimaryTitle: string;
  collapsedPrimaryTitle: string;
  titleWords: string[];
  mediaType: MediaType;
  releaseYear?: number;
  releaseDate?: string;
  posterPath?: string;
  backdropPath?: string;
  imdbRating?: number;
  rottenTomatoesRating?: number;
  rating?: number; // TMDB rating
  genres: string[];
  themes?: string[];
  countries: string[];
  cast?: string[];
  director?: string;
  creator?: string;
  synopsis?: string;
  netflixId?: string;
  videoId?: string;
  imdbId?: string;
  tmdbId?: string | number;
  isNetflixIndiaVerified?: boolean;
  // Reference to original source item
  sourceItem: DiscoveryTitle | LibraryItem;
  sourceType: 'discovery' | 'library';
}

export interface SearchQueryResult {
  item: SearchIndexItem;
  score: number;
  matchReason: string;
  isExactMatch: boolean;
  yearMatchStatus: 'exact' | 'close' | 'mismatch' | 'none';
}

export interface DidYouMeanSuggestion {
  suggestedTitle: string;
  originalQuery: string;
  confidence: number;
  item: SearchIndexItem;
}

export interface SearchEngineResponse {
  results: SearchQueryResult[];
  didYouMean: DidYouMeanSuggestion | null;
  totalMatches: number;
  parsedQuery: {
    originalQuery: string;
    titleQuery: string;
    yearCandidate: number | null;
  };
}

/**
 * Centralized, configurable thresholds and weights for the search system.
 * No scattered magic numbers.
 */
export const SEARCH_CONFIG = {
  // Input debounce interval in ms
  DEBOUNCE_MS: 150,

  // Maximum number of results to return
  MAX_RESULTS: 30,

  // Minimum query length to perform fuzzy search
  MIN_QUERY_LENGTH: 2,

  // Year parsing limits (sensible cinematic era)
  MIN_YEAR: 1900,
  MAX_YEAR: 2035,

  // Granular match weights
  WEIGHTS: {
    EXACT_TITLE: 10000,
    EXACT_PRIMARY_TITLE: 9000,
    COLLAPSED_EXACT: 8500,
    NORMALIZED_EXACT: 8000,
    TITLE_STARTS_WITH: 5000,
    TYPO_MATCH_HIGH: 3500,
    TYPO_MATCH_MED: 2500,
    TITLE_WORD_EXACT: 3500,
    TITLE_WORD_PREFIX: 2500,
    TOKEN_OVERLAP: 1500,
    FUSE_FUZZY_MAX: 1500,
    DIRECTOR_MATCH: 800,
    CAST_MATCH: 600,
    GENRE_COUNTRY_MATCH: 400,
    // Year weights
    YEAR_EXACT_BOOST: 3000,
    YEAR_CLOSE_BOOST: 1200, // ±1 year
    YEAR_MISMATCH_PENALTY: -800, // Penalize, but don't eliminate strong title matches
  },

  // Fuse.js configuration tuned for precision and subtitle-aware typo handling
  FUSE_OPTIONS: {
    includeScore: true,
    shouldSort: false, // We use our own unified relevance ranker
    threshold: 0.52,   // Allows genuine typos across words and multi-word titles
    distance: 100,
    ignoreLocation: true, // Crucial for subtitles and multi-word matches!
    minMatchCharLength: 2,
    keys: [
      { name: 'title', weight: 0.4 },
      { name: 'primaryTitle', weight: 0.3 },
      { name: 'normalizedTitle', weight: 0.2 },
      { name: 'titleWords', weight: 0.3 },
      { name: 'director', weight: 0.1 },
      { name: 'creator', weight: 0.1 },
      { name: 'cast', weight: 0.1 },
    ],
  } as IFuseOptions<SearchIndexItem>,

  // "Did you mean?" confidence threshold (0 to 1)
  DID_YOU_MEAN_MIN_CONFIDENCE: 0.65,
  DID_YOU_MEAN_MAX_EXACT_RESULTS: 0,
};

/**
 * Normalizes title for high-fidelity search matching:
 * - Lowercase
 * - Strips diacritics / accents (e.g. Amélie -> amelie)
 * - Standardizes apostrophes and hyphens
 * - Replaces punctuation with single spaces
 * - Trims and condenses whitespace
 */
export function normalizeForSearch(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/[–—_:]/g, ' ')
    .replace(/[^a-z0-9\s']/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Creates collapsed alphanumeric token string (e.g. "The Dark Knight" -> "thedarkknight")
 */
export function collapseTitle(str: string): string {
  if (!str) return '';
  return normalizeForSearch(str).replace(/[^a-z0-9]/g, '');
}

/**
 * Computes Damerau-Levenshtein distance with transposition support.
 * Optimal for real-world user typos (e.g. 'jmatara' <-> 'jamtara', 'jamtare' <-> 'jamtara').
 */
export function damerauLevenshtein(a: string, b: string): number {
  const al = a.length;
  const bl = b.length;
  if (!al) return bl;
  if (!bl) return al;

  const matrix: number[][] = [];
  for (let i = 0; i <= al; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bl; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,        // deletion
        matrix[i][j - 1] + 1,        // insertion
        matrix[i - 1][j - 1] + cost  // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1); // transposition
      }
    }
  }

  return matrix[al][bl];
}

/**
 * Parses user search query to detect title candidate and optional release year.
 * Handles patterns:
 * - "Inception 2010"
 * - "Inception (2010)"
 * - "Inception - 2010"
 * - "Inception, 2010"
 * - "2010 Inception"
 */
export function parseSearchQuery(rawQuery: string): {
  originalQuery: string;
  titleQuery: string;
  yearCandidate: number | null;
} {
  const trimmed = (rawQuery || '').trim();
  if (!trimmed) {
    return { originalQuery: '', titleQuery: '', yearCandidate: null };
  }

  // Look for 4-digit year pattern surrounded by boundaries, parentheses, or string ends
  // e.g. "(2010)", "- 2010", " 2010", "2010"
  const yearPattern = /(?:^|\s|\(|-|,)+(\b(?:19\d{2}|20\d{2})\b)(?:\s|\)|-|,|$)/;
  const match = trimmed.match(yearPattern);

  if (match) {
    const yearVal = parseInt(match[1], 10);
    if (yearVal >= SEARCH_CONFIG.MIN_YEAR && yearVal <= SEARCH_CONFIG.MAX_YEAR) {
      // Remove the matched year and any surrounding parentheses/dashes/commas from the title query
      const titleWithoutYear = trimmed
        .replace(match[0], ' ')
        .replace(/\(\s*\)/g, '')
        .replace(/\s*-\s*$/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      // If removing the year still leaves a meaningful title query, use it!
      if (titleWithoutYear.length > 0) {
        return {
          originalQuery: trimmed,
          titleQuery: titleWithoutYear,
          yearCandidate: yearVal,
        };
      }
    }
  }

  return {
    originalQuery: trimmed,
    titleQuery: trimmed,
    yearCandidate: null,
  };
}

/**
 * Builds unified search index item from DiscoveryTitle or LibraryItem
 */
export function createSearchIndexItem(
  item: DiscoveryTitle | LibraryItem,
  sourceType: 'discovery' | 'library'
): SearchIndexItem {
  const isLibrary = sourceType === 'library';
  const lib = isLibrary ? (item as LibraryItem) : null;
  const disc = !isLibrary ? (item as DiscoveryTitle) : null;

  const canonicalTitle = disc?.title || lib?.externalTitle || lib?.originalTitle || '';
  const origTitle = item.originalTitle || undefined;
  const extTitle = lib?.externalTitle || undefined;
  const normTitle = normalizeForSearch(canonicalTitle);
  const collTitle = collapseTitle(canonicalTitle);

  // Extract primary title (part before subtitle delimiter e.g. "Jamtara - Sabka Number Ayega" -> "Jamtara")
  const primaryTitle = canonicalTitle.split(/\s*[-:–—|]\s*/)[0].trim() || canonicalTitle;
  const normPrimaryTitle = normalizeForSearch(primaryTitle);
  const collPrimaryTitle = collapseTitle(primaryTitle);
  const titleWords = normTitle.split(/\s+/).filter((w) => w.length >= 2);

  const mediaType: MediaType =
    item.mediaType === 'tv' ? 'tv' : item.mediaType === 'movie' ? 'movie' : 'unknown';

  return {
    id: item.id,
    title: canonicalTitle,
    originalTitle: origTitle,
    externalTitle: extTitle,
    normalizedTitle: normTitle,
    collapsedTitle: collTitle,
    primaryTitle,
    normalizedPrimaryTitle: normPrimaryTitle,
    collapsedPrimaryTitle: collPrimaryTitle,
    titleWords,
    mediaType,
    releaseYear: item.releaseYear,
    releaseDate: item.releaseDate,
    posterPath: item.posterPath,
    backdropPath: item.backdropPath,
    imdbRating: item.imdbRating,
    rottenTomatoesRating: item.rottenTomatoesRating,
    rating: item.rating,
    genres: item.genres || [],
    themes: item.themes || [],
    countries: item.countries || [],
    cast: item.cast || [],
    director: item.director,
    creator: item.creator,
    synopsis: item.synopsis,
    netflixId: disc?.netflixId || lib?.videoId,
    videoId: lib?.videoId || disc?.netflixId,
    imdbId: disc?.imdbId || lib?.imdbId,
    tmdbId: disc?.tmdbId || lib?.externalId,
    isNetflixIndiaVerified: disc?.isNetflixIndiaVerified ?? true,
    sourceItem: item,
    sourceType,
  };
}

/**
 * Production-Quality Search Engine Class
 * Maintains in-memory index, Fuse.js fuzzy instance, and ranking pipeline.
 */
export class MovieSearchEngine {
  private indexItems: SearchIndexItem[] = [];
  private itemMap = new Map<string, SearchIndexItem>();
  private fuseInstance: Fuse<SearchIndexItem> | null = null;
  private isReady = false;

  constructor() {
    this.indexItems = [];
    this.itemMap.clear();
  }

  /**
   * Initializes or refreshes the search index from local database records.
   * Deduplicates by unique ID, netflixId, tmdbId, and canonical title/year.
   */
  public initializeIndex(catalog: DiscoveryTitle[], library: LibraryItem[]): void {
    const dedupeMap = new Map<string, SearchIndexItem>();
    const identityIndex = new Map<string, string>(); // identityKey -> primary dedupeMap key

    const registerItem = (item: DiscoveryTitle | LibraryItem, sourceType: 'discovery' | 'library') => {
      if (!item) return;
      const indexItem = createSearchIndexItem(item, sourceType);
      if (!indexItem.title && !indexItem.normalizedTitle) return;

      // Extract all candidate identity keys for this item
      const netflixId = indexItem.netflixId || indexItem.videoId;
      const imdbId = indexItem.imdbId;
      const tmdbId = indexItem.tmdbId;
      const collapsed = indexItem.collapsedTitle || collapseTitle(indexItem.title);
      const mediaType = indexItem.mediaType;
      const year = indexItem.releaseYear ? String(indexItem.releaseYear) : '';

      const keys: string[] = [];
      if (netflixId) keys.push(`netflix_${netflixId}`);
      if (imdbId) keys.push(`imdb_${imdbId}`);
      if (tmdbId) keys.push(`tmdb_${mediaType}_${tmdbId}`);
      if (collapsed) {
        if (year) keys.push(`title_${collapsed}_${mediaType}_${year}`);
        keys.push(`title_${collapsed}_${mediaType}`);
        keys.push(`title_${collapsed}`);
      }

      // Check if this item matches any already indexed entry
      let existingKey: string | undefined;
      for (const k of keys) {
        if (identityIndex.has(k)) {
          existingKey = identityIndex.get(k);
          break;
        }
      }

      if (existingKey && dedupeMap.has(existingKey)) {
        // Unify and merge records - keep richest data
        const existing = dedupeMap.get(existingKey)!;

        // If the new item is from Library and existing is from Discovery, prioritize Library source
        if (sourceType === 'library' && existing.sourceType === 'discovery') {
          existing.sourceItem = item;
          existing.sourceType = 'library';
          existing.id = item.id;
        }

        existing.posterPath = existing.posterPath || indexItem.posterPath;
        existing.backdropPath = existing.backdropPath || indexItem.backdropPath;
        existing.synopsis = existing.synopsis || indexItem.synopsis;
        existing.imdbRating = existing.imdbRating || indexItem.imdbRating;
        existing.rottenTomatoesRating = existing.rottenTomatoesRating || indexItem.rottenTomatoesRating;
        existing.rating = existing.rating || indexItem.rating;
        existing.director = existing.director || indexItem.director;
        existing.creator = existing.creator || indexItem.creator;
        existing.netflixId = existing.netflixId || indexItem.netflixId;
        existing.videoId = existing.videoId || indexItem.videoId;
        existing.imdbId = existing.imdbId || indexItem.imdbId;
        existing.tmdbId = existing.tmdbId || indexItem.tmdbId;

        if (indexItem.cast && indexItem.cast.length > 0) {
          existing.cast = Array.from(new Set([...(existing.cast || []), ...indexItem.cast]));
        }
        if (indexItem.genres && indexItem.genres.length > 0) {
          existing.genres = Array.from(new Set([...existing.genres, ...indexItem.genres]));
        }
        if (indexItem.countries && indexItem.countries.length > 0) {
          existing.countries = Array.from(new Set([...existing.countries, ...indexItem.countries]));
        }

        // Link all candidate keys to this unified primary entry
        for (const k of keys) {
          identityIndex.set(k, existingKey);
        }
      } else {
        // New unique item
        const primaryKey = item.id || `entry_${keys[0] || Math.random().toString(36).slice(2)}`;
        dedupeMap.set(primaryKey, indexItem);
        for (const k of keys) {
          identityIndex.set(k, primaryKey);
        }
      }
    };

    // 1. Process Library items first (user's library records take primary precedence)
    for (const item of library) {
      registerItem(item, 'library');
    }

    // 2. Process Discovery catalog items (unifying duplicates)
    for (const item of catalog) {
      registerItem(item, 'discovery');
    }

    this.indexItems = Array.from(dedupeMap.values());
    this.itemMap = dedupeMap;

    // Initialize Fuse.js instance for fuzzy matching
    this.fuseInstance = new Fuse(this.indexItems, SEARCH_CONFIG.FUSE_OPTIONS);
    this.isReady = true;
  }

  /**
   * Checks if index is loaded and has items
   */
  public getIsReady(): boolean {
    return this.isReady && this.indexItems.length > 0;
  }

  /**
   * Returns total count of indexed titles
   */
  public getItemCount(): number {
    return this.indexItems.length;
  }

  /**
   * Performs high-precision, year-aware, relevance-ranked search.
   */
  public search(rawQuery: string, maxResults?: number): SearchEngineResponse {
    const parsed = parseSearchQuery(rawQuery);
    const { titleQuery, yearCandidate } = parsed;

    if (!titleQuery || titleQuery.length < 1 || !this.isReady) {
      return {
        results: [],
        didYouMean: null,
        totalMatches: 0,
        parsedQuery: parsed,
      };
    }

    const cleanTitle = titleQuery.toLowerCase();
    const normalizedQuery = normalizeForSearch(titleQuery);
    const collapsedQuery = collapseTitle(titleQuery);
    const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);

    // Score all candidates
    const scoredMap = new Map<string, SearchQueryResult>();

    // Pass 1: Deterministic Multi-tier matching (Exact, Prefix, Word boundaries, Collapsed)
    for (const item of this.indexItems) {
      let score = 0;
      let matchReason = '';
      let isExactMatch = false;
      let yearMatchStatus: 'exact' | 'close' | 'mismatch' | 'none' = 'none';

      const itemTitle = item.title.toLowerCase();
      const itemNormTitle = item.normalizedTitle;
      const itemCollTitle = item.collapsedTitle;

      // Tier 1: Exact match on full title, normalized title, or primary title
      if (itemTitle === cleanTitle || itemNormTitle === normalizedQuery) {
        score = SEARCH_CONFIG.WEIGHTS.EXACT_TITLE;
        matchReason = 'Exact Title Match';
        isExactMatch = true;
      } else if (cleanTitle === item.normalizedPrimaryTitle) {
        score = SEARCH_CONFIG.WEIGHTS.EXACT_PRIMARY_TITLE;
        matchReason = 'Exact Primary Title Match';
        isExactMatch = true;
      } else if (
        collapsedQuery.length >= 4 &&
        (itemCollTitle === collapsedQuery || item.collapsedPrimaryTitle === collapsedQuery)
      ) {
        score = SEARCH_CONFIG.WEIGHTS.COLLAPSED_EXACT;
        matchReason = 'Exact Title Match (Whitespace/Punctuation Insensitive)';
        isExactMatch = true;
      } else if (
        itemTitle.startsWith(cleanTitle) ||
        itemNormTitle.startsWith(normalizedQuery) ||
        item.normalizedPrimaryTitle.startsWith(normalizedQuery) ||
        (collapsedQuery.length >= 4 &&
          (itemCollTitle.startsWith(collapsedQuery) || item.collapsedPrimaryTitle.startsWith(collapsedQuery)))
      ) {
        score = SEARCH_CONFIG.WEIGHTS.TITLE_STARTS_WITH;
        matchReason = 'Title Starts With Query';
      } else {
        // Word boundary match
        const wordRegex = new RegExp(`\\b${escapeRegExp(normalizedQuery)}\\b`, 'i');
        const wordStartRegex = new RegExp(`\\b${escapeRegExp(normalizedQuery)}`, 'i');

        if (wordRegex.test(itemNormTitle) || wordRegex.test(item.normalizedPrimaryTitle)) {
          score = SEARCH_CONFIG.WEIGHTS.TITLE_WORD_EXACT;
          matchReason = 'Title Contains Exact Word';
        } else if (wordStartRegex.test(itemNormTitle) || wordStartRegex.test(item.normalizedPrimaryTitle)) {
          score = SEARCH_CONFIG.WEIGHTS.TITLE_WORD_PREFIX;
          matchReason = 'Title Word Starts With Query';
        } else if (queryTokens.length > 1) {
          // Token overlap matching
          const itemTokens = itemNormTitle.split(/\s+/);
          const matchedTokenCount = queryTokens.filter((qt) =>
            itemTokens.some((it) => it === qt || (qt.length >= 3 && it.startsWith(qt)))
          ).length;

          if (matchedTokenCount === queryTokens.length) {
            score = SEARCH_CONFIG.WEIGHTS.TOKEN_OVERLAP;
            matchReason = 'All Query Words Matched';
          } else if (matchedTokenCount > 0 && queryTokens.length > 2) {
            score = (matchedTokenCount / queryTokens.length) * 1000;
            matchReason = `${matchedTokenCount}/${queryTokens.length} Words Matched`;
          }
        }

        // Tier 2: Damerau-Levenshtein Typo Matcher (e.g. 'jamtare' -> 'Jamtara', 'jmatara' -> 'Jamtara', 'incepton' -> 'Inception')
        if (score === 0 && collapsedQuery.length >= 3) {
          let bestDist = 999;
          let matchedTarget = '';

          // 1. Check against primary title (e.g. Jamtara, Inception)
          const primaryDist = damerauLevenshtein(collapsedQuery, item.collapsedPrimaryTitle);
          if (primaryDist < bestDist) {
            bestDist = primaryDist;
            matchedTarget = item.primaryTitle;
          }

          // 2. Check against individual title words
          for (const word of item.titleWords) {
            const wColl = collapseTitle(word);
            const dist = damerauLevenshtein(collapsedQuery, wColl);
            if (dist < bestDist) {
              bestDist = dist;
              matchedTarget = word;
            }
          }

          // Dynamic distance threshold: 1 for <=4 chars, 2 for 5-8 chars, 3 for 9+ chars
          const maxAllowedDist = collapsedQuery.length <= 4 ? 1 : collapsedQuery.length <= 8 ? 2 : 3;
          if (bestDist > 0 && bestDist <= maxAllowedDist) {
            const qualityRatio = 1 - (bestDist / Math.max(collapsedQuery.length, matchedTarget.length));
            score = Math.round(
              qualityRatio * (bestDist === 1 ? SEARCH_CONFIG.WEIGHTS.TYPO_MATCH_HIGH : SEARCH_CONFIG.WEIGHTS.TYPO_MATCH_MED)
            );
            matchReason = `Typo Match: "${matchedTarget}"`;
          }
        }

        // Secondary metadata matching (Director, Creator, Cast, Genre, Country)
        if (score === 0 && normalizedQuery.length >= 3) {
          if (item.director && wordStartRegex.test(normalizeForSearch(item.director))) {
            score = SEARCH_CONFIG.WEIGHTS.DIRECTOR_MATCH;
            matchReason = `Director: ${item.director}`;
          } else if (item.creator && wordStartRegex.test(normalizeForSearch(item.creator))) {
            score = SEARCH_CONFIG.WEIGHTS.DIRECTOR_MATCH;
            matchReason = `Creator: ${item.creator}`;
          } else if (item.cast && item.cast.length > 0) {
            const actorHit = item.cast.find((actor) => wordStartRegex.test(normalizeForSearch(actor)));
            if (actorHit) {
              score = SEARCH_CONFIG.WEIGHTS.CAST_MATCH;
              matchReason = `Cast: ${actorHit}`;
            }
          } else {
            const genreHit = (item.genres || []).find((g) => wordStartRegex.test(normalizeForSearch(g)));
            if (genreHit) {
              score = SEARCH_CONFIG.WEIGHTS.GENRE_COUNTRY_MATCH;
              matchReason = `Genre: ${genreHit}`;
            } else {
              const countryHit = (item.countries || []).find((c) => wordStartRegex.test(normalizeForSearch(c)));
              if (countryHit) {
                score = SEARCH_CONFIG.WEIGHTS.GENRE_COUNTRY_MATCH;
                matchReason = `Country: ${countryHit}`;
              }
            }
          }
        }
      }

      // Year-Aware Ranking adjustments
      if (yearCandidate && item.releaseYear) {
        if (item.releaseYear === yearCandidate) {
          score += SEARCH_CONFIG.WEIGHTS.YEAR_EXACT_BOOST;
          yearMatchStatus = 'exact';
        } else if (Math.abs(item.releaseYear - yearCandidate) === 1) {
          score += SEARCH_CONFIG.WEIGHTS.YEAR_CLOSE_BOOST;
          yearMatchStatus = 'close';
        } else {
          // Penalize incorrect year, but retain strong title candidates
          score += SEARCH_CONFIG.WEIGHTS.YEAR_MISMATCH_PENALTY;
          yearMatchStatus = 'mismatch';
        }
      }

      if (score > 0) {
        scoredMap.set(item.id, {
          item,
          score,
          matchReason,
          isExactMatch,
          yearMatchStatus,
        });
      }
    }

    // Pass 2: Fuzzy matching with Fuse.js for typos and variations (e.g. 'incepton', 'harry potterr')
    if (this.fuseInstance && titleQuery.length >= SEARCH_CONFIG.MIN_QUERY_LENGTH) {
      const fuseResults = this.fuseInstance.search(titleQuery);

      for (const fuseHit of fuseResults) {
        if (fuseHit.score === undefined) continue;

        // Fuse.js score: 0.0 is perfect, 1.0 is mismatch
        // Convert to confidence (0 to 1):
        const confidence = Math.max(0, 1 - fuseHit.score);
        const fuzzyScore = confidence * SEARCH_CONFIG.WEIGHTS.FUSE_FUZZY_MAX;

        const existing = scoredMap.get(fuseHit.item.id);
        if (existing) {
          // If item already matched, boost with fuzzy confidence
          existing.score += fuzzyScore;
        } else if (confidence >= 0.65) {
          let yearStatus: 'exact' | 'close' | 'mismatch' | 'none' = 'none';
          let finalScore = fuzzyScore;

          if (yearCandidate && fuseHit.item.releaseYear) {
            if (fuseHit.item.releaseYear === yearCandidate) {
              finalScore += SEARCH_CONFIG.WEIGHTS.YEAR_EXACT_BOOST;
              yearStatus = 'exact';
            } else if (Math.abs(fuseHit.item.releaseYear - yearCandidate) === 1) {
              finalScore += SEARCH_CONFIG.WEIGHTS.YEAR_CLOSE_BOOST;
              yearStatus = 'close';
            } else {
              finalScore += SEARCH_CONFIG.WEIGHTS.YEAR_MISMATCH_PENALTY;
              yearStatus = 'mismatch';
            }
          }

          if (finalScore > 300) {
            scoredMap.set(fuseHit.item.id, {
              item: fuseHit.item,
              score: finalScore,
              matchReason: `Fuzzy Match (${Math.round(confidence * 100)}% similarity)`,
              isExactMatch: false,
              yearMatchStatus: yearStatus,
            });
          }
        }
      }
    }

    // Sort by relevance score descending
    const sortedResults = Array.from(scoredMap.values()).sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      // Secondary sort: IMDb rating or release year
      const ratingA = a.item.imdbRating || a.item.rating || 0;
      const ratingB = b.item.imdbRating || b.item.rating || 0;
      if (ratingB !== ratingA) {
        return ratingB - ratingA;
      }
      return (b.item.releaseYear || 0) - (a.item.releaseYear || 0);
    });

    // Secondary safety deduplication pass on sorted results to guarantee zero duplicate titles
    const seenResultKeys = new Set<string>();
    const deduplicatedResults: SearchQueryResult[] = [];

    for (const res of sortedResults) {
      const netflixId = res.item.netflixId || res.item.videoId;
      const imdbId = res.item.imdbId;
      const tmdbId = res.item.tmdbId;
      const collapsed = res.item.collapsedTitle || collapseTitle(res.item.title);
      const mediaType = res.item.mediaType;
      const year = res.item.releaseYear ? String(res.item.releaseYear) : '';

      const idKeys = [
        netflixId ? `netflix_${netflixId}` : null,
        imdbId ? `imdb_${imdbId}` : null,
        tmdbId ? `tmdb_${mediaType}_${tmdbId}` : null,
        collapsed && year ? `title_${collapsed}_${mediaType}_${year}` : null,
        collapsed ? `title_${collapsed}_${mediaType}` : null,
        collapsed ? `title_${collapsed}` : null,
      ].filter(Boolean) as string[];

      const isDuplicate = idKeys.some((k) => seenResultKeys.has(k));
      if (isDuplicate) {
        continue;
      }

      for (const k of idKeys) {
        seenResultKeys.add(k);
      }
      deduplicatedResults.push(res);
    }

    // Check for "Did you mean?" suggestion
    const didYouMean = this.computeDidYouMeanSuggestion(titleQuery, deduplicatedResults);

    const resultLimit = maxResults !== undefined
      ? (maxResults > 0 ? maxResults : deduplicatedResults.length)
      : SEARCH_CONFIG.MAX_RESULTS;

    return {
      results: deduplicatedResults.slice(0, resultLimit),
      didYouMean,
      totalMatches: deduplicatedResults.length,
      parsedQuery: parsed,
    };
  }

  /**
   * Computes an automated "Did you mean?" suggestion if:
   * 1. No exact title matches exist.
   * 2. The top candidate has high fuzzy similarity (>= DID_YOU_MEAN_MIN_CONFIDENCE).
   * 3. The candidate title is different from what was typed.
   * 4. Discards gibberish (e.g. 'xyzabc123').
   */
  private computeDidYouMeanSuggestion(
    queryTitle: string,
    results: SearchQueryResult[]
  ): DidYouMeanSuggestion | null {
    const cleanQ = queryTitle.trim().toLowerCase();
    const collQ = collapseTitle(queryTitle);
    if (cleanQ.length < 3) return null;

    // Check if there is already an exact match in results
    const hasExact = results.some(
      (r) =>
        r.isExactMatch ||
        r.item.title.toLowerCase() === cleanQ ||
        r.item.normalizedPrimaryTitle === cleanQ ||
        r.item.collapsedTitle === collQ ||
        r.item.collapsedPrimaryTitle === collQ
    );
    if (hasExact) {
      return null;
    }

    // Check top candidate
    if (results.length === 0) {
      return null;
    }

    const top = results[0];
    const topTitle = top.item.title;
    const topPrimary = top.item.primaryTitle;
    const topLower = topTitle.toLowerCase();

    // If top candidate is identical to query, no correction needed
    if (topLower === cleanQ || topPrimary.toLowerCase() === cleanQ) {
      return null;
    }

    // Calculate similarity against full title, primary title, and individual words
    const simFull = this.calculateStringSimilarity(cleanQ, topLower);
    const simPrimary = this.calculateStringSimilarity(collQ, top.item.collapsedPrimaryTitle);
    const distPrimary = damerauLevenshtein(collQ, top.item.collapsedPrimaryTitle);
    const hasCloseWordMatch = top.item.titleWords.some((w) => damerauLevenshtein(collQ, collapseTitle(w)) <= 1);

    const isMatch =
      distPrimary <= 2 ||
      hasCloseWordMatch ||
      simPrimary >= SEARCH_CONFIG.DID_YOU_MEAN_MIN_CONFIDENCE ||
      simFull >= SEARCH_CONFIG.DID_YOU_MEAN_MIN_CONFIDENCE;

    if (isMatch) {
      return {
        suggestedTitle: topTitle,
        originalQuery: queryTitle,
        confidence: Math.max(simFull, simPrimary, 0.85),
        item: top.item,
      };
    }

    return null;
  }

  /**
   * Fast Bigram Sorensen-Dice similarity metric between two strings (0 to 1)
   */
  private calculateStringSimilarity(s1: string, s2: string): number {
    const str1 = normalizeForSearch(s1).replace(/\s+/g, '');
    const str2 = normalizeForSearch(s2).replace(/\s+/g, '');

    if (str1 === str2) return 1.0;
    if (str1.length < 2 || str2.length < 2) {
      return str1 === str2 ? 1.0 : 0.0;
    }

    const bigrams1 = new Map<string, number>();
    for (let i = 0; i < str1.length - 1; i++) {
      const bigram = str1.substring(i, i + 2);
      bigrams1.set(bigram, (bigrams1.get(bigram) || 0) + 1);
    }

    let intersectionSize = 0;
    for (let i = 0; i < str2.length - 1; i++) {
      const bigram = str2.substring(i, i + 2);
      const count = bigrams1.get(bigram) || 0;
      if (count > 0) {
        bigrams1.set(bigram, count - 1);
        intersectionSize++;
      }
    }

    return (2.0 * intersectionSize) / (str1.length - 1 + str2.length - 1);
  }
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Global singleton instance for app-wide reuse
export const globalSearchEngine = new MovieSearchEngine();
