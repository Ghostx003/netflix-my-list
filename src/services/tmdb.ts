import { EpisodeInfo, LibraryItem, MediaType, TrailerInfo } from '../types';
import { createDuplicateKey } from './normalizer';
import { getCachedMetadata, setCachedMetadata } from './db';
import { SAMPLE_METADATA_MAP } from './tmdbSampleData';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
export const DEFAULT_PUBLIC_TMDB_KEY = '1cf50e6248dc270629e802686245c2c8';
const OMDB_KEY = 'trilogy';

export interface TMDBMatchCandidate {
  id: number | string;
  title: string;
  originalTitle?: string;
  mediaType: 'movie' | 'tv';
  releaseYear?: number;
  posterPath?: string;
  backdropPath?: string;
  rating: number;
  imdbRating?: number;
  rottenTomatoesRating?: number;
  voteCount: number;
  overview: string;
  popularity: number;
}

export function selectBestTrailer(videos: any[]): TrailerInfo | undefined {
  if (!videos || videos.length === 0) return undefined;

  const validTrailers = videos.filter(
    (v: any) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser' || v.type === 'Clip' || v.type === 'Opening Credits')
  );
  if (validTrailers.length === 0) return undefined;

  // 1. Check Hindi trailer
  const hindiTrailer = validTrailers.find(
    (v: any) =>
      v.iso_639_1?.toLowerCase() === 'hi' ||
      v.name?.toLowerCase().includes('hindi')
  );
  if (hindiTrailer) {
    return {
      id: hindiTrailer.id,
      key: hindiTrailer.key,
      name: hindiTrailer.name,
      site: hindiTrailer.site,
      type: hindiTrailer.type,
      language: 'hi',
      isOfficial: hindiTrailer.official,
    };
  }

  // 2. Check English trailer / teaser
  const englishTrailers = validTrailers.filter(
    (v: any) => v.iso_639_1?.toLowerCase() === 'en'
  );
  if (englishTrailers.length > 0) {
    const officialTrailer = englishTrailers.find((v: any) => v.official && v.type === 'Trailer');
    const anyTrailer = englishTrailers.find((v: any) => v.type === 'Trailer');
    const selected = officialTrailer || anyTrailer || englishTrailers[0];
    return {
      id: selected.id,
      key: selected.key,
      name: selected.name,
      site: selected.site,
      type: selected.type,
      language: 'en',
      isOfficial: selected.official,
    };
  }

  // 3. Fallback to any available trailer
  const fallback = validTrailers.find((v: any) => v.official) || validTrailers[0];
  return {
    id: fallback.id,
    key: fallback.key,
    name: fallback.name,
    site: fallback.site,
    type: fallback.type,
    language: fallback.iso_639_1 || 'other',
    isOfficial: fallback.official,
  };
}

/**
 * Fetch ratings, poster, plot, runtime, genres and country from OMDB API
 */
export async function fetchOMDBMetadata(title: string, customKey?: string): Promise<{
  imdbRating?: number;
  rottenTomatoesRating?: number;
  poster?: string;
  synopsis?: string;
  year?: number;
  mediaType?: 'movie' | 'tv';
  runtimeMinutes?: number;
  genres?: string[];
  countries?: string[];
} | null> {
  const cacheKey = 'omdb_' + title.toLowerCase();
  const cached = await getCachedMetadata(cacheKey);
  if (cached) return cached;

  const key = customKey || OMDB_KEY;
  try {
    const url = 'https://www.omdbapi.com/?t=' + encodeURIComponent(title) + '&plot=full&apikey=' + key;
    const res = await fetch(url);
    if (!res.ok) return null;
    const d = await res.json();
    if (d && d.Response === 'True') {
      const rtItem = (d.Ratings || []).find((r: any) => r.Source === 'Rotten Tomatoes');
      const rtRating = rtItem ? parseInt(rtItem.Value.replace('%', ''), 10) : undefined;
      const imdb = d.imdbRating && d.imdbRating !== 'N/A' ? parseFloat(d.imdbRating) : undefined;
      const year = d.Year ? parseInt(d.Year.slice(0, 4), 10) : undefined;
      const poster = d.Poster && d.Poster !== 'N/A' ? d.Poster : undefined;
      const synopsis = d.Plot && d.Plot !== 'N/A' ? d.Plot : undefined;
      const runtimeMinutes = d.Runtime && d.Runtime !== 'N/A' ? parseInt(d.Runtime, 10) : undefined;
      const mediaType: 'movie' | 'tv' = d.Type === 'series' ? 'tv' : 'movie';
      
      const genres = d.Genre && d.Genre !== 'N/A'
        ? d.Genre.split(',').map((g: string) => g.trim()).filter(Boolean)
        : [];
      const countries = d.Country && d.Country !== 'N/A'
        ? d.Country.split(',').map((c: string) => c.trim()).filter(Boolean)
        : [];

      const result = {
        imdbRating: imdb,
        rottenTomatoesRating: rtRating,
        poster,
        synopsis,
        year,
        mediaType,
        runtimeMinutes,
        genres,
        countries,
      };
      await setCachedMetadata(cacheKey, result);
      return result;
    }
  } catch (err) {
    console.warn('OMDB fetch failed for', title, err);
  }
  return null;
}

/**
 * Multi-API Fallback: Fetch poster & synopsis from TVMaze API (Public, No Key Required)
 */
export async function fetchTVMazeMetadata(title: string): Promise<{
  poster?: string;
  synopsis?: string;
  genres?: string[];
  totalEpisodes?: number;
  averageEpisodeMinutes?: number;
} | null> {
  const cacheKey = 'tvmaze_' + title.toLowerCase();
  const cached = await getCachedMetadata(cacheKey);
  if (cached) return cached;

  try {
    const url = 'https://api.tvmaze.com/singlesearch/shows?q=' + encodeURIComponent(title) + '&embed=episodes';
    const res = await fetch(url);
    if (!res.ok) return null;
    const d = await res.json();
    if (!d) return null;

    const poster = d.image?.original || d.image?.medium;
    // Strip HTML tags from summary
    const synopsis = d.summary ? d.summary.replace(/<[^>]*>?/gm, '').trim() : undefined;
    const genres = Array.isArray(d.genres) ? d.genres : [];
    const totalEpisodes = d._embedded?.episodes ? d._embedded.episodes.length : undefined;
    const averageEpisodeMinutes = d.averageRuntime || d.runtime || 45;

    const result = {
      poster,
      synopsis,
      genres,
      totalEpisodes,
      averageEpisodeMinutes,
    };
    await setCachedMetadata(cacheKey, result);
    return result;
  } catch (err) {
    // TVMaze failed or not a TV show
    return null;
  }
}

/**
 * Multi-API Fallback: Fetch poster image from Wikipedia REST Summary API (Public, No Key Required)
 */
export async function fetchWikipediaMetadata(title: string): Promise<{
  poster?: string;
  synopsis?: string;
} | null> {
  const cacheKey = 'wiki_' + title.toLowerCase();
  const cached = await getCachedMetadata(cacheKey);
  if (cached) return cached;

  try {
    // Format title into Wikipedia article slug
    const cleanTitle = title.replace(/\s+/g, '_');
    const url = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(cleanTitle);
    const res = await fetch(url);
    if (!res.ok) return null;
    const d = await res.json();
    if (!d || d.type === 'disambiguation') return null;

    const poster = d.thumbnail?.source || d.originalimage?.source;
    const synopsis = d.extract;

    const result = { poster, synopsis };
    await setCachedMetadata(cacheKey, result);
    return result;
  } catch (err) {
    return null;
  }
}

export async function searchTMDB(
  query: string,
  apiKey: string
): Promise<TMDBMatchCandidate[]> {
  const effectiveKey = apiKey || DEFAULT_PUBLIC_TMDB_KEY;
  const cacheKey = 'search_' + query.toLowerCase();
  const cached = await getCachedMetadata(cacheKey);
  if (cached) return cached;

  // Query OMDB for fallback match
  const omdbData = await fetchOMDBMetadata(query);

  if (!effectiveKey) {
    const slug = createDuplicateKey(query);
    const sample = SAMPLE_METADATA_MAP[slug];
    if (sample) {
      return [
        {
          id: sample.externalId,
          title: sample.externalTitle,
          mediaType: sample.mediaType,
          releaseYear: sample.releaseYear,
          posterPath: sample.posterPath,
          backdropPath: sample.backdropPath,
          rating: sample.rating,
          imdbRating: sample.rating,
          rottenTomatoesRating: 85,
          voteCount: sample.voteCount,
          overview: sample.synopsis,
          popularity: 90,
        },
      ];
    }

    if (omdbData) {
      return [
        {
          id: 'omdb_' + encodeURIComponent(query),
          title: query,
          mediaType: omdbData.mediaType || 'movie',
          releaseYear: omdbData.year,
          posterPath: omdbData.poster,
          rating: omdbData.imdbRating || 7.0,
          imdbRating: omdbData.imdbRating,
          rottenTomatoesRating: omdbData.rottenTomatoesRating,
          voteCount: 100,
          overview: omdbData.synopsis || '',
          popularity: 50,
        },
      ];
    }

    return [];
  }

  try {
    const url = TMDB_BASE_URL + '/search/multi?api_key=' + effectiveKey + '&query=' + encodeURIComponent(query) + '&include_adult=false';
    const res = await fetch(url);
    if (!res.ok) throw new Error('TMDB HTTP error ' + res.status);
    const data = await res.json();

    const results: TMDBMatchCandidate[] = (data.results || [])
      .filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv')
      .map((r: any) => ({
        id: r.id,
        title: r.title || r.name || '',
        originalTitle: r.original_title || r.original_name,
        mediaType: r.media_type as 'movie' | 'tv',
        releaseYear: r.release_date
          ? parseInt(r.release_date.slice(0, 4), 10)
          : r.first_air_date
          ? parseInt(r.first_air_date.slice(0, 4), 10)
          : undefined,
        posterPath: r.poster_path
          ? 'https://image.tmdb.org/t/p/w500' + r.poster_path
          : undefined,
        backdropPath: r.backdrop_path
          ? 'https://image.tmdb.org/t/p/w1280' + r.backdrop_path
          : undefined,
        rating: Number((r.vote_average || 0).toFixed(1)),
        voteCount: r.vote_count || 0,
        overview: r.overview || '',
        popularity: r.popularity || 0,
      }));

    await setCachedMetadata(cacheKey, results);
    return results;
  } catch (err) {
    console.warn('TMDB search failed for ' + query + ':', err);
    if (omdbData) {
      return [
        {
          id: 'omdb_' + encodeURIComponent(query),
          title: query,
          mediaType: omdbData.mediaType || 'movie',
          releaseYear: omdbData.year,
          posterPath: omdbData.poster,
          rating: omdbData.imdbRating || 7.0,
          imdbRating: omdbData.imdbRating,
          rottenTomatoesRating: omdbData.rottenTomatoesRating,
          voteCount: 100,
          overview: omdbData.synopsis || '',
          popularity: 50,
        },
      ];
    }
    return [];
  }
}

export async function fetchFullDetails(
  id: number | string,
  mediaType: 'movie' | 'tv',
  apiKey: string
): Promise<Partial<LibraryItem> | null> {
  const effectiveKey = apiKey || DEFAULT_PUBLIC_TMDB_KEY;
  const cacheKey = 'details_' + mediaType + '_' + id;
  const cached = await getCachedMetadata(cacheKey);
  if (cached) return cached;

  if (typeof id === 'string' && id.startsWith('omdb_')) {
    const title = decodeURIComponent(id.replace('omdb_', ''));
    const omdb = await fetchOMDBMetadata(title);
    if (omdb) {
      return {
        externalId: id,
        externalTitle: title,
        mediaType: omdb.mediaType || mediaType,
        releaseYear: omdb.year,
        posterPath: omdb.poster,
        rating: omdb.imdbRating || 7.0,
        imdbRating: omdb.imdbRating,
        rottenTomatoesRating: omdb.rottenTomatoesRating,
        synopsis: omdb.synopsis,
        runtimeMinutes: omdb.runtimeMinutes,
        status: 'matched',
      };
    }
    return null;
  }

  if (!effectiveKey) return null;

  try {
    // Request multi-language videos (en, hi, es, de, null) to discover all trailers
    const detailsUrl = TMDB_BASE_URL + '/' + mediaType + '/' + id + '?api_key=' + effectiveKey + '&append_to_response=videos&include_video_language=en,hi,es,de,null';
    const res = await fetch(detailsUrl);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    let trailer = selectBestTrailer(data.videos?.results);

    // If TV show doesn't have a series-level trailer, check Season 1 videos
    if (!trailer && mediaType === 'tv') {
      try {
        const s1Url = TMDB_BASE_URL + '/tv/' + id + '/season/1/videos?api_key=' + effectiveKey;
        const s1Res = await fetch(s1Url);
        if (s1Res.ok) {
          const s1Data = await s1Res.json();
          trailer = selectBestTrailer(s1Data.results);
        }
      } catch (err) {
        // ignore
      }
    }

    // Fetch OMDB ratings to augment TMDB
    const titleForRatings = data.title || data.name;
    const omdbData = await fetchOMDBMetadata(titleForRatings);

    if (mediaType === 'movie') {
      const countries = (data.production_countries || []).map((c: any) => c.name || c.iso_3166_1).filter(Boolean);
      const result: Partial<LibraryItem> = {
        externalId: data.id,
        externalTitle: data.title,
        mediaType: 'movie',
        releaseYear: data.release_date ? parseInt(data.release_date.slice(0, 4), 10) : undefined,
        releaseDate: data.release_date || undefined,
        posterPath: data.poster_path ? 'https://image.tmdb.org/t/p/w500' + data.poster_path : omdbData?.poster,
        backdropPath: data.backdrop_path ? 'https://image.tmdb.org/t/p/w1280' + data.backdrop_path : undefined,
        rating: Number((data.vote_average || 0).toFixed(1)),
        imdbRating: omdbData?.imdbRating,
        rottenTomatoesRating: omdbData?.rottenTomatoesRating,
        voteCount: data.vote_count,
        synopsis: data.overview || omdbData?.synopsis,
        genres: (data.genres || []).map((g: any) => g.name).concat(omdbData?.genres || []).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i),
        countries: countries.length > 0 ? countries : (omdbData?.countries || []),
        runtimeMinutes: data.runtime || omdbData?.runtimeMinutes || 0,
        trailer,
        status: 'matched',
      };
      await setCachedMetadata(cacheKey, result);
      return result;
    } else {
      const episodes: EpisodeInfo[] = [];
      const totalSeasons = data.number_of_seasons || 1;
      const totalEpisodes = data.number_of_episodes || 0;
      const episodeRunTimes: number[] = data.episode_run_time || [];
      const defaultEpisodeRunTime = episodeRunTimes.length > 0 ? episodeRunTimes[0] : (omdbData?.runtimeMinutes || 45);

      for (const season of (data.seasons || [])) {
        if (season.season_number === 0) continue;
        try {
          const sRes = await fetch(TMDB_BASE_URL + '/tv/' + id + '/season/' + season.season_number + '?api_key=' + effectiveKey);
          if (sRes.ok) {
            const sData = await sRes.json();
            for (const ep of sData.episodes || []) {
              episodes.push({
                id: ep.id,
                seasonNumber: ep.season_number,
                episodeNumber: ep.episode_number,
                name: ep.name,
                runtimeMinutes: ep.runtime || defaultEpisodeRunTime,
                overview: ep.overview,
                stillPath: ep.still_path ? 'https://image.tmdb.org/t/p/w500' + ep.still_path : undefined,
              });
            }
          }
        } catch {}
      }

      const countries = (data.production_countries || []).map((c: any) => c.name || c.iso_3166_1)
        .concat(data.origin_country || [])
        .filter(Boolean);

      const result: Partial<LibraryItem> = {
        externalId: data.id,
        externalTitle: data.name,
        mediaType: 'tv',
        releaseYear: data.first_air_date ? parseInt(data.first_air_date.slice(0, 4), 10) : undefined,
        releaseDate: data.first_air_date || undefined,
        posterPath: data.poster_path ? 'https://image.tmdb.org/t/p/w500' + data.poster_path : omdbData?.poster,
        backdropPath: data.backdrop_path ? 'https://image.tmdb.org/t/p/w1280' + data.backdrop_path : undefined,
        rating: Number((data.vote_average || 0).toFixed(1)),
        imdbRating: omdbData?.imdbRating,
        rottenTomatoesRating: omdbData?.rottenTomatoesRating,
        voteCount: data.vote_count,
        synopsis: data.overview || omdbData?.synopsis,
        genres: (data.genres || []).map((g: any) => g.name).concat(omdbData?.genres || []).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i),
        countries: countries.length > 0 ? countries : (omdbData?.countries || []),
        totalSeasons,
        totalEpisodes,
        averageEpisodeMinutes: defaultEpisodeRunTime,
        episodes,
        trailer,
        status: 'matched',
      };
      await setCachedMetadata(cacheKey, result);
      return result;
    }
  } catch (err) {
    console.warn('Failed to fetch details for ' + mediaType + ' ' + id + ':', err);
    return null;
  }
}

/**
 * Enriches a single library item using OMDB, TMDB, TVMaze, Wikipedia, and persistent cache.
 * Everything is automatically kept in the regular library without segregation.
 */
export async function enrichLibraryItem(
  item: LibraryItem,
  apiKey: string,
  maxEpisodesLimit: number = 10,
  capEpisodes: boolean = false
): Promise<LibraryItem> {
  const effectiveKey = apiKey || DEFAULT_PUBLIC_TMDB_KEY;
  const slug = createDuplicateKey(item.originalTitle);

  // Attempt OMDB first for instant ratings (IMDb, Rotten Tomatoes), valid poster and synopsis
  const omdb = await fetchOMDBMetadata(item.originalTitle);

  // 1. Check local sample data
  if (SAMPLE_METADATA_MAP[slug]) {
    const sample = SAMPLE_METADATA_MAP[slug];
    const episodes = sample.episodes || [];
    const included = capEpisodes ? episodes.slice(0, maxEpisodesLimit) : episodes;
    const includedRuntimeMinutes = included.reduce(
      (sum, ep) => sum + (ep.runtimeMinutes || sample.averageEpisodeMinutes || 45),
      0
    );

    return {
      ...item,
      externalId: sample.externalId,
      externalTitle: sample.externalTitle,
      mediaType: sample.mediaType,
      releaseYear: sample.releaseYear || omdb?.year,
      posterPath: omdb?.poster || sample.posterPath,
      backdropPath: sample.backdropPath,
      rating: sample.rating,
      imdbRating: omdb?.imdbRating || sample.rating,
      rottenTomatoesRating: omdb?.rottenTomatoesRating || 85,
      voteCount: sample.voteCount,
      synopsis: omdb?.synopsis || sample.synopsis,
      genres: sample.genres,
      runtimeMinutes: sample.runtimeMinutes || omdb?.runtimeMinutes,
      totalSeasons: sample.totalSeasons,
      totalEpisodes: sample.totalEpisodes,
      includedEpisodesCount: sample.mediaType === 'tv' ? (capEpisodes ? Math.min(sample.totalEpisodes || 10, maxEpisodesLimit) : sample.totalEpisodes) : undefined,
      includedRuntimeMinutes: sample.mediaType === 'tv' ? includedRuntimeMinutes : undefined,
      averageEpisodeMinutes: sample.averageEpisodeMinutes,
      episodes: sample.episodes,
      trailer: sample.trailer,
      status: 'matched',
      updatedAt: new Date().toISOString(),
    };
  }

  // 2. Query TMDB (using user key or default built-in API key)
  if (effectiveKey) {
    const candidates = await searchTMDB(item.originalTitle, effectiveKey);
    if (candidates.length > 0) {
      const queryKey = createDuplicateKey(item.originalTitle);
      const exactMatch = candidates.find((c) => createDuplicateKey(c.title) === queryKey);
      const chosen = exactMatch || (candidates[0].popularity > 10 ? candidates[0] : candidates[0]);

      if (chosen) {
        const details = await fetchFullDetails(chosen.id, chosen.mediaType, effectiveKey);
        if (details) {
          // Check if posterPath is still missing; if so, try TVMaze or Wikipedia
          let finalPoster = details.posterPath || omdb?.poster;
          let finalSynopsis = details.synopsis || omdb?.synopsis;
          let finalGenres = details.genres || omdb?.genres || [];

          if (!finalPoster) {
            const tvmaze = await fetchTVMazeMetadata(item.originalTitle);
            if (tvmaze?.poster) {
              finalPoster = tvmaze.poster;
              if (!finalSynopsis) finalSynopsis = tvmaze.synopsis;
            } else {
              const wiki = await fetchWikipediaMetadata(item.originalTitle);
              if (wiki?.poster) {
                finalPoster = wiki.poster;
                if (!finalSynopsis) finalSynopsis = wiki.synopsis;
              }
            }
          }

          return {
            ...item,
            ...details,
            imdbRating: omdb?.imdbRating || details.imdbRating,
            rottenTomatoesRating: omdb?.rottenTomatoesRating || details.rottenTomatoesRating,
            posterPath: finalPoster,
            synopsis: finalSynopsis,
            genres: finalGenres,
            status: 'matched',
            updatedAt: new Date().toISOString(),
          };
        }
      }
    }
  }

  // 3. Fallback to OMDB data
  if (omdb) {
    const isTv = omdb.mediaType === 'tv';
    let poster = omdb.poster;
    let synopsis = omdb.synopsis;

    if (!poster) {
      const tvmaze = await fetchTVMazeMetadata(item.originalTitle);
      if (tvmaze?.poster) {
        poster = tvmaze.poster;
        if (!synopsis) synopsis = tvmaze.synopsis;
      } else {
        const wiki = await fetchWikipediaMetadata(item.originalTitle);
        if (wiki?.poster) {
          poster = wiki.poster;
          if (!synopsis) synopsis = wiki.synopsis;
        }
      }
    }

    return {
      ...item,
      externalId: 'omdb_' + encodeURIComponent(item.originalTitle),
      externalTitle: item.originalTitle,
      mediaType: isTv ? 'tv' : 'movie',
      releaseYear: omdb.year,
      posterPath: poster,
      rating: omdb.imdbRating || 7.0,
      imdbRating: omdb.imdbRating,
      rottenTomatoesRating: omdb.rottenTomatoesRating,
      synopsis,
      genres: omdb.genres || [],
      countries: omdb.countries || [],
      runtimeMinutes: isTv ? undefined : (omdb.runtimeMinutes || 100),
      totalEpisodes: isTv ? 10 : undefined,
      averageEpisodeMinutes: isTv ? (omdb.runtimeMinutes || 45) : undefined,
      status: 'matched',
      updatedAt: new Date().toISOString(),
    };
  }

  // 4. Fallback to TVMaze or Wikipedia if both TMDB and OMDB failed
  const tvmaze = await fetchTVMazeMetadata(item.originalTitle);
  if (tvmaze && (tvmaze.poster || tvmaze.synopsis)) {
    return {
      ...item,
      externalId: 'tvmaze_' + encodeURIComponent(item.originalTitle),
      externalTitle: item.originalTitle,
      mediaType: 'tv',
      posterPath: tvmaze.poster,
      synopsis: tvmaze.synopsis,
      genres: tvmaze.genres || [],
      totalEpisodes: tvmaze.totalEpisodes || 10,
      averageEpisodeMinutes: tvmaze.averageEpisodeMinutes || 45,
      status: 'matched',
      updatedAt: new Date().toISOString(),
    };
  }

  const wiki = await fetchWikipediaMetadata(item.originalTitle);
  if (wiki && (wiki.poster || wiki.synopsis)) {
    const lower = item.originalTitle.toLowerCase();
    const isLikelySeries = /season|series|chapter|part \d|vol\./i.test(lower);
    return {
      ...item,
      externalId: 'wiki_' + encodeURIComponent(item.originalTitle),
      externalTitle: item.originalTitle,
      mediaType: isLikelySeries ? 'tv' : 'movie',
      posterPath: wiki.poster,
      synopsis: wiki.synopsis,
      status: 'matched',
      runtimeMinutes: isLikelySeries ? undefined : 100,
      totalEpisodes: isLikelySeries ? 8 : undefined,
      averageEpisodeMinutes: isLikelySeries ? 45 : undefined,
      updatedAt: new Date().toISOString(),
    };
  }

  // 5. Final fallback heuristics (no external match found, but keep in same library seamlessly)
  const lower = item.originalTitle.toLowerCase();
  const isLikelySeries = /season|series|chapter|part \d|vol\./i.test(lower);

  return {
    ...item,
    mediaType: isLikelySeries ? 'tv' : 'movie',
    status: 'matched', // Kept seamless in regular library without separate review tab
    runtimeMinutes: isLikelySeries ? undefined : 100,
    totalEpisodes: isLikelySeries ? 8 : undefined,
    averageEpisodeMinutes: isLikelySeries ? 45 : undefined,
    updatedAt: new Date().toISOString(),
  };
}
