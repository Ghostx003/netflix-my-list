import React, { useState } from 'react';
import { X, Upload, Download, AlertTriangle, Check, RefreshCw, Archive, Sparkles } from 'lucide-react';
import { LibraryItem, AppSettings } from '../types';
import { exportCompleteZipBackup, restoreCompleteZipBackup, ZipExportProgress } from '../services/zipBackup';

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

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ZipExportProgress | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  // Restore State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<ZipExportProgress | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // Ultra-fast 1-click single ZIP export
  const handleExportZip = async () => {
    setIsExporting(true);
    setErrorMessage(null);
    setExportSuccess(null);
    setExportProgress({ percent: 5, message: 'Initiating complete archive packaging...' });

    try {
      const res = await exportCompleteZipBackup(items, settings, (p) => {
        setExportProgress(p);
      });
      const sizeMB = (res.sizeBytes / (1024 * 1024)).toFixed(1);
      setExportSuccess(`Complete backup generated (${res.filename}, ${sizeMB} MB)! Check your browser Downloads.`);
    } catch (err: any) {
      console.error('Backup ZIP export error:', err);
      setErrorMessage(`Failed to export backup: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    setRestoreSuccess(null);
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleExecuteRestore = async (mode: 'merge' | 'replace') => {
    if (!selectedFile) return;

    setIsRestoring(true);
    setErrorMessage(null);
    setRestoreSuccess(null);
    setRestoreProgress({ percent: 5, message: 'Opening backup archive...' });

    try {
      const res = await restoreCompleteZipBackup(selectedFile, mode, (p) => {
        setRestoreProgress(p);
      });

      const discMsg = res.discoveryCount > 0 ? ` and ${res.discoveryCount} SQLite Knowledge Base titles` : '';
      setRestoreSuccess(`Successfully restored ${res.itemCount} watchlist items${discMsg} to your app and IndexedDB!`);
      setSelectedFile(null);
      await onRefreshLibrary();
    } catch (err: any) {
      console.error('Restore error:', err);
      setErrorMessage(`Restore failed: ${err?.message || 'Please check the file format'}`);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
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
            <Archive className="w-5 h-5" />
            <span>Complete Backup (.zip)</span>
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
            <span>Restore Backup (.zip)</span>
          </button>
        </div>

        {/* 1. EXPORT TAB */}
        {activeTab === 'export' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-teal-950/40 border border-emerald-500/30 space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/40">
                  <Archive className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                    <span>1 Sole Backup Archive</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-semibold border border-emerald-500/30">
                      All-In-One .zip
                    </span>
                  </h4>
                  <p className="text-xs text-zinc-300 mt-0.5">
                    Exports the entire state of the app into a single .zip file. Includes:
                  </p>
                </div>
              </div>

              <ul className="text-xs text-zinc-300 space-y-1.5 pl-2 pt-1 border-t border-white/5">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Personal watchlist ({items.length} titles), watch progress, ratings, and settings</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Raw SQLite Database (<code className="text-emerald-300">netflix_knowledge_base.sqlite</code>) with 100 parameters</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Enriched movie plots & pacing (<code className="text-emerald-300">netflix_enriched_movies_database.json</code>)</span>
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={handleExportZip}
              disabled={isExporting}
              className="w-full py-4 px-6 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-xl shadow-emerald-950/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2.5 cursor-pointer transform active:scale-[0.99]"
            >
              {isExporting ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>{exportProgress?.message || 'Packaging zip...'}</span>
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  <span>Download Complete Backup (.zip)</span>
                </>
              )}
            </button>

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
              <h4 className="text-sm font-bold text-white">Restore from Backup (.zip or .json)</h4>
              <p className="text-xs text-zinc-400 mt-0.5">
                Select your previously exported <code className="text-zinc-300">netflix-complete-backup-*.zip</code> file to restore your entire library, app settings, and 4,806 title SQLite knowledge base.
              </p>
            </div>

            <label className="block p-6 rounded-xl border border-dashed border-zinc-700 hover:border-blue-500 cursor-pointer text-center transition-colors bg-zinc-950/50">
              <Upload className="w-8 h-8 mx-auto text-blue-400 mb-2" />
              <span className="text-xs font-semibold text-zinc-200">
                {selectedFile ? selectedFile.name : 'Click to select .zip (or .json) backup file'}
              </span>
              <input
                type="file"
                accept=".zip,.json,application/zip,application/json"
                onChange={handleFileSelect}
                className="hidden"
                disabled={isRestoring}
              />
            </label>

            {selectedFile && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400">File Selected: {selectedFile.name}</span>
                  <span className="text-[10px] font-mono text-zinc-400">
                    {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={isRestoring}
                    onClick={() => handleExecuteRestore('merge')}
                    className="flex-1 py-2.5 px-3 text-xs font-bold bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white rounded-xl transition-colors border border-zinc-700 cursor-pointer"
                  >
                    Merge (Keep Existing & Add New)
                  </button>
                  <button
                    disabled={isRestoring}
                    onClick={() => handleExecuteRestore('replace')}
                    className="flex-1 py-2.5 px-3 text-xs font-bold bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl transition-colors shadow-lg shadow-red-600/30 cursor-pointer"
                  >
                    Replace Everything (Wipe & Restore)
                  </button>
                </div>
              </div>
            )}

            {isRestoring && restoreProgress && (
              <div className="space-y-1.5 py-1">
                <div className="flex justify-between text-[11px] text-zinc-400">
                  <span>{restoreProgress.message}</span>
                  <span className="font-mono text-blue-400 font-semibold">{restoreProgress.percent}%</span>
                </div>
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-200"
                    style={{ width: `${restoreProgress.percent}%` }}
                  />
                </div>
              </div>
            )}

            {restoreSuccess && (
              <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5">
                <Check className="w-5 h-5 shrink-0 text-emerald-400" />
                <span>{restoreSuccess}</span>
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

        <div className="flex justify-end pt-3 border-t border-white/5">
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