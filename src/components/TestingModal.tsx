import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Check,
  AlertTriangle,
  Trash2,
  Copy,
  Download,
  RefreshCw,
  Send,
  Search,
  Sparkles,
  Film,
  Tv,
  FlaskConical,
  Database,
  GitCommit,
  GitPullRequest,
  ShieldCheck,
  Terminal,
  ExternalLink,
  Layers,
  CheckCircle2,
  Clock,
  Zap,
} from 'lucide-react';
import { LibraryItem, AppSettings, DiscoveryTitle } from '../types';
import {
  getAllLibraryItems,
  deleteLibraryItems,
  getAllDiscoveryTitles,
  deleteDiscoveryTitles,
} from '../services/db';
import { normalizeTitle } from '../services/normalizer';
import { groqService } from '../services/groqService';
import { DEFAULT_PUBLIC_TMDB_KEY, fetchTmdbUrl } from '../services/tmdb';
import { DEFAULT_WATCHMODE_KEY } from '../services/discoveryService';

interface TestingModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: LibraryItem[];
  settings: AppSettings;
  onRefreshLibrary: () => Promise<void>;
}

type TestingTab = 'duplicates' | 'scan' | 'check_ai' | 'playground' | 'publish';

interface DuplicateGroup {
  normalizedKey: string;
  displayTitle: string;
  mediaType: string;
  items: Array<{
    id: string;
    title: string;
    mediaType: 'movie' | 'tv' | 'unknown';
    releaseYear?: number;
    rating?: number;
    imdbRating?: number;
    posterPath?: string;
    synopsis?: string;
    status?: string;
    source: 'library' | 'discovery';
    score: number;
    isKeep: boolean;
  }>;
}

export const TestingModal: React.FC<TestingModalProps> = ({
  isOpen,
  onClose,
  items: propItems,
  settings,
  onRefreshLibrary,
}) => {
  const [activeTab, setActiveTab] = useState<TestingTab>('duplicates');

  // --- Duplicate Scanning State ---
  const [duplicateScope, setDuplicateScope] = useState<'library' | 'discovery' | 'both'>('library');
  const [isScanningDupes, setIsScanningDupes] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<Set<string>>(new Set());
  const [isDeletingDupes, setIsDeletingDupes] = useState(false);
  const [dupeSuccessMsg, setDupeSuccessMsg] = useState<string | null>(null);

  // --- Catalog Scanning State ---
  const [scanScope, setScanScope] = useState<'library' | 'discovery' | 'both'>('both');
  const [isScanningCatalog, setIsScanningCatalog] = useState(false);
  const [scannedItems, setScannedItems] = useState<Array<LibraryItem | DiscoveryTitle>>([]);
  const [catalogFilter, setCatalogFilter] = useState<'all' | 'movie' | 'tv'>('all');
  const [catalogSearch, setCatalogSearch] = useState('');

  // --- Check AI (Qwen 28B) State ---
  const [aiStatus, setAiStatus] = useState<'idle' | 'checking' | 'online' | 'error'>('idle');
  const [aiPingMetrics, setAiPingMetrics] = useState<{ latencyMs: number; model: string; reply?: string; error?: string } | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'qwen'; text: string; time: string; latency?: number }>>([
    {
      sender: 'qwen',
      text: "Hey! I'm Qwen 28B, Netflix India's narrative intelligence engine. Ask me about any film, series, pace, vibe, or test my response capabilities!",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [aiQuestion, setAiQuestion] = useState('');
  const [isAiAnswering, setIsAiAnswering] = useState(false);

  // --- API Playground State ---
  const [playgroundApi, setPlaygroundApi] = useState<'tmdb' | 'watchmode' | 'omdb'>('tmdb');
  const [playgroundEndpoint, setPlaygroundEndpoint] = useState<string>('search_multi');
  const [playgroundQuery, setPlaygroundQuery] = useState('Inception');
  const [customApiKey, setCustomApiKey] = useState('');
  const [isFetchingApi, setIsFetchingApi] = useState(false);
  const [apiResponse, setApiResponse] = useState<any | null>(null);
  const [apiMetrics, setApiMetrics] = useState<{ status: number; statusText: string; latencyMs: number; url: string } | null>(null);
  const [copyJsonSuccess, setCopyJsonSuccess] = useState(false);

  // --- Publish & Git State ---
  const [isPublishing, setIsPublishing] = useState(false);
  const [gitStatus, setGitStatus] = useState<{ branch?: string; remote?: string; changedCount?: number; statusRaw?: string } | null>(null);
  const [gitCommitMsg, setGitCommitMsg] = useState('chore(catalog): verified and published catalog update');
  const [gitLog, setGitLog] = useState<string | null>(null);
  const [publishSuccessMsg, setPublishSuccessMsg] = useState<string | null>(null);

  // 1. Initial duplicates scan on open or tab change
  const scanForDuplicates = async () => {
    setIsScanningDupes(true);
    setDupeSuccessMsg(null);

    try {
      let pool: Array<{
        id: string;
        title: string;
        mediaType: 'movie' | 'tv' | 'unknown';
        releaseYear?: number;
        rating?: number;
        imdbRating?: number;
        posterPath?: string;
        synopsis?: string;
        status?: string;
        source: 'library' | 'discovery';
      }> = [];

      if (duplicateScope === 'library' || duplicateScope === 'both') {
        const lib = await getAllLibraryItems();
        pool.push(
          ...lib.map((it) => ({
            id: it.id,
            title: it.originalTitle || it.externalTitle || 'Untitled',
            mediaType: it.mediaType || 'unknown',
            releaseYear: it.releaseYear,
            rating: it.rating,
            imdbRating: it.imdbRating,
            posterPath: it.posterPath,
            synopsis: it.synopsis,
            status: it.viewingStatus || it.status,
            source: 'library' as const,
          }))
        );
      }

      if (duplicateScope === 'discovery' || duplicateScope === 'both') {
        const disc = await getAllDiscoveryTitles();
        pool.push(
          ...disc.map((dt) => ({
            id: dt.id,
            title: dt.title || dt.originalTitle || 'Untitled',
            mediaType: dt.mediaType,
            releaseYear: dt.releaseYear,
            rating: dt.rating,
            imdbRating: dt.imdbRating,
            posterPath: dt.posterPath,
            synopsis: dt.synopsis,
            status: dt.isNetflixIndiaVerified ? 'verified' : 'unverified',
            source: 'discovery' as const,
          }))
        );
      }

      // Group by normalized title key
      const groupMap = new Map<string, typeof pool>();
      for (const item of pool) {
        const key = normalizeTitle(item.title).toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!key) continue;
        if (!groupMap.has(key)) {
          groupMap.set(key, []);
        }
        groupMap.get(key)!.push(item);
      }

      // Filter groups with > 1 item
      const groups: DuplicateGroup[] = [];
      const newDeleteIds = new Set<string>();

      for (const [key, items] of groupMap.entries()) {
        if (items.length > 1) {
          // Score each copy to decide the recommended primary copy to keep
          const scored = items.map((it) => {
            let score = 0;
            if (it.posterPath && !it.posterPath.includes('placeholder')) score += 10;
            if (it.synopsis && it.synopsis.length > 50) score += 5;
            if (it.imdbRating && it.imdbRating > 0) score += 4;
            if (it.releaseYear && it.releaseYear > 1900) score += 2;
            if (it.source === 'library') score += 5; // prioritize user's actual watchlist entry
            return {
              ...it,
              score,
              isKeep: false,
            };
          });

          // Sort descending by score
          scored.sort((a, b) => b.score - a.score);

          // Mark first (highest score) as KEEP, others marked for deletion
          scored[0].isKeep = true;
          for (let i = 1; i < scored.length; i++) {
            newDeleteIds.add(scored[i].id);
          }

          groups.push({
            normalizedKey: key,
            displayTitle: scored[0].title,
            mediaType: scored[0].mediaType,
            items: scored,
          });
        }
      }

      setDuplicateGroups(groups);
      setSelectedDeleteIds(newDeleteIds);
    } catch (err) {
      console.error('Duplicate scan error:', err);
    } finally {
      setIsScanningDupes(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'duplicates') {
      scanForDuplicates();
    }
  }, [isOpen, activeTab, duplicateScope]);

  // Bulk Duplicate Actions
  const handleSelectAllDuplicates = () => {
    const allDupes = new Set<string>();
    duplicateGroups.forEach((group) => {
      // Keep item with highest score (index 0), mark all others for deletion
      group.items.slice(1).forEach((item) => allDupes.add(item.id));
    });
    setSelectedDeleteIds(allDupes);
  };

  const handleKeepAll = () => {
    setSelectedDeleteIds(new Set());
  };

  const toggleItemDeletion = (id: string) => {
    setSelectedDeleteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleDeleteSelectedDuplicates = async () => {
    if (selectedDeleteIds.size === 0) return;
    const countToDelete = selectedDeleteIds.size;
    const confirmed = window.confirm(
      `Are you sure you want to delete ${countToDelete} duplicate title(s) from your database? This action cannot be undone.`
    );
    if (!confirmed) return;

    setIsDeletingDupes(true);
    setDupeSuccessMsg(null);

    try {
      const idsToDelete = Array.from(selectedDeleteIds);

      // Delete from library
      await deleteLibraryItems(idsToDelete);

      // Delete from discovery if any
      await deleteDiscoveryTitles(idsToDelete);

      await onRefreshLibrary();
      setDupeSuccessMsg(`Successfully deleted ${countToDelete} duplicate title(s) from your database!`);

      // Re-scan
      await scanForDuplicates();
    } catch (err: any) {
      console.error('Delete duplicates error:', err);
      alert(`Failed to delete duplicates: ${err.message || 'Unknown error'}`);
    } finally {
      setIsDeletingDupes(false);
    }
  };

  // 2. Catalog Scanner Logic
  const handleScanCatalog = async () => {
    setIsScanningCatalog(true);
    try {
      let pool: Array<LibraryItem | DiscoveryTitle> = [];
      if (scanScope === 'library' || scanScope === 'both') {
        const lib = await getAllLibraryItems();
        pool.push(...lib);
      }
      if (scanScope === 'discovery' || scanScope === 'both') {
        const disc = await getAllDiscoveryTitles();
        pool.push(...disc);
      }
      // Deduplicate by ID
      const map = new Map<string, LibraryItem | DiscoveryTitle>();
      for (const it of pool) map.set(it.id, it);
      setScannedItems(Array.from(map.values()));
    } catch (err) {
      console.error('Scan catalog error:', err);
    } finally {
      setIsScanningCatalog(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'scan' && scannedItems.length === 0) {
      handleScanCatalog();
    }
  }, [isOpen, activeTab, scanScope]);

  // Filtered scanned items
  const filteredScanned = useMemo(() => {
    return scannedItems.filter((it) => {
      const title = (it as any).title || (it as any).originalTitle || '';
      if (catalogSearch && !title.toLowerCase().includes(catalogSearch.toLowerCase())) {
        return false;
      }
      if (catalogFilter === 'movie' && it.mediaType !== 'movie') return false;
      if (catalogFilter === 'tv' && it.mediaType !== 'tv') return false;
      return true;
    });
  }, [scannedItems, catalogFilter, catalogSearch]);

  const exactMoviesCount = useMemo(
    () => scannedItems.filter((it) => it.mediaType === 'movie').length,
    [scannedItems]
  );
  const exactTvCount = useMemo(
    () => scannedItems.filter((it) => it.mediaType === 'tv').length,
    [scannedItems]
  );

  const handleExportScanJson = () => {
    const movies = scannedItems.filter((it) => it.mediaType === 'movie');
    const series = scannedItems.filter((it) => it.mediaType === 'tv');

    const payload = {
      scannedAt: new Date().toISOString(),
      summary: {
        totalTitles: scannedItems.length,
        moviesCount: exactMoviesCount,
        tvCount: exactTvCount,
        scope: scanScope,
      },
      movies,
      series,
      allItems: scannedItems,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `netflix-catalog-scan-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 40000);
  };

  // 3. Check AI (Qwen 28B) Logic
  const handleCheckQwenStatus = async () => {
    setAiStatus('checking');
    const res = await groqService.testQwen('Ping test: Confirm Qwen 28B narrative engine is active and ready.');
    if (res.success) {
      setAiStatus('online');
      setAiPingMetrics({ latencyMs: res.latencyMs, model: res.model, reply: res.reply });
    } else {
      setAiStatus('error');
      setAiPingMetrics({ latencyMs: res.latencyMs, model: res.model, error: res.error });
    }
  };

  const handleSendAiQuestion = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!aiQuestion.trim() || isAiAnswering) return;

    const userText = aiQuestion.trim();
    setAiQuestion('');
    setChatMessages((prev) => [
      ...prev,
      {
        sender: 'user',
        text: userText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);

    setIsAiAnswering(true);
    const res = await groqService.testQwen(userText);
    setIsAiAnswering(false);

    setChatMessages((prev) => [
      ...prev,
      {
        sender: 'qwen',
        text: res.success ? (res.reply || 'No content returned.') : `Error: ${res.error || 'Failed to reach Qwen 28B.'}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        latency: res.latencyMs,
      },
    ]);
  };

  // 4. API Playground Logic (Transient - 0 DB writes)
  const handleExecutePlayground = async () => {
    if (isFetchingApi) return;
    setIsFetchingApi(true);
    setApiResponse(null);
    setApiMetrics(null);
    setCopyJsonSuccess(false);

    const startTime = performance.now();
    let url = '';

    try {
      if (playgroundApi === 'tmdb') {
        const key = customApiKey.trim() || settings.tmdbApiKey || DEFAULT_PUBLIC_TMDB_KEY;
        const tmdbBase = typeof window !== 'undefined' ? '/api/tmdb/3' : 'https://api.themoviedb.org/3';
        if (playgroundEndpoint === 'search_multi') {
          url = `${tmdbBase}/search/multi?api_key=${key}&query=${encodeURIComponent(playgroundQuery)}&include_adult=false`;
        } else if (playgroundEndpoint === 'search_movie') {
          url = `${tmdbBase}/search/movie?api_key=${key}&query=${encodeURIComponent(playgroundQuery)}`;
        } else if (playgroundEndpoint === 'search_tv') {
          url = `${tmdbBase}/search/tv?api_key=${key}&query=${encodeURIComponent(playgroundQuery)}`;
        } else if (playgroundEndpoint === 'movie_details') {
          url = `${tmdbBase}/movie/${playgroundQuery.trim()}?api_key=${key}&append_to_response=videos,keywords,credits`;
        } else if (playgroundEndpoint === 'tv_details') {
          url = `${tmdbBase}/tv/${playgroundQuery.trim()}?api_key=${key}&append_to_response=videos,keywords,credits`;
        }
      } else if (playgroundApi === 'watchmode') {
        const key = customApiKey.trim() || settings.watchmodeApiKey || DEFAULT_WATCHMODE_KEY;
        if (playgroundEndpoint === 'search_title') {
          url = `https://api.watchmode.com/v1/search/?apiKey=${key}&search_field=name&search_value=${encodeURIComponent(playgroundQuery)}`;
        } else if (playgroundEndpoint === 'title_details') {
          url = `https://api.watchmode.com/v1/title/${playgroundQuery.trim()}/details/?apiKey=${key}&append_to_response=sources`;
        } else if (playgroundEndpoint === 'sources_india') {
          url = `https://api.watchmode.com/v1/title/${playgroundQuery.trim()}/sources/?apiKey=${key}&regions=IN`;
        }
      } else if (playgroundApi === 'omdb') {
        const key = customApiKey.trim() || settings.omdbApiKey || 'trilogy';
        url = `https://www.omdbapi.com/?apikey=${key}&t=${encodeURIComponent(playgroundQuery)}`;
      }

      let res: Response;
      if (playgroundApi === 'tmdb') {
        res = await fetchTmdbUrl(url);
      } else {
        res = await fetch(url);
      }
      const elapsed = Math.round(performance.now() - startTime);

      let data: any;
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = {
          raw: text.slice(0, 1500),
          error: res.ok ? 'Response was not valid JSON' : `HTTP error: ${res.status} ${res.statusText}`,
          contentType: res.headers.get('content-type') || 'unknown',
        };
      }

      setApiMetrics({
        status: res.status,
        statusText: res.statusText || (res.ok ? 'OK' : 'Error'),
        latencyMs: elapsed,
        url,
      });
      setApiResponse(data);
    } catch (err: any) {
      setApiMetrics({
        status: 0,
        statusText: 'Network / CORS Error',
        latencyMs: Math.round(performance.now() - startTime),
        url,
      });
      setApiResponse({ error: err.message || 'Fetch failed' });
    } finally {
      setIsFetchingApi(false);
    }
  };

  const handleCopyJson = () => {
    if (!apiResponse) return;
    navigator.clipboard.writeText(JSON.stringify(apiResponse, null, 2));
    setCopyJsonSuccess(true);
    setTimeout(() => setCopyJsonSuccess(false), 2000);
  };

  // 5. Git Status & Publish Logic
  const fetchGitStatus = async () => {
    try {
      const res = await fetch('/api/git/status');
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          setGitStatus(data);
        }
      }
    } catch {}
  };

  useEffect(() => {
    if (isOpen && activeTab === 'publish') {
      fetchGitStatus();
    }
  }, [isOpen, activeTab]);

  const handlePushToGit = async () => {
    setIsPublishing(true);
    setGitLog(null);
    setPublishSuccessMsg(null);

    try {
      const res = await fetch('/api/git/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commitMessage: gitCommitMsg || `chore(catalog): verified and published ${exactMoviesCount} movies and ${exactTvCount} series`,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setGitLog(data.log || 'Git command finished.');
        setPublishSuccessMsg(`Successfully committed and pushed to origin/main!`);
        await fetchGitStatus();
      } else {
        const err = await res.json();
        setGitLog(`Error: ${err.error || 'Failed to push to git'}`);
      }
    } catch (err: any) {
      setGitLog(`Dev server middleware unavailable. Use terminal command: git add . && git commit -m "${gitCommitMsg}" && git push origin main`);
    } finally {
      setIsPublishing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fade-in overflow-hidden">
      <div className="relative w-full max-w-5xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col h-[90vh] text-zinc-100 overflow-hidden">
        
        {/* Sticky Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-zinc-900/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">
                  Testing & Maintenance Studio
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono font-semibold border border-purple-500/30">
                  DEVELOPER MODE
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Duplicates cleaner, catalog scanner, Qwen 28B testbed & safe API playground
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Close Testing Studio"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-800 bg-zinc-900/40 px-5 gap-1 shrink-0 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('duplicates')}
            className={`py-3 px-3.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === 'duplicates'
                ? 'border-red-500 text-red-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            <span>Duplicates Cleaner</span>
            {duplicateGroups.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-red-500/20 text-red-300 font-mono">
                {duplicateGroups.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('scan')}
            className={`py-3 px-3.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === 'scan'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Catalog Scanner</span>
            {scannedItems.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-500/20 text-blue-300 font-mono">
                {scannedItems.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('check_ai')}
            className={`py-3 px-3.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === 'check_ai'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Check AI (Qwen 28B)</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('playground')}
            className={`py-3 px-3.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === 'playground'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FlaskConical className="w-4 h-4" />
            <span>API Playground (Sandbox)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('publish')}
            className={`py-3 px-3.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer shrink-0 ml-auto ${
              activeTab === 'publish'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <GitCommit className="w-4 h-4" />
            <span>Publish & Push to Git</span>
          </button>
        </div>

        {/* Tab Body Content */}
        <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">

          {/* ==================== TAB 1: DUPLICATES CLEANER ==================== */}
          {activeTab === 'duplicates' && (
            <div className="space-y-4">
              {/* Controls & Scope Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-red-400" />
                    <span>Exact Duplicate Detection & Resolution</span>
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Scans titles with identical names, automatically recommends the best version to keep, and cleans duplicates in 1 click.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={duplicateScope}
                    onChange={(e) => setDuplicateScope(e.target.value as any)}
                    className="bg-zinc-800 border border-zinc-700 text-xs rounded-lg px-2.5 py-1.5 text-zinc-200 outline-none focus:border-red-500"
                  >
                    <option value="library">Personal Watchlist</option>
                    <option value="discovery">Discovery Catalog</option>
                    <option value="both">Both Watchlist & Discovery</option>
                  </select>

                  <button
                    type="button"
                    onClick={scanForDuplicates}
                    disabled={isScanningDupes}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isScanningDupes ? 'animate-spin' : ''}`} />
                    <span>Re-Scan</span>
                  </button>
                </div>
              </div>

              {/* Duplicate Metric Summary & Bulk Action Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
                  <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">Duplicate Groups</span>
                  <p className="text-xl font-bold text-white mt-0.5">{duplicateGroups.length}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-red-950/20 border border-red-500/20">
                  <span className="text-[10px] text-red-300 uppercase font-bold tracking-wider">Redundant Copies</span>
                  <p className="text-xl font-bold text-red-400 mt-0.5">
                    {duplicateGroups.reduce((acc, g) => acc + (g.items.length - 1), 0)}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
                  <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">Marked For Deletion</span>
                  <p className="text-xl font-bold text-amber-400 mt-0.5">{selectedDeleteIds.size}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20">
                  <span className="text-[10px] text-emerald-300 uppercase font-bold tracking-wider">Unique Keep Titles</span>
                  <p className="text-xl font-bold text-emerald-400 mt-0.5">{duplicateGroups.length}</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllDuplicates}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-900/40 hover:bg-red-900/70 text-red-200 border border-red-700/50 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-red-400" />
                    <span>Select All Duplicates (1-Click)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleKeepAll}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors cursor-pointer"
                  >
                    <span>Keep All (Clear Deletions)</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleDeleteSelectedDuplicates}
                  disabled={selectedDeleteIds.size === 0 || isDeletingDupes}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-red-600 hover:bg-red-500 text-white transition-all shadow-lg shadow-red-600/30 flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>
                    {isDeletingDupes
                      ? 'Deleting Duplicates...'
                      : `Delete ${selectedDeleteIds.size} Duplicate(s) from Database`}
                  </span>
                </button>
              </div>

              {dupeSuccessMsg && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>{dupeSuccessMsg}</span>
                </div>
              )}

              {/* Duplicates List */}
              {isScanningDupes ? (
                <div className="py-16 text-center text-zinc-400 space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-red-400" />
                  <p className="text-xs">Scanning database for duplicate movies & series...</p>
                </div>
              ) : duplicateGroups.length === 0 ? (
                <div className="py-16 text-center text-zinc-400 space-y-2 border border-dashed border-zinc-800 rounded-2xl">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                  <p className="text-sm font-bold text-white">0 Duplicates Found!</p>
                  <p className="text-xs text-zinc-400">Your database is completely clean and deduplicated.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {duplicateGroups.map((group) => (
                    <div
                      key={group.normalizedKey}
                      className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3"
                    >
                      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">{group.displayTitle}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-mono">
                            {group.items.length} copies found
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-400 font-mono">Key: {group.normalizedKey}</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {group.items.map((item, idx) => {
                          const isMarkedDelete = selectedDeleteIds.has(item.id);
                          return (
                            <div
                              key={item.id}
                              onClick={() => toggleItemDeletion(item.id)}
                              className={`p-3 rounded-xl border transition-all cursor-pointer flex gap-3 ${
                                isMarkedDelete
                                  ? 'bg-red-950/20 border-red-500/40 ring-1 ring-red-500/30'
                                  : 'bg-zinc-950/60 border-zinc-800 hover:border-zinc-700'
                              }`}
                            >
                              {/* Poster thumbnail */}
                              <div className="w-12 h-16 bg-zinc-800 rounded-lg overflow-hidden shrink-0">
                                {item.posterPath ? (
                                  <img
                                    src={item.posterPath}
                                    alt={item.title}
                                    className="w-full h-full object-cover"
                                    onError={(e) => ((e.target as HTMLElement).style.display = 'none')}
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-zinc-600">
                                    <Film className="w-5 h-5" />
                                  </div>
                                )}
                              </div>

                              {/* Details */}
                              <div className="flex-1 min-w-0 flex flex-col justify-between">
                                <div>
                                  <div className="flex items-center justify-between gap-1">
                                    <h5 className="text-xs font-bold text-white truncate">{item.title}</h5>
                                    <span
                                      className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase font-bold shrink-0 ${
                                        item.mediaType === 'tv'
                                          ? 'bg-blue-500/20 text-blue-300'
                                          : 'bg-emerald-500/20 text-emerald-300'
                                      }`}
                                    >
                                      {item.mediaType}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-zinc-400 mt-0.5">
                                    {item.releaseYear || 'Unknown Year'} • IMDb {item.imdbRating || item.rating || 'N/A'} • {item.source}
                                  </p>
                                </div>

                                <div className="flex items-center justify-between mt-2 pt-1 border-t border-zinc-800/60 text-[10px]">
                                  <span className="font-mono text-zinc-500 truncate max-w-[120px]">
                                    ID: {item.id}
                                  </span>

                                  <span
                                    className={`px-2 py-0.5 rounded font-bold ${
                                      isMarkedDelete
                                        ? 'bg-red-500/20 text-red-300'
                                        : 'bg-emerald-500/20 text-emerald-300'
                                    }`}
                                  >
                                    {isMarkedDelete ? '✕ Will Delete' : '✓ Keep This'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ==================== TAB 2: CATALOG SCANNER & JSON EXPORT ==================== */}
          {activeTab === 'scan' && (
            <div className="space-y-4">
              {/* Scan Summary Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-400" />
                    <span>Exact Catalog Metric Breakdown & JSON Exporter</span>
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Live scan of all titles stored in your database with exact movie/series counts and full JSON export.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={scanScope}
                    onChange={(e) => setScanScope(e.target.value as any)}
                    className="bg-zinc-800 border border-zinc-700 text-xs rounded-lg px-2.5 py-1.5 text-zinc-200 outline-none focus:border-blue-500"
                  >
                    <option value="both">All Database Titles</option>
                    <option value="library">Personal Watchlist</option>
                    <option value="discovery">Discovery Knowledge Base</option>
                  </select>

                  <button
                    type="button"
                    onClick={handleExportScanJson}
                    disabled={scannedItems.length === 0}
                    className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors flex items-center gap-1.5 cursor-pointer shadow-lg shadow-blue-600/30 disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Scan Details (JSON)</span>
                  </button>
                </div>
              </div>

              {/* Exact Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
                  <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">Total Scanned Titles</span>
                  <p className="text-2xl font-bold text-white mt-1">{scannedItems.length}</p>
                </div>

                <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/20">
                  <span className="text-[10px] text-emerald-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
                    <Film className="w-3 h-3" /> Exact Movies Count
                  </span>
                  <p className="text-2xl font-bold text-emerald-300 mt-1">{exactMoviesCount}</p>
                </div>

                <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-500/20">
                  <span className="text-[10px] text-blue-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
                    <Tv className="w-3 h-3" /> Exact TV Series Count
                  </span>
                  <p className="text-2xl font-bold text-blue-300 mt-1">{exactTvCount}</p>
                </div>

                <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-500/20">
                  <span className="text-[10px] text-purple-400 uppercase font-bold tracking-wider">Verified on Netflix</span>
                  <p className="text-2xl font-bold text-purple-300 mt-1">
                    {scannedItems.filter((x: any) => x.isNetflixIndiaVerified).length}
                  </p>
                </div>
              </div>

              {/* Search & Filter Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    placeholder="Search scanned titles..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex items-center gap-1 w-full sm:w-auto">
                  {(['all', 'movie', 'tv'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setCatalogFilter(mode)}
                      className={`flex-1 sm:flex-none px-3 py-1 text-xs font-semibold rounded-lg capitalize transition-colors cursor-pointer ${
                        catalogFilter === mode
                          ? 'bg-blue-600 text-white font-bold'
                          : 'bg-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {mode === 'all' ? `All (${scannedItems.length})` : mode === 'movie' ? `Movies (${exactMoviesCount})` : `TV (${exactTvCount})`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scanned Titles List */}
              <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950 max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="bg-zinc-900 border-b border-zinc-800 text-[10px] uppercase font-bold text-zinc-400 sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3">Title</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Year</th>
                      <th className="py-2.5 px-3">Rating</th>
                      <th className="py-2.5 px-3">Genres</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900">
                    {filteredScanned.slice(0, 150).map((it) => {
                      const title = (it as any).title || (it as any).originalTitle;
                      return (
                        <tr key={it.id} className="hover:bg-zinc-900/40 transition-colors">
                          <td className="py-2 px-3 font-semibold text-white truncate max-w-[240px]">
                            {title}
                          </td>
                          <td className="py-2 px-3">
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase font-bold ${
                                it.mediaType === 'tv'
                                  ? 'bg-blue-500/20 text-blue-300'
                                  : 'bg-emerald-500/20 text-emerald-300'
                              }`}
                            >
                              {it.mediaType}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-zinc-400">{(it as any).releaseYear || '—'}</td>
                          <td className="py-2 px-3 text-amber-400 font-mono">
                            {(it as any).imdbRating || (it as any).rating || '—'}
                          </td>
                          <td className="py-2 px-3 text-zinc-400 truncate max-w-[200px]">
                            {((it as any).genres || []).join(', ') || 'Drama'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ==================== TAB 3: CHECK AI (QWEN 28B) ==================== */}
          {activeTab === 'check_ai' && (
            <div className="space-y-4">
              {/* Status Verification Card */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-teal-950/40 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-sm font-bold text-white">Qwen 28B Inference Status (`qwen/qwen3.8-27b`)</h3>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        aiStatus === 'online'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : aiStatus === 'error'
                          ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {aiStatus === 'online' ? 'Online & Responsive' : aiStatus === 'error' ? 'Connection Error' : 'Ready to Test'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">
                    High-speed conversational inference for narrative reasoning and recommendation queries.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleCheckQwenStatus}
                  disabled={aiStatus === 'checking'}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg shadow-emerald-950/50 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${aiStatus === 'checking' ? 'animate-spin' : ''}`} />
                  <span>{aiStatus === 'checking' ? 'Testing Connection...' : 'Check AI Status'}</span>
                </button>
              </div>

              {/* Ping Metrics Details */}
              {aiPingMetrics && (
                <div className={`p-3.5 rounded-xl border text-xs ${aiPingMetrics.error ? 'bg-red-950/20 border-red-500/30 text-red-300' : 'bg-zinc-900 border-zinc-800 text-zinc-300'}`}>
                  {aiPingMetrics.error ? (
                    <div className="flex items-center gap-2 text-red-400">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{aiPingMetrics.error}</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                        <Zap className="w-3.5 h-3.5" /> ⚡ Latency: {aiPingMetrics.latencyMs}ms
                      </span>
                      <span className="font-mono text-zinc-400">Model: {aiPingMetrics.model}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Interactive Chat Console */}
              <div className="border border-zinc-800 rounded-2xl bg-zinc-900/60 flex flex-col h-96 overflow-hidden">
                {/* Chat Messages Log */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-center gap-2 text-[10px] text-zinc-500 mb-1">
                        <span>{msg.sender === 'user' ? 'You' : 'Qwen 28B'}</span>
                        <span>•</span>
                        <span>{msg.time}</span>
                        {msg.latency && (
                          <span className="text-emerald-400 font-mono">({msg.latency}ms)</span>
                        )}
                      </div>
                      <div
                        className={`p-3 rounded-2xl max-w-[85%] text-xs leading-relaxed whitespace-pre-wrap ${
                          msg.sender === 'user'
                            ? 'bg-blue-600 text-white rounded-tr-none'
                            : 'bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-tl-none'
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))}

                  {isAiAnswering && (
                    <div className="flex items-center gap-2 text-xs text-zinc-400 p-2">
                      <Sparkles className="w-4 h-4 text-emerald-400 animate-spin" />
                      <span>Qwen 28B is thinking...</span>
                    </div>
                  )}
                </div>

                {/* Quick Prompts */}
                <div className="flex items-center gap-2 p-2 border-t border-zinc-800/80 bg-zinc-950 overflow-x-auto scrollbar-none text-[11px]">
                  {[
                    'Recommend 3 dark psychological thrillers',
                    'Explain difference between slow-burn and relentless pace',
                    'What makes a film bittersweet vs tragic?',
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setAiQuestion(chip)}
                      className="px-2.5 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 shrink-0 cursor-pointer transition-colors"
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                {/* Input Prompt Form */}
                <form onSubmit={handleSendAiQuestion} className="flex gap-2 p-3 bg-zinc-900 border-t border-zinc-800">
                  <input
                    type="text"
                    value={aiQuestion}
                    onChange={(e) => setAiQuestion(e.target.value)}
                    placeholder="Ask Qwen 28B anything to test response..."
                    disabled={isAiAnswering}
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-emerald-500"
                  />
                  <button
                    type="submit"
                    disabled={!aiQuestion.trim() || isAiAnswering}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* ==================== TAB 4: API PLAYGROUND (SANDBOX - 0 DB WRITES) ==================== */}
          {activeTab === 'playground' && (
            <div className="space-y-4">
              {/* Sandbox Notice Banner */}
              <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <span className="font-bold">Playground Sandbox Mode Active:</span> All requests made here are
                  transient tests. Responses are strictly for debugging and will NEVER write or modify items in your database.
                </div>
              </div>

              {/* Playground Form */}
              <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                      Target API
                    </label>
                    <select
                      value={playgroundApi}
                      onChange={(e) => {
                        const val = e.target.value as any;
                        setPlaygroundApi(val);
                        if (val === 'tmdb') setPlaygroundEndpoint('search_multi');
                        else if (val === 'watchmode') setPlaygroundEndpoint('search_title');
                        else setPlaygroundEndpoint('by_title');
                      }}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-white outline-none focus:border-amber-500"
                    >
                      <option value="tmdb">TheMovieDatabase (TMDB)</option>
                      <option value="watchmode">Watchmode (Streaming & India Availability)</option>
                      <option value="omdb">OMDB (IMDb & Rotten Tomatoes)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                      Endpoint / Operation
                    </label>
                    <select
                      value={playgroundEndpoint}
                      onChange={(e) => setPlaygroundEndpoint(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-white outline-none focus:border-amber-500"
                    >
                      {playgroundApi === 'tmdb' && (
                        <>
                          <option value="search_multi">Multi-Search (/search/multi)</option>
                          <option value="search_movie">Movie Search (/search/movie)</option>
                          <option value="search_tv">TV Search (/search/tv)</option>
                          <option value="movie_details">Movie Details (/movie/[id])</option>
                          <option value="tv_details">TV Details (/tv/[id])</option>
                        </>
                      )}
                      {playgroundApi === 'watchmode' && (
                        <>
                          <option value="search_title">Search Title (/search/)</option>
                          <option value="title_details">Title Details (/title/[id]/details/)</option>
                          <option value="sources_india">India Sources (/title/[id]/sources/?regions=IN)</option>
                        </>
                      )}
                      {playgroundApi === 'omdb' && (
                        <>
                          <option value="by_title">Search by Title (?t=)</option>
                          <option value="by_id">Search by IMDb ID (?i=)</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                      Query or ID
                    </label>
                    <input
                      type="text"
                      value={playgroundQuery}
                      onChange={(e) => setPlaygroundQuery(e.target.value)}
                      placeholder="Title or ID (e.g. Inception, 27205)..."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-white outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1 border-t border-zinc-800/80">
                  <div className="w-full sm:w-auto text-[11px] text-zinc-400">
                    Active Key: <span className="font-mono text-zinc-300">
                      {playgroundApi === 'tmdb'
                        ? `${(settings.tmdbApiKey || DEFAULT_PUBLIC_TMDB_KEY).slice(0, 6)}...`
                        : `${(settings.watchmodeApiKey || DEFAULT_WATCHMODE_KEY).slice(0, 6)}...`}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleExecutePlayground}
                    disabled={isFetchingApi || !playgroundQuery.trim()}
                    className="w-full sm:w-auto px-5 py-2 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-500 text-white transition-all shadow-lg shadow-amber-950/50 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <FlaskConical className={`w-3.5 h-3.5 ${isFetchingApi ? 'animate-spin' : ''}`} />
                    <span>{isFetchingApi ? 'Testing API...' : 'Execute Test Fetch'}</span>
                  </button>
                </div>
              </div>

              {/* API Response Display */}
              {apiMetrics && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded font-bold font-mono text-[10px] ${
                          apiMetrics.status === 200
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}
                      >
                        {apiMetrics.status} {apiMetrics.statusText}
                      </span>
                      <span className="text-zinc-400">⚡ Latency: {apiMetrics.latencyMs}ms</span>
                    </div>

                    <button
                      type="button"
                      onClick={handleCopyJson}
                      className="px-2.5 py-1 text-[11px] rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copyJsonSuccess ? 'Copied!' : 'Copy JSON'}</span>
                    </button>
                  </div>

                  {/* Raw JSON Code block */}
                  <div className="border border-zinc-800 rounded-xl bg-zinc-950 p-4 font-mono text-xs text-zinc-300 max-h-80 overflow-y-auto scrollbar-thin">
                    <pre>{JSON.stringify(apiResponse, null, 2)}</pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ==================== TAB 5: PUBLISH & GIT ==================== */}
          {activeTab === 'publish' && (
            <div className="space-y-4">
              {/* Publication Status Card */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-purple-950/40 via-zinc-900 to-indigo-950/40 border border-purple-500/30 space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/40">
                    <GitCommit className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>Publish Verified Catalog & Push to Git</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono font-semibold border border-purple-500/30">
                        PRODUCTION SYNC
                      </span>
                    </h4>
                    <p className="text-xs text-zinc-300 mt-0.5">
                      Sync verified counts ({exactMoviesCount} Movies, {exactTvCount} Series) and commit/push changes directly.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-zinc-800 text-xs">
                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase">Git Branch</span>
                    <p className="font-mono text-white font-bold">{gitStatus?.branch || 'main'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase">Remote Target</span>
                    <p className="font-mono text-zinc-300 truncate">Ghostx003/netflix-my-list</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase">Total Movies</span>
                    <p className="font-bold text-emerald-400">{exactMoviesCount}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase">Total TV Series</span>
                    <p className="font-bold text-blue-400">{exactTvCount}</p>
                  </div>
                </div>
              </div>

              {/* Commit & Push Form */}
              <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                    Commit Message
                  </label>
                  <input
                    type="text"
                    value={gitCommitMsg}
                    onChange={(e) => setGitCommitMsg(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-white outline-none focus:border-purple-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={handlePushToGit}
                  disabled={isPublishing}
                  className="w-full py-3 px-4 rounded-xl font-bold text-xs bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white transition-all shadow-xl shadow-purple-950/50 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <GitPullRequest className={`w-4 h-4 ${isPublishing ? 'animate-spin' : ''}`} />
                  <span>{isPublishing ? 'Publishing & Pushing to Git...' : 'Publish Catalog & Push to Git (origin/main)'}</span>
                </button>
              </div>

              {publishSuccessMsg && (
                <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{publishSuccessMsg}</span>
                </div>
              )}

              {gitLog && (
                <div className="space-y-1.5">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 flex items-center gap-1">
                    <Terminal className="w-3.5 h-3.5" /> Git Execution Log
                  </span>
                  <div className="p-3.5 rounded-xl bg-black border border-zinc-800 font-mono text-xs text-zinc-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {gitLog}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
