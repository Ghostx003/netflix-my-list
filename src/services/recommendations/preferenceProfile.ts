import { LibraryItem, UserTasteProfile } from '../../types';

/**
 * Builds a nuanced user preference profile from library items (watch history,
 * completed, still watching, dropped, and saved titles).
 * Recent activity is weighted higher than historical items.
 */
export function buildUserTasteProfile(items: LibraryItem[]): UserTasteProfile {
  const genreWeights: Record<string, number> = {};
  const themeWeights: Record<string, number> = {};
  const languageWeights: Record<string, number> = {};
  const directorCounts: Record<string, number> = {};
  const creatorCounts: Record<string, number> = {};
  const castCounts: Record<string, number> = {};

  let movieCount = 0;
  let tvCount = 0;
  let totalYears = 0;
  let yearCount = 0;
  let totalRuntimes = 0;
  let runtimeCount = 0;

  const now = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  // Filter out invalid items
  const validItems = items.filter(
    (i) => i && (i.originalTitle || i.externalTitle)
  );

  if (validItems.length === 0) {
    return {
      totalAnalyzed: 0,
      genreWeights: {},
      themeWeights: {},
      languageWeights: {},
      mediaTypeRatio: { movie: 0.5, tv: 0.5 },
      averageReleaseYear: new Date().getFullYear() - 2,
      averageRuntimeMinutes: 110,
      preferredDirectors: [],
      preferredCreators: [],
      preferredCast: [],
      recentlyWatchedTitles: [],
      topGenres: ['Thriller', 'Sci-Fi', 'Action', 'Drama', 'Mystery'],
      topThemes: ['Mind-Bending / Mind Game', 'Dark Mystery', 'Psychological', 'Survival'],
      isColdStart: true,
      computedAt: new Date().toISOString(),
    };
  }

  // Track recently watched titles for "Because You Watched" row
  const watchedOrInProgress = validItems.filter(
    (i) => i.isCompleted || i.viewingStatus === 'completed' || i.viewingStatus === 'still_watching' || (i.progress && i.progress.watchedMinutes > 0)
  );

  // Sort by recent activity
  watchedOrInProgress.sort((a, b) => {
    const timeA = new Date(a.updatedAt || a.addedAt || 0).getTime();
    const timeB = new Date(b.updatedAt || b.addedAt || 0).getTime();
    return timeB - timeA;
  });

  const recentlyWatchedTitles = watchedOrInProgress.slice(0, 10).map((i) => i.externalTitle || i.originalTitle);

  let totalWeightSum = 0;

  for (const item of validItems) {
    // Determine base multiplier based on status
    let baseStatusMultiplier = 1.0;
    if (item.isCompleted || item.viewingStatus === 'completed') {
      baseStatusMultiplier = 2.5;
      if (item.willWatchAgain) baseStatusMultiplier = 3.2;
      if (item.userStarRating) baseStatusMultiplier *= (item.userStarRating / 3);
    } else if (item.viewingStatus === 'still_watching') {
      baseStatusMultiplier = 1.8;
      const pct = (item.progress?.percentage || 0) / 100;
      baseStatusMultiplier += pct * 0.5;
    } else if (item.viewingStatus === 'dropped' || item.droppedReason) {
      // Significantly downweight or ignore disliked traits unless "give another chance"
      baseStatusMultiplier = item.giveAnotherChance ? 0.4 : 0.1;
    } else {
      // Unwatched in library (positive intention)
      baseStatusMultiplier = 1.2;
    }

    // Recency decay: recent activity within 30 days receives boost
    const itemDate = new Date(item.updatedAt || item.addedAt || 0).getTime();
    const daysAgo = Math.max(0, (now - itemDate) / ONE_DAY_MS);
    const recencyMultiplier = Math.max(0.7, 1.5 - (daysAgo / 60)); // 1.5x today down to 0.7x after 48 days

    const finalItemWeight = baseStatusMultiplier * recencyMultiplier;
    totalWeightSum += finalItemWeight;

    // Media type count
    if (item.mediaType === 'movie') movieCount += finalItemWeight;
    else if (item.mediaType === 'tv') tvCount += finalItemWeight;

    // Release year
    if (item.releaseYear && item.releaseYear > 1960) {
      totalYears += item.releaseYear * finalItemWeight;
      yearCount += finalItemWeight;
    }

    // Runtime
    if (item.runtimeMinutes && item.runtimeMinutes > 20) {
      totalRuntimes += item.runtimeMinutes * finalItemWeight;
      runtimeCount += finalItemWeight;
    }

    // Genres
    const genres = Array.isArray(item.genres) ? item.genres : [];
    for (const g of genres) {
      if (!g) continue;
      const norm = g.trim();
      genreWeights[norm] = (genreWeights[norm] || 0) + finalItemWeight;
    }

    // Themes
    const themes = Array.isArray(item.themes) ? item.themes : [];
    for (const t of themes) {
      if (!t) continue;
      const norm = t.trim();
      themeWeights[norm] = (themeWeights[norm] || 0) + finalItemWeight;
    }

    // Languages
    if (item.originalLanguage) {
      languageWeights[item.originalLanguage] = (languageWeights[item.originalLanguage] || 0) + finalItemWeight;
    }

    // Directors & creators
    if (item.director) {
      directorCounts[item.director] = (directorCounts[item.director] || 0) + finalItemWeight;
    }
    if (item.creator) {
      creatorCounts[item.creator] = (creatorCounts[item.creator] || 0) + finalItemWeight;
    }

    // Cast
    if (Array.isArray(item.cast)) {
      for (const actor of item.cast.slice(0, 3)) {
        if (!actor) continue;
        castCounts[actor] = (castCounts[actor] || 0) + finalItemWeight;
      }
    }
  }

  // Normalize genre weights (0.0 to 1.0)
  const maxGenreWeight = Math.max(...Object.values(genreWeights), 1);
  const normalizedGenres: Record<string, number> = {};
  for (const [k, v] of Object.entries(genreWeights)) {
    normalizedGenres[k] = Math.round((v / maxGenreWeight) * 100) / 100;
  }

  // Normalize theme weights (0.0 to 1.0)
  const maxThemeWeight = Math.max(...Object.values(themeWeights), 1);
  const normalizedThemes: Record<string, number> = {};
  for (const [k, v] of Object.entries(themeWeights)) {
    normalizedThemes[k] = Math.round((v / maxThemeWeight) * 100) / 100;
  }

  // Sorted top genres and themes
  const topGenres = Object.entries(normalizedGenres)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([g]) => g);

  const topThemes = Object.entries(normalizedThemes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t]) => t);

  const preferredDirectors = Object.entries(directorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([d]) => d);

  const preferredCreators = Object.entries(creatorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([c]) => c);

  const preferredCast = Object.entries(castCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([a]) => a);

  const totalMedia = movieCount + tvCount || 1;
  const isColdStart = watchedOrInProgress.length < 2 && validItems.length < 3;

  return {
    totalAnalyzed: validItems.length,
    genreWeights: normalizedGenres,
    themeWeights: normalizedThemes,
    languageWeights,
    mediaTypeRatio: {
      movie: Math.round((movieCount / totalMedia) * 100) / 100,
      tv: Math.round((tvCount / totalMedia) * 100) / 100,
    },
    averageReleaseYear: yearCount > 0 ? Math.round(totalYears / yearCount) : 2021,
    averageRuntimeMinutes: runtimeCount > 0 ? Math.round(totalRuntimes / runtimeCount) : 110,
    preferredDirectors,
    preferredCreators,
    preferredCast,
    recentlyWatchedTitles,
    topGenres: topGenres.length > 0 ? topGenres : ['Thriller', 'Sci-Fi', 'Action', 'Drama'],
    topThemes: topThemes.length > 0 ? topThemes : ['Mind-Bending / Mind Game', 'Dark Mystery', 'Psychological'],
    isColdStart,
    computedAt: new Date().toISOString(),
  };
}
