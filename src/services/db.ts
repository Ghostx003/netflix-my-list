import { openDB, IDBPDatabase } from 'idb';
import { AppSettings, LibraryItem } from '../types';

const DB_NAME = 'NetflixWatchlistDB';
const DB_VERSION = 1;

export const DEFAULT_SETTINGS: AppSettings = {
  tmdbApiKey: '',
  omdbApiKey: '',
  capSeriesEpisodes: false, // Default: uncapped!
  maxEpisodesPerSeries: 10,
  playbackSpeed: 1.5,
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
      upgrade(db) {
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
      return { ...DEFAULT_SETTINGS, ...stored.value };
    }
  } catch (err) {
    console.error('Failed to get settings from IDB:', err);
  }

  const raw = localStorage.getItem('netflix_watchlist_settings');
  if (raw) {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
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
