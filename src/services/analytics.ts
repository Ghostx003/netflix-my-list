import { AppSettings, AnalyticsStats, LibraryItem } from '../types';

export interface SeriesRuntimeBreakdown {
  totalEpisodes: number;
  includedEpisodes: number;
  includedRuntimeMinutes: number;
  averageEpisodeMinutes: number;
}

export function calculateSeriesRuntime(
  item: LibraryItem,
  maxEpisodes: number = 10,
  capEpisodes: boolean = false
): SeriesRuntimeBreakdown {
  const episodes = item.episodes || [];
  const totalEpisodes = item.totalEpisodes || episodes.length || 0;

  if (episodes.length > 0) {
    const sorted = [...episodes].sort((a, b) => {
      if (a.seasonNumber !== b.seasonNumber) return a.seasonNumber - b.seasonNumber;
      return a.episodeNumber - b.episodeNumber;
    });

    const included = capEpisodes ? sorted.slice(0, Math.max(1, maxEpisodes)) : sorted;
    const includedEpisodes = included.length;
    const includedRuntimeMinutes = included.reduce(
      (acc, ep) => acc + (ep.runtimeMinutes > 0 ? ep.runtimeMinutes : (item.averageEpisodeMinutes || 45)),
      0
    );
    const averageEpisodeMinutes = includedEpisodes > 0
      ? Math.round(includedRuntimeMinutes / includedEpisodes)
      : 0;

    return {
      totalEpisodes: Math.max(totalEpisodes, episodes.length),
      includedEpisodes,
      includedRuntimeMinutes,
      averageEpisodeMinutes,
    };
  }

  const avg = item.averageEpisodeMinutes || 45;
  const effectiveEpisodes = capEpisodes ? Math.min(totalEpisodes || 10, maxEpisodes) : (totalEpisodes || 10);
  const calcRuntime = effectiveEpisodes * avg;

  return {
    totalEpisodes,
    includedEpisodes: effectiveEpisodes,
    includedRuntimeMinutes: calcRuntime,
    averageEpisodeMinutes: avg,
  };
}

export function calculateRealViewingHours(contentHours: number, playbackSpeed: number): number {
  if (playbackSpeed <= 0) playbackSpeed = 1.0;
  return contentHours / playbackSpeed;
}

export function calculateCompletionMetrics(
  realViewingHours: number,
  dailyViewingHours: number
): { days: number; months: number; years: number } {
  if (dailyViewingHours <= 0) {
    return { days: 0, months: 0, years: 0 };
  }

  const days = realViewingHours / dailyViewingHours;
  const months = days / 30.4375;
  const years = days / 365.25;

  return {
    days: Number(days.toFixed(1)),
    months: Number(months.toFixed(1)),
    years: Number(years.toFixed(2)),
  };
}

export function computeAnalytics(
  items: LibraryItem[],
  settings: AppSettings
): AnalyticsStats {
  const speed = settings.playbackSpeed || 1.5;
  const capEpisodes = settings.capSeriesEpisodes ?? false;
  const maxEpisodes = settings.maxEpisodesPerSeries || 10;

  let movieCount = 0;
  let movieContentMinutes = 0;

  let tvCount = 0;
  let tvTotalEpisodes = 0;
  let tvIncludedEpisodes = 0;
  let tvContentMinutes = 0;

  // Status counts
  let unwatchedCount = 0;
  let stillWatchingCount = 0;
  let completedCount = 0;
  let droppedCount = 0;

  // Remaining watch time calculation:
  // ONLY counts unfinished content: full minutes for 'unwatched', and remaining minutes for 'still_watching'
  let remainingContentMinutes = 0;
  let remainingTvEpisodes = 0;

  // Still watching breakdown
  let stillWatchingMoviesCount = 0;
  let stillWatchingTvCount = 0;
  let stillWatchingRemainingMinutes = 0;

  // Dropped breakdown
  let droppedMoviesCount = 0;
  let droppedTvCount = 0;
  const dropReasonCounts: Record<string, number> = {};

  for (const item of items) {
    const status = item.viewingStatus || (item.isCompleted ? 'completed' : 'unwatched');

    // Total content tally
    let itemTotalMinutes = 0;
    let itemEpisodes = 0;

    if (item.mediaType === 'movie') {
      movieCount++;
      itemTotalMinutes = item.runtimeMinutes || 105;
      movieContentMinutes += itemTotalMinutes;
    } else if (item.mediaType === 'tv') {
      tvCount++;
      const breakdown = calculateSeriesRuntime(item, maxEpisodes, capEpisodes);
      tvTotalEpisodes += breakdown.totalEpisodes;
      tvIncludedEpisodes += breakdown.includedEpisodes;
      itemTotalMinutes = breakdown.includedRuntimeMinutes;
      itemEpisodes = breakdown.includedEpisodes;
      tvContentMinutes += itemTotalMinutes;
    } else {
      movieCount++;
      itemTotalMinutes = item.runtimeMinutes || 90;
      movieContentMinutes += itemTotalMinutes;
    }

    // Status specifics
    if (status === 'unwatched') {
      unwatchedCount++;
      remainingContentMinutes += itemTotalMinutes;
      if (item.mediaType === 'tv') remainingTvEpisodes += itemEpisodes;
    } else if (status === 'still_watching') {
      stillWatchingCount++;
      if (item.mediaType === 'tv') {
        stillWatchingTvCount++;
        // Calculate remaining episodes & minutes from granular season/episode progress
        let watchedEps = 0;
        const totalEpCount = itemEpisodes || item.totalEpisodes || 10;
        const totalSeasons = item.totalSeasons || 1;
        const avgMin = item.averageEpisodeMinutes || 45;

        if (item.episodes && item.episodes.length > 0) {
          const completedSeasonsSet = new Set(item.progress?.completedSeasons || []);
          const curSeason = item.progress?.currentSeason || 1;
          const curEp = item.progress?.currentEpisode || 1;

          for (const ep of item.episodes) {
            if (completedSeasonsSet.has(ep.seasonNumber)) {
              watchedEps++;
            } else if (ep.seasonNumber < curSeason) {
              watchedEps++;
            } else if (ep.seasonNumber === curSeason && ep.episodeNumber <= curEp) {
              watchedEps++;
            }
          }
        } else {
          // Estimate based on current season and episode
          const curSeason = item.progress?.currentSeason || 1;
          const curEp = item.progress?.currentEpisode || 1;
          const epsPerSeason = Math.max(1, Math.round(totalEpCount / Math.max(1, totalSeasons)));
          watchedEps = ((curSeason - 1) * epsPerSeason) + Math.min(curEp, epsPerSeason);
        }

        const remainingEps = Math.max(0, totalEpCount - watchedEps);
        remainingTvEpisodes += remainingEps;
        const remMin = remainingEps * avgMin;
        remainingContentMinutes += remMin;
        stillWatchingRemainingMinutes += remMin;
      } else {
        stillWatchingMoviesCount++;
        const watched = item.progress?.watchedMinutes || 0;
        const remMin = Math.max(0, itemTotalMinutes - watched);
        remainingContentMinutes += remMin;
        stillWatchingRemainingMinutes += remMin;
      }
    } else if (status === 'completed') {
      completedCount++;
    } else if (status === 'dropped') {
      droppedCount++;
      if (item.mediaType === 'tv') droppedTvCount++;
      else droppedMoviesCount++;
      const reason = item.droppedReason || 'Other';
      dropReasonCounts[reason] = (dropReasonCounts[reason] || 0) + 1;
    }
  }

  const movieContentHours = Number((movieContentMinutes / 60).toFixed(1));
  const movieRealHoursAtSpeed = Number((movieContentHours / speed).toFixed(1));

  const tvContentHours = Number((tvContentMinutes / 60).toFixed(1));
  const tvRealHoursAtSpeed = Number((tvContentHours / speed).toFixed(1));

  const totalContentMinutes = movieContentMinutes + tvContentMinutes;
  const totalContentHours = Number((totalContentMinutes / 60).toFixed(1));
  const rawTotalRealHours = (totalContentMinutes / 60) / speed;
  const totalRealHoursAtSpeed = Number(rawTotalRealHours.toFixed(1));

  // Remaining metrics
  const remainingContentHours = Number((remainingContentMinutes / 60).toFixed(1));
  const rawRemainingRealHours = (remainingContentMinutes / 60) / speed;
  const remainingRealHoursAtSpeed = Number(rawRemainingRealHours.toFixed(1));

  const stillWatchingRemainingHours = Number((stillWatchingRemainingMinutes / 60).toFixed(1));
  const stillWatchingRealHoursAtSpeed = Number(((stillWatchingRemainingMinutes / 60) / speed).toFixed(1));

  // Multi-speed configuration:
  // - Home: playbackSpeed (e.g. 2.0x) * dailyViewingHours (hours at home)
  // - Gym / Cardio: gymSpeed (e.g. 1.5x) * gymHoursPerSession * gymSessionsPerDay (hours at gym)
  const homeSpeed = speed;
  const gymSpeed = settings.gymSpeed || 1.5;
  const mealSpeed = settings.mealSpeed || 1.0;

  const homeDailyContentHours = Number(((settings.dailyViewingHours || 0) * homeSpeed).toFixed(1));
  const gymHoursPerSession = settings.gymHoursPerSession !== undefined ? settings.gymHoursPerSession : 1.0;
  const gymSessionsPerDay = settings.gymSessionsPerDay !== undefined ? settings.gymSessionsPerDay : 1.0;
  const gymDailyClockHours = settings.enableGymMode ? (gymHoursPerSession * gymSessionsPerDay) : 0;
  const gymDailyContentHours = Number((gymDailyClockHours * gymSpeed).toFixed(1));
  const gymContentHoursPerSession = Number((gymHoursPerSession * gymSpeed).toFixed(2));

  const mealDailyClockHours = settings.mealDailyHours || 0;
  const mealDailyContentHours = Number((mealDailyClockHours * mealSpeed).toFixed(1));

  // Combined daily content consumed across home + gym
  const combinedDailyContentHours = Number(
    (homeDailyContentHours + gymDailyContentHours + mealDailyContentHours).toFixed(1)
  );
  const combinedDailyClockHours = Number(
    ((settings.dailyViewingHours || 0) + gymDailyClockHours + mealDailyClockHours).toFixed(1)
  );

  // Time to complete calculates based on REMAINING content (Unwatched + unfinished Still Watching)
  // Dropped titles and completed titles are 100% excluded!
  let days: number;
  let months: number;
  let years: number;

  if (combinedDailyContentHours > 0) {
    const rawDays = remainingContentHours / combinedDailyContentHours;
    days = Number(rawDays.toFixed(1));
    months = Number((rawDays / 30.4375).toFixed(1));
    years = Number((rawDays / 365.25).toFixed(2));
  } else {
    const effectiveDailyHours = Math.max(0.1, (settings.dailyViewingHours || 1.0));
    const res = calculateCompletionMetrics(rawRemainingRealHours, effectiveDailyHours);
    days = res.days;
    months = res.months;
    years = res.years;
  }

  const gymSessionsRequired = gymContentHoursPerSession > 0
    ? Math.ceil(remainingContentHours / gymContentHoursPerSession)
    : 0;

  const gymDaysRequired = gymSessionsPerDay > 0
    ? Number((gymSessionsRequired / gymSessionsPerDay).toFixed(1))
    : gymSessionsRequired;
  const gymYearsRequired = Number((gymDaysRequired / 365.25).toFixed(2));

  return {
    movieCount,
    movieContentMinutes,
    movieContentHours,
    movieRealHoursAtSpeed,

    tvCount,
    tvTotalEpisodes,
    tvIncludedEpisodes,
    tvContentMinutes,
    tvContentHours,
    tvRealHoursAtSpeed,

    totalTitles: items.length,
    totalContentMinutes,
    totalContentHours,
    totalRealHoursAtSpeed,

    unwatchedCount,
    stillWatchingCount,
    completedCount,
    droppedCount,

    remainingContentMinutes,
    remainingContentHours,
    remainingRealHoursAtSpeed,
    remainingTvEpisodes,

    stillWatchingMoviesCount,
    stillWatchingTvCount,
    stillWatchingRemainingMinutes,
    stillWatchingRemainingHours,
    stillWatchingRealHoursAtSpeed,

    droppedMoviesCount,
    droppedTvCount,
    dropReasonCounts,

    daysToComplete: days,
    monthsToComplete: months,
    yearsToComplete: years,

    gymContentHoursPerSession,
    gymSessionsRequired,
    gymDaysRequired,
    gymYearsRequired,

    homeDailyContentHours,
    gymDailyContentHours,
    mealDailyContentHours,
    combinedDailyContentHours,
    combinedDailyClockHours,
  };
}

export function formatRuntime(minutes: number): string {
  if (!minutes || minutes <= 0) return '--';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
