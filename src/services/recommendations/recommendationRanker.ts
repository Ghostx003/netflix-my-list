import { RecommendationCandidate, UserTasteProfile } from '../../types';
import { groqService } from '../groqService';

export interface RerankRequest {
  userProfile: UserTasteProfile;
  customRequests: string[];
  candidates: RecommendationCandidate[];
}

/**
 * Uses Qwen 27B on Groq to re-rank and enrich explanations for the top 15-25 candidates.
 * Enforces strict validation:
 * - Only IDs provided in the candidate list can be returned.
 * - If parsing fails or Qwen is unavailable, safely preserves the input candidates.
 */
export async function rankAndExplainWithQwen(
  candidates: RecommendationCandidate[],
  userProfile: UserTasteProfile,
  customRequests: string[]
): Promise<RecommendationCandidate[]> {
  if (candidates.length === 0) return candidates;
  if (!groqService.isAvailable() || customRequests.length === 0) {
    return candidates;
  }

  // Only send the top 20 candidates to conserve context and maximize speed
  const subsetToRank = candidates.slice(0, 20);
  const candidateLookup = new Map<string, RecommendationCandidate>();
  for (const c of subsetToRank) {
    candidateLookup.set(String(c.item.id), c);
  }

  const payload = {
    user_top_genres: userProfile.topGenres,
    user_top_themes: userProfile.topThemes,
    custom_requests: customRequests,
    candidate_titles: subsetToRank.map((c) => ({
      id: String(c.item.id),
      title: c.item.title,
      genres: c.item.genres,
      themes: c.item.themes,
      synopsis: (c.item.synopsis || '').slice(0, 140),
      current_score: c.score,
    })),
  };

  try {
    const prompt = `SYSTEM: You are a Netflix recommendation reasoning engine.
Your job is to evaluate and re-rank the provided candidate movies/TV shows based on the user's specific custom requests and taste profile.
DO NOT invent titles. DO NOT invent IDs. You MUST ONLY use IDs from the candidate list.
Prioritize narrative relevance to the user's custom requests over generic popularity.

Return strictly raw JSON conforming to this schema:
{
  "recommendations": [
    {
      "id": "string (matching candidate id)",
      "score": number (0.00 to 1.00),
      "reason": "Short concise punchy explanation (max 18 words) of why it fits the request",
      "matched_preferences": ["concept1", "concept2"]
    }
  ]
}

Input data:
${JSON.stringify(payload)}`;

    const response = await groqService.chatCompletion(
      [
        { role: 'system', content: 'You are a movie recommendation reasoning engine. Output strictly raw JSON.' },
        { role: 'user', content: prompt },
      ],
      0.15,
      600
    );

    if (!response) return candidates;

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return candidates;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed || !Array.isArray(parsed.recommendations)) return candidates;

    const rankedSubset: RecommendationCandidate[] = [];
    const seenIds = new Set<string>();

    for (const rec of parsed.recommendations) {
      const idStr = String(rec.id);
      if (candidateLookup.has(idStr) && !seenIds.has(idStr)) {
        seenIds.add(idStr);
        const original = candidateLookup.get(idStr)!;
        const llmScore = typeof rec.score === 'number' ? Math.max(0, Math.min(1, rec.score)) : original.score;
        
        // Blend original deterministic score (40%) and LLM semantic judgment (60%)
        const blendedScore = Math.round((original.score * 0.4 + llmScore * 0.6) * 100) / 100;

        rankedSubset.push({
          ...original,
          score: blendedScore,
          matchPercentage: Math.round(blendedScore * 100),
          reason: typeof rec.reason === 'string' && rec.reason.length > 5 ? rec.reason : original.reason,
          matchedPreferences: Array.isArray(rec.matched_preferences) && rec.matched_preferences.length > 0
            ? rec.matched_preferences
            : original.matchedPreferences,
        });
      }
    }

    // Append any candidates that weren't returned by LLM to maintain catalog depth
    for (const c of subsetToRank) {
      if (!seenIds.has(String(c.item.id))) {
        rankedSubset.push(c);
      }
    }

    // Sort by blended score
    rankedSubset.sort((a, b) => b.score - a.score);

    // Reattach remaining candidates beyond top 20
    return [...rankedSubset, ...candidates.slice(20)];
  } catch (err) {
    console.warn('[QwenRanker] Reasoning fallback to deterministic ranking:', err);
    return candidates;
  }
}
