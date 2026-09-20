import React, { useState, useEffect, useCallback } from 'react';
import { AppSettings, LibraryItem, NetflixRawItem, LibraryViewingStatus } from './types';
import { DEFAULT_SETTINGS, getAllLibraryItems, getSettings, saveLibraryItems, saveSettings, clearLibrary, deleteLibraryItem, getAllDiscoveryTitles } from './services/db';
import { enrichLibraryItem } from './services/tmdb';
import { deduplicateAndPrepareItems } from './services/duplicateDetector';
import { syncLibraryItemsToDiscovery, syncEnrichedDiscoveryTitlesIntoLibrary, enrichAndSyncNewLibraryItem } from './services/discoveryService';
import { Navbar } from './components/Navbar';
import { ImportLibraryView } from './components/ImportLibraryView';
import { MoviesSeriesView } from './components/MoviesSeriesView';
import { StillWatchingView } from './components/StillWatchingView';
import { DroppedView } from './components/DroppedView';
import { SeriesTrackerView } from './components/SeriesTrackerView';
import { AnalyticsView } from './components/AnalyticsView';
import { MediaDetailModal } from './components/MediaDetailModal';
import { ManualMatchModal } from './components/ManualMatchModal';
import { SettingsModal } from './components/SettingsModal';
import { DropReasonModal } from './components/DropReasonModal';
import { ConfirmationModal } from './components/ConfirmationModal';
import { SurpriseMeModal } from './components/SurpriseMeModal';
import { BackupModal } from './components/BackupModal';
import { InfoView } from './components/InfoView';
import { DiscoveryView } from './components/DiscoveryView';
import { DiscoveryTitle } from './types';

type ActiveTabType = 'import' | 'movies-series' | 'still-watching' | 'dropped' | 'tracker' | 'discovery' | 'analytics' | 'info';

const VALID_TABS: ActiveTabType[] = ['import', 'movies-series', 'still-watching', 'dropped', 'tracker', 'discovery', 'analytics', 'info'];

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTabType>(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab') as ActiveTabType;
    return VALID_TABS.includes(tabParam) ? tabParam : 'movies-series';
  });
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [isRescanning, setIsRescanning] = useState(false);

  // Sync activeTab changes to URL
  const handleTabChange = (newTab: ActiveTabType) => {
    setActiveTab(newTab);
    const params = new URLSearchParams(window.location.search);
    if (newTab === 'movies-series') {
      params.delete('tab');
    } else {
      params.set('tab', newTab);
    }
    const queryString = params.toString();
    const newRelativePathQuery = window.location.pathname + (queryString ? '?' + queryString : '') + window.location.hash;
    window.history.replaceState(null, '', newRelativePathQuery);
  };

  // Listen to popstate for tab navigation
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab') as ActiveTabType;
      if (VALID_TABS.includes(tabParam)) {
        setActiveTab(tabParam);
      } else {
        setActiveTab('movies-series');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Modals state
  const [selectedDetailItem, setSelectedDetailItem] = useState<LibraryItem | null>(null);
  const [matchingItem, setMatchingItem] = useState<LibraryItem | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [isSurpriseMeOpen, setIsSurpriseMeOpen] = useState(false);
  const [surpriseMeCustomPool, setSurpriseMeCustomPool] = useState<LibraryItem[] | null>(null);

  // Drop modal state
  const [itemToDrop, setItemToDrop] = useState<LibraryItem | null>(null);

  // Safety confirmation modal state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Initial load from storage
  useEffect(() => {
    async function loadData() {
      try {
        const [savedItems, savedSettings] = await Promise.all([
          getAllLibraryItems(),
          getSettings(),
        ]);
        // Filter out any bogus notification items that may have been imported accidentally
        let validItems: LibraryItem[] = (savedItems || []).map((item): LibraryItem => {
          // Heal any desync where item was uncompleted (isCompleted: false) but viewingStatus remained 'completed'
          if (!item.isCompleted && item.viewingStatus === 'completed') {
            return {
              ...item,
              viewingStatus: (item.progress && item.progress.percentage > 0 ? 'still_watching' : 'unwatched') as LibraryViewingStatus,
            };
          }
          if (item.isCompleted && item.viewingStatus !== 'completed') {
            return {
              ...item,
              viewingStatus: 'completed',
            };
          }
          return item;
        }).filter(item => {
          const t = (item.originalTitle || '').toLowerCase();
          return !t.includes('new arrival') && !t.includes('watch now') && !t.includes('weeks ago') && !t.includes('days ago');
        });

        // Auto-enrich library items with enriched discovery catalog data if any matching items were enriched
        try {
          const discoveryTitles = await getAllDiscoveryTitles();
          if (discoveryTitles && discoveryTitles.length > 0) {
            const { updatedItems, upgradedCount } = syncEnrichedDiscoveryTitlesIntoLibrary(validItems, discoveryTitles);
            if (upgradedCount > 0) {
              console.log(`[App] Synced ${upgradedCount} library item(s) from Discovery Catalogue on startup.`);
              validItems = updatedItems;
            }
          }
        } catch (discErr) {
          console.warn('[App] Discovery initial sync warning:', discErr);
        }

        if (savedItems && JSON.stringify(validItems) !== JSON.stringify(savedItems)) {
          await saveLibraryItems(validItems);
        }

        setItems(validItems);
        setSettings(savedSettings || DEFAULT_SETTINGS);

        if (validItems && validItems.length > 0) {
          const needsEnrichment = validItems.some(
            (i) => i.status === 'pending' || (!i.posterPath && !i.externalId) || i.rottenTomatoesRating === undefined
          );
          if (needsEnrichment) {
            triggerBackgroundScan(validItems, savedSettings || DEFAULT_SETTINGS);
          }
        } else {
          // If no items and tab wasn't explicitly set in url, switch to import
          const params = new URLSearchParams(window.location.search);
          if (!params.has('tab')) {
            handleTabChange('import');
          }
        }
      } catch (err) {
        console.error('Failed initializing app state:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Enrich items with OMDB & TMDB
  const triggerBackgroundScan = useCallback(
    async (targetItems: LibraryItem[], currentSettings: AppSettings) => {
      if (isRescanning) return;
      setIsRescanning(true);

      const updatedList = [...targetItems];
      let hasChanges = false;

      for (let i = 0; i < updatedList.length; i++) {
        const item = updatedList[i];
        // Never overwrite a manual match chosen by user
        if (item.isManualMatch) continue;

        // Automatically enrich items if pending, missing essential details (poster, ratings) or missing trailer
        const hasDetails = item.status === 'matched' && !!item.posterPath && item.rottenTomatoesRating !== undefined;
        if (!hasDetails && (item.status === 'pending' || !item.posterPath || item.status === 'needs_review')) {
          try {
            const enriched = await enrichLibraryItem(
              item,
              currentSettings.tmdbApiKey,
              currentSettings.maxEpisodesPerSeries,
              currentSettings.capSeriesEpisodes
            );
            updatedList[i] = enriched;
            hasChanges = true;
            if (i % 3 === 0) {
              setItems([...updatedList]);
            }
          } catch (err) {
            console.warn('Scan error on ' + item.originalTitle + ':', err);
          }
        } else if (!item.trailer) {
          // If title already has details but missing trailer, search YouTube trailer in background (Hindi first)
          try {
            const { searchYouTubeTrailer } = await import('./services/youtubeTrailer');
            const foundTrailer = await searchYouTubeTrailer(
              item.externalTitle || item.originalTitle,
              item.releaseYear,
              item.mediaType
            );
            if (foundTrailer) {
              updatedList[i] = {
                ...item,
                trailer: foundTrailer,
                updatedAt: new Date().toISOString(),
              };
              hasChanges = true;
            }
          } catch (err) {
            // ignore background trailer fetch error
          }
        }
      }

      if (hasChanges) {
        setItems(updatedList);
        await saveLibraryItems(updatedList);
        syncLibraryItemsToDiscovery(updatedList).catch(() => {});
      }
      setIsRescanning(false);
    },
    [isRescanning]
  );

  // Sync toast state
  const [syncToast, setSyncToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  // Expose current library items to window for extension diffing
  useEffect(() => {
    (window as any).__NETFLIX_LIBRARY_ITEMS = items;
  }, [items]);

  // Listen for direct sync messages from the Netflix My List Chrome Extension
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data && event.data.type === 'NETFLIX_EXTENSION_SYNC' && Array.isArray(event.data.items)) {
        const rawList: NetflixRawItem[] = event.data.items;
        const { newItems, duplicateCount } = deduplicateAndPrepareItems(rawList, items);
        if (newItems.length > 0) {
          await handleAddItems(newItems);
          handleTabChange('movies-series');
          setSyncToast({
            message: `Successfully imported ${newItems.length} new title${newItems.length > 1 ? 's' : ''} from Netflix Extension!`,
            type: 'success'
          });
        } else {
          setSyncToast({
            message: `All ${duplicateCount} titles from Netflix are already in your library.`,
            type: 'info'
          });
        }
        setTimeout(() => {
          setSyncToast(null);
        }, 5000);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [items]);

  const handleAddItems = async (newItems: LibraryItem[]) => {
    const combined = [...items, ...newItems];
    setItems(combined);
    await saveLibraryItems(combined);
    syncLibraryItemsToDiscovery(newItems).catch((err) => console.warn('Discovery sync error:', err));
    triggerBackgroundScan(combined, settings);

    // Also enrich newly added items in background and update both library & discovery immediately
    (async () => {
      let anyEnriched = false;
      const currentList = [...combined];
      for (let i = 0; i < newItems.length; i++) {
        try {
          const { enrichedLibraryItem } = await enrichAndSyncNewLibraryItem(newItems[i], settings.tmdbApiKey);
          const idx = currentList.findIndex((it) => it.id === newItems[i].id);
          if (idx !== -1) {
            currentList[idx] = enrichedLibraryItem;
            anyEnriched = true;
          }
        } catch (e) {
          console.warn('Background instant enrich error:', e);
        }
      }
      if (anyEnriched) {
        setItems([...currentList]);
        await saveLibraryItems(currentList);
      }
    })();
  };

  const handleUpdateItem = async (updatedItem: LibraryItem) => {
    const updated = items.map((i) => (i.id === updatedItem.id ? updatedItem : i));
    setItems(updated);
    if (selectedDetailItem && selectedDetailItem.id === updatedItem.id) {
      setSelectedDetailItem(updatedItem);
    }
    await saveLibraryItems(updated);
    syncLibraryItemsToDiscovery([updatedItem]).catch((err) => console.warn('Discovery sync error:', err));
  };

  const handleAddNewItem = async (newItem: LibraryItem) => {
    const updated = [newItem, ...items];
    setItems(updated);
    await saveLibraryItems(updated);

    // Immediately enrich via TMDB, save to Discovery Catalogue, and update Library Item
    enrichAndSyncNewLibraryItem(newItem, settings.tmdbApiKey)
      .then(async ({ enrichedLibraryItem }) => {
        setItems((prev) => prev.map((it) => (it.id === newItem.id ? enrichedLibraryItem : it)));
        const currentLib = await getAllLibraryItems();
        const remapped = currentLib.map((it) => (it.id === newItem.id ? enrichedLibraryItem : it));
        await saveLibraryItems(remapped);
      })
      .catch((err) => {
        console.warn('Instant enrich error on adding item:', err);
        syncLibraryItemsToDiscovery([newItem]).catch(() => {});
      });
  };

  // Explicitly sync and replace library items with discovery catalog enriched listings
  const handleSyncWithDiscovery = async () => {
    try {
      const discoveryTitles = await getAllDiscoveryTitles();
      if (!discoveryTitles || discoveryTitles.length === 0) {
        setSyncToast({
          message: 'Discovery catalog has no titles yet. Open Discovery to explore or sync!',
          type: 'info',
        });
        setTimeout(() => setSyncToast(null), 4000);
        return;
      }
      const { updatedItems, upgradedCount } = syncEnrichedDiscoveryTitlesIntoLibrary(items, discoveryTitles);
      if (upgradedCount > 0) {
        setItems(updatedItems);
        await saveLibraryItems(updatedItems);
        setSyncToast({
          message: `Replaced and upgraded ${upgradedCount} title(s) in Movies & Series with Discovery metadata!`,
          type: 'success',
        });
      } else {
        setSyncToast({
          message: 'All eligible titles are already up to date with Discovery metadata.',
          type: 'info',
        });
      }
      setTimeout(() => setSyncToast(null), 5000);
    } catch (err) {
      console.error('Failed to sync library with discovery:', err);
    }
  };

  const handleRefreshLibrary = async () => {
    const fresh = await getAllLibraryItems();
    setItems(fresh || []);
  };

  const handleDeletePermanent = async (id: string) => {
    await deleteLibraryItem(id);
    setItems((prev) => prev.filter((x) => x.id !== id));
  };

  const handleConfirmDrop = (reason: string, notes: string) => {
    if (!itemToDrop) return;
    const updated: LibraryItem = {
      ...itemToDrop,
      viewingStatus: 'dropped',
      droppedReason: reason,
      droppedNotes: notes,
      droppedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    handleUpdateItem(updated);
    setItemToDrop(null);
  };

  const handleWatchNow = (item: LibraryItem) => {
    setIsSurpriseMeOpen(false);
    // If not already in still_watching, mark it
    if (item.viewingStatus !== 'still_watching') {
      const updated: LibraryItem = {
        ...item,
        viewingStatus: 'still_watching',
        progress: item.progress || {
          percentage: 10,
          currentEpisode: 1,
          watchedMinutes: 15,
          lastWatchedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      };
      handleUpdateItem(updated);
    }
    setActiveTab('still-watching');
  };

  const handleUpdateSettings = async (newSettings: AppSettings) => {
    setSettings(newSettings);
    await saveSettings(newSettings);
  };

  const handleSelectMatch = async (updatedItem: LibraryItem) => {
    setMatchingItem(null);
    await handleUpdateItem(updatedItem);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#141414] text-white flex flex-col items-center justify-center">
        <span className="text-3xl font-black text-[#E50914] tracking-tighter uppercase mb-4 animate-pulse">
          Netflix
        </span>
        <p className="text-xs text-gray-400 font-mono">Loading Watchlist Command Center...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#141414] text-white flex flex-col selection:bg-[#E50914] selection:text-white">
      {/* Persistent Top Navigation Bar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        items={items}
        settings={settings}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenBackup={() => setIsBackupOpen(true)}
        onRescan={() => triggerBackgroundScan(items, settings)}
        isRescanning={isRescanning}
      />

      {/* Main View Container */}
      <main className="flex-1 pb-16">
        {activeTab === 'import' && (
          <ImportLibraryView
            items={items}
            onAddItems={handleAddItems}
            onClearLibrary={() => {
              setConfirmDialog({
                isOpen: true,
                title: 'Clear Entire Library?',
                message: 'This will erase all saved titles from your local database. You can export a backup first.',
                onConfirm: async () => {
                  setItems([]);
                  await clearLibrary();
                },
              });
            }}
            onNavigateToCatalog={() => handleTabChange('movies-series')}
            onDeleteItem={(id) => {
              const target = items.find((i) => i.id === id);
              setConfirmDialog({
                isOpen: true,
                title: 'Delete Title Permanently?',
                message: `Are you sure you want to permanently remove "${target?.externalTitle || target?.originalTitle || 'this title'}" from your catalog?`,
                onConfirm: async () => {
                  await handleDeletePermanent(id);
                },
              });
            }}
            onOpenBackup={() => setIsBackupOpen(true)}
          />
        )}

        {activeTab === 'movies-series' && (
          <MoviesSeriesView
            items={items}
            settings={settings}
            onSelectItem={(item) => setSelectedDetailItem(item)}
            onChangeMatch={(item) => setMatchingItem(item)}
            onRescan={() => triggerBackgroundScan(items, settings)}
            isRescanning={isRescanning}
            onOpenSurpriseMe={() => setIsSurpriseMeOpen(true)}
            onUpdateItem={handleUpdateItem}
            onOpenDropModal={(item) => setItemToDrop(item)}
            onSyncWithDiscovery={handleSyncWithDiscovery}
          />
        )}

        {activeTab === 'still-watching' && (
          <StillWatchingView
            items={items}
            onUpdateItem={handleUpdateItem}
            onOpenDropModal={(item) => setItemToDrop(item)}
            onOpenDetail={(item) => setSelectedDetailItem(item)}
          />
        )}

        {activeTab === 'dropped' && (
          <DroppedView
            items={items}
            onUpdateItem={handleUpdateItem}
            onDeleteItem={handleDeletePermanent}
            onOpenDetail={(item) => setSelectedDetailItem(item)}
            onRequestDeleteConfirm={(item) => {
              setConfirmDialog({
                isOpen: true,
                title: 'Delete Permanently?',
                message: `Are you sure you want to permanently delete "${item.externalTitle || item.originalTitle}" from your database? This action cannot be undone.`,
                onConfirm: () => handleDeletePermanent(item.id),
              });
            }}
          />
        )}

        {activeTab === 'tracker' && (
          <SeriesTrackerView
            items={items}
            settings={settings}
            onUpdateItem={handleUpdateItem}
            onAddNewItem={handleAddNewItem}
            onOpenDetail={(item) => setSelectedDetailItem(item)}
          />
        )}

        {activeTab === 'discovery' && (
          <DiscoveryView
            settings={settings}
            libraryItems={items}
            onAddToLibrary={async (discItem) => {
              const newLibItem: LibraryItem = {
                id: 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
                originalTitle: discItem.title,
                normalizedTitle: discItem.title.toLowerCase().trim(),
                videoId: discItem.netflixId,
                mediaType: discItem.mediaType,
                status: 'matched',
                viewingStatus: 'unwatched',
                externalId: discItem.tmdbId,
                externalTitle: discItem.title,
                releaseYear: discItem.releaseYear,
                releaseDate: discItem.releaseDate,
                posterPath: discItem.posterPath,
                backdropPath: discItem.backdropPath,
                rating: discItem.rating,
                imdbRating: discItem.imdbRating,
                rottenTomatoesRating: discItem.rottenTomatoesRating,
                voteCount: discItem.voteCount,
                synopsis: discItem.synopsis,
                genres: discItem.genres,
                countries: discItem.countries,
                languages: discItem.audioLanguages,
                originalLanguage: discItem.originalLanguage,
                runtimeMinutes: discItem.runtimeMinutes,
                totalSeasons: discItem.totalSeasons,
                totalEpisodes: discItem.totalEpisodes,
                averageEpisodeMinutes: discItem.averageEpisodeMinutes,
                episodes: discItem.episodes,
                trailer: discItem.trailer,
                cast: discItem.cast,
                director: discItem.director,
                creator: discItem.creator,
                addedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              await handleAddNewItem(newLibItem);
              setSyncToast({
                message: `Added "${discItem.title}" to your library!`,
                type: 'success',
              });
              setTimeout(() => setSyncToast(null), 3000);
            }}
            onStartWatching={async (discItem) => {
              // Check if item already exists in library
              const existing = items.find(
                (i) =>
                  (discItem.imdbId && i.imdbId === discItem.imdbId) ||
                  (discItem.tmdbId && i.externalId === discItem.tmdbId) ||
                  i.originalTitle.toLowerCase().trim() === discItem.title.toLowerCase().trim()
              );

              if (existing) {
                const updated: LibraryItem = {
                  ...existing,
                  viewingStatus: 'still_watching',
                  isCompleted: false,
                  droppedReason: undefined,
                  droppedAt: undefined,
                  progress: existing.progress || { percentage: 10, watchedMinutes: 30 },
                  updatedAt: new Date().toISOString(),
                };
                await handleUpdateItem(updated);
                setSelectedDetailItem(updated);
              } else {
                const newLibItem: LibraryItem = {
                  id: 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
                  originalTitle: discItem.title,
                  normalizedTitle: discItem.title.toLowerCase().trim(),
                  videoId: discItem.netflixId,
                  mediaType: discItem.mediaType,
                  status: 'matched',
                  viewingStatus: 'still_watching',
                  progress: { percentage: 10, watchedMinutes: 30 },
                  externalId: discItem.tmdbId,
                  externalTitle: discItem.title,
                  releaseYear: discItem.releaseYear,
                  releaseDate: discItem.releaseDate,
                  posterPath: discItem.posterPath,
                  backdropPath: discItem.backdropPath,
                  rating: discItem.rating,
                  imdbRating: discItem.imdbRating,
                  rottenTomatoesRating: discItem.rottenTomatoesRating,
                  voteCount: discItem.voteCount,
                  synopsis: discItem.synopsis,
                  genres: discItem.genres,
                  countries: discItem.countries,
                  languages: discItem.audioLanguages,
                  originalLanguage: discItem.originalLanguage,
                  runtimeMinutes: discItem.runtimeMinutes,
                  totalSeasons: discItem.totalSeasons,
                  totalEpisodes: discItem.totalEpisodes,
                  averageEpisodeMinutes: discItem.averageEpisodeMinutes,
                  episodes: discItem.episodes,
                  trailer: discItem.trailer,
                  cast: discItem.cast,
                  director: discItem.director,
                  creator: discItem.creator,
                  addedAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                };
                await handleAddNewItem(newLibItem);
                setSelectedDetailItem(newLibItem);
              }
              handleTabChange('still-watching');
            }}
            onMarkWatched={async (discItem) => {
              const existing = items.find(
                (i) =>
                  (discItem.imdbId && i.imdbId === discItem.imdbId) ||
                  (discItem.tmdbId && i.externalId === discItem.tmdbId) ||
                  (discItem.netflixId && i.videoId === discItem.netflixId) ||
                  i.originalTitle.toLowerCase().trim() === discItem.title.toLowerCase().trim()
              );

              if (existing) {
                const updated: LibraryItem = {
                  ...existing,
                  viewingStatus: 'completed',
                  isCompleted: true,
                  completedAt: new Date().toISOString(),
                  droppedReason: undefined,
                  droppedAt: undefined,
                  progress: { percentage: 100, watchedMinutes: existing.runtimeMinutes || 120 },
                  updatedAt: new Date().toISOString(),
                };
                await handleUpdateItem(updated);
                setSyncToast({
                  message: `Marked "${discItem.title}" as Watched!`,
                  type: 'success',
                });
              } else {
                const newLibItem: LibraryItem = {
                  id: 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
                  originalTitle: discItem.title,
                  normalizedTitle: discItem.title.toLowerCase().trim(),
                  videoId: discItem.netflixId,
                  mediaType: discItem.mediaType,
                  status: 'matched',
                  viewingStatus: 'completed',
                  isCompleted: true,
                  completedAt: new Date().toISOString(),
                  progress: { percentage: 100, watchedMinutes: discItem.runtimeMinutes || 120 },
                  externalId: discItem.tmdbId,
                  externalTitle: discItem.title,
                  releaseYear: discItem.releaseYear,
                  releaseDate: discItem.releaseDate,
                  posterPath: discItem.posterPath,
                  backdropPath: discItem.backdropPath,
                  rating: discItem.rating,
                  imdbRating: discItem.imdbRating,
                  rottenTomatoesRating: discItem.rottenTomatoesRating,
                  voteCount: discItem.voteCount,
                  synopsis: discItem.synopsis,
                  genres: discItem.genres,
                  countries: discItem.countries,
                  languages: discItem.audioLanguages,
                  originalLanguage: discItem.originalLanguage,
                  runtimeMinutes: discItem.runtimeMinutes,
                  totalSeasons: discItem.totalSeasons,
                  totalEpisodes: discItem.totalEpisodes,
                  averageEpisodeMinutes: discItem.averageEpisodeMinutes,
                  episodes: discItem.episodes,
                  trailer: discItem.trailer,
                  cast: discItem.cast,
                  director: discItem.director,
                  creator: discItem.creator,
                  addedAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                };
                await handleAddNewItem(newLibItem);
                setSyncToast({
                  message: `Marked "${discItem.title}" as Watched and saved to Library!`,
                  type: 'success',
                });
              }
              setTimeout(() => setSyncToast(null), 3000);
            }}
            onOpenDetail={(item) => setSelectedDetailItem(item)}
            onOpenSurpriseMeModal={(pool) => {
              setSurpriseMeCustomPool(pool && pool.length > 0 ? pool : null);
              setIsSurpriseMeOpen(true);
            }}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsView
            items={items}
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        )}

        {activeTab === 'info' && <InfoView />}
      </main>

      {/* Modal: Item Details */}
      {selectedDetailItem && (
        <MediaDetailModal
          item={selectedDetailItem}
          onClose={() => setSelectedDetailItem(null)}
          settings={settings}
          onUpdateItem={handleUpdateItem}
          onChangeMatch={(item) => {
            setSelectedDetailItem(null);
            setMatchingItem(item);
          }}
        />
      )}

      {/* Modal: Manual Match Fix */}
      <ManualMatchModal
        item={matchingItem}
        apiKey={settings.tmdbApiKey}
        onClose={() => setMatchingItem(null)}
        onSelectMatch={handleSelectMatch}
      />

      {/* Modal: Settings */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={handleUpdateSettings}
      />

      {/* Modal: Drop Reason Prompt */}
      <DropReasonModal
        isOpen={!!itemToDrop}
        title={itemToDrop?.externalTitle || itemToDrop?.originalTitle || ''}
        onClose={() => setItemToDrop(null)}
        onConfirm={handleConfirmDrop}
      />

      {/* Modal: Safety Confirmation */}
      <ConfirmationModal
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onClose={() => setConfirmDialog((p) => ({ ...p, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
      />

      {/* Modal: Surprise Me Roulette */}
      <SurpriseMeModal
        isOpen={isSurpriseMeOpen}
        items={items}
        customPool={surpriseMeCustomPool}
        onClose={() => {
          setIsSurpriseMeOpen(false);
          setSurpriseMeCustomPool(null);
        }}
        onWatchNow={handleWatchNow}
        onOpenDetail={(item) => {
          // Keep Surprise Modal open behind the details modal!
          setSelectedDetailItem(item);
        }}
        onAddToLibrary={async (item) => {
          const isExisting = items.some(
            (i) =>
              i.id === item.id ||
              (item.externalId && i.externalId === item.externalId) ||
              (item.videoId && i.videoId === item.videoId) ||
              i.originalTitle.toLowerCase().trim() === item.originalTitle.toLowerCase().trim()
          );
          if (!isExisting) {
            await handleAddNewItem(item);
            setSyncToast({
              message: `Added "${item.externalTitle || item.originalTitle}" to your library!`,
              type: 'success',
            });
            setTimeout(() => setSyncToast(null), 3000);
          }
        }}
        onMarkWatched={async (item) => {
          const existing = items.find(
            (i) =>
              i.id === item.id ||
              (item.externalId && i.externalId === item.externalId) ||
              (item.videoId && i.videoId === item.videoId) ||
              i.originalTitle.toLowerCase().trim() === item.originalTitle.toLowerCase().trim()
          );
          if (existing) {
            const updated: LibraryItem = {
              ...existing,
              viewingStatus: 'completed',
              isCompleted: true,
              completedAt: new Date().toISOString(),
              droppedReason: undefined,
              droppedAt: undefined,
              progress: { percentage: 100, watchedMinutes: existing.runtimeMinutes || 120 },
              updatedAt: new Date().toISOString(),
            };
            await handleUpdateItem(updated);
          } else {
            const newItem: LibraryItem = {
              ...item,
              viewingStatus: 'completed',
              isCompleted: true,
              completedAt: new Date().toISOString(),
              progress: { percentage: 100, watchedMinutes: item.runtimeMinutes || 120 },
              updatedAt: new Date().toISOString(),
            };
            await handleAddNewItem(newItem);
          }
          setSyncToast({
            message: `Marked "${item.externalTitle || item.originalTitle}" as Watched! Spinning next...`,
            type: 'success',
          });
          setTimeout(() => setSyncToast(null), 2500);
        }}
      />

      {/* Modal: Backup & Restore */}
      <BackupModal
        isOpen={isBackupOpen}
        items={items}
        settings={settings}
        onClose={() => setIsBackupOpen(false)}
        onRefreshLibrary={handleRefreshLibrary}
      />

      {/* Sync Notification Toast */}
      {syncToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-zinc-900 border border-emerald-500/40 text-white px-5 py-3.5 rounded-xl shadow-2xl animate-fade-in backdrop-blur-md">
          <div className={`w-2.5 h-2.5 rounded-full ${syncToast.type === 'success' ? 'bg-emerald-400 animate-ping' : 'bg-blue-400'}`} />
          <div className="text-sm font-medium">{syncToast.message}</div>
          <button
            onClick={() => setSyncToast(null)}
            className="ml-2 text-zinc-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
