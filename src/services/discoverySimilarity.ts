import { DiscoveryTitle, LibraryItem } from '../types';

/**
 * Enhanced title similarity score calculation between two Discovery titles.
 * Factors:
 * 1. Theme overlap (Highest weight: themes define the mood, tone, and feel)
 * 2. Genre overlap (High weight: structural category)
 * 3. Rating boost (IMDb & Rotten Tomatoes caliber)
 * 4. Contextual affinity (Media type, language, country)
 */
export function computeTitleSimilarityScore(
  base: DiscoveryTitle,
  candidate: DiscoveryTitle
): number {
  if (base.id === candidate.id) return -1;
  if (base.netflixId && candidate.netflixId && base.netflixId === candidate.netflixId) return -1;

  let score = 0;

  // 1. THEMES OVERLAP (Highest priority: up to 50 points)
  const baseThemes = new Set((base.themes || []).map((t) => t.toLowerCase().trim()));
  const candThemes = new Set((candidate.themes || []).map((t) => t.toLowerCase().trim()));

  if (baseThemes.size > 0 && candThemes.size > 0) {
    let sharedThemeCount = 0;
    for (const t of baseThemes) {
      if (candThemes.has(t)) sharedThemeCount++;
    }

    if (sharedThemeCount >= 3) {
      score += 45;
    } else if (sharedThemeCount === 2) {
      score += 35;
    } else if (sharedThemeCount === 1) {
      score += 22;
    }

    const unionThemes = new Set([...baseThemes, ...candThemes]).size;
    const themeJaccard = unionThemes > 0 ? sharedThemeCount / unionThemes : 0;
    score += Math.round(themeJaccard * 10);
  } else if (base.tmdbKeywords && candidate.tmdbKeywords) {
    // Fallback keyword overlap if themes are sparse
    const baseKws = new Set(base.tmdbKeywords.map((k) => k.toLowerCase().trim()));
    const candKws = new Set(candidate.tmdbKeywords.map((k) => k.toLowerCase().trim()));
    let kwMatches = 0;
    for (const k of baseKws) {
      if (candKws.has(k)) kwMatches++;
    }
    score += Math.min(15, kwMatches * 3);
  }

  // 2. GENRE OVERLAP (High priority: up to 30 points)
  const baseGenres = new Set((base.genres || []).map((g) => g.toLowerCase().trim()));
  const candGenres = new Set((candidate.genres || []).map((g) => g.toLowerCase().trim()));

  if (baseGenres.size > 0 && candGenres.size > 0) {
    let sharedGenreCount = 0;
    for (const g of baseGenres) {
      if (candGenres.has(g)) sharedGenreCount++;
    }
    const unionGenres = new Set([...baseGenres, ...candGenres]).size;
    const genreJaccard = unionGenres > 0 ? sharedGenreCount / unionGenres : 0;
    score += genreJaccard * 26;

    // Bonus if candidate shares the first primary genre of base
    const firstBaseGenre = (base.genres[0] || '').toLowerCase().trim();
    if (firstBaseGenre && candGenres.has(firstBaseGenre)) {
      score += 4;
    }
  }

  // 3. RATINGS CALIBER & QUALITY BOOST (Up to 20 points)
  // Higher rated titles provide superior recommendation satisfaction
  if (candidate.imdbRating !== undefined && candidate.imdbRating > 0) {
    if (candidate.imdbRating >= 8.0) {
      score += 10;
    } else if (candidate.imdbRating >= 7.4) {
      score += 7;
    } else if (candidate.imdbRating >= 6.8) {
      score += 4;
    }
  }

  if (candidate.rottenTomatoesRating !== undefined && candidate.rottenTomatoesRating > 0) {
    if (candidate.rottenTomatoesRating >= 85) {
      score += 10;
    } else if (candidate.rottenTomatoesRating >= 75) {
      score += 7;
    } else if (candidate.rottenTomatoesRating >= 60) {
      score += 4;
    }
  }

  // If both base and candidate share strong ratings, give synergy bonus
  const baseAvgRating = (base.imdbRating ? base.imdbRating * 10 : 0) || (base.rating ? base.rating * 10 : 0);
  const candAvgRating = (candidate.imdbRating ? candidate.imdbRating * 10 : 0) || (candidate.rating ? candidate.rating * 10 : 0);
  if (baseAvgRating >= 72 && candAvgRating >= 72) {
    score += 4;
  }

  // 4. CONTEXTUAL AFFINITY (Up to 15 points)
  // Media type preference (movie for movie, tv for tv)
  if (base.mediaType === candidate.mediaType) {
    score += 5;
  }

  // Original language match
  if (base.originalLanguage && candidate.originalLanguage && base.originalLanguage === candidate.originalLanguage) {
    score += 5;
  }

  // Country match
  const baseOriginCountry = (base.watchmodeOriginCountry || base.tmdbOriginCountry || (base.countries && base.countries[0]) || '').toLowerCase();
  const candOriginCountry = (candidate.watchmodeOriginCountry || candidate.tmdbOriginCountry || (candidate.countries && candidate.countries[0]) || '').toLowerCase();
  if (baseOriginCountry && candOriginCountry && baseOriginCountry === candOriginCountry) {
    score += 5;
  }

  return score;
}

export interface SimilarTitleResult {
  item: DiscoveryTitle;
  matchPercentage: number;
}

export interface FindSimilarTitlesOptions {
  limit?: number;
  libraryItems?: LibraryItem[];
  ignoredTitleIds?: string[];
}

/**
 * Builds exclusion keys from library items for:
 * - Watched: viewingStatus === 'completed' || isCompleted === true
 * - Dropped: viewingStatus === 'dropped' || droppedReason
 * - Watching / in watching list: viewingStatus === 'still_watching'
 */
function buildExclusionKeys(libraryItems: LibraryItem[] = []) {
  const excludedKeys = new Set<string>();

  for (const item of libraryItems) {
    const isWatched = item.viewingStatus === 'completed' || (item as any).isCompleted === true;
    const isDropped = item.viewingStatus === 'dropped' || !!(item as any).droppedReason;
    const isWatching = item.viewingStatus === 'still_watching';

    // Must exclude: watched, dropped, watching
    if (isWatched || isDropped || isWatching) {
      if (item.id) excludedKeys.add(item.id.toLowerCase());
      if (item.videoId) excludedKeys.add(`vid_${item.videoId}`);
      if (item.externalId) excludedKeys.add(`ext_${item.externalId}`);
      if (item.imdbId) excludedKeys.add(`imdb_${item.imdbId}`);
      const normTitle = (item.externalTitle || item.originalTitle || item.normalizedTitle || '').toLowerCase().trim();
      if (normTitle) excludedKeys.add(normTitle);
    }
  }

  return excludedKeys;
}

/**
 * Helper to check if a discovery title is excluded by matching any of its keys
 */
function isTitleExcluded(
  candidate: DiscoveryTitle,
  excludedKeys: Set<string>,
  ignoredIdSet: Set<string>
): boolean {
  // Check ignored IDs
  if (candidate.id && ignoredIdSet.has(candidate.id)) return true;
  if (candidate.netflixId && ignoredIdSet.has(candidate.netflixId)) return true;

  // Check excluded keys (watched, dropped, or still watching in library)
  if (candidate.id && excludedKeys.has(candidate.id.toLowerCase())) return true;
  if (candidate.netflixId && excludedKeys.has(`vid_${candidate.netflixId}`)) return true;
  if (candidate.tmdbId && excludedKeys.has(`ext_${candidate.tmdbId}`)) return true;
  if (candidate.imdbId && excludedKeys.has(`imdb_${candidate.imdbId}`)) return true;

  const normTitle = (candidate.title || '').toLowerCase().trim();
  if (normTitle && excludedKeys.has(normTitle)) return true;

  return false;
}

/**
 * Finds the top N similar titles from the Netflix India catalog for a given title.
 * 
 * Strict constraints:
 * - ONLY recommends titles available on Netflix India
 * - EXCLUDES titles that are:
 *   - Watched (completed)
 *   - Dropped
 *   - In watching list (still_watching)
 *   - Ignored (hidden by user)
 * - Uses themes, ratings, and genres for optimal similarity scoring
 */
export function findLocalSimilarTitles(
  target: DiscoveryTitle,
  allCatalogTitles: DiscoveryTitle[],
  optionsOrLimit: FindSimilarTitlesOptions | number = 6
): SimilarTitleResult[] {
  const options: FindSimilarTitlesOptions =
    typeof optionsOrLimit === 'number' ? { limit: optionsOrLimit } : optionsOrLimit;

  const limit = options.limit || 6;
  const libraryItems = options.libraryItems || [];

  // 1. Gather ignored IDs (from options + localStorage fallback)
  const ignoredIdSet = new Set<string>(options.ignoredTitleIds || []);
  try {
    const rawStoredIgnored = localStorage.getItem('netflix_discovery_ignored_titles');
    if (rawStoredIgnored) {
      const parsed = JSON.parse(rawStoredIgnored);
      if (Array.isArray(parsed)) {
        parsed.forEach((id) => ignoredIdSet.add(String(id)));
      }
    }
  } catch {
    // Ignore storage parse errors
  }

  // 2. Build set of excluded keys (watched, dropped, watching)
  const excludedKeys = buildExclusionKeys(libraryItems);

  // 3. Filter candidates
  const validCandidates = allCatalogTitles.filter((cand) => {
    // Cannot be self
    if (cand.id === target.id) return false;
    if (cand.netflixId && target.netflixId && cand.netflixId === target.netflixId) return false;

    // Must be available on Netflix India
    if (cand.availabilityState === 'no_longer_available') return false;
    if (cand.isNetflixIndiaVerified === false) return false;

    // Filter out watched, dropped, watching, or ignored
    if (isTitleExcluded(cand, excludedKeys, ignoredIdSet)) {
      return false;
    }

    return true;
  });

  // 4. Score and sort candidates
  const scored = validCandidates
    .map((candidate) => {
      const rawScore = computeTitleSimilarityScore(target, candidate);
      // Normalized match percentage between 68% and 98%
      const clamped = Math.min(100, Math.max(10, rawScore));
      const matchPercentage = Math.min(98, Math.max(68, Math.round(58 + (clamped / 100) * 40)));
      return {
        item: candidate,
        rawScore,
        matchPercentage,
      };
    })
    .filter((entry) => entry.rawScore > 10) // Filter out unrelated titles
    .sort((a, b) => b.rawScore - a.rawScore);

  return scored.slice(0, limit).map((e) => ({
    item: e.item,
    matchPercentage: e.matchPercentage,
  }));
}
