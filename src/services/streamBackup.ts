import { LibraryItem, AppSettings, BackupData, DiscoveryTitle } from '../types';
import {
  clearLibrary,
  saveLibraryItems,
  saveSettings,
  normalizeLibraryItem,
  restoreCachedMetadata,
  restoreCachedThumbnails,
  saveDiscoveryTitles,
  setDiscoveryCatalogMeta,
  getAllLibraryItems,
} from './db';
import { createDuplicateKey } from './normalizer';

export interface StreamImportProgress {
  phase: 'reading' | 'restoring' | 'completed';
  percent: number;
  message: string;
}

export interface StreamBackupSummary {
  version: number;
  exportedAt: string;
  items: LibraryItem[];
  settings: AppSettings | null;
  metadataCacheCount: number;
  cachedThumbnailsCount: number;
  discoveryCatalogCount: number;
  discoveryMeta: any;
  fileSize: number;
  // If small file, holds parsed full data
  fullBackupData?: BackupData;
}

/**
 * Parses any backup file (even 500MB - 1GB+) by reading stream chunks.
 * Yields periodically to the browser's event loop so the page never freezes.
 */
export async function readBackupFileStreaming(
  file: File,
  onProgress?: (p: StreamImportProgress) => void
): Promise<StreamBackupSummary> {
  const fileSize = file.size;
  const yieldTick = () => new Promise<void>((r) => setTimeout(r, 0));

  // If file is relatively small (< 25MB), use fast direct text reading
  if (fileSize < 25 * 1024 * 1024) {
    onProgress?.({ phase: 'reading', percent: 50, message: 'Reading backup file...' });
    const text = await file.text();
    onProgress?.({ phase: 'reading', percent: 90, message: 'Parsing backup data...' });
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items)) {
      throw new Error('Backup does not contain a valid items list.');
    }
    const safeItems = parsed.items.map(normalizeLibraryItem);
    return {
      version: parsed.version || 2,
      exportedAt: parsed.exportedAt || new Date().toISOString(),
      items: safeItems,
      settings: parsed.settings || null,
      metadataCacheCount: Array.isArray(parsed.metadataCache) ? parsed.metadataCache.length : 0,
      cachedThumbnailsCount: parsed.cachedThumbnails ? Object.keys(parsed.cachedThumbnails).length : 0,
      discoveryCatalogCount: Array.isArray(parsed.discoveryCatalog) ? parsed.discoveryCatalog.length : 0,
      discoveryMeta: parsed.discoveryMeta || null,
      fileSize,
      fullBackupData: {
        version: parsed.version || 2,
        exportedAt: parsed.exportedAt || new Date().toISOString(),
        items: safeItems,
        settings: parsed.settings || {},
        metadataCache: parsed.metadataCache,
        cachedThumbnails: parsed.cachedThumbnails,
        discoveryCatalog: parsed.discoveryCatalog,
        discoveryMeta: parsed.discoveryMeta,
      },
    };
  }

  // Large file (> 25MB): stream parse into discrete records
  const CHUNK_SIZE = 4 * 1024 * 1024;
  let offset = 0;
  const decoder = new TextDecoder('utf-8');

  let buffer = '';
  let inString = false;
  let isEscaped = false;
  let depth = 0;

  let currentKey: string | null = null;
  let arrayKey: string | null = null;
  let elementStart = -1;

  let version = 2;
  let exportedAt = '';
  const items: LibraryItem[] = [];
  let settings: AppSettings | null = null;
  let metadataCacheCount = 0;
  let cachedThumbnailsCount = 0;
  let discoveryCatalogCount = 0;
  let discoveryMeta: any = null;

  let lastReportedPct = 0;

  while (offset < fileSize) {
    const sliceBlob = file.slice(offset, Math.min(offset + CHUNK_SIZE, fileSize));
    const arrayBuffer = await sliceBlob.arrayBuffer();
    const chunkStr = decoder.decode(arrayBuffer, { stream: offset + CHUNK_SIZE < fileSize });
    offset += CHUNK_SIZE;

    const currentPct = Math.min(95, Math.round((offset / fileSize) * 95));
    if (currentPct > lastReportedPct + 3) {
      lastReportedPct = currentPct;
      onProgress?.({
        phase: 'reading',
        percent: currentPct,
        message: `Reading and validating backup file (${currentPct}%)...`,
      });
      await yieldTick();
    }

    for (let i = 0; i < chunkStr.length; i++) {
      const c = chunkStr[i];
      buffer += c;

      if (inString) {
        if (isEscaped) {
          isEscaped = false;
        } else if (c === '\\') {
          isEscaped = true;
        } else if (c === '"') {
          inString = false;
        }
        continue;
      }

      if (c === '"') {
        inString = true;
        continue;
      }

      if (c === '{') {
        depth++;
        if (depth === 2 && !arrayKey) {
          elementStart = buffer.length - 1;
        } else if (depth === 3 && arrayKey) {
          elementStart = buffer.length - 1;
        }
      } else if (c === '}') {
        if (depth === 2 && !arrayKey && elementStart !== -1) {
          const objStr = buffer.slice(elementStart);
          try {
            const obj = JSON.parse(objStr);
            if (currentKey === 'settings') settings = obj;
            else if (currentKey === 'discoveryMeta') discoveryMeta = obj;
          } catch {}
          buffer = '';
          elementStart = -1;
        } else if (depth === 3 && arrayKey && elementStart !== -1) {
          const elemStr = buffer.slice(elementStart);
          try {
            const elem = JSON.parse(elemStr);
            if (arrayKey === 'items') {
              items.push(normalizeLibraryItem(elem));
            } else if (arrayKey === 'metadataCache') {
              metadataCacheCount++;
            } else if (arrayKey === 'discoveryCatalog') {
              discoveryCatalogCount++;
            }
          } catch {}
          buffer = '';
          elementStart = -1;
        }
        depth--;
      } else if (c === '[') {
        depth++;
        if (depth === 2 && currentKey) {
          arrayKey = currentKey;
        }
      } else if (c === ']') {
        depth--;
        if (depth === 1 && arrayKey) {
          arrayKey = null;
          buffer = '';
        }
      } else if (c === ':') {
        if (depth === 1 && !arrayKey) {
          const match = buffer.match(/"([^"]+)"\s*:$/);
          if (match) {
            currentKey = match[1];
          }
        }
      } else if (c === ',') {
        if (depth === 1 && !arrayKey) {
          const match = buffer.match(/"([^"]+)"\s*:\s*([^,{}]+),$/);
          if (match) {
            const key = match[1];
            const val = match[2].trim();
            if (key === 'version') version = parseInt(val, 10);
            else if (key === 'exportedAt') exportedAt = val.replace(/^"|"$/g, '');
          }
          buffer = '';
        }
      }
    }
  }

  onProgress?.({ phase: 'reading', percent: 100, message: 'Backup file validated successfully!' });

  return {
    version,
    exportedAt: exportedAt || new Date().toISOString(),
    items,
    settings,
    metadataCacheCount,
    cachedThumbnailsCount,
    discoveryCatalogCount,
    discoveryMeta,
    fileSize,
  };
}

/**
 * Restores a large backup stream directly from File without keeping
 * entire giant arrays in browser memory.
 */
export async function executeStreamImport(
  file: File,
  mode: 'merge' | 'replace',
  summary: StreamBackupSummary,
  onProgress?: (p: StreamImportProgress) => void
): Promise<{ count: number; discoveryCount: number }> {
  const yieldTick = () => new Promise<void>((r) => setTimeout(r, 0));

  // If small file with full data already parsed, use standard restore
  if (summary.fullBackupData) {
    if (mode === 'replace') {
      await clearLibrary();
      await saveLibraryItems(summary.fullBackupData.items);
      if (summary.fullBackupData.settings) await saveSettings(summary.fullBackupData.settings);
      if (summary.fullBackupData.metadataCache) await restoreCachedMetadata(summary.fullBackupData.metadataCache);
      if (summary.fullBackupData.cachedThumbnails) await restoreCachedThumbnails(summary.fullBackupData.cachedThumbnails);
      if (summary.fullBackupData.discoveryCatalog) await saveDiscoveryTitles(summary.fullBackupData.discoveryCatalog);
      if (summary.fullBackupData.discoveryMeta) await setDiscoveryCatalogMeta(summary.fullBackupData.discoveryMeta);
      return {
        count: summary.fullBackupData.items.length,
        discoveryCount: summary.fullBackupData.discoveryCatalog?.length || 0,
      };
    } else {
      // Merge mode
      const existing = await getAllLibraryItems();
      const existingMap = new Map<string, LibraryItem>();
      const existingById = new Map<string, LibraryItem>();
      for (const item of existing) existingById.set(item.id, item);
      for (const item of existing) {
        existingMap.set(createDuplicateKey(item.originalTitle), item);
        if (item.externalTitle) existingMap.set(createDuplicateKey(item.externalTitle), item);
        if (item.previousTitle) existingMap.set(createDuplicateKey(item.previousTitle), item);
        if (item.videoId) existingMap.set(`vid_${item.videoId}`, item);
        existingMap.set(`id_${item.id}`, item);
      }

      for (const incoming of summary.fullBackupData.items) {
        const key = createDuplicateKey(incoming.originalTitle);
        const prevKey = incoming.previousTitle ? createDuplicateKey(incoming.previousTitle) : null;
        const vidKey = incoming.videoId ? `vid_${incoming.videoId}` : null;
        const idKey = `id_${incoming.id}`;

        const existingMatch =
          existingMap.get(idKey) ||
          (vidKey ? existingMap.get(vidKey) : null) ||
          existingMap.get(key) ||
          (prevKey ? existingMap.get(prevKey) : null);

        if (existingMatch) {
          existingById.set(existingMatch.id, {
            ...existingMatch,
            ...incoming,
            id: existingMatch.id,
            updatedAt: new Date().toISOString(),
          });
        } else {
          existingById.set(incoming.id, incoming);
        }
      }

      const merged = Array.from(existingById.values());
      await saveLibraryItems(merged);
      if (summary.fullBackupData.metadataCache) await restoreCachedMetadata(summary.fullBackupData.metadataCache);
      if (summary.fullBackupData.cachedThumbnails) await restoreCachedThumbnails(summary.fullBackupData.cachedThumbnails);
      if (summary.fullBackupData.discoveryCatalog) await saveDiscoveryTitles(summary.fullBackupData.discoveryCatalog);
      if (summary.fullBackupData.discoveryMeta) await setDiscoveryCatalogMeta(summary.fullBackupData.discoveryMeta);
      return {
        count: merged.length,
        discoveryCount: summary.fullBackupData.discoveryCatalog?.length || 0,
      };
    }
  }

  // Large file stream restore:
  // 1. Process items & settings first
  onProgress?.({ phase: 'restoring', percent: 10, message: 'Restoring watchlist items and settings...' });
  await yieldTick();

  let finalItemCount = 0;
  if (mode === 'replace') {
    await clearLibrary();
    await saveLibraryItems(summary.items);
    finalItemCount = summary.items.length;
  } else {
    const existing = await getAllLibraryItems();
    const existingById = new Map<string, LibraryItem>();
    for (const item of existing) existingById.set(item.id, item);
    const existingMap = new Map<string, LibraryItem>();
    for (const item of existing) {
      existingMap.set(createDuplicateKey(item.originalTitle), item);
      if (item.externalTitle) existingMap.set(createDuplicateKey(item.externalTitle), item);
      if (item.previousTitle) existingMap.set(createDuplicateKey(item.previousTitle), item);
      if (item.videoId) existingMap.set(`vid_${item.videoId}`, item);
      existingMap.set(`id_${item.id}`, item);
    }
    for (const incoming of summary.items) {
      const key = createDuplicateKey(incoming.originalTitle);
      const prevKey = incoming.previousTitle ? createDuplicateKey(incoming.previousTitle) : null;
      const vidKey = incoming.videoId ? `vid_${incoming.videoId}` : null;
      const idKey = `id_${incoming.id}`;

      const existingMatch =
        existingMap.get(idKey) ||
        (vidKey ? existingMap.get(vidKey) : null) ||
        existingMap.get(key) ||
        (prevKey ? existingMap.get(prevKey) : null);

      if (existingMatch) {
        existingById.set(existingMatch.id, {
          ...existingMatch,
          ...incoming,
          id: existingMatch.id,
          updatedAt: new Date().toISOString(),
        });
      } else {
        existingById.set(incoming.id, incoming);
      }
    }
    const merged = Array.from(existingById.values());
    await saveLibraryItems(merged);
    finalItemCount = merged.length;
  }

  if (summary.settings) {
    await saveSettings(summary.settings);
  }
  if (summary.discoveryMeta) {
    await setDiscoveryCatalogMeta(summary.discoveryMeta);
  }

  // 2. Stream restore metadataCache and discoveryCatalog in batches directly to IndexedDB
  const fileSize = file.size;
  const CHUNK_SIZE = 4 * 1024 * 1024;
  let offset = 0;
  const decoder = new TextDecoder('utf-8');

  let buffer = '';
  let inString = false;
  let isEscaped = false;
  let depth = 0;

  let currentKey: string | null = null;
  let arrayKey: string | null = null;
  let elementStart = -1;

  let metadataBatch: any[] = [];
  let discoveryBatch: DiscoveryTitle[] = [];
  let totalDiscoveryRestored = 0;

  while (offset < fileSize) {
    const sliceBlob = file.slice(offset, Math.min(offset + CHUNK_SIZE, fileSize));
    const arrayBuffer = await sliceBlob.arrayBuffer();
    const chunkStr = decoder.decode(arrayBuffer, { stream: offset + CHUNK_SIZE < fileSize });
    offset += CHUNK_SIZE;

    const restorePct = 10 + Math.min(88, Math.round((offset / fileSize) * 88));
    onProgress?.({
      phase: 'restoring',
      percent: restorePct,
      message: `Restoring cache & Discovery catalog (${restorePct}%)...`,
    });
    await yieldTick();

    for (let i = 0; i < chunkStr.length; i++) {
      const c = chunkStr[i];
      buffer += c;

      if (inString) {
        if (isEscaped) {
          isEscaped = false;
        } else if (c === '\\') {
          isEscaped = true;
        } else if (c === '"') {
          inString = false;
        }
        continue;
      }

      if (c === '"') {
        inString = true;
        continue;
      }

      if (c === '{') {
        depth++;
        if (depth === 3 && arrayKey) {
          elementStart = buffer.length - 1;
        }
      } else if (c === '}') {
        if (depth === 3 && arrayKey && elementStart !== -1) {
          const elemStr = buffer.slice(elementStart);
          try {
            const elem = JSON.parse(elemStr);
            if (arrayKey === 'metadataCache') {
              metadataBatch.push(elem);
              if (metadataBatch.length >= 200) {
                await restoreCachedMetadata(metadataBatch);
                metadataBatch = [];
                await yieldTick();
              }
            } else if (arrayKey === 'discoveryCatalog') {
              discoveryBatch.push(elem);
              totalDiscoveryRestored++;
              if (discoveryBatch.length >= 100) {
                await saveDiscoveryTitles(discoveryBatch);
                discoveryBatch = [];
                await yieldTick();
              }
            }
          } catch {}
          buffer = '';
          elementStart = -1;
        }
        depth--;
      } else if (c === '[') {
        depth++;
        if (depth === 2 && currentKey) {
          arrayKey = currentKey;
        }
      } else if (c === ']') {
        depth--;
        if (depth === 1 && arrayKey) {
          if (arrayKey === 'metadataCache' && metadataBatch.length > 0) {
            await restoreCachedMetadata(metadataBatch);
            metadataBatch = [];
          } else if (arrayKey === 'discoveryCatalog' && discoveryBatch.length > 0) {
            await saveDiscoveryTitles(discoveryBatch);
            discoveryBatch = [];
          }
          arrayKey = null;
          buffer = '';
        }
      } else if (c === ':') {
        if (depth === 1 && !arrayKey) {
          const match = buffer.match(/"([^"]+)"\s*:$/);
          if (match) {
            currentKey = match[1];
          }
        }
      }
    }
  }

  // Flush remaining batches
  if (metadataBatch.length > 0) {
    await restoreCachedMetadata(metadataBatch);
  }
  if (discoveryBatch.length > 0) {
    await saveDiscoveryTitles(discoveryBatch);
  }

  onProgress?.({ phase: 'completed', percent: 100, message: 'Restore completed successfully!' });

  return {
    count: finalItemCount,
    discoveryCount: totalDiscoveryRestored || summary.discoveryCatalogCount,
  };
}
