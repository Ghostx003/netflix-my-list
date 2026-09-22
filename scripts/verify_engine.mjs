import Fuse from 'fuse.js';

// Standalone verification script mirroring src/services/searchEngine.ts

function normalizeForSearch(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/[–—_:]/g, ' ')
    .replace(/[^a-z0-9\s']/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collapseTitle(str) {
  if (!str) return '';
  return normalizeForSearch(str).replace(/[^a-z0-9]/g, '');
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function damerauLevenshtein(a, b) {
  const al = a.length;
  const bl = b.length;
  if (!al) return bl;
  if (!bl) return al;

  const matrix = [];
  for (let i = 0; i <= al; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bl; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
      }
    }
  }
  return matrix[al][bl];
}

function parseSearchQuery(query) {
  const trimmed = query.trim();
  const yearPattern = /(?:\s*[\(\[-]?\s*)(\b(?:19\d{2}|20\d{2})\b)(?:\s*[\)\]]?\s*)$/;
  const match = trimmed.match(yearPattern);

  if (match && match[1]) {
    const year = parseInt(match[1], 10);
    const titleCandidate = trimmed.slice(0, match.index).trim();
    if (titleCandidate.length > 0) {
      return {
        rawQuery: trimmed,
        cleanQuery: normalizeForSearch(titleCandidate),
        year,
      };
    }
  }

  return {
    rawQuery: trimmed,
    cleanQuery: normalizeForSearch(trimmed),
    year: undefined,
  };
}

function computeSimilarity(s1, s2) {
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;
  if (s1.length < 2 || s2.length < 2) {
    return s1 === s2 ? 1.0 : 0.0;
  }

  const getBigrams = (str) => {
    const bigrams = new Map();
    for (let i = 0; i < str.length - 1; i++) {
      const bg = str.substring(i, i + 2);
      bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
    }
    return bigrams;
  };

  const bg1 = getBigrams(s1);
  const bg2 = getBigrams(s2);

  let intersection = 0;
  for (const [bg, count] of bg1.entries()) {
    if (bg2.has(bg)) {
      intersection += Math.min(count, bg2.get(bg));
    }
  }

  const total = (s1.length - 1) + (s2.length - 1);
  return total > 0 ? (2 * intersection) / total : 0;
}

const sampleCatalog = [
  { id: '1', title: 'Argo', releaseYear: 2012, mediaType: 'movie', director: 'Ben Affleck', cast: ['Ben Affleck', 'Bryan Cranston'], genres: ['Biography', 'Drama', 'Thriller'] },
  { id: '2', title: 'The Twits', releaseYear: 2025, mediaType: 'movie', genres: ['Animation', 'Comedy'] },
  { id: '3', title: 'Fargo', releaseYear: 1996, mediaType: 'movie', director: 'Joel Coen', genres: ['Crime', 'Drama'] },
  { id: '4', title: 'Django Unchained', releaseYear: 2012, mediaType: 'movie', director: 'Quentin Tarantino', cast: ['Jamie Foxx', 'Leonardo DiCaprio'], genres: ['Drama', 'Western'] },
  { id: '5', title: 'Inception', releaseYear: 2010, mediaType: 'movie', director: 'Christopher Nolan', cast: ['Leonardo DiCaprio', 'Joseph Gordon-Levitt'], genres: ['Action', 'Sci-Fi'] },
  { id: '6', title: 'The Dark Knight', releaseYear: 2008, mediaType: 'movie', director: 'Christopher Nolan', cast: ['Christian Bale', 'Heath Ledger'], genres: ['Action', 'Crime'] },
  { id: '7', title: 'Stranger Things', releaseYear: 2016, mediaType: 'tv', creator: 'The Duffer Brothers', cast: ['Millie Bobby Brown', 'Winona Ryder'], genres: ['Drama', 'Sci-Fi'] },
  { id: '8', title: 'Spider-Man: Into the Spider-Verse', releaseYear: 2018, mediaType: 'movie', genres: ['Animation'] },
  { id: '9', title: "Harry Potter and the Sorcerer's Stone", releaseYear: 2001, mediaType: 'movie', genres: ['Fantasy'] },
  { id: '10', title: 'Jamtara - Sabka Number Ayega', releaseYear: 2020, mediaType: 'tv', genres: ['Crime', 'Drama'] },
];

class SearchEngine {
  constructor(catalog = [], library = []) {
    this.initializeIndex(catalog, library);
  }

  initializeIndex(catalog = [], library = []) {
    const dedupeMap = new Map();
    const identityIndex = new Map();

    const registerItem = (item, sourceType) => {
      if (!item) return;
      const canonicalTitle = item.title || item.externalTitle || item.originalTitle || '';
      const normTitle = normalizeForSearch(canonicalTitle);
      const collTitle = collapseTitle(canonicalTitle);
      const primaryTitle = canonicalTitle.split(/\s*[-:–—|]\s*/)[0].trim();
      const normPrimaryTitle = normalizeForSearch(primaryTitle);
      const collPrimaryTitle = collapseTitle(primaryTitle);
      const titleWords = normTitle.split(/\s+/).filter((w) => w.length >= 2);

      const mediaType = item.mediaType || 'movie';
      const year = item.releaseYear ? String(item.releaseYear) : '';

      const netflixId = item.netflixId || item.videoId;
      const imdbId = item.imdbId;
      const tmdbId = item.tmdbId || item.externalId;

      const keys = [];
      if (netflixId) keys.push(`netflix_${netflixId}`);
      if (imdbId) keys.push(`imdb_${imdbId}`);
      if (tmdbId) keys.push(`tmdb_${mediaType}_${tmdbId}`);
      if (collTitle) {
        if (year) keys.push(`title_${collTitle}_${mediaType}_${year}`);
        keys.push(`title_${collTitle}_${mediaType}`);
        keys.push(`title_${collTitle}`);
      }

      let existingKey;
      for (const k of keys) {
        if (identityIndex.has(k)) {
          existingKey = identityIndex.get(k);
          break;
        }
      }

      if (existingKey && dedupeMap.has(existingKey)) {
        const existing = dedupeMap.get(existingKey);
        if (sourceType === 'library') {
          existing.sourceType = 'library';
          existing.id = item.id;
        }
        for (const k of keys) {
          identityIndex.set(k, existingKey);
        }
      } else {
        const primaryKey = item.id || `entry_${keys[0]}`;
        dedupeMap.set(primaryKey, {
          ...item,
          id: primaryKey,
          title: canonicalTitle,
          normalizedTitle: normTitle,
          collapsedTitle: collTitle,
          primaryTitle,
          normalizedPrimaryTitle: normPrimaryTitle,
          collapsedPrimaryTitle: collPrimaryTitle,
          titleWords,
          mediaType,
          netflixId,
          imdbId,
          sourceType,
        });
        for (const k of keys) {
          identityIndex.set(k, primaryKey);
        }
      }
    };

    for (const item of library) registerItem(item, 'library');
    for (const item of catalog) registerItem(item, 'discovery');

    this.items = Array.from(dedupeMap.values());
    this.fuse = new Fuse(this.items, {
      includeScore: true,
      shouldSort: false,
      threshold: 0.52,
      distance: 100,
      ignoreLocation: true,
      minMatchCharLength: 2,
      keys: [
        { name: 'title', weight: 0.4 },
        { name: 'primaryTitle', weight: 0.35 },
        { name: 'normalizedTitle', weight: 0.2 },
        { name: 'titleWords', weight: 0.25 },
        { name: 'director', weight: 0.1 },
        { name: 'creator', weight: 0.1 },
        { name: 'cast', weight: 0.1 },
      ],
    });
  }

  search(queryStr, maxResults) {
    if (!queryStr || !queryStr.trim()) return { results: [], didYouMean: undefined };
    const parsed = parseSearchQuery(queryStr);
    const { cleanQuery, year } = parsed;
    const collapsedQuery = collapseTitle(cleanQuery);
    const queryTokens = cleanQuery.split(' ').filter(Boolean);
    const wordStartRegex = new RegExp(`\\b${escapeRegExp(cleanQuery)}`, 'i');

    const scoredMap = new Map();

    for (const item of this.items) {
      let score = 0;
      let matchedReason = '';

      if (cleanQuery === item.normalizedTitle) {
        score += 10000;
        matchedReason = 'exact';
      } else if (cleanQuery === item.normalizedPrimaryTitle) {
        score += 9000;
        matchedReason = 'primary_exact';
      } else if (collapsedQuery.length > 2 && collapsedQuery === item.collapsedTitle) {
        score += 8500;
        matchedReason = 'collapsed_exact';
      } else if (collapsedQuery.length > 2 && collapsedQuery === item.collapsedPrimaryTitle) {
        score += 8000;
        matchedReason = 'collapsed_primary_exact';
      } else if (
        item.normalizedTitle.startsWith(cleanQuery) ||
        (collapsedQuery.length >= 4 && item.collapsedTitle.startsWith(collapsedQuery))
      ) {
        score += 4500;
        matchedReason = 'prefix';
      } else if (item.normalizedTitle.split(' ').includes(cleanQuery) || item.titleWords.includes(cleanQuery)) {
        score += 4000;
        matchedReason = 'word_exact';
      } else {
        // Typo tolerance pass via Damerau-Levenshtein
        let minEditDist = 999;
        let matchedTarget = '';

        if (item.collapsedPrimaryTitle && item.collapsedPrimaryTitle.length >= 4) {
          const dist = damerauLevenshtein(collapsedQuery, item.collapsedPrimaryTitle);
          if (dist < minEditDist) {
            minEditDist = dist;
            matchedTarget = item.primaryTitle;
          }
        }

        for (const w of item.titleWords) {
          if (w.length >= 4) {
            const dist = damerauLevenshtein(collapsedQuery, collapseTitle(w));
            if (dist < minEditDist) {
              minEditDist = dist;
              matchedTarget = w;
            }
          }
        }

        const maxAllowedDist = collapsedQuery.length >= 8 ? 2 : collapsedQuery.length >= 5 ? 1 : 0;
        if (minEditDist <= maxAllowedDist && minEditDist > 0) {
          score += minEditDist === 1 ? 3500 : 2500;
          matchedReason = `typo:${matchedTarget}`;
        } else if (queryTokens.length > 1) {
          let matchingTokens = 0;
          const itemTokens = item.normalizedTitle.split(' ');
          for (const token of queryTokens) {
            if (itemTokens.some((t) => t.includes(token))) {
              matchingTokens++;
            }
          }
          if (matchingTokens > 0) {
            score += (matchingTokens / queryTokens.length) * 1500;
            matchedReason = 'token_match';
          }
        }
      }

      // Secondary metadata matching (Director, Creator, Cast, Genre)
      if (score === 0 && cleanQuery.length >= 3) {
        if (item.director && wordStartRegex.test(normalizeForSearch(item.director))) {
          score = 800;
          matchedReason = `Director: ${item.director}`;
        } else if (item.creator && wordStartRegex.test(normalizeForSearch(item.creator))) {
          score = 800;
          matchedReason = `Creator: ${item.creator}`;
        } else if (item.cast && item.cast.length > 0) {
          const actorHit = item.cast.find((actor) => wordStartRegex.test(normalizeForSearch(actor)));
          if (actorHit) {
            score = 600;
            matchedReason = `Cast: ${actorHit}`;
          }
        } else {
          const genreHit = (item.genres || []).find((g) => wordStartRegex.test(normalizeForSearch(g)));
          if (genreHit) {
            score = 400;
            matchedReason = `Genre: ${genreHit}`;
          }
        }
      }

      if (year && item.releaseYear) {
        if (item.releaseYear === year) {
          score += 3000;
        } else if (Math.abs(item.releaseYear - year) <= 1) {
          score += 1200;
        } else {
          score -= 800;
        }
      }

      if (score > 0) {
        scoredMap.set(item.id, { item, score, matchedReason });
      }
    }

    // Fuse.js fuzzy pass
    const fuseMatches = this.fuse.search(cleanQuery);
    for (const match of fuseMatches) {
      const item = match.item;
      const fuseScore = match.score ?? 1.0;
      const fuzzyBoost = (1.0 - fuseScore) * 1500;

      if (scoredMap.has(item.id)) {
        const existing = scoredMap.get(item.id);
        existing.score += fuzzyBoost;
      } else if (fuseScore <= 0.45) {
        let baseScore = fuzzyBoost;
        if (year && item.releaseYear) {
          if (item.releaseYear === year) {
            baseScore += 3000;
          } else {
            baseScore -= 800;
          }
        }
        scoredMap.set(item.id, {
          item,
          score: baseScore,
          matchedReason: 'fuzzy',
        });
      }
    }

    const sorted = Array.from(scoredMap.values())
      .filter((r) => r.score > 250)
      .sort((a, b) => b.score - a.score)
      .map((r) => ({
        ...r.item,
        score: Math.round(r.score),
        matchedReason: r.matchedReason,
      }));

    // Did you mean calculation
    let didYouMean = undefined;
    const hasExactMatch = sorted.some((r) => r.matchedReason === 'exact' || r.matchedReason === 'primary_exact');
    if (!hasExactMatch && cleanQuery.length >= 4 && sorted.length > 0) {
      const topPick = sorted[0];
      const simFull = computeSimilarity(collapsedQuery, topPick.collapsedTitle);
      const simPrimary = computeSimilarity(collapsedQuery, topPick.collapsedPrimaryTitle);
      const damerauDistPrimary = damerauLevenshtein(collapsedQuery, topPick.collapsedPrimaryTitle);

      const isTypoMatch = damerauDistPrimary <= (collapsedQuery.length >= 7 ? 2 : 1);
      const isSimMatch = simFull >= 0.72 || simPrimary >= 0.72;

      if (
        (isTypoMatch || isSimMatch) &&
        cleanQuery !== topPick.normalizedTitle &&
        cleanQuery !== topPick.normalizedPrimaryTitle
      ) {
        didYouMean = topPick.title;
      }
    }

    // Deduplicate in final output
    const seenFinal = new Set();
    const finalResults = [];
    for (const res of sorted) {
      const uniqueKey = `${res.collapsedTitle}_${res.mediaType}`;
      if (!seenFinal.has(uniqueKey)) {
        seenFinal.add(uniqueKey);
        finalResults.push(res);
      }
    }

    const limit = maxResults !== undefined ? (maxResults > 0 ? maxResults : finalResults.length) : 30;
    return { results: finalResults.slice(0, limit), didYouMean };
  }
}

// RUN TESTS
console.log('=============================================');
console.log('RUNNING NETFLIX MOVIE SEARCH VERIFICATION');
console.log('=============================================\n');

const engine = new SearchEngine(sampleCatalog);

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

// Test 1: User's complaint "argo"
console.log('--- TEST 1: User Complaint Query "argo" ---');
const argoRes = engine.search('argo');
console.log('Results for "argo":', argoRes.results.map((r) => `${r.title} (score: ${r.score})`));
assert(argoRes.results[0]?.title === 'Argo', '"Argo" must be top result for "argo"');
assert(!argoRes.results.some((r) => r.title === 'The Twits'), '"The Twits" must NOT appear in results for "argo"');

// Test 2: User's complaint "jamtare"
console.log('\n--- TEST 2: User Complaint Query "jamtare" ---');
const jamtareRes = engine.search('jamtare');
console.log('Results for "jamtare":', jamtareRes.results.map((r) => `${r.title} (score: ${r.score})`));
console.log('Did you mean:', jamtareRes.didYouMean);
assert(jamtareRes.results[0]?.title === 'Jamtara - Sabka Number Ayega', '"Jamtara - Sabka Number Ayega" must be top result for "jamtare"');
assert(jamtareRes.didYouMean === 'Jamtara - Sabka Number Ayega', 'Did you mean must suggest Jamtara for "jamtare"');

// Test 3: User's complaint "jmatara" (transposition)
console.log('\n--- TEST 3: User Complaint Query "jmatara" ---');
const jmataraRes = engine.search('jmatara');
console.log('Results for "jmatara":', jmataraRes.results.map((r) => `${r.title} (score: ${r.score})`));
console.log('Did you mean:', jmataraRes.didYouMean);
assert(jmataraRes.results[0]?.title === 'Jamtara - Sabka Number Ayega', '"Jamtara - Sabka Number Ayega" must be top result for "jmatara"');
assert(jmataraRes.didYouMean === 'Jamtara - Sabka Number Ayega', 'Did you mean must suggest Jamtara for "jmatara"');

// Test 4: Typo tolerance "incepton"
console.log('\n--- TEST 4: Typo Tolerance "incepton" ---');
const inceptonRes = engine.search('incepton');
console.log('Results for "incepton":', inceptonRes.results.map((r) => `${r.title} (score: ${r.score})`));
console.log('Did you mean:', inceptonRes.didYouMean);
assert(inceptonRes.results[0]?.title === 'Inception', '"Inception" must be returned for typo "incepton"');
assert(inceptonRes.didYouMean === 'Inception', 'Must suggest Did You Mean "Inception" for "incepton"');

// Test 5: Swapped letters "incpetion"
console.log('\n--- TEST 5: Swapped Letters "incpetion" ---');
const incpetionRes = engine.search('incpetion');
assert(incpetionRes.results[0]?.title === 'Inception', '"Inception" must be returned for swapped letters "incpetion"');

// Test 6: Year Boost "Inception 2010"
console.log('\n--- TEST 6: Year Boost "Inception 2010" ---');
const yearExactRes = engine.search('Inception 2010');
assert(yearExactRes.results[0]?.title === 'Inception', '"Inception" returned for "Inception 2010"');
assert(yearExactRes.results[0]?.score > 10000, 'Exact year must give massive boost');

// Test 7: Wrong Year "Inception 2008"
console.log('\n--- TEST 7: Wrong Year Query "Inception 2008" ---');
const wrongYearRes = engine.search('Inception 2008');
assert(wrongYearRes.results[0]?.title === 'Inception', '"Inception" still found for "Inception 2008"');
assert(wrongYearRes.results[0]?.releaseYear === 2010, 'Release year in record must remain actual database year 2010');
assert(wrongYearRes.results[0]?.score < yearExactRes.results[0]?.score, 'Wrong year score must be penalized compared to exact year');

// Test 8: Collapsed title "spiderman"
console.log('\n--- TEST 8: Collapsed Title "spiderman" ---');
const spiderRes = engine.search('spiderman');
assert(spiderRes.results[0]?.title.includes('Spider-Man'), 'Collapsed "spiderman" matches "Spider-Man"');

// Test 9: Garbage input
console.log('\n--- TEST 9: Garbage Input "xyz987qrpom" ---');
const garbageRes = engine.search('xyz987qrpom');
assert(garbageRes.results.length === 0, 'Garbage query returns 0 results');
assert(garbageRes.didYouMean === undefined, 'Garbage query produces no Did You Mean suggestion');

// Test 10: Director Search "nolan"
console.log('\n--- TEST 10: Director Search "nolan" ---');
const nolanRes = engine.search('nolan');
assert(nolanRes.results.some((r) => r.title === 'Inception'), 'Director search finds Inception');
assert(nolanRes.results.some((r) => r.title === 'The Dark Knight'), 'Director search finds The Dark Knight');

// Test 11: Actor / Cast Search "dicaprio"
console.log('\n--- TEST 11: Actor Search "dicaprio" ---');
const castRes = engine.search('dicaprio');
assert(castRes.results.some((r) => r.title === 'Inception'), 'Cast search finds Inception for Leonardo DiCaprio');
assert(castRes.results.some((r) => r.title === 'Django Unchained'), 'Cast search finds Django Unchained for Leonardo DiCaprio');

// Test 12: USER ISSUE - Prevent Duplicate Titles (Breaking Bad in catalog AND library)
console.log('\n--- TEST 12: Deduplication Test ("brea" query with Breaking Bad in catalog and library) ---');
const testCatalog = [
  { id: 'disc_breakdown', title: 'Breakdown', releaseYear: 1997, mediaType: 'movie' },
  { id: 'disc_breathless', title: 'Breathless', releaseYear: 2024, mediaType: 'tv' },
  { id: 'disc_bb', title: 'Breaking Bad', releaseYear: 2008, mediaType: 'tv', netflixId: '80057281', imdbId: 'tt0903747' },
  { id: 'disc_breaking_in', title: 'Breaking In', releaseYear: 2018, mediaType: 'movie' },
];
const testLibrary = [
  { id: 'lib_bb_123', originalTitle: 'Breaking Bad', releaseYear: 2008, mediaType: 'tv', videoId: '80057281', imdbId: 'tt0903747' },
];

const dedupeEngine = new SearchEngine(testCatalog, testLibrary);
const breaRes = dedupeEngine.search('brea');
const bbOccurrences = breaRes.results.filter((r) => r.title === 'Breaking Bad').length;
assert(bbOccurrences === 1, `Breaking Bad must appear EXACTLY ONCE in search results (found ${bbOccurrences})`);
assert(breaRes.results.find((r) => r.title === 'Breaking Bad')?.sourceType === 'library', 'Unified record should retain library status');

console.log('\n=============================================');
console.log('ALL 12 VERIFICATION ASSERTIONS PASSED PERFECTLY!');
console.log('=============================================');
