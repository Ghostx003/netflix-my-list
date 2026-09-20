import React, { useState } from 'react';
import { X, Save, Upload, Download, AlertTriangle, Check, RefreshCw } from 'lucide-react';
import { LibraryItem, AppSettings, BackupData } from '../types';
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
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ message: string; percent: number } | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pendingSummary, setPendingSummary] = useState<StreamBackupSummary | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [fileReadProgress, setFileReadProgress] = useState<{ message: string; percent: number } | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ message: string; percent: number } | null>(null);

  const [includeThumbnails, setIncludeThumbnails] = useState(false);

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);
    setExportProgress({ message: 'Preparing database snapshot...', percent: 0 });
    setExportSuccess(null);
    setErrorMessage(null);
    try {
      const res = await exportBackup(items, settings, includeThumbnails, (p) => {
        setExportProgress({ message: p.message, percent: p.percent });
      });
      const parts = [`${res.itemCount} library items`];
      if (res.discoveryCount > 0) parts.push(`${res.discoveryCount} Discovery titles (with all TMDB/Watchmode metadata, ratings, cast, themes, genres, synopsis, seasons & episodes)`);
      if (res.metadataCacheCount > 0) parts.push(`${res.metadataCacheCount} cached API items`);
      if (includeThumbnails) parts.push('offline thumbnails included');
      setExportSuccess(`Exported successfully as ${res.filename} (${parts.join(', ')})`);
    } catch (err: any) {
      console.error('Export backup error:', err);
      setErrorMessage(`Failed to generate backup file: ${err?.message || 'Unknown error'}`);
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
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="p-3 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/20">
            <Save className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Backup & Restore Database</h3>
            <p className="text-xs text-zinc-400">
              Save or restore your entire library, reasons, statuses, progress, cache, and settings.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Export Card */}
          <div className="p-4 rounded-xl bg-black/40 border border-zinc-800 space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-white">Export Full Backup</h4>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Downloads a complete JSON snapshot with all {items.length} watchlist items, full Discovery catalog (TMDB + Watchmode enriched metadata: ratings, cast, synopsis, themes, episodes, genres, tagline), API caches, and settings.
                </p>
              </div>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800/60 text-white shadow-lg transition-all whitespace-nowrap"
              >
                {isExporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span>{isExporting ? `${exportProgress?.percent || 0}% Exporting...` : 'Export Backup'}</span>
              </button>
            </div>

            {/* Live Progress Indicator */}
            {isExporting && exportProgress && (
              <div className="space-y-1.5 py-1">
                <div className="flex justify-between text-[11px] text-zinc-400">
                  <span>{exportProgress.message}</span>
                  <span className="font-mono text-blue-400 font-semibold">{exportProgress.percent}%</span>
                </div>
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-200"
                    style={{ width: `${exportProgress.percent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Thumbnail Cache Option Toggle */}
            <div className="pt-2 border-t border-white/5 flex items-center justify-between">
              <div>
                <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeThumbnails}
                    onChange={(e) => setIncludeThumbnails(e.target.checked)}
                    className="rounded accent-blue-500 cursor-pointer"
                  />
                  <span>Include cached thumbnails in backup</span>
                </label>
                <p className="text-[11px] text-zinc-500 ml-5">
                  Embeds offline image thumbnails into the JSON (increases file size, enables 100% offline poster loading).
                </p>
              </div>
              <span className="text-[10px] font-mono text-zinc-400">
                {includeThumbnails ? 'Offline Images Included' : 'Compact (Fast)'}
              </span>
            </div>
          </div>

          {/* Import Card */}
          <div className="p-4 rounded-xl bg-black/40 border border-zinc-800 space-y-4">
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

            {/* Reading / Parsing File Indicator */}
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

            {/* Import Progress Indicator */}
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
                    {pendingSummary.discoveryCatalogCount > 0 ? (
                      <span> and <span className="font-semibold text-emerald-400">{pendingSummary.discoveryCatalogCount} enriched Discovery titles</span></span>
                    ) : null}
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

            {exportSuccess && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>{exportSuccess}</span>
              </div>
            )}

            {importSuccess && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>{importSuccess}</span>
              </div>
            )}

            {errorMessage && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-medium text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};