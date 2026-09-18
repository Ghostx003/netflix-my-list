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
  const activeCatalogItems = items.filter(
    (i) => !i.isCompleted && i.viewingStatus !== 'completed' && i.viewingStatus !== 'dropped' && !i.droppedReason
  );
  const movieCount = activeCatalogItems.filter((i) => i.mediaType === 'movie').length;
  const tvCount = activeCatalogItems.filter((i) => i.mediaType === 'tv').length;
  const stillWatchingCount = items.filter(
    (i) => i.viewingStatus === 'still_watching' && !i.isCompleted
  ).length;
  const droppedCount = items.filter(
    (i) => i.viewingStatus === 'dropped' || (!i.viewingStatus && i.droppedReason)
  ).length;
  const completedCount = items.filter((i) => i.isCompleted).length;

  return (
    <header className="sticky top-0 z-40 bg-[#141414]/90 backdrop-blur-md border-b border-white/10 px-4 sm:px-6 lg:px-10 xl:px-14 py-3 transition-all">
      <div className="w-full flex items-center justify-between gap-6 xl:gap-10">
        {/* Brand */}
        <div className="flex items-center gap-6 xl:gap-8 flex-1">
          <div
            onClick={() => setActiveTab('analytics')}
            className="cursor-pointer flex items-center gap-2.5 group flex-shrink-0"
          >
            <span className="text-[#E50914] font-black text-2xl xl:text-3xl tracking-tighter uppercase font-sans drop-shadow-sm group-hover:scale-105 transition-transform">
              Netflix
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider bg-white/10 px-2.5 py-1 rounded-md text-gray-300 border border-white/5 whitespace-nowrap">
              Watchlist Analytics
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="hidden xl:flex items-center gap-2 bg-black/40 p-1.5 rounded-2xl border border-white/5">
            <button
              onClick={() => setActiveTab('import')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === 'import'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <UploadCloud className="w-4 h-4" />
              <span>Library</span>
              {items.length > 0 && (
                <span className="ml-1 text-[11px] px-2 py-0.5 bg-black/40 rounded-full font-bold">
                  {items.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('movies-series')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === 'movies-series'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Film className="w-4 h-4" />
              <span>Movies / Series</span>
              {items.length > 0 && (
                <span className="ml-1 text-[11px] px-2 py-0.5 bg-black/40 rounded-full font-semibold">
                  {movieCount}M · {tvCount}S
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('still-watching')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === 'still-watching'
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30 font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Tv className="w-4 h-4 text-amber-400" />
              <span>Still Watching</span>
              {stillWatchingCount > 0 && (
                <span className="ml-1 text-[11px] px-2 py-0.5 bg-amber-500/30 text-amber-300 rounded-full font-bold">
                  {stillWatchingCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('dropped')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === 'dropped'
                  ? 'bg-red-800 text-white shadow-lg shadow-red-800/30 font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span>Dropped</span>
              {droppedCount > 0 && (
                <span className="ml-1 text-[11px] px-2 py-0.5 bg-red-500/30 text-red-300 rounded-full font-bold">
                  {droppedCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('tracker')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === 'tracker'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <CheckSquare className="w-4 h-4 text-emerald-400" />
              <span>Completed</span>
              {completedCount > 0 && (
                <span className="ml-1 text-[11px] px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-full font-bold">
                  {completedCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === 'analytics'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Analytics</span>
              <span className="ml-1 text-[11px] px-2 py-0.5 bg-yellow-500/20 text-yellow-300 rounded-full font-mono border border-yellow-500/30 font-semibold">
                {settings.playbackSpeed}×
              </span>
            </button>

            <button
              onClick={() => setActiveTab('info')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === 'info'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
              title="Documentation & Features"
            >
              <Info className="w-4 h-4" />
              <span>Info</span>
            </button>
          </nav>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {items.length > 0 && (
            <button
              onClick={onRescan}
              disabled={isRescanning}
              className={'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border border-white/10 transition-colors whitespace-nowrap ' + (isRescanning ? 'bg-white/5 text-gray-400 cursor-not-allowed' : 'bg-white/10 hover:bg-white/20 text-gray-200 shadow-sm')}
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
            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-gray-200 border border-white/10 transition-colors flex items-center gap-2 text-xs font-semibold shadow-sm whitespace-nowrap"
            title="Backup & Restore Database"
          >
            <UploadCloud className="w-4 h-4 text-blue-400" />
            <span className="hidden sm:inline">Backup</span>
          </button>

          <button
            onClick={onOpenSettings}
            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-gray-200 border border-white/10 transition-colors flex items-center gap-2 text-xs font-semibold shadow-sm whitespace-nowrap"
            title="Settings & API Keys"
          >
            <SettingsIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </div>
      </div>

      {/* Mobile nav bottom strip with responsive touch tabs */}
      <div className="flex xl:hidden items-center justify-between pt-2.5 mt-2 border-t border-white/10 text-[10px] sm:text-[11px] overflow-x-auto scrollbar-none gap-1 px-1">
        <button
          onClick={() => setActiveTab('import')}
          className={`flex flex-col items-center py-1 px-2.5 rounded-lg whitespace-nowrap transition-all shrink-0 ${
            activeTab === 'import' ? 'text-[#E50914] bg-red-600/15 font-bold' : 'text-gray-400 hover:text-white'
          }`}
        >
          <UploadCloud className="w-4 h-4 mb-0.5" />
          <span>Library</span>
        </button>

        <button
          onClick={() => setActiveTab('movies-series')}
          className={`flex flex-col items-center py-1 px-2.5 rounded-lg whitespace-nowrap transition-all shrink-0 ${
            activeTab === 'movies-series' ? 'text-[#E50914] bg-red-600/15 font-bold' : 'text-gray-400 hover:text-white'
          }`}
        >
          <Film className="w-4 h-4 mb-0.5" />
          <span>Catalog</span>
        </button>

        <button
          onClick={() => setActiveTab('still-watching')}
          className={`flex flex-col items-center py-1 px-2.5 rounded-lg whitespace-nowrap transition-all shrink-0 ${
            activeTab === 'still-watching' ? 'text-amber-400 bg-amber-500/15 font-bold' : 'text-gray-400 hover:text-white'
          }`}
        >
          <Tv className="w-4 h-4 mb-0.5" />
          <div className="flex items-center gap-1">
            <span>Watching</span>
            {stillWatchingCount > 0 && (
              <span className="text-[9px] px-1 py-0 rounded-full bg-amber-500/30 text-amber-300 font-bold">
                {stillWatchingCount}
              </span>
            )}
          </div>
        </button>

        <button
          onClick={() => setActiveTab('dropped')}
          className={`flex flex-col items-center py-1 px-2.5 rounded-lg whitespace-nowrap transition-all shrink-0 ${
            activeTab === 'dropped' ? 'text-red-400 bg-red-500/15 font-bold' : 'text-gray-400 hover:text-white'
          }`}
        >
          <div className="w-4 h-4 mb-0.5 flex items-center justify-center font-bold text-xs">✕</div>
          <div className="flex items-center gap-1">
            <span>Dropped</span>
            {droppedCount > 0 && (
              <span className="text-[9px] px-1 py-0 rounded-full bg-red-500/30 text-red-300 font-bold">
                {droppedCount}
              </span>
            )}
          </div>
        </button>

        <button
          onClick={() => setActiveTab('tracker')}
          className={`flex flex-col items-center py-1 px-2.5 rounded-lg whitespace-nowrap transition-all shrink-0 ${
            activeTab === 'tracker' ? 'text-emerald-400 bg-emerald-500/15 font-bold' : 'text-gray-400 hover:text-white'
          }`}
        >
          <CheckSquare className="w-4 h-4 mb-0.5" />
          <div className="flex items-center gap-1">
            <span>Done</span>
            {completedCount > 0 && (
              <span className="text-[9px] px-1 py-0 rounded-full bg-emerald-500/30 text-emerald-300 font-bold">
                {completedCount}
              </span>
            )}
          </div>
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex flex-col items-center py-1 px-2.5 rounded-lg whitespace-nowrap transition-all shrink-0 ${
            activeTab === 'analytics' ? 'text-[#E50914] bg-red-600/15 font-bold' : 'text-gray-400 hover:text-white'
          }`}
        >
          <BarChart3 className="w-4 h-4 mb-0.5" />
          <span>Stats</span>
        </button>

        <button
          onClick={() => setActiveTab('info')}
          className={`flex flex-col items-center py-1 px-2.5 rounded-lg whitespace-nowrap transition-all shrink-0 ${
            activeTab === 'info' ? 'text-[#E50914] bg-red-600/15 font-bold' : 'text-gray-400 hover:text-white'
          }`}
        >
          <Info className="w-4 h-4 mb-0.5" />
          <span>Info</span>
        </button>
      </div>
    </header>
  );
};
