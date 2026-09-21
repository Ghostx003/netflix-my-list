import { TrailerInfo, MediaType } from '../types';
import { getCachedMetadata, setCachedMetadata } from './db';

/**
 * Searches YouTube for trailer with Hindi priority or English priority.
 * Uses public YouTube API mirrors, with client-side fallback parsing.
 */
const YOUTUBE_SEARCH_ENDPOINTS = [
  'https://api.piped.private.coffee/search',
  'https://pipedapi.leptons.xyz/search',
  'https://invidious.nerdvpn.de/api/v1/search',
  'https://inv.nadeko.net/api/v1/search',
];

export interface SearchTrailerOptions {
  skipCache?: boolean;
  excludeVideoIds?: string[];
  alternativeOffset?: number;
}

/**
 * Extract YouTube video ID from a search result item or query
 */
export async function searchYouTubeTrailer(
  title: string,
  year?: number,
  mediaType?: MediaType | string,
  preferredLanguage: 'hi' | 'en' = 'hi',
  options?: SearchTrailerOptions
): Promise<TrailerInfo | null> {
  const cleanTitle = title.replace(/[^\w\s]/gi, ' ').trim();
  const cacheKey = `yt_trailer_${cleanTitle.toLowerCase()}_${year || ''}_${preferredLanguage}`;

  const excludeSet = new Set(options?.excludeVideoIds || []);

  // 1. Check local indexedDB cache unless skipping cache
  if (!options?.skipCache) {
    const cached = (await getCachedMetadata(cacheKey)) as TrailerInfo | null;
    if (cached && !excludeSet.has(cached.key)) {
      return cached;
    }
  }

  // Priority queries based on preference:
  const queries =
    preferredLanguage === 'hi'
      ? [
          { query: `${cleanTitle} netflix hindi official trailer`, lang: 'hi' },
          { query: `${cleanTitle} hindi trailer netflix`, lang: 'hi' },
          { query: `${cleanTitle} official hindi trailer`, lang: 'hi' },
          { query: `${cleanTitle} ${year || ''} hindi trailer`, lang: 'hi' },
          { query: `${cleanTitle} hindi trailer`, lang: 'hi' },
          { query: `${cleanTitle} netflix india hindi`, lang: 'hi' },
          // English fallback only if no Hindi trailer found
          { query: `${cleanTitle} ${year || ''} official trailer netflix`, lang: 'en' },
          { query: `${cleanTitle} official trailer`, lang: 'en' },
        ]
      : [
          { query: `${cleanTitle} ${year || ''} official trailer english`, lang: 'en' },
          { query: `${cleanTitle} official trailer netflix`, lang: 'en' },
          { query: `${cleanTitle} ${mediaType === 'tv' ? 'series' : 'movie'} official trailer`, lang: 'en' },
          { query: `${cleanTitle} official trailer`, lang: 'en' },
          { query: `${cleanTitle} ${year || ''} hindi trailer`, lang: 'hi' },
        ];

  for (const qObj of queries) {
    const trailer = await trySearchEndpoints(qObj.query, qObj.lang, excludeSet);
    if (trailer && !excludeSet.has(trailer.key)) {
      // Save to cache for future requests
      await setCachedMetadata(cacheKey, trailer);
      return trailer;
    }
  }

  return null;
}

async function trySearchEndpoints(
  query: string,
  preferredLang: string,
  excludeSet: Set<string>
): Promise<TrailerInfo | null> {
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

      // 1. If Hindi requested, search for titles that explicitly mention 'hindi'
      if (preferredLang === 'hi') {
        for (const item of items) {
          const itemTitle = (item.title || '').toLowerCase();
          let videoId = item.url ? item.url.replace('/watch?v=', '') : item.videoId;
          if (
            videoId &&
            typeof videoId === 'string' &&
            videoId.length === 11 &&
            !excludeSet.has(videoId) &&
            (itemTitle.includes('hindi') || itemTitle.includes('हिंदी') || itemTitle.includes('netflix india'))
          ) {
            return {
              id: videoId,
              key: videoId,
              name: item.title || 'Hindi Trailer',
              site: 'YouTube',
              type: 'Trailer',
              language: 'hi',
              isOfficial: true,
            };
          }
        }
      }

      // 2. Otherwise return first valid video result not in excludeSet
      for (const item of items) {
        let videoId = item.url ? item.url.replace('/watch?v=', '') : item.videoId;
        if (videoId && typeof videoId === 'string' && videoId.length === 11 && !excludeSet.has(videoId)) {
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
