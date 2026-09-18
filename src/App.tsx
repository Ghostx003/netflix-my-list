import React, { useState, useEffect, useCallback } from 'react';
import { AppSettings, LibraryItem } from './types';
import { DEFAULT_SETTINGS, getAllLibraryItems, getSettings, saveLibraryItems, saveSettings, clearLibrary, deleteLibraryItem } from './services/db';
import { enrichLibraryItem } from './services/tmdb';
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

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    'import' | 'movies-series' | 'still-watching' | 'dropped' | 'tracker' | 'analytics' | 'info'
  >('movies-series');
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [isRescanning, setIsRescanning] = useState(false);

  // Modals state
  const [selectedDetailItem, setSelectedDetailItem] = useState<LibraryItem | null>(null);
  const [matchingItem, setMatchingItem] = useState<LibraryItem | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [isSurpriseMeOpen, setIsSurpriseMeOpen] = useState(false);

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
        setItems(savedItems || []);
        setSettings(savedSettings || DEFAULT_SETTINGS);

        if (savedItems && savedItems.length > 0) {
          const needsEnrichment = savedItems.some(
            (i) => i.status === 'pending' || (!i.posterPath && !i.externalId) || i.rottenTomatoesRating === undefined
          );
          if (needsEnrichment) {
            triggerBackgroundScan(savedItems, savedSettings);
          }
        } else {
          setActiveTab('import');
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
        // Automatically enrich items if pending, missing poster, missing trailer, or missing ratings
        if (item.status === 'pending' || !item.posterPath || !item.trailer || item.rottenTomatoesRating === undefined || item.status === 'needs_review') {
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
        }
      }

      if (hasChanges) {
        setItems(updatedList);
        await saveLibraryItems(updatedList);
      }
      setIsRescanning(false);
    },
    [isRescanning]
  );

  const handleAddItems = async (newItems: LibraryItem[]) => {
    const combined = [...items, ...newItems];
    setItems(combined);
    await saveLibraryItems(combined);
    triggerBackgroundScan(combined, settings);
  };

  const handleUpdateItem = async (updatedItem: LibraryItem) => {
    const updated = items.map((i) => (i.id === updatedItem.id ? updatedItem : i));
    setItems(updated);
    await saveLibraryItems(updated);
  };

  const handleAddNewItem = async (newItem: LibraryItem) => {
    const updated = [newItem, ...items];
    setItems(updated);
    await saveLibraryItems(updated);
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
        setActiveTab={setActiveTab}
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
            onNavigateToCatalog={() => setActiveTab('movies-series')}
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
      <MediaDetailModal
        item={selectedDetailItem}
        onClose={() => setSelectedDetailItem(null)}
        settings={settings}
        onChangeMatch={(item) => {
          setSelectedDetailItem(null);
          setMatchingItem(item);
        }}
      />

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
        onClose={() => setIsSurpriseMeOpen(false)}
        onWatchNow={handleWatchNow}
        onOpenDetail={(item) => {
          setIsSurpriseMeOpen(false);
          setSelectedDetailItem(item);
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
    </div>
  );
};

export default App;
