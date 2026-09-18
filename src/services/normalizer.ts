export function normalizeTitle(title: string): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/[–—_:]/g, ' ')
    .replace(/[^a-z0-9\s']/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createDuplicateKey(title: string): string {
  return normalizeTitle(title)
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Generates the official direct Netflix link for an item.
 * If videoId exists (e.g. numeric ID '80057281' or slug), direct title/watch URL is used:
 * https://www.netflix.com/title/{videoId}
 * Otherwise falls back to official Netflix search:
 * https://www.netflix.com/search?q={query}
 */
export function getNetflixUrl(item: { videoId?: string; originalTitle: string; externalTitle?: string }): string {
  if (item.videoId) {
    const cleanId = item.videoId.toString().trim();
    // Pure numeric or alphanumeric Netflix video ID
    if (/^\d+$/.test(cleanId)) {
      return `https://www.netflix.com/title/${cleanId}`;
    }
    // If it has letters/numbers or hyphens
    if (/^[a-zA-Z0-9_-]+$/.test(cleanId) && cleanId.length >= 4) {
      return `https://www.netflix.com/title/${cleanId}`;
    }
  }
  const query = item.externalTitle || item.originalTitle;
  return `https://www.netflix.com/search?q=${encodeURIComponent(query)}`;
}

export interface LanguageBadgeInfo {
  code: 'hi' | 'en' | 'ja' | 'ko' | 'other';
  label: string;
  badge: string; // 'हिं' | 'EN' | 'JAP' | 'KOR' etc.
  bgClass: string;
  textClass: string;
}

/**
 * Checks if an item has a specific language either in languages, originalLanguage,
 * or country context (e.g. India implies Hindi availability).
 */
export function itemHasLanguage(item: { languages?: string[]; originalLanguage?: string; countries?: string[] }, targetLang: string): boolean {
  const normTarget = targetLang.toLowerCase().trim();
  const langs = (item.languages || []).map((l) => l.toLowerCase());
  const orig = (item.originalLanguage || '').toLowerCase();
  const countries = (item.countries || []).map((c) => c.toLowerCase());

  if (normTarget === 'hi' || normTarget === 'hindi') {
    if (langs.some((l) => l === 'hi' || l === 'hin' || l.includes('hindi'))) return true;
    if (orig === 'hi' || orig === 'hin') return true;
    if (countries.some((c) => c === 'in' || c === 'india')) return true;
    return false;
  }

  if (normTarget === 'en' || normTarget === 'english') {
    if (langs.some((l) => l === 'en' || l === 'eng' || l.includes('english'))) return true;
    if (orig === 'en' || orig === 'eng') return true;
    if (countries.some((c) => c === 'us' || c === 'uk' || c === 'gb' || c.includes('united states') || c.includes('united kingdom') || c.includes('australia') || c.includes('canada'))) return true;
    return false;
  }

  if (normTarget === 'ja' || normTarget === 'japanese' || normTarget === 'jap') {
    if (langs.some((l) => l === 'ja' || l === 'jpn' || l.includes('japan'))) return true;
    if (orig === 'ja' || orig === 'jpn') return true;
    if (countries.some((c) => c === 'jp' || c === 'japan')) return true;
    return false;
  }

  if (normTarget === 'ko' || normTarget === 'korean') {
    if (langs.some((l) => l === 'ko' || l === 'kor' || l.includes('korea'))) return true;
    if (orig === 'ko' || orig === 'kor') return true;
    if (countries.some((c) => c === 'kr' || c.includes('korea'))) return true;
    return false;
  }

  // Generic check
  if (langs.some((l) => l === normTarget || l.includes(normTarget))) return true;
  if (orig === normTarget) return true;
  return false;
}

/**
 * Returns prioritized language badge according to the rule:
 * 1. If available in Hindi -> show Hindi (हिं)
 * 2. Else if available in English -> show English (EN)
 * 3. Else if available in Japanese -> show Japanese (JAP)
 * 4. Else Korean / Other if available.
 */
export function getPriorityLanguageBadge(item: { languages?: string[]; originalLanguage?: string; countries?: string[] }): LanguageBadgeInfo | null {
  if (itemHasLanguage(item, 'hindi')) {
    return {
      code: 'hi',
      label: 'Hindi',
      badge: 'हिं',
      bgClass: 'bg-amber-500/90 text-black border-amber-400/50',
      textClass: 'font-black tracking-normal text-xs',
    };
  }

  if (itemHasLanguage(item, 'english')) {
    return {
      code: 'en',
      label: 'English',
      badge: 'EN',
      bgClass: 'bg-blue-600/90 text-white border-blue-400/50',
      textClass: 'font-extrabold text-[10px]',
    };
  }

  if (itemHasLanguage(item, 'japanese')) {
    return {
      code: 'ja',
      label: 'Japanese',
      badge: 'JAP',
      bgClass: 'bg-rose-600/90 text-white border-rose-400/50',
      textClass: 'font-bold text-[10px]',
    };
  }

  if (itemHasLanguage(item, 'korean')) {
    return {
      code: 'ko',
      label: 'Korean',
      badge: 'KOR',
      bgClass: 'bg-purple-600/90 text-white border-purple-400/50',
      textClass: 'font-bold text-[10px]',
    };
  }

  // Fallback to originalLanguage if known
  if (item.originalLanguage && item.originalLanguage.length === 2) {
    return {
      code: 'other',
      label: item.originalLanguage.toUpperCase(),
      badge: item.originalLanguage.toUpperCase(),
      bgClass: 'bg-zinc-700/90 text-zinc-100 border-zinc-500/50',
      textClass: 'font-semibold text-[10px]',
    };
  }

  return null;
}

/**
 * Standardizes country names by mapping 2-letter ISO codes (US, CA, GB, JP, etc.)
 * and regional naming variations (USA, United States of America, South Korea, etc.)
 * to their primary full canonical English name.
 */
const COUNTRY_MAP: Record<string, string> = {
  // North America
  'us': 'United States',
  'usa': 'United States',
  'united states of america': 'United States',
  'ca': 'Canada',
  'can': 'Canada',
  'mx': 'Mexico',
  'mex': 'Mexico',

  // Europe
  'gb': 'United Kingdom',
  'uk': 'United Kingdom',
  'great britain': 'United Kingdom',
  'fr': 'France',
  'fra': 'France',
  'de': 'Germany',
  'deu': 'Germany',
  'it': 'Italy',
  'ita': 'Italy',
  'es': 'Spain',
  'esp': 'Spain',
  'se': 'Sweden',
  'swe': 'Sweden',
  'ch': 'Switzerland',
  'che': 'Switzerland',
  'no': 'Norway',
  'nor': 'Norway',
  'dk': 'Denmark',
  'dnk': 'Denmark',
  'fi': 'Finland',
  'fin': 'Finland',
  'nl': 'Netherlands',
  'nld': 'Netherlands',
  'be': 'Belgium',
  'bel': 'Belgium',
  'ie': 'Ireland',
  'irl': 'Ireland',
  'pl': 'Poland',
  'pol': 'Poland',
  'cz': 'Czech Republic',
  'cze': 'Czechia',
  'czechia': 'Czech Republic',
  'at': 'Austria',
  'aut': 'Austria',
  'pt': 'Portugal',
  'prt': 'Portugal',
  'ru': 'Russia',
  'rus': 'Russia',
  'russian federation': 'Russia',
  'ua': 'Ukraine',
  'ukr': 'Ukraine',
  'tr': 'Turkey',
  'tur': 'Turkey',
  'türkiye': 'Turkey',
  'gr': 'Greece',
  'grc': 'Greece',
  'hu': 'Hungary',
  'hun': 'Hungary',
  'ro': 'Romania',
  'rou': 'Romania',
  'bg': 'Bulgaria',
  'bgr': 'Bulgaria',
  'hr': 'Croatia',
  'hrv': 'Croatia',

  // Asia & Middle East
  'in': 'India',
  'ind': 'India',
  'jp': 'Japan',
  'jpn': 'Japan',
  'kr': 'South Korea',
  'kor': 'South Korea',
  'korea': 'South Korea',
  'republic of korea': 'South Korea',
  'cn': 'China',
  'chn': 'China',
  'hk': 'Hong Kong',
  'hkg': 'Hong Kong',
  'tw': 'Taiwan',
  'twn': 'Taiwan',
  'th': 'Thailand',
  'tha': 'Thailand',
  'vn': 'Vietnam',
  'vnm': 'Vietnam',
  'id': 'Indonesia',
  'idn': 'Indonesia',
  'my': 'Malaysia',
  'mys': 'Malaysia',
  'sg': 'Singapore',
  'sgp': 'Singapore',
  'ph': 'Philippines',
  'phl': 'Philippines',
  'pk': 'Pakistan',
  'pak': 'Pakistan',
  'il': 'Israel',
  'isr': 'Israel',
  'ae': 'United Arab Emirates',
  'are': 'United Arab Emirates',
  'sa': 'Saudi Arabia',
  'sau': 'Saudi Arabia',
  'ir': 'Iran',
  'irn': 'Iran',

  // Oceania
  'au': 'Australia',
  'aus': 'Australia',
  'nz': 'New Zealand',
  'nzl': 'New Zealand',

  // South America
  'br': 'Brazil',
  'bra': 'Brazil',
  'ar': 'Argentina',
  'arg': 'Argentina',
  'cl': 'Chile',
  'chl': 'Chile',
  'co': 'Colombia',
  'col': 'Colombia',

  // Africa
  'za': 'South Africa',
  'zaf': 'South Africa',
  'eg': 'Egypt',
  'egy': 'Egypt',
  'ng': 'Nigeria',
  'nga': 'Nigeria',
};

export function normalizeCountryName(country: string): string {
  if (!country) return '';
  const trimmed = country.trim();
  const lower = trimmed.toLowerCase();
  if (COUNTRY_MAP[lower]) {
    return COUNTRY_MAP[lower];
  }
  return trimmed;
}

export function normalizeCountriesList(countries?: string[]): string[] {
  if (!countries || !Array.isArray(countries)) return [];
  const set = new Set<string>();
  for (const c of countries) {
    const norm = normalizeCountryName(c);
    if (norm) set.add(norm);
  }
  return Array.from(set);
}

