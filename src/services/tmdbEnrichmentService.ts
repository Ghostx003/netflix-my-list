import { DiscoveryTitle, EpisodeInfo, TrailerInfo } from '../types';
import { extractThemesFromKeywords } from './themeMapper';
import { normalizeCountriesList, normalizeTitle } from './normalizer';
import { DEFAULT_PUBLIC_TMDB_KEY, selectBestTrailer, fetchOMDBMetadata } from './tmdb';
import { getCachedMetadata, setCachedMetadata } from './db';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const DEFAULT_TMDB_KEY =
  (typeof import.meta !== 'undefined' && (import.meta.env?.TMDB_API_KEY || import.meta.env?.VITE_TMDB_API_KEY)) ||
  DEFAULT_PUBLIC_TMDB_KEY ||
  'ec3ae1f9fde58cd94e4297c4cb3b77de';

export interface TMDBEnrichmentProgress {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'cancelled' | 'error';
  totalTitles: number;
  processedCount: number;
  completedCount: number;
  skippedCount: number;
  failedCount: number;
  currentTitle?: string;
  percentage: number;
  errorMessage?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Enriches an individual DiscoveryTitle with detailed TMDB metadata:
 * - Tagline, Overview, Genres
 * - Raw keywords & canonical Themes
 * - Provenance: Watchmode origin country preserved, TMDB origin & production countries stored separately
 * - TMDB recommendations & similar titles IDs
 * - Production companies & show status
 * - Trailers, high-res posters, backdrops
 * - TV season/episode metadata with stills and overviews
 * - Strict Hindi / English audio inference
 */
export async function enrichDiscoveryTitleWithTMDBDetails(
  item: DiscoveryTitle,
  apiKey?: string
): Promise<DiscoveryTitle> {
  const key = apiKey || DEFAULT_TMDB_KEY;
  if (!key) return item;

  let tmdbId = item.tmdbId;
  const isMovie = item.mediaType === 'movie';
  const endpointType = isMovie ? 'movie' : 'tv';

  // 1. Resolve TMDB ID if missing but IMDb ID is available
  if (!tmdbId && item.imdbId) {
    const findCacheKey = `tmdb_find_imdb_${item.imdbId}`;
    let findData = await getCachedMetadata(findCacheKey);
    if (!findData) {
      try {
        const findUrl = `${TMDB_BASE_URL}/find/${encodeURIComponent(item.imdbId)}?api_key=${key}&external_source=imdb_id`;
        const res = await fetch(findUrl);
        if (res.ok) {
          findData = await res.json();
          await setCachedMetadata(findCacheKey, findData);
        }
      } catch {}
    }

    if (findData) {
      const match = isMovie ? findData.movie_results?.[0] : findData.tv_results?.[0];
      if (match && match.id) {
        tmdbId = match.id;
      }
    }
  }

  // 2. Resolve TMDB ID by Title + Year if still missing
  if (!tmdbId && item.title) {
    const searchCacheKey = `tmdb_search_${item.mediaType}_${encodeURIComponent(item.title.toLowerCase())}_${item.releaseYear || ''}`;
    let searchData = await getCachedMetadata(searchCacheKey);
    if (!searchData) {
      try {
        const yearParam = item.releaseYear
          ? isMovie
            ? `&year=${item.releaseYear}`
            : `&first_air_date_year=${item.releaseYear}`
          : '';
        const searchUrl = `${TMDB_BASE_URL}/search/${endpointType}?api_key=${key}&query=${encodeURIComponent(item.title)}${yearParam}`;
        const res = await fetch(searchUrl);
        if (res.ok) {
          searchData = await res.json();
          await setCachedMetadata(searchCacheKey, searchData);
        }
      } catch {}
    }

    if (searchData && searchData.results && searchData.results.length > 0) {
      tmdbId = searchData.results[0].id;
    }
  }

  if (!tmdbId) {
    return {
      ...item,
      tmdbEnrichment: {
        status: 'failed',
        lastFetchedAt: new Date().toISOString(),
        error: 'TMDB ID could not be resolved',
      },
    };
  }

  // 3. Fetch comprehensive details from TMDB with append_to_response
  // (keywords, recommendations, similar, credits, videos, external_ids, watch/providers)
  const detailCacheKey = `tmdb_enrich_full_${endpointType}_${tmdbId}`;
  let detail = await getCachedMetadata(detailCacheKey);

  if (!detail) {
    try {
      const detailUrl = `${TMDB_BASE_URL}/${endpointType}/${tmdbId}?api_key=${key}&append_to_response=keywords,recommendations,similar,credits,videos,external_ids,watch/providers`;
      let res = await fetch(detailUrl);
      if (res.ok) {
        detail = await res.json();
      } else if (res.status === 404) {
        // Fallback: Check alternative media type
        const altEndpoint = isMovie ? 'tv' : 'movie';
        const altUrl = `${TMDB_BASE_URL}/${altEndpoint}/${tmdbId}?api_key=${key}&append_to_response=keywords,recommendations,similar,credits,videos,external_ids,watch/providers`;
        const altRes = await fetch(altUrl);
        if (altRes.ok) {
          detail = await altRes.json();
        }
      } else if (res.status === 429) {
        // Rate limited: throw error so caller can pause/back off
        throw new Error('TMDB Rate Limit 429');
      }
      if (detail) {
        await setCachedMetadata(detailCacheKey, detail);
      }
    } catch (e: any) {
      if (e.message?.includes('429')) throw e;
    }
  }

  if (!detail) {
    return {
      ...item,
      tmdbId,
      tmdbEnrichment: {
        status: 'failed',
        lastFetchedAt: new Date().toISOString(),
        tmdbId,
        error: 'Failed fetching detailed metadata from TMDB',
      },
    };
  }

  // Extract raw keywords
  const rawKeywords: string[] = [];
  const kwList = detail.keywords?.keywords || detail.keywords?.results || [];
  if (Array.isArray(kwList)) {
    kwList.forEach((k: any) => {
      if (k.name) rawKeywords.push(k.name);
    });
  }

  // Extract Genres
  const genres: string[] = Array.isArray(detail.genres)
    ? detail.genres.map((g: any) => g.name).filter(Boolean)
    : (item.genres || []);
  if (Array.isArray(item.genres)) {
    item.genres.forEach((g) => {
      if (g && !genres.includes(g)) genres.push(g);
    });
  }

  // Extract Themes using keyword & overview mapping
  const themes = extractThemesFromKeywords(rawKeywords, genres, detail.overview || item.synopsis);

  // Extract Recommendations & Similar TMDB IDs
  const tmdbRecommendationIds: number[] = [];
  if (Array.isArray(detail.recommendations?.results)) {
    detail.recommendations.results.slice(0, 12).forEach((rec: any) => {
      if (rec.id) tmdbRecommendationIds.push(rec.id);
    });
  }

  const tmdbSimilarIds: number[] = [];
  if (Array.isArray(detail.similar?.results)) {
    detail.similar.results.slice(0, 12).forEach((sim: any) => {
      if (sim.id) tmdbSimilarIds.push(sim.id);
    });
  }

  // Provenance preservation:
  // Watchmode origin country remains separate in watchmodeOriginCountry
  const watchmodeOriginCountry = item.watchmodeOriginCountry || (item.countries && item.countries[0]);
  const tmdbOriginCountry = detail.origin_country?.[0] || undefined;
  const tmdbProductionCountries: string[] = Array.isArray(detail.production_countries)
    ? detail.production_countries.map((c: any) => c.name || c.iso_3166_1).filter(Boolean)
    : [];

  const rawCountries = [
    ...(detail.origin_country || []),
    ...tmdbProductionCountries,
    ...(item.countries || []),
  ];
  const combinedCountries = normalizeCountriesList(rawCountries);

  // Production Companies
  const productionCompanies: string[] = Array.isArray(detail.production_companies)
    ? detail.production_companies.map((p: any) => p.name).filter(Boolean)
    : [];

  // Spoken languages
  const spokenLanguages: string[] = [];
  if (Array.isArray(detail.spoken_languages)) {
    detail.spoken_languages.forEach((l: any) => {
      if (l.iso_639_1) spokenLanguages.push(l.iso_639_1.toLowerCase());
    });
  }
  if (detail.original_language && !spokenLanguages.includes(detail.original_language.toLowerCase())) {
    spokenLanguages.push(detail.original_language.toLowerCase());
  }

  // Cast & crew
  const cast = Array.isArray(detail.credits?.cast)
    ? detail.credits.cast.slice(0, 8).map((c: any) => c.name).filter(Boolean)
    : item.cast;

  let director = item.director;
  if (isMovie && Array.isArray(detail.credits?.crew)) {
    const dirObj = detail.credits.crew.find((c: any) => c.job === 'Director');
    if (dirObj) director = dirObj.name;
  }

  let creator = item.creator;
  if (!isMovie && Array.isArray(detail.created_by) && detail.created_by.length > 0) {
    creator = detail.created_by.map((c: any) => c.name).join(', ');
  }

  // Best trailer
  const trailer = selectBestTrailer(detail.videos?.results || []) || item.trailer;

  // TV Series: Fetch all seasons and all episode data with names, overviews, runtimes, and stills
  let episodes: EpisodeInfo[] | undefined = item.episodes;
  if (!isMovie && detail.number_of_seasons > 0) {
    const totalSeasonsCount = detail.number_of_seasons;
    // Inspect available seasons from detail.seasons list (ignoring Season 0 specials if regular seasons exist)
    const validSeasons: number[] = [];
    if (Array.isArray(detail.seasons) && detail.seasons.length > 0) {
      detail.seasons.forEach((s: any) => {
        if (s.season_number > 0) {
          validSeasons.push(s.season_number);
        }
      });
    }
    if (validSeasons.length === 0) {
      for (let s = 1; s <= totalSeasonsCount; s++) {
        validSeasons.push(s);
      }
    }

    const allEpisodesList: EpisodeInfo[] = [];

    // Fetch every season concurrently (up to 4 at a time to be fast yet respectful of rate limits)
    const seasonChunks: number[][] = [];
    for (let s = 0; s < validSeasons.length; s += 4) {
      seasonChunks.push(validSeasons.slice(s, s + 4));
    }

    for (const chunk of seasonChunks) {
      await Promise.all(
        chunk.map(async (seasonNum) => {
          const seasonCacheKey = `tmdb_season_${seasonNum}_${tmdbId}`;
          let seasonData = await getCachedMetadata(seasonCacheKey);
          if (!seasonData) {
            try {
              const seasonUrl = `${TMDB_BASE_URL}/tv/${tmdbId}/season/${seasonNum}?api_key=${key}`;
              const sRes = await fetch(seasonUrl);
              if (sRes.ok) {
                seasonData = await sRes.json();
                await setCachedMetadata(seasonCacheKey, seasonData);
              }
            } catch {}
          }

          if (seasonData && Array.isArray(seasonData.episodes)) {
            seasonData.episodes.forEach((ep: any) => {
              allEpisodesList.push({
                id: ep.id,
                seasonNumber: ep.season_number || seasonNum,
                episodeNumber: ep.episode_number,
                name: ep.name || `Episode ${ep.episode_number}`,
                runtimeMinutes: ep.runtime || detail.episode_run_time?.[0] || 45,
                overview: ep.overview,
                stillPath: ep.still_path ? `https://image.tmdb.org/t/p/w500${ep.still_path}` : undefined,
              });
            });
          }
        })
      );
    }

    if (allEpisodesList.length > 0) {
      // Sort episodes by season number then episode number
      allEpisodesList.sort((a, b) => {
        if (a.seasonNumber !== b.seasonNumber) return a.seasonNumber - b.seasonNumber;
        return a.episodeNumber - b.episodeNumber;
      });
      episodes = allEpisodesList;
    }
  }

  // Tagline & Status
  const tagline = detail.tagline ? detail.tagline.trim() : undefined;
  const status = detail.status || undefined;

  // Rating & poster / backdrop paths
  // TMDB rating
  const rating = detail.vote_average ? parseFloat(detail.vote_average.toFixed(1)) : item.rating;
  const voteCount = detail.vote_count || item.voteCount;
  const posterPath = detail.poster_path
    ? `https://image.tmdb.org/t/p/w500${detail.poster_path}`
    : item.posterPath;
  const backdropPath = detail.backdrop_path
    ? `https://image.tmdb.org/t/p/w1280${detail.backdrop_path}`
    : item.backdropPath;

  // Resolve IMDb ID from TMDB external_ids if not already present
  const resolvedImdbId = item.imdbId || detail.external_ids?.imdb_id || undefined;

  // Enrich IMDb & Rotten Tomatoes scores if missing
  let imdbRating = item.imdbRating;
  let rottenTomatoesRating = item.rottenTomatoesRating;

  if (!imdbRating || rottenTomatoesRating === undefined) {
    try {
      const omdbData = await fetchOMDBMetadata(
        item.title,
        undefined,
        resolvedImdbId,
        item.releaseYear
      );
      if (omdbData) {
        if (!imdbRating && omdbData.imdbRating) {
          imdbRating = omdbData.imdbRating;
        }
        if (rottenTomatoesRating === undefined && omdbData.rottenTomatoesRating !== undefined) {
          rottenTomatoesRating = omdbData.rottenTomatoesRating;
        }
      }
    } catch {}
  }

  return {
    ...item,
    tmdbId,
    imdbId: resolvedImdbId,
    tagline: tagline || item.tagline,
    synopsis: detail.overview || item.synopsis,
    genres: genres.length > 0 ? genres : item.genres,
    tmdbKeywords: rawKeywords.length > 0 ? rawKeywords : item.tmdbKeywords,
    themes: themes.length > 0 ? themes : item.themes,
    watchmodeOriginCountry,
    tmdbOriginCountry,
    tmdbProductionCountries,
    countries: combinedCountries.length > 0 ? combinedCountries : item.countries,
    productionCompanies: productionCompanies.length > 0 ? productionCompanies : item.productionCompanies,
    status: status || item.status,
    tmdbRecommendationIds: tmdbRecommendationIds.length > 0 ? tmdbRecommendationIds : item.tmdbRecommendationIds,
    tmdbSimilarIds: tmdbSimilarIds.length > 0 ? tmdbSimilarIds : item.tmdbSimilarIds,
    originalLanguage: detail.original_language?.toLowerCase() || item.originalLanguage,
    audioLanguages: spokenLanguages.length > 0 ? spokenLanguages : item.audioLanguages,
    cast: cast && cast.length > 0 ? cast : item.cast,
    director,
    creator,
    trailer,
    episodes: episodes || item.episodes,
    rating,
    imdbRating,
    rottenTomatoesRating,
    voteCount,
    posterPath,
    backdropPath,
    totalSeasons: !isMovie ? detail.number_of_seasons : item.totalSeasons,
    totalEpisodes: !isMovie ? detail.number_of_episodes : item.totalEpisodes,
    runtimeMinutes: isMovie ? detail.runtime : item.runtimeMinutes,
    metadataUpdatedAt: new Date().toISOString(),
    tmdbEnrichment: {
      status: 'completed',
      lastFetchedAt: new Date().toISOString(),
      tmdbId,
      enrichmentVersion: 1,
      fieldsFetched: [
        'tagline',
        'keywords',
        'themes',
        'recommendations',
        'similar',
        'countries',
        'productionCompanies',
        'credits',
        'videos',
        'episodes',
      ],
    },
  };
}

/**
 * Safe, rate-controlled batch catalogue enricher with concurrency limits and pause/cancellation.
 */
export async function enrichCatalogWithTMDB(options: {
  titles: DiscoveryTitle[];
  apiKey?: string;
  concurrency?: number;
  delayBetweenBatchesMs?: number;
  forceReenrich?: boolean;
  onProgress: (progress: TMDBEnrichmentProgress) => void;
  onBatchSaved?: (batch: DiscoveryTitle[]) => Promise<void> | void;
  shouldCancel?: () => boolean;
}): Promise<{ enrichedTitles: DiscoveryTitle[]; completedCount: number; skippedCount: number; failedCount: number }> {
  const {
    titles,
    apiKey,
    concurrency = 2,
    delayBetweenBatchesMs = 200,
    forceReenrich = false,
    onProgress,
    onBatchSaved,
    shouldCancel,
  } = options;

  let processedCount = 0;
  let completedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const totalTitles = titles.length;

  const resultCatalog = [...titles];

  onProgress({
    status: 'running',
    totalTitles,
    processedCount: 0,
    completedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    percentage: 0,
  });

  // Filter queue of titles that require enrichment
  const queueIndices: number[] = [];
  for (let i = 0; i < resultCatalog.length; i++) {
    const item = resultCatalog[i];
    const isAlreadyEnriched =
      !forceReenrich &&
      item.tmdbEnrichment?.status === 'completed' &&
      !!item.synopsis &&
      item.themes !== undefined &&
      item.themes.length > 0;

    if (isAlreadyEnriched) {
      skippedCount++;
      processedCount++;
    } else {
      queueIndices.push(i);
    }
  }

  // If all were skipped because already enriched
  if (queueIndices.length === 0) {
    onProgress({
      status: 'completed',
      totalTitles,
      processedCount,
      completedCount,
      skippedCount,
      failedCount,
      percentage: 100,
    });
    return { enrichedTitles: resultCatalog, completedCount, skippedCount, failedCount };
  }

  // Process in small batches with controlled concurrency
  for (let i = 0; i < queueIndices.length; i += concurrency) {
    if (shouldCancel && shouldCancel()) {
      onProgress({
        status: 'cancelled',
        totalTitles,
        processedCount,
        completedCount,
        skippedCount,
        failedCount,
        percentage: Math.round((processedCount / totalTitles) * 100),
      });
      break;
    }

    const batchIndices = queueIndices.slice(i, i + concurrency);

    await Promise.all(
      batchIndices.map(async (idx) => {
        const item = resultCatalog[idx];
        onProgress({
          status: 'running',
          totalTitles,
          processedCount,
          completedCount,
          skippedCount,
          failedCount,
          currentTitle: item.title,
          percentage: Math.round((processedCount / totalTitles) * 100),
        });

        try {
          const enriched = await enrichDiscoveryTitleWithTMDBDetails(item, apiKey);
          resultCatalog[idx] = enriched;
          if (enriched.tmdbEnrichment?.status === 'completed') {
            completedCount++;
          } else {
            failedCount++;
          }
          // Immediately save each enriched item and stream to UI in real time!
          if (onBatchSaved) {
            await onBatchSaved([enriched]);
          }
        } catch (err: any) {
          failedCount++;
          // In case of rate limit 429, pause for 2 seconds
          if (err.message?.includes('429')) {
            await sleep(2000);
          }
        } finally {
          processedCount++;
          onProgress({
            status: 'running',
            totalTitles,
            processedCount,
            completedCount,
            skippedCount,
            failedCount,
            currentTitle: item.title,
            percentage: Math.round((processedCount / totalTitles) * 100),
          });
        }
      })
    );

    onProgress({
      status: 'running',
      totalTitles,
      processedCount,
      completedCount,
      skippedCount,
      failedCount,
      percentage: Math.round((processedCount / totalTitles) * 100),
    });

    // Polite rate limiting pause
    if (delayBetweenBatchesMs > 0) {
      await sleep(delayBetweenBatchesMs);
    }
  }

  onProgress({
    status: 'completed',
    totalTitles,
    processedCount,
    completedCount,
    skippedCount,
    failedCount,
    percentage: 100,
  });

  return {
    enrichedTitles: resultCatalog,
    completedCount,
    skippedCount,
    failedCount,
  };
}
