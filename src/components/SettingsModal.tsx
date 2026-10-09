import React, { useState } from 'react';
import { X, Key, ShieldCheck, Dumbbell, Clock, Sliders, Check, Archive, Download, Upload, AlertTriangle, RefreshCw } from 'lucide-react';
import { AppSettings, LibraryItem } from '../types';
import { exportCompleteZipBackup, restoreCompleteZipBackup, ZipExportProgress } from '../services/zipBackup';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
  items?: LibraryItem[];
  onRefreshLibrary?: () => Promise<void>;
  initialTab?: 'settings' | 'backup';
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
  items = [],
  onRefreshLibrary,
  initialTab = 'settings',
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<'settings' | 'backup'>(initialTab);
  const [form, setForm] = useState<AppSettings>({ ...settings });
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Backup & Restore states
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ZipExportProgress | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<ZipExportProgress | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);
  const [backupErrorMessage, setBackupErrorMessage] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 600);
  };

  // 1-Click Complete Zip Export
  const handleExportZip = async () => {
    setIsExporting(true);
    setBackupErrorMessage(null);
    setExportSuccess(null);
    setExportProgress({ percent: 5, message: 'Initiating complete archive packaging...' });

    try {
      const res = await exportCompleteZipBackup(items, form, (p) => {
        setExportProgress(p);
      });
      const sizeMB = (res.sizeBytes / (1024 * 1024)).toFixed(1);
      setExportSuccess(`Complete backup generated (${res.filename}, ${sizeMB} MB)! Check your browser Downloads.`);
    } catch (err: any) {
      console.error('Settings backup error:', err);
      setBackupErrorMessage(`Failed to export backup: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBackupErrorMessage(null);
    setRestoreSuccess(null);
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleExecuteRestore = async (mode: 'merge' | 'replace') => {
    if (!selectedFile) return;

    setIsRestoring(true);
    setBackupErrorMessage(null);
    setRestoreSuccess(null);
    setRestoreProgress({ percent: 5, message: 'Opening backup archive...' });

    try {
      const res = await restoreCompleteZipBackup(selectedFile, mode, (p) => {
        setRestoreProgress(p);
      });

      const discMsg = res.discoveryCount > 0 ? ` and ${res.discoveryCount} SQLite Knowledge Base titles` : '';
      setRestoreSuccess(`Restored ${res.itemCount} watchlist items${discMsg} into your app and IndexedDB!`);
      setSelectedFile(null);
      if (onRefreshLibrary) {
        await onRefreshLibrary();
      }
    } catch (err: any) {
      console.error('Restore error:', err);
      setBackupErrorMessage(`Restore failed: ${err?.message || 'Please check file format'}`);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-[#18181b] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] text-white my-auto overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Header with Close Button */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/10 bg-[#18181b] sticky top-0 z-20">
          <div>
            <h3 className="text-lg sm:text-xl font-bold flex items-center gap-2">
              <Sliders className="w-5 h-5 text-[#E50914]" />
              <span>Settings & System</span>
            </h3>
            <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5">
              App configuration, viewing speeds, and complete system backup.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-colors shrink-0 ml-2 cursor-pointer"
            title="Close Settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/10 bg-black/30 px-4 sm:px-5 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer ${
              activeTab === 'settings'
                ? 'border-[#E50914] text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            Preferences & Keys
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('backup')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'backup'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Complete Backup (.zip)</span>
          </button>
        </div>

        {/* TAB 1: PREFERENCES */}
        {activeTab === 'settings' && (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 scrollbar-thin">
              {/* Episode Capping Toggle */}
              <div className="bg-black/30 p-4 rounded-xl border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#E50914]" />
                      Episode Calculation Mode
                    </label>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {form.capSeriesEpisodes
                        ? ('Currently capping series calculation to first ' + form.maxEpisodesPerSeries + ' episodes.')
                        : 'Uncapped: calculating full series duration from all episodes.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, capSeriesEpisodes: !form.capSeriesEpisodes })}
                    className={'px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ' + (form.capSeriesEpisodes ? 'bg-[#E50914] text-white' : 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/30')}
                  >
                    {form.capSeriesEpisodes ? 'Capped' : 'Uncapped (Full Series)'}
                  </button>
                </div>

                {form.capSeriesEpisodes && (
                  <div className="pt-2 border-t border-white/5">
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>Episode Cap Limit:</span>
                      <span className="font-mono text-[#E50914] font-bold">{form.maxEpisodesPerSeries} eps</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={50}
                      step={1}
                      value={form.maxEpisodesPerSeries}
                      onChange={(e) => setForm({ ...form, maxEpisodesPerSeries: parseInt(e.target.value, 10) })}
                      className="w-full mt-2 accent-[#E50914] cursor-pointer"
                    />
                  </div>
                )}
              </div>

              {/* Metadata & Catalog API Keys */}
              <div className="bg-black/30 p-4 rounded-xl border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-yellow-400" />
                    Catalog & Metadata APIs (Optional)
                  </label>
                  <span className="text-[10px] text-emerald-400">Free built-in fallback active</span>
                </div>

                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">
                    TMDB API Key (Free tier at <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">themoviedb.org</a>):
                  </label>
                  <input
                    type="password"
                    value={form.tmdbApiKey}
                    onChange={(e) => setForm({ ...form, tmdbApiKey: e.target.value.trim() })}
                    placeholder="Custom TMDB API Key (optional)..."
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#E50914]"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">
                    OMDB API Key (Free tier 1,000 req/day at <a href="https://www.omdbapi.com/apikey.aspx" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">omdbapi.com</a>):
                  </label>
                  <input
                    type="password"
                    value={form.omdbApiKey || ''}
                    onChange={(e) => setForm({ ...form, omdbApiKey: e.target.value.trim() })}
                    placeholder="Custom OMDB API Key (optional)..."
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#E50914]"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">
                    Watchmode API Key (Optional catalog API at <a href="https://api.watchmode.com/" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">watchmode.com</a>):
                  </label>
                  <input
                    type="password"
                    value={form.watchmodeApiKey || ''}
                    onChange={(e) => setForm({ ...form, watchmodeApiKey: e.target.value.trim() })}
                    placeholder="Watchmode API Key (optional)..."
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#E50914]"
                  />
                </div>

                <p className="text-[11px] text-gray-400 flex items-start gap-1 pt-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span>
                    Discovery runs out-of-the-box using verified Netflix India catalog feeds, TMDB Discover, and built-in fallbacks without requiring custom keys!
                  </span>
                </p>
              </div>

              {/* Speeds & Modes Config */}
              <div className="bg-black/30 p-4 rounded-xl border border-white/5 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-gray-200 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#E50914]" />
                      Home Usage Speed
                    </label>
                    <span className="text-xs font-mono font-bold text-white bg-white/10 px-2 py-0.5 rounded">
                      {form.playbackSpeed}×
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[1.0, 1.25, 1.5, 1.75, 2.0].map((speed) => (
                      <button
                        type="button"
                        key={speed}
                        onClick={() => setForm({ ...form, playbackSpeed: speed })}
                        className={'py-1.5 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ' + (form.playbackSpeed === speed ? 'bg-[#E50914] text-white shadow-md' : 'bg-white/5 text-gray-400 hover:bg-white/10')}
                      >
                        {speed}×
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-white/5">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-orange-300 flex items-center gap-1.5">
                      <Dumbbell className="w-3.5 h-3.5 text-orange-400" />
                      Gym & Cardio Playback Speed
                    </label>
                    <span className="text-xs font-mono font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20">
                      {form.gymSpeed || 1.5}×
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[1.0, 1.25, 1.5, 1.75, 2.0].map((speed) => (
                      <button
                        type="button"
                        key={speed}
                        onClick={() => setForm({ ...form, gymSpeed: speed })}
                        className={'py-1.5 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ' + ((form.gymSpeed || 1.5) === speed ? 'bg-orange-500 text-white shadow-md' : 'bg-white/5 text-gray-400 hover:bg-white/10')}
                      >
                        {speed}×
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Gym Duration Config */}
              <div className="bg-black/30 p-4 rounded-xl border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                      <Dumbbell className="w-3.5 h-3.5 text-orange-400" />
                      Enable Gym Workout Watch Mode
                    </label>
                    <p className="text-[11px] text-gray-500">Include gym sessions in your daily watch plan.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, enableGymMode: !form.enableGymMode })}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      form.enableGymMode ? 'bg-orange-500 text-white' : 'bg-white/10 text-gray-400'
                    }`}
                  >
                    {form.enableGymMode ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              </div>
            </div>

            {/* Sticky Footer: Cancel and Save Buttons */}
            <div className="p-4 sm:p-5 border-t border-white/10 bg-[#18181b] flex items-center justify-end gap-3 sticky bottom-0 z-20">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-[#E50914] hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-all shadow-lg flex items-center gap-1.5 active:scale-95 cursor-pointer"
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Saved!</span>
                  </>
                ) : (
                  <span>Save Settings</span>
                )}
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: COMPLETE ZIP BACKUP & RESTORE */}
        {activeTab === 'backup' && (
          <div className="p-4 sm:p-5 space-y-5 overflow-y-auto flex-1 scrollbar-thin">
            {/* 1 Sole Zip Export */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-teal-950/40 border border-emerald-500/30 space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/40">
                  <Archive className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                    <span>1 Sole Backup Archive (.zip)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-semibold border border-emerald-500/30">
                      Zero-Lag
                    </span>
                  </h4>
                  <p className="text-xs text-zinc-300 mt-0.5">
                    Outputs 1 single complete .zip file with your entire library state, settings, and full SQLite database.
                  </p>
                </div>
              </div>

              <ul className="text-xs text-zinc-400 space-y-1 pl-2 border-t border-white/5 pt-2">
                <li>• Watchlist items ({items.length} titles), watch progress, drop reasons & settings</li>
                <li>• Raw SQLite Database (<code className="text-emerald-400">netflix_knowledge_base.sqlite</code>, 24.7 MB)</li>
                <li>• Enriched Movie & Plot Dataset (<code className="text-emerald-400">netflix_enriched_movies_database.json</code>, 32.1 MB)</li>
              </ul>

              <button
                type="button"
                onClick={handleExportZip}
                disabled={isExporting}
                className="w-full py-3.5 px-4 rounded-xl font-bold text-xs bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-xl shadow-emerald-950/50 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
              >
                {isExporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{exportProgress?.message || 'Packaging zip...'}</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Download Complete Backup (.zip)</span>
                  </>
                )}
              </button>

              {isExporting && exportProgress && (
                <div className="space-y-1 py-1">
                  <div className="flex justify-between text-[10px] text-zinc-400">
                    <span>{exportProgress.message}</span>
                    <span className="font-mono text-emerald-400 font-semibold">{exportProgress.percent}%</span>
                  </div>
                  <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-200"
                      style={{ width: `${exportProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              {exportSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{exportSuccess}</span>
                </div>
              )}
            </div>

            {/* Restore Section */}
            <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Upload className="w-4 h-4 text-blue-400" />
                  <span>Restore from Backup (.zip or .json)</span>
                </h4>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Restore your entire app state, watchlist, and SQLite knowledge base on any computer.
                </p>
              </div>

              <label className="block p-4 rounded-xl border border-dashed border-zinc-700 hover:border-blue-500 cursor-pointer text-center transition-colors bg-zinc-950/50">
                <span className="text-xs font-semibold text-zinc-200">
                  {selectedFile ? selectedFile.name : 'Click to select .zip or .json backup file'}
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
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-amber-400">Selected: {selectedFile.name}</span>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={isRestoring}
                      onClick={() => handleExecuteRestore('merge')}
                      className="flex-1 py-2 px-3 text-xs font-bold bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white rounded-lg transition-colors border border-zinc-700 cursor-pointer"
                    >
                      Merge Library
                    </button>
                    <button
                      disabled={isRestoring}
                      onClick={() => handleExecuteRestore('replace')}
                      className="flex-1 py-2 px-3 text-xs font-bold bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg transition-colors shadow-md shadow-red-600/30 cursor-pointer"
                    >
                      Wipe & Restore All
                    </button>
                  </div>
                </div>
              )}

              {isRestoring && restoreProgress && (
                <div className="space-y-1 py-1">
                  <div className="flex justify-between text-[10px] text-zinc-400">
                    <span>{restoreProgress.message}</span>
                    <span className="font-mono text-blue-400 font-semibold">{restoreProgress.percent}%</span>
                  </div>
                  <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-200"
                      style={{ width: `${restoreProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              {restoreSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{restoreSuccess}</span>
                </div>
              )}

              {backupErrorMessage && (
                <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{backupErrorMessage}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
