import React, { useState } from 'react';
import { X, Key, ShieldCheck, Dumbbell, Clock, Sliders, Check, Utensils, Zap } from 'lucide-react';
import { AppSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
}) => {
  if (!isOpen) return null;

  const [form, setForm] = useState<AppSettings>({ ...settings });
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 600);
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
              <span>Application Settings</span>
            </h3>
            <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5">
              Configure API credentials, series calculation, and viewing speed.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-colors shrink-0 ml-2"
            title="Close Settings"
            aria-label="Close Settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
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
                className={'px-3 py-1.5 rounded-lg text-xs font-bold transition-all ' + (form.capSeriesEpisodes ? 'bg-[#E50914] text-white' : 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/30')}
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
                OMDB API Key (Free tier 1,000 req/day for IMDb & Rotten Tomatoes at <a href="https://www.omdbapi.com/apikey.aspx" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">omdbapi.com</a>):
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
                Watchmode API Key (Optional streaming catalog API at <a href="https://api.watchmode.com/" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">watchmode.com</a>):
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
                    className={'py-1.5 rounded-lg text-xs font-bold font-mono transition-all ' + (form.playbackSpeed === speed ? 'bg-[#E50914] text-white shadow-md' : 'bg-white/5 text-gray-400 hover:bg-white/10')}
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
                    className={'py-1.5 rounded-lg text-xs font-bold font-mono transition-all ' + ((form.gymSpeed || 1.5) === speed ? 'bg-orange-500 text-white shadow-md' : 'bg-white/5 text-gray-400 hover:bg-white/10')}
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
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  form.enableGymMode ? 'bg-orange-500 text-white' : 'bg-white/10 text-gray-400'
                }`}
              >
                {form.enableGymMode ? 'Enabled' : 'Disabled'}
              </button>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/5">
              <label className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                <Dumbbell className="w-3.5 h-3.5 text-orange-400" />
                Gym Session Hours per Day
              </label>
              <input
                type="number"
                min={0.25}
                max={4.0}
                step={0.25}
                value={form.gymHoursPerSession}
                onChange={(e) => setForm({ ...form, gymHoursPerSession: parseFloat(e.target.value) || 1.0 })}
                className="w-20 bg-black/50 border border-white/10 rounded px-2 py-1 text-xs text-right font-mono text-white"
              />
            </div>
          </div>
        </div>

          {/* Sticky Footer: Cancel and Save Buttons */}
          <div className="p-4 sm:p-5 border-t border-white/10 bg-[#18181b] flex items-center justify-end gap-3 sticky bottom-0 z-20">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-[#E50914] hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-all shadow-lg flex items-center gap-1.5 active:scale-95"
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
      </div>
    </div>
  );
};
