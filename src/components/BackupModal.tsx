import React, { useState } from 'react';
import { X, Upload, Download, AlertTriangle, Check, RefreshCw, Database, FileJson, Film, ArrowRight } from 'lucide-react';
import { LibraryItem, AppSettings } from '../types';
import { exportBackup } from '../services/backup';
import {
  readBackupFileStreaming,
  executeStreamImport,
  StreamBackupSummary,
} from '../services/streamBackup';

interface BackupModalProps {
  isOpen: boolean;
  items: LibraryItem[];
  settings: AppSettings;
  onClose: () => void;
  onRefreshLibrary: () => Promise<void>;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  items,
  settings,
  onClose,
  onRefreshLibrary,
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'restore'>('export');

  // Checklist options for 1-click export
  const [includeSqlite, setIncludeSqlite] = useState(true);
  const [includeEnrichedJson, setIncludeEnrichedJson] = useState(true);
  const [includeWatchlist, setIncludeWatchlist] = useState(true);

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ message: string; percent: number } | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  // Restore state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pendingSummary, setPendingSummary] = useState<StreamBackupSummary | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [fileReadProgress, setFileReadProgress] = useState<{ message: string; percent: number } | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ message: string; percent: number } | null>(null);

  if (!isOpen) return null;

  const selectedCount = (includeSqlite ? 1 : 0) + (includeEnrichedJson ? 1 : 0) + (includeWatchlist ? 1 : 0);

  // Fast, seamless non-blocking export
  const handleExportSelected = async () => {
    if (selectedCount === 0) {
      setErrorMessage('Please select at least one item to export.');
      return;
    }

    setIsExporting(true);
    setErrorMessage(null);
    setExportSuccess(null);
    setExportProgress({ message: 'Preparing downloads...', percent: 10 });

    try {
      const tasks: Array<{ name: string; run: () => Promise<void> }> = [];

      // 1. Raw SQLite DB (.sqlite)
      if (includeSqlite) {
        tasks.push({
          name: 'SQLite Database (.sqlite)',
          run: async () => {
            const a = document.createElement('a');
            a.href = '/netflix_knowledge_base.sqlite';
            a.download = 'netflix_knowledge_base.sqlite';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          },
        });
      }

      // 2. Enriched Movie & Plot Dataset (.json)
      if (includeEnrichedJson) {
        tasks.push({
          name: 'Enriched Movie Plots & Data (.json)',
          run: async () => {
            const a = document.createElement('a');
            a.href = '/netflix_enriched_kb.json';
            a.download = 'netflix_enriched_movies_database.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          },
        });
      }

      // 3. Full System & Watchlist Backup (.json) with SQLite Knowledge Base embedded
      if (includeWatchlist) {
        tasks.push({
          name: 'Universal Full Backup (.json)',
          run: async () => {
            await exportBackup(items, settings, false, (p) => {
              setExportProgress({ message: p.message, percent: p.percent });
            });
          },
        });
      }

      // Execute sequentially with 350ms buffer so browser handles all downloads cleanly without lag
      for (let i = 0; i < tasks.length; i++) {
        const pct = Math.round(((i + 1) / tasks.length) * 100);
        setExportProgress({ message: `Exporting ${tasks[i].name}...`, percent: pct });
        await tasks[i].run();
        if (i < tasks.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 350));
        }
      }

      setExportSuccess(`Exported ${tasks.length} file(s) successfully! Check your browser Downloads.`);
    } catch (err: any) {
      console.error('Export error:', err);
      setErrorMessage(`Export failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    setImportSuccess(null);
    setPendingSummary(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setIsReadingFile(true);
    setFileReadProgress({ message: 'Reading file...', percent: 10 });

    try {
      const summary = await readBackupFileStreaming(file, (p) => {
        setFileReadProgress({ message: p.message, percent: p.percent });
      });
      setPendingSummary(summary);
    } catch (err: any) {
      console.error('Backup parse error:', err);
      setErrorMessage(err?.message || 'Failed to read backup file. Please verify JSON format.');
      setSelectedFile(null);
    } finally {
      setIsReadingFile(false);
      setFileReadProgress(null);
    }
  };

  const executeImport = async (mode: 'merge' | 'replace') => {
    if (!selectedFile || !pendingSummary) return;
    setIsImporting(true);
    setErrorMessage(null);
    setImportProgress({ message: 'Starting restoration...', percent: 5 });

    try {
      const res = await executeStreamImport(selectedFile, mode, pendingSummary, (p) => {
        setImportProgress({ message: p.message, percent: p.percent });
      });

      const discMsg = res.discoveryCount ? ` and restored ${res.discoveryCount} Discovery titles` : '';
      if (mode === 'replace') {
        setImportSuccess(`Complete database replaced with ${res.count} titles${discMsg}.`);
      } else {
        setImportSuccess(`Merged successfully: ${res.count} total titles${discMsg}.`);
      }
      setPendingSummary(null);
      setSelectedFile(null);
      await onRefreshLibrary();
    } catch (err: any) {
      console.error('Import error:', err);
      setErrorMessage(`Import failed: ${err?.message || 'Please check backup format.'}`);
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Tabs */}
        <div className="flex items-center gap-3 border-b border-white/10 pb-4">
          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={`flex items-center gap-2 pb-1 font-bold text-base transition-colors cursor-pointer ${
              activeTab === 'export'
                ? 'text-emerald-400 border-b-2 border-emerald-400'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Download className="w-5 h-5" />
            <span>Export Data</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('restore')}
            className={`flex items-center gap-2 pb-1 font-bold text-base transition-colors cursor-pointer ml-3 ${
              activeTab === 'restore'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Upload className="w-5 h-5" />
            <span>Restore Backup</span>
          </button>
        </div>

        {/* 1. EXPORT TAB (Default) */}
        {activeTab === 'export' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-zinc-200">
                Choose what you want to export:
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Keep all selected or uncheck anything you don't need. Export starts immediately without freezing the website.
              </p>
            </div>

            {/* Checklist Options */}
            <div className="space-y-3">
              {/* Option 1: SQLite DB */}
              <div
                onClick={() => setIncludeSqlite(!includeSqlite)}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-4 ${
                  includeSqlite
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-white shadow-md shadow-emerald-950/20'
                    : 'bg-zinc-950/40 border-white/5 text-zinc-400 hover:border-white/20'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className={`p-2.5 rounded-xl border ${
                      includeSqlite
                        ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/40'
                        : 'bg-zinc-800 text-zinc-500 border-transparent'
                    }`}
                  >
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">
                        Enriched SQLite Database (.sqlite)
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-semibold border border-emerald-500/30">
                        24.7 MB • 4,806 Titles
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">
                      Raw SQLite database with all 4,806 titles, verified plot synopses, and all 100 continuous parameters.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={includeSqlite}
                  onChange={(e) => setIncludeSqlite(e.target.checked)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-5 h-5 rounded accent-emerald-500 cursor-pointer shrink-0"
                />
              </div>

              {/* Option 2: Enriched JSON */}
              <div
                onClick={() => setIncludeEnrichedJson(!includeEnrichedJson)}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-4 ${
                  includeEnrichedJson
                    ? 'bg-blue-950/40 border-blue-500/50 text-white shadow-md shadow-blue-950/20'
                    : 'bg-zinc-950/40 border-white/5 text-zinc-400 hover:border-white/20'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className={`p-2.5 rounded-xl border ${
                      includeEnrichedJson
                        ? 'bg-blue-600/20 text-blue-400 border-blue-500/40'
                        : 'bg-zinc-800 text-zinc-500 border-transparent'
                    }`}
                  >
                    <FileJson className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">
                        Enriched Movie Plots & Data (.json)
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-mono font-semibold border border-blue-500/30">
                        32.1 MB • All Plots & Pacing
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">
                      Full JSON dataset with verified plots, synopses, story pacing, ending types, audience vibes, and themes.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={includeEnrichedJson}
                  onChange={(e) => setIncludeEnrichedJson(e.target.checked)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-5 h-5 rounded accent-blue-500 cursor-pointer shrink-0"
                />
              </div>

              {/* Option 3: Personal Watchlist & Settings */}
              <div
                onClick={() => setIncludeWatchlist(!includeWatchlist)}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-4 ${
                  includeWatchlist
                    ? 'bg-purple-950/40 border-purple-500/50 text-white shadow-md shadow-purple-950/20'
                    : 'bg-zinc-950/40 border-white/5 text-zinc-400 hover:border-white/20'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className={`p-2.5 rounded-xl border ${
                      includeWatchlist
                        ? 'bg-purple-600/20 text-purple-400 border-purple-500/40'
                        : 'bg-zinc-800 text-zinc-500 border-transparent'
                    }`}
                  >
                    <Film className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">
                        Full System & Watchlist Backup (.json)
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono font-semibold border border-purple-500/30">
                        {items.length} Items • Full 4,806 KB Embedded
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">
                      Portable backup with your watchlist, settings, and all 4,806 enriched movie plots & 100 parameters. Restores directly to IndexedDB on any new device for Qwen 28B.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={includeWatchlist}
                  onChange={(e) => setIncludeWatchlist(e.target.checked)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-5 h-5 rounded accent-purple-500 cursor-pointer shrink-0"
                />
              </div>
            </div>

            {/* Quick Toggle & Counter */}
            <div className="flex items-center justify-between text-xs px-1">
              <span className="text-zinc-400 font-medium">
                {selectedCount} of 3 items selected
              </span>
              <button
                type="button"
                onClick={() => {
                  const allOn = includeSqlite && includeEnrichedJson && includeWatchlist;
                  setIncludeSqlite(!allOn);
                  setIncludeEnrichedJson(!allOn);
                  setIncludeWatchlist(!allOn);
                }}
                className="text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer underline text-xs"
              >
                {includeSqlite && includeEnrichedJson && includeWatchlist ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            {/* 1 Big Export Button */}
            <button
              type="button"
              onClick={handleExportSelected}
              disabled={isExporting || selectedCount === 0}
              className="w-full py-3.5 px-6 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-xl shadow-emerald-950/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2.5 cursor-pointer transform active:scale-[0.99]"
            >
              {isExporting ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>{exportProgress?.message || 'Exporting...'}</span>
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  <span>Export Selected ({selectedCount} item{selectedCount === 1 ? '' : 's'})</span>
                </>
              )}
            </button>

            {/* Live Progress Bar */}
            {isExporting && exportProgress && (
              <div className="space-y-1.5 py-1">
                <div className="flex justify-between text-[11px] text-zinc-400">
                  <span>{exportProgress.message}</span>
                  <span className="font-mono text-emerald-400 font-semibold">{exportProgress.percent}%</span>
                </div>
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-200"
                    style={{ width: `${exportProgress.percent}%` }}
                  />
                </div>
              </div>
            )}

            {exportSuccess && (
              <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5">
                <Check className="w-5 h-5 shrink-0 text-emerald-400" />
                <span>{exportSuccess}</span>
              </div>
            )}

            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>
        )}

        {/* 2. RESTORE TAB */}
        {activeTab === 'restore' && (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-bold text-white">Restore from Backup</h4>
              <p className="text-xs text-zinc-400 mt-0.5">
                Select a previously exported <code className="text-zinc-300">netflix-watchlist-backup-*.json</code> file.
              </p>
            </div>

            <label className="block p-5 rounded-xl border border-dashed border-zinc-700 hover:border-blue-500 cursor-pointer text-center transition-colors bg-zinc-950/50">
              <Upload className="w-8 h-8 mx-auto text-blue-400 mb-2" />
              <span className="text-xs font-semibold text-zinc-200">Click to select backup JSON file</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleFileSelect}
                className="hidden"
                disabled={isReadingFile || isImporting}
              />
            </label>

            {isReadingFile && fileReadProgress && (
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-1.5">
                <div className="flex justify-between text-xs text-blue-300">
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{fileReadProgress.message}</span>
                  </span>
                  <span className="font-mono font-bold">{fileReadProgress.percent}%</span>
                </div>
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-200"
                    style={{ width: `${fileReadProgress.percent}%` }}
                  />
                </div>
              </div>
            )}

            {isImporting && importProgress && (
              <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 space-y-1.5">
                <div className="flex justify-between text-xs text-purple-300">
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{importProgress.message}</span>
                  </span>
                  <span className="font-mono font-bold">{importProgress.percent}%</span>
                </div>
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all duration-200"
                    style={{ width: `${importProgress.percent}%` }}
                  />
                </div>
              </div>
            )}

            {pendingSummary && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-3">
                <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Backup Ready to Apply</span>
                </div>
                <div className="text-xs text-zinc-300 space-y-1">
                  <p>
                    Detected <span className="font-semibold text-white">{pendingSummary.items.length} watchlist items</span>
                    {pendingSummary.sqliteKnowledgeBaseCount > 0 ? (
                      <span> and <span className="font-semibold text-emerald-400">{pendingSummary.sqliteKnowledgeBaseCount} SQLite Knowledge Base titles (100 parameters)</span></span>
                    ) : (pendingSummary.discoveryCatalogCount > 0 ? (
                      <span> and <span className="font-semibold text-emerald-400">{pendingSummary.discoveryCatalogCount} enriched Discovery titles</span></span>
                    ) : null)}
                    {pendingSummary.metadataCacheCount > 0 ? (
                      <span> with <span className="font-semibold text-blue-400">{pendingSummary.metadataCacheCount} cached API items</span></span>
                    ) : null}
                    {pendingSummary.exportedAt ? ` (Snapshot from ${new Date(pendingSummary.exportedAt).toLocaleDateString()})` : ''}.
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    File size: {(pendingSummary.fileSize / (1024 * 1024)).toFixed(1)} MB. Choose restore mode:
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    disabled={isImporting}
                    onClick={() => executeImport('merge')}
                    className="flex-1 px-4 py-2 text-xs font-bold bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white rounded-lg transition-colors border border-zinc-700"
                  >
                    Merge (Keep Existing & Add New)
                  </button>
                  <button
                    disabled={isImporting}
                    onClick={() => executeImport('replace')}
                    className="flex-1 px-4 py-2 text-xs font-bold bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg transition-colors shadow-lg shadow-red-600/20"
                  >
                    Replace Everything (Wipe & Restore)
                  </button>
                </div>
              </div>
            )}

            {importSuccess && (
              <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5">
                <Check className="w-5 h-5 shrink-0 text-emerald-400" />
                <span>{importSuccess}</span>
              </div>
            )}

            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between items-center pt-3 border-t border-white/5">
          <button
            type="button"
            onClick={() => setActiveTab(activeTab === 'export' ? 'restore' : 'export')}
            className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 cursor-pointer"
          >
            {activeTab === 'export' ? (
              <>
                <span>Want to restore a backup instead?</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            ) : (
              <span>Back to Export</span>
            )}
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-medium text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};