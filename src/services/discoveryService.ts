import { DiscoveryTitle, EpisodeInfo, TrailerInfo } from '../types';
import { DEFAULT_PUBLIC_TMDB_KEY, fetchOMDBMetadata, selectBestTrailer } from './tmdb';
import { getCachedMetadata, setCachedMetadata, saveDiscoveryTitles } from './db';
import { normalizeCountriesList, normalizeTitle, createDuplicateKey, NETFLIX_HINDI_DUBBED_TITLES } from './normalizer';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Curated robust catalog of verified Netflix India titles across Hollywood, Bollywood, K-Dramas, Anime, European & Hindi Dubbed
export const SEED_NETFLIX_INDIA_TITLES: DiscoveryTitle[] = [
  // --- Bollywood & Indian Cinema & Series ---
  {
    id: 'seed-in-1',
    tmdbId: 872585,
    imdbId: 'tt15239678',
    netflixId: '81490447',
    title: 'Jawan',
    originalTitle: 'Jawan',
    mediaType: 'movie',
    releaseYear: 2023,
    releaseDate: '2023-09-07',
    netflixAddedDate: '2023-11-02',
    posterPath: 'https://image.tmdb.org/t/p/w500/jNQvlq2Z1T62U2eWwT90kG23p1c.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/8ZTVqvKDQ8emSGUEMjsS4xUMwnP.jpg',
    rating: 7.2,
    imdbRating: 7.0,
    rottenTomatoesRating: 88,
    synopsis: 'A high-octane action thriller outlining the emotional journey of a man who is set to rectify the wrongs in society.',
    genres: ['Action', 'Thriller'],
    countries: ['India'],
    originalLanguage: 'hi',
    audioLanguages: ['hi', 'ta', 'te'],
    subtitleLanguages: ['en', 'hi'],
    runtimeMinutes: 169,
    cast: ['Shah Rukh Khan', 'Nayanthara', 'Vijay Sethupathi'],
    director: 'Atlee',
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-in-2',
    tmdbId: 579974,
    imdbId: 'tt8178634',
    netflixId: '81490448',
    title: 'RRR',
    originalTitle: 'RRR',
    mediaType: 'movie',
    releaseYear: 2022,
    releaseDate: '2022-03-24',
    netflixAddedDate: '2022-05-20',
    posterPath: 'https://image.tmdb.org/t/p/w500/wE0q27Y0AE9gLzZ8k8kF5n12.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/o3LwMv84h8mGjQk8b4y2d5.jpg',
    rating: 7.8,
    imdbRating: 7.8,
    rottenTomatoesRating: 95,
    synopsis: 'A fearless revolutionary and an officer in the British force, who once shared a deep bond, decide to join forces and chart out an inspiring path of freedom against the despotic rulers.',
    genres: ['Action', 'Drama'],
    countries: ['India'],
    originalLanguage: 'te',
    audioLanguages: ['hi', 'te', 'ta', 'kn', 'ml'],
    subtitleLanguages: ['en', 'hi'],
    runtimeMinutes: 187,
    cast: ['N.T. Rama Rao Jr.', 'Ram Charan', 'Alia Bhatt'],
    director: 'S.S. Rajamouli',
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-in-3',
    tmdbId: 78377,
    imdbId: 'tt6077448',
    netflixId: '80115328',
    title: 'Sacred Games',
    originalTitle: 'Sacred Games',
    mediaType: 'tv',
    releaseYear: 2018,
    releaseDate: '2018-07-06',
    netflixAddedDate: '2018-07-06',
    posterPath: 'https://image.tmdb.org/t/p/w500/ySgYxZ3L1j1yQkQjWlq1wLq.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/sacredgames_bg.jpg',
    rating: 8.2,
    imdbRating: 8.5,
    rottenTomatoesRating: 92,
    synopsis: 'A link in their pasts leads an honest cop to a fugitive gang boss, whose cryptic warning spurs the officer on a quest to save Mumbai from cataclysm.',
    genres: ['Crime', 'Drama', 'Thriller'],
    countries: ['India'],
    originalLanguage: 'hi',
    audioLanguages: ['hi', 'en'],
    subtitleLanguages: ['en', 'hi'],
    totalSeasons: 2,
    totalEpisodes: 16,
    averageEpisodeMinutes: 50,
    cast: ['Saif Ali Khan', 'Nawazuddin Siddiqui', 'Radhika Apte'],
    director: 'Anurag Kashyap & Vikramaditya Motwane',
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-in-4',
    tmdbId: 88873,
    imdbId: 'tt9558966',
    netflixId: '80244786',
    title: 'Delhi Crime',
    originalTitle: 'Delhi Crime',
    mediaType: 'tv',
    releaseYear: 2019,
    releaseDate: '2019-03-22',
    netflixAddedDate: '2019-03-22',
    posterPath: 'https://image.tmdb.org/t/p/w500/5k3fQY7iKjY2QxZ.jpg',
    rating: 8.5,
    imdbRating: 8.5,
    rottenTomatoesRating: 94,
    synopsis: 'Following the investigation of the infamous 2012 Delhi gang rape, DCP Vartika Chaturvedi searches for the culprits.',
    genres: ['Crime', 'Drama', 'Thriller'],
    countries: ['India'],
    originalLanguage: 'hi',
    audioLanguages: ['hi', 'en'],
    subtitleLanguages: ['en', 'hi'],
    totalSeasons: 2,
    totalEpisodes: 12,
    averageEpisodeMinutes: 52,
    cast: ['Shefali Shah', 'Rasika Dugal', 'Adil Hussain'],
    director: 'Richie Mehta',
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-in-5',
    tmdbId: 209867,
    imdbId: 'tt21868350',
    netflixId: '81454047',
    title: 'Kohrra',
    originalTitle: 'Kohrra',
    mediaType: 'tv',
    releaseYear: 2023,
    releaseDate: '2023-07-15',
    netflixAddedDate: '2023-07-15',
    posterPath: 'https://image.tmdb.org/t/p/w500/kohrra_poster.jpg',
    rating: 7.7,
    imdbRating: 7.6,
    rottenTomatoesRating: 86,
    synopsis: 'When an NRI groom is discovered dead days before his wedding, two cops must unravel the troubling case as turbulence unfolds in their own lives.',
    genres: ['Crime', 'Drama', 'Mystery', 'Thriller'],
    countries: ['India'],
    originalLanguage: 'pa',
    audioLanguages: ['pa', 'hi', 'en'],
    subtitleLanguages: ['en', 'hi'],
    totalSeasons: 1,
    totalEpisodes: 6,
    averageEpisodeMinutes: 48,
    cast: ['Barun Sobti', 'Suvinder Vicky', 'Harleen Sethi'],
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-in-6',
    tmdbId: 534780,
    imdbId: 'tt8914674',
    netflixId: '81039381',
    title: 'Andhadhun',
    originalTitle: 'Andhadhun',
    mediaType: 'movie',
    releaseYear: 2018,
    releaseDate: '2018-10-05',
    netflixAddedDate: '2018-12-16',
    posterPath: 'https://image.tmdb.org/t/p/w500/dyhaB19AIC4PkYQI2aLJda9dnBp.jpg',
    rating: 8.2,
    imdbRating: 8.2,
    rottenTomatoesRating: 93,
    synopsis: 'A series of mysterious events changes the life of a blind pianist who now must report a crime that was committed in front of him.',
    genres: ['Crime', 'Thriller', 'Mystery', 'Comedy'],
    countries: ['India'],
    originalLanguage: 'hi',
    audioLanguages: ['hi'],
    subtitleLanguages: ['en', 'hi'],
    runtimeMinutes: 139,
    cast: ['Ayushmann Khurrana', 'Tabu', 'Radhika Apte', 'Anil Dhawan'],
    director: 'Sriram Raghavan',
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-in-7',
    tmdbId: 987912,
    imdbId: 'tt18768074',
    netflixId: '81514979',
    title: 'Jaane Jaan',
    originalTitle: 'Jaane Jaan',
    mediaType: 'movie',
    releaseYear: 2023,
    releaseDate: '2023-09-21',
    netflixAddedDate: '2023-09-21',
    posterPath: 'https://image.tmdb.org/t/p/w500/2L2j8n4L0gM9R4pT2p1b2a.jpg',
    rating: 7.3,
    imdbRating: 7.0,
    rottenTomatoesRating: 82,
    synopsis: 'A single mother caught in a crime receives unexpected help from her gifted math teacher neighbor, while a tenacious cop begins to dig.',
    genres: ['Crime', 'Drama', 'Mystery', 'Thriller'],
    countries: ['India'],
    originalLanguage: 'hi',
    audioLanguages: ['hi', 'ta', 'te'],
    subtitleLanguages: ['en', 'hi'],
    runtimeMinutes: 133,
    cast: ['Kareena Kapoor Khan', 'Jaideep Ahlawat', 'Vijay Varma'],
    director: 'Sujoy Ghosh',
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-in-8',
    tmdbId: 581528,
    imdbId: 'tt8130968',
    netflixId: '81113921',
    title: 'Badla',
    originalTitle: 'Badla',
    mediaType: 'movie',
    releaseYear: 2019,
    releaseDate: '2019-03-08',
    netflixAddedDate: '2019-05-03',
    posterPath: 'https://image.tmdb.org/t/p/w500/yT51dE3n3K3W5f12.jpg',
    rating: 7.6,
    imdbRating: 7.8,
    rottenTomatoesRating: 80,
    synopsis: 'A dynamic young entrepreneur finds herself locked in a hotel room with the corpse of her dead lover. She hires a prestigious lawyer to defend her.',
    genres: ['Crime', 'Mystery', 'Thriller', 'Drama'],
    countries: ['India'],
    originalLanguage: 'hi',
    audioLanguages: ['hi'],
    subtitleLanguages: ['en', 'hi'],
    runtimeMinutes: 118,
    cast: ['Amitabh Bachchan', 'Taapsee Pannu', 'Amrita Singh'],
    director: 'Sujoy Ghosh',
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-in-9',
    tmdbId: 819582,
    imdbId: 'tt11456054',
    netflixId: '81247738',
    title: 'Haseen Dillruba',
    originalTitle: 'Haseen Dillruba',
    mediaType: 'movie',
    releaseYear: 2021,
    releaseDate: '2021-07-02',
    netflixAddedDate: '2021-07-02',
    posterPath: 'https://image.tmdb.org/t/p/w500/uU8c9Jz04y01.jpg',
    rating: 7.1,
    imdbRating: 6.9,
    rottenTomatoesRating: 75,
    synopsis: 'Under investigation for the murder of her husband, a wife reveals details about their rocky marriage that only seem to further blur the truth.',
    genres: ['Crime', 'Drama', 'Mystery', 'Romance', 'Thriller'],
    countries: ['India'],
    originalLanguage: 'hi',
    audioLanguages: ['hi'],
    subtitleLanguages: ['en', 'hi'],
    runtimeMinutes: 135,
    cast: ['Taapsee Pannu', 'Vikrant Massey', 'Harshvardhan Rane'],
    director: 'Vinil Mathew',
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-in-10',
    tmdbId: 721452,
    imdbId: 'tt12680684',
    netflixId: '81183494',
    title: 'Raat Akeli Hai',
    originalTitle: 'Raat Akeli Hai',
    mediaType: 'movie',
    releaseYear: 2020,
    releaseDate: '2020-07-31',
    netflixAddedDate: '2020-07-31',
    posterPath: 'https://image.tmdb.org/t/p/w500/vX9Y2p12.jpg',
    rating: 7.4,
    imdbRating: 7.3,
    rottenTomatoesRating: 84,
    synopsis: 'A small-town cop is summoned to investigate the death of a politically powerful landlord whose murder is shrouded in family secrets.',
    genres: ['Crime', 'Drama', 'Mystery', 'Thriller'],
    countries: ['India'],
    originalLanguage: 'hi',
    audioLanguages: ['hi'],
    subtitleLanguages: ['en', 'hi'],
    runtimeMinutes: 149,
    cast: ['Nawazuddin Siddiqui', 'Radhika Apte', 'Shweta Tripathi'],
    director: 'Honey Trehan',
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-in-11',
    tmdbId: 86831,
    imdbId: 'tt1787988',
    netflixId: '70264601',
    title: 'Talaash',
    originalTitle: 'Talaash',
    mediaType: 'movie',
    releaseYear: 2012,
    releaseDate: '2012-11-30',
    netflixAddedDate: '2018-10-01',
    posterPath: 'https://image.tmdb.org/t/p/w500/talaash_poster.jpg',
    rating: 7.3,
    imdbRating: 7.2,
    rottenTomatoesRating: 81,
    synopsis: 'An inspector fighting depression following the tragic death of his son must solve the mysterious drowning of a prominent film actor in Mumbai.',
    genres: ['Crime', 'Drama', 'Mystery', 'Thriller'],
    countries: ['India'],
    originalLanguage: 'hi',
    audioLanguages: ['hi'],
    subtitleLanguages: ['en', 'hi'],
    runtimeMinutes: 139,
    cast: ['Aamir Khan', 'Rani Mukerji', 'Kareena Kapoor Khan'],
    director: 'Reema Kagti',
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },

  // --- K-Dramas (South Korea) ---
  {
    id: 'seed-kd-1',
    tmdbId: 93405,
    imdbId: 'tt10919420',
    netflixId: '81040344',
    title: 'Squid Game',
    originalTitle: '오징어 게임',
    mediaType: 'tv',
    releaseYear: 2021,
    releaseDate: '2021-09-17',
    netflixAddedDate: '2021-09-17',
    posterPath: 'https://image.tmdb.org/t/p/w500/dDlG1TjB5j9Z6K.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/oaGvjB0DvdurvdX.jpg',
    rating: 7.8,
    imdbRating: 8.0,
    rottenTomatoesRating: 95,
    synopsis: 'Hundreds of cash-strapped players accept a strange invitation to compete in children\'s games. Inside, a tempting prize awaits with deadly high stakes.',
    genres: ['Action', 'Drama', 'Mystery', 'Thriller'],
    countries: ['South Korea'],
    originalLanguage: 'ko',
    audioLanguages: ['ko', 'hi', 'en'],
    subtitleLanguages: ['en', 'hi'],
    totalSeasons: 2,
    totalEpisodes: 15,
    averageEpisodeMinutes: 55,
    cast: ['Lee Jung-jae', 'Park Hae-soo', 'Wi Ha-jun'],
    director: 'Hwang Dong-hyuk',
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-kd-2',
    tmdbId: 99966,
    imdbId: 'tt14169960',
    netflixId: '81237994',
    title: 'All of Us Are Dead',
    originalTitle: '지금 우리 학교는',
    mediaType: 'tv',
    releaseYear: 2022,
    releaseDate: '2022-01-28',
    netflixAddedDate: '2022-01-28',
    posterPath: 'https://image.tmdb.org/t/p/w500/8j1y1.jpg',
    rating: 8.3,
    imdbRating: 7.5,
    rottenTomatoesRating: 88,
    synopsis: 'A high school becomes ground zero for a zombie virus outbreak. Trapped students must fight their way out or turn into one of the rabid infected.',
    genres: ['Action', 'Drama', 'Horror', 'Sci-Fi'],
    countries: ['South Korea'],
    originalLanguage: 'ko',
    audioLanguages: ['ko', 'hi', 'en'],
    subtitleLanguages: ['en', 'hi'],
    totalSeasons: 1,
    totalEpisodes: 12,
    averageEpisodeMinutes: 60,
    cast: ['Park Ji-hu', 'Yoon Chan-young', 'Cho Yi-hyun'],
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-kd-3',
    tmdbId: 136283,
    imdbId: 'tt21344706',
    netflixId: '81519223',
    title: 'The Glory',
    originalTitle: '더 글로리',
    mediaType: 'tv',
    releaseYear: 2022,
    releaseDate: '2022-12-30',
    netflixAddedDate: '2022-12-30',
    posterPath: 'https://image.tmdb.org/t/p/w500/glory.jpg',
    rating: 8.6,
    imdbRating: 8.1,
    rottenTomatoesRating: 94,
    synopsis: 'Years after surviving horrific abuse in high school, a woman puts an elaborate revenge scheme in motion to make the perpetrators pay for their crimes.',
    genres: ['Drama', 'Thriller'],
    countries: ['South Korea'],
    originalLanguage: 'ko',
    audioLanguages: ['ko', 'hi', 'en'],
    subtitleLanguages: ['en', 'hi'],
    totalSeasons: 1,
    totalEpisodes: 16,
    averageEpisodeMinutes: 52,
    cast: ['Song Hye-kyo', 'Lee Do-hyun', 'Lim Ji-yeon'],
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-kd-4',
    tmdbId: 96462,
    imdbId: 'tt10875696',
    netflixId: '81159258',
    title: 'Crash Landing on You',
    originalTitle: '사랑의 불시착',
    mediaType: 'tv',
    releaseYear: 2019,
    releaseDate: '2019-12-14',
    netflixAddedDate: '2019-12-14',
    posterPath: 'https://image.tmdb.org/t/p/w500/cloy_poster.jpg',
    rating: 8.7,
    imdbRating: 8.7,
    rottenTomatoesRating: 90,
    synopsis: 'A paragliding mishap drops a South Korean heiress in North Korea — and into the life of an army officer, who decides he will help her hide.',
    genres: ['Comedy', 'Drama', 'Romance'],
    countries: ['South Korea'],
    originalLanguage: 'ko',
    audioLanguages: ['ko', 'en'],
    subtitleLanguages: ['en', 'hi'],
    totalSeasons: 1,
    totalEpisodes: 16,
    averageEpisodeMinutes: 80,
    cast: ['Hyun Bin', 'Son Ye-jin', 'Seo Ji-hye'],
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-kd-5',
    tmdbId: 196148,
    imdbId: 'tt26428784',
    netflixId: '81669777',
    title: 'Queen of Tears',
    originalTitle: '눈물의 여왕',
    mediaType: 'tv',
    releaseYear: 2024,
    releaseDate: '2024-03-09',
    netflixAddedDate: '2024-03-09',
    posterPath: 'https://image.tmdb.org/t/p/w500/qot_poster.jpg',
    rating: 8.8,
    imdbRating: 8.3,
    rottenTomatoesRating: 92,
    synopsis: 'The queen of department stores and her small-town husband weather a marital crisis — until love miraculously begins to bloom again.',
    genres: ['Drama', 'Romance', 'Comedy'],
    countries: ['South Korea'],
    originalLanguage: 'ko',
    audioLanguages: ['ko', 'en'],
    subtitleLanguages: ['en', 'hi'],
    totalSeasons: 1,
    totalEpisodes: 16,
    averageEpisodeMinutes: 85,
    cast: ['Kim Soo-hyun', 'Kim Ji-won', 'Park Sung-hoon'],
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-kd-6',
    tmdbId: 101463,
    imdbId: 'tt12108776',
    netflixId: '80990668',
    title: 'Extracurricular',
    originalTitle: '인간수업',
    mediaType: 'tv',
    releaseYear: 2020,
    releaseDate: '2020-04-29',
    netflixAddedDate: '2020-04-29',
    posterPath: 'https://image.tmdb.org/t/p/w500/extra_poster.jpg',
    rating: 8.0,
    imdbRating: 7.6,
    rottenTomatoesRating: 88,
    synopsis: 'A model high school student who is determined to make something of himself commits a serious crime in order to pay for college tuition.',
    genres: ['Crime', 'Drama', 'Thriller'],
    countries: ['South Korea'],
    originalLanguage: 'ko',
    audioLanguages: ['ko', 'hi', 'en'],
    subtitleLanguages: ['en', 'hi'],
    totalSeasons: 1,
    totalEpisodes: 10,
    averageEpisodeMinutes: 50,
    cast: ['Kim Dong-hee', 'Park Ju-hyun', 'Jung Da-bin'],
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-kd-7',
    tmdbId: 96580,
    imdbId: 'tt11612120',
    netflixId: '81061734',
    title: 'Sweet Home',
    originalTitle: '스위트홈',
    mediaType: 'tv',
    releaseYear: 2020,
    releaseDate: '2020-12-18',
    netflixAddedDate: '2020-12-18',
    posterPath: 'https://image.tmdb.org/t/p/w500/sweet_poster.jpg',
    rating: 8.2,
    imdbRating: 7.3,
    rottenTomatoesRating: 84,
    synopsis: 'As humans turn into savage monsters and wreak terror, one troubled teen and his apartment neighbors fight to survive and to hold on to their humanity.',
    genres: ['Action', 'Drama', 'Horror', 'Sci-Fi', 'Thriller'],
    countries: ['South Korea'],
    originalLanguage: 'ko',
    audioLanguages: ['ko', 'hi', 'en'],
    subtitleLanguages: ['en', 'hi'],
    totalSeasons: 3,
    totalEpisodes: 26,
    averageEpisodeMinutes: 52,
    cast: ['Song Kang', 'Lee Jin-wook', 'Lee Si-young'],
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },

  // --- Anime (Japan) ---
  {
    id: 'seed-an-1',
    tmdbId: 85937,
    imdbId: 'tt9335498',
    netflixId: '81091393',
    title: 'Demon Slayer: Kimetsu no Yaiba',
    originalTitle: '鬼滅の刃',
    mediaType: 'tv',
    releaseYear: 2019,
    releaseDate: '2019-04-06',
    netflixAddedDate: '2020-04-30',
    posterPath: 'https://image.tmdb.org/t/p/w500/xUfRZu2mi8jH6SzQEJGP6tjBuYj.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/nTvM4mhqZlHIvUkI1gq294YkiZZ.jpg',
    rating: 8.7,
    imdbRating: 8.6,
    rottenTomatoesRating: 98,
    synopsis: 'It is the Taisho Period in Japan. Tanjiro, a kindhearted boy who sells charcoal for a living, finds his family slaughtered by a demon.',
    genres: ['Animation', 'Action', 'Fantasy'],
    countries: ['Japan'],
    originalLanguage: 'ja',
    audioLanguages: ['ja', 'hi', 'en'],
    subtitleLanguages: ['en', 'hi'],
    totalSeasons: 4,
    totalEpisodes: 55,
    averageEpisodeMinutes: 24,
    cast: ['Natsuki Hanae', 'Akari Kito', 'Hiro Shimono'],
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-an-2',
    tmdbId: 95479,
    imdbId: 'tt12343534',
    netflixId: '81278448',
    title: 'Jujutsu Kaisen',
    originalTitle: '呪術廻戦',
    mediaType: 'tv',
    releaseYear: 2020,
    releaseDate: '2020-10-03',
    netflixAddedDate: '2021-06-03',
    posterPath: 'https://image.tmdb.org/t/p/w500/hD8pZgJ4g8M.jpg',
    rating: 8.6,
    imdbRating: 8.5,
    rottenTomatoesRating: 96,
    synopsis: 'A boy swallows a cursed talisman - the finger of a demon - and becomes cursed himself. He enters a shaman\'s school to be able to locate the demon\'s other body parts and thus exorcise himself.',
    genres: ['Animation', 'Action', 'Fantasy'],
    countries: ['Japan'],
    originalLanguage: 'ja',
    audioLanguages: ['ja', 'hi', 'en'],
    subtitleLanguages: ['en', 'hi'],
    totalSeasons: 2,
    totalEpisodes: 47,
    averageEpisodeMinutes: 24,
    cast: ['Junya Enoki', 'Yuma Uchida', 'Asami Seto'],
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-an-3',
    tmdbId: 1429,
    imdbId: 'tt0877057',
    netflixId: '70204970',
    title: 'Attack on Titan',
    originalTitle: '進撃の巨人',
    mediaType: 'tv',
    releaseYear: 2013,
    releaseDate: '2013-04-07',
    netflixAddedDate: '2018-09-01',
    posterPath: 'https://image.tmdb.org/t/p/w500/hTP1wD4eex9h.jpg',
    rating: 8.9,
    imdbRating: 9.1,
    rottenTomatoesRating: 95,
    synopsis: 'After his hometown is destroyed and his mother is killed, young Eren Jaeger vows to cleanse the earth of the giant humanoid Titans that have brought humanity to the brink of extinction.',
    genres: ['Animation', 'Action', 'Sci-Fi', 'Fantasy'],
    countries: ['Japan'],
    originalLanguage: 'ja',
    audioLanguages: ['ja', 'en'],
    subtitleLanguages: ['en', 'hi'],
    totalSeasons: 4,
    totalEpisodes: 89,
    averageEpisodeMinutes: 24,
    cast: ['Yuki Kaji', 'Yui Ishikawa', 'Marina Inoue'],
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-an-4',
    tmdbId: 105971,
    imdbId: 'tt12590266',
    netflixId: '81054853',
    title: 'Cyberpunk: Edgerunners',
    originalTitle: 'Cyberpunk: Edgerunners',
    mediaType: 'tv',
    releaseYear: 2022,
    releaseDate: '2022-09-13',
    netflixAddedDate: '2022-09-13',
    posterPath: 'https://image.tmdb.org/t/p/w500/75.jpg',
    rating: 8.6,
    imdbRating: 8.3,
    rottenTomatoesRating: 100,
    synopsis: 'A street kid trying to survive in a technology and body modification-obsessed city of the future. Having everything to lose, he chooses to stay alive by becoming an edgerunner: a mercenary outlaw.',
    genres: ['Animation', 'Action', 'Sci-Fi'],
    countries: ['Japan', 'Poland'],
    originalLanguage: 'ja',
    audioLanguages: ['ja', 'en'],
    subtitleLanguages: ['en', 'hi'],
    totalSeasons: 1,
    totalEpisodes: 10,
    averageEpisodeMinutes: 25,
    cast: ['KENN', 'Aoi Yuki', 'Hiroki Touchi'],
    director: 'Hiroyuki Imaishi',
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },

  // --- Hollywood & US Blockbusters & Series ---
  {
    id: 'seed-hw-1',
    tmdbId: 66732,
    imdbId: 'tt4574334',
    netflixId: '80057281',
    title: 'Stranger Things',
    originalTitle: 'Stranger Things',
    mediaType: 'tv',
    releaseYear: 2016,
    releaseDate: '2016-07-15',
    netflixAddedDate: '2016-07-15',
    posterPath: 'https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/56v2KjBlU4XaOv9rVYEQypROD7P.jpg',
    rating: 8.6,
    imdbRating: 8.7,
    rottenTomatoesRating: 92,
    synopsis: 'When a young boy vanishes, a small town uncovers a mystery involving secret experiments, terrifying supernatural forces and one strange little girl.',
    genres: ['Sci-Fi', 'Drama', 'Mystery', 'Horror'],
    countries: ['United States'],
    originalLanguage: 'en',
    audioLanguages: ['en', 'hi', 'es'],
    subtitleLanguages: ['en', 'hi'],
    totalSeasons: 4,
    totalEpisodes: 34,
    averageEpisodeMinutes: 60,
    cast: ['Millie Bobby Brown', 'Finn Wolfhard', 'Winona Ryder', 'David Harbour'],
    director: 'The Duffer Brothers',
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-hw-2',
    tmdbId: 119051,
    imdbId: 'tt13443470',
    netflixId: '81231974',
    title: 'Wednesday',
    originalTitle: 'Wednesday',
    mediaType: 'tv',
    releaseYear: 2022,
    releaseDate: '2022-11-23',
    netflixAddedDate: '2022-11-23',
    posterPath: 'https://image.tmdb.org/t/p/w500/9PFonBhy4cQy7Jz20NpMygczOkv.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/iHSwvRVsRyxKuXgtIOvsJHQN9zy.jpg',
    rating: 8.5,
    imdbRating: 8.1,
    rottenTomatoesRating: 72,
    synopsis: 'Wednesday Addams investigates a murder spree while making new friends — and foes — at Nevermore Academy.',
    genres: ['Comedy', 'Fantasy', 'Mystery', 'Crime'],
    countries: ['United States'],
    originalLanguage: 'en',
    audioLanguages: ['en', 'hi', 'es'],
    subtitleLanguages: ['en', 'hi'],
    totalSeasons: 1,
    totalEpisodes: 8,
    averageEpisodeMinutes: 50,
    cast: ['Jenna Ortega', 'Gwendoline Christie', 'Riki Lindhome'],
    director: 'Tim Burton',
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-hw-3',
    tmdbId: 46648,
    imdbId: 'tt1586680',
    netflixId: '80234304',
    title: 'True Detective',
    originalTitle: 'True Detective',
    mediaType: 'tv',
    releaseYear: 2014,
    releaseDate: '2014-01-12',
    netflixAddedDate: '2022-01-01',
    posterPath: 'https://image.tmdb.org/t/p/w500/cuV2O53rxg8zgfEu3.jpg',
    rating: 8.3,
    imdbRating: 8.9,
    rottenTomatoesRating: 78,
    synopsis: 'An anthology series in which police investigations unearth the personal and professional secrets of those involved, both within and outside the law.',
    genres: ['Drama', 'Crime', 'Mystery', 'Thriller'],
    countries: ['United States'],
    originalLanguage: 'en',
    audioLanguages: ['en'],
    subtitleLanguages: ['en'],
    totalSeasons: 4,
    totalEpisodes: 30,
    averageEpisodeMinutes: 58,
    cast: ['Matthew McConaughey', 'Woody Harrelson', 'Colin Farrell'],
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-hw-4',
    tmdbId: 157336,
    imdbId: 'tt0816692',
    netflixId: '70305903',
    title: 'Interstellar',
    originalTitle: 'Interstellar',
    mediaType: 'movie',
    releaseYear: 2014,
    releaseDate: '2014-11-05',
    netflixAddedDate: '2021-04-01',
    posterPath: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/xJHokMbljvjADYdit5fK5VQsXEG.jpg',
    rating: 8.4,
    imdbRating: 8.7,
    rottenTomatoesRating: 73,
    synopsis: 'The adventures of a group of explorers who make use of a newly discovered wormhole to surpass the limitations on human space travel and conquer the vast distances involved in an interstellar voyage.',
    genres: ['Adventure', 'Drama', 'Sci-Fi'],
    countries: ['United States', 'United Kingdom'],
    originalLanguage: 'en',
    audioLanguages: ['en', 'hi'],
    subtitleLanguages: ['en', 'hi'],
    runtimeMinutes: 169,
    cast: ['Matthew McConaughey', 'Anne Hathaway', 'Jessica Chastain'],
    director: 'Christopher Nolan',
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-hw-5',
    tmdbId: 546554,
    imdbId: 'tt7975244',
    netflixId: '80990668',
    title: 'Knives Out',
    originalTitle: 'Knives Out',
    mediaType: 'movie',
    releaseYear: 2019,
    releaseDate: '2019-11-27',
    netflixAddedDate: '2021-12-01',
    posterPath: 'https://image.tmdb.org/t/p/w500/pThyQovXQrw2m0s9x82twj48Jq4.jpg',
    rating: 7.9,
    imdbRating: 7.9,
    rottenTomatoesRating: 97,
    synopsis: 'When renowned crime novelist Harlan Thrombey is found dead at his estate just after his 85th birthday, the inquisitive and debonair Detective Benoit Blanc is mysteriously enlisted to investigate.',
    genres: ['Comedy', 'Crime', 'Mystery', 'Thriller'],
    countries: ['United States'],
    originalLanguage: 'en',
    audioLanguages: ['en', 'hi'],
    subtitleLanguages: ['en', 'hi'],
    runtimeMinutes: 130,
    cast: ['Daniel Craig', 'Ana de Armas', 'Chris Evans'],
    director: 'Rian Johnson',
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-hw-6',
    tmdbId: 67744,
    imdbId: 'tt5290382',
    netflixId: '80114855',
    title: 'Mindhunter',
    originalTitle: 'Mindhunter',
    mediaType: 'tv',
    releaseYear: 2017,
    releaseDate: '2017-10-13',
    netflixAddedDate: '2017-10-13',
    posterPath: 'https://image.tmdb.org/t/p/w500/fbKE87mojpIETWepSbDLiLQZ5Hb.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/uipXkH1N684j6H.jpg',
    rating: 8.6,
    imdbRating: 8.6,
    rottenTomatoesRating: 96,
    synopsis: 'In the late 1970s two FBI agents expand criminal science by delving into the psychology of murder and getting uneasily close to all-too-real monsters.',
    genres: ['Crime', 'Drama', 'Thriller', 'Mystery'],
    countries: ['United States'],
    originalLanguage: 'en',
    audioLanguages: ['en', 'hi'],
    subtitleLanguages: ['en', 'hi'],
    totalSeasons: 2,
    totalEpisodes: 19,
    averageEpisodeMinutes: 55,
    cast: ['Jonathan Groff', 'Holt McCallany', 'Anna Torv'],
    director: 'David Fincher',
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-hw-7',
    tmdbId: 1396,
    imdbId: 'tt0903747',
    netflixId: '70143836',
    title: 'Breaking Bad',
    originalTitle: 'Breaking Bad',
    mediaType: 'tv',
    releaseYear: 2008,
    releaseDate: '2008-01-20',
    netflixAddedDate: '2016-01-01',
    posterPath: 'https://image.tmdb.org/t/p/w500/ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg',
    rating: 8.9,
    imdbRating: 9.5,
    rottenTomatoesRating: 96,
    synopsis: 'A chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine with a former student in order to secure his family\'s future.',
    genres: ['Crime', 'Drama', 'Thriller'],
    countries: ['United States'],
    originalLanguage: 'en',
    audioLanguages: ['en'],
    subtitleLanguages: ['en', 'hi'],
    totalSeasons: 5,
    totalEpisodes: 62,
    averageEpisodeMinutes: 47,
    cast: ['Bryan Cranston', 'Aaron Paul', 'Anna Gunn', 'Giancarlo Esposito'],
    creator: 'Vince Gilligan',
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-hw-8',
    tmdbId: 63351,
    imdbId: 'tt2707408',
    netflixId: '70283261',
    title: 'Narcos',
    originalTitle: 'Narcos',
    mediaType: 'tv',
    releaseYear: 2015,
    releaseDate: '2015-08-28',
    netflixAddedDate: '2015-08-28',
    posterPath: 'https://image.tmdb.org/t/p/w500/rTmal9fVEwh5x9hJ2.jpg',
    rating: 8.4,
    imdbRating: 8.8,
    rottenTomatoesRating: 89,
    synopsis: 'A gritty chronicle of the war against the Medellín drug cartel and its ruthless leader, Pablo Escobar, as told through DEA agents and Colombian police.',
    genres: ['Biography', 'Crime', 'Drama', 'Thriller'],
    countries: ['United States', 'Colombia'],
    originalLanguage: 'en',
    audioLanguages: ['en', 'es', 'hi'],
    subtitleLanguages: ['en', 'hi'],
    totalSeasons: 3,
    totalEpisodes: 30,
    averageEpisodeMinutes: 50,
    cast: ['Wagner Moura', 'Pedro Pascal', 'Boyd Holbrook'],
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-hw-9',
    tmdbId: 63333,
    imdbId: 'tt5071412',
    netflixId: '80117552',
    title: 'Ozark',
    originalTitle: 'Ozark',
    mediaType: 'tv',
    releaseYear: 2017,
    releaseDate: '2017-07-21',
    netflixAddedDate: '2017-07-21',
    posterPath: 'https://image.tmdb.org/t/p/w500/m73bD8VuoSnEO.jpg',
    rating: 8.2,
    imdbRating: 8.5,
    rottenTomatoesRating: 86,
    synopsis: 'A financial advisor drags his family from Chicago to the Missouri Ozarks, where he must launder $500 million in five years to appease a drug boss.',
    genres: ['Crime', 'Drama', 'Thriller'],
    countries: ['United States'],
    originalLanguage: 'en',
    audioLanguages: ['en', 'hi'],
    subtitleLanguages: ['en', 'hi'],
    totalSeasons: 4,
    totalEpisodes: 44,
    averageEpisodeMinutes: 60,
    cast: ['Jason Bateman', 'Laura Linney', 'Julia Garner'],
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-hw-10',
    tmdbId: 42009,
    imdbId: 'tt2085059',
    netflixId: '70264888',
    title: 'Black Mirror',
    originalTitle: 'Black Mirror',
    mediaType: 'tv',
    releaseYear: 2011,
    releaseDate: '2011-12-04',
    netflixAddedDate: '2016-10-21',
    posterPath: 'https://image.tmdb.org/t/p/w500/7RumFHk.jpg',
    rating: 8.3,
    imdbRating: 8.7,
    rottenTomatoesRating: 83,
    synopsis: 'An anthology series exploring a twisted, high-tech multiverse where humanity\'s greatest innovations and darkest instincts collide.',
    genres: ['Drama', 'Sci-Fi', 'Thriller', 'Mystery'],
    countries: ['United Kingdom', 'United States'],
    originalLanguage: 'en',
    audioLanguages: ['en', 'hi'],
    subtitleLanguages: ['en', 'hi'],
    totalSeasons: 6,
    totalEpisodes: 27,
    averageEpisodeMinutes: 60,
    cast: ['Daniel Lapaine', 'Hannah John-Kamen', 'Michaela Coel'],
    creator: 'Charlie Brooker',
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-hw-11',
    tmdbId: 78191,
    imdbId: 'tt6320628',
    netflixId: '80211991',
    title: 'You',
    originalTitle: 'You',
    mediaType: 'tv',
    releaseYear: 2018,
    releaseDate: '2018-09-09',
    netflixAddedDate: '2018-12-26',
    posterPath: 'https://image.tmdb.org/t/p/w500/7a3Xw0wM.jpg',
    rating: 8.0,
    imdbRating: 7.7,
    rottenTomatoesRating: 91,
    synopsis: 'A dangerously charming, intensely obsessive young man goes to extreme measures to insert himself into the lives of those he is transfixed by.',
    genres: ['Crime', 'Drama', 'Romance', 'Thriller'],
    countries: ['United States'],
    originalLanguage: 'en',
    audioLanguages: ['en', 'hi'],
    subtitleLanguages: ['en', 'hi'],
    totalSeasons: 4,
    totalEpisodes: 40,
    averageEpisodeMinutes: 48,
    cast: ['Penn Badgley', 'Victoria Pedretti', 'Elizabeth Lail'],
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-hw-12',
    tmdbId: 545609,
    imdbId: 'tt8936646',
    netflixId: '80230677',
    title: 'Extraction',
    originalTitle: 'Extraction',
    mediaType: 'movie',
    releaseYear: 2020,
    releaseDate: '2020-04-24',
    netflixAddedDate: '2020-04-24',
    posterPath: 'https://image.tmdb.org/t/p/w500/wlfDxbZyPLVNV4.jpg',
    rating: 7.4,
    imdbRating: 6.8,
    rottenTomatoesRating: 67,
    synopsis: 'A black-market mercenary who has nothing to lose is hired to rescue the kidnapped son of an imprisoned international crime lord in Dhaka, Bangladesh.',
    genres: ['Action', 'Thriller', 'Crime'],
    countries: ['United States'],
    originalLanguage: 'en',
    audioLanguages: ['en', 'hi', 'bn'],
    subtitleLanguages: ['en', 'hi'],
    runtimeMinutes: 116,
    cast: ['Chris Hemsworth', 'Rudhraksh Jaiswal', 'Randeep Hooda', 'Golshifteh Farahani'],
    director: 'Sam Hargrave',
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-hw-13',
    tmdbId: 725201,
    imdbId: 'tt1649418',
    netflixId: '81161626',
    title: 'The Gray Man',
    originalTitle: 'The Gray Man',
    mediaType: 'movie',
    releaseYear: 2022,
    releaseDate: '2022-07-15',
    netflixAddedDate: '2022-07-22',
    posterPath: 'https://image.tmdb.org/t/p/w500/8CXbfl.jpg',
    rating: 7.0,
    imdbRating: 6.5,
    rottenTomatoesRating: 45,
    synopsis: 'When the CIA\'s most skilled operative accidentally uncovers dark agency secrets, a psychopathic former colleague puts a bounty on his head.',
    genres: ['Action', 'Thriller'],
    countries: ['United States'],
    originalLanguage: 'en',
    audioLanguages: ['en', 'hi', 'ta', 'te'],
    subtitleLanguages: ['en', 'hi'],
    runtimeMinutes: 122,
    cast: ['Ryan Gosling', 'Chris Evans', 'Ana de Armas', 'Dhanush'],
    director: 'Anthony Russo, Joe Russo',
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },

  // --- European Content (Spain, Germany, UK, France, Italy, etc.) ---
  {
    id: 'seed-eu-1',
    tmdbId: 71446,
    imdbId: 'tt6468322',
    netflixId: '80192098',
    title: 'Money Heist',
    originalTitle: 'La Casa de Papel',
    mediaType: 'tv',
    releaseYear: 2017,
    releaseDate: '2017-05-02',
    netflixAddedDate: '2017-12-20',
    posterPath: 'https://image.tmdb.org/t/p/w500/reEMJA1uzscCbk5rHGTTBufl5vm.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/gFZriCkpJYsApP02.jpg',
    rating: 8.3,
    imdbRating: 8.2,
    rottenTomatoesRating: 94,
    synopsis: 'To carry out the biggest heist in history, a mysterious man called The Professor recruits a band of eight robbers who have a single characteristic: none of them has anything to lose.',
    genres: ['Action', 'Crime', 'Drama', 'Thriller'],
    countries: ['Spain'],
    originalLanguage: 'es',
    audioLanguages: ['es', 'hi', 'en'],
    subtitleLanguages: ['en', 'hi'],
    totalSeasons: 5,
    totalEpisodes: 41,
    averageEpisodeMinutes: 50,
    cast: ['Úrsula Corberó', 'Álvaro Morte', 'Itziar Ituño', 'Pedro Alonso'],
    creator: 'Álex Pina',
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-eu-2',
    tmdbId: 70523,
    imdbId: 'tt5753856',
    netflixId: '80100172',
    title: 'Dark',
    originalTitle: 'Dark',
    mediaType: 'tv',
    releaseYear: 2017,
    releaseDate: '2017-12-01',
    netflixAddedDate: '2017-12-01',
    posterPath: 'https://image.tmdb.org/t/p/w500/apbrbWs8M9lyOpJYU5WXrpFbk1Z.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/3lBDg3i6nn5R2NKFCJ.jpg',
    rating: 8.5,
    imdbRating: 8.7,
    rottenTomatoesRating: 95,
    synopsis: 'A missing child sets four families on a frantic hunt for answers as they unearth a mind-bending mystery that spans three generations.',
    genres: ['Crime', 'Drama', 'Mystery', 'Sci-Fi', 'Thriller'],
    countries: ['Germany'],
    originalLanguage: 'de',
    audioLanguages: ['de', 'hi', 'en'],
    subtitleLanguages: ['en', 'hi'],
    totalSeasons: 3,
    totalEpisodes: 26,
    averageEpisodeMinutes: 55,
    cast: ['Louis Hofmann', 'Oliver Masucci', 'Jördis Triebel'],
    creator: 'Baran bo Odar & Jantje Friese',
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-eu-3',
    tmdbId: 60574,
    imdbId: 'tt2442560',
    netflixId: '80002479',
    title: 'Peaky Blinders',
    originalTitle: 'Peaky Blinders',
    mediaType: 'tv',
    releaseYear: 2013,
    releaseDate: '2013-09-12',
    netflixAddedDate: '2014-09-30',
    posterPath: 'https://image.tmdb.org/t/p/w500/vUUqzWa2LnHIVqkaKV19pdpViup.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w1280/75.jpg',
    rating: 8.6,
    imdbRating: 8.8,
    rottenTomatoesRating: 93,
    synopsis: 'A gangster family epic set in 1919 Birmingham, England and centered on a gang who sew razor blades in the peaks of their caps, and their fierce boss Tommy Shelby.',
    genres: ['Crime', 'Drama', 'Thriller'],
    countries: ['United Kingdom'],
    originalLanguage: 'en',
    audioLanguages: ['en', 'hi'],
    subtitleLanguages: ['en', 'hi'],
    totalSeasons: 6,
    totalEpisodes: 36,
    averageEpisodeMinutes: 58,
    cast: ['Cillian Murphy', 'Paul Anderson', 'Helen McCrory'],
    creator: 'Steven Knight',
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-eu-4',
    tmdbId: 96677,
    imdbId: 'tt2531336',
    netflixId: '80994082',
    title: 'Lupin',
    originalTitle: 'Lupin',
    mediaType: 'tv',
    releaseYear: 2021,
    releaseDate: '2021-01-08',
    netflixAddedDate: '2021-01-08',
    posterPath: 'https://image.tmdb.org/t/p/w500/sgxawbFB5Vi5OkPWQLNfl3dvkNJ.jpg',
    rating: 7.7,
    imdbRating: 7.5,
    rottenTomatoesRating: 98,
    synopsis: 'Inspired by the adventures of Arsène Lupin, gentleman thief Assane Diop sets out to avenge his father for an injustice inflicted by a wealthy family.',
    genres: ['Crime', 'Drama', 'Mystery'],
    countries: ['France'],
    originalLanguage: 'fr',
    audioLanguages: ['fr', 'hi', 'en'],
    subtitleLanguages: ['en', 'hi'],
    totalSeasons: 3,
    totalEpisodes: 17,
    averageEpisodeMinutes: 46,
    cast: ['Omar Sy', 'Ludivine Sagnier', 'Antoine Gouy'],
    creator: 'George Kay',
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-eu-5',
    tmdbId: 906126,
    imdbId: 'tt16277242',
    netflixId: '81268316',
    title: 'Society of the Snow',
    originalTitle: 'La sociedad de la nieve',
    mediaType: 'movie',
    releaseYear: 2023,
    releaseDate: '2023-12-13',
    netflixAddedDate: '2024-01-04',
    posterPath: 'https://image.tmdb.org/t/p/w500/27.jpg',
    rating: 8.0,
    imdbRating: 7.8,
    rottenTomatoesRating: 90,
    synopsis: 'On October 13, 1972, Uruguayan Air Force Flight 571 crashes into the heart of the Andes. Survivors must resort to extreme measures to stay alive.',
    genres: ['Adventure', 'Drama', 'History'],
    countries: ['Spain'],
    originalLanguage: 'es',
    audioLanguages: ['es', 'hi', 'en'],
    subtitleLanguages: ['en', 'hi'],
    runtimeMinutes: 144,
    cast: ['Enzo Vogrincic', 'Agustín Pardella', 'Matías Recalt'],
    director: 'J.A. Bayona',
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
  {
    id: 'seed-eu-6',
    tmdbId: 63333,
    imdbId: 'tt4179452',
    netflixId: '80074220',
    title: 'The Last Kingdom',
    originalTitle: 'The Last Kingdom',
    mediaType: 'tv',
    releaseYear: 2015,
    releaseDate: '2015-10-10',
    netflixAddedDate: '2018-04-10',
    posterPath: 'https://image.tmdb.org/t/p/w500/8eJf0h7cvcxvp6ujPtZn0k6Fk.jpg',
    rating: 8.3,
    imdbRating: 8.5,
    rottenTomatoesRating: 91,
    synopsis: 'As Alfred the Great defends his kingdom from Norse invaders, Uhtred - born a Saxon but raised by Vikings - seeks to claim his ancestral birthright.',
    genres: ['Action', 'Drama', 'History'],
    countries: ['United Kingdom'],
    originalLanguage: 'en',
    audioLanguages: ['en', 'hi'],
    subtitleLanguages: ['en', 'hi'],
    totalSeasons: 5,
    totalEpisodes: 46,
    averageEpisodeMinutes: 55,
    cast: ['Alexander Dreymon', 'Eliza Butterworth', 'Arnas Fedaravicius'],
    isNetflixIndiaVerified: true,
    availabilitySource: 'Netflix India',
  },
];

const TMDB_GENRE_ID_MAP: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Sci-Fi',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
  10759: 'Action & Adventure',
  10762: 'Kids',
  10763: 'News',
  10764: 'Reality',
  10765: 'Sci-Fi & Fantasy',
  10766: 'Soap',
  10767: 'Talk',
  10768: 'War & Politics',
};

// Curated list of known iconic Netflix India TV Series that belong in the Thriller genre
const KNOWN_TV_THRILLER_TITLES = new Set<string>([
  'sacred games',
  'delhi crime',
  'kohrra',
  'the railway men',
  'khakee: the bihar chapter',
  'khakee',
  'guns & gulaabs',
  'aranyak',
  'she',
  'rana naidu',
  'bard of blood',
  'mai',
  'betaal',
  'ghoul',
  'typewriter',
  'scoop',
  'breaking bad',
  'better call saul',
  'ozark',
  'mindhunter',
  'dark',
  'squid game',
  'stranger things',
  'you',
  'money heist',
  'peaky blinders',
  'lupin',
  'true detective',
  'black mirror',
  'narcos',
  'narcos: mexico',
  'bodyguard',
  'the blacklist',
  'sherlock',
  'dexter',
  'fargo',
  'bloodhounds',
  'my name',
  'extracurricular',
  'sweet home',
  'alice in borderland',
  'all of us are dead',
  'the glory',
  'signal',
  'stranger',
  'flower of evil',
  'beyond evil',
  'mouse',
  'death note',
  'monster',
  'psycho-pass',
  'the serpent',
  'broadchurch',
  'line of duty',
  'the fall',
  'marcella',
  'unbelievable',
  'when they see us',
  'the stranger',
  'stay close',
  'safe',
  'the woods',
  'hold tight',
  'fool me once',
  'baby reindeer',
  'ripely',
  'ripley',
]);

/**
 * Checks if a TV series should be tagged as Thriller based on title, genre combinations, or synopsis keywords.
 * (TMDB API does NOT have a native Thriller genre for TV shows, only for movies).
 */
export function inferTvThrillerGenre(title: string, genres: string[], synopsis?: string): boolean {
  if (genres.includes('Thriller')) return true;

  const normTitle = (title || '').toLowerCase().trim();
  if (KNOWN_TV_THRILLER_TITLES.has(normTitle)) return true;

  // Partial match for known thriller franchises
  for (const known of KNOWN_TV_THRILLER_TITLES) {
    if (normTitle.includes(known) || known.includes(normTitle)) {
      return true;
    }
  }

  const hasCrime = genres.includes('Crime');
  const hasMystery = genres.includes('Mystery');
  const hasActionAdv = genres.includes('Action & Adventure') || genres.includes('Action');
  const hasDrama = genres.includes('Drama');
  const hasHorror = genres.includes('Horror');

  const synLower = (synopsis || '').toLowerCase();
  const hasSuspenseKeywords =
    synLower.includes('thrill') ||
    synLower.includes('suspense') ||
    synLower.includes('murder') ||
    synLower.includes('killer') ||
    synLower.includes('serial killer') ||
    synLower.includes('conspiracy') ||
    synLower.includes('hostage') ||
    synLower.includes('investigat') ||
    synLower.includes('detective') ||
    synLower.includes('kidnap') ||
    synLower.includes('heist') ||
    synLower.includes('undercover') ||
    synLower.includes('cop') ||
    synLower.includes('police') ||
    synLower.includes('cartel') ||
    synLower.includes('revenge') ||
    synLower.includes('blackmail') ||
    synLower.includes('fugitive') ||
    synLower.includes('terror') ||
    synLower.includes('assassin') ||
    synLower.includes('psychological');

  // Any crime show or mystery show with suspense keywords or drama
  if (hasCrime && (hasMystery || hasSuspenseKeywords || hasDrama)) return true;
  if (hasMystery && (hasSuspenseKeywords || hasDrama || hasHorror)) return true;
  if (hasActionAdv && hasSuspenseKeywords) return true;
  if (hasHorror && hasSuspenseKeywords) return true;

  return false;
}

/**
 * Ensures all titles in a list have proper TV Thriller tags applied retroactively
 */
export function ensureTvThrillerGenres(titles: DiscoveryTitle[]): DiscoveryTitle[] {
  return titles.map((item) => {
    if (item.mediaType === 'tv') {
      const genres = [...(item.genres || [])];
      if (inferTvThrillerGenre(item.title, genres, item.synopsis)) {
        if (!genres.includes('Thriller')) {
          genres.push('Thriller');
          return { ...item, genres };
        }
      }
    }
    return item;
  });
}

/**
 * Normalizes raw TMDB item into unified DiscoveryTitle
 */
function normalizeTmdbToDiscovery(item: any, mediaType: 'movie' | 'tv'): DiscoveryTitle {
  const isMovie = mediaType === 'movie';
  const title = isMovie ? item.title : item.name;
  const originalTitle = isMovie ? item.original_title : item.original_name;
  const releaseDate = isMovie ? item.release_date : item.first_air_date;
  const releaseYear = releaseDate ? parseInt(releaseDate.slice(0, 4), 10) : undefined;
  
  // Country mapping
  const rawCountries = item.origin_country || (item.production_countries?.map((c: any) => c.name || c.iso_3166_1)) || [];
  const countries = normalizeCountriesList(rawCountries);

  // Genre mapping (supports both expanded genres array and genre_ids array from Discover endpoint)
  let genres: string[] = [];
  if (Array.isArray(item.genres) && item.genres.length > 0) {
    genres = item.genres.map((g: any) => g.name || g).filter(Boolean);
  } else if (Array.isArray(item.genre_ids) && item.genre_ids.length > 0) {
    genres = item.genre_ids.map((id: number) => TMDB_GENRE_ID_MAP[id]).filter(Boolean);
  }

  // TMDB API TV series quirk: TMDB has NO 'Thriller' genre ID for TV shows (/genre/tv/list only has Crime, Mystery, Drama, etc.).
  // Infer 'Thriller' tag using our comprehensive inferTvThrillerGenre engine
  if (!isMovie && inferTvThrillerGenre(title || '', genres, item.overview)) {
    if (!genres.includes('Thriller')) {
      genres.push('Thriller');
    }
  }

  const posterPath = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : undefined;
  const backdropPath = item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : undefined;

  // Language mapping
  const origLang = item.original_language?.toLowerCase();
  const audioLanguages: string[] = [];
  if (origLang) audioLanguages.push(origLang);

  // If item is in known Netflix Hindi Dubbed set, strictly mark verified
  const normTitle = normalizeTitle(title || '');
  if (NETFLIX_HINDI_DUBBED_TITLES.has(normTitle) || origLang === 'hi') {
    if (!audioLanguages.includes('hi')) audioLanguages.push('hi');
  }

  return {
    id: `tmdb_${mediaType}_${item.id}`,
    tmdbId: item.id,
    imdbId: item.external_ids?.imdb_id,
    title: title || 'Untitled',
    originalTitle,
    mediaType,
    releaseYear,
    releaseDate,
    netflixAddedDate: releaseDate, // TMDB does not have distinct added-to-catalog date, so default to release
    posterPath,
    backdropPath,
    rating: item.vote_average ? parseFloat(item.vote_average.toFixed(1)) : undefined,
    voteCount: item.vote_count,
    synopsis: item.overview,
    genres,
    countries,
    originalLanguage: origLang,
    audioLanguages,
    subtitleLanguages: ['en', 'hi'],
    runtimeMinutes: isMovie ? item.runtime : undefined,
    totalSeasons: !isMovie ? item.number_of_seasons : undefined,
    totalEpisodes: !isMovie ? item.number_of_episodes : undefined,
    averageEpisodeMinutes: !isMovie ? (item.episode_run_time?.[0] || 45) : undefined,
    isNetflixIndiaVerified: true, // Queried with watch_region=IN & watch_provider=8
    availabilitySource: 'TMDB (Watch Provider: Netflix India)',
  };
}

/**
 * Deduplication & Merging Engine:
 * Identity hierarchy:
 * 1. External ID (Netflix ID)
 * 2. IMDb ID
 * 3. TMDB ID
 * 4. Title + Release Year
 */
export function deduplicateDiscoveryTitles(titles: DiscoveryTitle[]): DiscoveryTitle[] {
  const map = new Map<string, DiscoveryTitle>();

  for (const item of titles) {
    // Generate primary lookup key following the identity hierarchy
    let key = '';
    if (item.imdbId && item.imdbId.startsWith('tt')) {
      key = `imdb_${item.imdbId}`;
    } else if (item.tmdbId) {
      key = `tmdb_${item.mediaType}_${item.tmdbId}`;
    } else if (item.netflixId) {
      key = `netflix_${item.netflixId}`;
    } else {
      key = `title_${createDuplicateKey(item.title)}_${item.releaseYear || '0'}`;
    }

    if (!map.has(key)) {
      map.set(key, { ...item });
    } else {
      // Merge records - keep best metadata
      const existing = map.get(key)!;
      existing.imdbRating = existing.imdbRating || item.imdbRating;
      existing.rottenTomatoesRating = existing.rottenTomatoesRating || item.rottenTomatoesRating;
      existing.posterPath = existing.posterPath || item.posterPath;
      existing.backdropPath = existing.backdropPath || item.backdropPath;
      existing.synopsis = existing.synopsis || item.synopsis;
      existing.runtimeMinutes = existing.runtimeMinutes || item.runtimeMinutes;
      existing.totalSeasons = existing.totalSeasons || item.totalSeasons;
      existing.totalEpisodes = existing.totalEpisodes || item.totalEpisodes;
      existing.cast = existing.cast || item.cast;
      existing.director = existing.director || item.director;
      existing.trailer = existing.trailer || item.trailer;
      existing.episodes = existing.episodes || item.episodes;
      existing.netflixId = existing.netflixId || item.netflixId;

      // Merge genres without duplicates
      const genreSet = new Set([...(existing.genres || []), ...(item.genres || [])]);
      existing.genres = Array.from(genreSet);

      // Merge countries without duplicates
      const countrySet = new Set([...(existing.countries || []), ...(item.countries || [])]);
      existing.countries = Array.from(countrySet);

      // Merge audio languages
      const audioSet = new Set([...(existing.audioLanguages || []), ...(item.audioLanguages || [])]);
      existing.audioLanguages = Array.from(audioSet);
    }
  }

  return Array.from(map.values());
}

export const WATCHMODE_BASE_URL = 'https://api.watchmode.com/v1';
export const DEFAULT_WATCHMODE_KEY =
  (typeof import.meta !== 'undefined' && (import.meta.env?.WATCHMODE_API_KEY || import.meta.env?.VITE_WATCHMODE_API_KEY)) ||
  'rrr2KWqilxrgo1CObODcAeOcsxa7QkYF2yLec9zK';

export interface WatchmodeStatusResponse {
  quota: number;
  quotaUsed: number;
}

export interface SyncProgressCallback {
  phase: 'idle' | 'fetching_watchmode' | 'deduplicating' | 'enriching_tmdb' | 'completed' | 'error';
  currentPage: number;
  totalPages: number;
  titlesDiscovered: number;
  metadataProcessed: number;
  totalToProcess: number;
  duplicatesRemoved: number;
  newTitlesAdded: number;
  titlesUpdated: number;
  markedUnavailable: number;
  message: string;
}

// Simple async sleep helper
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Checks Watchmode API account quota status
 */
export async function getWatchmodeQuotaStatus(apiKey?: string): Promise<WatchmodeStatusResponse | null> {
  const key = apiKey || DEFAULT_WATCHMODE_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${WATCHMODE_BASE_URL}/status/?apiKey=${encodeURIComponent(key)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('Failed to check Watchmode quota:', err);
    return null;
  }
}

/**
 * Fetch a single page from Watchmode list-titles endpoint with exponential backoff & 429 handling
 */
export async function fetchWatchmodePage(
  page: number,
  limit: number,
  apiKey: string,
  types?: 'movie' | 'tv_series'
): Promise<{
  titles: any[];
  page: number;
  total_pages: number;
  total_results: number;
}> {
  let attempt = 0;
  const maxAttempts = 3;
  const typeParam = types ? `&types=${encodeURIComponent(types)}` : '';

  while (attempt < maxAttempts) {
    attempt++;
    try {
      const url = `${WATCHMODE_BASE_URL}/list-titles/?apiKey=${encodeURIComponent(apiKey)}&source_ids=203&regions=IN${typeParam}&limit=${limit}&page=${page}`;
      const res = await fetch(url);

      if (res.status === 429) {
        // Rate limited - wait with exponential backoff
        const waitTime = Math.pow(2, attempt) * 1000;
        console.warn(`Watchmode 429 Rate Limit encountered on page ${page}. Waiting ${waitTime}ms...`);
        await sleep(waitTime);
        continue;
      }

      if (!res.ok) {
        throw new Error(`Watchmode HTTP ${res.status}: ${res.statusText}`);
      }

      return await res.json();
    } catch (err) {
      if (attempt >= maxAttempts) throw err;
      await sleep(1000 * attempt);
    }
  }

  throw new Error(`Failed fetching Watchmode page ${page} after ${maxAttempts} attempts`);
}

/**
 * Convert a raw Watchmode title item into initial DiscoveryTitle model
 */
export function normalizeWatchmodeToDiscovery(item: any): DiscoveryTitle {
  const isMovie = item.type === 'movie';
  const mediaType: 'movie' | 'tv' = isMovie ? 'movie' : 'tv';

  return {
    id: `wm_${item.id}`,
    watchmodeId: item.id,
    tmdbId: item.tmdb_id ? Number(item.tmdb_id) : undefined,
    imdbId: item.imdb_id || undefined,
    title: item.title || 'Untitled',
    originalTitle: item.title,
    mediaType,
    releaseYear: item.year || undefined,
    genres: [],
    countries: [],
    audioLanguages: [],
    subtitleLanguages: ['en', 'hi'],
    hindiAudio: null, // Strict null = unknown until verified
    englishAudio: null,
    hindiSubtitles: null,
    englishSubtitles: null,
    isNetflixIndiaVerified: true,
    netflixIndiaAvailable: true,
    availabilityState: 'available',
    availabilitySource: 'Watchmode (Netflix India)',
    catalogUpdatedAt: new Date().toISOString(),
  };
}

/**
 * Fetch detailed metadata from TMDB for a specific title with rate limit protection & caching
 */
export async function enrichTitleWithTMDB(
  titleItem: DiscoveryTitle,
  tmdbApiKey: string
): Promise<DiscoveryTitle> {
  const key = tmdbApiKey || DEFAULT_PUBLIC_TMDB_KEY;
  if (!key) return titleItem;

  // Check if we already have TMDB ID or can find by IMDb ID
  let tmdbId = titleItem.tmdbId;
  const isMovie = titleItem.mediaType === 'movie';
  const endpointType = isMovie ? 'movie' : 'tv';

  // 1. Resolve TMDB ID if missing but IMDb ID is present
  if (!tmdbId && titleItem.imdbId) {
    const findCacheKey = `tmdb_find_imdb_${titleItem.imdbId}`;
    let findData = await getCachedMetadata(findCacheKey);
    if (!findData) {
      try {
        const findUrl = `${TMDB_BASE_URL}/find/${encodeURIComponent(titleItem.imdbId)}?api_key=${key}&external_source=imdb_id`;
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

  // 2. Fallback: Search TMDB by Title + Year if ID still missing
  if (!tmdbId && titleItem.title) {
    const searchCacheKey = `tmdb_search_${titleItem.mediaType}_${encodeURIComponent(titleItem.title.toLowerCase())}_${titleItem.releaseYear || ''}`;
    let searchData = await getCachedMetadata(searchCacheKey);
    if (!searchData) {
      try {
        const yearParam = titleItem.releaseYear
          ? isMovie
            ? `&year=${titleItem.releaseYear}`
            : `&first_air_date_year=${titleItem.releaseYear}`
          : '';
        const searchUrl = `${TMDB_BASE_URL}/search/${endpointType}?api_key=${key}&query=${encodeURIComponent(titleItem.title)}${yearParam}`;
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
    return titleItem;
  }

  // 3. Fetch detailed TMDB metadata (with credits, videos, external_ids)
  const detailCacheKey = `tmdb_full_details_${endpointType}_${tmdbId}`;
  let detail = await getCachedMetadata(detailCacheKey);

  if (!detail) {
    try {
      let detailUrl = `${TMDB_BASE_URL}/${endpointType}/${tmdbId}?api_key=${key}&append_to_response=credits,videos,external_ids,watch/providers`;
      let res = await fetch(detailUrl);
      if (res.ok) {
        detail = await res.json();
      } else if (res.status === 404) {
        // ID might belong to alternative media type or might be invalid/Watchmode ID
        const altEndpoint = isMovie ? 'tv' : 'movie';
        const altUrl = `${TMDB_BASE_URL}/${altEndpoint}/${tmdbId}?api_key=${key}&append_to_response=credits,videos,external_ids,watch/providers`;
        const altRes = await fetch(altUrl);
        if (altRes.ok) {
          detail = await altRes.json();
        } else if (titleItem.title) {
          // Fallback: search by title across TMDB
          const sUrl = `${TMDB_BASE_URL}/search/${endpointType}?api_key=${key}&query=${encodeURIComponent(titleItem.title)}`;
          const sRes = await fetch(sUrl);
          if (sRes.ok) {
            const sData = await sRes.json();
            if (sData.results && sData.results.length > 0) {
              const matchedId = sData.results[0].id;
              const fUrl = `${TMDB_BASE_URL}/${endpointType}/${matchedId}?api_key=${key}&append_to_response=credits,videos,external_ids,watch/providers`;
              const fRes = await fetch(fUrl);
              if (fRes.ok) {
                detail = await fRes.json();
                tmdbId = matchedId;
              }
            }
          }
        }
      }
      if (detail) {
        await setCachedMetadata(detailCacheKey, detail);
      }
    } catch {
      // Ignore network errors during background enrichment
    }
  }

  if (!detail) {
    return {
      ...titleItem,
      tmdbId,
    };
  }

  // Extract Netflix ID automatically from watch/providers or external URLs
  let autoNetflixId = titleItem.netflixId;
  if (!autoNetflixId && detail['watch/providers']?.results) {
    const wpResults = detail['watch/providers'].results;
    const regionObj = wpResults.IN || wpResults.US || Object.values(wpResults)[0];
    const link = (regionObj as any)?.link;
    if (typeof link === 'string') {
      const match = link.match(/(?:title|watch)\/(\d{6,10})/);
      if (match && match[1]) {
        autoNetflixId = match[1];
      }
    }
  }

  // Extract genres and merge with any existing genres
  let genres: string[] = Array.isArray(detail.genres)
    ? detail.genres.map((g: any) => g.name).filter(Boolean)
    : (titleItem.genres || []);

  // Merge with existing titleItem genres so custom or seed tags are never lost
  if (Array.isArray(titleItem.genres)) {
    titleItem.genres.forEach((g) => {
      if (g && !genres.includes(g)) genres.push(g);
    });
  }

  // TV thriller inference in TMDB detail
  if (!isMovie && inferTvThrillerGenre(titleItem.title, genres, detail.overview || titleItem.synopsis)) {
    if (!genres.includes('Thriller')) {
      genres.push('Thriller');
    }
  }

  // Extract countries
  const rawCountries =
    detail.origin_country ||
    detail.production_countries?.map((c: any) => c.name || c.iso_3166_1) ||
    [];
  const countries = normalizeCountriesList(rawCountries);

  // Extract spoken languages
  const spokenLanguages: string[] = [];
  if (Array.isArray(detail.spoken_languages)) {
    detail.spoken_languages.forEach((l: any) => {
      if (l.iso_639_1) spokenLanguages.push(l.iso_639_1.toLowerCase());
    });
  }
  if (detail.original_language && !spokenLanguages.includes(detail.original_language.toLowerCase())) {
    spokenLanguages.push(detail.original_language.toLowerCase());
  }

  // Posters & backdrops
  const posterPath = detail.poster_path
    ? `https://image.tmdb.org/t/p/w500${detail.poster_path}`
    : titleItem.posterPath;
  const backdropPath = detail.backdrop_path
    ? `https://image.tmdb.org/t/p/w1280${detail.backdrop_path}`
    : titleItem.backdropPath;

  // Cast & crew
  const cast = Array.isArray(detail.credits?.cast)
    ? detail.credits.cast.slice(0, 8).map((c: any) => c.name).filter(Boolean)
    : titleItem.cast;

  let director = titleItem.director;
  if (isMovie && Array.isArray(detail.credits?.crew)) {
    const dirObj = detail.credits.crew.find((c: any) => c.job === 'Director');
    if (dirObj) director = dirObj.name;
  }

  let creator = titleItem.creator;
  if (!isMovie && Array.isArray(detail.created_by) && detail.created_by.length > 0) {
    creator = detail.created_by.map((c: any) => c.name).join(', ');
  }

  // Trailer
  const trailer = selectBestTrailer(detail.videos?.results || []);

  // Strict language analysis (No guessing!)
  const normTitle = normalizeTitle(titleItem.title);
  const isKnownHindiDub = NETFLIX_HINDI_DUBBED_TITLES.has(normTitle);
  const origLang = (detail.original_language || titleItem.originalLanguage || '').toLowerCase();

  let hindiAudio: boolean | null = null;
  if (origLang === 'hi' || isKnownHindiDub) {
    hindiAudio = true;
    if (!spokenLanguages.includes('hi')) spokenLanguages.push('hi');
  }

  let englishAudio: boolean | null = null;
  if (origLang === 'en' || spokenLanguages.includes('en')) {
    englishAudio = true;
  }

  return {
    ...titleItem,
    tmdbId,
    netflixId: autoNetflixId || titleItem.netflixId,
    imdbId: titleItem.imdbId || detail.external_ids?.imdb_id || detail.imdb_id,
    originalTitle: isMovie ? detail.original_title : detail.original_name,
    releaseDate: isMovie ? detail.release_date : detail.first_air_date,
    releaseYear: titleItem.releaseYear || (isMovie ? detail.release_date?.slice(0, 4) : detail.first_air_date?.slice(0, 4)),
    posterPath,
    backdropPath,
    rating: detail.vote_average ? parseFloat(detail.vote_average.toFixed(1)) : titleItem.rating,
    voteCount: detail.vote_count || titleItem.voteCount,
    synopsis: detail.overview || titleItem.synopsis,
    genres: genres.length > 0 ? genres : titleItem.genres,
    countries: countries.length > 0 ? countries : titleItem.countries,
    originalLanguage: origLang || titleItem.originalLanguage,
    audioLanguages: spokenLanguages.length > 0 ? spokenLanguages : titleItem.audioLanguages,
    hindiAudio,
    englishAudio,
    runtimeMinutes: isMovie ? detail.runtime : titleItem.runtimeMinutes,
    totalSeasons: !isMovie ? detail.number_of_seasons : titleItem.totalSeasons,
    totalEpisodes: !isMovie ? detail.number_of_episodes : titleItem.totalEpisodes,
    averageEpisodeMinutes: !isMovie ? (detail.episode_run_time?.[0] || 45) : undefined,
    trailer: trailer || titleItem.trailer,
    cast: cast && cast.length > 0 ? cast : titleItem.cast,
    director,
    creator,
    metadataUpdatedAt: new Date().toISOString(),
  };
}

/**
 * Full Pipeline: Sync Netflix India catalogue from Watchmode into local IndexedDB
 * Follows documented Watchmode pagination (limit=250), deduplicates, updates availability states,
 * and enriches missing metadata with TMDB using concurrency control.
 */
export async function syncNetflixIndiaCatalog(options: {
  watchmodeApiKey?: string;
  tmdbApiKey?: string;
  existingTitles: DiscoveryTitle[];
  onProgress: (p: SyncProgressCallback) => void;
  onBatchEnriched?: (batch: DiscoveryTitle[]) => void;
  maxMovies?: number; // Optional limit for movies
  maxTvShows?: number; // Optional limit for TV series
  maxPagesToSync?: number; // Optional cap
}): Promise<{
  allTitles: DiscoveryTitle[];
  newTitlesAdded: number;
  titlesUpdated: number;
  markedUnavailable: number;
  duplicatesRemoved: number;
}> {
  const wmKey = options.watchmodeApiKey || DEFAULT_WATCHMODE_KEY;
  const tmdbKey = options.tmdbApiKey || DEFAULT_PUBLIC_TMDB_KEY;

  if (!wmKey) {
    throw new Error('Watchmode API Key is required for streaming availability verification.');
  }

  const { onProgress, onBatchEnriched } = options;
  const existingMap = new Map<string, DiscoveryTitle>();

  // Index existing titles by primary identity hierarchy
  for (const t of options.existingTitles) {
    if (t.watchmodeId) existingMap.set(`wm_${t.watchmodeId}`, t);
    if (t.imdbId) existingMap.set(`imdb_${t.imdbId}`, t);
    if (t.tmdbId) existingMap.set(`tmdb_${t.mediaType}_${t.tmdbId}`, t);
    existingMap.set(`title_${createDuplicateKey(t.title)}_${t.releaseYear || '0'}`, t);
  }

  onProgress({
    phase: 'fetching_watchmode',
    currentPage: 0,
    totalPages: 1,
    titlesDiscovered: 0,
    metadataProcessed: 0,
    totalToProcess: 0,
    duplicatesRemoved: 0,
    newTitlesAdded: 0,
    titlesUpdated: 0,
    markedUnavailable: 0,
    message: 'Connecting to Watchmode Netflix India catalog...',
  });

  const rawDiscoveredList: DiscoveryTitle[] = [];
  const discoveredIds = new Set<string>();

  // Determine fetch strategy based on user requests:
  // If user specified separate counts for movies or tv shows, query them specifically!
  const hasSpecificCounts = options.maxMovies !== undefined || options.maxTvShows !== undefined;

  if (hasSpecificCounts) {
    const fetchTasks: Array<{ type: 'movie' | 'tv_series'; limit: number; label: string }> = [];
    if (options.maxMovies !== undefined && options.maxMovies > 0) {
      fetchTasks.push({ type: 'movie', limit: options.maxMovies, label: 'Movies' });
    }
    if (options.maxTvShows !== undefined && options.maxTvShows > 0) {
      fetchTasks.push({ type: 'tv_series', limit: options.maxTvShows, label: 'TV Shows' });
    }

    for (const task of fetchTasks) {
      let fetchedForType = 0;
      let page = 1;
      let totalPagesForType = 1;

      while (fetchedForType < task.limit && page <= totalPagesForType) {
        const pageSize = Math.min(250, task.limit - fetchedForType);
        const data = await fetchWatchmodePage(page, pageSize, wmKey, task.type);
        totalPagesForType = data.total_pages || 1;

        if (Array.isArray(data.titles)) {
          for (const raw of data.titles) {
            if (fetchedForType >= task.limit) break;
            const titleItem = normalizeWatchmodeToDiscovery(raw);
            rawDiscoveredList.push(titleItem);
            discoveredIds.add(titleItem.id);
            if (titleItem.imdbId) discoveredIds.add(`imdb_${titleItem.imdbId}`);
            if (titleItem.tmdbId) discoveredIds.add(`tmdb_${titleItem.mediaType}_${titleItem.tmdbId}`);
            fetchedForType++;
          }
        }

        onProgress({
          phase: 'fetching_watchmode',
          currentPage: page,
          totalPages: totalPagesForType,
          titlesDiscovered: rawDiscoveredList.length,
          metadataProcessed: 0,
          totalToProcess: rawDiscoveredList.length,
          duplicatesRemoved: 0,
          newTitlesAdded: 0,
          titlesUpdated: 0,
          markedUnavailable: 0,
          message: `Fetching Netflix India ${task.label}... ${fetchedForType} / ${task.limit}`,
        });

        page++;
        await sleep(200);
      }
    }
  } else {
    // Standard full catalogue sync
    const PAGE_LIMIT = 250;
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      if (options.maxPagesToSync && page > options.maxPagesToSync) break;

      const data = await fetchWatchmodePage(page, PAGE_LIMIT, wmKey);
      totalPages = data.total_pages || 1;

      if (Array.isArray(data.titles)) {
        for (const raw of data.titles) {
          const titleItem = normalizeWatchmodeToDiscovery(raw);
          rawDiscoveredList.push(titleItem);
          discoveredIds.add(titleItem.id);
          if (titleItem.imdbId) discoveredIds.add(`imdb_${titleItem.imdbId}`);
          if (titleItem.tmdbId) discoveredIds.add(`tmdb_${titleItem.mediaType}_${titleItem.tmdbId}`);
        }
      }

      onProgress({
        phase: 'fetching_watchmode',
        currentPage: page,
        totalPages,
        titlesDiscovered: rawDiscoveredList.length,
        metadataProcessed: 0,
        totalToProcess: rawDiscoveredList.length,
        duplicatesRemoved: 0,
        newTitlesAdded: 0,
        titlesUpdated: 0,
        markedUnavailable: 0,
        message: `Syncing Netflix India... Page ${page} / ${totalPages} (${rawDiscoveredList.length} titles discovered)`,
      });

      page++;
      await sleep(250);
    }
  }

  // 2. Deduplicate Discovered Titles
  onProgress({
    phase: 'deduplicating',
    currentPage: 1,
    totalPages: 1,
    titlesDiscovered: rawDiscoveredList.length,
    metadataProcessed: 0,
    totalToProcess: rawDiscoveredList.length,
    duplicatesRemoved: 0,
    newTitlesAdded: 0,
    titlesUpdated: 0,
    markedUnavailable: 0,
    message: 'Deduplicating titles against identity hierarchy...',
  });

  const deduplicatedDiscovered = deduplicateDiscoveryTitles(rawDiscoveredList);
  const duplicatesRemoved = rawDiscoveredList.length - deduplicatedDiscovered.length;

  // 3. Incremental Merge against Existing Database
  let newTitlesAdded = 0;
  let titlesUpdated = 0;
  let markedUnavailable = 0;

  const mergedTitlesMap = new Map<string, DiscoveryTitle>();

  // Seed with all existing titles first if doing partial sync
  if (hasSpecificCounts) {
    for (const t of options.existingTitles) {
      mergedTitlesMap.set(t.id, t);
    }
  }

  // Add all deduplicated newly discovered titles
  for (const item of deduplicatedDiscovered) {
    let existing: DiscoveryTitle | undefined;
    if (item.watchmodeId && existingMap.has(`wm_${item.watchmodeId}`)) {
      existing = existingMap.get(`wm_${item.watchmodeId}`);
    } else if (item.imdbId && existingMap.has(`imdb_${item.imdbId}`)) {
      existing = existingMap.get(`imdb_${item.imdbId}`);
    } else if (item.tmdbId && existingMap.has(`tmdb_${item.mediaType}_${item.tmdbId}`)) {
      existing = existingMap.get(`tmdb_${item.mediaType}_${item.tmdbId}`);
    } else {
      const titleKey = `title_${createDuplicateKey(item.title)}_${item.releaseYear || '0'}`;
      if (existingMap.has(titleKey)) {
        existing = existingMap.get(titleKey);
      }
    }

    if (existing) {
      const merged: DiscoveryTitle = {
        ...existing,
        ...item,
        posterPath: existing.posterPath || item.posterPath,
        backdropPath: existing.backdropPath || item.backdropPath,
        synopsis: existing.synopsis || item.synopsis,
        genres: existing.genres.length > 0 ? existing.genres : item.genres,
        countries: existing.countries.length > 0 ? existing.countries : item.countries,
        audioLanguages: existing.audioLanguages && existing.audioLanguages.length > 0 ? existing.audioLanguages : item.audioLanguages,
        rating: existing.rating || item.rating,
        imdbRating: existing.imdbRating || item.imdbRating,
        rottenTomatoesRating: existing.rottenTomatoesRating || item.rottenTomatoesRating,
        runtimeMinutes: existing.runtimeMinutes || item.runtimeMinutes,
        totalSeasons: existing.totalSeasons || item.totalSeasons,
        totalEpisodes: existing.totalEpisodes || item.totalEpisodes,
        cast: existing.cast || item.cast,
        director: existing.director || item.director,
        netflixId: existing.netflixId || item.netflixId,
        trailer: existing.trailer || item.trailer,
        isNetflixIndiaVerified: true,
        netflixIndiaAvailable: true,
        availabilityState: 'available',
        catalogUpdatedAt: new Date().toISOString(),
      };
      mergedTitlesMap.set(merged.id, merged);
      titlesUpdated++;
    } else {
      mergedTitlesMap.set(item.id, item);
      newTitlesAdded++;
    }
  }

  // Only perform soft-delete when syncing full catalogue (not selective partial sync)
  if (!hasSpecificCounts) {
    for (const oldItem of options.existingTitles) {
      if (!mergedTitlesMap.has(oldItem.id)) {
        const wasDiscovered =
          (oldItem.watchmodeId && discoveredIds.has(`wm_${oldItem.watchmodeId}`)) ||
          (oldItem.imdbId && discoveredIds.has(`imdb_${oldItem.imdbId}`)) ||
          (oldItem.tmdbId && discoveredIds.has(`tmdb_${oldItem.mediaType}_${oldItem.tmdbId}`));

        if (!wasDiscovered) {
          mergedTitlesMap.set(oldItem.id, {
            ...oldItem,
            netflixIndiaAvailable: false,
            availabilityState: 'no_longer_available',
            catalogUpdatedAt: new Date().toISOString(),
          });
          markedUnavailable++;
        }
      }
    }
  }

  const allMergedTitles = Array.from(mergedTitlesMap.values());

  // Save discovered/merged batch immediately so UI can display initial batch
  await saveDiscoveryTitles(allMergedTitles);
  if (onBatchEnriched) {
    onBatchEnriched(allMergedTitles);
  }

  // 4. Batch TMDB Metadata Enrichment with Concurrency Control
  // Only enrich titles that have missing posters or missing synopsis or missing genres
  const toEnrich = allMergedTitles.filter(
    (t) => t.availabilityState === 'available' && (!t.posterPath || !t.synopsis || t.genres.length === 0)
  );

  let metadataProcessed = 0;
  const totalToEnrich = toEnrich.length;
  const CONCURRENCY = 4; // Controlled concurrency to respect TMDB rate limits

  for (let i = 0; i < toEnrich.length; i += CONCURRENCY) {
    const chunk = toEnrich.slice(i, i + CONCURRENCY);
    const enrichedChunk = await Promise.all(
      chunk.map(async (titleItem) => {
        try {
          const enriched = await enrichTitleWithTMDB(titleItem, tmdbKey);
          mergedTitlesMap.set(enriched.id, enriched);
          return enriched;
        } catch (err) {
          console.warn('Metadata enrichment error for', titleItem.title, err);
          return titleItem;
        } finally {
          metadataProcessed++;
        }
      })
    );

    // Save progressively to IndexedDB and update live UI immediately as each chunk finishes!
    await saveDiscoveryTitles(enrichedChunk);
    if (onBatchEnriched) {
      onBatchEnriched(Array.from(mergedTitlesMap.values()));
    }

    onProgress({
      phase: 'enriching_tmdb',
      currentPage: 1,
      totalPages: 1,
      titlesDiscovered: deduplicatedDiscovered.length,
      metadataProcessed,
      totalToProcess: totalToEnrich,
      duplicatesRemoved,
      newTitlesAdded,
      titlesUpdated,
      markedUnavailable,
      message: `Enriching TMDB metadata... ${metadataProcessed} / ${totalToEnrich} titles processed (showing completed)`,
    });

    // Small delay to protect TMDB rate limit
    await sleep(120);
  }

  const finalTitles = Array.from(mergedTitlesMap.values());
  await saveDiscoveryTitles(finalTitles);

  onProgress({
    phase: 'completed',
    currentPage: 1,
    totalPages: 1,
    titlesDiscovered: deduplicatedDiscovered.length,
    metadataProcessed,
    totalToProcess: totalToEnrich,
    duplicatesRemoved,
    newTitlesAdded,
    titlesUpdated,
    markedUnavailable,
    message: `Sync complete! ${finalTitles.length} titles in local database.`,
  });

  return {
    allTitles: finalTitles,
    newTitlesAdded,
    titlesUpdated,
    markedUnavailable,
    duplicatesRemoved,
  };
}

/**
 * Fetch Netflix India catalog via TMDB discover API with provider=8 & region=IN (Fallback / On-demand browsing)
 */
export async function fetchNetflixIndiaDiscovery(
  options: {
    page?: number;
    mediaType?: 'all' | 'movie' | 'tv';
    apiKey?: string;
    omdbApiKey?: string;
    watchmodeApiKey?: string;
    pagesToFetch?: number;
    forceRefresh?: boolean;
  } = {}
): Promise<{ titles: DiscoveryTitle[]; totalResults: number; totalPages: number }> {
  const startPage = options.page || 1;
  const numPages = options.pagesToFetch || 3;
  const apiKey = options.apiKey || DEFAULT_PUBLIC_TMDB_KEY;
  const cacheKey = `discovery_in_p${startPage}_n${numPages}_${options.mediaType || 'all'}_v4`;

  // Check cache first if not forced refresh
  if (!options.forceRefresh) {
    const cached = await getCachedMetadata(cacheKey);
    if (cached && Array.isArray(cached.titles) && cached.titles.length > 25) {
      return cached;
    }
  }

  const fetchedTitles: DiscoveryTitle[] = [];
  let reportedTotalResults = 0;
  let reportedTotalPages = 0;

  try {
    const fetchPromises: Promise<any>[] = [];

    for (let p = startPage; p < startPage + numPages; p++) {
      const pageNum = p;

      if (options.mediaType === 'all' || options.mediaType === 'movie') {
        // General top popular movies on Netflix India
        const movieUrl = `${TMDB_BASE_URL}/discover/movie?api_key=${apiKey}&watch_region=IN&with_watch_providers=8&sort_by=popularity.desc&page=${pageNum}`;
        fetchPromises.push(
          fetch(movieUrl)
            .then((r) => (r.ok ? r.json() : { results: [], total_results: 0, total_pages: 0 }))
            .then((d) => {
              if (d.total_results) reportedTotalResults = Math.max(reportedTotalResults, d.total_results);
              if (d.total_pages) reportedTotalPages = Math.max(reportedTotalPages, d.total_pages);
              return (d.results || []).map((m: any) => {
                const norm = normalizeTmdbToDiscovery(m, 'movie');
                norm.netflixIndiaAvailable = true;
                norm.availabilityState = 'available';
                return norm;
              });
            })
            .catch(() => [])
        );

        // Targeted Thriller query (Genre ID 53) to ensure rich Thriller genre coverage
        if (p === startPage) {
          const thrillerMovieUrl = `${TMDB_BASE_URL}/discover/movie?api_key=${apiKey}&watch_region=IN&with_watch_providers=8&with_genres=53&sort_by=popularity.desc&page=1`;
          fetchPromises.push(
            fetch(thrillerMovieUrl)
              .then((r) => (r.ok ? r.json() : { results: [] }))
              .then((d) => {
                return (d.results || []).map((m: any) => {
                  const norm = normalizeTmdbToDiscovery(m, 'movie');
                  norm.netflixIndiaAvailable = true;
                  norm.availabilityState = 'available';
                  if (!norm.genres.includes('Thriller')) norm.genres.push('Thriller');
                  return norm;
                });
              })
              .catch(() => [])
          );
        }
      }

      if (options.mediaType === 'all' || options.mediaType === 'tv') {
        // General top TV shows on Netflix India
        const tvUrl = `${TMDB_BASE_URL}/discover/tv?api_key=${apiKey}&watch_region=IN&with_watch_providers=8&sort_by=popularity.desc&page=${pageNum}`;
        fetchPromises.push(
          fetch(tvUrl)
            .then((r) => (r.ok ? r.json() : { results: [], total_results: 0, total_pages: 0 }))
            .then((d) => {
              if (d.total_results) reportedTotalResults = Math.max(reportedTotalResults, d.total_results);
              if (d.total_pages) reportedTotalPages = Math.max(reportedTotalPages, d.total_pages);
              return (d.results || []).map((t: any) => {
                const norm = normalizeTmdbToDiscovery(t, 'tv');
                norm.netflixIndiaAvailable = true;
                norm.availabilityState = 'available';
                return norm;
              });
            })
            .catch(() => [])
        );

        // Targeted Crime/Mystery TV query (Genre IDs 80, 9648) to infer TV Thrillers & Crime series
        if (p === startPage) {
          const suspenseTvUrl = `${TMDB_BASE_URL}/discover/tv?api_key=${apiKey}&watch_region=IN&with_watch_providers=8&with_genres=80|9648&sort_by=popularity.desc&page=1`;
          fetchPromises.push(
            fetch(suspenseTvUrl)
              .then((r) => (r.ok ? r.json() : { results: [] }))
              .then((d) => {
                return (d.results || []).map((t: any) => {
                  const norm = normalizeTmdbToDiscovery(t, 'tv');
                  norm.netflixIndiaAvailable = true;
                  norm.availabilityState = 'available';
                  if (!norm.genres.includes('Thriller')) norm.genres.push('Thriller');
                  return norm;
                });
              })
              .catch(() => [])
          );
        }
      }
    }

    const results = await Promise.all(fetchPromises);
    results.forEach((list) => fetchedTitles.push(...list));
  } catch (err) {
    console.warn('Discovery TMDB fetch encountered an issue:', err);
  }

  const deduplicated = deduplicateDiscoveryTitles(fetchedTitles);

  const result = {
    titles: deduplicated,
    totalResults: reportedTotalResults || 4500,
    totalPages: reportedTotalPages || 250,
  };

  if (deduplicated.length > 0) {
    await setCachedMetadata(cacheKey, result);
  }
  return result;
}

/**
 * Rapid Initial Dynamic Load:
 * Fetches page 1 of Netflix India from Watchmode (50 titles),
 * and enriches them with TMDB posters/metadata in parallel so Discovery
 * renders a verified Netflix India catalog immediately.
 */
export async function fetchInitialWatchmodeDiscovery(options: {
  watchmodeApiKey?: string;
  tmdbApiKey?: string;
  limit?: number;
}): Promise<DiscoveryTitle[]> {
  const wmKey = options.watchmodeApiKey || DEFAULT_WATCHMODE_KEY;
  const tmdbKey = options.tmdbApiKey || DEFAULT_PUBLIC_TMDB_KEY;
  const limit = options.limit || 50;

  try {
    const wmPage = await fetchWatchmodePage(1, limit, wmKey);
    if (!wmPage || !Array.isArray(wmPage.titles) || wmPage.titles.length === 0) {
      return [];
    }

    const initialTitles = wmPage.titles.map((raw) => normalizeWatchmodeToDiscovery(raw));
    const deduplicated = deduplicateDiscoveryTitles(initialTitles);

    // Enrich with TMDB metadata (poster, backdrop, synopsis, genres) in small concurrent batches
    const CONCURRENCY = 5;
    const enrichedList: DiscoveryTitle[] = [];

    for (let i = 0; i < deduplicated.length; i += CONCURRENCY) {
      const chunk = deduplicated.slice(i, i + CONCURRENCY);
      const enrichedChunk = await Promise.all(
        chunk.map(async (t) => {
          try {
            return await enrichTitleWithTMDB(t, tmdbKey);
          } catch {
            return t;
          }
        })
      );
      enrichedList.push(...enrichedChunk);
    }

    return enrichedList;
  } catch (err) {
    console.warn('fetchInitialWatchmodeDiscovery failed, falling back to TMDB discover:', err);
    return [];
  }
}


