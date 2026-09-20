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
 * Generates the official direct Netflix playback link for an item.
 * If videoId exists (e.g. numeric ID '80057281' or slug), direct playback watch URL is used:
 * https://www.netflix.com/watch/{videoId}
 * Otherwise falls back to official Netflix search:
 * https://www.netflix.com/search?q={query}
 */
export function getNetflixUrl(item: { videoId?: string; originalTitle?: string; externalTitle?: string; title?: string }): string {
  if (item.videoId) {
    let cleanId = item.videoId.toString().trim();
    // In case videoId contains a full url like netflix.com/watch/12345 or netflix.com/title/12345
    const urlMatch = cleanId.match(/netflix\.com\/(?:title|watch)\/([a-zA-Z0-9_-]+)/i);
    if (urlMatch) {
      cleanId = urlMatch[1];
    }
    // Pure numeric or alphanumeric Netflix video ID
    if (/^\d+$/.test(cleanId)) {
      return `https://www.netflix.com/watch/${cleanId}`;
    }
    // If it has letters/numbers or hyphens (slug or ID)
    if (/^[a-zA-Z0-9_-]+$/.test(cleanId) && cleanId.length >= 4) {
      return `https://www.netflix.com/watch/${cleanId}`;
    }
  }

  // Use the best available title, cleaned of extraneous parentheticals for accurate Netflix landing
  const rawQuery = item.externalTitle || item.originalTitle || item.title || '';
  const cleanQuery = rawQuery
    .replace(/\s*\([^)]*\)/g, '') // remove (2023), (US), etc.
    .replace(/\s*:\s*season\s*\d+/i, '') // remove : Season 1
    .replace(/\s*season\s*\d+/i, '')
    .trim() || rawQuery.trim();

  if (cleanQuery) {
    return `https://www.netflix.com/search?q=${encodeURIComponent(cleanQuery)}`;
  }

  return 'https://www.netflix.com';
}

/**
 * Reliably opens a Netflix URL in a brand new tab/window,
 * stopping any event propagation to parent elements or SPA routers.
 *
 * If invoked from a native <a target="_blank"> click, it lets the browser
 * perform the navigation natively (exact same behavior as middle-mouse).
 * Calling window.open() inside an <a> click causes Chrome/Edge to detect
 * a scripted pop-up and block it.
 */
export function openNetflixInNewTab(
  url: string,
  e?: { stopPropagation?: () => void; preventDefault?: () => void; currentTarget?: any; target?: any }
): void {
  if (e && typeof e.stopPropagation === 'function') {
    e.stopPropagation();
  }

  // If this click is triggered on an <a target="_blank">, let the browser
  // handle the navigation natively so Chrome/Edge popup blocker is never invoked!
  const currentTarget = e?.currentTarget as HTMLElement | null;
  const target = e?.target as HTMLElement | null;
  const isInsideBlankAnchor =
    (currentTarget && currentTarget.tagName === 'A' && currentTarget.getAttribute('target') === '_blank') ||
    (target && typeof target.closest === 'function' && target.closest('a[target="_blank"]') != null);

  if (isInsideBlankAnchor) {
    // Native browser click does exactly what middle-mouse does!
    return;
  }

  const finalUrl = url && url.trim() ? url.trim() : 'https://www.netflix.com';

  try {
    const a = document.createElement('a');
    a.href = finalUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentNode) {
        a.parentNode.removeChild(a);
      }
    }, 100);
  } catch (err) {
    console.warn('[openNetflixInNewTab] Fallback to window.open:', err);
    window.open(finalUrl, '_blank', 'noopener,noreferrer');
  }
}

export interface LanguageBadgeInfo {
  code: 'hi' | 'en' | 'ja' | 'ko' | 'other';
  label: string;
  badge: string; // 'हिं' | 'EN' | 'JAP' | 'KOR' etc.
  bgClass: string;
  textClass: string;
}

/**
 * Curated list of popular Netflix India Hindi dubbed international titles
 * (American, Korean, Japanese anime/live-action, European, and global series/movies).
 * Netflix India dubs all major originals and blockbuster franchises in Hindi.
 */
// Curated list of popular Netflix India Hindi dubbed international titles
// (American, Korean, Japanese anime/live-action, European, Indian, and global series/movies).
// Netflix India dubs all major originals and blockbuster franchises in Hindi.
export const NETFLIX_HINDI_DUBBED_TITLES: Set<string> = new Set([
  // Popular Global & American TV Series
  'stranger things',
  'wednesday',
  'money heist',
  'squid game',
  'all of us are dead',
  'dark',
  'the witcher',
  'the witcher blood origin',
  'lucifer',
  'cobra kai',
  'sex education',
  'alice in borderland',
  'one piece',
  '1899',
  'sweet home',
  'my name',
  'the glory',
  'narcos',
  'narcos mexico',
  'peaky blinders',
  'ozark',
  'the crown',
  'bridgerton',
  'queen charlotte',
  'the sandman',
  'dahmer',
  'dahmer monster the jeffrey dahmer story',
  'monster the jeffrey dahmer story',
  'monsters the lyle and erik menendez story',
  'manifest',
  'outer banks',
  'shadow and bone',
  'locke & key',
  'locke and key',
  'the umbrella academy',
  'altered carbon',
  'lost in space',
  'another life',
  'avatar the last airbender',
  '3 body problem',
  'three body problem',
  'fall of the house of usher',
  'the fall of the house of usher',
  'the night agent',
  'the diplomat',
  'the recruit',
  'fubar',
  'beef',
  'baby reindeer',
  'supacell',
  'kaos',
  'a man in full',
  'bodkin',
  'fool me once',
  'the gentlemen',
  'one day',
  'griselda',
  'berlin',
  'lupin',
  'elite',
  'control z',
  'who killed sara',
  'cable girls',
  'high seas',
  'undercover',
  'ragnarok',
  'young royals',
  'heartstopper',
  'heartbreak high',
  'dead boy detectives',
  'sens8',
  'sense8',
  'the oa',
  'mindhunter',
  'house of cards',
  'orange is the new black',
  'black mirror',
  'love death & robots',
  'love death and robots',
  'arcane',
  'castlevania',
  'castlevania nocturne',
  'blood of zeus',
  'blue eye samurai',
  'captain laserhawk',
  'cyberpunk edgerunners',
  'dota dragons blood',
  'the cuphead show',
  'jurassic world camp cretaceous',
  'jurassic world chaos theory',
  'sonic prime',
  'he man and the masters of the universe',
  'masters of the universe revelation',
  'carmen sandiego',
  'the dragon prince',
  'trollhunters',
  'voltron legendary defender',
  'she ra and the princesses of power',
  'baki',
  'baki hanma',
  'kengan ashura',
  'record of ragnarok',
  'tekken bloodline',
  'demon slayer',
  'demon slayer kimetsu no yaiba',
  'jujutsu kaisen',
  'attack on titan',
  'naruto',
  'naruto shippuden',
  'boruto',
  'death note',
  'hunter x hunter',
  'vinland saga',
  'spy x family',
  'chainsaw man',
  'my hero academia',
  'tokyo ghoul',
  'parasyte',
  'parasyte the maxim',
  'rurouni kenshin',
  'rurouni kenshin the beginning',
  'rurouni kenshin the final',
  'hells paradise',
  'hells paradise jigokuraku',
  'solo leveling',
  'kaiju no 8',
  'pluto',
  'thermae romae novae',
  'kotaro lives alone',
  'komi cant communicate',
  'the way of the househusband',
  'delicious in dungeon',
  'dungeon meshi',
  'suzume',
  'bubble',
  'a whisker away',
  'drifting home',
  'maboroshi',
  'words bubble up like soda pop',
  'the orbital children',
  'that time i got reincarnated as a slime',
  'sakamoto days',
  'ranma',
  'ranma1 2',
  'ranma 1 2',
  'the boy and the heron',
  'godzilla minus one',

  // Korean Dramas & Movies (K-Dramas with Hindi Dubs on Netflix)
  'crash landing on you',
  'itaewon class',
  'vincenzo',
  'hometown cha cha cha',
  'business proposal',
  'extraordinary attorney woo',
  'king the land',
  'queen of tears',
  'marry my husband',
  'doctor slump',
  'welcome to samdalri',
  'destined with you',
  'see you in my 19th life',
  'bloodhounds',
  'celebrity',
  'mask girl',
  'doona',
  'daily dose of sunshine',
  'gyeongseong creature',
  'a killer paradox',
  'hierarchy',
  'the 8 show',
  'the whirlpool',
  'parasyte the grey',
  'song of the bandits',
  'black knight',
  'kill boksoon',
  'ballerina',
  'badland hunters',
  'officer black belt',
  'space sweepers',
  'the call',
  'unlocked',
  'seoul vibe',
  'yaksha ruthless operations',
  'jung e',
  'carnival row',
  'the silent sea',
  'hellbound',
  'extracurricular',
  'happiness',
  'flower of evil',
  'kingdom',
  'kingdom ashin of the north',
  'strong girl nam soon',
  'strong girl bong soon',
  'the frog',
  'the good bad mother',
  'the penthouse',
  'the penthouse war in life',
  'along with the gods',
  'along with the gods the two worlds',
  'psychokinesis',
  'revelations',
  'bogota',
  'bogota city of the lost',
  'the chase',
  'sweet tooth',
  'plastic beauty',
  'as you stood by',
  'trigger',

  // Indian Originals & Blockbusters (native Hindi or Hindi dub available on Netflix)
  'animal',
  'baahubali',
  'baahubali the epic',
  'baahubali the beginning',
  'baahubali the conclusion',
  'bad boy billionaires',
  'bad boy billionaires india',
  'bhakshak',
  'black warrant',
  'chhello show',
  'chhello show hindi',
  'dhoom dhaam',
  'haseen dillruba',
  'phir haseen dillruba',
  'house of secrets',
  'house of secrets the burari deaths',
  'indian predator',
  'indian predator murder in a courtroom',
  'indian predator the butcher of delhi',
  'khakee',
  'khakee the bihar chapter',
  'killer soup',
  'mandala murders',
  'mrithyunjay',
  'raat akeli hai',
  'searching for sheela',
  'to kill a tiger',
  'typewriter',
  'yo yo honey singh',
  'yo yo honey singh famous',
  'afwaah',
  'aap jaisa koi',
  'sacred games',
  'delhi crime',
  'kota factory',
  'mismatched',
  'she',
  'jamtara',
  'curry and cyanide',
  'curry & cyanide',
  'the railway men',
  'guns and gulaabs',
  'guns & gulaabs',
  'scoop',
  'kohrra',
  'class',
  'rana naidu',
  'trial by fire',
  'cat',
  'ye kaali kaali ankhein',
  'jaane jaan',
  'kathal',
  'mission majnu',
  'chor nikalke bhaga',
  'qala',
  'monica o my darling',
  'darlings',
  'thar',
  'ludo',
  'bulbbul',
  'choked',
  'jawan',
  'dunki',
  'salaar',
  'leo',
  'kalki 2898 ad',
  'devara',
  'devara part 1',

  // Global & Hollywood Movies dubbed in Hindi on Netflix India
  'red notice',
  'extraction',
  'extraction 2',
  'the gray man',
  'glass onion',
  'knives out',
  'heart of stone',
  'rebel moon',
  'rebel moon part one',
  'rebel moon part two',
  'leave the world behind',
  'society of the snow',
  'nowhere',
  'lift',
  'damsei',
  'damsel',
  'atlas',
  'beverly hills cop axel f',
  'beverly hills cop',
  'the union',
  'incoming',
  'uglies',
  'rebel ridge',
  'lonely planet',
  'carry on',
  'the mother',
  'the adam project',
  'don t look up',
  'dont look up',
  'bird box',
  'bird box barcelona',
  'army of the dead',
  'army of thieves',
  'project power',
  'the old guard',
  'triple frontier',
  '6 underground',
  'spenser confidential',
  'enola holmes',
  'enola holmes 2',
  'murder mystery',
  'murder mystery 2',
  'me time',
  'the man from toronto',
  'day shift',
  'slumberland',
  'guillermo del toro s pinocchio',
  'pinocchio',
  'nimona',
  'the sea beast',
  'orion and the dark',
  'spellbound',
  'spider man into the spider verse',
  'spider man across the spider verse',
  'spider man no way home',
  'the batman',
  'interstellar',
  'inception',
  'oppenheimer',
  'dune',
  'dune part one',
  'dune part two',
  'godzilla vs kong',
  'kong skull island',
  'pacific rim',
  'transformers',
  'fast and furious',
  'fast & furious',
  'f9',
  'jurassic park',
  'jurassic world',
  'mission impossible',
  'top gun',
  'top gun maverick',
  'john wick',
  'john wick chapter 4',
  'matrix',
  'the matrix',
  'the matrix ressurections',
  'the matrix resurrections',
  'avatar',
  'avatar the way of water',
  'gladiator',
  'titanic',
  'bullet train',
  'uncharted',
  'morbius',
  'venom',
  'venom let there be carnage',
  'ghostbusters afterlife',
  'ghostbusters frozen empire',
  'bad boys for life',
  'bad boys ride or die',
  'jumanji the next level',
  'jumanji welcome to the jungle',
  'where the crawdads sing',
  'superbad',
  'sully',
  'the trial of the chicago 7',
  'the woman in the window',
  'the unforgivable',
  'reptile',
  'the killer',
  'the school for good and evil',
  'the ballad of buster scruggs',
]);

// Known international titles (Korean dramas, Japanese anime/live-action, European)
// that have official English audio/dubbing tracks on Netflix
export const NETFLIX_ENGLISH_DUBBED_TITLES: Set<string> = new Set([
  // K-Dramas & Korean Movies with English Dub on Netflix
  'squid game',
  'all of us are dead',
  'hellbound',
  'sweet home',
  'my name',
  'the glory',
  'vincenzo',
  'extracurricular',
  'the silent sea',
  'kingdom',
  'kingdom ashin of the north',
  'bloodhounds',
  'celebrity',
  'mask girl',
  'doona',
  'daily dose of sunshine',
  'gyeongseong creature',
  'a killer paradox',
  'hierarchy',
  'the 8 show',
  'the whirlpool',
  'parasyte the grey',
  'song of the bandits',
  'black knight',
  'kill boksoon',
  'ballerina',
  'badland hunters',
  'officer black belt',
  'space sweepers',
  'the call',
  'unlocked',
  'seoul vibe',
  'yaksha ruthless operations',
  'jung e',
  'along with the gods',
  'psychokinesis',
  'revelations',
  'bogota',
  'the frog',
  'the good bad mother',
  'the chase',

  // Anime & Japanese with English Dub
  'baki',
  'baki hanma',
  'blue eye samurai',
  'vinland saga',
  'pluto',
  'rurouni kenshin',
  'ranma',
  'ranma1 2',
  'ranma 1 2',
  'sakamoto days',
  'godzilla minus one',
  'maboroshi',
  'words bubble up like soda pop',
  'the orbital children',
  'dorohedoro',
  'dr stone',
  'fairy tail',
  'black clover',
  'hells paradise',
  'made in abyss',
  'forest of piano',
  'hajime no ippo',
  'case closed',
  'that time i got reincarnated as a slime',
  'uzumaki',
  'switched',
  'the days',
  'your turn to kill',
  'the boy and the heron',
  'blade of the immortal',
  'cyberpunk edgerunners',
  'arcane',
  'castlevania',
  'demon slayer',
  'jujutsu kaisen',
  'attack on titan',
  'naruto',
  'death note',
  'hunter x hunter',
  'spy x family',
  'chainsaw man',
  'my hero academia',
  'tokyo ghoul',
  'parasyte',
  'solo leveling',
  'kaiju no 8',
  'delicious in dungeon',
  'suzume',
  'bubble',
  'a whisker away',
  'drifting home',
  'alice in borderland',

  // European / Non-English series with English Dub
  'money heist',
  'dark',
  'lupin',
  'elite',
  'berlin',
  'the asunta case',
  'below zero',
  'under her control',
  'mirage',
  'ganglands',
  'kleo',
  'ragnarok',
  '1899',
  'who killed sara',
  'the innocent',
  'society of the snow',
  'nowhere',
]);

/**
 * Checks if an item has a specific language.
 *
 * STRICT MODE: Only trusts actual API-returned language data (languages[] and originalLanguage).
 * The curated title-set lookups (NETFLIX_HINDI_DUBBED_TITLES etc.) are used ONLY as a fallback
 * when an item has zero language data at all (un-enriched / manually added titles).
 * Country-of-origin is NOT used to infer audio language — a Korean film made in Korea
 * is not necessarily available in Hindi just because it's popular.
 *
 * To correct a wrong badge, open the title's detail panel and use the Audio & Dubbing
 * toggle buttons to manually add/remove language tracks.
 */
export function itemHasLanguage(
  item: {
    originalTitle?: string;
    externalTitle?: string;
    languages?: string[];
    originalLanguage?: string;
    countries?: string[];
  },
  targetLang: string
): boolean {
  const normTarget = targetLang.toLowerCase().trim();
  const langs = (item.languages || []).map((l) => l.toLowerCase());
  const orig = (item.originalLanguage || '').toLowerCase();
  // Has the item been enriched with real language data?
  const hasApiData = langs.length > 0 || orig.length > 0;

  if (normTarget === 'hi' || normTarget === 'hindi') {
    // Strict: check actual language data first
    if (langs.some((l) => l === 'hi' || l === 'hin' || l.includes('hindi') || l.includes('हिन्दी'))) return true;
    if (orig === 'hi' || orig === 'hin') return true;

    // Fallback to curated list ONLY if item has no language data yet (not enriched)
    if (!hasApiData) {
      const t1 = normalizeTitle(item.originalTitle || '');
      const t2 = normalizeTitle(item.externalTitle || '');
      if (t1 && NETFLIX_HINDI_DUBBED_TITLES.has(t1)) return true;
      if (t2 && NETFLIX_HINDI_DUBBED_TITLES.has(t2)) return true;
    }

    return false;
  }

  if (normTarget === 'en' || normTarget === 'english') {
    // Strict: check actual language data first
    if (langs.some((l) => l === 'en' || l === 'eng' || l.includes('english'))) return true;
    if (orig === 'en' || orig === 'eng') return true;

    // Fallback to curated list ONLY if item has no language data yet
    if (!hasApiData) {
      const t1 = normalizeTitle(item.originalTitle || '');
      const t2 = normalizeTitle(item.externalTitle || '');
      if (t1 && NETFLIX_ENGLISH_DUBBED_TITLES.has(t1)) return true;
      if (t2 && NETFLIX_ENGLISH_DUBBED_TITLES.has(t2)) return true;
    }

    return false;
  }

  if (normTarget === 'ja' || normTarget === 'japanese' || normTarget === 'jap') {
    if (langs.some((l) => l === 'ja' || l === 'jpn' || l.includes('japan'))) return true;
    if (orig === 'ja' || orig === 'jpn') return true;
    return false;
  }

  if (normTarget === 'ko' || normTarget === 'korean') {
    if (langs.some((l) => l === 'ko' || l === 'kor' || l.includes('korea'))) return true;
    if (orig === 'ko' || orig === 'kor') return true;
    return false;
  }

  if (normTarget === 'zh' || normTarget === 'chinese' || normTarget === 'mandarin' || normTarget === 'cantonese') {
    if (langs.some((l) => l === 'zh' || l === 'zho' || l === 'cmn' || l === 'yue' || l.includes('chinese') || l.includes('mandarin') || l.includes('cantonese'))) return true;
    if (orig === 'zh' || orig === 'zho' || orig === 'cmn') return true;
    return false;
  }

  // "Asian" aggregate filter — matches any East/Southeast Asian language:
  // Chinese, Japanese, Korean, Thai, Taiwanese, Vietnamese, Taiwanese, Indonesian, etc.
  if (normTarget === 'asian') {
    const asianOrigCodes = ['zh', 'zho', 'ja', 'jpn', 'ko', 'kor', 'th', 'vi', 'id', 'ms', 'tl', 'cmn', 'yue'];
    const asianLangKeywords = ['chinese', 'japanese', 'korean', 'thai', 'vietnamese', 'indonesian', 'malay', 'mandarin', 'cantonese', 'tagalog'];
    if (asianOrigCodes.includes(orig)) return true;
    if (langs.some((l) => asianOrigCodes.includes(l) || asianLangKeywords.some((k) => l.includes(k)))) return true;
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
export function getPriorityLanguageBadge(item: {
  originalTitle?: string;
  externalTitle?: string;
  languages?: string[];
  originalLanguage?: string;
  countries?: string[];
}): LanguageBadgeInfo | null {
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

  if (itemHasLanguage(item, 'chinese')) {
    return {
      code: 'other',
      label: 'Chinese',
      badge: 'CHN',
      bgClass: 'bg-teal-600/90 text-white border-teal-400/50',
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

