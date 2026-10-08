/**
 * AI Search Intelligence & Spell Checker Service.
 * Powered by Qwen 28B (`qwen/qwen3.8-27b`) on Groq Cloud
 * coupled with local catalog semantic search intelligence.
 */

import { DiscoveryTitle, LibraryItem } from '../types';
import { groqService } from './groqService';
import {
  BENCHMARK_REFERENCE_PROFILES,
  queryCatalogIntelligence,
  ScoredTitleResult,
} from './discoveryIntelligenceService';

export interface AISearchAnalysis {
  query: string;
  correctedQuery: string;
  isTypo: boolean;
  didYouMean?: string;
  similarReferenceTitle?: string;
  vibe?: string;
  similarTitles: string[];
  semanticThemes: string[];
}

export interface SimilarRecommendationResult {
  title: DiscoveryTitle;
  matchReason: string;
  vibeBadge: string;
  similarityScore: number;
}

// In-memory cache for ultra-fast repeated queries
const aiAnalysisCache = new Map<string, AISearchAnalysis>();
const inFlightRequests = new Map<string, Promise<AISearchAnalysis | null>>();

/**
 * Normalizes query string for caching
 */
function normalizeKey(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Analyzes search query using Qwen 28B via Groq with instant local benchmark fallback.
 */
export async function analyzeSearchQueryWithQwen(rawQuery: string): Promise<AISearchAnalysis | null> {
  const clean = rawQuery.trim();
  const key = normalizeKey(clean);
  if (!key || key.length < 2) return null;

  // 1. Check memory cache
  if (aiAnalysisCache.has(key)) {
    return aiAnalysisCache.get(key)!;
  }

  // 2. Check in-flight duplicate requests
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key)!;
  }

  const promise = (async (): Promise<AISearchAnalysis | null> => {
    // Check if we have instant benchmark knowledge base profile (e.g. Tenet, Inception, Dark)
    const benchmark = BENCHMARK_REFERENCE_PROFILES[key];

    try {
      const prompt = `You are a film and television discovery engine with deep knowledge of streaming and Netflix catalogs.
Analyze this user search query: "${clean}".
1. Spell-check: If misspelled or a typo of an actor, movie, or series (e.g. "tenett" -> "Tenet", "stanger thing" -> "Stranger Things"), provide correctedQuery and set isTypo=true.
2. If the query refers to a specific movie or show, identify:
   - "similarReferenceTitle": the canonical title
   - "vibe": 4-8 words describing its cinematic style, mood, or concepts (e.g. "Mind-bending temporal espionage & high-stakes action")
   - "similarTitles": 4-6 widely known titles with the exact same vibe, DNA, or premise
   - "semanticThemes": 3-4 key themes
Respond ONLY with a valid JSON object matching this schema:
{
  "correctedQuery": "...",
  "isTypo": false,
  "didYouMean": "...",
  "similarReferenceTitle": "...",
  "vibe": "...",
  "similarTitles": ["...", "..."],
  "semanticThemes": ["...", "..."]
}`;

      const raw = await groqService.chatCompletion(
        [
          { role: 'system', content: 'You are a movie search intelligence and spell-checking assistant. Always respond in pure JSON.' },
          { role: 'user', content: prompt }
        ],
        0.1,
        350
      );

      if (raw) {
        // Strip markdown code fences if present
        const jsonStr = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonStr) as Partial<AISearchAnalysis>;

        const result: AISearchAnalysis = {
          query: clean,
          correctedQuery: parsed.correctedQuery || clean,
          isTypo: Boolean(parsed.isTypo),
          didYouMean: parsed.didYouMean || parsed.correctedQuery || undefined,
          similarReferenceTitle: parsed.similarReferenceTitle || (benchmark ? clean : undefined),
          vibe: parsed.vibe || benchmark?.vibe,
          similarTitles: Array.isArray(parsed.similarTitles) ? parsed.similarTitles : [],
          semanticThemes: Array.isArray(parsed.semanticThemes) ? parsed.semanticThemes : (benchmark?.themes || []),
        };

        aiAnalysisCache.set(key, result);
        return result;
      }
    } catch (err) {
      console.warn('[aiSearchIntelligence] Qwen 28B query analysis error, falling back to local intelligence:', err);
    }

    // 3. Fallback to local Benchmark Reference Profiles if Qwen call failed
    if (benchmark) {
      const fallbackResult: AISearchAnalysis = {
        query: clean,
        correctedQuery: clean,
        isTypo: false,
        didYouMean: clean,
        similarReferenceTitle: clean,
        vibe: benchmark.vibe,
        similarTitles: ['Inception', 'Interstellar', 'Dark', 'Arrival', 'Predestination'],
        semanticThemes: benchmark.themes,
      };
      aiAnalysisCache.set(key, fallbackResult);
      return fallbackResult;
    }

    return null;
  })();

  inFlightRequests.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlightRequests.delete(key);
  }
}

/**
 * Finds similar / "Tenet"-type titles in the Netflix catalog & active library
 * using Qwen 28B intelligence and semantic theme vectors.
 */
export function findSimilarCatalogTitles(
  analysis: AISearchAnalysis,
  catalog: DiscoveryTitle[],
  libraryItems: LibraryItem[],
  excludeQueryTitle?: string
): SimilarRecommendationResult[] {
  if (!analysis) return [];

  const combinedCatalog: DiscoveryTitle[] = [...catalog];
  const seenIds = new Set<string>(combinedCatalog.map(c => String(c.id)));

  // Add library items not in catalog
  for (const lib of libraryItems) {
    if (!seenIds.has(lib.id)) {
      combinedCatalog.push({
        id: lib.id,
        title: lib.externalTitle || lib.originalTitle,
        originalTitle: lib.originalTitle,
        mediaType: lib.mediaType === 'tv' ? 'tv' : 'movie',
        releaseYear: lib.releaseYear,
        rating: lib.imdbRating || lib.rating,
        imdbRating: lib.imdbRating,
        genres: lib.genres || [],
        countries: ['IN'],
        isNetflixIndiaVerified: true,
        synopsis: lib.synopsis || (lib as any).overview,
        posterPath: lib.posterPath,
        backdropPath: lib.backdropPath,
        netflixId: lib.videoId,
      });
      seenIds.add(lib.id);
    }
  }

  const queryNorm = normalizeKey(excludeQueryTitle || analysis.query);
  const refNorm = normalizeKey(analysis.similarReferenceTitle || '');
  const results: SimilarRecommendationResult[] = [];
  const addedTitleKeys = new Set<string>();

  // 1. Direct matches for AI-suggested similar titles (e.g. Inception, Dark, Interstellar)
  const targetSimilarNormalized = analysis.similarTitles.map(t => normalizeKey(t));

  for (const simTarget of targetSimilarNormalized) {
    if (!simTarget || simTarget === queryNorm || simTarget === refNorm) continue;

    // Find best match in catalog
    const matched = combinedCatalog.find(cat => {
      const catNorm = normalizeKey(cat.title);
      return catNorm === simTarget || catNorm.includes(simTarget) || simTarget.includes(catNorm);
    });

    if (matched && !addedTitleKeys.has(matched.id)) {
      results.push({
        title: matched,
        matchReason: analysis.vibe
          ? `Matches ${analysis.similarReferenceTitle || 'query'} vibe: ${analysis.vibe}`
          : `Shares theme DNA with ${analysis.similarReferenceTitle || 'query'}`,
        vibeBadge: analysis.semanticThemes[0] || 'Similar Vibe',
        similarityScore: 95,
      });
      addedTitleKeys.add(matched.id);
    }
  }

  // 2. Semantic intelligence scan across catalog using themes & vibe keywords
  if (results.length < 8 && (analysis.semanticThemes.length > 0 || analysis.vibe)) {
    const semanticQuery = [
      ...analysis.semanticThemes,
      analysis.vibe || '',
      `like ${analysis.similarReferenceTitle || analysis.query}`
    ].join(' ');

    try {
      const scoredCandidates = queryCatalogIntelligence(combinedCatalog, semanticQuery);

      for (const scored of scoredCandidates) {
        if (results.length >= 8) break;
        const catNorm = normalizeKey(scored.item.title);
        if (
          catNorm === queryNorm ||
          catNorm === refNorm ||
          addedTitleKeys.has(scored.item.id)
        ) {
          continue;
        }

        results.push({
          title: scored.item,
          matchReason: scored.explanation || `Thematic match: ${analysis.vibe || 'Related narrative'}`,
          vibeBadge: scored.badges[0] || analysis.semanticThemes[0] || 'Recommended',
          similarityScore: Math.round(scored.score * 100),
        });
        addedTitleKeys.add(scored.item.id);
      }
    } catch (e) {
      console.warn('[aiSearchIntelligence] Semantic catalog scoring fallback error:', e);
    }
  }

  return results;
}
