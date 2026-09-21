import { EpisodeInfo, LibraryItem, MediaType, TrailerInfo } from '../types';
import { createDuplicateKey, normalizeCountriesList } from './normalizer';
import { getCachedMetadata, setCachedMetadata } from './db';
import { SAMPLE_METADATA_MAP } from './tmdbSampleData';
import { extractThemesFromKeywords, generateFallbackTagline } from './themeMapper';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
export const DEFAULT_PUBLIC_TMDB_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TMDB_API_KEY) ||
  'ec3ae1f9fde58cd94e4297c4cb3b77de';
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

// Prioritize Hindi trailer first, then English trailer, then any available trailer
export function selectBestTrailer(videos: any[]): TrailerInfo | undefined {
  if (!videos || videos.length === 0) return undefined;

  const validTrailers = videos.filter(
    (v: any) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser' || v.type === 'Clip' || v.type === 'Opening Credits')
  );
  if (validTrailers.length === 0) return undefined;

  // 1. Check Hindi trailer (by language code, name keyword, or title match)
  const hindiTrailer = validTrailers.find(
    (v: any) =>
      v.iso_639_1?.toLowerCase() === 'hi' ||
      /\bhindi\b/i.test(v.name || '')
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
    (v: any) => v.iso_639_1?.toLowerCase() === 'en' || !v.iso_639_1
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
export async function fetchOMDBMetadata(
  title: string,
  customKey?: string,
  imdbId?: string,
  year?: number
): Promise<{
  imdbRating?: number;
  rottenTomatoesRating?: number;
  poster?: string;
  synopsis?: string;
  year?: number;
  mediaType?: 'movie' | 'tv';
  runtimeMinutes?: number;
  genres?: string[];
  countries?: string[];
  languages?: string[];
} | null> {
  const cacheKey = imdbId ? `omdb_id_${imdbId}` : `omdb_${title.toLowerCase()}_${year || ''}`;
  const cached = await getCachedMetadata(cacheKey);
  if (cached) return cached;

  const key = customKey || OMDB_KEY;
  try {
    const queryParam = imdbId
      ? `i=${encodeURIComponent(imdbId)}`
      : `t=${encodeURIComponent(title)}${year ? `&y=${year}` : ''}`;
    const url = `https://www.omdbapi.com/?${queryParam}&plot=full&apikey=${key}`;
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
      const rawCountries = d.Country && d.Country !== 'N/A'
        ? d.Country.split(',').map((c: string) => c.trim()).filter(Boolean)
        : [];
      const countries = normalizeCountriesList(rawCountries);
      const languages = d.Language && d.Language !== 'N/A'
        ? d.Language.split(',').map((l: string) => l.trim()).filter(Boolean)
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
        languages,
      };
      await setCachedMetadata(cacheKey, result);
      return result;
    }
  } catch (err) {
    console.warn('OMDB fetch failed for', title, err);
  }
  return null;
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
    // Request multi-language videos (en, hi, es, de, null), keywords, credits, external_ids & translations
    const detailsUrl = TMDB_BASE_URL + '/' + mediaType + '/' + id + '?api_key=' + effectiveKey + '&append_to_response=videos,translations,keywords,credits,external_ids&include_video_language=en,hi,es,de,null';
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
    const finalSynopsis = data.overview || omdbData?.synopsis;

    // Extract tagline & generate guaranteed 1-line fallback if empty
    const rawTagline = (data.tagline || '').trim();
    const tagline = rawTagline || generateFallbackTagline(finalSynopsis, titleForRatings);

    // Extract keywords and compute canonical themes
    const rawKeywords = (data.keywords?.keywords || data.keywords?.results || [])
      .map((k: any) => k.name)
      .filter(Boolean);

    // Cast & crew
    const cast = Array.isArray(data.credits?.cast)
      ? data.credits.cast.slice(0, 8).map((c: any) => c.name).filter(Boolean)
      : undefined;

    let director: string | undefined;
    if (mediaType === 'movie' && Array.isArray(data.credits?.crew)) {
      const dirObj = data.credits.crew.find((c: any) => c.job === 'Director');
      if (dirObj) director = dirObj.name;
    }

    let creator: string | undefined;
    if (mediaType === 'tv' && Array.isArray(data.created_by) && data.created_by.length > 0) {
      creator = data.created_by.map((c: any) => c.name).join(', ');
    }

    if (mediaType === 'movie') {
      const rawCountries = (data.production_countries || []).map((c: any) => c.name || c.iso_3166_1).filter(Boolean);
      const countries = normalizeCountriesList(rawCountries.length > 0 ? rawCountries : (omdbData?.countries || []));
      const spokenLangs: string[] = (data.spoken_languages || []).map((l: any) => l.english_name || l.name || l.iso_639_1).concat(omdbData?.languages || []).filter(Boolean);
      const uniqueLangs: string[] = Array.from(new Set(spokenLangs));
      const origLang: string | undefined = data.original_language || undefined;
      const genres = (data.genres || []).map((g: any) => g.name).concat(omdbData?.genres || []).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);
      const themes = extractThemesFromKeywords(rawKeywords, genres, finalSynopsis);

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
        synopsis: finalSynopsis,
        tagline,
        themes,
        genres,
        countries,
        languages: uniqueLangs,
        originalLanguage: origLang,
        runtimeMinutes: data.runtime || omdbData?.runtimeMinutes || 0,
        trailer,
        cast,
        director,
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

      const rawCountries = (data.production_countries || []).map((c: any) => c.name || c.iso_3166_1)
        .concat(data.origin_country || [])
        .filter(Boolean);
      const countries = normalizeCountriesList(rawCountries.length > 0 ? rawCountries : (omdbData?.countries || []));
      const spokenLangs: string[] = (data.spoken_languages || []).map((l: any) => l.english_name || l.name || l.iso_639_1).concat(omdbData?.languages || []).filter(Boolean);
      const uniqueLangs: string[] = Array.from(new Set(spokenLangs));
      const origLang: string | undefined = data.original_language || undefined;
      const genres = (data.genres || []).map((g: any) => g.name).concat(omdbData?.genres || []).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);
      const themes = extractThemesFromKeywords(rawKeywords, genres, finalSynopsis);

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
        synopsis: finalSynopsis,
        tagline,
        themes,
        genres,
        countries,
        languages: uniqueLangs,
        originalLanguage: origLang,
        totalSeasons,
        totalEpisodes,
        averageEpisodeMinutes: defaultEpisodeRunTime,
        episodes,
        trailer,
        cast,
        creator,
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
  // If the user manually selected or edited this match, NEVER overwrite it with automatic heuristics
  if (item.isManualMatch && item.status === 'matched') {
    return item;
  }

  // If details already exist including tagline and themes, do not re-fetch from API
  const hasFullDetails =
    item.status === 'matched' &&
    !!item.posterPath &&
    (item.rating !== undefined || item.imdbRating !== undefined || item.rottenTomatoesRating !== undefined) &&
    (item.genres && item.genres.length > 0) &&
    (item.themes && item.themes.length > 0) &&
    !!item.tagline &&
    !!item.synopsis &&
    (item.mediaType === 'movie' ? item.runtimeMinutes !== undefined : item.totalEpisodes !== undefined);

  if (hasFullDetails) {
    return item;
  }

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

    const sampleSynopsis = omdb?.synopsis || sample.synopsis;
    const sampleGenres = sample.genres || omdb?.genres || [];
    const sampleTagline = item.tagline || (sample as any).tagline || generateFallbackTagline(sampleSynopsis, item.originalTitle);
    const sampleThemes = (item.themes && item.themes.length > 0)
      ? item.themes
      : extractThemesFromKeywords([], sampleGenres, sampleSynopsis);

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
      synopsis: sampleSynopsis,
      tagline: sampleTagline,
      themes: sampleThemes,
      genres: sampleGenres,
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
          const finalPoster = details.posterPath || omdb?.poster;
          const finalSynopsis = details.synopsis || omdb?.synopsis;
          const finalGenres = details.genres || omdb?.genres || [];
          const finalTagline = details.tagline || item.tagline || generateFallbackTagline(finalSynopsis, item.originalTitle);
          const finalThemes = (details.themes && details.themes.length > 0)
            ? details.themes
            : (item.themes && item.themes.length > 0 ? item.themes : extractThemesFromKeywords([], finalGenres, finalSynopsis));

          return {
            ...item,
            ...details,
            tagline: finalTagline,
            themes: finalThemes,
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
    const poster = omdb.poster;
    const synopsis = omdb.synopsis;
    const omdbGenres = omdb.genres || [];
    const omdbTagline = item.tagline || generateFallbackTagline(synopsis, item.originalTitle);
    const omdbThemes = (item.themes && item.themes.length > 0)
      ? item.themes
      : extractThemesFromKeywords([], omdbGenres, synopsis);

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
      tagline: omdbTagline,
      themes: omdbThemes,
      genres: omdbGenres,
      countries: omdb.countries || [],
      runtimeMinutes: isTv ? undefined : (omdb.runtimeMinutes || 100),
      totalEpisodes: isTv ? 10 : undefined,
      averageEpisodeMinutes: isTv ? (omdb.runtimeMinutes || 45) : undefined,
      status: 'matched',
      updatedAt: new Date().toISOString(),
    };
  }

  // 5. Final fallback heuristics (no external match found, but keep in same library seamlessly)
  const lower = item.originalTitle.toLowerCase();
  const isLikelySeries = /season|series|chapter|part \d|vol\./i.test(lower);
  const fallbackSynopsis = item.synopsis || `${item.originalTitle} on Netflix.`;
  const fallbackTagline = item.tagline || generateFallbackTagline(fallbackSynopsis, item.originalTitle);
  const fallbackThemes = (item.themes && item.themes.length > 0)
    ? item.themes
    : extractThemesFromKeywords([], item.genres || [], fallbackSynopsis);

  return {
    ...item,
    mediaType: isLikelySeries ? 'tv' : 'movie',
    status: 'matched', // Kept seamless in regular library without separate review tab
    tagline: fallbackTagline,
    themes: fallbackThemes,
    runtimeMinutes: isLikelySeries ? undefined : 100,
    totalEpisodes: isLikelySeries ? 8 : undefined,
    averageEpisodeMinutes: isLikelySeries ? 45 : undefined,
    updatedAt: new Date().toISOString(),
  };
}
