import { TrailerInfo, MediaType } from '../types';
import { getCachedMetadata, setCachedMetadata } from './db';

/**
 * Searches YouTube for trailer or review with Hindi priority or English priority.
 * Uses public, reliable CORS-enabled YouTube API mirrors.
 */
const YOUTUBE_SEARCH_ENDPOINTS = [
  'https://api.piped.private.coffee/search',
  'https://pipedapi.ducks.party/search',
];

export interface SearchTrailerOptions {
  skipCache?: boolean;
  excludeVideoIds?: string[];
  alternativeOffset?: number;
  regionalLanguage?: string;
}

/**
 * Explicit disallowed patterns for official trailers.
 * NEVER play reviews, critic reviews, reaction videos, explanations, fan edits, clips, or unrelated videos as trailers.
 */
export const NEGATIVE_TRAILER_PATTERNS = [
  /\breviews?\b/i,
  /\bcritics?\b/i,
  /\breactions?\b/i,
  /\bexplained\b/i,
  /\bexplanation\b/i,
  /\bending\s+explained\b/i,
  /\bbreakdown\b/i,
  /\beaster\s+eggs\b/i,
  /\bscenes?\b/i,
  /\bclips?\b/i,
  /\ball\s+scenes\b/i,
  /\bbest\s+scenes\b/i,
  /\bfan\s*made\b/i,
  /\bfan\s*edit\b/i,
  /\bconcept\b/i,
  /\bconcept\s+trailer\b/i,
  /\bbehind\s+the\s+scenes\b/i,
  /\bbts\b/i,
  /\bblooper\b/i,
  /\binterview\b/i,
  /\broast\b/i,
  /\bspoilers?\b/i,
  /\bfull\s+movie\b/i,
  /\bfull\s+episode\b/i,
  /\bsongs?\b/i,
  /\bjukebox\b/i,
  /\baudio\s+track\b/i,
  /\bost\b/i,
  /\brecap\b/i,
  /\bstory\s+recap\b/i,
  /\bparody\b/i,
  /\bbox\s+office\b/i,
  /\bpublic\s+reaction\b/i,
  /\baudience\s+reaction\b/i,
  /\bfirst\s+look\s+review\b/i,
  /\bhonest\s+review\b/i,
  /\bmovie\s+talk\b/i,
  /\bdiscussion\b/i,
  /\bpodcast\b/i,
  /\bteaser\s+breakdown\b/i,
  /\btrailer\s+breakdown\b/i,
  /\btrailer\s+reaction\b/i,
];

export function isDisallowedTrailerTitle(title: string): boolean {
  if (!title) return true;
  return NEGATIVE_TRAILER_PATTERNS.some((p) => p.test(title));
}

export function isValidOfficialTrailerCandidate(item: { title: string; uploaderName?: string }): boolean {
  if (!item.title) return false;
  // Disqualify any review, breakdown, clip, reaction, fan-edit, etc.
  if (isDisallowedTrailerTitle(item.title)) return false;
  // Must be an actual trailer or teaser
  const hasTrailerMarker = /\b(trailer|teaser)\b/i.test(item.title);
  if (!hasTrailerMarker) return false;
  return true;
}

function isHindiMatch(title: string, desc?: string, channel?: string): boolean {
  const combined = `${title} ${desc || ''} ${channel || ''}`.toLowerCase();
  return (
    combined.includes('hindi') ||
    combined.includes('हिंदी') ||
    combined.includes('netflix india') ||
    combined.includes('hindi dub') ||
    combined.includes('in hindi')
  );
}

function isRegionalMatch(title: string, langName: string, desc?: string, channel?: string): boolean {
  const combined = `${title} ${desc || ''} ${channel || ''}`.toLowerCase();
  return combined.includes(langName.toLowerCase());
}

/**
 * Search YouTube trailer adhering to strict selection priority:
 * 1. Official trailer
 * 2. Officially dubbed trailer, preferably Hindi when available
 * 3. English official trailer
 * 4. Official trailer in the appropriate regional language
 *
 * NEVER plays reviews, reaction videos, or clips.
 */
export async function searchYouTubeTrailer(
  title: string,
  year?: number,
  mediaType?: MediaType | string,
  preferredLanguage: 'hi' | 'en' = 'hi',
  options?: SearchTrailerOptions
): Promise<TrailerInfo | null> {
  const cleanTitle = title.replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
  const cacheKey = `yt_trailer_${cleanTitle.toLowerCase()}_${year || ''}_${preferredLanguage}`;
  const excludeSet = new Set(options?.excludeVideoIds || []);

  // Check local cache if not skipping
  if (!options?.skipCache && excludeSet.size === 0) {
    const cached = (await getCachedMetadata(cacheKey)) as TrailerInfo | null;
    if (cached && !excludeSet.has(cached.key) && !isDisallowedTrailerTitle(cached.name || '')) {
      return cached;
    }
  }

  // Helper to test list of candidates against strict criteria
  const findValidCandidate = (
    candidates: RawCandidate[],
    validator?: (item: RawCandidate) => boolean
  ): RawCandidate | null => {
    for (const item of candidates) {
      if (excludeSet.has(item.videoId)) continue;
      if (!isValidOfficialTrailerCandidate(item)) continue;
      if (validator && !validator(item)) continue;
      return item;
    }
    return null;
  };

  // 1. PRIORITY 1 & 2: Hindi official or officially dubbed trailer (if preferred)
  if (preferredLanguage === 'hi') {
    const hindiQueries = [
      `${cleanTitle} official hindi trailer`.replace(/\s+/g, ' ').trim(),
      `${cleanTitle} hindi trailer ${year || ''}`.replace(/\s+/g, ' ').trim(),
      `${cleanTitle} hindi dubbed official trailer`.replace(/\s+/g, ' ').trim(),
      `${cleanTitle} netflix india trailer`.replace(/\s+/g, ' ').trim(),
      `${cleanTitle} hindi trailer`.replace(/\s+/g, ' ').trim(),
    ];

    for (const q of hindiQueries) {
      const candidates = await fetchSearchCandidates(q, excludeSet);
      const match = findValidCandidate(candidates, (item) =>
        isHindiMatch(item.title, item.shortDescription, item.uploaderName)
      );
      if (match) {
        const trailer: TrailerInfo = {
          id: match.videoId,
          key: match.videoId,
          name: match.title || `${cleanTitle} Hindi Trailer`,
          site: 'YouTube',
          type: 'Trailer',
          language: 'hi',
          isOfficial: true,
          isHindiFallback: false,
        };
        if (excludeSet.size === 0) await setCachedMetadata(cacheKey, trailer);
        return trailer;
      }
    }
  }

  // 2. PRIORITY 3: English official trailer
  const englishQueries = [
    `${cleanTitle} ${year || ''} official trailer`.replace(/\s+/g, ' ').trim(),
    `${cleanTitle} official trailer`.replace(/\s+/g, ' ').trim(),
    `${cleanTitle} netflix trailer`.replace(/\s+/g, ' ').trim(),
    `${cleanTitle} trailer`.replace(/\s+/g, ' ').trim(),
  ];

  for (const q of englishQueries) {
    const candidates = await fetchSearchCandidates(q, excludeSet);
    const match = findValidCandidate(candidates);
    if (match) {
      const trailer: TrailerInfo = {
        id: match.videoId,
        key: match.videoId,
        name: match.title || `${cleanTitle} Trailer`,
        site: 'YouTube',
        type: 'Trailer',
        language: 'en',
        isOfficial: true,
        isHindiFallback: preferredLanguage === 'hi', // Signals UI: Hindi trailer wasn't found, falling back to English
      };
      if (excludeSet.size === 0 && preferredLanguage !== 'hi') {
        await setCachedMetadata(cacheKey, trailer);
      }
      return trailer;
    }
  }

  // 3. PRIORITY 4: Regional Language Official Trailer
  const regionalLangs = options?.regionalLanguage
    ? [options.regionalLanguage]
    : ['tamil', 'telugu', 'malayalam', 'kannada', 'bengali', 'marathi'];

  for (const regLang of regionalLangs) {
    const regQuery = `${cleanTitle} ${regLang} official trailer`.replace(/\s+/g, ' ').trim();
    const candidates = await fetchSearchCandidates(regQuery, excludeSet);
    const match = findValidCandidate(candidates, (item) =>
      isRegionalMatch(item.title, regLang, item.shortDescription, item.uploaderName)
    );
    if (match) {
      const trailer: TrailerInfo = {
        id: match.videoId,
        key: match.videoId,
        name: match.title || `${cleanTitle} ${regLang} Trailer`,
        site: 'YouTube',
        type: 'Trailer',
        language: 'other',
        isOfficial: true,
        isHindiFallback: true,
      };
      return trailer;
    }
  }

  // If no valid official trailer exists at all, return null gracefully (never return a review or clip)
  return null;
}

/**
 * Searches YouTube for a review:
 * Query format: [title] + [year] + [movie/series] + review
 */
export async function searchYouTubeReview(
  title: string,
  year?: number,
  mediaType?: MediaType | string,
  options?: SearchTrailerOptions
): Promise<TrailerInfo | null> {
  const cleanTitle = title.replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
  const contentType = mediaType === 'tv' ? 'series' : 'movie';
  const excludeSet = new Set(options?.excludeVideoIds || []);

  const reviewQueries = [
    `${cleanTitle} ${year || ''} ${contentType} review`.replace(/\s+/g, ' ').trim(),
    `${cleanTitle} ${contentType} review`.replace(/\s+/g, ' ').trim(),
    `${cleanTitle} review`.replace(/\s+/g, ' ').trim(),
  ];

  for (const q of reviewQueries) {
    const candidates = await fetchSearchCandidates(q, excludeSet);
    if (candidates.length > 0) {
      const item = candidates[0];
      return {
        id: item.videoId,
        key: item.videoId,
        name: item.title || `${cleanTitle} Review`,
        site: 'YouTube',
        type: 'Review',
        language: 'en',
        isOfficial: false,
      };
    }
  }

  return null;
}

/**
 * Searches YouTube for custom keywords entered by the user
 */
export async function searchYouTubeByKeywords(
  keywords: string,
  options?: SearchTrailerOptions
): Promise<TrailerInfo | null> {
  const trimmed = keywords.trim();
  if (!trimmed) return null;

  const excludeSet = new Set(options?.excludeVideoIds || []);
  const candidates = await fetchSearchCandidates(trimmed, excludeSet);

  if (candidates.length > 0) {
    const item = candidates[0];
    return {
      id: item.videoId,
      key: item.videoId,
      name: item.title || trimmed,
      site: 'YouTube',
      type: 'Custom',
      language: 'en',
      isOfficial: false,
    };
  }

  return null;
}

interface RawCandidate {
  videoId: string;
  title: string;
  uploaderName?: string;
  shortDescription?: string;
}

async function fetchSearchCandidates(
  query: string,
  excludeSet: Set<string>
): Promise<RawCandidate[]> {
  for (const endpoint of YOUTUBE_SEARCH_ENDPOINTS) {
    try {
      const url = `${endpoint}?q=${encodeURIComponent(query)}&filter=videos`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeoutId);

      if (!res.ok) continue;
      const data = await res.json();
      const items = Array.isArray(data) ? data : data.items || [];
      if (!Array.isArray(items) || items.length === 0) continue;

      const candidates: RawCandidate[] = [];
      for (const item of items) {
        let videoId = item.url ? item.url.replace('/watch?v=', '') : item.videoId;
        if (
          videoId &&
          typeof videoId === 'string' &&
          videoId.length === 11 &&
          !excludeSet.has(videoId)
        ) {
          candidates.push({
            videoId,
            title: item.title || '',
            uploaderName: item.uploaderName || '',
            shortDescription: item.shortDescription || '',
          });
        }
      }

      if (candidates.length > 0) {
        return candidates;
      }
    } catch {
      // Continue to next endpoint mirror
    }
  }

  return [];
}
