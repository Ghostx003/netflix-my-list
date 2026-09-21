/**
 * Theme categorization dictionary and mapping engine.
 * Maps granular TMDB keywords and genre concepts to curated, high-level cinematic themes.
 */

export const CANONICAL_THEMES = [
  'Psychological',
  'Mind-Bending / Mind Game',
  'Serial Killer',
  'Heist / Con',
  'Revenge',
  'Dystopian / Cyberpunk',
  'Survival',
  'Time Travel / Multiverse',
  'Dark Mystery',
  'Political Intrigue',
  'Supernatural / Occult',
  'Coming of Age',
  'Slow Burn',
  'True Crime / Real Life',
  'Underdog / Sports',
  'Romantic Tension',
  'Family Drama',
  'Espionage / Spy',
  'Mob / Underworld',
  'Post-Apocalyptic',
  'Whodunit / Detective',
  'Courtroom / Legal Drama',
  'Space / Cosmic',
] as const;

export type CanonicalTheme = typeof CANONICAL_THEMES[number];

/**
 * Keyword-to-theme rules mapping raw TMDB keywords, phrases, and title concepts
 */
const KEYWORD_THEME_RULES: Record<string, CanonicalTheme> = {
  // Psychological & Mind-bending
  'psychological': 'Psychological',
  'psychological thriller': 'Psychological',
  'mental illness': 'Psychological',
  'paranoia': 'Psychological',
  'hallucination': 'Psychological',
  'mind-bending': 'Mind-Bending / Mind Game',
  'mind game': 'Mind-Bending / Mind Game',
  'alternate reality': 'Mind-Bending / Mind Game',
  'amnesia': 'Mind-Bending / Mind Game',
  'unreliable narrator': 'Mind-Bending / Mind Game',
  'plot twist': 'Mind-Bending / Mind Game',
  'surrealism': 'Mind-Bending / Mind Game',
  'simulation': 'Mind-Bending / Mind Game',

  // Crime, Serial Killers & Heists
  'serial killer': 'Serial Killer',
  'psychopath': 'Serial Killer',
  'sociopath': 'Serial Killer',
  'mass murder': 'Serial Killer',
  'heist': 'Heist / Con',
  'bank robbery': 'Heist / Con',
  'con artist': 'Heist / Con',
  'robbery': 'Heist / Con',
  'scam': 'Heist / Con',
  'thief': 'Heist / Con',

  // Revenge & Underworld
  'revenge': 'Revenge',
  'vengeance': 'Revenge',
  'retribution': 'Revenge',
  'vigilante': 'Revenge',
  'vendetta': 'Revenge',
  'organized crime': 'Mob / Underworld',
  'gangster': 'Mob / Underworld',
  'mafia': 'Mob / Underworld',
  'drug cartel': 'Mob / Underworld',
  'underworld': 'Mob / Underworld',
  'yakuza': 'Mob / Underworld',
  'triad': 'Mob / Underworld',
  'cartel': 'Mob / Underworld',

  // Survival & Dystopia
  'survival': 'Survival',
  'battle royale': 'Survival',
  'stranded': 'Survival',
  'wilderness': 'Survival',
  'shipwreck': 'Survival',
  'death game': 'Survival',
  'dystopia': 'Dystopian / Cyberpunk',
  'dystopian': 'Dystopian / Cyberpunk',
  'cyberpunk': 'Dystopian / Cyberpunk',
  'totalitarianism': 'Dystopian / Cyberpunk',
  'authoritarian': 'Dystopian / Cyberpunk',
  'post-apocalyptic': 'Post-Apocalyptic',
  'apocalypse': 'Post-Apocalyptic',
  'nuclear holocaust': 'Post-Apocalyptic',
  'zombie': 'Post-Apocalyptic',

  // Time Travel & Sci-Fi
  'time travel': 'Time Travel / Multiverse',
  'time loop': 'Time Travel / Multiverse',
  'multiverse': 'Time Travel / Multiverse',
  'parallel universe': 'Time Travel / Multiverse',
  'space': 'Space / Cosmic',
  'astronaut': 'Space / Cosmic',
  'outer space': 'Space / Cosmic',
  'alien': 'Space / Cosmic',
  'extraterrestrial': 'Space / Cosmic',

  // Mystery & Espionage
  'mystery': 'Dark Mystery',
  'dark mystery': 'Dark Mystery',
  'conspiracy': 'Dark Mystery',
  'secret': 'Dark Mystery',
  'whodunit': 'Whodunit / Detective',
  'detective': 'Whodunit / Detective',
  'police procedural': 'Whodunit / Detective',
  'investigation': 'Whodunit / Detective',
  'murder mystery': 'Whodunit / Detective',
  'spy': 'Espionage / Spy',
  'espionage': 'Espionage / Spy',
  'secret agent': 'Espionage / Spy',
  'intelligence agency': 'Espionage / Spy',
  'undercover': 'Espionage / Spy',
  'cold war': 'Espionage / Spy',

  // Politics & Courtroom
  'politics': 'Political Intrigue',
  'political': 'Political Intrigue',
  'corruption': 'Political Intrigue',
  'election': 'Political Intrigue',
  'president': 'Political Intrigue',
  'courtroom': 'Courtroom / Legal Drama',
  'lawyer': 'Courtroom / Legal Drama',
  'trial': 'Courtroom / Legal Drama',
  'legal': 'Courtroom / Legal Drama',

  // Supernatural & Occult
  'supernatural': 'Supernatural / Occult',
  'occult': 'Supernatural / Occult',
  'ghost': 'Supernatural / Occult',
  'demon': 'Supernatural / Occult',
  'exorcism': 'Supernatural / Occult',
  'witch': 'Supernatural / Occult',
  'curse': 'Supernatural / Occult',
  'haunted house': 'Supernatural / Occult',

  // Drama, Romance, Sports
  'coming of age': 'Coming of Age',
  'adolescence': 'Coming of Age',
  'high school': 'Coming of Age',
  'youth': 'Coming of Age',
  'teenager': 'Coming of Age',
  'slow burn': 'Slow Burn',
  'atmosphere': 'Slow Burn',
  'true story': 'True Crime / Real Life',
  'based on true story': 'True Crime / Real Life',
  'biography': 'True Crime / Real Life',
  'sports': 'Underdog / Sports',
  'underdog': 'Underdog / Sports',
  'athlete': 'Underdog / Sports',
  'boxing': 'Underdog / Sports',
  'football': 'Underdog / Sports',
  'romance': 'Romantic Tension',
  'love triangle': 'Romantic Tension',
  'forbidden love': 'Romantic Tension',
  // Action, Adventure, Crime, Drama
  'action': 'Survival',
  'superhero': 'Survival',
  'martial arts': 'Survival',
  'assassin': 'Revenge',
  'hitman': 'Revenge',
  'bounty hunter': 'Survival',
  'detective fiction': 'Whodunit / Detective',
  'police': 'Whodunit / Detective',
  'investigator': 'Whodunit / Detective',
  'forensics': 'Whodunit / Detective',
  'noir': 'Dark Mystery',
  'neo-noir': 'Dark Mystery',
  'murder': 'Dark Mystery',
  'homicide': 'Dark Mystery',
  'hostage': 'Survival',
  'kidnapping': 'Survival',
  'escape': 'Survival',
  'prison': 'Survival',
  'jail': 'Survival',
  'treasure hunt': 'Heist / Con',
  'gambling': 'Heist / Con',
  'casino': 'Heist / Con',
  'espionage thriller': 'Espionage / Spy',
  'cia': 'Espionage / Spy',
  'fbi': 'Whodunit / Detective',
  'kgb': 'Espionage / Spy',
  'mi6': 'Espionage / Spy',
  'cyber': 'Dystopian / Cyberpunk',
  'hacker': 'Dystopian / Cyberpunk',
  'artificial intelligence': 'Dystopian / Cyberpunk',
  'robot': 'Dystopian / Cyberpunk',
  'android': 'Dystopian / Cyberpunk',
  'cyborg': 'Dystopian / Cyberpunk',
  'virtual reality': 'Mind-Bending / Mind Game',
  'galaxy': 'Space / Cosmic',
  'spaceship': 'Space / Cosmic',
  'space travel': 'Space / Cosmic',
  'mars': 'Space / Cosmic',
  'monster': 'Supernatural / Occult',
  'vampire': 'Supernatural / Occult',
  'werewolf': 'Supernatural / Occult',
  'witchcraft': 'Supernatural / Occult',
  'cult': 'Supernatural / Occult',
  'possession': 'Supernatural / Occult',
  'afterlife': 'Supernatural / Occult',
  'reincarnation': 'Supernatural / Occult',
  'royal family': 'Family Drama',
  'royalty': 'Political Intrigue',
  'monarchy': 'Political Intrigue',
  'war': 'Survival',
  'world war': 'Survival',
  'military': 'Survival',
  'soldier': 'Survival',
  'historical': 'True Crime / Real Life',
  'documentary': 'True Crime / Real Life',
  'chess': 'Mind-Bending / Mind Game',
  'competition': 'Underdog / Sports',
  'tournament': 'Underdog / Sports',
  'rivalry': 'Underdog / Sports',
  'court': 'Courtroom / Legal Drama',
  'prosecutor': 'Courtroom / Legal Drama',
  'judge': 'Courtroom / Legal Drama',
  'defense attorney': 'Courtroom / Legal Drama',
  'romance drama': 'Romantic Tension',
  'unrequited love': 'Romantic Tension',
  'marriage': 'Family Drama',
  'divorce': 'Family Drama',
  'mother son relationship': 'Family Drama',
  'father daughter relationship': 'Family Drama',
  'friendship': 'Coming of Age',
  'school': 'Coming of Age',
  'university': 'Coming of Age',
  'college': 'Coming of Age',
  'growing up': 'Coming of Age',
};

/**
 * Extracts normalized canonical themes from raw TMDB keywords and overview text
 */
export function extractThemesFromKeywords(
  rawKeywords: string[],
  genres: string[] = [],
  synopsis?: string
): string[] {
  const matchedThemes = new Set<string>();
  const normalizedKeywords = rawKeywords.map((k) => k.toLowerCase().trim());
  const synopsisLower = (synopsis || '').toLowerCase();

  // 1. Direct keyword match and fuzzy substring match
  for (const kw of normalizedKeywords) {
    if (KEYWORD_THEME_RULES[kw]) {
      matchedThemes.add(KEYWORD_THEME_RULES[kw]);
    } else {
      for (const [ruleKey, theme] of Object.entries(KEYWORD_THEME_RULES)) {
        if (kw.includes(ruleKey) || ruleKey.includes(kw)) {
          matchedThemes.add(theme);
        }
      }
    }
  }

  // 2. High-signal phrases in synopsis
  if (synopsisLower.includes('serial killer') || synopsisLower.includes('psychopath')) {
    matchedThemes.add('Serial Killer');
  }
  if (synopsisLower.includes('heist') || synopsisLower.includes('bank robbery') || synopsisLower.includes('con artist')) {
    matchedThemes.add('Heist / Con');
  }
  if (synopsisLower.includes('revenge') || synopsisLower.includes('avenge') || synopsisLower.includes('vendetta')) {
    matchedThemes.add('Revenge');
  }
  if (synopsisLower.includes('dystopian') || synopsisLower.includes('totalitarian') || synopsisLower.includes('cyberpunk') || synopsisLower.includes('futuristic')) {
    matchedThemes.add('Dystopian / Cyberpunk');
  }
  if (synopsisLower.includes('time travel') || synopsisLower.includes('time loop') || synopsisLower.includes('parallel universe')) {
    matchedThemes.add('Time Travel / Multiverse');
  }
  if (synopsisLower.includes('whodunit') || synopsisLower.includes('murder investigation') || synopsisLower.includes('detective')) {
    matchedThemes.add('Whodunit / Detective');
  }
  if (synopsisLower.includes('supernatural') || synopsisLower.includes('demonic') || synopsisLower.includes('haunted') || synopsisLower.includes('ghost')) {
    matchedThemes.add('Supernatural / Occult');
  }
  if (synopsisLower.includes('conspiracy') || synopsisLower.includes('political corruption') || synopsisLower.includes('election') || synopsisLower.includes('politician')) {
    matchedThemes.add('Political Intrigue');
  }
  if (synopsisLower.includes('survival') || synopsisLower.includes('fight for survival') || synopsisLower.includes('death game') || synopsisLower.includes('stranded')) {
    matchedThemes.add('Survival');
  }
  if (synopsisLower.includes('espionage') || synopsisLower.includes('secret agent') || synopsisLower.includes('undercover agent') || synopsisLower.includes('spy')) {
    matchedThemes.add('Espionage / Spy');
  }
  if (synopsisLower.includes('mafia') || synopsisLower.includes('gangster') || synopsisLower.includes('cartel') || synopsisLower.includes('organized crime')) {
    matchedThemes.add('Mob / Underworld');
  }
  if (synopsisLower.includes('psychological') || synopsisLower.includes('mind game') || synopsisLower.includes('hallucination') || synopsisLower.includes('paranoia')) {
    matchedThemes.add('Psychological');
  }
  if (synopsisLower.includes('chess') || synopsisLower.includes('prodigy') || synopsisLower.includes('mastermind')) {
    matchedThemes.add('Mind-Bending / Mind Game');
  }
  if (synopsisLower.includes('sports') || synopsisLower.includes('champion') || synopsisLower.includes('underdog') || synopsisLower.includes('tournament')) {
    matchedThemes.add('Underdog / Sports');
  }
  if (synopsisLower.includes('romance') || synopsisLower.includes('in love') || synopsisLower.includes('romantic')) {
    matchedThemes.add('Romantic Tension');
  }
  if (synopsisLower.includes('family') || synopsisLower.includes('father') || synopsisLower.includes('mother') || synopsisLower.includes('brother') || synopsisLower.includes('sister')) {
    matchedThemes.add('Family Drama');
  }

  // 3. Fallbacks based on genres to guarantee EVERY title receives rich theme categorization
  if (matchedThemes.size === 0) {
    if (genres.includes('Mystery') || (genres.includes('Crime') && genres.includes('Drama'))) {
      matchedThemes.add('Dark Mystery');
      matchedThemes.add('Whodunit / Detective');
    } else if (genres.includes('Science Fiction')) {
      matchedThemes.add('Dystopian / Cyberpunk');
    } else if (genres.includes('Horror') || genres.includes('Fantasy')) {
      matchedThemes.add('Supernatural / Occult');
    } else if (genres.includes('Crime')) {
      matchedThemes.add('Mob / Underworld');
    } else if (genres.includes('Thriller')) {
      matchedThemes.add('Psychological');
    } else if (genres.includes('Action') || genres.includes('Adventure')) {
      matchedThemes.add('Survival');
    } else if (genres.includes('Romance')) {
      matchedThemes.add('Romantic Tension');
    } else if (genres.includes('Documentary') || genres.includes('History')) {
      matchedThemes.add('True Crime / Real Life');
    } else if (genres.includes('Drama')) {
      matchedThemes.add('Family Drama');
    } else if (genres.includes('Comedy')) {
      matchedThemes.add('Coming of Age');
    } else {
      matchedThemes.add('Slow Burn');
    }
  }

  return Array.from(matchedThemes);
}

/**
 * Generates a concise, punchy 1-line hook/tagline from the synopsis if an official marketing tagline is missing.
 * Ensures every entertainment entity has an engaging 1-line tagline on cards and details.
 */
export function generateFallbackTagline(synopsis?: string, title?: string): string | undefined {
  if (!synopsis) return undefined;
  const clean = synopsis
    .replace(/^["'“]+|["'”]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean || clean.length < 15) return undefined;

  // Attempt to split at first sentence boundary
  const sentenceMatch = clean.match(/^([^.!?]+[.!?])/);
  let candidate = sentenceMatch ? sentenceMatch[1].trim() : clean;

  // If the first sentence is within 120 characters, it makes a great 1-line tagline
  if (candidate.length <= 110) {
    // Strip trailing period for punchy tagline look
    return candidate.replace(/[.]+$/, '').trim();
  }

  // If too long, break at comma, semicolon, dash, or em-dash within 40-100 characters
  const clauseMatch = candidate.slice(0, 105).match(/^([^,;—–-]+[,;—–-])/);
  if (clauseMatch && clauseMatch[1].length >= 35) {
    return clauseMatch[1].replace(/[,;—–-]+$/, '').trim();
  }

  // Fallback: truncate at last word boundary before 95 characters
  const truncated = candidate.slice(0, 95);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > 35) {
    return `${truncated.slice(0, lastSpace).trim()}...`;
  }

  return `${truncated.trim()}...`;
}
