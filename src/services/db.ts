import { openDB, IDBPDatabase } from 'idb';
import { AppSettings, LibraryItem, DiscoveryTitle } from '../types';

const DB_NAME = 'NetflixWatchlistDB';
const DB_VERSION = 3;

export const DEFAULT_SETTINGS: AppSettings = {
  tmdbApiKey: 'ec3ae1f9fde58cd94e4297c4cb3b77de',
  omdbApiKey: '',
  watchmodeApiKey: '1VFSlNDS4wbjnZ16DOQkRPuc95swe4qnxZazWn17',
  capSeriesEpisodes: false, // Default: uncapped!
  maxEpisodesPerSeries: 10,
  playbackSpeed: 2.0, // Default home usage speed
  gymSpeed: 1.5,      // Default gym / cardio speed
  mealSpeed: 1.5,     // Default meal / lunch speed
  dailyViewingHours: 1.0,
  gymSessionsPerDay: 1.0,
  gymHoursPerSession: 1.0,
  mealDailyHours: 0.0,
  enableGymMode: false,
};

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains('library')) {
          const libraryStore = db.createObjectStore('library', { keyPath: 'id' });
          libraryStore.createIndex('normalizedTitle', 'normalizedTitle', { unique: false });
          libraryStore.createIndex('status', 'status', { unique: false });
          libraryStore.createIndex('mediaType', 'mediaType', { unique: false });
        }
        if (!db.objectStoreNames.contains('metadata_cache')) {
          db.createObjectStore('metadata_cache', { keyPath: 'cacheKey' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('thumbnail_cache')) {
          db.createObjectStore('thumbnail_cache', { keyPath: 'url' });
        }
        if (!db.objectStoreNames.contains('discovery_catalog')) {
          const discoveryStore = db.createObjectStore('discovery_catalog', { keyPath: 'id' });
          discoveryStore.createIndex('watchmodeId', 'watchmodeId', { unique: false });
          discoveryStore.createIndex('tmdbId', 'tmdbId', { unique: false });
          discoveryStore.createIndex('imdbId', 'imdbId', { unique: false });
          discoveryStore.createIndex('availabilityState', 'availabilityState', { unique: false });
          discoveryStore.createIndex('mediaType', 'mediaType', { unique: false });
        }
        if (!db.objectStoreNames.contains('discovery_meta')) {
          db.createObjectStore('discovery_meta', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

// Library operations
export function normalizeLibraryItem(item: LibraryItem): LibraryItem {
  let viewingStatus = item.viewingStatus;
  if (!viewingStatus) {
    if (item.isCompleted) {
      viewingStatus = 'completed';
    } else if (item.droppedReason || item.droppedAt) {
      viewingStatus = 'dropped';
    } else if (item.progress && item.progress.percentage > 0) {
      viewingStatus = 'still_watching';
    } else {
      viewingStatus = 'unwatched';
    }
  }

  return {
    ...item,
    viewingStatus,
    genres: item.genres || [],
    countries: item.countries || [],
  };
}

export async function getAllLibraryItems(): Promise<LibraryItem[]> {
  try {
    const db = await getDB();
    const items: LibraryItem[] = await db.getAll('library');
    return items.map(normalizeLibraryItem);
  } catch (err) {
    console.error('Failed to get items from IDB:', err);
    // Fallback to localStorage if IDB fails
    const raw = localStorage.getItem('netflix_watchlist_items');
    const items: LibraryItem[] = raw ? JSON.parse(raw) : [];
    return items.map(normalizeLibraryItem);
  }
}

export async function deleteLibraryItem(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('library', id);
  } catch (err) {
    console.error('Failed to delete item from IDB:', err);
  }
  const current = await getAllLibraryItems();
  const filtered = current.filter((x) => x.id !== id);
  try {
    localStorage.setItem('netflix_watchlist_items', JSON.stringify(filtered));
  } catch {}
}

export async function saveLibraryItems(items: LibraryItem[]): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction('library', 'readwrite');
    for (const item of items) {
      await tx.store.put(item);
    }
    await tx.done;
  } catch (err) {
    console.error('Failed to save items to IDB:', err);
  }
  // Also backup to localStorage
  try {
    localStorage.setItem('netflix_watchlist_items', JSON.stringify(items));
  } catch {
    // quota exceeded or ignore
  }
}

export async function updateLibraryItem(item: LibraryItem): Promise<void> {
  try {
    const db = await getDB();
    await db.put('library', item);
  } catch (err) {
    console.error('Failed to update item in IDB:', err);
  }
  const current = await getAllLibraryItems();
  const idx = current.findIndex((x) => x.id === item.id);
  if (idx >= 0) {
    current[idx] = item;
    try {
      localStorage.setItem('netflix_watchlist_items', JSON.stringify(current));
    } catch {}
  }
}

export async function clearLibrary(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear('library');
  } catch (err) {
    console.error('Failed to clear IDB:', err);
  }
  localStorage.removeItem('netflix_watchlist_items');
}

// Settings operations
export async function getSettings(): Promise<AppSettings> {
  try {
    const db = await getDB();
    const stored = await db.get('settings', 'app_settings');
    if (stored && stored.value) {
      const loaded = { ...DEFAULT_SETTINGS, ...stored.value };
      if (!loaded.watchmodeApiKey || loaded.watchmodeApiKey === 'rrr2KWqilxrgo1CObODcAeOcsxa7QkYF2yLec9zK') {
        loaded.watchmodeApiKey = DEFAULT_SETTINGS.watchmodeApiKey;
        await db.put('settings', { key: 'app_settings', value: loaded });
        try {
          localStorage.setItem('netflix_watchlist_settings', JSON.stringify(loaded));
        } catch {}
      }
      return loaded;
    }
  } catch (err) {
    console.error('Failed to get settings from IDB:', err);
  }

  const raw = localStorage.getItem('netflix_watchlist_settings');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const loaded = { ...DEFAULT_SETTINGS, ...parsed };
      if (!loaded.watchmodeApiKey || loaded.watchmodeApiKey === 'rrr2KWqilxrgo1CObODcAeOcsxa7QkYF2yLec9zK') {
        loaded.watchmodeApiKey = DEFAULT_SETTINGS.watchmodeApiKey;
        localStorage.setItem('netflix_watchlist_settings', JSON.stringify(loaded));
      }
      return loaded;
    } catch {}
  }
  return { ...DEFAULT_SETTINGS };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    const db = await getDB();
    await db.put('settings', { key: 'app_settings', value: settings });
  } catch (err) {
    console.error('Failed to save settings to IDB:', err);
  }
  try {
    localStorage.setItem('netflix_watchlist_settings', JSON.stringify(settings));
  } catch {}
}

// API Cache operations
export async function getCachedMetadata(cacheKey: string): Promise<any | null> {
  try {
    const db = await getDB();
    const entry = await db.get('metadata_cache', cacheKey);
    if (entry && Date.now() - entry.timestamp < 1000 * 60 * 60 * 24 * 7) {
      // 7 days valid
      return entry.data;
    }
  } catch {}
  return null;
}

export async function setCachedMetadata(cacheKey: string, data: any): Promise<void> {
  try {
    const db = await getDB();
    await db.put('metadata_cache', {
      cacheKey,
      data,
      timestamp: Date.now(),
    });
  } catch {}
}

export async function getAllCachedMetadata(): Promise<Array<{ cacheKey: string; data: any; timestamp: number }>> {
  try {
    const db = await getDB();
    return await db.getAll('metadata_cache');
  } catch {
    return [];
  }
}

export async function restoreCachedMetadata(entries: Array<{ cacheKey: string; data: any; timestamp: number }>): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction('metadata_cache', 'readwrite');
    for (const item of entries) {
      if (item.cacheKey && item.data) {
        tx.store.put(item);
      }
    }
    await tx.done;
  } catch (err) {
    console.warn('Failed restoring metadata cache:', err);
  }
}

// Image Thumbnail Cache operations
export async function getCachedThumbnail(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const db = await getDB();
    const entry = await db.get('thumbnail_cache', url);
    if (entry && entry.dataUrl) {
      return entry.dataUrl;
    }
  } catch {}
  return null;
}

export async function setCachedThumbnail(url: string, dataUrl: string): Promise<void> {
  if (!url || !dataUrl) return;
  try {
    const db = await getDB();
    await db.put('thumbnail_cache', {
      url,
      dataUrl,
      cachedAt: Date.now(),
    });
  } catch {}
}

export async function getAllCachedThumbnails(): Promise<Record<string, string>> {
  try {
    const db = await getDB();
    const all = await db.getAll('thumbnail_cache');
    const result: Record<string, string> = {};
    for (const item of all) {
      if (item.url && item.dataUrl) {
        result[item.url] = item.dataUrl;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export async function restoreCachedThumbnails(thumbnails: Record<string, string>): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction('thumbnail_cache', 'readwrite');
    for (const [url, dataUrl] of Object.entries(thumbnails)) {
      if (url && dataUrl) {
        tx.store.put({
          url,
          dataUrl,
          cachedAt: Date.now(),
        });
      }
    }
    await tx.done;
  } catch (err) {
    console.warn('Failed restoring thumbnail cache:', err);
  }
}

// Discovery Catalog Operations (Watchmode + TMDB unified persistence)
export async function getAllDiscoveryTitles(): Promise<DiscoveryTitle[]> {
  try {
    const db = await getDB();
    if (!db.objectStoreNames.contains('discovery_catalog')) return [];
    return await db.getAll('discovery_catalog');
  } catch (err) {
    console.error('Failed to get discovery titles from IDB:', err);
    return [];
  }
}

export async function saveDiscoveryTitles(titles: DiscoveryTitle[]): Promise<void> {
  if (!titles || titles.length === 0) return;
  try {
    const db = await getDB();
    if (!db.objectStoreNames.contains('discovery_catalog')) return;
    const tx = db.transaction('discovery_catalog', 'readwrite');
    for (const title of titles) {
      if (title && title.id) {
        await tx.store.put(title);
      }
    }
    await tx.done;
  } catch (err) {
    console.error('Failed to save discovery titles to IDB:', err);
  }
}

export async function updateDiscoveryTitle(title: DiscoveryTitle): Promise<void> {
  if (!title || !title.id) return;
  try {
    const db = await getDB();
    if (!db.objectStoreNames.contains('discovery_catalog')) return;
    await db.put('discovery_catalog', title);
  } catch (err) {
    console.error('Failed to update discovery title in IDB:', err);
  }
}

export async function getDiscoveryCatalogMeta(): Promise<{
  lastSync?: string;
  totalAvailable?: number;
  totalTitles?: number;
  watchmodeQuota?: number;
  watchmodeQuotaUsed?: number;
} | null> {
  try {
    const db = await getDB();
    if (!db.objectStoreNames.contains('discovery_meta')) return null;
    const res = await db.get('discovery_meta', 'catalog_sync_meta');
    return res ? res.data : null;
  } catch {
    return null;
  }
}

export async function setDiscoveryCatalogMeta(data: any): Promise<void> {
  try {
    const db = await getDB();
    if (!db.objectStoreNames.contains('discovery_meta')) return;
    await db.put('discovery_meta', {
      key: 'catalog_sync_meta',
      data,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.warn('Failed to set discovery catalog meta:', err);
  }
}
