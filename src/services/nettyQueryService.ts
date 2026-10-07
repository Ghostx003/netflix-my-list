/**
 * Browser-side fast query parser and embedding simulation.
 * Parses natural language queries into structured hard filters,
 * reference titles, and generates 384-dimensional unit query vectors
 * with stochastic temperature/noise to ensure fresh, unique answers every time.
 */

import { ParsedQuery } from './clientDiscoveryEngine';

export function parseNaturalLanguageQuery(rawQuery: string): ParsedQuery {
  const text = rawQuery.trim();

  const parsed: ParsedQuery = {
    raw_query: rawQuery,
    count: 10,
    mode: 'standard',
    hard_exclusions: [],
    residual_semantic_query: '',
  };

  // 1. Mode Detection
  if (/\b(underrated|hidden\s*gems?|overlooked|underappreciated)\b/i.test(text)) {
    parsed.mode = 'hidden_gem';
  } else if (/\b(surprise\s*me|unexpected|wildcard|adventurous)\b/i.test(text)) {
    parsed.mode = 'surprise_me';
  }

  // 2. Count extraction ("give me 10", "top 5", "exactly 7", "find 8")
  const countMatch = text.match(/\b(?:give\s*me|find(?:\s*me)?|top|exactly|recommend)?\s*(\d+)\s*(?:movies?|shows?|films?|titles?|thrillers?|comedies?|\b)/i);
  if (countMatch) {
    const val = parseInt(countMatch[1], 10);
    if (val >= 1 && val <= 50) {
      parsed.count = val;
    }
  }

  // 3. Runtime extraction ("under 2 hours", "90 minutes", "under 120 mins")
  const hourMatch = text.match(/\b(?:under|less\s*than|max|within|around)\s*(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
  if (hourMatch) {
    parsed.max_runtime_minutes = Math.round(parseFloat(hourMatch[1]) * 60);
  } else {
    const minMatch = text.match(/\b(?:under|less\s*than|max|within|I\s*have)\s*(\d+)\s*(?:minutes?|mins?|m)\b/i);
    if (minMatch) {
      parsed.max_runtime_minutes = parseInt(minMatch[1], 10);
    }
  }

  // 4. IMDb Rating ("above 7.5", "rating over 8")
  const ratingMatch = text.match(/\b(?:imdb|rating|rated)?\s*(?:above|over|>|at\s*least)\s*(\d+(?:\.\d+)?)\b/i);
  if (ratingMatch) {
    const r = parseFloat(ratingMatch[1]);
    if (r >= 1 && r <= 10) {
      parsed.min_imdb_rating = r;
    }
  }

  // 5. Media type
  if (/\b(shows?|tv\s*series|series|seasons?)\b/i.test(text)) {
    parsed.media_type = 'tv_series';
  } else if (/\b(movies?|films?)\b/i.test(text)) {
    parsed.media_type = 'movie';
  }

  // 6. Year / Decade
  const decadeMatch = text.match(/\b(\d{2})s\b/i);
  if (decadeMatch) {
    const dec = parseInt(decadeMatch[1], 10);
    const fullYear = dec >= 30 ? 1900 + dec : 2000 + dec;
    parsed.min_year = fullYear;
    parsed.max_year = fullYear + 9;
  }

  // 7. Hard exclusions ("not horror", "no comedy", "without gore")
  const exclMatches = text.matchAll(/\b(?:not|without|no|except)\s+([a-zA-Z\s]+?)(?:$|\b(?:under|with|above|and|released)\b)/gi);
  for (const m of exclMatches) {
    const terms = m[1].split(/\s+(?:or|and)\s+|,/);
    for (const t of terms) {
      const clean = t.trim().toLowerCase();
      if (clean && !['a', 'the', 'any', 'too'].includes(clean)) {
        parsed.hard_exclusions.push(clean);
      }
    }
  }

  // 8. Residual semantic query
  let residual = text
    .replace(/\b(?:give\s*me|find(?:\s*me)?|top|exactly|recommend)\s*\d+\b/gi, ' ')
    .replace(/\b(?:under|less\s*than|max|within|I\s*have)?\s*\d+(?:\.\d+)?\s*(?:hours?|hrs?|minutes?|mins?|m|h)\b/gi, ' ')
    .replace(/\b(?:imdb|rating|rated)?\s*(?:above|over|>|at\s*least)\s*\d+(?:\.\d+)?\b/gi, ' ')
    .replace(/\b(?:movies?|shows?|films?|series)\b/gi, ' ')
    .replace(/[,;:.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  parsed.residual_semantic_query = residual || text;

  return parsed;
}

/**
 * Creates a deterministic 384-dimensional query vector from text tokens,
 * blended with a stochastic temperature/noise vector so repeat requests
 * yield fresh, unique, diversified sets of movies.
 */
export function createQueryEmbedding(text: string, dimensions = 384, diversityTemperature = 0.25): Float32Array {
  const vec = new Float32Array(dimensions);
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

  // Token hash projection
  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = (hash << 5) - hash + word.charCodeAt(i);
      hash |= 0;
    }
    const seed = Math.abs(hash);
    for (let d = 0; d < dimensions; d++) {
      // Deterministic pseudo-random projection
      const pseudo = Math.sin(seed * (d + 1)) * 10000;
      vec[d] += (pseudo - Math.floor(pseudo)) * 2 - 1;
    }
  }

  // Stochastic Exploration Injection (unique answers on every search query)
  if (diversityTemperature > 0) {
    for (let d = 0; d < dimensions; d++) {
      const noise = (Math.random() * 2 - 1) * diversityTemperature;
      vec[d] += noise;
    }
  }

  // L2 unit normalization
  let norm = 0;
  for (let d = 0; d < dimensions; d++) {
    norm += vec[d] * vec[d];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let d = 0; d < dimensions; d++) {
      vec[d] /= norm;
    }
  }

  return vec;
}
