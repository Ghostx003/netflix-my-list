import React from 'react';
import { Film, Tv, BarChart3, UploadCloud, Settings as SettingsIcon, RefreshCw, CheckSquare, Info, Compass, Play } from 'lucide-react';
import { AppSettings, LibraryItem } from '../types';
import { openNetflixInNewTab } from '../services/normalizer';

interface NavbarProps {
  activeTab: 'import' | 'movies-series' | 'still-watching' | 'dropped' | 'tracker' | 'discovery' | 'analytics' | 'info';
  setActiveTab: (tab: 'import' | 'movies-series' | 'still-watching' | 'dropped' | 'tracker' | 'discovery' | 'analytics' | 'info') => void;
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
  // Detect Android device
  const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent || '');

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
    <>
      {/* Top Header — hidden on Android devices since bottom bar handles navigation */}
      {!isAndroid && (
        <header className="sticky top-0 z-40 bg-[#141414]/95 backdrop-blur-xl border-b border-white/10 transition-all">
          {/* Row 1: Brand + Action Buttons */}
          <div className="px-3 sm:px-6 lg:px-10 xl:px-14 py-2 flex items-center justify-between gap-3">
            {/* Brand */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <a
                href="https://www.netflix.com"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => openNetflixInNewTab('https://www.netflix.com', e)}
                className="text-[#E50914] font-black text-xl sm:text-2xl tracking-tighter uppercase font-sans drop-shadow-sm hover:scale-105 transition-transform cursor-pointer no-underline"
                title="Open Netflix (opens in new tab)"
              >
                Netflix
              </a>
              <span
                onClick={() => setActiveTab('analytics')}
                className="cursor-pointer text-[10px] sm:text-xs font-semibold uppercase tracking-wider bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded-md text-gray-300 border border-white/5 whitespace-nowrap transition-colors"
                title="Watchlist Analytics Dashboard"
              >
                Watchlist
              </span>
            </div>

          {/* Desktop Nav (lg+) - compact so everything stays perfectly on screen */}
          <nav className="hidden lg:flex items-center gap-1 bg-black/40 p-1 rounded-2xl border border-white/5 flex-1 mx-2 overflow-hidden justify-center">
            <button
              onClick={() => setActiveTab('import')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-all whitespace-nowrap ${
                activeTab === 'import'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Library</span>
              {items.length > 0 && (
                <span className="ml-0.5 text-[10px] px-1.5 py-0.2 bg-black/40 rounded-full font-bold">
                  {items.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('movies-series')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-all whitespace-nowrap ${
                activeTab === 'movies-series'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Movies / Series</span>
              {items.length > 0 && (
                <span className="ml-0.5 text-[10px] px-1.5 py-0.2 bg-black/40 rounded-full font-semibold">
                  {movieCount}M·{tvCount}S
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('still-watching')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-all whitespace-nowrap ${
                activeTab === 'still-watching'
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30 font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Tv className="w-3.5 h-3.5 text-amber-400" />
              <span>Watching</span>
              {stillWatchingCount > 0 && (
                <span className="ml-0.5 text-[10px] px-1.5 py-0.2 bg-amber-500/30 text-amber-300 rounded-full font-bold">
                  {stillWatchingCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('dropped')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-all whitespace-nowrap ${
                activeTab === 'dropped'
                  ? 'bg-red-800 text-white shadow-lg shadow-red-800/30 font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span>Dropped</span>
              {droppedCount > 0 && (
                <span className="ml-0.5 text-[10px] px-1.5 py-0.2 bg-red-500/30 text-red-300 rounded-full font-bold">
                  {droppedCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('tracker')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-all whitespace-nowrap ${
                activeTab === 'tracker'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
              <span>Completed</span>
              {completedCount > 0 && (
                <span className="ml-0.5 text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded-full font-bold">
                  {completedCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('discovery')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-all whitespace-nowrap ${
                activeTab === 'discovery'
                  ? 'bg-[#E50914] text-white shadow-lg shadow-red-600/30 font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Compass className="w-3.5 h-3.5 text-[#E50914]" />
              <span>Discovery</span>
              <span className="ml-0.5 text-[9px] px-1 py-0.1 bg-red-500/20 text-red-300 rounded-full font-bold">
                IN
              </span>
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-all whitespace-nowrap ${
                activeTab === 'analytics'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Analytics</span>
              <span className="ml-0.5 text-[10px] px-1.5 py-0.2 bg-yellow-500/20 text-yellow-300 rounded-full font-mono border border-yellow-500/30 font-semibold">
                {settings.playbackSpeed}×
              </span>
            </button>
          </nav>

          {/* Action Controls — always visible, no text-clipping */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {items.length > 0 && (
              <button
                onClick={onRescan}
                disabled={isRescanning}
                className={'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 transition-colors whitespace-nowrap ' + (isRescanning ? 'bg-white/5 text-gray-400 cursor-not-allowed' : 'bg-white/10 hover:bg-white/20 text-gray-200')}
                title="Refresh / Re-scan missing metadata"
              >
                <RefreshCw className={'w-3.5 h-3.5 ' + (isRescanning ? 'animate-spin text-[#E50914]' : '')} />
                <span className="hidden sm:inline">{isRescanning ? 'Scanning...' : 'Re-scan'}</span>
              </button>
            )}

            <button
              onClick={onOpenBackup}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-gray-200 border border-white/10 transition-colors text-xs font-semibold whitespace-nowrap"
              title="Backup & Restore Database"
            >
              <UploadCloud className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Backup</span>
            </button>

            <a
              href="https://www.netflix.com"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => openNetflixInNewTab('https://www.netflix.com', e)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#E50914] hover:bg-red-700 text-white border border-red-600/40 transition-all text-xs font-bold whitespace-nowrap shadow-md shadow-red-600/20 active:scale-95 cursor-pointer no-underline"
              title="Open Netflix (opens in new tab)"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Netflix</span>
            </a>

            <button
              onClick={onOpenSettings}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-gray-200 border border-white/10 transition-colors text-xs font-semibold whitespace-nowrap"
              title="Settings & API Keys"
            >
              <SettingsIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Settings</span>
            </button>
          </div>
        </div>

        {/* Row 2: Scrollable nav pills on non-xl screens */}
        <div className="xl:hidden border-t border-white/5 overflow-x-auto scrollbar-none">
          <nav className="flex items-center gap-1 px-3 py-1.5 min-w-max">
            <button
              onClick={() => setActiveTab('import')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === 'import'
                  ? 'bg-red-600 text-white font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Library</span>
              {items.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 bg-black/40 rounded-full font-bold">{items.length}</span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('movies-series')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === 'movies-series'
                  ? 'bg-red-600 text-white font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Catalog</span>
              {items.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 bg-black/40 rounded-full font-semibold">{movieCount}M·{tvCount}S</span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('still-watching')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === 'still-watching'
                  ? 'bg-amber-600 text-white font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Tv className="w-3.5 h-3.5 text-amber-400" />
              <span>Watching</span>
              {stillWatchingCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/30 text-amber-300 rounded-full font-bold">{stillWatchingCount}</span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('dropped')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === 'dropped'
                  ? 'bg-red-800 text-white font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span>Dropped</span>
              {droppedCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 bg-red-500/30 text-red-300 rounded-full font-bold">{droppedCount}</span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('tracker')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === 'tracker'
                  ? 'bg-emerald-600 text-white font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
              <span>Completed</span>
              {completedCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-full font-bold">{completedCount}</span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('discovery')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === 'discovery'
                  ? 'bg-[#E50914] text-white font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Compass className="w-3.5 h-3.5 text-[#E50914]" />
              <span>Discovery</span>
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === 'analytics'
                  ? 'bg-red-600 text-white font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Analytics</span>
            </button>
          </nav>
        </div>
      </header>
      )}

      {/* Sleek Mobile Bottom Navigation Bar (Docked) */}
      <div className={`${isAndroid ? 'flex' : 'xl:hidden flex'} fixed bottom-0 left-0 right-0 z-50 bg-[#121212]/95 backdrop-blur-xl border-t border-white/10 px-2 py-1.5 pb-safe items-center justify-around shadow-2xl`}>
        <button
          onClick={() => setActiveTab('movies-series')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all relative ${
            activeTab === 'movies-series' ? 'text-[#E50914] font-bold' : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Film className={`w-5 h-5 mb-0.5 ${activeTab === 'movies-series' ? 'stroke-[2.5]' : 'stroke-2'}`} />
          <span className="text-[10px] tracking-tight">Catalog</span>
          {activeTab === 'movies-series' && (
            <span className="absolute -bottom-1 w-4 h-0.5 bg-[#E50914] rounded-full" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('still-watching')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all relative ${
            activeTab === 'still-watching' ? 'text-amber-400 font-bold' : 'text-zinc-400 hover:text-white'
          }`}
        >
          <div className="relative">
            <Tv className={`w-5 h-5 mb-0.5 ${activeTab === 'still-watching' ? 'stroke-[2.5]' : 'stroke-2'}`} />
            {stillWatchingCount > 0 && (
              <span className="absolute -top-1 -right-2 text-[9px] min-w-[15px] h-[15px] px-1 flex items-center justify-center rounded-full bg-amber-500 text-black font-black">
                {stillWatchingCount}
              </span>
            )}
          </div>
          <span className="text-[10px] tracking-tight">Watching</span>
          {activeTab === 'still-watching' && (
            <span className="absolute -bottom-1 w-4 h-0.5 bg-amber-400 rounded-full" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('dropped')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all relative ${
            activeTab === 'dropped' ? 'text-red-400 font-bold' : 'text-zinc-400 hover:text-white'
          }`}
        >
          <div className="relative">
            <div className="w-5 h-5 mb-0.5 flex items-center justify-center font-bold text-sm">✕</div>
            {droppedCount > 0 && (
              <span className="absolute -top-1 -right-2 text-[9px] min-w-[15px] h-[15px] px-1 flex items-center justify-center rounded-full bg-red-600 text-white font-black">
                {droppedCount}
              </span>
            )}
          </div>
          <span className="text-[10px] tracking-tight">Dropped</span>
          {activeTab === 'dropped' && (
            <span className="absolute -bottom-1 w-4 h-0.5 bg-red-400 rounded-full" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('tracker')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all relative ${
            activeTab === 'tracker' ? 'text-emerald-400 font-bold' : 'text-zinc-400 hover:text-white'
          }`}
        >
          <div className="relative">
            <CheckSquare className={`w-5 h-5 mb-0.5 ${activeTab === 'tracker' ? 'stroke-[2.5]' : 'stroke-2'}`} />
            {completedCount > 0 && (
              <span className="absolute -top-1 -right-2 text-[9px] min-w-[15px] h-[15px] px-1 flex items-center justify-center rounded-full bg-emerald-500 text-black font-black">
                {completedCount}
              </span>
            )}
          </div>
          <span className="text-[10px] tracking-tight">Done</span>
          {activeTab === 'tracker' && (
            <span className="absolute -bottom-1 w-4 h-0.5 bg-emerald-400 rounded-full" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('discovery')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all relative ${
            activeTab === 'discovery' ? 'text-[#E50914] font-bold' : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Compass className={`w-5 h-5 mb-0.5 ${activeTab === 'discovery' ? 'stroke-[2.5]' : 'stroke-2'}`} />
          <span className="text-[10px] tracking-tight">Discover</span>
          {activeTab === 'discovery' && (
            <span className="absolute -bottom-1 w-4 h-0.5 bg-[#E50914] rounded-full" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all relative ${
            activeTab === 'analytics' ? 'text-[#E50914] font-bold' : 'text-zinc-400 hover:text-white'
          }`}
        >
          <BarChart3 className={`w-5 h-5 mb-0.5 ${activeTab === 'analytics' ? 'stroke-[2.5]' : 'stroke-2'}`} />
          <span className="text-[10px] tracking-tight">Stats</span>
          {activeTab === 'analytics' && (
            <span className="absolute -bottom-1 w-4 h-0.5 bg-[#E50914] rounded-full" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('import')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all relative ${
            activeTab === 'import' ? 'text-[#E50914] font-bold' : 'text-zinc-400 hover:text-white'
          }`}
        >
          <UploadCloud className={`w-5 h-5 mb-0.5 ${activeTab === 'import' ? 'stroke-[2.5]' : 'stroke-2'}`} />
          <span className="text-[10px] tracking-tight">Import</span>
          {activeTab === 'import' && (
            <span className="absolute -bottom-1 w-4 h-0.5 bg-[#E50914] rounded-full" />
          )}
        </button>

        <a
          href="https://www.netflix.com"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => openNetflixInNewTab('https://www.netflix.com', e)}
          className="flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all relative text-[#E50914] hover:text-red-400 no-underline cursor-pointer"
          title="Open Netflix (opens in new tab)"
        >
          <Play className="w-5 h-5 mb-0.5 fill-current" />
          <span className="text-[10px] tracking-tight font-bold">Netflix</span>
        </a>

        {isAndroid && (
          <button
            onClick={onOpenSettings}
            className="flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all relative text-zinc-400 hover:text-white"
            title="Settings & Configuration"
          >
            <SettingsIcon className="w-5 h-5 mb-0.5 stroke-2" />
            <span className="text-[10px] tracking-tight">Settings</span>
          </button>
        )}
      </div>
    </>
  );
};
