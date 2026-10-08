import { groqService } from '../groqService';
import { analyzeQueryIntent, BENCHMARK_REFERENCE_PROFILES } from '../discoveryIntelligenceService';

export interface StructuredIntent {
  raw: string;
  intent: string;
  genres: string[];
  themes: string[];
  tone: string[];
  semantic_concepts: string[];
  reference_titles?: string[];
  disliked_concepts?: string[];
}

// In-memory cache for parsed prompts to prevent redundant calls
const intentCache = new Map<string, StructuredIntent>();

/**
 * Transforms a free-text custom preference prompt into a structured semantic representation.
 * Uses Qwen 27B on Groq when available, with deterministic NLP fallback.
 */
export async function parseCustomPreference(prompt: string): Promise<StructuredIntent> {
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) {
    return {
      raw: '',
      intent: 'general',
      genres: [],
      themes: [],
      tone: [],
      semantic_concepts: [],
    };
  }

  const cacheKey = cleanPrompt.toLowerCase();
  if (intentCache.has(cacheKey)) {
    return intentCache.get(cacheKey)!;
  }

  // 1. Try Qwen 27B via Groq
  if (groqService.isAvailable()) {
    try {
      const systemPrompt = `You are an expert film semantic ontology engine. Transform natural language user movie/TV preferences into structured JSON.
Return ONLY valid JSON matching this exact schema:
{
  "intent": string,
  "genres": string[],
  "themes": string[],
  "tone": string[],
  "semantic_concepts": string[],
  "reference_titles": string[],
  "disliked_concepts": string[]
}
Rules:
- Do not wrap in markdown quotes if possible, return strictly raw JSON.
- For queries like "detective type shit", return genres like ["Mystery", "Crime", "Thriller"], themes like ["Whodunit / Detective", "Dark Mystery", "Serial Killer"], tone like ["Suspenseful", "Gritty"], concepts like ["detective protagonist", "police investigation", "solving a crime"].
- For "something like Tenet", identify the core narrative concepts (time inversion, high concept sci-fi, espionage, complex nonlinear plot).
- Keep array values concise and canonical.`;

      const userMessage = `Preference: "${cleanPrompt}"`;

      const response = await groqService.chatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ], 0.1, 250);

      if (response) {
        // Extract JSON if model added prose or markdown code fence
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const result: StructuredIntent = {
            raw: cleanPrompt,
            intent: String(parsed.intent || cleanPrompt),
            genres: Array.isArray(parsed.genres) ? parsed.genres : [],
            themes: Array.isArray(parsed.themes) ? parsed.themes : [],
            tone: Array.isArray(parsed.tone) ? parsed.tone : [],
            semantic_concepts: Array.isArray(parsed.semantic_concepts) ? parsed.semantic_concepts : [],
            reference_titles: Array.isArray(parsed.reference_titles) ? parsed.reference_titles : [],
            disliked_concepts: Array.isArray(parsed.disliked_concepts) ? parsed.disliked_concepts : [],
          };
          intentCache.set(cacheKey, result);
          return result;
        }
      }
    } catch (err) {
      console.warn('[intentParser] Qwen parsing fallback:', err);
    }
  }

  // 2. High-speed Deterministic NLP Fallback
  const fallbackResult = deterministicIntentParser(cleanPrompt);
  intentCache.set(cacheKey, fallbackResult);
  return fallbackResult;
}

/**
 * Deterministic fallback mapping natural language expressions to structured concepts.
 */
function deterministicIntentParser(prompt: string): StructuredIntent {
  const p = prompt.toLowerCase();
  const genres: string[] = [];
  const themes: string[] = [];
  const tone: string[] = [];
  const concepts: string[] = [];
  const references: string[] = [];

  // Detective / Police / Crime
  if (p.includes('detective') || p.includes('cop') || p.includes('police') || p.includes('investigat') || p.includes('murder') || p.includes('clue') || p.includes('mystery')) {
    genres.push('Mystery', 'Crime', 'Thriller');
    themes.push('Whodunit / Detective', 'Dark Mystery', 'Serial Killer');
    tone.push('Suspenseful', 'Investigative', 'Gritty');
    concepts.push('detective protagonist', 'investigation', 'solving a case', 'murder mystery');
  }

  // Mind bending / Complex
  if (p.includes('mind') || p.includes('twist') || p.includes('complex') || p.includes('psychological') || p.includes('puzzle')) {
    genres.push('Sci-Fi', 'Thriller', 'Mystery');
    themes.push('Mind-Bending / Mind Game', 'Psychological');
    tone.push('Cerebral', 'Intense');
    concepts.push('nonlinear narrative', 'intellectual complexity', 'plot twists');
  }

  // Tenet / Interstellar / Reference Titles
  for (const [refKey, refData] of Object.entries(BENCHMARK_REFERENCE_PROFILES)) {
    if (p.includes(refKey)) {
      references.push(refKey);
      genres.push(...refData.genres);
      themes.push(...refData.themes);
      concepts.push(...refData.keywords.slice(0, 4));
    }
  }

  // Dark / Noir / Bleak
  if (p.includes('dark') || p.includes('bleak') || p.includes('gritty') || p.includes('gloomy')) {
    tone.push('Dark', 'Bleak', 'Gritty');
    themes.push('Dark Mystery');
  }

  // Fast / Adrenaline / Action
  if (p.includes('fast') || p.includes('action') || p.includes('heist') || p.includes('adrenaline')) {
    genres.push('Action', 'Crime', 'Thriller');
    themes.push('Heist / Con', 'Mob / Underworld');
    tone.push('Fast-Paced', 'Adrenaline');
  }

  // Cozy / Feel-Good / Comedy
  if (p.includes('feel good') || p.includes('cozy') || p.includes('comedy') || p.includes('heartwarming') || p.includes('wholesome')) {
    genres.push('Comedy', 'Romance', 'Drama');
    themes.push('Coming of Age', 'Family Drama');
    tone.push('Feel-Good', 'Lighthearted', 'Warm');
  }

  // Fallback: use discovery intelligence parser
  const legacyParsed = analyzeQueryIntent(prompt, []);
  for (const g of legacyParsed.genres) if (!genres.includes(g)) genres.push(g);
  for (const t of legacyParsed.themes) if (!themes.includes(t)) themes.push(t);
  for (const k of legacyParsed.contentTokens) if (!concepts.includes(k)) concepts.push(k);

  return {
    raw: prompt,
    intent: prompt,
    genres: Array.from(new Set(genres)),
    themes: Array.from(new Set(themes)),
    tone: Array.from(new Set(tone)),
    semantic_concepts: Array.from(new Set(concepts)),
    reference_titles: references,
  };
}
