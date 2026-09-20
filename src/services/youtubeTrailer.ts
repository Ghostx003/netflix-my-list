import { TrailerInfo, MediaType } from '../types';
import { getCachedMetadata, setCachedMetadata } from './db';

/**
 * Searches YouTube for trailer with Hindi priority, then English fallback.
 * Uses Piped / Invidious public YouTube API mirrors, with client-side fallback parsing.
 */
const YOUTUBE_SEARCH_ENDPOINTS = [
  'https://pipedapi.kavin.rocks/search',
  'https://api.piped.private.coffee/search',
  'https://pipedapi.leptons.xyz/search',
  'https://invidious.nerdvpn.de/api/v1/search',
];

/**
 * Extract YouTube video ID from a search result item or query
 */
export async function searchYouTubeTrailer(
  title: string,
  year?: number,
  mediaType?: MediaType | string
): Promise<TrailerInfo | null> {
  const cleanTitle = title.replace(/[^\w\s]/gi, ' ').trim();
  const cacheKey = `yt_trailer_${cleanTitle.toLowerCase()}_${year || ''}`;

  // 1. Check local indexedDB cache
  const cached = await getCachedMetadata(cacheKey);
  if (cached) {
    return cached as TrailerInfo;
  }

  // Priority queries:
  // 1. "<Title> hindi trailer"
  // 2. "<Title> official trailer"
  const queries = [
    { query: `${cleanTitle} ${year || ''} hindi trailer`, lang: 'hi' },
    { query: `${cleanTitle} ${mediaType === 'tv' ? 'series' : 'movie'} official trailer`, lang: 'en' },
    { query: `${cleanTitle} official trailer`, lang: 'en' },
  ];

  for (const qObj of queries) {
    const trailer = await trySearchEndpoints(qObj.query, qObj.lang);
    if (trailer) {
      await setCachedMetadata(cacheKey, trailer);
      return trailer;
    }
  }

  return null;
}

async function trySearchEndpoints(query: string, preferredLang: string): Promise<TrailerInfo | null> {
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

      // Piped API format: items are in data.items
      // Invidious API format: items are an array at root
      const items = Array.isArray(data) ? data : data.items || [];
      if (!Array.isArray(items) || items.length === 0) continue;

      // Find first valid video result
      for (const item of items) {
        let videoId = item.url ? item.url.replace('/watch?v=', '') : item.videoId;
        if (videoId && typeof videoId === 'string' && videoId.length === 11) {
          const itemTitle = item.title || 'Trailer';
          return {
            id: videoId,
            key: videoId,
            name: itemTitle,
            site: 'YouTube',
            type: 'Trailer',
            language: preferredLang,
            isOfficial: true,
          };
        }
      }
    } catch {
      // Continue to next endpoint
    }
  }

  return null;
}
