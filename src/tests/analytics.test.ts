import { describe, it, expect } from 'vitest';
import { normalizeTitle, createDuplicateKey } from '../services/normalizer';
import { deduplicateAndPrepareItems } from '../services/duplicateDetector';
import {
  calculateSeriesRuntime,
  calculateRealViewingHours,
  calculateCompletionMetrics,
  computeAnalytics,
} from '../services/analytics';
import { selectBestTrailer } from '../services/tmdb';
import { LibraryItem, AppSettings } from '../types';

describe('Netflix Watchlist Analytics Test Suite', () => {
  describe('1. Normalization & Duplicate Detection', () => {
    it('normalizes titles with special characters, accents, and casing', () => {
      expect(normalizeTitle('  Dark: Season 1  ')).toBe('dark season 1');
      expect(normalizeTitle('Amélie')).toBe('amelie');
      expect(normalizeTitle('Grey’s Anatomy')).toBe("grey's anatomy");
    });

    it('prevents duplicates across multiple imports', () => {
      const existing: LibraryItem[] = [
        {
          id: '1',
          originalTitle: 'The Batman',
          normalizedTitle: 'the batman',
          mediaType: 'movie',
          status: 'matched',
          addedAt: '',
          updatedAt: '',
        },
      ];

      // Day 2 import: duplicate of The Batman and 1 new show
      const day2Import = [
        { title: 'the batman ' },
        { title: 'Dark' },
      ];

      const result = deduplicateAndPrepareItems(day2Import, existing);
      expect(result.duplicateCount).toBe(1);
      expect(result.newItems.length).toBe(1);
      expect(result.newItems[0].originalTitle).toBe('Dark');
    });

    it('handles duplicates within the same import file', () => {
      const batch = [
        { title: 'Stranger Things' },
        { title: 'STRANGER THINGS' },
        { title: 'Stranger  Things' },
      ];
      const result = deduplicateAndPrepareItems(batch, []);
      expect(result.newItems.length).toBe(1);
      expect(result.duplicateCount).toBe(2);
    });
  });

  describe('2. Movie & TV Series Runtime Calculations', () => {
    it('sums exact episode runtimes for TV series', () => {
      const series: LibraryItem = {
        id: 'tv1',
        originalTitle: 'Dark',
        normalizedTitle: 'dark',
        mediaType: 'tv',
        status: 'matched',
        totalEpisodes: 5,
        averageEpisodeMinutes: 50,
        episodes: [
          { id: 1, seasonNumber: 1, episodeNumber: 1, name: 'Ep 1', runtimeMinutes: 52 },
          { id: 2, seasonNumber: 1, episodeNumber: 2, name: 'Ep 2', runtimeMinutes: 45 },
          { id: 3, seasonNumber: 1, episodeNumber: 3, name: 'Ep 3', runtimeMinutes: 46 },
          { id: 4, seasonNumber: 1, episodeNumber: 4, name: 'Ep 4', runtimeMinutes: 48 },
          { id: 5, seasonNumber: 1, episodeNumber: 5, name: 'Ep 5', runtimeMinutes: 46 },
        ],
        addedAt: '',
        updatedAt: '',
      };

      const breakdown = calculateSeriesRuntime(series, 10);
      expect(breakdown.totalEpisodes).toBe(5);
      expect(breakdown.includedEpisodes).toBe(5);
      // 52 + 45 + 46 + 48 + 46 = 237 minutes
      expect(breakdown.includedRuntimeMinutes).toBe(237);
      expect(breakdown.averageEpisodeMinutes).toBe(Math.round(237 / 5)); // 47m
    });

    it('strictly enforces the configurable episode limit (e.g. 10 episodes max)', () => {
      const episodes = Array.from({ length: 26 }, (_, i) => ({
        id: i + 1,
        seasonNumber: Math.floor(i / 10) + 1,
        episodeNumber: (i % 10) + 1,
        name: 'Ep ' + (i + 1),
        runtimeMinutes: 50,
      }));

      const bigSeries: LibraryItem = {
        id: 'tv2',
        originalTitle: 'Long Show',
        normalizedTitle: 'long show',
        mediaType: 'tv',
        status: 'matched',
        totalEpisodes: 26,
        episodes,
        addedAt: '',
        updatedAt: '',
      };

      // Default 10 episodes limit
      const limit10 = calculateSeriesRuntime(bigSeries, 10);
      expect(limit10.totalEpisodes).toBe(26);
      expect(limit10.includedEpisodes).toBe(10);
      expect(limit10.includedRuntimeMinutes).toBe(500); // 10 * 50

      // Custom 5 episodes limit
      const limit5 = calculateSeriesRuntime(bigSeries, 5);
      expect(limit5.includedEpisodes).toBe(5);
      expect(limit5.includedRuntimeMinutes).toBe(250);
    });
  });

  describe('3. Playback Speed & Real Viewing Time Formula', () => {
    it('applies Real viewing time = Content duration / playback speed', () => {
      // 600 content hours at 1.5x = 400 real viewing hours
      const realHours = calculateRealViewingHours(600, 1.5);
      expect(realHours).toBe(400);

      // 857 content hours at 1.5x = 571.333...
      const realHours2 = calculateRealViewingHours(857, 1.5);
      expect(Number(realHours2.toFixed(2))).toBe(571.33);
    });
  });

  describe('4. Daily Viewing & Completion Projections', () => {
    it('calculates days, months, and years accurately', () => {
      // 571.33 real hours at 2.0 hours/day = 285.665 days (~285.7)
      const metrics = calculateCompletionMetrics(571.33, 2.0);
      expect(metrics.days).toBe(285.7);
      expect(metrics.months).toBe(9.4);
      expect(metrics.years).toBe(0.78);
    });
  });

  describe('5. Comprehensive Analytics Engine & Gym Mode', () => {
    it('matches user example specifications exactly', () => {
      const sampleItems: LibraryItem[] = [
        {
          id: 'm1',
          originalTitle: 'Movie 1',
          normalizedTitle: 'movie 1',
          mediaType: 'movie',
          status: 'matched',
          runtimeMinutes: 400 * 60, // 400 hours
          addedAt: '',
          updatedAt: '',
        },
        {
          id: 'tv1',
          originalTitle: 'TV 1',
          normalizedTitle: 'tv 1',
          mediaType: 'tv',
          status: 'matched',
          totalEpisodes: 10,
          averageEpisodeMinutes: 45.7 * 60, // 457 hours total
          episodes: [],
          addedAt: '',
          updatedAt: '',
        },
      ];

      const settings: AppSettings = {
        tmdbApiKey: '',
        maxEpisodesPerSeries: 10,
        playbackSpeed: 1.5,
        dailyViewingHours: 2.0,
        gymSessionsPerDay: 1.0,
        gymHoursPerSession: 1.0,
        mealDailyHours: 0.0,
        enableGymMode: true,
      };

      const stats = computeAnalytics(sampleItems, settings);
      expect(stats.movieContentHours).toBe(400);
      expect(stats.tvContentHours).toBe(457);
      expect(stats.totalContentHours).toBe(857);

      expect(stats.movieRealHoursAtSpeed).toBe(266.7);
      expect(stats.tvRealHoursAtSpeed).toBe(304.7);
      expect(stats.totalRealHoursAtSpeed).toBe(571.3);

      expect(stats.daysToComplete).toBe(285.7);

      // Gym mode check: 1h gym session at 1.5x = 1.5 content hours
      expect(stats.gymContentHoursPerSession).toBe(1.5);
      // 857 / 1.5 = 571.3 sessions -> ceil 572
      expect(stats.gymSessionsRequired).toBe(572);
      expect(stats.gymDaysRequired).toBe(572);
    });
  });

  describe('6. Trailer Selector Language Priority', () => {
    it('prefers Hindi trailer first, then English, then other', () => {
      const videos = [
        { id: '1', key: 'eng_key', site: 'YouTube', type: 'Trailer', iso_639_1: 'en', official: true, name: 'English Trailer' },
        { id: '2', key: 'hin_key', site: 'YouTube', type: 'Trailer', iso_639_1: 'hi', official: true, name: 'Hindi Trailer' },
        { id: '3', key: 'other_key', site: 'YouTube', type: 'Trailer', iso_639_1: 'es', official: true, name: 'Spanish Trailer' },
      ];

      const selected = selectBestTrailer(videos);
      expect(selected?.language).toBe('hi');
      expect(selected?.key).toBe('hin_key');

      // Without Hindi
      const selectedEn = selectBestTrailer([videos[0], videos[2]]);
      expect(selectedEn?.language).toBe('en');
      expect(selectedEn?.key).toBe('eng_key');
    });
  });
});
