import React from 'react';
import {
  Clock,
  Dumbbell,
  Zap,
  Calendar,
  Layers,
  Film,
  Tv,
  Sparkles,
  CheckCircle2,
  Sliders,
  Utensils,
  Hourglass,
} from 'lucide-react';
import { AppSettings, LibraryItem } from '../types';
import { computeAnalytics, formatRuntime } from '../services/analytics';

interface AnalyticsViewProps {
  items: LibraryItem[];
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  onOpenSettings: () => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  items,
  settings,
  onUpdateSettings,
  onOpenSettings,
}) => {
  const stats = computeAnalytics(items, settings);

  const speedOptions = [1.0, 1.25, 1.5, 1.75, 2.0];

  // Visual distribution percentages
  const moviePercent =
    stats.totalContentMinutes > 0
      ? Math.round((stats.movieContentMinutes / stats.totalContentMinutes) * 100)
      : 50;
  const tvPercent = 100 - moviePercent;

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 lg:px-8 space-y-8 animate-in fade-in duration-300">
      {/* Primary Hero Section: The Key Statements Required */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-neutral-900 via-[#18181b] to-black border border-white/10 p-8 sm:p-10 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#E50914]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-4xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E50914]/10 border border-[#E50914]/30 text-[#E50914] text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Library Watch Completion Forecast</span>
          </div>

          {/* Statement 1: Remaining vs Total */}
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
            You have <span className="text-[#E50914]">{stats.remainingContentHours.toLocaleString()} hours</span> of remaining content to finish.
          </h1>

          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-gray-400 font-medium">
            <span>Total Library: <strong className="text-white">{stats.totalContentHours} hrs</strong> ({stats.totalTitles} titles)</span>
            <span>•</span>
            <span>Completed: <strong className="text-emerald-400">{stats.completedCount} titles</strong></span>
            <span>•</span>
            <span>Dropped: <strong className="text-red-400">{stats.droppedCount} titles</strong> (excluded)</span>
          </div>

          {/* Statement 2: "At 1.5×, that is X hours of real viewing time." */}
          <p className="text-xl sm:text-2xl font-bold text-gray-200">
            At <span className="text-yellow-400 font-mono">{settings.playbackSpeed}×</span> speed, that is{' '}
            <span className="text-white underline decoration-[#E50914] underline-offset-4 font-mono">
              {stats.remainingRealHoursAtSpeed.toLocaleString()} hours
            </span>{' '}
            of real viewing time.
          </p>

          {/* Statement 3: "At X hours/day, you'll finish in X days." */}
          <div className="pt-2 text-base sm:text-lg font-medium text-gray-300 flex flex-wrap items-center gap-2">
            <span>At</span>
            <span className="font-bold text-white font-mono bg-white/10 px-2 py-0.5 rounded-lg border border-white/10">
              {settings.dailyViewingHours} hours/day
            </span>
            <span>you'll finish your remaining backlog in</span>
            <span className="font-black text-emerald-400 font-mono text-xl">
              ~{Math.round(stats.daysToComplete)} days
            </span>
            <span className="text-gray-400 text-sm font-normal">
              (~{stats.monthsToComplete} months / ~{stats.yearsToComplete} years)
            </span>
          </div>
        </div>

        {/* Playback Speed Controls */}
        <div className="mt-8 pt-6 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-gray-300">
              Configure Playback Speed:
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-black/40 p-1.5 rounded-xl border border-white/10">
            {speedOptions.map((spd) => (
              <button
                key={spd}
                onClick={() => onUpdateSettings({ ...settings, playbackSpeed: spd })}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold font-mono transition-all ${
                  settings.playbackSpeed === spd
                    ? 'bg-[#E50914] text-white shadow-lg shadow-red-900/40 scale-105'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {spd}×
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Prominent Daily Viewing Slider */}
      <div className="bg-[#1c1c1e] p-8 rounded-3xl border border-white/10 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#E50914]" />
              <span>Daily Viewing Time</span>
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              Real-world clock time spent watching per day (not content duration).
            </p>
          </div>

          <div className="flex items-baseline gap-2 bg-black/40 px-5 py-3 rounded-2xl border border-white/10 self-start sm:self-auto">
            <span className="text-2xl sm:text-3xl font-black font-mono text-white">
              {settings.dailyViewingHours}
            </span>
            <span className="text-xs font-semibold text-gray-400 uppercase">hours / day</span>
          </div>
        </div>

        {/* Interactive Slider */}
        <div className="space-y-2">
          <input
            type="range"
            min={0.5}
            max={6.0}
            step={0.5}
            value={settings.dailyViewingHours}
            onChange={(e) =>
              onUpdateSettings({
                ...settings,
                dailyViewingHours: parseFloat(e.target.value),
              })
            }
            className="w-full h-3 bg-black/60 rounded-lg appearance-none cursor-pointer accent-[#E50914]"
          />
          <div className="flex justify-between text-[11px] font-mono text-gray-500 px-1">
            <span>0.5h</span>
            <span>1.0h</span>
            <span>2.0h</span>
            <span>3.0h</span>
            <span>4.0h</span>
            <span>5.0h</span>
            <span>6.0h</span>
          </div>
        </div>

        {/* Instant Completion Projection Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="bg-black/30 p-5 rounded-2xl border border-white/5 flex flex-col justify-between">
            <span className="text-xs font-semibold uppercase text-gray-400">Total Calendar Days</span>
            <div className="mt-3">
              <span className="text-3xl font-black font-mono text-white">
                ~{Math.round(stats.daysToComplete)}
              </span>
              <span className="text-xs text-gray-500 block mt-0.5">days to finish entire library</span>
            </div>
          </div>

          <div className="bg-black/30 p-5 rounded-2xl border border-white/5 flex flex-col justify-between">
            <span className="text-xs font-semibold uppercase text-gray-400">Monthly Horizon</span>
            <div className="mt-3">
              <span className="text-3xl font-black font-mono text-white">
                ~{stats.monthsToComplete}
              </span>
              <span className="text-xs text-gray-500 block mt-0.5">months of continuous watch</span>
            </div>
          </div>

          <div className="bg-black/30 p-5 rounded-2xl border border-white/5 flex flex-col justify-between">
            <span className="text-xs font-semibold uppercase text-gray-400">Years Equivalent</span>
            <div className="mt-3">
              <span className="text-3xl font-black font-mono text-[#E50914]">
                ~{stats.yearsToComplete}
              </span>
              <span className="text-xs text-gray-500 block mt-0.5">years at this daily cadence</span>
            </div>
          </div>
        </div>
      </div>

      {/* Still Watching & Dropped Dedicated Analytics Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Still Watching Stats */}
        <div className="bg-[#1c1c1e] p-6 rounded-3xl border border-amber-500/20 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-400">
                <Tv className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-white text-base">Currently Watching</h4>
                <p className="text-xs text-gray-400">Your in-progress active queue</p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold bg-amber-500/20 text-amber-300 px-3 py-1.5 rounded-xl border border-amber-500/30">
              {stats.stillWatchingCount} titles
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-center">
            <div className="bg-black/30 p-3 rounded-xl border border-white/5">
              <span className="text-[10px] text-gray-400 block uppercase">TV Shows</span>
              <span className="text-lg font-bold text-white">{stats.stillWatchingTvCount}</span>
            </div>
            <div className="bg-black/30 p-3 rounded-xl border border-white/5">
              <span className="text-[10px] text-gray-400 block uppercase">Movies</span>
              <span className="text-lg font-bold text-white">{stats.stillWatchingMoviesCount}</span>
            </div>
            <div className="bg-black/30 p-3 rounded-xl border border-white/5">
              <span className="text-[10px] text-gray-400 block uppercase">Remaining</span>
              <span className="text-lg font-bold text-amber-400">{stats.stillWatchingRemainingHours}h</span>
            </div>
            <div className="bg-black/30 p-3 rounded-xl border border-white/5">
              <span className="text-[10px] text-gray-400 block uppercase">@ {settings.playbackSpeed}×</span>
              <span className="text-lg font-bold text-emerald-400">{stats.stillWatchingRealHoursAtSpeed}h</span>
            </div>
          </div>
        </div>

        {/* Dropped Stats & Top Reasons */}
        <div className="bg-[#1c1c1e] p-6 rounded-3xl border border-red-500/20 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-2xl bg-red-500/10 text-red-400">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-white text-base">Dropped Archive</h4>
                <p className="text-xs text-gray-400">Excluded from remaining watch time</p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold bg-red-500/20 text-red-300 px-3 py-1.5 rounded-xl border border-red-500/30">
              {stats.droppedCount} dropped
            </span>
          </div>

          <div className="space-y-2 pt-1 text-xs">
            <div className="flex justify-between items-center text-gray-300 pb-1">
              <span>{stats.droppedMoviesCount} Movies · {stats.droppedTvCount} TV Shows</span>
            </div>
            {Object.keys(stats.dropReasonCounts).length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {Object.entries(stats.dropReasonCounts).map(([reason, count]) => (
                  <span
                    key={reason}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/40 border border-white/5 text-[11px] text-gray-300"
                  >
                    <span>{reason}</span>
                    <span className="px-1.5 py-0.2 rounded-full bg-red-500/20 text-red-300 font-bold font-mono">
                      {count}
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500 italic">No dropped titles in archive yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Triple Section Breakdown: Movies, TV Shows, Combined */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Movies Stat Card */}
        <div className="bg-[#1c1c1e] p-6 rounded-2xl border border-white/10 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
                <Film className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-white text-base">Movies</h4>
            </div>
            <span className="text-xs font-mono font-bold bg-blue-500/20 text-blue-300 px-2.5 py-1 rounded-lg border border-blue-500/30">
              {stats.movieCount} movies
            </span>
          </div>

          <div className="space-y-3 pt-2 text-xs">
            <div className="flex justify-between items-center py-1.5 border-b border-white/5">
              <span className="text-gray-400">Total Content Duration:</span>
              <span className="font-mono font-bold text-white text-sm">
                {stats.movieContentHours} hrs
              </span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-white/5">
              <span className="text-gray-400">Real Viewing @ {settings.playbackSpeed}×:</span>
              <span className="font-mono font-bold text-blue-400 text-sm">
                {stats.movieRealHoursAtSpeed} real hrs
              </span>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <span className="text-gray-400">Days to Finish Movies Alone:</span>
              <span className="font-mono font-semibold text-gray-200">
                ~{(stats.movieRealHoursAtSpeed / settings.dailyViewingHours).toFixed(1)} days
              </span>
            </div>
          </div>
        </div>

        {/* TV Shows Stat Card */}
        <div className="bg-[#1c1c1e] p-6 rounded-2xl border border-white/10 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
                <Tv className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-white text-base">TV Shows</h4>
            </div>
            <span className="text-xs font-mono font-bold bg-purple-500/20 text-purple-300 px-2.5 py-1 rounded-lg border border-purple-500/30">
              {stats.tvCount} shows
            </span>
          </div>

          <div className="space-y-3 pt-2 text-xs">
            <div className="flex justify-between items-center py-1.5 border-b border-white/5">
              <span className="text-gray-400">Included Episodes:</span>
              <span className="font-mono font-bold text-white text-sm">
                {stats.tvIncludedEpisodes} eps ({settings.maxEpisodesPerSeries} ep cap)
              </span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-white/5">
              <span className="text-gray-400">Total TV Content:</span>
              <span className="font-mono font-bold text-white text-sm">
                {stats.tvContentHours} hrs
              </span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-white/5">
              <span className="text-gray-400">Real TV Viewing @ {settings.playbackSpeed}×:</span>
              <span className="font-mono font-bold text-purple-400 text-sm">
                {stats.tvRealHoursAtSpeed} real hrs
              </span>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <span className="text-gray-400">Days to Finish TV Alone:</span>
              <span className="font-mono font-semibold text-gray-200">
                ~{(stats.tvRealHoursAtSpeed / settings.dailyViewingHours).toFixed(1)} days
              </span>
            </div>
          </div>
        </div>

        {/* Combined Grand Total Stat Card */}
        <div className="bg-[#1c1c1e] p-6 rounded-2xl border border-[#E50914]/30 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-red-500/10 text-[#E50914]">
                <Layers className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-white text-base">Combined Library</h4>
            </div>
            <span className="text-xs font-mono font-bold bg-[#E50914] text-white px-2.5 py-1 rounded-lg">
              {stats.totalTitles} titles
            </span>
          </div>

          <div className="space-y-3 pt-2 text-xs">
            <div className="flex justify-between items-center py-1.5 border-b border-white/5">
              <span className="text-gray-400">Total Content Hours:</span>
              <span className="font-mono font-bold text-white text-sm">
                {stats.totalContentHours} hrs
              </span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-white/5">
              <span className="text-gray-400">Total Real Viewing @ {settings.playbackSpeed}×:</span>
              <span className="font-mono font-bold text-[#E50914] text-sm">
                {stats.totalRealHoursAtSpeed} real hrs
              </span>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <span className="text-gray-400">Total Completion Horizon:</span>
              <span className="font-mono font-semibold text-emerald-400">
                ~{Math.round(stats.daysToComplete)} days
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Visual Content Distribution Bar */}
      <div className="bg-[#1c1c1e] p-6 rounded-2xl border border-white/10 shadow-lg space-y-3">
        <div className="flex justify-between items-center text-xs font-semibold text-gray-300">
          <span>Content Distribution</span>
          <span>{moviePercent}% Movies · {tvPercent}% TV Shows</span>
        </div>

        <div className="h-4 w-full bg-black/50 rounded-full overflow-hidden flex border border-white/5">
          <div
            style={{ width: `${moviePercent}%` }}
            className="bg-blue-500 transition-all duration-500"
            title={`Movies: ${stats.movieContentHours} hours`}
          />
          <div
            style={{ width: `${tvPercent}%` }}
            className="bg-purple-500 transition-all duration-500"
            title={`TV Shows: ${stats.tvContentHours} hours`}
          />
        </div>

        <div className="flex items-center gap-4 text-xs text-gray-400 pt-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span>Movies ({stats.movieContentHours} hrs)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
            <span>TV Shows ({stats.tvContentHours} hrs)</span>
          </div>
        </div>
      </div>

      {/* Gym Mode & Meal-Watching Section */}
      <div className="rounded-3xl bg-gradient-to-r from-orange-950/30 via-neutral-900 to-black border border-orange-500/20 p-8 shadow-2xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 text-xs font-bold uppercase mb-2">
              <Dumbbell className="w-3.5 h-3.5" />
              <span>Cardio & Gym Mode</span>
            </div>
            <h3 className="text-2xl font-black text-white">Pair Watchlist with Workouts</h3>
            <p className="text-xs text-gray-400 mt-1 max-w-xl">
              Turn your Netflix backlog into workout milestones. Calculate how many cardio sessions it will take to finish your library at {settings.playbackSpeed}× speed.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onOpenSettings}
              className="px-4 py-2 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 text-xs font-bold border border-orange-500/30 transition-colors flex items-center gap-1.5"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Configure Workout Params</span>
            </button>
          </div>
        </div>

        {/* Gym Calculations Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-2">
          <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
            <span className="text-[11px] font-semibold text-gray-400 uppercase block">
              Per Gym Session
            </span>
            <div className="mt-2 font-mono">
              <span className="text-2xl font-bold text-white">
                {stats.gymContentHoursPerSession}
              </span>
              <span className="text-xs text-gray-500 block">content hrs consumed</span>
            </div>
          </div>

          <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
            <span className="text-[11px] font-semibold text-gray-400 uppercase block">
              Sessions Required
            </span>
            <div className="mt-2 font-mono">
              <span className="text-2xl font-bold text-orange-400">
                ~{stats.gymSessionsRequired}
              </span>
              <span className="text-xs text-gray-500 block">workout sessions total</span>
            </div>
          </div>

          <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
            <span className="text-[11px] font-semibold text-gray-400 uppercase block">
              If Going Every Day
            </span>
            <div className="mt-2 font-mono">
              <span className="text-2xl font-bold text-white">
                ~{Math.round(stats.gymDaysRequired)}
              </span>
              <span className="text-xs text-gray-500 block">days to clear catalog</span>
            </div>
          </div>

          <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
            <span className="text-[11px] font-semibold text-gray-400 uppercase block">
              Years Horizon
            </span>
            <div className="mt-2 font-mono">
              <span className="text-2xl font-bold text-gray-300">
                ~{stats.gymYearsRequired}
              </span>
              <span className="text-xs text-gray-500 block">years of cardio</span>
            </div>
          </div>
        </div>

        {/* Meals Watch Time Integration */}
        {settings.mealDailyHours > 0 && (
          <div className="p-4 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between text-xs text-gray-300">
            <div className="flex items-center gap-2">
              <Utensils className="w-4 h-4 text-yellow-400" />
              <span>
                Includes <strong className="text-white font-mono">{settings.mealDailyHours} hrs/day</strong> during breakfast/lunch/dinner.
              </span>
            </div>
            <span className="text-emerald-400 font-mono font-bold">
              +{(settings.mealDailyHours * settings.playbackSpeed).toFixed(1)} content hrs/day
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
