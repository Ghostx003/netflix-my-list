import React from 'react';
import { Film, Tv, BarChart3, UploadCloud, Settings as SettingsIcon, RefreshCw, CheckSquare, Info } from 'lucide-react';
import { AppSettings, LibraryItem } from '../types';

interface NavbarProps {
  activeTab: 'import' | 'movies-series' | 'still-watching' | 'dropped' | 'tracker' | 'analytics' | 'info';
  setActiveTab: (tab: 'import' | 'movies-series' | 'still-watching' | 'dropped' | 'tracker' | 'analytics' | 'info') => void;
  items: LibraryItem[];
  settings: AppSettings;
  onOpenSettings: () => void;
  onOpenBackup: () => void;
  onRescan: () => void;
  isRescanning: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  items,
  settings,
  onOpenSettings,
  onOpenBackup,
  onRescan,
  isRescanning,
}) => {
  const movieCount = items.filter((i) => i.mediaType === 'movie').length;
  const tvCount = items.filter((i) => i.mediaType === 'tv').length;
  const stillWatchingCount = items.filter(
    (i) => i.viewingStatus === 'still_watching' && !i.isCompleted
  ).length;
  const droppedCount = items.filter(
    (i) => i.viewingStatus === 'dropped' || (!i.viewingStatus && i.droppedReason)
  ).length;
  const completedCount = items.filter((i) => i.isCompleted).length;

  return (
    <header className="sticky top-0 z-40 bg-[#141414]/90 backdrop-blur-md border-b border-white/10 px-4 lg:px-8 py-3 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <div
            onClick={() => setActiveTab('analytics')}
            className="cursor-pointer flex items-center gap-2 group"
          >
            <span className="text-[#E50914] font-black text-2xl tracking-tighter uppercase font-sans drop-shadow-sm group-hover:scale-105 transition-transform">
              Netflix
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider bg-white/10 px-2 py-0.5 rounded text-gray-300 border border-white/5">
              Watchlist Analytics
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="hidden xl:flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/5">
            <button
              onClick={() => setActiveTab('import')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'import'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Library</span>
              {items.length > 0 && (
                <span className="ml-1 text-[10px] px-1.5 py-0.2 bg-black/30 rounded-full">
                  {items.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('movies-series')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'movies-series'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Movies / Series</span>
              {items.length > 0 && (
                <span className="ml-1 text-[10px] px-1.5 py-0.2 bg-black/30 rounded-full">
                  {movieCount}M · {tvCount}S
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('still-watching')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'still-watching'
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Tv className="w-3.5 h-3.5 text-amber-400" />
              <span>Still Watching</span>
              {stillWatchingCount > 0 && (
                <span className="ml-1 text-[10px] px-1.5 py-0.2 bg-amber-500/30 text-amber-300 rounded-full font-bold">
                  {stillWatchingCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('dropped')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'dropped'
                  ? 'bg-red-800 text-white shadow-lg shadow-red-800/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span>Dropped</span>
              {droppedCount > 0 && (
                <span className="ml-1 text-[10px] px-1.5 py-0.2 bg-red-500/30 text-red-300 rounded-full font-bold">
                  {droppedCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('tracker')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'tracker'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
              <span>Completed</span>
              {completedCount > 0 && (
                <span className="ml-1 text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded-full font-bold">
                  {completedCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'analytics'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Analytics</span>
              <span className="ml-1 text-[10px] px-1.5 py-0.2 bg-yellow-500/20 text-yellow-300 rounded-full font-mono border border-yellow-500/30">
                {settings.playbackSpeed}×
              </span>
            </button>

            <button
              onClick={() => setActiveTab('info')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'info'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
              title="Documentation & Features"
            >
              <Info className="w-3.5 h-3.5" />
              <span>Info</span>
            </button>
          </nav>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          {items.length > 0 && (
            <button
              onClick={onRescan}
              disabled={isRescanning}
              className={'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 transition-colors ' + (isRescanning ? 'bg-white/5 text-gray-400 cursor-not-allowed' : 'bg-white/10 hover:bg-white/20 text-gray-200')}
              title="Refresh / Re-scan missing metadata"
            >
              <RefreshCw className={'w-3.5 h-3.5 ' + (isRescanning ? 'animate-spin text-[#E50914]' : '')} />
              <span className="hidden sm:inline">
                {isRescanning ? 'Scanning...' : 'Re-scan'}
              </span>
            </button>
          )}

          <button
            onClick={onOpenBackup}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-gray-200 border border-white/10 transition-colors flex items-center gap-1.5 text-xs font-medium"
            title="Backup & Restore Database"
          >
            <UploadCloud className="w-4 h-4 text-blue-400" />
            <span className="hidden sm:inline">Backup</span>
          </button>

          <button
            onClick={onOpenSettings}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-gray-200 border border-white/10 transition-colors flex items-center gap-1.5 text-xs font-medium"
            title="Settings & API Keys"
          >
            <SettingsIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </div>
      </div>

      {/* Mobile nav bottom strip */}
      <div className="flex xl:hidden items-center justify-around pt-2 mt-2 border-t border-white/10 text-[11px] overflow-x-auto">
        <button
          onClick={() => setActiveTab('import')}
          className={'flex flex-col items-center py-1 px-2 whitespace-nowrap ' + (activeTab === 'import' ? 'text-[#E50914] font-bold' : 'text-gray-400')}
        >
          <span>Library</span>
        </button>
        <button
          onClick={() => setActiveTab('movies-series')}
          className={'flex flex-col items-center py-1 px-2 whitespace-nowrap ' + (activeTab === 'movies-series' ? 'text-[#E50914] font-bold' : 'text-gray-400')}
        >
          <span>Catalog</span>
        </button>
        <button
          onClick={() => setActiveTab('still-watching')}
          className={'flex flex-col items-center py-1 px-2 whitespace-nowrap ' + (activeTab === 'still-watching' ? 'text-amber-400 font-bold' : 'text-gray-400')}
        >
          <span>Watching</span>
        </button>
        <button
          onClick={() => setActiveTab('dropped')}
          className={'flex flex-col items-center py-1 px-2 whitespace-nowrap ' + (activeTab === 'dropped' ? 'text-red-400 font-bold' : 'text-gray-400')}
        >
          <span>Dropped</span>
        </button>
        <button
          onClick={() => setActiveTab('tracker')}
          className={'flex flex-col items-center py-1 px-2 whitespace-nowrap ' + (activeTab === 'tracker' ? 'text-emerald-400 font-bold' : 'text-gray-400')}
        >
          <span>Completed</span>
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={'flex flex-col items-center py-1 px-2 whitespace-nowrap ' + (activeTab === 'analytics' ? 'text-[#E50914] font-bold' : 'text-gray-400')}
        >
          <span>Analytics</span>
        </button>
        <button
          onClick={() => setActiveTab('info')}
          className={'flex flex-col items-center py-1 px-2 whitespace-nowrap ' + (activeTab === 'info' ? 'text-[#E50914] font-bold' : 'text-gray-400')}
        >
          <span>Info</span>
        </button>
      </div>
    </header>
  );
};
