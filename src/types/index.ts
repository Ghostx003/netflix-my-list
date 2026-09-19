export type MediaType = 'movie' | 'tv' | 'unknown';
export type MetadataStatus = 'pending' | 'matched' | 'needs_review' | 'failed';
export type LibraryViewingStatus = 'unwatched' | 'still_watching' | 'completed' | 'dropped';

export interface WatchProgress {
  percentage: number;
  currentSeason?: number;
  currentEpisode?: number;
  completedSeasons?: number[];
  watchedMinutes: number;
  lastWatchedAt?: string; // ISO date string
}

export const PREDEFINED_DROP_REASONS = [
  'Too boring',
  'Too slow',
  "Didn't like the story",
  "Didn't like the characters",
  'Lost interest',
  'Too long',
  'Not my type',
  'Watching something else',
  'Other',
] as const;

export type PredefinedDropReason = (typeof PREDEFINED_DROP_REASONS)[number];

export interface NetflixRawItem {
  title: string;
  videoId?: string;
  synopsis?: string;
  posterPath?: string;
  backdropPath?: string;
  mediaType?: 'movie' | 'tv' | 'unknown';
  releaseYear?: number;
  rating?: number;
  imdbRating?: number;
  rottenTomatoesRating?: number;
  runtimeMinutes?: number;
  genres?: string[];
  languages?: string[];
  countries?: string[];
  originalLanguage?: string;
}

export interface LibraryItem {
  id: string;
  originalTitle: string;
  normalizedTitle: string;
  videoId?: string;
  mediaType: MediaType;
  status: MetadataStatus; // Metadata match status
  
  // Library Viewing Status
  viewingStatus?: LibraryViewingStatus; // unwatched | still_watching | completed | dropped

  // External metadata
  externalId?: number | string;
  externalTitle?: string;
  releaseYear?: number;
  releaseDate?: string;
  posterPath?: string;
  backdropPath?: string;
  rating?: number; // TMDB rating (0-10)
  imdbRating?: number; // IMDb rating (0-10)
  rottenTomatoesRating?: number; // RT percentage (0-100)
  voteCount?: number;
  synopsis?: string;
  genres?: string[];
  countries?: string[];
  languages?: string[]; // Spoken / available audio languages (e.g. ['hi', 'en', 'ja'])
  originalLanguage?: string; // ISO 639-1 code (e.g. 'hi', 'en', 'ja', 'ko')

  // Movie specific
  runtimeMinutes?: number;

  // TV specific
  totalSeasons?: number;
  totalEpisodes?: number;
  includedEpisodesCount?: number;
  includedRuntimeMinutes?: number;
  averageEpisodeMinutes?: number;
  episodes?: EpisodeInfo[];

  // Trailer info
  trailer?: TrailerInfo;

  // Manual override flag
  isManualMatch?: boolean;
  manualSearchQuery?: string;
  previousTitle?: string;

  // Watch Progress (Still Watching)
  progress?: WatchProgress;

  // Dropped details
  droppedReason?: string;
  droppedNotes?: string;
  droppedAt?: string; // ISO date string

  // Completion additions (Series Tracker)
  isCompleted?: boolean;
  completedAt?: string; // ISO date string
  userStarRating?: number; // 1 to 5 stars
  timeInvestedMinutes?: number; // Total time spent watching

  // Timestamps
  addedAt: string;
  updatedAt: string;
}

export interface EpisodeInfo {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
  name: string;
  runtimeMinutes: number;
  overview?: string;
  stillPath?: string;
}

export interface TrailerInfo {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  language: string;
  isOfficial?: boolean;
}

export interface AppSettings {
  tmdbApiKey: string;
  omdbApiKey?: string;
  capSeriesEpisodes?: boolean; // Toggle capping
  maxEpisodesPerSeries: number;
  playbackSpeed: number; // Home / General usage speed (e.g. 2.0x)
  gymSpeed?: number; // Cardio / Gym speed (e.g. 1.5x)
  mealSpeed?: number; // Meal / Lunch speed (e.g. 1.5x)
  dailyViewingHours: number;
  gymSessionsPerDay: number;
  gymHoursPerSession: number;
  mealDailyHours: number;
  enableGymMode: boolean;
}

export interface BackupData {
  version: number;
  exportedAt: string;
  items: LibraryItem[];
  settings: AppSettings;
}

export interface AnalyticsStats {
  movieCount: number;
  movieContentMinutes: number;
  movieContentHours: number;
  movieRealHoursAtSpeed: number;

  tvCount: number;
  tvTotalEpisodes: number;
  tvIncludedEpisodes: number;
  tvContentMinutes: number;
  tvContentHours: number;
  tvRealHoursAtSpeed: number;

  totalTitles: number;
  totalContentMinutes: number;
  totalContentHours: number;
  totalRealHoursAtSpeed: number;

  // Status-aware breakdown
  unwatchedCount: number;
  stillWatchingCount: number;
  completedCount: number;
  droppedCount: number;

  // Remaining content (unwatched + remaining still_watching)
  remainingContentMinutes: number;
  remainingContentHours: number;
  remainingRealHoursAtSpeed: number;
  remainingTvEpisodes: number;

  // Still Watching stats
  stillWatchingMoviesCount: number;
  stillWatchingTvCount: number;
  stillWatchingRemainingMinutes: number;
  stillWatchingRemainingHours: number;
  stillWatchingRealHoursAtSpeed: number;

  // Dropped stats
  droppedMoviesCount: number;
  droppedTvCount: number;
  dropReasonCounts: Record<string, number>;

  daysToComplete: number;
  monthsToComplete: number;
  yearsToComplete: number;

  gymContentHoursPerSession: number;
  gymSessionsRequired: number;
  gymDaysRequired: number;
  gymYearsRequired: number;

  // Multi-speed combined consumption breakdown
  homeDailyContentHours: number;
  gymDailyContentHours: number;
  mealDailyContentHours: number;
  combinedDailyContentHours: number;
  combinedDailyClockHours: number;
}
