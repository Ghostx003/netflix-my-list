import React from 'react';
import { Info, Database, Play, Sparkles, Filter, ShieldCheck, Download, ExternalLink, Zap, Clock, Tv, Film } from 'lucide-react';

export const InfoView: React.FC = () => {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-10 animate-fade-in text-zinc-200">
      {/* Hero Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-600/20 text-[#E50914] border border-red-500/30 text-xs font-bold uppercase tracking-wider">
          <Info className="w-3.5 h-3.5" />
          <span>About Netflix Watchlist Analytics</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
          Your Personal Netflix Command Center
        </h1>
        <p className="text-sm sm:text-base text-zinc-400 max-w-2xl mx-auto leading-relaxed">
          Import your exported Netflix watchlist, automatically enrich movies and TV shows across live streaming APIs, track active watch progress, and calculate your time investment.
        </p>
      </div>

      {/* Feature Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3 hover:border-zinc-700 transition-colors">
          <div className="p-3 rounded-xl bg-red-600/20 text-[#E50914] w-fit border border-red-500/30">
            <Zap className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">Multi-API Live Pipeline</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Cascades across TMDB, OMDb, TVMaze, and Wikipedia in real time to fetch high-res posters, IMDb & Rotten Tomatoes ratings, synopsis, and episode runtimes without hardcoding.
          </p>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3 hover:border-zinc-700 transition-colors">
          <div className="p-3 rounded-xl bg-amber-500/20 text-amber-400 w-fit border border-amber-500/30">
            <Play className="w-6 h-6 fill-current" />
          </div>
          <h3 className="text-base font-bold text-white">Still Watching Tracker</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Track episode-level progress for TV shows and minute-by-minute progress for movies. See your remaining watch time dynamically update as you watch.
          </p>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3 hover:border-zinc-700 transition-colors">
          <div className="p-3 rounded-xl bg-purple-500/20 text-purple-400 w-fit border border-purple-500/30">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">Surprise Me Roulette</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Stuck in decision paralysis? Spin the wheel across configurable pools (Movies, TV, Unwatched, Genres) while automatically filtering out dropped titles.
          </p>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3 hover:border-zinc-700 transition-colors">
          <div className="p-3 rounded-xl bg-blue-500/20 text-blue-400 w-fit border border-blue-500/30">
            <Filter className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">Dynamic Tags & Filters</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Multi-select categories (ANY vs. ALL matching), filter by production countries, year ranges, and sort by duration, Rotten Tomatoes, or IMDb score.
          </p>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3 hover:border-zinc-700 transition-colors">
          <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400 w-fit border border-emerald-500/30">
            <Clock className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">Playback Speed Analytics</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Calculate exactly how many days or weeks it will take to clear your backlog at customizable speeds (e.g. 1.25×, 1.5×, 2.0×) and daily hours.
          </p>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3 hover:border-zinc-700 transition-colors">
          <div className="p-3 rounded-xl bg-cyan-500/20 text-cyan-400 w-fit border border-cyan-500/30">
            <Database className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">Persistent DB & Backup</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            All data is saved locally in browser IndexedDB. Export full JSON snapshots anytime and restore with Merge or Clean Replace.
          </p>
        </div>
      </div>

      {/* How It Works Section */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[#E50914]" />
          <span>How Your Data is Handled</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-zinc-400">
          <div className="bg-black/40 p-4 rounded-xl border border-zinc-800 space-y-2">
            <span className="text-white font-bold block text-sm">1. 100% Private & Local</span>
            <p>Your library is stored exclusively in your browser's IndexedDB. No personal watch history is sent to any private tracking server.</p>
          </div>
          <div className="bg-black/40 p-4 rounded-xl border border-zinc-800 space-y-2">
            <span className="text-white font-bold block text-sm">2. Live API Metadata</span>
            <p>Public metadata (posters, trailers, ratings) is resolved in real time through official endpoints and cached locally to prevent rate limits.</p>
          </div>
          <div className="bg-black/40 p-4 rounded-xl border border-zinc-800 space-y-2">
            <span className="text-white font-bold block text-sm">3. Portability</span>
            <p>Use the Backup & Restore feature anytime to export your exact collection and migrate between browsers or machines.</p>
          </div>
        </div>
      </div>

      {/* Architecture Tags */}
      <div className="flex flex-wrap items-center justify-center gap-2 pt-4">
        {['React 19', 'TypeScript', 'Vite', 'Tailwind CSS', 'IndexedDB', 'Vercel Ready', 'Mobile Responsive', 'Canvas Confetti', 'TMDB & OMDb API'].map((tag) => (
          <span
            key={tag}
            className="px-3 py-1 rounded-full text-xs font-semibold bg-zinc-800/80 text-zinc-400 border border-zinc-700/50"
          >
            #{tag}
          </span>
        ))}
      </div>
    </div>
  );
};
