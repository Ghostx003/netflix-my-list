import React, { useState, useRef } from 'react';
import { UploadCloud, Plus, FileText, CheckCircle2, Copy, Trash2, ArrowRight, Sparkles, AlertCircle } from 'lucide-react';
import confetti from 'canvas-confetti';
import { LibraryItem, NetflixRawItem } from '../types';
import { deduplicateAndPrepareItems } from '../services/duplicateDetector';

interface ImportLibraryViewProps {
  items: LibraryItem[];
  onAddItems: (newItems: LibraryItem[]) => void;
  onClearLibrary: () => void;
  onNavigateToCatalog: () => void;
}

export const ImportLibraryView: React.FC<ImportLibraryViewProps> = ({
  items,
  onAddItems,
  onClearLibrary,
  onNavigateToCatalog,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [manualTitle, setManualTitle] = useState('');
  const [importSummary, setImportSummary] = useState<{
    added: number;
    duplicates: number;
    skippedTitles: string[];
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const processJsonString = (jsonText: string) => {
    setErrorMsg(null);
    try {
      const parsed = JSON.parse(jsonText);
      let rawList: (NetflixRawItem | string)[] = [];

      if (Array.isArray(parsed)) {
        rawList = parsed;
      } else if (parsed && Array.isArray(parsed.titles)) {
        rawList = parsed.titles;
      } else {
        throw new Error('JSON must be an array of objects like [{"title": "Dark"}]');
      }

      const { newItems, duplicateCount, skippedTitles } = deduplicateAndPrepareItems(rawList, items);

      if (newItems.length > 0) {
        onAddItems(newItems);
        try {
          confetti({
            particleCount: 80,
            spread: 60,
            origin: { y: 0.7 },
          });
        } catch {}
      }

      setImportSummary({
        added: newItems.length,
        duplicates: duplicateCount,
        skippedTitles,
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to parse JSON file.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) processJsonString(content);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim()) return;

    const { newItems, duplicateCount, skippedTitles } = deduplicateAndPrepareItems(
      [{ title: manualTitle.trim() }],
      items
    );

    if (newItems.length > 0) {
      onAddItems(newItems);
      setImportSummary({
        added: 1,
        duplicates: 0,
        skippedTitles: [],
      });
      setManualTitle('');
    } else {
      setImportSummary({
        added: 0,
        duplicates: 1,
        skippedTitles: [manualTitle.trim()],
      });
    }
  };

  // Quick load sample netflix json from project
  const handleLoadSampleFile = async () => {
    try {
      const res = await fetch('/netflix-my-list.json');
      if (res.ok) {
        const text = await res.text();
        processJsonString(text);
      }
    } catch {
      // Fallback
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-8 animate-in fade-in duration-300">
      {/* Hero Welcome Banner */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-neutral-900 via-neutral-950 to-black border border-white/10 p-8 shadow-2xl">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E50914]/10 border border-[#E50914]/30 text-[#E50914] text-xs font-semibold uppercase tracking-wider mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Smart Watchlist Importer</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">
            Import your Netflix My List.
          </h1>
          <p className="mt-3 text-gray-400 text-sm sm:text-base leading-relaxed">
            Drop your Netflix export JSON file here. The system extracts your titles, eliminates duplicates across multiple imports, detects Movies vs TV shows, queries TMDB metadata, and builds your viewing projection.
          </p>
        </div>
      </div>

      {/* Grid: JSON Import Dropzone + Manual Title Addition */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Dropzone Column */}
        <div className="md:col-span-7 flex flex-col">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                  const content = evt.target?.result as string;
                  if (content) processJsonString(content);
                };
                reader.readAsText(file);
              }
            }}
            className={`border-2 border-dashed rounded-2xl p-8 text-center flex flex-col items-center justify-center transition-all cursor-pointer flex-1 min-h-[260px] ${
              dragOver
                ? 'border-[#E50914] bg-[#E50914]/10'
                : 'border-white/15 bg-white/[0.02] hover:border-white/30 hover:bg-white/[0.04]'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".json"
              className="hidden"
            />
            <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#E50914] mb-4 shadow-lg group-hover:scale-110 transition-transform">
              <UploadCloud className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white">Import Netflix JSON</h3>
            <p className="text-xs text-gray-400 mt-1.5 max-w-xs">
              Drag & drop your <span className="text-white font-mono">.json</span> file here, or click to browse.
            </p>
            <div className="mt-4 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-colors border border-white/10 shadow-sm">
              Select JSON File
            </div>
          </div>
        </div>

        {/* Manual Add Title Column */}
        <div className="md:col-span-5 flex flex-col justify-between bg-[#1c1c1e] p-6 rounded-2xl border border-white/10 shadow-lg">
          <div>
            <div className="flex items-center gap-2 text-white font-bold text-base mb-1">
              <Plus className="w-4 h-4 text-[#E50914]" />
              <span>Add Title Manually</span>
            </div>
            <p className="text-xs text-gray-400">
              Want to add a single movie or series? Enter it here and it will go through the exact same duplicate & metadata identification pipeline.
            </p>

            <form onSubmit={handleManualAdd} className="mt-4 space-y-3">
              <input
                type="text"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder="e.g. Inception, Breaking Bad..."
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#E50914]"
              />
              <button
                type="submit"
                disabled={!manualTitle.trim()}
                className="w-full py-2.5 bg-[#E50914] hover:bg-red-700 disabled:opacity-50 text-white font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow-md"
              >
                <Plus className="w-4 h-4" />
                <span>Add Title to Library</span>
              </button>
            </form>
          </div>

          {/* Quick Demo Helper */}
          <div className="mt-6 pt-4 border-t border-white/5">
            <p className="text-[11px] text-gray-500 mb-2">Workspace Quick Action:</p>
            <button
              type="button"
              onClick={handleLoadSampleFile}
              className="w-full py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium border border-white/10 flex items-center justify-center gap-2 transition-colors"
            >
              <FileText className="w-3.5 h-3.5 text-[#E50914]" />
              <span>Load Workspace `netflix-my-list.json`</span>
            </button>
          </div>
        </div>
      </div>

      {/* Error Message if any */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/50 text-red-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Import Feedback Banner */}
      {importSummary && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-[#1c1c1e] to-neutral-900 border border-white/10 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <CheckCircle2 className="w-5 h-5" />
              <span>Import Completed Successfully</span>
            </div>
            <button
              onClick={onNavigateToCatalog}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#E50914] hover:bg-red-700 text-white text-xs font-semibold shadow-md transition-colors"
            >
              <span>View Movies & Series</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 text-xs">
            <div className="bg-black/30 p-3 rounded-xl border border-white/5">
              <span className="text-gray-400 block text-[11px]">New Titles Added</span>
              <span className="text-lg font-black text-white">{importSummary.added}</span>
            </div>
            <div className="bg-black/30 p-3 rounded-xl border border-white/5">
              <span className="text-gray-400 block text-[11px]">Duplicates Prevented</span>
              <span className="text-lg font-black text-yellow-400">{importSummary.duplicates}</span>
            </div>
            <div className="bg-black/30 p-3 rounded-xl border border-white/5 col-span-2 sm:col-span-1">
              <span className="text-gray-400 block text-[11px]">Total Unique Library</span>
              <span className="text-lg font-black text-[#E50914]">{items.length}</span>
            </div>
          </div>

          {importSummary.skippedTitles.length > 0 && (
            <div className="text-[11px] text-gray-400 pt-1">
              <span className="text-yellow-400 font-semibold">Protected against duplicates:</span>{' '}
              {importSummary.skippedTitles.slice(0, 5).join(', ')}
              {importSummary.skippedTitles.length > 5 && ` and ${importSummary.skippedTitles.length - 5} more.`}
            </div>
          )}
        </div>
      )}

      {/* Library Summary & Status Table */}
      <div className="bg-[#1c1c1e] rounded-2xl border border-white/10 p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <h3 className="text-lg font-bold text-white">Stored Library Overview</h3>
            <p className="text-xs text-gray-400">
              {items.length === 0
                ? 'Your library is currently empty. Import a JSON file above to get started.'
                : `${items.length} unique titles currently tracked in local database.`}
            </p>
          </div>

          {items.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={onClearLibrary}
                className="px-3 py-1.5 rounded-lg bg-red-950/30 hover:bg-red-900/50 text-red-300 border border-red-800/30 text-xs font-medium flex items-center gap-1.5 transition-colors"
                title="Clear all stored items"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Reset Library</span>
              </button>
            </div>
          )}
        </div>

        {items.length > 0 ? (
          <div className="mt-4 max-h-[300px] overflow-y-auto divide-y divide-white/5 text-xs">
            {items.slice(0, 15).map((item) => (
              <div key={item.id} className="py-2.5 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-semibold text-white truncate">
                    {item.originalTitle}
                  </div>
                  <div className="text-[11px] text-gray-500 font-mono">
                    Normalized: {item.normalizedTitle}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      item.mediaType === 'movie'
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        : item.mediaType === 'tv'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : 'bg-gray-700 text-gray-300'
                    }`}
                  >
                    {item.mediaType}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      item.status === 'matched'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : item.status === 'needs_review'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-neutral-800 text-gray-400'
                    }`}
                  >
                    {item.status.replace('_', ' ')}
                  </span>
                </div>
              </div>
            ))}
            {items.length > 15 && (
              <div className="pt-3 text-center text-gray-500 text-xs">
                ...and {items.length - 15} more titles stored in your catalog.
              </div>
            )}
          </div>
        ) : (
          <div className="py-12 text-center text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-3 text-gray-600" />
            <p className="text-sm">No items imported yet.</p>
          </div>
        )}
      </div>
    </div>
  );
};
