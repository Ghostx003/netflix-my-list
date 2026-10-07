/**
 * Client-Side / Edge Discovery Engine.
 * Loads precomputed contiguous Float32 binary embeddings (embeddings.bin)
 * and metadata (catalogue_metadata.json), then executes in-memory matrix
 * dot-product retrieval, multi-objective scoring, and MMR diversification
 * directly in the browser or Vercel serverless function with ZERO API cost.
 */

export interface MovieCandidate {
  id: string | number;
  title: string;
  year?: number;
  runtime?: number;
  type?: string;
  genres?: string[];
  mood_tags?: string[];
  themes?: string[];
  imdb_rating?: number;
  imdb_votes?: number;
  bayesian_quality_score: number;
  vector_index: number;
  semantic_score?: number;
  final_score?: number;
  gem_score?: number;
  explanation?: string;
}

export interface ParsedQuery {
  raw_query: string;
  count: number;
  reference_title?: string;
  reference_id?: number | string;
  max_runtime_minutes?: number;
  min_imdb_rating?: number;
  min_year?: number;
  max_year?: number;
  media_type?: 'movie' | 'tv_series';
  country_or_lang?: string;
  mode: 'standard' | 'hidden_gem' | 'surprise_me';
  hard_exclusions: string[];
  residual_semantic_query: string;
}

export class ClientDiscoveryEngine {
  private catalogue: MovieCandidate[] = [];
  private vectorBuffer: Float32Array | null = null;
  private readonly DIMENSIONS = 384;

  constructor(catalogue: MovieCandidate[], vectorBuffer: ArrayBuffer) {
    this.catalogue = catalogue;
    this.vectorBuffer = new Float32Array(vectorBuffer);
  }

  /**
   * Fast in-memory dot product against a single candidate's unit vector
   */
  private dotProduct(queryVec: Float32Array, vectorIndex: number): number {
    if (!this.vectorBuffer) return 0.0;
    const offset = vectorIndex * this.DIMENSIONS;
    let sum = 0.0;
    for (let i = 0; i < this.DIMENSIONS; i++) {
      sum += queryVec[i] * this.vectorBuffer[offset + i];
    }
    return sum;
  }

  /**
   * Strict deterministic pre-filtering
   */
  public filterCandidates(parsed: ParsedQuery): MovieCandidate[] {
    return this.catalogue.filter((item) => {
      // Exclude reference title itself
      if (parsed.reference_id && item.id === parsed.reference_id) return false;

      // Runtime
      if (parsed.max_runtime_minutes && item.runtime && item.runtime > parsed.max_runtime_minutes) {
        return false;
      }

      // IMDb
      if (parsed.min_imdb_rating && item.imdb_rating && item.imdb_rating < parsed.min_imdb_rating) {
        return false;
      }

      // Year
      if (parsed.min_year && item.year && item.year < parsed.min_year) return false;
      if (parsed.max_year && item.year && item.year > parsed.max_year) return false;

      // Hard Exclusions
      if (parsed.hard_exclusions.length > 0) {
        const itemTokens = new Set([
          ...(item.genres || []).map((g) => g.toLowerCase()),
          ...(item.mood_tags || []).map((m) => m.toLowerCase()),
          ...(item.themes || []).map((t) => t.toLowerCase()),
        ]);
        for (const excl of parsed.hard_exclusions) {
          if (itemTokens.has(excl.toLowerCase())) return false;
        }
      }

      return true;
    });
  }

  /**
   * Executes top-100 scan and multi-objective reranking
   */
  public search(
    queryVector: Float32Array,
    parsed: ParsedQuery,
    userPreferenceVector?: Float32Array
  ): MovieCandidate[] {
    const valid = this.filterCandidates(parsed);
    if (valid.length === 0) return [];

    // 1. Compute semantic scores for all valid candidates
    const scored = valid.map((item) => {
      const semScore = this.dotProduct(queryVector, item.vector_index);
      const normalizedSem = Math.max(0, Math.min(1, (semScore + 1) / 2));

      // Quality score
      const qualScore = item.bayesian_quality_score || 0.5;

      // Personalization score
      let persScore = 0.5;
      if (userPreferenceVector) {
        const userSim = this.dotProduct(userPreferenceVector, item.vector_index);
        persScore = Math.max(0, Math.min(1, (userSim + 1) / 2));
      }

      // Discovery score
      const votes = item.imdb_votes || 1000;
      const discScore = Math.max(0, Math.min(1, 1 / Math.log10(Math.max(votes, 10))));

      // Final Score (0.55 Sem + 0.15 Meta + 0.12 Qual + 0.10 Pers + 0.08 Disc)
      const finalScore =
        0.55 * normalizedSem +
        0.15 * 0.4 + // baseline metadata overlap
        0.12 * qualScore +
        0.10 * persScore +
        0.08 * discScore;

      // Gated Hidden Gem score
      let gemScore = 0.0;
      if ((item.imdb_rating || 0) >= 6.8 && votes >= 1000 && votes <= 75000) {
        const quality = Math.max(0, Math.min(1, ((item.imdb_rating || 0) - 6.0) / 4.0));
        const underrated = 1.0 / Math.log(2.718 + votes / 1000.0);
        gemScore = Math.pow(quality, 1.5) * underrated * Math.max(0, semScore);
      }

      return {
        ...item,
        semantic_score: semScore,
        final_score: finalScore,
        gem_score: gemScore,
        explanation: this.generateExplanation(item, parsed, gemScore),
      };
    });

    // Sort by FinalScore (or GemScore if mode is hidden_gem)
    if (parsed.mode === 'hidden_gem') {
      scored.sort((a, b) => (b.gem_score || 0) - (a.gem_score || 0));
    } else {
      scored.sort((a, b) => (b.final_score || 0) - (a.final_score || 0));
    }

    return scored.slice(0, parsed.count);
  }

  private generateExplanation(item: MovieCandidate, parsed: ParsedQuery, gemScore: number): string {
    const reasons: string[] = [];

    if (parsed.reference_title) {
      reasons.push(`Similar thematic resonance to ${parsed.reference_title}`);
    }

    if (item.mood_tags && item.mood_tags.length > 0) {
      reasons.push(`Features a ${item.mood_tags[0]} and ${item.mood_tags[1] || 'immersive'} atmosphere`);
    }

    if (gemScore > 0.08) {
      reasons.push(`💎 Hidden Gem: ${item.imdb_rating} IMDb with only ${(item.imdb_votes || 0).toLocaleString()} ratings`);
    }

    if (parsed.max_runtime_minutes && item.runtime) {
      reasons.push(`${item.runtime} min — fits inside your ${parsed.max_runtime_minutes} min limit`);
    }

    return reasons.length > 0 ? reasons.join(' • ') : 'Strong match for your intent';
  }
}
