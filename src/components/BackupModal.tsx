import React, { useState } from 'react';
import { X, Save, Upload, Download, AlertTriangle, Check, RefreshCw } from 'lucide-react';
import { LibraryItem, AppSettings, BackupData } from '../types';
import { exportBackup, validateBackup, importBackupMerge, importBackupReplace } from '../services/backup';

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
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  const [pendingBackup, setPendingBackup] = useState<BackupData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);
    setExportSuccess(null);
    try {
      const file = await exportBackup(items, settings);
      setExportSuccess(`Exported successfully as ${file}`);
    } catch (err) {
      setErrorMessage('Failed to generate backup file.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    setImportSuccess(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        const validation = validateBackup(parsed);
        if (!validation.valid || !validation.data) {
          setErrorMessage(validation.error || 'Invalid backup format.');
          return;
        }
        setPendingBackup(validation.data);
      } catch (err) {
        setErrorMessage('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
  };

  const executeImport = async (mode: 'merge' | 'replace') => {
    if (!pendingBackup) return;
    setIsImporting(true);
    setErrorMessage(null);
    try {
      if (mode === 'replace') {
        const res = await importBackupReplace(pendingBackup);
        setImportSuccess(`Complete library replaced with ${res.count} titles.`);
      } else {
        const res = await importBackupMerge(pendingBackup);
        setImportSuccess(`Merged successfully: +${res.addedCount} new, ${res.updatedCount} updated (${res.totalCount} total).`);
      }
      setPendingBackup(null);
      await onRefreshLibrary();
    } catch (err) {
      setErrorMessage('Import failed. Please check backup format.');
    } finally {
      setIsImporting(false);
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
              Save or restore your entire library, reasons, statuses, progress, and settings.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Export Card */}
          <div className="p-4 rounded-xl bg-black/40 border border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold text-white">Export Full Backup</h4>
              <p className="text-xs text-zinc-400 mt-0.5">
                Downloads a JSON snapshot with {items.length} titles and all your personal metadata.
              </p>
            </div>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg transition-all"
            >
              <Download className="w-4 h-4" />
              <span>{isExporting ? 'Exporting...' : 'Export Backup'}</span>
            </button>
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
              />
            </label>

            {pendingBackup && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-3">
                <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Backup Ready to Apply</span>
                </div>
                <p className="text-xs text-zinc-300">
                  Detected <span className="font-semibold text-white">{pendingBackup.items.length} items</span> from {pendingBackup.exportedAt ? new Date(pendingBackup.exportedAt).toLocaleDateString() : 'archive'}. Choose how you want to restore:
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    disabled={isImporting}
                    onClick={() => executeImport('merge')}
                    className="flex-1 px-4 py-2 text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors border border-zinc-700"
                  >
                    Merge (Keep Existing & Add New)
                  </button>
                  <button
                    disabled={isImporting}
                    onClick={() => executeImport('replace')}
                    className="flex-1 px-4 py-2 text-xs font-bold bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors shadow-lg shadow-red-600/20"
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