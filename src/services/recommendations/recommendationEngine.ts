import {
  CustomPreference,
  DiscoveryTitle,
  LibraryItem,
  RecommendationCandidate,
  RecommendationRowData,
  UserTasteProfile,
} from '../../types';
import { parseCustomPreference, StructuredIntent } from './intentParser';
import { rankAndExplainWithQwen } from './recommendationRanker';
import { sanitizeImageUrl } from '../imageResolver';
import { isNetflixIndiaAvailable } from '../normalizer';

export interface RecommendationEngineParams {
  catalog: DiscoveryTitle[];
  libraryItems: LibraryItem[];
  userProfile: UserTasteProfile;
  selectedGenres: string[];
  selectedThemes: string[];
  customPreferences: CustomPreference[];
  excludeItemIds?: Set<string>;
  explorationFactor?: number; // 0.0 to 0.3
  requestedLovedTitle?: string;
}


export interface RecommendationEngineOutput {
  hero: RecommendationCandidate | null;
  rows: RecommendationRowData[];
  customPicks: RecommendationCandidate[];
  isFallback: boolean;
  fallbackMessage?: string;
}

/**
 * Normalizes title string for duplicate checking.
 */
function normalizeKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

/**
 * Calculates a match score for a candidate title against user taste, explicit filters,
 * and custom prompt intents.
 */
function scoreTitleCandidate(
  item: DiscoveryTitle,
  params: {
    userProfile: UserTasteProfile;
    selectedGenres: string[];
    selectedThemes: string[];
    customIntents: { intent: StructuredIntent; weight: number }[];
    explorationFactor: number;
  }
): RecommendationCandidate {
  const { userProfile, selectedGenres, selectedThemes, customIntents, explorationFactor } = params;

  const itemGenres = (item.genres || []).map((g) => g.trim());
  const itemThemes = (item.themes || []).map((t) => t.trim());
  const itemSynopsis = (item.synopsis || '').toLowerCase();
  const itemTitle = (item.title || '').toLowerCase();

  // 1. Explicit Genre Match (0.0 to 1.0)
  let genreMatch = 0.5;
  if (selectedGenres.length > 0) {
    const hits = selectedGenres.filter((sg) =>
      itemGenres.some((ig) => ig.toLowerCase() === sg.toLowerCase())
    );
    genreMatch = hits.length > 0 ? 0.7 + (hits.length / selectedGenres.length) * 0.3 : 0.1;
  }

  // 2. Explicit Theme Match (0.0 to 1.0)
  let themeMatch = 0.5;
  if (selectedThemes.length > 0) {
    const hits = selectedThemes.filter((st) =>
      itemThemes.some((it) => it.toLowerCase().includes(st.toLowerCase()) || st.toLowerCase().includes(it.toLowerCase()))
    );
    themeMatch = hits.length > 0 ? 0.75 + (hits.length / selectedThemes.length) * 0.25 : 0.1;
  }

  // 3. User Historical Taste Match (0.0 to 1.0)
  let tasteScore = 0.5;
  if (!userProfile.isColdStart) {
    let genreTaste = 0;
    for (const g of itemGenres) {
      if (userProfile.genreWeights[g]) {
        genreTaste = Math.max(genreTaste, userProfile.genreWeights[g]);
      }
    }
    let themeTaste = 0;
    for (const t of itemThemes) {
      if (userProfile.themeWeights[t]) {
        themeTaste = Math.max(themeTaste, userProfile.themeWeights[t]);
      }
    }
    // Director affinity
    let directorAffinity = 0;
    if (item.director && userProfile.preferredDirectors.includes(item.director)) {
      directorAffinity = 0.3;
    }
    tasteScore = Math.min(1.0, 0.45 * genreTaste + 0.45 * themeTaste + directorAffinity);
  }

  // 4. Custom Intent Match (0.0 to 1.0, weighted by priority order)
  let customIntentScore = 0.0;
  const matchedConcepts: string[] = [];
  if (customIntents.length > 0) {
    let totalCustomWeight = 0;
    let earnedCustomScore = 0;

    for (const { intent, weight } of customIntents) {
      totalCustomWeight += weight;
      let intentHits = 0;

      // Genre overlap
      for (const ig of intent.genres) {
        if (itemGenres.some((g) => g.toLowerCase() === ig.toLowerCase())) {
          intentHits += 0.35;
          matchedConcepts.push(ig);
        }
      }

      // Theme overlap
      for (const it of intent.themes) {
        if (itemThemes.some((t) => t.toLowerCase().includes(it.toLowerCase()) || it.toLowerCase().includes(t.toLowerCase()))) {
          intentHits += 0.45;
          matchedConcepts.push(it);
        }
      }

      // Semantic concept in synopsis / title / enriched narrative dimensions
      for (const concept of intent.semantic_concepts) {
        const cLower = concept.toLowerCase();
        if (itemSynopsis.includes(cLower) || itemTitle.includes(cLower)) {
          intentHits += 0.4;
          matchedConcepts.push(concept);
        }

        // Match against SQLite enriched knowledge base narrative dimensions
        if (item.storyPace && item.storyPace.toLowerCase().includes(cLower)) {
          intentHits += 0.5;
          matchedConcepts.push(`${item.storyPace} pace`);
        }
        if (item.endingType && item.endingType.toLowerCase().includes(cLower)) {
          intentHits += 0.5;
          matchedConcepts.push(`${item.endingType} ending`);
        }
        if (item.settingEnvironment && item.settingEnvironment.toLowerCase().includes(cLower)) {
          intentHits += 0.45;
          matchedConcepts.push(item.settingEnvironment);
        }
        if (item.audienceVibe && item.audienceVibe.toLowerCase().includes(cLower)) {
          intentHits += 0.45;
          matchedConcepts.push(item.audienceVibe);
        }
        if (item.narrativeArchetypes && item.narrativeArchetypes.some((na) => na.toLowerCase().includes(cLower))) {
          intentHits += 0.5;
          matchedConcepts.push(concept);
        }

        // Match against 100 continuous parameters
        if (item.parameters_100) {
          const normKey = cLower.replace(/[-\s]/g, '_');
          for (const [pKey, pVal] of Object.entries(item.parameters_100)) {
            if ((pKey.includes(normKey) || normKey.includes(pKey)) && pVal >= 0.55) {
              intentHits += 0.5 * pVal;
              matchedConcepts.push(`${pKey.replace(/_/g, ' ')} (${Math.round(pVal * 100)}%)`);
              break;
            }
          }
        }
      }

      // Reference title similarity
      if (intent.reference_titles && intent.reference_titles.length > 0) {
        for (const ref of intent.reference_titles) {
          if (itemTitle.includes(ref.toLowerCase())) {
            // Exclude the exact reference title itself
            intentHits = -1.0;
            break;
          }
        }
      }

      earnedCustomScore += Math.max(0, Math.min(1.0, intentHits)) * weight;
    }

    customIntentScore = totalCustomWeight > 0 ? earnedCustomScore / totalCustomWeight : 0;
  }

  // 5. Quality Score (Bayesian rating: IMDb / Rotten Tomatoes)
  const imdb = item.imdbRating || item.rating || 6.5;
  const votes = item.voteCount || 500;
  const rt = item.rottenTomatoesRating ? item.rottenTomatoesRating / 10 : imdb;
  const effectiveRating = (imdb * 0.7 + rt * 0.3);
  const qualityScore = Math.max(0, Math.min(1.0, ((votes / (votes + 400)) * effectiveRating + (400 / (votes + 400)) * 6.5 - 1) / 9));

  // 6. Exploration Factor (controlled stochastic noise)
  const explorationBonus = (Math.random() - 0.5) * explorationFactor;

  // Composite Final Score:
  // Custom Intent takes highest weight when present.
  let finalScore = 0;
  if (customIntents.length > 0) {
    finalScore =
      0.40 * customIntentScore +
      0.18 * genreMatch +
      0.15 * themeMatch +
      0.12 * tasteScore +
      0.15 * qualityScore +
      explorationBonus;
  } else if (selectedGenres.length > 0 || selectedThemes.length > 0) {
    finalScore =
      0.35 * genreMatch +
      0.30 * themeMatch +
      0.20 * tasteScore +
      0.15 * qualityScore +
      explorationBonus;
  } else {
    // Pure personalized browsing mode
    finalScore =
      0.45 * tasteScore +
      0.25 * qualityScore +
      0.15 * genreMatch +
      0.15 * themeMatch +
      explorationBonus;
  }

  const boundedScore = Math.max(0.1, Math.min(0.99, finalScore));
  const matchPercentage = Math.round(boundedScore * 100);

  // Generate crisp Netflix-style explanation
  const reasons: string[] = [];
  if (matchedConcepts.length > 0) {
    reasons.push(`Matches your interest in ${Array.from(new Set(matchedConcepts)).slice(0, 2).join(' & ')}`);
  } else if (itemThemes.length > 0) {
    reasons.push(`Features ${itemThemes.slice(0, 2).join(' and ')}`);
  } else if (itemGenres.length > 0) {
    reasons.push(`Top-rated in ${itemGenres.slice(0, 2).join(' & ')}`);
  } else {
    reasons.push(`Handpicked for your profile`);
  }

  return {
    item,
    score: Math.round(boundedScore * 100) / 100,
    matchPercentage,
    reason: reasons[0],
    matchedPreferences: Array.from(new Set(matchedConcepts)),
    breakdown: {
      genreMatch: Math.round(genreMatch * 100) / 100,
      themeMatch: Math.round(themeMatch * 100) / 100,
      customIntentMatch: Math.round(customIntentScore * 100) / 100,
      tasteMatch: Math.round(tasteScore * 100) / 100,
      qualityScore: Math.round(qualityScore * 100) / 100,
      explorationBonus: Math.round(explorationBonus * 100) / 100,
    },
  };
}

interface AnchorTasteProfile {
  genres: string[];
  themes: string[];
  keywords: string[];
  directors?: string[];
  subtitle?: string;
}

const CURATED_ANCHOR_PROFILES: Record<string, AnchorTasteProfile> = {
  'dark': {
    genres: ['sci-fi', 'mystery', 'thriller', 'drama'],
    themes: ['time travel', 'time paradox', 'existential dread', 'small town secrets', 'dystopian', 'puzzle', 'supernatural', 'missing children', 'parallel dimensions'],
    keywords: ['time', 'loop', 'temporal', 'dark', 'missing', 'cave', 'portal', 'secrets', 'future', 'past', 'apocalypse', 'nuclear', 'family secrets', 'cycle'],
    subtitle: 'Temporal loops, existential dread, and intricate mind-bending puzzles',
  },
  'breaking bad': {
    genres: ['crime', 'drama', 'thriller'],
    themes: ['anti-hero', 'moral corruption', 'drug empire', 'survival', 'organized crime', 'heist & crime', 'downfall', 'double life', 'cartel warfare'],
    keywords: ['cartel', 'drugs', 'criminal', 'underworld', 'meth', 'empire', 'money', 'family', 'dea', 'kingpin', 'chemistry', 'ruthless', 'lawyer'],
    subtitle: 'Moral descent, high-stakes underworld crime, and calculating anti-heroes',
  },
  'inception': {
    genres: ['sci-fi', 'action', 'thriller', 'mystery'],
    themes: ['heist', 'subconscious', 'mind-bending', 'time paradox', 'reality vs illusion', 'technology', 'conspiracy', 'dream architecture'],
    keywords: ['dream', 'reality', 'subconscious', 'mind', 'heist', 'mission', 'illusion', 'architect', 'nolan', 'totem', 'limbo', 'paradox'],
    directors: ['christopher nolan'],
    subtitle: 'Layered realities, reality-bending architecture, and high-concept heists',
  },
  'interstellar': {
    genres: ['sci-fi', 'adventure', 'drama'],
    themes: ['deep space', 'black hole', 'time dilation', 'parental sacrifice', 'survival', 'cosmic wonder', 'physics', 'planetary exploration'],
    keywords: ['space', 'wormhole', 'relativity', 'nasa', 'fourth dimension', 'gravity', 'dust', 'galaxy', 'planet', 'nolan', 'cooper', 'cosmic'],
    directors: ['christopher nolan'],
    subtitle: 'Breathtaking cosmic voyages, time dilation, and profound human bonds',
  },
  'the queen\'s gambit': {
    genres: ['drama'],
    themes: ['chess prodigy', 'obsession', 'addiction', 'genius', 'cold war era', 'psychological depth', 'mastery'],
    keywords: ['chess', 'grandmaster', 'beth', 'pills', 'board', 'tournament', 'prodigy', 'moscow', 'genius'],
    subtitle: 'Obsessive genius, high-stakes intellectual battles, and personal redemption',
  },
  'stranger things': {
    genres: ['sci-fi', 'horror', 'mystery', 'adventure'],
    themes: ['supernatural', 'coming of age', 'monsters', 'friendship', 'government conspiracy', 'nostalgia', '80s', 'alternate dimension'],
    keywords: ['monster', 'lab', 'dimension', 'portal', 'teens', 'powers', 'creature', 'small town', 'supernatural', 'upside down', 'telepathic', '80s'],
    subtitle: 'Supernatural conspiracies, nostalgic 80s adventures, and otherworldly dread',
  },
  'mindhunter': {
    genres: ['crime', 'mystery', 'drama', 'thriller'],
    themes: ['psychological profiling', 'serial killers', 'detective', 'investigation', 'police procedural', 'darkness', 'cold cases'],
    keywords: ['fbi', 'profiler', 'serial killer', 'interrogation', 'psychopath', 'murder', 'detective', 'case', 'fincher', 'behavioral', 'mind'],
    directors: ['david fincher'],
    subtitle: 'Obsessive forensic psychology, serial killer profiling, and cold procedural tension',
  },
  'tenet': {
    genres: ['sci-fi', 'action', 'thriller'],
    themes: ['entropy inversion', 'temporal pincer', 'espionage', 'cold war', 'time paradox', 'world destruction', 'quantum physics'],
    keywords: ['inversion', 'entropy', 'pincer', 'opera', 'algorithm', 'turnstile', 'time', 'cia', 'sator', 'nolan', 'spy', 'bullet'],
    directors: ['christopher nolan'],
    subtitle: 'High-octane temporal inversion, global espionage, and non-linear warfare',
  },
  'black mirror': {
    genres: ['sci-fi', 'drama', 'thriller', 'mystery'],
    themes: ['tech dystopia', 'technological horror', 'societal paranoia', 'anthology', 'cynical satire', 'ai', 'cyberpunk'],
    keywords: ['technology', 'social media', 'virtual', 'chip', 'future', 'cyber', 'robot', 'dystopia', 'surveillance', 'twisted', 'dark satire'],
    subtitle: 'Technological paranoia, dark future satire, and horrifying unintended consequences',
  },
  'better call saul': {
    genres: ['crime', 'drama', 'comedy'],
    themes: ['legal warfare', 'courtroom', 'moral downfall', 'con artist', 'cartel', 'brotherhood', 'lawyer', 'organized crime'],
    keywords: ['lawyer', 'attorney', 'court', 'con', 'cartel', 'mcgill', 'albuquerque', 'judge', 'hustler', 'scam', 'jimmy', 'kim'],
    subtitle: 'Brilliant con artists, high-stakes legal warfare, and tragic character descents',
  },
  'shutter island': {
    genres: ['mystery', 'thriller', 'drama'],
    themes: ['psychological paranoia', 'unreliable narrator', 'mental trap', 'asylum', 'plot twist', 'guilt', 'haunted past'],
    keywords: ['asylum', 'marshal', 'island', 'hallucination', 'cliffhanger', 'lighthouse', 'conspiracy', 'patient', 'scorsese', 'insane'],
    directors: ['martin scorsese'],
    subtitle: 'Paranoid psychological illusions, isolated nightmares, and shocking twists',
  },
  'the railway men': {
    genres: ['drama', 'thriller', 'history'],
    themes: ['bhopal gas leak', 'heroic sacrifice', 'unsung heroes', 'survival', 'disaster', 'human courage'],
    keywords: ['railway', 'station', 'gas leak', 'bhopal', 'train', 'locomotive', 'heroism', 'rescue', 'disaster'],
    subtitle: 'Gripping historical heroism, catastrophic stakes, and unsung courage',
  },
  'kohrra': {
    genres: ['crime', 'drama', 'mystery', 'thriller'],
    themes: ['punjab noir', 'murder mystery', 'police procedural', 'family secrets', 'dark investigation', 'raw realism'],
    keywords: ['police', 'punjab', 'murder', 'nri', 'investigation', 'balbir', 'garundi', 'secrets', 'fog'],
    subtitle: 'Bleak countryside noir, tangled family secrets, and relentless police realism',
  },
  'lupin': {
    genres: ['crime', 'action', 'drama', 'mystery'],
    themes: ['gentleman thief', 'heist', 'revenge', 'mastermind', 'disguise', 'cat and mouse', 'justice'],
    keywords: ['assane', 'thief', 'lupin', 'paris', 'necklace', 'revenge', 'disguise', 'mastermind', 'heist'],
    subtitle: 'Slick Parisian heists, brilliant disguises, and charismatic vengeance',
  },
  'jaane jaan': {
    genres: ['crime', 'drama', 'mystery', 'thriller'],
    themes: ['mathematical alibi', 'murder coverup', 'devotion', 'cat and mouse', 'investigation', 'suspense'],
    keywords: ['math', 'teacher', 'alibi', 'investigation', 'kareena', 'murder', 'police', 'mystery', 'kalimpong'],
    subtitle: 'Immaculate mathematical alibis, quiet obsession, and razor-sharp suspense',
  },
  'andhadhun': {
    genres: ['thriller', 'crime', 'comedy', 'mystery'],
    themes: ['blind pianist', 'dark comedy', 'twisted murder', 'unreliable witness', 'morally gray', 'cat and mouse'],
    keywords: ['piano', 'blind', 'murder', 'organ', 'simi', 'akash', 'twist', 'dark comedy'],
    subtitle: 'Twisted dark comedy, shocking deceptions, and breathless suspense',
  },
  'wednesday': {
    genres: ['comedy', 'fantasy', 'mystery'],
    themes: ['gothic mystery', 'supernatural school', 'outcasts', 'investigation', 'monster', 'dark humor'],
    keywords: ['nevermore', 'addams', 'thing', 'monster', 'outcast', 'enid', 'murder', 'gothic', 'powers'],
    subtitle: 'Sharp gothic wit, supernatural high school mysteries, and monster hunts',
  },
  'peaky blinders': {
    genres: ['crime', 'drama', 'history'],
    themes: ['gang warfare', 'period crime', 'ruthless ambition', 'family dynasty', 'political power', 'post-war trauma', 'smuggling'],
    keywords: ['birmingham', 'gangster', 'razor', 'smuggling', 'shelby', 'horse racing', 'cillian', 'post-war', 'underworld', 'irish', 'mafia'],
    subtitle: 'Ruthless family dynasties, stylized period crime, and razor-sharp swagger',
  },
  'sacred games': {
    genres: ['crime', 'thriller', 'drama', 'mystery'],
    themes: ['mumbai underworld', 'gangster', 'police investigation', 'countdown', 'nuclear conspiracy', 'corruption', 'mythology'],
    keywords: ['mumbai', 'gaitonde', 'sartaj', 'gangster', 'police', 'bomb', 'cult', 'god', 'ashwatthama', 'india', 'guru'],
    subtitle: 'Gritty Mumbai underworld warfare, apocalyptic countdowns, and dark secrets',
  },
  'delhi crime': {
    genres: ['crime', 'drama', 'mystery'],
    themes: ['police procedural', 'real investigation', 'systemic pressure', 'relentless detective', 'justice', 'true crime'],
    keywords: ['police', 'delhi', 'dcp', 'investigation', 'interrogation', 'manhunt', 'evidence', 'station', 'officer'],
    subtitle: 'Raw police procedurals, relentless detectives, and urgent true-crime investigations',
  },
  'money heist': {
    genres: ['action', 'crime', 'drama', 'thriller'],
    themes: ['heist', 'mastermind', 'hostage negotiation', 'rebellion', 'police standoff', 'con', 'resistance'],
    keywords: ['professor', 'bank', 'mint', 'mask', 'dalí', 'robbery', 'hostage', 'plan', 'police', 'inspector', 'berlin', 'tokyo'],
    subtitle: 'Genius masterminds, intricate bank heists, and pulse-pounding police standoffs',
  },
  'narcos': {
    genres: ['crime', 'drama', 'biography'],
    themes: ['drug empire', 'dea investigation', 'cartel warfare', 'corruption', 'political power', 'historical crime'],
    keywords: ['cartel', 'medellin', 'escobar', 'dea', 'colombia', 'trafficking', 'agents', 'empire', 'cali', 'smuggling'],
    subtitle: 'Billion-dollar cartel empires, ruthless warfare, and relentless DEA hunts',
  },
  'ozark': {
    genres: ['crime', 'drama', 'thriller'],
    themes: ['money laundering', 'cartel', 'family survival', 'moral decay', 'small town crime', 'chilling anti-heroes'],
    keywords: ['laundering', 'byrde', 'cartel', 'missouri', 'lake', 'snell', 'casino', 'fbi', 'navarro', 'money'],
    subtitle: 'Cold-blooded money laundering, cartel pressure, and ruthless family survival',
  },
  'squid game': {
    genres: ['thriller', 'drama', 'mystery', 'action'],
    themes: ['death game', 'dystopian inequality', 'survival', 'desperation', 'twisted psychology', 'dark capitalism'],
    keywords: ['game', 'marbles', 'survival', 'mask', 'doll', 'prize', 'island', 'debt', 'elimination', 'korean'],
    subtitle: 'Deadly survival contests, razor-sharp class critique, and gut-wrenching stakes',
  },
  'chernobyl': {
    genres: ['drama', 'history', 'thriller'],
    themes: ['nuclear catastrophe', 'bureaucratic cover-up', 'scientific investigation', 'human sacrifice', 'political deceit'],
    keywords: ['reactor', 'radiation', 'soviet', 'disaster', 'explosion', 'plant', 'evacuation', 'truth', 'containment'],
    subtitle: 'Gripping bureaucratic dread, apocalyptic radiation, and heroic human sacrifice',
  },
  'true detective': {
    genres: ['crime', 'drama', 'mystery', 'thriller'],
    themes: ['occult crime', 'existential dread', 'philosophical nihilism', 'broken detectives', 'decades-spanning case', 'southern gothic'],
    keywords: ['detective', 'bayou', 'cult', 'ritual', 'carcosa', 'nihilist', 'partner', 'investigation', 'murder'],
    subtitle: 'Philosophical nihilism, haunting occult mysteries, and fractured detectives',
  },
  'fargo': {
    genres: ['crime', 'drama', 'thriller', 'comedy'],
    themes: ['dark comedy', 'ordinary people in over their heads', 'ruthless drifters', 'midwestern crime', 'absurdity'],
    keywords: ['snow', 'minnesota', 'hitman', 'sheriff', 'extortion', 'blood', 'peculiar', 'coen'],
    subtitle: 'Dark Midwestern absurdism, bumbling criminals, and ice-cold sociopaths',
  },
  'dexter': {
    genres: ['crime', 'drama', 'mystery', 'thriller'],
    themes: ['vigilante serial killer', 'double life', 'forensic science', 'code of ethics', 'dark passenger', 'police department'],
    keywords: ['blood spatter', 'miami', 'serial killer', 'slides', 'dark passenger', 'code', 'harry', 'plastic wrap'],
    subtitle: 'Vigilante serial killers, double-life tension, and dark moral codes',
  },
  'gone girl': {
    genres: ['mystery', 'thriller', 'drama'],
    themes: ['toxic marriage', 'media circus', 'psychopathic manipulation', 'unreliable narrator', 'faked disappearance'],
    keywords: ['missing wife', 'diary', 'framing', 'media', 'cool girl', 'fincher', 'clues', 'treasure hunt'],
    directors: ['david fincher'],
    subtitle: 'Machiavellian manipulation, toxic marriages, and razor-sharp psychological warfare',
  },
  'the prestige': {
    genres: ['drama', 'mystery', 'sci-fi', 'thriller'],
    themes: ['obsessive rivalry', 'stage illusion', 'secret technology', 'sacrifice for art', 'double life', 'plot twist'],
    keywords: ['magician', 'illusion', 'tesla', 'machine', 'clone', 'rivalry', 'nolan', 'pledge', 'turn', 'prestige'],
    directors: ['christopher nolan'],
    subtitle: 'Deadly obsessive rivalries, secret technologies, and staggering dualities',
  },
  'the matrix': {
    genres: ['sci-fi', 'action'],
    themes: ['simulated reality', 'cyberpunk', 'ai uprising', 'the chosen one', 'philosophical awakening', 'dystopian'],
    keywords: ['matrix', 'red pill', 'neo', 'morpheus', 'agent smith', 'zion', 'simulation', 'code', 'bullet time'],
    subtitle: 'Simulated realities, philosophical awakenings, and iconic cyberpunk action',
  },
  'zodiac': {
    genres: ['crime', 'drama', 'mystery', 'history'],
    themes: ['obsessive journalism', 'unsolved mystery', 'forensic ciphers', 'police procedural', 'decades of dread'],
    keywords: ['zodiac', 'cipher', 'cryptogram', 'chronicle', 'san francisco', 'cartoonist', 'fincher', 'unsolved'],
    directors: ['david fincher'],
    subtitle: 'Obsessive journalistic investigations, cryptic ciphers, and haunting unsolved terror',
  },
  'prison break': {
    genres: ['action', 'crime', 'drama', 'thriller'],
    themes: ['genius escape plan', 'conspiracy', 'wrongfully accused', 'brotherly loyalty', 'high-stakes chase'],
    keywords: ['tattoo', 'fox river', 'escape', 'scofield', 'inmate', 'warden', 'blueprint', 'brother', 'company'],
    subtitle: 'Mastermind escape plans, government conspiracies, and breathless prison breaks',
  },
  'sherlock': {
    genres: ['crime', 'drama', 'mystery'],
    themes: ['high-iq detective', 'mind palace', 'eccentric genius', 'modern adaptation', 'nemesis games'],
    keywords: ['deduction', 'baker street', 'watson', 'moriarty', 'cabs', 'london', 'mind palace', 'cumberbatch'],
    subtitle: 'High-IQ deductive masterclasses, mind palaces, and deadly intellectual showdowns',
  },
};

function resolveAnchorProfile(
  anchorTitle: string,
  libraryItems: LibraryItem[],
  catalog: DiscoveryTitle[]
): AnchorTasteProfile {
  const normKey = anchorTitle.toLowerCase().trim();
  const curated = CURATED_ANCHOR_PROFILES[normKey];

  const foundItem =
    libraryItems.find(
      (i) => (i.externalTitle || i.originalTitle || '').toLowerCase().trim() === normKey
    ) ||
    catalog.find((c) => (c.title || '').toLowerCase().trim() === normKey);

  if (curated && !foundItem) {
    return curated;
  }

  const itemGenres = (foundItem?.genres || []).map((g) => g.toLowerCase().trim());
  const itemThemes = (foundItem?.themes || []).map((t) => t.toLowerCase().trim());
  const itemDirs = (
    Array.isArray(foundItem?.director)
      ? foundItem.director
      : [foundItem?.director].filter(Boolean) as string[]
  ).map((d) => d.toLowerCase().trim());

  const itemTitle = foundItem
    ? 'title' in foundItem
      ? foundItem.title
      : foundItem.externalTitle || foundItem.originalTitle || ''
    : '';
  const textRaw = `${itemTitle} ${(foundItem as any)?.overview || foundItem?.synopsis || ''}`;
  const extractedWords = textRaw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 3 &&
        !['with', 'from', 'that', 'this', 'have', 'were', 'their', 'about', 'after', 'where', 'which'].includes(w)
    )
    .slice(0, 14);

  const combinedGenres = Array.from(new Set([...(curated?.genres || []), ...itemGenres]));
  const combinedThemes = Array.from(new Set([...(curated?.themes || []), ...itemThemes]));
  const combinedKeywords = Array.from(new Set([...(curated?.keywords || []), ...extractedWords]));
  const combinedDirs = Array.from(new Set([...(curated?.directors || []), ...itemDirs]));

  return {
    genres: combinedGenres.length > 0 ? combinedGenres : ['drama', 'thriller'],
    themes: combinedThemes.length > 0 ? combinedThemes : ['mystery', 'suspense'],
    keywords: combinedKeywords.length > 0 ? combinedKeywords : [normKey],
    directors: combinedDirs,
    subtitle: curated?.subtitle || `Deep narrative tension, conceptual mystery, and shared DNA with "${anchorTitle}"`,
  };
}

function scoreCandidateForAnchor(
  anchorProfile: AnchorTasteProfile,
  anchorTitle: string,
  candidate: RecommendationCandidate
): number {
  const item = candidate.item;
  if (normalizeKey(item.title) === normalizeKey(anchorTitle)) return -1;

  const itemGenres = (item.genres || []).map((g) => g.toLowerCase().trim());
  const itemThemes = (item.themes || []).map((t) => t.toLowerCase().trim());
  const text = [
    item.title,
    item.synopsis || '',
    ...(item.genres || []),
    ...(item.themes || []),
    ...((item as any).tags || []),
  ]
    .join(' ')
    .toLowerCase();

  let score = 0;
  let hasAnchorBond = false;

  // 1. THEMES MATCH (up to 52 pts: 26 per matching theme)
  for (const t of anchorProfile.themes) {
    const tLower = t.toLowerCase();
    if (itemThemes.some((it) => it.includes(tLower) || tLower.includes(it))) {
      score += 26;
      hasAnchorBond = true;
    }
  }

  // 2. GENRES MATCH (up to 30 pts: 15 per matching genre)
  for (const g of anchorProfile.genres) {
    const gLower = g.toLowerCase();
    if (itemGenres.includes(gLower)) {
      score += 15;
      hasAnchorBond = true;
    }
  }

  // 3. KEYWORDS & VIBE MATCH (8 pts each, up to 40 pts)
  let kwMatches = 0;
  for (const kw of anchorProfile.keywords) {
    if (text.includes(kw.toLowerCase())) {
      kwMatches++;
      score += 8;
      hasAnchorBond = true;
    }
  }

  // 4. DIRECTOR / CREATOR AFFINITY (25 pts)
  if (anchorProfile.directors && anchorProfile.directors.length > 0) {
    const dirs = Array.isArray(item.director)
      ? item.director
      : [item.director].filter(Boolean) as string[];
    if (dirs.some((d) => anchorProfile.directors!.some((ad) => d.toLowerCase().includes(ad)))) {
      score += 25;
      hasAnchorBond = true;
    }
  }

  // If candidate has zero thematic connection, zero genre overlap, and low keyword resonance, disqualify it
  if (!hasAnchorBond || (itemThemes.length === 0 && itemGenres.length === 0 && kwMatches === 0)) {
    return 0;
  }

  // 5. Quality Boost from Ratings (up to 15 pts)
  const rating = item.imdbRating || item.rating || 6.5;
  score += rating * 1.5;

  // 6. User Taste Profile Synergy (up to 10 pts)
  score += candidate.score * 10;

  // 7. Dynamic Jitter (0 to 3 pts) to ensure natural rotation across refreshes
  score += Math.random() * 3;

  return score;
}

/**
 * Primary multi-row recommendation pipeline.
 */
export async function generateRecommendations(
  params: RecommendationEngineParams
): Promise<RecommendationEngineOutput> {
  const {
    catalog,
    libraryItems,
    userProfile,
    selectedGenres,
    selectedThemes,
    customPreferences,
    excludeItemIds = new Set<string>(),
    explorationFactor = 0.12,
  } = params;

  // 1. Layer 1 — Hard Filtering:
  // Remove already completed titles, dropped titles (unless give another chance), and unavailable titles
  const alreadyWatchedKeys = new Set<string>();
  const inLibraryKeys = new Set<string>();

  for (const lib of libraryItems) {
    const key = normalizeKey(lib.externalTitle || lib.originalTitle);
    inLibraryKeys.add(key);
    if (
      lib.isCompleted ||
      lib.viewingStatus === 'completed' ||
      lib.viewingStatus === 'dropped' ||
      Boolean(lib.droppedReason) ||
      Boolean(lib.droppedAt) ||
      (typeof lib.userStarRating === 'number' && lib.userStarRating < 3) ||
      (lib.progress && lib.progress.percentage >= 90)
    ) {
      alreadyWatchedKeys.add(key);
    }
  }

  const validCatalog = catalog
    .map((c) => {
      const cleanPoster = sanitizeImageUrl(c.posterPath, c.title) || c.posterPath || c.backdropPath;
      const cleanBackdrop = sanitizeImageUrl(c.backdropPath, c.title) || c.backdropPath;
      return {
        ...c,
        posterPath: cleanPoster,
        backdropPath: cleanBackdrop,
      };
    })
    .filter((c) => {
      if (!c.title || !c.posterPath) return false;
      if (!isNetflixIndiaAvailable(c)) return false;
      const key = normalizeKey(c.title);
      if (alreadyWatchedKeys.has(key)) return false;
      if (excludeItemIds.has(String(c.id)) || (c.netflixId && excludeItemIds.has(c.netflixId))) return false;
      return true;
    });

  // 2. Parse Custom Preferences (Natural Language Understanding)
  // Convert priority order to dynamic weights (1st: 1.0, 2nd: 0.8, 3rd: 0.65, etc.)
  const customIntents: { intent: StructuredIntent; weight: number }[] = [];
  for (let i = 0; i < customPreferences.length; i++) {
    const pref = customPreferences[i];
    const weight = Math.max(0.3, 1.0 - (i * 0.18));
    const structured = await parseCustomPreference(pref.text);
    customIntents.push({ intent: structured, weight });
  }

  // 3. Score all valid catalog candidates
  const scoredCatalog = validCatalog.map((item) =>
    scoreTitleCandidate(item, {
      userProfile,
      selectedGenres,
      selectedThemes,
      customIntents,
      explorationFactor,
    })
  );

  // Sort candidates by score descending
  scoredCatalog.sort((a, b) => b.score - a.score);

  // Helper: Romance filter (strict exclusion for banner)
  const isRomanceCandidate = (c: RecommendationCandidate): boolean => {
    const genres = (c.item.genres || []).map((g) => g.toLowerCase());
    const themes = (c.item.themes || []).map((t) => t.toLowerCase());
    const synopsis = (c.item.synopsis || '').toLowerCase();
    const title = (c.item.title || '').toLowerCase();
    return (
      genres.some((g) => g.includes('romanc') || g.includes('romantic')) ||
      themes.some((t) => t.includes('romanc') || t.includes('romantic') || t.includes('love story')) ||
      synopsis.includes('romantic comedy') ||
      synopsis.includes('falls in love')
    );
  };

  // Helper: Banner vibe (must be Mystery, Thriller, Time Travel, Crime, Psychological, Mind-Bending)
  const isBannerVibeCandidate = (c: RecommendationCandidate): boolean => {
    const text = [
      ...(c.item.genres || []),
      ...(c.item.themes || []),
      c.item.title || '',
      c.item.synopsis || '',
    ]
      .join(' ')
      .toLowerCase();

    return (
      text.includes('thriller') ||
      text.includes('mystery') ||
      text.includes('time travel') ||
      text.includes('temporal') ||
      text.includes('crime') ||
      text.includes('detective') ||
      text.includes('psychological') ||
      text.includes('mind-bending') ||
      text.includes('mind game') ||
      text.includes('suspense') ||
      text.includes('investigation') ||
      text.includes('conspiracy') ||
      text.includes('sci-fi')
    );
  };

  // 4. Hero Title Selection:
  // Strict Rules:
  // - NEVER show romance movies and series on the banner
  // - ALWAYS show mystery, thriller, time travel, crime type content on the banner
  // - High visual fidelity (backdropPath) and solid ratings
  let bannerCandidates = scoredCatalog.filter(
    (c) =>
      c.item.backdropPath &&
      !isRomanceCandidate(c) &&
      isBannerVibeCandidate(c) &&
      (c.item.imdbRating || c.item.rating || 0) >= 6.8
  );

  // If high-rating pool is empty, relax rating threshold but strictly preserve mystery/crime/time travel & no-romance
  if (bannerCandidates.length === 0) {
    bannerCandidates = scoredCatalog.filter(
      (c) =>
        c.item.backdropPath &&
        !isRomanceCandidate(c) &&
        isBannerVibeCandidate(c)
    );
  }

  // Pick from the top candidates with controlled exploration
  const heroPickIndex = bannerCandidates.length > 0
    ? Math.floor(Math.random() * Math.min(6, bannerCandidates.length))
    : 0;
  const hero = bannerCandidates.length > 0 ? bannerCandidates[heroPickIndex] : scoredCatalog[0] || null;

  // Track global recommendation-session deduplication
  const sessionUsedIds = new Set<string>();
  if (hero) sessionUsedIds.add(String(hero.item.id));


  // 5. Build Content Rows (At least 15+ rich, dynamic rows)
  const rows: RecommendationRowData[] = [];

  // Helper to draw items for a row while preventing cross-row duplicate clutter
  const drawRowItems = (
    predicate: (c: RecommendationCandidate) => boolean,
    limit: number = 36,
    prioritySort?: (a: RecommendationCandidate, b: RecommendationCandidate) => number
  ): RecommendationCandidate[] => {
    let pool = scoredCatalog.filter(
      (c) => !sessionUsedIds.has(String(c.item.id)) && predicate(c)
    );
    if (prioritySort) pool.sort(prioritySort);

    // If pool is too small, allow relaxing the duplicate check for high-relevance titles
    if (pool.length < 4) {
      pool = scoredCatalog.filter(predicate);
      if (prioritySort) pool.sort(prioritySort);
    }

    const selected = pool.slice(0, limit);
    for (const s of selected) {
      sessionUsedIds.add(String(s.item.id));
    }
    return selected;
  };

  // =========================================================================
  // SECTION A: AT LEAST 5 "SINCE YOU LOVED {XYZ}" ROWS (WITH MOVIE/SERIES TOGGLE)
  // =========================================================================
  // Dislike / dropped / skipped filter:
  // Strictly prevent any dropped, skipped, or low-rated titles (such as Heeramandi) from ever being used as an anchor
  const dislikedOrSkippedKeys = new Set<string>();
  for (const i of libraryItems) {
    const isDroppedOrSkipped =
      i.viewingStatus === 'dropped' ||
      Boolean(i.droppedReason) ||
      Boolean(i.droppedAt) ||
      (typeof i.userStarRating === 'number' && i.userStarRating < 4);
    if (isDroppedOrSkipped) {
      if (i.originalTitle) dislikedOrSkippedKeys.add(normalizeKey(i.originalTitle));
      if (i.externalTitle) dislikedOrSkippedKeys.add(normalizeKey(i.externalTitle));
    }
  }

  // 1. Gather ONLY candidate loved titles where the user explicitly gave 4 or 5 stars (never dropped or skipped):
  const lovedCandidates = libraryItems.filter((i) => {
    if (!i || (!i.originalTitle && !i.externalTitle)) return false;
    const key = normalizeKey(i.externalTitle || i.originalTitle);
    if (dislikedOrSkippedKeys.has(key)) return false;
    return typeof i.userStarRating === 'number' && i.userStarRating >= 4.0;
  });

  const availableLovedTitles = Array.from(
    new Set(
      lovedCandidates
        .map((i) => (i.externalTitle || i.originalTitle || '').trim())
        .filter(Boolean)
    )
  );

  // High-taste fallback seeds to guarantee at least 5 distinct high-caliber anchors if user has rated < 5 titles
  // Strictly verified Netflix India catalog titles only!
  const fallbackLovedSeeds = [
    'Dark',
    'Breaking Bad',
    'Inception',
    'Interstellar',
    'Stranger Things',
    'Mindhunter',
    'Tenet',
    'Black Mirror',
    'Better Call Saul',
    'Shutter Island',
    'Peaky Blinders',
    'Sacred Games',
    'Money Heist',
    'Narcos',
    'Ozark',
    'Squid Game',
    'The Railway Men',
    'Delhi Crime',
    'Kohrra',
    "The Queen's Gambit",
    'Lupin',
    'Jaane Jaan',
    'Andhadhun',
    'Wednesday',
  ];

  // Strictly verify that any fallback seed actually exists in the current Netflix India catalog
  const catalogTitleKeys = new Set(catalog.map((c) => normalizeKey(c.title)));

  for (const seed of fallbackLovedSeeds) {
    const seedKey = normalizeKey(seed);
    if (
      catalogTitleKeys.has(seedKey) &&
      !dislikedOrSkippedKeys.has(seedKey) &&
      !availableLovedTitles.some((t) => normalizeKey(t) === seedKey)
    ) {
      availableLovedTitles.push(seed);
    }
  }

  // Shuffle available loved titles so they change dynamically every page refresh
  const shuffledLovedPool = [...availableLovedTitles].sort(() => Math.random() - 0.5);

  // If a specific loved title was requested (e.g. user clicked "Try Another"), put it at front (unless disliked)
  if (params.requestedLovedTitle) {
    const reqKey = normalizeKey(params.requestedLovedTitle);
    if (!dislikedOrSkippedKeys.has(reqKey)) {
      const existingIdx = shuffledLovedPool.findIndex(
        (t) => normalizeKey(t) === reqKey
      );
      if (existingIdx !== -1) {
        shuffledLovedPool.splice(existingIdx, 1);
      }
      shuffledLovedPool.unshift(params.requestedLovedTitle);
    }
  }

  // Pick 5 distinct diverse anchors
  const selected5Anchors: string[] = [];
  const seenAnchorKeys = new Set<string>();
  for (const t of shuffledLovedPool) {
    const k = normalizeKey(t);
    if (!seenAnchorKeys.has(k)) {
      seenAnchorKeys.add(k);
      selected5Anchors.push(t);
      if (selected5Anchors.length >= 5) break;
    }
  }

  // STRICT CROSS-ROW DEDUPLICATION SETS:
  // Ensures Row 1, Row 2, Row 3, Row 4, and Row 5 have 100% UNIQUE, DISTINCT TITLES!
  const usedLovedMovieIds = new Set<string>();
  const usedLovedTvIds = new Set<string>();

  // Exclude current Hero recommendation so it is not repeated in the rows
  if (hero?.item?.id) {
    usedLovedMovieIds.add(String(hero.item.id));
    usedLovedTvIds.add(String(hero.item.id));
  }

  selected5Anchors.forEach((anchorLovedTitle, idx) => {
    const anchorProfile = resolveAnchorProfile(anchorLovedTitle, libraryItems, catalog);

    // Score every catalog candidate specifically for THIS anchor
    const scoredForAnchor = scoredCatalog
      .map((c) => ({
        candidate: c,
        anchorScore: scoreCandidateForAnchor(anchorProfile, anchorLovedTitle, c),
      }))
      .filter((entry) => entry.anchorScore > 0);

    // Sort strictly by affinity with THIS ANCHOR!
    scoredForAnchor.sort((a, b) => b.anchorScore - a.anchorScore);

    // 1. SELECT MOVIES: strictly exclude movies already picked in previous "Since you loved" rows
    const distinctMovies = scoredForAnchor
      .filter(
        (e) =>
          e.candidate.item.mediaType === 'movie' &&
          !usedLovedMovieIds.has(String(e.candidate.item.id))
      )
      .map((e) => e.candidate)
      .slice(0, 36);

    // Fallback if needed to guarantee robust row
    const finalMovies =
      distinctMovies.length >= 4
        ? distinctMovies
        : scoredForAnchor
            .filter((e) => e.candidate.item.mediaType === 'movie')
            .map((e) => e.candidate)
            .slice(0, 36);

    // Mark these movie IDs as used across both Section A rows and Section B rows
    finalMovies.forEach((m) => {
      usedLovedMovieIds.add(String(m.item.id));
      sessionUsedIds.add(String(m.item.id));
    });

    // 2. SELECT TV SERIES: strictly exclude series already picked in previous "Since you loved" rows
    const distinctTv = scoredForAnchor
      .filter(
        (e) =>
          e.candidate.item.mediaType === 'tv' &&
          !usedLovedTvIds.has(String(e.candidate.item.id))
      )
      .map((e) => e.candidate)
      .slice(0, 36);

    // If candidate TV count is low, backfill with remaining scored TV series
    const finalSeries =
      distinctTv.length >= 3
        ? distinctTv
        : [
            ...distinctTv,
            ...scoredForAnchor
              .filter((e) => e.candidate.item.mediaType === 'tv')
              .map((e) => e.candidate)
              .filter((c) => !distinctTv.some((s) => s.item.id === c.item.id)),
          ].slice(0, 36);

    // Mark TV IDs as used across rows
    finalSeries.forEach((s) => {
      usedLovedTvIds.add(String(s.item.id));
      sessionUsedIds.add(String(s.item.id));
    });

    if (finalMovies.length > 0 || finalSeries.length > 0) {
      rows.push({
        id: `row-since-you-loved-${idx + 1}`,
        title: `Since you loved "${anchorLovedTitle}", here are some movies`,
        subtitle: anchorProfile.subtitle || 'Feature films sharing the same concept, tension, and storytelling',
        type: 'loved_similar',
        items: finalMovies,
        toggleOptions: {
          activeMode: 'movie',
          movieItems: finalMovies,
          tvItems: finalSeries,
          anchorTitle: anchorLovedTitle,
          availableLovedTitles,
        },
      });
    }
  });

  // =========================================================================
  // SECTION B: QUIRKY & SPECIALIZED CINEMATIC ROWS (16 ROWS)
  // =========================================================================

  // Row 6: Hooked from Episode One: Irresistible Series (High rated TV series only)
  const hookedTvItems = drawRowItems(
    (c) =>
      c.item.mediaType === 'tv' &&
      (c.item.imdbRating || c.item.rating || 0) >= 7.8 &&
      c.score >= 0.42,
    36,
    (a, b) => ((b.item.imdbRating || 0) + b.score) - ((a.item.imdbRating || 0) + a.score)
  );
  if (hookedTvItems.length >= 3) {
    rows.push({
      id: 'row-hooked-first-episode',
      title: 'Hooked from Episode One: Irresistible Series',
      subtitle: 'Peak pilot episodes, relentless cliffhangers, and unputdownable drama (IMDb 8.0+)',
      type: 'genre_taste',
      items: hookedTvItems,
    });
  }

  // Row 7: High-Stakes Courtroom & Legal Warfare
  const courtroomItems = drawRowItems(
    (c) => {
      const text = [
        ...(c.item.genres || []),
        ...(c.item.themes || []),
        c.item.title || '',
        c.item.synopsis || '',
      ]
        .join(' ')
        .toLowerCase();
      return (
        text.includes('court') ||
        text.includes('courtroom') ||
        text.includes('legal') ||
        text.includes('lawyer') ||
        text.includes('attorney') ||
        text.includes('trial') ||
        text.includes('judge') ||
        text.includes('verdict') ||
        text.includes('justice') ||
        text.includes('cross-examination')
      ) && c.score >= 0.42;
    },
    36
  );
  if (courtroomItems.length >= 3) {
    rows.push({
      id: 'row-courtroom-drama',
      title: 'High-Stakes Courtroom & Legal Warfare',
      subtitle: 'Fierce cross-examinations, institutional corruption, and dramatic verdicts',
      type: 'theme_based',
      items: courtroomItems,
    });
  }

  // Row 8: Adrenaline Rush: Relentless & Fast-Paced
  const fastPacedItems = drawRowItems(
    (c) => {
      const text = [
        ...(c.item.genres || []),
        ...(c.item.themes || []),
        c.item.title || '',
        c.item.synopsis || '',
      ]
        .join(' ')
        .toLowerCase();
      const isFast =
        text.includes('fast-paced') ||
        text.includes('ticking clock') ||
        text.includes('chase') ||
        text.includes('escape') ||
        text.includes('countdown') ||
        text.includes('high-octane') ||
        (text.includes('action') && text.includes('thriller'));
      return isFast && c.score >= 0.45;
    },
    36
  );
  if (fastPacedItems.length >= 3) {
    rows.push({
      id: 'row-fast-paced',
      title: 'Adrenaline Rush: Relentless & Fast-Paced',
      subtitle: 'Zero filler, ticking-clock urgency, and breathless momentum from start to finish',
      type: 'action',
      items: fastPacedItems,
    });
  }

  // Row 9: Fascinating Truths: Gripping Documentaries
  const documentaryItems = drawRowItems(
    (c) => {
      const isDocGenre = (c.item.genres || []).some((g) => /documentary/i.test(g));
      const text = [
        ...(c.item.themes || []),
        c.item.title || '',
        c.item.synopsis || '',
      ]
        .join(' ')
        .toLowerCase();
      const isDocVibe =
        isDocGenre ||
        text.includes('documentary') ||
        text.includes('true crime') ||
        text.includes('real life') ||
        text.includes('investigative') ||
        text.includes('docuseries');
      return isDocVibe && (c.item.imdbRating || c.item.rating || 0) >= 7.0;
    },
    36
  );
  if (documentaryItems.length >= 3) {
    rows.push({
      id: 'row-documentaries',
      title: 'Fascinating Truths: Gripping Documentaries & Docuseries',
      subtitle: 'Mind-expanding investigations, shocking true crime, and extraordinary real stories',
      type: 'genre_taste',
      items: documentaryItems,
    });
  }

  // Row 10: Down the Rabbit Hole: Unreliable Narrators
  const unreliableNarratorItems = drawRowItems(
    (c) => {
      const text = [
        ...(c.item.genres || []),
        ...(c.item.themes || []),
        c.item.title || '',
        c.item.synopsis || '',
      ]
        .join(' ')
        .toLowerCase();
      return (
        text.includes('unreliable narrator') ||
        text.includes('hallucination') ||
        text.includes('paranoia') ||
        text.includes('mental trap') ||
        text.includes('identity') ||
        text.includes('psychological') ||
        text.includes('amnesia')
      ) && c.score >= 0.48;
    },
    36
  );
  if (unreliableNarratorItems.length >= 3) {
    rows.push({
      id: 'row-unreliable-narrator',
      title: 'Down the Rabbit Hole: Unreliable Narrators',
      subtitle: 'Stories where you can never trust what your own eyes are seeing',
      type: 'theme_based',
      items: unreliableNarratorItems,
    });
  }

  // Row 11: The Mastermind Blueprint: Heists & Cons
  const heistItems = drawRowItems(
    (c) => {
      const text = [
        ...(c.item.genres || []),
        ...(c.item.themes || []),
        c.item.title || '',
        c.item.synopsis || '',
      ]
        .join(' ')
        .toLowerCase();
      return (
        text.includes('heist') ||
        text.includes('con artist') ||
        text.includes('bank robbery') ||
        text.includes('robbery') ||
        text.includes('scam') ||
        text.includes('mastermind') ||
        text.includes('syndicate')
      ) && c.score >= 0.45;
    },
    36
  );
  if (heistItems.length >= 3) {
    rows.push({
      id: 'row-heists-cons',
      title: 'The Mastermind Blueprint: Heists & Cons',
      subtitle: 'Flawless execution, sudden double-crosses, and high-IQ schemes',
      type: 'theme_based',
      items: heistItems,
    });
  }

  // Row 12: Mind-Bending & Time Travel Paradoxes
  const timeTravelItems = drawRowItems(
    (c) => {
      const text = [
        ...(c.item.genres || []),
        ...(c.item.themes || []),
        c.item.title || '',
        c.item.synopsis || '',
      ]
        .join(' ')
        .toLowerCase();
      return (
        text.includes('time travel') ||
        text.includes('temporal') ||
        text.includes('mind-bending') ||
        text.includes('loop') ||
        text.includes('multiverse') ||
        text.includes('puzzle') ||
        (text.includes('mystery') && text.includes('thriller'))
      ) && c.score >= 0.48;
    },
    36
  );
  if (timeTravelItems.length >= 3) {
    rows.push({
      id: 'row-time-travel-mysteries',
      title: 'Mind-Bending & Time Travel Paradoxes',
      subtitle: 'Temporal paradoxes, puzzle-box plots, and reality-warping mysteries',
      type: 'theme_based',
      items: timeTravelItems,
    });
  }

  // Row 13: Dystopian Realities & Survival Games
  const dystopianItems = drawRowItems(
    (c) => {
      const text = [
        ...(c.item.genres || []),
        ...(c.item.themes || []),
        c.item.title || '',
        c.item.synopsis || '',
      ]
        .join(' ')
        .toLowerCase();
      return (
        text.includes('dystopian') ||
        text.includes('cyberpunk') ||
        text.includes('battle royale') ||
        text.includes('survival') ||
        text.includes('death game') ||
        text.includes('totalitarian') ||
        text.includes('post-apocalyptic')
      ) && c.score >= 0.46;
    },
    36
  );
  if (dystopianItems.length >= 3) {
    rows.push({
      id: 'row-dystopian-survival',
      title: 'Dystopian Realities & Survival Games',
      subtitle: 'Desperate contestants, totalitarian regimes, and ruthless survival stakes',
      type: 'theme_based',
      items: dystopianItems,
    });
  }

  // Row 14: Top K-Dramas for You
  const kdramaItems = drawRowItems(
    (c) =>
      (c.item.originalLanguage === 'ko' ||
        (c.item.countries || []).some((co) => /korea/i.test(co)) ||
        (c.item.genres || []).some((g) => /korean|k-drama/i.test(g))) &&
      c.score >= 0.40,
    36
  );
  if (kdramaItems.length >= 3) {
    rows.push({
      id: 'row-k-dramas',
      title: 'Gripping K-Dramas & Korean Thrillers',
      subtitle: 'High-stakes intrigue, dark suspense, and acclaimed Korean storytelling',
      type: 'k_drama',
      items: kdramaItems,
    });
  }

  // Row 15: Your Anime Corner
  const animeItems = drawRowItems(
    (c) =>
      ((c.item.genres || []).some((g) => /anime/i.test(g)) ||
        (c.item.originalLanguage === 'ja' && (c.item.genres || []).some((g) => /animat/i.test(g)))) &&
      c.score >= 0.40,
    36
  );
  if (animeItems.length >= 3) {
    rows.push({
      id: 'row-anime',
      title: 'Your Anime Corner: Dark Fantasy & Sci-Fi',
      subtitle: 'Visionary animation, dark fantasy, and high-concept sci-fi worlds',
      type: 'anime',
      items: animeItems,
    });
  }

  // Row 16: Action You Actually Like
  const actionItems = drawRowItems(
    (c) => (c.item.genres || []).some((g) => /action/i.test(g)) && c.score >= 0.48,
    36
  );
  if (actionItems.length >= 3) {
    rows.push({
      id: 'row-action',
      title: 'Adrenaline & High-Stakes Action',
      subtitle: 'Relentless momentum, tactical combat, and intense thrillers',
      type: 'action',
      items: actionItems,
    });
  }

  // Row 17: Your Next Big Adventure
  const adventureItems = drawRowItems(
    (c) => (c.item.genres || []).some((g) => /adventure/i.test(g)) && c.score >= 0.48,
    36
  );
  if (adventureItems.length >= 3) {
    rows.push({
      id: 'row-adventure',
      title: 'Your Next Big Adventure',
      subtitle: 'Epic odysseys, perilous journeys, and uncharted discoveries',
      type: 'adventure',
      items: adventureItems,
    });
  }

  // Row 18: Comedy to Lighten the Mood (strictly no cheesy romance comedy)
  const comedyItems = drawRowItems(
    (c) => (c.item.genres || []).some((g) => /comedy/i.test(g)) && !isRomanceCandidate(c) && c.score >= 0.40,
    36
  );
  if (comedyItems.length >= 3) {
    rows.push({
      id: 'row-comedy',
      title: 'Sharp & Dark Comedy (No Mushy Romance)',
      subtitle: 'Sharp wit, biting satire, and laugh-out-loud favorites without cheesy romance',
      type: 'comedy',
      items: comedyItems,
    });
  }

  // Row 19: Hidden Gems For You
  const gemItems = drawRowItems(
    (c) => {
      const imdb = c.item.imdbRating || c.item.rating || 0;
      const votes = c.item.voteCount || 500;
      return imdb >= 7.2 && votes <= 85000 && c.score >= 0.46;
    },
    36,
    (a, b) => ((b.item.imdbRating || 0) + b.score) - ((a.item.imdbRating || 0) + a.score)
  );
  if (gemItems.length >= 3) {
    rows.push({
      id: 'row-hidden-gems',
      title: 'Hidden Gems: Acclaimed & Under-the-Radar',
      subtitle: 'Acclaimed, under-the-radar titles that strongly align with your taste',
      type: 'hidden_gems',
      items: gemItems,
    });
  }

  // Row 20: Indie Cinema & Festival Standouts
  const indieItems = drawRowItems(
    (c) => {
      if (c.item.mediaType !== 'movie') return false;
      const text = [
        ...(c.item.genres || []),
        ...(c.item.themes || []),
        c.item.synopsis || '',
      ]
        .join(' ')
        .toLowerCase();
      const isIndie =
        text.includes('indie') ||
        text.includes('independent') ||
        text.includes('art house') ||
        text.includes('festival');
      const isLowVoteHighRating =
        (c.item.voteCount || 0) <= 65000 && (c.item.imdbRating || c.item.rating || 0) >= 7.0;
      return (isIndie || isLowVoteHighRating) && c.score >= 0.45;
    },
    36
  );
  if (indieItems.length >= 3) {
    rows.push({
      id: 'row-indie-movies',
      title: 'Indie Cinema & Festival Standouts',
      subtitle: 'Auteur-driven visions, psychological depth, and unconventional cinema',
      type: 'indie',
      items: indieItems,
    });
  }

  // Row 21: Worth Taking a Chance On (Explore Something Different)
  const exploreItems = drawRowItems(
    (c) => {
      const hasCoreGenre = c.item.genres.some((g) => userProfile.topGenres.slice(0, 2).includes(g));
      return !hasCoreGenre && (c.item.imdbRating || c.item.rating || 0) >= 7.3;
    },
    36
  );
  if (exploreItems.length >= 3) {
    rows.push({
      id: 'row-explore-different',
      title: 'Worth Taking a Chance On',
      subtitle: 'Broaden your horizon with stories that venture beyond your usual genres',
      type: 'explore_different',
      items: exploreItems,
    });
  }



  // 6. Recommendation Engine Custom Picks (Layer 5 — LLM Reasoning via Qwen 27B)
  let customPicks: RecommendationCandidate[] = [];
  let isFallback = false;
  let fallbackMessage: string | undefined;

  const hasCustomQuery = customPreferences.length > 0 || selectedGenres.length > 0 || selectedThemes.length > 0;

  if (hasCustomQuery) {
    // Candidates matching custom query
    const customCandidates = scoredCatalog.filter((c) => {
      if (customPreferences.length > 0 && c.breakdown.customIntentMatch >= 0.25) return true;
      if (selectedGenres.length > 0 && c.breakdown.genreMatch >= 0.5) return true;
      if (selectedThemes.length > 0 && c.breakdown.themeMatch >= 0.5) return true;
      return false;
    });

    if (customCandidates.length >= 3) {
      // Re-rank top candidates using Qwen 27B
      const customPromptsText = customPreferences.map((p) => p.text);
      customPicks = await rankAndExplainWithQwen(customCandidates.slice(0, 30), userProfile, customPromptsText);
    } else {
      // Intelligent Progressive Relaxation Fallback:
      // If zero or too few exact matches exist for complex queries, relax constraints gracefully
      isFallback = true;
      fallbackMessage = "We couldn't find an exact match for all specific constraints, but here are the closest conceptual matches to your vibe.";

      // Fallback: take highest semantic + taste matches from full catalog
      customPicks = scoredCatalog.slice(0, 15);
    }
  }

  return {
    hero,
    rows,
    customPicks: customPicks.slice(0, 16),
    isFallback,
    fallbackMessage,
  };
}
