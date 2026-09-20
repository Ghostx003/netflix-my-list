import { DiscoveryTitle } from '../types';

/**
 * Local similarity score calculation between two Discovery titles.
 * Factors:
 * 1. MediaType matching (movies with movies, series with series)
 * 2. Genre overlap (Jaccard similarity weighted)
 * 3. Theme overlap (High weight)
 * 4. Keyword overlap (Medium weight)
 * 5. Language matching (Same original language gives a boost)
 * 6. Country matching (Same origin country gives a boost)
 */
export function computeTitleSimilarityScore(
  base: DiscoveryTitle,
  candidate: DiscoveryTitle
): number {
  if (base.id === candidate.id) return -1;

  let score = 0;

  // 1. Media type preference (prefer same type, slight bonus)
  if (base.mediaType === candidate.mediaType) {
    score += 5;
  }

  // 2. Genre overlap (up to 40 points)
  const baseGenres = new Set(base.genres || []);
  const candGenres = new Set(candidate.genres || []);
  if (baseGenres.size > 0 && candGenres.size > 0) {
    let intersection = 0;
    for (const g of baseGenres) {
      if (candGenres.has(g)) intersection++;
    }
    const union = new Set([...baseGenres, ...candGenres]).size;
    const jaccard = union > 0 ? intersection / union : 0;
    score += jaccard * 40;
  }

  // 3. Theme overlap (up to 30 points)
  const baseThemes = new Set(base.themes || []);
  const candThemes = new Set(candidate.themes || []);
  if (baseThemes.size > 0 && candThemes.size > 0) {
    let intersection = 0;
    for (const t of baseThemes) {
      if (candThemes.has(t)) intersection++;
    }
    const union = new Set([...baseThemes, ...candThemes]).size;
    const jaccard = union > 0 ? intersection / union : 0;
    score += jaccard * 30;
  }

  // 4. Keyword overlap (up to 15 points)
  const baseKws = new Set((base.tmdbKeywords || []).map((k) => k.toLowerCase()));
  const candKws = new Set((candidate.tmdbKeywords || []).map((k) => k.toLowerCase()));
  if (baseKws.size > 0 && candKws.size > 0) {
    let matchCount = 0;
    for (const k of baseKws) {
      if (candKws.has(k)) matchCount++;
    }
    score += Math.min(15, matchCount * 3);
  }

  // 5. Language matching (5 points)
  if (base.originalLanguage && candidate.originalLanguage && base.originalLanguage === candidate.originalLanguage) {
    score += 5;
  }

  // 6. Country matching (5 points)
  const baseCountries = new Set(base.countries || []);
  const candCountries = new Set(candidate.countries || []);
  for (const c of baseCountries) {
    if (candCountries.has(c)) {
      score += 5;
      break;
    }
  }

  return score;
}

export interface SimilarTitleResult {
  item: DiscoveryTitle;
  matchPercentage: number;
}

/**
 * Finds the top N similar titles from the local Netflix catalog for a given title,
 * returning the item along with its normalized match percentage.
 */
export function findLocalSimilarTitles(
  target: DiscoveryTitle,
  allCatalogTitles: DiscoveryTitle[],
  limit: number = 4
): SimilarTitleResult[] {
  const scored = allCatalogTitles
    .filter((t) => t.id !== target.id)
    .map((candidate) => {
      const rawScore = computeTitleSimilarityScore(target, candidate);
      // Normalize raw score (max ~100) to a realistic 60% - 98% match range for high relevance
      const clamped = Math.min(100, Math.max(10, rawScore));
      const matchPercentage = Math.round(55 + (clamped / 100) * 43);
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
