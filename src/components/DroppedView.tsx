import React, { useState, useMemo } from 'react';
import { AlertOctagon, RotateCcw, Trash2, Search, Film, Tv, Calendar, MessageSquare, Tag, Play } from 'lucide-react';
import { LibraryItem } from '../types';
import { formatRuntime } from '../services/analytics';
import { getNetflixUrl } from '../services/normalizer';

interface DroppedViewProps {
  items: LibraryItem[];
  onUpdateItem: (item: LibraryItem) => void;
  onDeleteItem: (id: string) => void;
  onOpenDetail: (item: LibraryItem) => void;
  onRequestDeleteConfirm: (item: LibraryItem) => void;
}

export const DroppedView: React.FC<DroppedViewProps> = ({
  items,
  onUpdateItem,
  onDeleteItem: _onDeleteItem,
  onOpenDetail,
  onRequestDeleteConfirm,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReasonFilter, setSelectedReasonFilter] = useState<string>('all');

  // Filter dropped items
  const droppedItems = useMemo(() => {
    return items.filter((x) => x.viewingStatus === 'dropped' || (!x.viewingStatus && x.droppedReason));
  }, [items]);

  // Unique reasons for filtering
  const availableReasons = useMemo(() => {
    const set = new Set<string>();
    droppedItems.forEach((x) => {
      if (x.droppedReason) set.add(x.droppedReason);
    });
    return Array.from(set);
  }, [droppedItems]);

  // Filter & Search
  const displayItems = useMemo(() => {
    let filtered = droppedItems;
    if (selectedReasonFilter !== 'all') {
      filtered = filtered.filter((x) => x.droppedReason === selectedReasonFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (x) =>
          x.originalTitle.toLowerCase().includes(q) ||
          (x.externalTitle && x.externalTitle.toLowerCase().includes(q)) ||
          (x.droppedReason && x.droppedReason.toLowerCase().includes(q)) ||
          (x.droppedNotes && x.droppedNotes.toLowerCase().includes(q))
      );
    }
    return filtered.sort((a, b) => {
      const dateA = new Date(a.droppedAt || a.addedAt || 0).getTime();
      const dateB = new Date(b.droppedAt || b.addedAt || 0).getTime();
      return dateB - dateA;
    });
  }, [droppedItems, selectedReasonFilter, searchQuery]);

  // Restore to library
  const handleRestore = (item: LibraryItem) => {
    const updated: LibraryItem = {
      ...item,
      viewingStatus: 'unwatched',
      droppedReason: undefined,
      droppedNotes: undefined,
      droppedAt: undefined,
    };
    onUpdateItem(updated);
  };

  // Restore to still watching
  const handleRestoreToWatching = (item: LibraryItem) => {
    const updated: LibraryItem = {
      ...item,
      viewingStatus: 'still_watching',
      droppedReason: undefined,
      droppedNotes: undefined,
      droppedAt: undefined,
    };
    onUpdateItem(updated);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <span>Dropped Titles</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
              {droppedItems.length}
            </span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Archived titles you stopped watching, complete with drop reasons and personal notes.
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-zinc-900/60 p-3 rounded-2xl border border-zinc-800">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search dropped titles or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-black/40 border border-zinc-700 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-red-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <span className="text-xs text-zinc-400 font-medium">Reason:</span>
          <select
            value={selectedReasonFilter}
            onChange={(e) => setSelectedReasonFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white font-medium focus:outline-none focus:border-red-500 cursor-pointer"
          >
            <option value="all" className="bg-zinc-900 text-white font-medium">All Reasons ({droppedItems.length})</option>
            {availableReasons.map((r) => (
              <option key={r} value={r} className="bg-zinc-900 text-white font-medium">
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid */}
      {displayItems.length === 0 ? (
        <div className="py-20 text-center space-y-3 bg-zinc-900/20 border border-zinc-800/80 rounded-2xl">
          <AlertOctagon className="w-10 h-10 mx-auto text-zinc-600" />
          <h3 className="text-base font-bold text-zinc-300">No dropped titles</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Titles you decide to drop from your watchlist or active viewing queue will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayItems.map((item) => {
            const isTV = item.mediaType === 'tv';
            const dropDate = item.droppedAt ? new Date(item.droppedAt).toLocaleDateString() : null;

            return (
              <div
                key={item.id}
                className="bg-zinc-900 border border-zinc-800 hover:border-red-500/30 rounded-2xl p-4 flex flex-col justify-between space-y-4 shadow-lg transition-all"
              >
                <div className="flex gap-3">
                  {/* Poster */}
                  <div
                    onClick={() => onOpenDetail(item)}
                    className="w-20 h-28 rounded-xl overflow-hidden bg-zinc-800 shrink-0 border border-zinc-700 cursor-pointer group relative"
                  >
                    {item.posterPath ? (
                      <img
                        src={item.posterPath}
                        alt=""
                        className="w-full h-full object-cover grayscale opacity-75 group-hover:grayscale-0 group-hover:opacity-100 transition-all"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-600">
                        {isTV ? <Tv className="w-8 h-8" /> : <Film className="w-8 h-8" />}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/20 text-red-400 border border-red-500/30">
                        Dropped
                      </span>
                      <span className="text-[10px] text-zinc-400 uppercase font-semibold">
                        {item.mediaType === 'tv' ? 'Series' : 'Movie'}
                      </span>
                    </div>

                    <h3
                      onClick={() => onOpenDetail(item)}
                      className="text-sm font-bold text-white truncate cursor-pointer hover:text-red-400 transition-colors"
                    >
                      {item.externalTitle || item.originalTitle}
                    </h3>

                    {/* Drop reason pill */}
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-950/50 border border-red-800/40 text-[11px] font-semibold text-red-300">
                      <Tag className="w-3 h-3 text-red-400 shrink-0" />
                      <span className="truncate">{item.droppedReason || 'Unspecified Reason'}</span>
                    </div>

                    {dropDate && (
                      <p className="text-[10px] text-zinc-500 flex items-center gap-1 pt-0.5">
                        <Calendar className="w-3 h-3" />
                        <span>Dropped on {dropDate}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Optional Notes */}
                {item.droppedNotes && (
                  <div className="p-2.5 rounded-xl bg-black/40 border border-zinc-800/80 text-xs text-zinc-300 space-y-1">
                    <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-zinc-500">
                      <MessageSquare className="w-3 h-3" />
                      <span>Notes</span>
                    </div>
                    <p className="italic text-zinc-400 text-[11px] line-clamp-3">"{item.droppedNotes}"</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-800/80">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <a
                      href={getNetflixUrl(item)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#E50914] text-white hover:bg-red-700 transition-colors shadow-sm"
                      title="View on Netflix"
                    >
                      <Play className="w-3.5 h-3.5 fill-white" />
                      <span>Netflix</span>
                    </a>
                    <button
                      onClick={() => handleRestore(item)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                      title="Restore to Unwatched Library"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore</span>
                    </button>
                    <button
                      onClick={() => handleRestoreToWatching(item)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 transition-colors"
                      title="Move into Still Watching"
                    >
                      <span>To Watching</span>
                    </button>
                  </div>

                  <button
                    onClick={() => onRequestDeleteConfirm(item)}
                    className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Permanently Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};