import { DEFAULT_PUBLIC_TMDB_KEY } from './tmdb';
import { getCachedThumbnail, setCachedThumbnail } from './db';

// Curated verified TMDB high-res posters for popular titles to ensure instant 100% loading
export const VERIFIED_POSTER_MAP: Record<string, string> = {
  'the last dance': 'https://image.tmdb.org/t/p/w500/oVf4xGGbDtwVHiKn8uTuSriY7PH.jpg',
  'vincenzo': 'https://image.tmdb.org/t/p/w500/qbkSS1cTjT4DzIwD44bdhTuYgdT.jpg',
  'section 375': 'https://image.tmdb.org/t/p/w500/x7rVZ0KiPWxBMJBI8roIwlMvs2c.jpg',
  'jai bhim': 'https://image.tmdb.org/t/p/w500/ehybiOtBUtrMkmtB39zQEtq1Jie.jpg',
  'the trial of the chicago 7': 'https://image.tmdb.org/t/p/w500/ahf5cVdooMAlDRiJOZQNuLqa1Is.jpg',
  'formula 1 drive to survive': 'https://image.tmdb.org/t/p/w500/xGOGjJFYYeRSoOpnhN9IHZTXIxj.jpg',
  'formula 1: drive to survive': 'https://image.tmdb.org/t/p/w500/xGOGjJFYYeRSoOpnhN9IHZTXIxj.jpg',
  'vinland saga': 'https://image.tmdb.org/t/p/w500/vUHlpA5c1NXkds59reY3HMb4Abs.jpg',
  'castlevania': 'https://image.tmdb.org/t/p/w500/WzFHnJY44uDERER0xi1jOdoafT.jpg',
  'bleach thousand year blood war': 'https://image.tmdb.org/t/p/w500/2EewmxXe72ogD0EaWM8gqa0ccIw.jpg',
  'bleach: thousand-year blood war': 'https://image.tmdb.org/t/p/w500/2EewmxXe72ogD0EaWM8gqa0ccIw.jpg',
  'my name': 'https://image.tmdb.org/t/p/w500/gHozOomiA24DvlgNfjkYCB5NBiO.jpg',
  'beef': 'https://image.tmdb.org/t/p/w500/25ih0Xq2zWbxhhKxwhvswKYQyEr.jpg',
  'mirzapur': 'https://image.tmdb.org/t/p/w500/1rxLUFVrtTo82OxhbDXJDiJVkwL.jpg',
  'tumbbad': 'https://image.tmdb.org/t/p/w500/vzjZAKozbDplHWcQXbXo0APKxst.jpg',
  'maharaja': 'https://image.tmdb.org/t/p/w500/s0m4TM1XRAftQStgKpw024RvkJo.jpg',
  'sector 36': 'https://image.tmdb.org/t/p/w500/pbVcZmmcfqk35Q9hNxRoR7JPiVp.jpg',
  'brooklyn nine-nine': 'https://image.tmdb.org/t/p/w500/mpjlDzVjp7oyHUe2LaF9ltKe6f1.jpg',
  'brooklyn nine nine': 'https://image.tmdb.org/t/p/w500/mpjlDzVjp7oyHUe2LaF9ltKe6f1.jpg',
  'bojack horseman': 'https://image.tmdb.org/t/p/w500/6JFWzlChcGgLiIUo2COgNlWGFKy.jpg',
  'kohrra': 'https://image.tmdb.org/t/p/w500/oZbiASZweEKFOHsl56QTeNJ6a8R.jpg',
  'talaash the answer lies within': 'https://image.tmdb.org/t/p/w500/oCxyN7HmJ7zWp8jtJeMRHABnutF.jpg',
  'talaash: the answer lies within': 'https://image.tmdb.org/t/p/w500/oCxyN7HmJ7zWp8jtJeMRHABnutF.jpg',
  'crash landing on you': 'https://image.tmdb.org/t/p/w500/fgBNLPr6mC8pxuR79ENAJY4nBmj.jpg',
  'queen of tears': 'https://image.tmdb.org/t/p/w500/7ZXLZ3KYL3IVvsSHBZaHjcNQzNU.jpg',
  'extraordinary attorney woo': 'https://image.tmdb.org/t/p/w500/zuNOQVI4rEaqwknrfQUVKtlKE2C.jpg',
  'sweet home': 'https://image.tmdb.org/t/p/w500/zcugNxDg59YwIf3dUHsrHmO7pc1.jpg',
  'arcane': 'https://image.tmdb.org/t/p/w500/fqldf2t8ztc9aiwn397ml3bd41v.jpg',
  'dark': 'https://image.tmdb.org/t/p/w500/apbrbWs8M9lyOpJYU5WXrpFbk1Z.jpg',
  'breaking bad': 'https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
  'better call saul': 'https://image.tmdb.org/t/p/w500/fC2HDm5t0kHjUmYIMBYVZsXL0qj.jpg',
  'stranger things': 'https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg',
  'mindhunter': 'https://image.tmdb.org/t/p/w500/fbKE87mojpIETWepSbD5Qt741d7.jpg',
  'black mirror': 'https://image.tmdb.org/t/p/w500/5UaMirB0kiIUXrUsUUV8mOH0r9J.jpg',
  'money heist': 'https://image.tmdb.org/t/p/w500/reEMJA1uzscCbk5rUhGny6M7ZDu.jpg',
  'squid game': 'https://image.tmdb.org/t/p/w500/dDlG1T3w2fV23F8w2K1J4f6F6qX.jpg',
  'narcos': 'https://image.tmdb.org/t/p/w500/rTmal9fVCwhHb99Vh0WWRJbpTn.jpg',
  'peaky blinders': 'https://image.tmdb.org/t/p/w500/vUUqzWa2LnHIVqkaKVlVGkVcTTW.jpg',
  'lost bullet 2': 'https://image.tmdb.org/t/p/w500/uAeZI1JJbLPq7Bu5dziH7emHeu7.jpg',
  'lost bullet': 'https://image.tmdb.org/t/p/w500/5NXSV5n94n2b1a8d1z8fG5Kx7XG.jpg',
  'from the ashes': 'https://image.tmdb.org/t/p/w500/aEUH2ECoZHvSmoMzJpca0STF2CZ.jpg',
  'the railway men': 'https://image.tmdb.org/t/p/w500/kOYlMHtNSqnf1FgsoK1JJypfkrY.jpg',
  'the railway men the untold story of bhopal 1984': 'https://image.tmdb.org/t/p/w500/kOYlMHtNSqnf1FgsoK1JJypfkrY.jpg',
  'kota factory': 'https://image.tmdb.org/t/p/w500/fMBookmwL6HjIgIVTjQ6EMr3pCH.jpg',
  'heeramandi': 'https://image.tmdb.org/t/p/w500/uSmnvWK3bCPz87jkE0GpZsMnYpT.jpg',
  'heeramandi the diamond bazaar': 'https://image.tmdb.org/t/p/w500/uSmnvWK3bCPz87jkE0GpZsMnYpT.jpg',
  'interstellar': 'https://image.tmdb.org/t/p/w500/yQvGrMoipbRoddT0ZR8tPoR7NfX.jpg',
  'arrival': 'https://image.tmdb.org/t/p/w500/pEzNVQfdzYDzVK0XqxERIw2x2se.jpg',
  'the martian': 'https://image.tmdb.org/t/p/w500/5BHuvQ6p9kfc091Z8RiFNhCwL4b.jpg',
  'nightcrawler': 'https://image.tmdb.org/t/p/w500/j9HrX8f7GbZQm1BrBiR40uFQZSb.jpg',
  'gone girl': 'https://image.tmdb.org/t/p/w500/ts996lKsxvjkO2yiYG0ht4qAicO.jpg',
  '100 humans': 'https://image.tmdb.org/t/p/w500/ykN9uhnGdtjvx9Lk8bYvdprNQsC.jpg',
  '14 peaks nothing is impossible': 'https://image.tmdb.org/t/p/w500/8YS9oRn9rcAyBhYELFbGKk1TpFs.jpg',
  '28 days haunted': 'https://image.tmdb.org/t/p/w500/AqcHMbvN4lkYUXKNalOxOFe025K.jpg',
  '3': 'https://image.tmdb.org/t/p/w500/xuJffmaJ4sbJDsK4rXInAU1huSo.jpg',
  '7 prisoners': 'https://image.tmdb.org/t/p/w500/viRzKTQXkUJXr6jKbE6Ek3fGtqG.jpg',
};

/**
 * Normalizes title string for dictionary lookup
 */
export function normalizeTitleKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Validates and normalizes image URL (handles relative TMDB paths and blocks fake placeholders)
 */
export function sanitizeImageUrl(url?: string, titleHint?: string): string | undefined {
  if (!url || typeof url !== 'string') {
    if (titleHint) {
      const key = normalizeTitleKey(titleHint);
      if (VERIFIED_POSTER_MAP[key]) return VERIFIED_POSTER_MAP[key];
    }
    return undefined;
  }

  const trimmed = url.trim();
  if (trimmed.length < 5) return undefined;

  // Reject placeholder file names like _poster.jpg
  if (trimmed.endsWith('_poster.jpg') || trimmed.includes('/placeholder') || trimmed.includes('last_dance_poster.jpg')) {
    if (titleHint) {
      const key = normalizeTitleKey(titleHint);
      if (VERIFIED_POSTER_MAP[key]) return VERIFIED_POSTER_MAP[key];
    }
    return undefined;
  }

  // Handle relative TMDB paths (e.g. /oVf4xGGbDtwVHiKn8uTuSriY7PH.jpg)
  if (trimmed.startsWith('/')) {
    return `https://image.tmdb.org/t/p/w500${trimmed}`;
  }

  return trimmed;
}

/**
 * In-flight and memory cache of fetched poster URLs by title
 */
const titlePosterCache = new Map<string, string>();
const activeTitleFetches = new Map<string, Promise<string | null>>();

/**
 * Dynamically resolves real TMDB poster by searching title via TMDB API
 */
export async function fetchPosterByTitle(title: string, year?: number): Promise<string | null> {
  const normKey = normalizeTitleKey(title);
  if (!normKey) return null;

  // 1. Check curated verified map
  if (VERIFIED_POSTER_MAP[normKey]) {
    return VERIFIED_POSTER_MAP[normKey];
  }

  // 2. Check memory cache
  if (titlePosterCache.has(normKey)) {
    return titlePosterCache.get(normKey)!;
  }

  // 3. Check IndexedDB cache
  try {
    const cached = await getCachedThumbnail(`tmdb_poster_${normKey}`);
    if (cached) {
      titlePosterCache.set(normKey, cached);
      return cached;
    }
  } catch {
    // Ignore cache error
  }

  // 4. In-flight deduplication
  if (activeTitleFetches.has(normKey)) {
    return activeTitleFetches.get(normKey)!;
  }

  const fetchPromise = (async () => {
    try {
      const apiKey = DEFAULT_PUBLIC_TMDB_KEY;
      const yearParam = year ? `&year=${year}` : '';
      const url = `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(title)}${yearParam}&include_adult=false`;

      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const results = data.results || [];

      // Find first result with poster_path
      const match = results.find((r: any) => r.poster_path);
      if (match?.poster_path) {
        const fullPosterUrl = `https://image.tmdb.org/t/p/w500${match.poster_path}`;
        titlePosterCache.set(normKey, fullPosterUrl);
        // Persist to IndexedDB cache
        setCachedThumbnail(`tmdb_poster_${normKey}`, fullPosterUrl).catch(() => {});
        return fullPosterUrl;
      }
      return null;
    } catch (err) {
      console.warn(`[imageResolver] Error fetching poster for "${title}":`, err);
      return null;
    } finally {
      activeTitleFetches.delete(normKey);
    }
  })();

  activeTitleFetches.set(normKey, fetchPromise);
  return fetchPromise;
}
