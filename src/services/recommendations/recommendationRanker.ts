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
    candidate_titles: subsetToRank.map((c) => {
      const salientParams = Object.entries(c.item.parameters_100 || {})
        .filter(([_, v]) => typeof v === 'number' && v >= 0.55)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 5)
        .map(([k, v]) => `${k.replace(/_/g, ' ')} (${Math.round((v as number) * 100)}%)`);

      return {
        id: String(c.item.id),
        title: c.item.title,
        year: c.item.releaseYear,
        media_type: c.item.mediaType,
        genres: c.item.genres,
        themes: c.item.themes,
        moods: c.item.moods,
        story_pace: c.item.storyPace,
        ending_type: c.item.endingType,
        setting: c.item.settingEnvironment,
        time_period: c.item.timePeriod,
        audience_vibe: c.item.audienceVibe,
        narrative_archetypes: c.item.narrativeArchetypes,
        top_narrative_dimensions: salientParams.length > 0 ? salientParams : undefined,
        synopsis: (c.item.synopsis || '').slice(0, 180),
        current_score: c.score,
      };
    }),
  };

  try {
    const prompt = `SYSTEM: You are Qwen 28B, the Netflix India Deep Recommendation Reasoning Engine.
You evaluate candidate movies and series enriched from our 100-parameter SQLite Knowledge Base.
Each title contains verified narrative dimensions: story_pace, ending_type, setting, audience_vibe, narrative_archetypes, and top_narrative_dimensions.

Your mission:
1. Re-rank candidate titles to best satisfy the user's specific requests and taste profile by matching story DNA, emotional tone, and narrative dynamics (not just surface-level genre tags).
2. DO NOT invent titles or IDs. ONLY use IDs from the candidate list.
3. Assign a score between 0.00 and 1.00 based on deep narrative relevance.
4. For each recommended title, generate a punchy, insightful reason (max 18 words) explaining the story alignment (e.g., "Relentless thriller pace with a twist ending matching your craving for high stakes").
5. List key matched preference dimensions in matched_preferences.

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
