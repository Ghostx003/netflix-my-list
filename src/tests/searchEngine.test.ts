import { describe, it, expect, beforeEach } from 'vitest';
import { MovieSearchEngine, normalizeForSearch, collapseTitle, parseSearchQuery } from '../services/searchEngine';
import { DiscoveryTitle, LibraryItem } from '../types';

describe('MovieSearchEngine Suite', () => {
  let searchEngine: MovieSearchEngine;

  const sampleCatalog: DiscoveryTitle[] = [
    {
      id: 'disc-argo',
      title: 'Argo',
      releaseYear: 2012,
      mediaType: 'movie',
      imdbRating: 7.7,
      genres: ['Biography', 'Drama', 'Thriller'],
      countries: ['United States'],
      isNetflixIndiaVerified: true,
    },
    {
      id: 'disc-twits',
      title: 'The Twits',
      releaseYear: 2025,
      mediaType: 'movie',
      genres: ['Animation', 'Comedy'],
      countries: ['United States'],
      isNetflixIndiaVerified: true,
    },
    {
      id: 'disc-fargo',
      title: 'Fargo',
      releaseYear: 1996,
      mediaType: 'movie',
      genres: ['Crime', 'Drama', 'Thriller'],
      countries: ['United States'],
      isNetflixIndiaVerified: true,
    },
    {
      id: 'disc-django',
      title: 'Django Unchained',
      releaseYear: 2012,
      mediaType: 'movie',
      genres: ['Drama', 'Western'],
      countries: ['United States'],
      isNetflixIndiaVerified: true,
    },
    {
      id: 'disc-inception',
      title: 'Inception',
      releaseYear: 2010,
      mediaType: 'movie',
      imdbRating: 8.8,
      director: 'Christopher Nolan',
      genres: ['Action', 'Sci-Fi'],
      countries: ['United States'],
      isNetflixIndiaVerified: true,
    },
    {
      id: 'disc-dark-knight',
      title: 'The Dark Knight',
      releaseYear: 2008,
      mediaType: 'movie',
      imdbRating: 9.0,
      director: 'Christopher Nolan',
      genres: ['Action', 'Crime', 'Drama'],
      countries: ['United States'],
      isNetflixIndiaVerified: true,
    },
    {
      id: 'disc-stranger-things',
      title: 'Stranger Things',
      releaseYear: 2016,
      mediaType: 'tv',
      imdbRating: 8.7,
      genres: ['Drama', 'Fantasy', 'Horror'],
      countries: ['United States'],
      isNetflixIndiaVerified: true,
    },
    {
      id: 'disc-spiderman',
      title: 'Spider-Man: Into the Spider-Verse',
      releaseYear: 2018,
      mediaType: 'movie',
      imdbRating: 8.4,
      genres: ['Animation', 'Action', 'Adventure'],
      countries: ['United States'],
      isNetflixIndiaVerified: true,
    },
    {
      id: 'disc-harry-potter-1',
      title: "Harry Potter and the Sorcerer's Stone",
      releaseYear: 2001,
      mediaType: 'movie',
      imdbRating: 7.6,
      genres: ['Adventure', 'Family', 'Fantasy'],
      countries: ['United States'],
      isNetflixIndiaVerified: true,
    },
    {
      id: 'disc-jamtara',
      title: 'Jamtara - Sabka Number Ayega',
      releaseYear: 2020,
      mediaType: 'tv',
      imdbRating: 7.3,
      genres: ['Crime', 'Drama'],
      countries: ['India'],
      isNetflixIndiaVerified: true,
    },
  ];

  beforeEach(() => {
    searchEngine = new MovieSearchEngine();
    searchEngine.initializeIndex(sampleCatalog, []);
  });

  describe('Query Parser & Normalization', () => {
    it('normalizes accents, casing, and punctuation', () => {
      expect(normalizeForSearch('  Amélie: Le Fabuleux Destin!  ')).toBe('amelie le fabuleux destin');
      expect(collapseTitle('Spider-Man: No Way Home')).toBe('spidermannowayhome');
    });

    it('extracts year and clean query from various year formats', () => {
      expect(parseSearchQuery('Inception 2010')).toEqual({
        originalQuery: 'Inception 2010',
        titleQuery: 'Inception',
        yearCandidate: 2010,
      });

      expect(parseSearchQuery('Inception (2010)')).toEqual({
        originalQuery: 'Inception (2010)',
        titleQuery: 'Inception',
        yearCandidate: 2010,
      });

      expect(parseSearchQuery('The Dark Knight')).toEqual({
        originalQuery: 'The Dark Knight',
        titleQuery: 'The Dark Knight',
        yearCandidate: null,
      });
    });
  });

  describe('Targeted Search Results: "Argo" vs Irrelevant items', () => {
    it('ranks "Argo" strictly at #1 and excludes unrelated titles like "The Twits"', () => {
      const response = searchEngine.search('argo');
      expect(response.results.length).toBeGreaterThan(0);
      expect(response.results[0].item.title).toBe('Argo');
      expect(response.results[0].score).toBeGreaterThan(80);

      // Verify "The Twits" is NOT included in the results for "argo"
      const foundTwits = response.results.some((r) => r.item.title === 'The Twits');
      expect(foundTwits).toBe(false);
    });
  });

  describe('Fuzzy Matching & Typo Tolerance', () => {
    it('finds "Inception" for typo query "incepton"', () => {
      const response = searchEngine.search('incepton');
      expect(response.results.length).toBeGreaterThan(0);
      expect(response.results[0].item.title).toBe('Inception');
    });

    it('finds "Inception" for swapped letters query "incpetion"', () => {
      const response = searchEngine.search('incpetion');
      expect(response.results.length).toBeGreaterThan(0);
      expect(response.results[0].item.title).toBe('Inception');
    });

    it('finds "The Dark Knight" for typo "drak knight"', () => {
      const response = searchEngine.search('drak knight');
      expect(response.results.length).toBeGreaterThan(0);
      expect(response.results[0].item.title).toBe('The Dark Knight');
    });

    it('matches collapsed titles like "spiderman"', () => {
      const response = searchEngine.search('spiderman');
      expect(response.results.length).toBeGreaterThan(0);
      expect(response.results[0].item.title).toContain('Spider-Man');
    });

    it('finds "Jamtara - Sabka Number Ayega" for typo "jamtare"', () => {
      const response = searchEngine.search('jamtare');
      expect(response.results.length).toBeGreaterThan(0);
      expect(response.results[0].item.title).toBe('Jamtara - Sabka Number Ayega');
    });

    it('finds "Jamtara - Sabka Number Ayega" for transposed typo "jmatara"', () => {
      const response = searchEngine.search('jmatara');
      expect(response.results.length).toBeGreaterThan(0);
      expect(response.results[0].item.title).toBe('Jamtara - Sabka Number Ayega');
    });
  });

  describe('Did You Mean Suggestions', () => {
    it('suggests "Inception" for "incepton"', () => {
      const response = searchEngine.search('incepton');
      expect(response.didYouMean?.suggestedTitle).toBe('Inception');
    });

    it('suggests "Jamtara - Sabka Number Ayega" for "jamtare" and "jmatara"', () => {
      const response1 = searchEngine.search('jamtare');
      expect(response1.didYouMean?.suggestedTitle).toBe('Jamtara - Sabka Number Ayega');

      const response2 = searchEngine.search('jmatara');
      expect(response2.didYouMean?.suggestedTitle).toBe('Jamtara - Sabka Number Ayega');
    });

    it('does NOT provide a suggestion for exact match "Inception"', () => {
      const response = searchEngine.search('Inception');
      expect(response.didYouMean).toBeNull();
    });

    it('does NOT provide a suggestion for random garbage input', () => {
      const response = searchEngine.search('xyz987qrpom');
      expect(response.results.length).toBe(0);
      expect(response.didYouMean).toBeNull();
    });
  });

  describe('Year-Aware Search & Scoring', () => {
    it('gives maximum boost to "Inception" when year 2010 is specified', () => {
      const responseExact = searchEngine.search('Inception 2010');
      expect(responseExact.results[0].item.title).toBe('Inception');
      expect(responseExact.results[0].item.releaseYear).toBe(2010);
      expect(responseExact.results[0].score).toBeGreaterThan(90);
    });

    it('still finds "Inception" when user queries wrong year "Inception 2008", but preserves database year 2010', () => {
      const responseWrongYear = searchEngine.search('Inception 2008');
      expect(responseWrongYear.results.length).toBeGreaterThan(0);
      expect(responseWrongYear.results[0].item.title).toBe('Inception');
      // The releaseYear displayed must remain the actual database year (2010)
      expect(responseWrongYear.results[0].item.releaseYear).toBe(2010);
      // Penalized score should be lower than exact year search
      const responseExact = searchEngine.search('Inception 2010');
      expect(responseWrongYear.results[0].score).toBeLessThan(responseExact.results[0].score);
    });
  });

  describe('Library Items Integration', () => {
    it('indexes and returns library items alongside catalog items', () => {
      const libraryItems: LibraryItem[] = [
        {
          id: 'lib-better-call-saul',
          originalTitle: 'Better Call Saul',
          normalizedTitle: 'better call saul',
          mediaType: 'tv',
          status: 'matched',
          viewingStatus: 'still_watching',
          releaseYear: 2015,
          addedAt: '',
          updatedAt: '',
        },
      ];

      searchEngine.initializeIndex(sampleCatalog, libraryItems);
      const response = searchEngine.search('Better Call Saul');
      expect(response.results.length).toBeGreaterThan(0);
      expect(response.results[0].item.title).toBe('Better Call Saul');
      expect(response.results[0].item.sourceType).toBe('library');
    });
  });

  describe('Director & Crew Metadata Search', () => {
    it('finds Christopher Nolan movies when querying "nolan"', () => {
      const response = searchEngine.search('nolan');
      expect(response.results.length).toBeGreaterThan(0);
      const titles = response.results.map((r) => r.item.title);
      expect(titles).toContain('Inception');
      expect(titles).toContain('The Dark Knight');
    });
  });

  describe('Uncapped Pagination Query', () => {
    it('returns all matched results when maxResults is 0', () => {
      const response = searchEngine.search('movie', 0);
      expect(response.results.length).toBe(response.totalMatches);
    });
  });

  describe('Duplicate Prevention & Catalog/Library Unification', () => {
    it('unifies titles that exist in both catalog and library into a single record without duplicates', () => {
      const extraCatalog: DiscoveryTitle[] = [
        {
          id: 'disc-bb',
          title: 'Breaking Bad',
          releaseYear: 2008,
          mediaType: 'tv',
          netflixId: '80057281',
          imdbId: 'tt0903747',
          genres: ['Crime', 'Drama', 'Thriller'],
          countries: ['United States'],
          isNetflixIndiaVerified: true,
        },
      ];
      const extraLibrary: LibraryItem[] = [
        {
          id: 'lib-bb',
          originalTitle: 'Breaking Bad',
          normalizedTitle: 'breaking bad',
          releaseYear: 2008,
          mediaType: 'tv',
          videoId: '80057281',
          imdbId: 'tt0903747',
          status: 'matched',
          viewingStatus: 'still_watching',
          addedAt: '',
          updatedAt: '',
        },
      ];

      searchEngine.initializeIndex(extraCatalog, extraLibrary);
      const response = searchEngine.search('brea');
      const bbMatches = response.results.filter((r) => r.item.title === 'Breaking Bad');

      expect(bbMatches.length).toBe(1);
      expect(bbMatches[0].item.sourceType).toBe('library');
    });
  });
});
