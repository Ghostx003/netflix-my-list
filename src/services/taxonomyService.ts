/**
 * Taxonomy Classification Service
 * Broadly classifies thousands of granular micro-themes and raw genres into
 * curated, high-level, streaming-standard categories while preserving every single underlying tag.
 */

export interface BroadThemeDefinition {
  id: string;
  name: string;
  icon: string;
  description: string;
  patterns: string[];
}

export interface BroadGenreDefinition {
  id: string;
  name: string;
  icon: string;
  patterns: string[];
}

/**
 * 24 Curated High-Level Cinematic Theme Categories
 */
export const BROAD_THEMES: BroadThemeDefinition[] = [
  {
    id: 'psychological',
    name: 'Psychological & Mind Games',
    icon: '🧠',
    description: 'Mental struggles, altered perceptions, paranoia, trauma, and psychological manipulation.',
    patterns: [
      'psycholog', 'mind', 'paranoia', 'hallucin', 'mental', 'memory', 'amnesia', 'identity',
      'gaslight', 'manipulat', 'delusion', 'split', 'schizo', 'obsession', 'insan', 'nightmare',
      'ptsd', 'trauma', 'inner demon', 'subconscious', 'brainwash', 'lucid', 'ego', 'phobia',
      'fear', 'anxiety', 'dementia', 'complex', 'hypno', 'madness', 'psych'
    ],
  },
  {
    id: 'heist',
    name: 'Crime, Heist & Con',
    icon: '💰',
    description: 'High-stakes bank jobs, elaborate cons, criminal masterminds, and illicit schemes.',
    patterns: [
      'heist', 'robbery', 'con artist', 'scam', 'thief', 'theft', 'burglar', 'counterfeit',
      'money laundering', 'bank robbery', 'fraud', 'embezzle', 'swindle', 'loot', 'outlaw',
      'traffick', 'contraband', 'smuggl', 'gambl', 'casino', 'poker', 'card shark', 'crime'
    ],
  },
  {
    id: 'mob',
    name: 'Mob, Cartel & Underworld',
    icon: '🚬',
    description: 'Organized crime, drug syndicates, mafia families, yakuza, and turf warfare.',
    patterns: [
      'mafia', 'gang', 'cartel', 'underworld', 'yakuza', 'triad', 'organized crime', 'drug lord',
      'kingpin', 'racketeer', 'narco', 'syndicate', 'godfather', 'mobster', 'turf war',
      'crime boss', 'street crime', 'illicit', 'corrupt cop', 'gangland', 'underbelly'
    ],
  },
  {
    id: 'murder',
    name: 'Murder, Serial Killer & Forensics',
    icon: '🔪',
    description: 'Chilling killers, serial homicides, crime scenes, and dark forensic investigations.',
    patterns: [
      'serial killer', 'psychopath', 'sociopath', 'homicide', 'mass murder', 'butcher',
      'autopsy', 'forensic', 'crime scene', 'slasher', 'manslaughter', 'murder', 'killer',
      'strangler', 'poison', 'cannibal', 'body count', 'gore', 'corpse', 'necro', 'bloody',
      'assassination', 'execution', 'death', 'kill'
    ],
  },
  {
    id: 'detective',
    name: 'Whodunit, Detective & Investigation',
    icon: '🔍',
    description: 'Solving unsolved mysteries, police procedurals, detective sleuthing, and clue hunting.',
    patterns: [
      'whodunit', 'detective', 'police', 'investigat', 'cop', 'sherlock', 'procedural', 'clue',
      'unsolved', 'sleuth', 'inspector', 'interrogat', 'evidence', 'cold case', 'fbi',
      'search for truth', 'missing person', 'disappearance', 'inquiry', 'stakeout', 'interrogation',
      'agent', 'surveillance', 'mystery'
    ],
  },
  {
    id: 'revenge',
    name: 'Revenge, Vigilante & Betrayal',
    icon: '⚔️',
    description: 'Vengeance arcs, betrayal, retribution, vigilante justice, and settling old scores.',
    patterns: [
      'revenge', 'vengeance', 'retribution', 'vigilante', 'vendetta', 'payback', 'avenge',
      'assassin', 'hitman', 'bounty hunter', 'justice vs revenge', 'eye for an eye', 'punisher',
      'score to settle', 'grudge', 'nemesis', 'retaliat', 'betrayal', 'double cross', 'backstab'
    ],
  },
  {
    id: 'espionage',
    name: 'Espionage, Spy & Secret Operations',
    icon: '🕵️',
    description: 'International espionage, undercover operatives, Cold War intrigue, and classified intelligence.',
    patterns: [
      'spy', 'espionage', 'secret agent', 'intelligence', 'cia', 'kgb', 'mi6', 'undercover',
      'cold war', 'surveillance', 'covert', 'mole', 'black ops', 'counterintelligence',
      'double agent', 'treason', 'infiltrat', 'operative', 'classified', 'special agent',
      'code', 'cipher', 'crypt'
    ],
  },
  {
    id: 'survival',
    name: 'Survival, Stranded & Captivity',
    icon: '🏕️',
    description: 'Battling the wilderness, escaping capture, prison breaks, and fighting to stay alive.',
    patterns: [
      'survival', 'stranded', 'wilderness', 'shipwreck', 'plane crash', 'isolated', 'trapped',
      'captive', 'hostage', 'kidnap', 'escape', 'prison', 'jail', 'cave', 'desert', 'hostile',
      'abduct', 'runaway', 'survivalist', 'penitentiary', 'solitary', 'dungeon', 'endurance',
      'peril', 'ordeal', 'resilience', 'surviv', 'isolat'
    ],
  },
  {
    id: 'apocalypse',
    name: 'Post-Apocalyptic, Pandemic & Disaster',
    icon: '☣️',
    description: 'Doomsday wastelands, viral outbreaks, nuclear fallouts, and natural disasters.',
    patterns: [
      'post-apocalyp', 'apocalyp', 'nuclear', 'zombie', 'virus', 'pandemic', 'contagion',
      'fallout', 'extinction', 'disaster', 'earthquake', 'tsunami', 'catastrophe', 'cataclysm',
      'outbreak', 'quarantine', 'meltdown', 'doomsday', 'flood', 'famine', 'ruin', 'blight', 'collapse'
    ],
  },
  {
    id: 'dystopian',
    name: 'Dystopian, Cyberpunk & AI',
    icon: '🤖',
    description: 'Futuristic dystopias, cyberpunk megacities, rogue AI, cyber warfare, and high tech.',
    patterns: [
      'dystop', 'cyberpunk', 'artificial intelligence', 'ai ', 'robot', 'cyborg', 'android',
      'totalitarian', 'authoritarian', 'surveillance state', 'propaganda', 'rebellion',
      'virtual reality', 'matrix', 'hacker', 'algorithm', 'sci-fi', 'futuristic', 'high tech',
      'cyber', 'oppressive', 'resistance', 'transhuman', 'tech', 'digital', 'clone', 'genetic',
      'mutant', 'biotech', 'nanotech', 'rebell'
    ],
  },
  {
    id: 'space_time',
    name: 'Time Travel, Multiverse & Space',
    icon: '🚀',
    description: 'Interstellar voyages, alien encounters, temporal loops, and parallel realities.',
    patterns: [
      'time travel', 'time loop', 'multiverse', 'parallel universe', 'alternate timeline',
      'space', 'astronaut', 'cosmic', 'alien', 'extraterrestrial', 'galaxy', 'mars', 'deep space',
      'spaceship', 'wormhole', 'black hole', 'ufo', 'interstellar', 'planetary', 'astronomy',
      'universe', 'stellar', 'orbit', 'nasa', 'astral', 'temporal', 'dimension'
    ],
  },
  {
    id: 'supernatural',
    name: 'Supernatural, Horror & Occult',
    icon: '👻',
    description: 'Ghosts, demons, witchcraft, curses, haunted places, and the paranormal realm.',
    patterns: [
      'supernatural', 'ghost', 'demon', 'occult', 'exorcism', 'witch', 'haunted', 'possession',
      'curse', 'paranormal', 'vampire', 'werewolf', 'afterlife', 'reincarnat', 'rebirth',
      'monster', 'undead', 'spirit', 'devil', 'satan', 'voodoo', 'mythic', 'legendary',
      'creature', 'cryptid', 'sorcery', 'phantom', 'spooky', 'ghoul', 'magic', 'fairy',
      'sorcerer', 'shapeshifter', 'zombies', 'folklore', 'myth'
    ],
  },
  {
    id: 'mystery',
    name: 'Dark Mystery & Conspiracy',
    icon: '👁️',
    description: 'Shadowy organizations, hidden truths, occult puzzles, and labyrinthine conspiracies.',
    patterns: [
      'dark mystery', 'conspiracy', 'cover-up', 'secret society', 'cult', 'cabal', 'sinister',
      'occult mystery', 'hidden truth', 'puzzle', 'unexplained', 'secret', 'enigma', 'dark',
      'riddle', 'labyrinth', 'cryptic', 'intrigue', 'obscure', 'shadowy', 'macabre', 'eerie', 'chilling'
    ],
  },
  {
    id: 'war_military',
    name: 'War, Military & Geopolitics',
    icon: '🪖',
    description: 'Battlefield heroism, wartime struggle, military combat, and geopolitical conflict.',
    patterns: [
      'war', 'military', 'soldier', 'combat', 'battle', 'army', 'veteran', 'peace', 'treaty',
      'conflict', 'navy', 'air force', 'infantry', 'frontline', 'trench', 'patriot', 'silent war',
      'inter-korean', 'special forces', 'tactical', 'guerilla', 'hostilities', 'artillery'
    ],
  },
  {
    id: 'politics',
    name: 'Politics, Power & Social Issues',
    icon: '🏛️',
    description: 'Elections, government power, social inequality, caste/class struggles, and civil protests.',
    patterns: [
      'politic', 'capitalism', 'caste', 'election', 'government', 'monarchy', 'president',
      'corruption', 'fascism', 'communism', 'social issue', 'inequality', 'discrimination',
      'racism', 'oppression', 'human rights', 'protest', 'revolution', 'power', 'regime',
      'senate', 'minister', 'activism', 'class', 'privilege', 'poverty', 'democracy', 'tyranny',
      'citizen', 'systemic', 'society', 'community', 'state', 'nation', 'propaganda', 'parliament',
      'diplomat', 'treaty', 'border', 'immigration', 'refugee', 'colonial', 'imperial', 'geopolitic',
      'leader', 'social'
    ],
  },
  {
    id: 'legal',
    name: 'Courtroom, Legal & Justice System',
    icon: '⚖️',
    description: 'Tense legal trials, defense attorneys, courtroom battles, and fighting for justice.',
    patterns: [
      'court', 'lawyer', 'legal', 'trial', 'judge', 'prosecutor', 'defense attorney', 'verdict',
      'jury', 'wrongful conviction', 'death row', 'justice system', 'lawsuit', 'litigation',
      'attorney', 'justice', 'statute', 'innocent', 'guilty', 'subpoena', 'testimony', 'appeal',
      'witness', 'affidavit'
    ],
  },
  {
    id: 'family',
    name: 'Family Dynamics & Domestic Life',
    icon: '🏡',
    description: 'Parenthood, estranged kin, sibling rivalry, marriage, divorce, and home secrets.',
    patterns: [
      'family', 'father', 'mother', 'parent', 'sibling', 'brother', 'sister', 'daughter', 'son',
      'marriage', 'divorce', 'domestic', 'estranged', 'inheritance', 'caregiving', 'adoption',
      'grand', 'child', 'paternity', 'maternity', 'household', 'relatives', 'kin', 'home',
      'dysfunctional', 'custody', 'infant', 'baby', 'maternal', 'paternal', 'widow', 'widower',
      'orphan', 'stepmother', 'stepfather', 'legacy', 'relationship', 'reconcil', 'motherhood'
    ],
  },
  {
    id: 'romance',
    name: 'Romantic Tension & Heartbreak',
    icon: '❤️',
    description: 'Passionate lovers, forbidden attraction, romantic longing, affairs, and heartbreak.',
    patterns: [
      'romance', 'romantic', 'love', 'affair', 'infidelity', 'heartbreak', 'unrequited',
      'forbidden love', 'crush', 'dating', 'soulmate', 'enemies to lovers', 'passion', 'wedding',
      'courtship', 'lovers', 'sensual', 'intimate', 'attraction', 'longing', 'desire', 'flirt',
      'breakup', 'cheating', 'bride', 'groom', 'honeymoon', 'betrayal in love', 'jealousy'
    ],
  },
  {
    id: 'coming_of_age',
    name: 'Coming of Age, Youth & Friendship',
    icon: '🎓',
    description: 'Growing up, teen friendships, campus life, loss of innocence, and self-discovery.',
    patterns: [
      'coming of age', 'coming-of-age', 'coming_of_age', 'adolescen', 'youth', 'high school',
      'college', 'university', 'teen', 'childhood', 'growing up', 'friendship', 'camaraderie',
      'innocence', 'growth', 'student', 'boyhood', 'girlhood', 'peer', 'campus', 'dorm', 'prom',
      'graduation', 'mentor', 'pupil', 'education', 'school', 'teenage', 'juvenile', 'discov'
    ],
  },
  {
    id: 'sports',
    name: 'Underdog, Sports & Competition',
    icon: '🏆',
    description: 'Athletic glory, championship rivalries, underdog comebacks, and martial arts.',
    patterns: [
      'sports', 'underdog', 'champion', 'competi', 'tournament', 'athlete', 'boxing', 'football',
      'cricket', 'racing', 'olympic', 'rivalry', 'coach', 'training', 'martial arts', 'wrestling',
      'basketball', 'baseball', 'tennis', 'runner', 'swimmer', 'derby', 'stunt', 'championship',
      'game', 'score', 'match', 'gym', 'fitness'
    ],
  },
  {
    id: 'action_adventure',
    name: 'Action, Adventure & Superhero',
    icon: '💥',
    description: 'Fast-paced action spectacles, globetrotting adventures, and superhero feats.',
    patterns: [
      'action', 'adventure', 'superhero', 'epic journey', 'quest', 'treasure hunt', 'bounty',
      'combat', 'swordplay', 'chase', 'explosion', 'heroic', 'swashbuckl', 'wuxia', 'heroism'
    ],
  },
  {
    id: 'history',
    name: 'True Crime, Bio & History',
    icon: '📜',
    description: 'Based on true real-life events, biographical memoirs, and historical eras.',
    patterns: [
      'true crime', 'true story', 'based on true', 'biograph', 'documentary', 'history',
      'historic', 'real life', 'world war', 'wwii', 'wwi', 'period drama', 'memoir',
      'autobiography', 'chronicle', 'historical', 'empire', 'century', 'dynasty', 'ancient',
      'medieval', 'civil war', 'monarch', 'era', 'archive', 'historical figure', 'real-life'
    ],
  },
  {
    id: 'career',
    name: 'Workplace, Ambition & Success',
    icon: '💼',
    description: 'Corporate climbing, career vs life, entrepreneurial ambition, and financial stakes.',
    patterns: [
      'career', 'workplace', 'office', 'corporate', 'business', 'entrepreneur', 'wall street',
      'finance', 'ambition', 'greed', 'boss', 'job', 'industry', 'journalism', 'reporter',
      'executive', 'commercial', 'profession', 'money', 'success', 'wealth', 'investor',
      'work', 'employee', 'employer', 'company', 'firm', 'agency', 'contract', 'trade', 'economy'
    ],
  },
  {
    id: 'art_music',
    name: 'Art, Music, Comedy & Creativity',
    icon: '🎨',
    description: 'Musicians, artistic passions, stage performances, satire, and stand-up humor.',
    patterns: [
      'music', 'dance', 'art', 'artist', 'theater', 'theatre', 'band', 'song', 'singer',
      'musician', 'orchestra', 'ballet', 'hip hop', 'rock', 'performance', 'stage', 'creative',
      'broadway', 'canvas', 'cinema', 'hollywood', 'acting', 'actor', 'film', 'filmmak',
      'painting', 'sculpture', 'writer', 'novel', 'author', 'poetry', 'poem', 'comedy',
      'humor', 'satire', 'parody', 'stand-up'
    ],
  },
  {
    id: 'morality',
    name: 'Philosophy, Faith, Grief & Morality',
    icon: '🕊️',
    description: 'Moral dilemmas, existential reflections, spiritual redemption, grief, and forgiveness.',
    patterns: [
      'morality', 'philosophy', 'redemption', 'faith', 'religion', 'existential', 'grief',
      'bereavement', 'mourning', 'depression', 'suicide', 'spiritual', 'forgiveness', 'sacrifice',
      'human condition', 'cancer', 'struggle', 'dilemma', 'destiny', 'fate', 'meaning of life',
      'loss', 'atonement', 'sin', 'hope', 'tragedy', 'resilience', 'god', 'prayer', 'soul',
      'karma', 'heaven', 'hell', 'righteous', 'penance', 'holy', 'sacred', 'illness', 'disease',
      'terminal', 'human'
    ],
  },
  {
    id: 'other_themes',
    name: 'Other Narrative Concepts & Tropes',
    icon: '🎭',
    description: 'Additional creative storytelling tropes, motifs, and specialized narrative concepts.',
    patterns: [],
  },
];

/**
 * 17 Standard Streaming Movie & TV Categories (Genres)
 */
export const BROAD_GENRES: BroadGenreDefinition[] = [
  {
    id: 'action_adventure',
    name: 'Action & Adventure',
    icon: '💥',
    patterns: ['action', 'adventure', 'action & adventure', 'martial arts', 'superhero', 'wuxia', 'swashbuckler'],
  },
  {
    id: 'animation_anime',
    name: 'Animation & Anime',
    icon: '🎨',
    patterns: ['animation', 'anime', 'japanese animation', 'cartoon', 'animated'],
  },
  {
    id: 'comedy',
    name: 'Comedy & Stand-up',
    icon: '😂',
    patterns: ['comedy', 'stand-up', 'parody', 'satire', 'dark comedy', 'romantic comedy'],
  },
  {
    id: 'crime_gangster',
    name: 'Crime & Gangster',
    icon: '🔫',
    patterns: ['crime', 'heist', 'mafia', 'gangster', 'noir', 'neo-noir', 'caper'],
  },
  {
    id: 'documentary_bio',
    name: 'Documentary & Biography',
    icon: '🎥',
    patterns: ['documentary', 'biography', 'history', 'docuseries', 'nature', 'historical'],
  },
  {
    id: 'drama',
    name: 'Drama & Melodrama',
    icon: '🎭',
    patterns: ['drama', 'melodrama', 'period drama', 'social drama', 'family drama', 'soap'],
  },
  {
    id: 'fantasy_myth',
    name: 'Fantasy & Mythology',
    icon: '🧙',
    patterns: ['fantasy', 'mythology', 'fairy tale', 'folklore', 'magic'],
  },
  {
    id: 'horror_slasher',
    name: 'Horror & Slasher',
    icon: '🩸',
    patterns: ['horror', 'monster', 'slasher', 'gore', 'zombie', 'supernatural horror'],
  },
  {
    id: 'kids_family',
    name: 'Kids & Family',
    icon: '🧸',
    patterns: ['family', 'kids', 'children', 'animation & family', 'coming-of-age'],
  },
  {
    id: 'music_dance',
    name: 'Music & Musical',
    icon: '🎵',
    patterns: ['music', 'musical', 'concert', 'dance'],
  },
  {
    id: 'mystery_detective',
    name: 'Mystery & Detective',
    icon: '🔎',
    patterns: ['mystery', 'detective', 'whodunit', 'investigation', 'crime mystery'],
  },
  {
    id: 'reality_talk',
    name: 'Reality TV & Talk Shows',
    icon: '📺',
    patterns: ['reality', 'talk', 'game show', 'talk show'],
  },
  {
    id: 'romance',
    name: 'Romance & Love Stories',
    icon: '💖',
    patterns: ['romance', 'romantic', 'love story', 'rom-com'],
  },
  {
    id: 'sci_fi',
    name: 'Sci-Fi & Cyberpunk',
    icon: '🛸',
    patterns: ['science fiction', 'sci-fi', 'sci-fi & fantasy', 'cyberpunk', 'dystopia', 'space'],
  },
  {
    id: 'thriller_suspense',
    name: 'Thriller & Suspense',
    icon: '⚡',
    patterns: ['thriller', 'psychological thriller', 'action thriller', 'suspense'],
  },
  {
    id: 'war_military',
    name: 'War & Military',
    icon: '🪖',
    patterns: ['war', 'military', 'war & politics', 'combat'],
  },
  {
    id: 'western',
    name: 'Western',
    icon: '🤠',
    patterns: ['western', 'spaghetti western'],
  },
  {
    id: 'other_genres',
    name: 'Other Categories',
    icon: '🏷️',
    patterns: [],
  },
];

/**
 * Classifies any raw theme into its corresponding BroadThemeDefinition
 */
export function classifyTheme(rawTheme: string): BroadThemeDefinition {
  if (!rawTheme || typeof rawTheme !== 'string') {
    return BROAD_THEMES[BROAD_THEMES.length - 1]; // Other
  }
  const clean = rawTheme.toLowerCase().trim();

  // 1. Direct name match
  const exact = BROAD_THEMES.find((bt) => bt.name.toLowerCase() === clean);
  if (exact) return exact;

  // 2. Pattern matching
  for (const bt of BROAD_THEMES) {
    if (bt.patterns.length > 0 && bt.patterns.some((p) => clean.includes(p))) {
      return bt;
    }
  }

  // 3. Fallback
  return BROAD_THEMES[BROAD_THEMES.length - 1];
}

/**
 * Classifies any raw genre into its corresponding BroadGenreDefinition
 */
export function classifyGenre(rawGenre: string): BroadGenreDefinition {
  if (!rawGenre || typeof rawGenre !== 'string') {
    return BROAD_GENRES[BROAD_GENRES.length - 1];
  }
  const clean = rawGenre.toLowerCase().trim();

  const exact = BROAD_GENRES.find((bg) => bg.name.toLowerCase() === clean);
  if (exact) return exact;

  for (const bg of BROAD_GENRES) {
    if (bg.patterns.length > 0 && bg.patterns.some((p) => clean.includes(p) || p.includes(clean))) {
      return bg;
    }
  }

  return BROAD_GENRES[BROAD_GENRES.length - 1];
}

/**
 * Groups an array of raw themes under their broad theme parents
 */
export function groupThemesByBroad(rawThemes: string[]): Array<{
  broad: BroadThemeDefinition;
  subThemes: string[];
}> {
  const map = new Map<string, Set<string>>();
  for (const bt of BROAD_THEMES) {
    map.set(bt.id, new Set());
  }

  for (const rt of rawThemes) {
    const parent = classifyTheme(rt);
    map.get(parent.id)?.add(rt);
  }

  return BROAD_THEMES.map((bt) => ({
    broad: bt,
    subThemes: Array.from(map.get(bt.id) || []).sort(),
  })).filter((group) => group.subThemes.length > 0);
}

/**
 * Groups an array of raw genres under their broad genre parents
 */
export function groupGenresByBroad(rawGenres: string[]): Array<{
  broad: BroadGenreDefinition;
  subGenres: string[];
}> {
  const map = new Map<string, Set<string>>();
  for (const bg of BROAD_GENRES) {
    map.set(bg.id, new Set());
  }

  for (const rg of rawGenres) {
    const parent = classifyGenre(rg);
    map.get(parent.id)?.add(rg);
  }

  return BROAD_GENRES.map((bg) => ({
    broad: bg,
    subGenres: Array.from(map.get(bg.id) || []).sort(),
  })).filter((group) => group.subGenres.length > 0);
}

/**
 * Checks whether an item's themes match the selected filter themes.
 * Supports both broad theme selection (matches all constituent sub-themes)
 * and specific individual sub-theme selection!
 */
export function doesTitleMatchSelectedThemes(
  itemThemes: string[] = [],
  selectedThemes: string[],
  matchMode: 'any' | 'all' = 'any'
): boolean {
  if (!selectedThemes || selectedThemes.length === 0) return true;
  if (!itemThemes || itemThemes.length === 0) return false;

  const itemClassified = itemThemes.map((t) => classifyTheme(t).name.toLowerCase());
  const itemRawLower = itemThemes.map((t) => t.toLowerCase());

  const checkSingle = (selected: string): boolean => {
    const sLower = selected.toLowerCase();

    // Check if selected is a broad theme name
    const isBroad = BROAD_THEMES.some((bt) => bt.name.toLowerCase() === sLower);
    if (isBroad) {
      return itemClassified.includes(sLower);
    }

    // Otherwise match against raw theme
    return itemRawLower.includes(sLower);
  };

  if (matchMode === 'all') {
    return selectedThemes.every(checkSingle);
  } else {
    return selectedThemes.some(checkSingle);
  }
}

/**
 * Checks whether an item contains any excluded theme
 */
export function doesTitleHaveExcludedThemes(
  itemThemes: string[] = [],
  excludedThemes: string[]
): boolean {
  if (!excludedThemes || excludedThemes.length === 0) return false;
  if (!itemThemes || itemThemes.length === 0) return false;

  const itemClassified = itemThemes.map((t) => classifyTheme(t).name.toLowerCase());
  const itemRawLower = itemThemes.map((t) => t.toLowerCase());

  return excludedThemes.some((ex) => {
    const exLower = ex.toLowerCase();
    const isBroad = BROAD_THEMES.some((bt) => bt.name.toLowerCase() === exLower);
    if (isBroad) {
      return itemClassified.includes(exLower);
    }
    return itemRawLower.includes(exLower);
  });
}

/**
 * Checks whether an item's genres match the selected filter genres.
 * Supports broad genre selection (matches all constituent raw genres)
 * and specific individual genre selection!
 */
export function doesTitleMatchSelectedGenres(
  itemGenres: string[] = [],
  selectedGenres: string[],
  matchMode: 'any' | 'all' = 'any'
): boolean {
  if (!selectedGenres || selectedGenres.length === 0) return true;
  if (!itemGenres || itemGenres.length === 0) return false;

  const itemClassified = itemGenres.map((g) => classifyGenre(g).name.toLowerCase());
  const itemRawLower = itemGenres.map((g) => g.toLowerCase());

  const checkSingle = (selected: string): boolean => {
    const sLower = selected.toLowerCase();
    const isBroad = BROAD_GENRES.some((bg) => bg.name.toLowerCase() === sLower);
    if (isBroad) {
      return itemClassified.includes(sLower);
    }
    return itemRawLower.includes(sLower);
  };

  if (matchMode === 'all') {
    return selectedGenres.every(checkSingle);
  } else {
    return selectedGenres.some(checkSingle);
  }
}

/**
 * Checks whether an item contains any excluded genre
 */
export function doesTitleHaveExcludedGenres(
  itemGenres: string[] = [],
  excludedGenres: string[]
): boolean {
  if (!excludedGenres || excludedGenres.length === 0) return false;
  if (!itemGenres || itemGenres.length === 0) return false;

  const itemClassified = itemGenres.map((g) => classifyGenre(g).name.toLowerCase());
  const itemRawLower = itemGenres.map((g) => g.toLowerCase());

  return excludedGenres.some((ex) => {
    const exLower = ex.toLowerCase();
    const isBroad = BROAD_GENRES.some((bg) => bg.name.toLowerCase() === exLower);
    if (isBroad) {
      return itemClassified.includes(exLower);
    }
    return itemRawLower.includes(exLower);
  });
}
