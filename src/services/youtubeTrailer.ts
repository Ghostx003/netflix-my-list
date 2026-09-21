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

/**
 * Search YouTube trailer with format:
 * [title] + hindi + [year] trailer
 * If no Hindi trailer is found, falls back to English/available trailer and marks isHindiFallback: true
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
  if (!options?.skipCache) {
    const cached = (await getCachedMetadata(cacheKey)) as TrailerInfo | null;
    if (cached && !excludeSet.has(cached.key)) {
      return cached;
    }
  }

  if (preferredLanguage === 'hi') {
    // 1. Primary requested query: [movie/series name] + hindi + [year] + trailer
    const hindiQueries = [
      `${cleanTitle} hindi ${year || ''} trailer`.replace(/\s+/g, ' ').trim(),
      `${cleanTitle} hindi trailer`.replace(/\s+/g, ' ').trim(),
      `${cleanTitle} official hindi trailer`.replace(/\s+/g, ' ').trim(),
      `${cleanTitle} netflix hindi trailer`.replace(/\s+/g, ' ').trim(),
    ];

    for (const q of hindiQueries) {
      const candidates = await fetchSearchCandidates(q, excludeSet);
      // Look for a verified Hindi candidate
      for (const item of candidates) {
        if (isHindiMatch(item.title, item.shortDescription, item.uploaderName)) {
          const trailer: TrailerInfo = {
            id: item.videoId,
            key: item.videoId,
            name: item.title || `${cleanTitle} Hindi Trailer`,
            site: 'YouTube',
            type: 'Trailer',
            language: 'hi',
            isOfficial: true,
            isHindiFallback: false,
          };
          await setCachedMetadata(cacheKey, trailer);
          return trailer;
        }
      }
    }

    // 2. If NO Hindi trailer was found, fallback to English / available trailer
    const englishFallbackQueries = [
      `${cleanTitle} ${year || ''} official trailer`.replace(/\s+/g, ' ').trim(),
      `${cleanTitle} ${year || ''} trailer`.replace(/\s+/g, ' ').trim(),
      `${cleanTitle} official trailer`.replace(/\s+/g, ' ').trim(),
      `${cleanTitle} trailer`.replace(/\s+/g, ' ').trim(),
    ];

    for (const q of englishFallbackQueries) {
      const candidates = await fetchSearchCandidates(q, excludeSet);
      if (candidates.length > 0) {
        const item = candidates[0];
        const trailer: TrailerInfo = {
          id: item.videoId,
          key: item.videoId,
          name: item.title || `${cleanTitle} Trailer`,
          site: 'YouTube',
          type: 'Trailer',
          language: 'en',
          isOfficial: true,
          isHindiFallback: true, // Signals UI to show 1-second "Hindi trailer not found" message
        };
        return trailer;
      }
    }
  } else {
    // Preferred English
    const englishQueries = [
      `${cleanTitle} ${year || ''} official trailer`.replace(/\s+/g, ' ').trim(),
      `${cleanTitle} ${year || ''} trailer`.replace(/\s+/g, ' ').trim(),
      `${cleanTitle} ${mediaType === 'tv' ? 'series' : 'movie'} official trailer`.replace(/\s+/g, ' ').trim(),
      `${cleanTitle} official trailer`.replace(/\s+/g, ' ').trim(),
    ];

    for (const q of englishQueries) {
      const candidates = await fetchSearchCandidates(q, excludeSet);
      if (candidates.length > 0) {
        const item = candidates[0];
        const trailer: TrailerInfo = {
          id: item.videoId,
          key: item.videoId,
          name: item.title || `${cleanTitle} Trailer`,
          site: 'YouTube',
          type: 'Trailer',
          language: 'en',
          isOfficial: true,
          isHindiFallback: false,
        };
        await setCachedMetadata(cacheKey, trailer);
        return trailer;
      }
    }
  }

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
