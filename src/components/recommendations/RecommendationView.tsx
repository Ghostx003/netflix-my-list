import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import {
  AppSettings,
  CustomPreference,
  DiscoveryTitle,
  LibraryItem,
  RecommendationCandidate,
  RecommendationRowData,
  UserTasteProfile,
} from '../../types';
import { buildUserTasteProfile } from '../../services/recommendations/preferenceProfile';
import {
  generateRecommendations,
  RecommendationEngineOutput,
} from '../../services/recommendations/recommendationEngine';
import { HeroRecommendation } from './HeroRecommendation';
import { RecommendationRow } from './RecommendationRow';
import { RecommendationEngineUI } from './RecommendationEngineUI';

interface RecommendationViewProps {
  catalog: DiscoveryTitle[];
  libraryItems: LibraryItem[];
  settings: AppSettings;
  onOpenDetail: (item: DiscoveryTitle) => void;
  onAddToLibrary: (item: DiscoveryTitle) => void;
  onStartWatching?: (item: DiscoveryTitle) => void;
}

export const RecommendationView: React.FC<RecommendationViewProps> = ({
  catalog,
  libraryItems,
  settings,
  onOpenDetail,
  onAddToLibrary,
  onStartWatching,
}) => {
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEngineSearching, setIsEngineSearching] = useState(false);

  // Recommendations state
  const [heroPick, setHeroPick] = useState<RecommendationCandidate | null>(null);
  const [contentRows, setContentRows] = useState<RecommendationRowData[]>([]);
  const [customPicks, setCustomPicks] = useState<RecommendationCandidate[]>([]);
  const [isFallback, setIsFallback] = useState(false);
  const [fallbackMessage, setFallbackMessage] = useState<string | undefined>();

  // Filter state for Recommendation Engine Discovery tool
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const [customPreferences, setCustomPreferences] = useState<CustomPreference[]>([]);

  // Session-level exclusion list so page refresh explores fresh picks without repeats
  const sessionExcludedIdsRef = useRef<Set<string>>(new Set<string>());

  // Dynamic loved title anchor state (e.g. rotating through 5-star watched titles)
  const [requestedLovedTitle, setRequestedLovedTitle] = useState<string | undefined>();

  // Build taste profile memoized
  const tasteProfile: UserTasteProfile = useMemo(() => {
    return buildUserTasteProfile(libraryItems);
  }, [libraryItems]);

  // Load / Recalculate recommendations
  const runPipeline = useCallback(
    async (isManualRefresh = false, overrideLovedTitle?: string) => {
      if (catalog.length === 0) return;
      if (isManualRefresh) setIsRefreshing(true);
      else setLoading(true);

      try {
        // Exclude current hero on refresh to cycle options
        if (heroPick?.item?.id && isManualRefresh) {
          sessionExcludedIdsRef.current.add(String(heroPick.item.id));
        }

        const output: RecommendationEngineOutput = await generateRecommendations({
          catalog,
          libraryItems,
          userProfile: tasteProfile,
          selectedGenres,
          selectedThemes,
          customPreferences,
          excludeItemIds: sessionExcludedIdsRef.current,
          explorationFactor: isManualRefresh ? 0.22 : 0.12,
          requestedLovedTitle: overrideLovedTitle !== undefined ? overrideLovedTitle : requestedLovedTitle,
        });

        setHeroPick(output.hero);
        setContentRows(output.rows);
        setCustomPicks(output.customPicks);
        setIsFallback(output.isFallback);
        setFallbackMessage(output.fallbackMessage);
      } catch (err) {
        console.error('Failed generating recommendations:', err);
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [catalog, libraryItems, tasteProfile, selectedGenres, selectedThemes, customPreferences, heroPick?.item?.id, requestedLovedTitle]
  );

  const handleSelectLovedTitle = (newTitle: string) => {
    setRequestedLovedTitle(newTitle);
    runPipeline(false, newTitle);
  };

  // Initial load
  useEffect(() => {
    runPipeline(false);
  }, [catalog.length, libraryItems.length]);


  // Handle "Find Recommendations" in Engine tool
  const handleRunEngineSearch = async () => {
    setIsEngineSearching(true);
    try {
      const output = await generateRecommendations({
        catalog,
        libraryItems,
        userProfile: tasteProfile,
        selectedGenres,
        selectedThemes,
        customPreferences,
        excludeItemIds: new Set<string>(),
        explorationFactor: 0.05,
      });

      setCustomPicks(output.customPicks);
      setIsFallback(output.isFallback);
      setFallbackMessage(output.fallbackMessage);
    } catch (err) {
      console.warn('Recommendation Engine search failed:', err);
    } finally {
      setIsEngineSearching(false);
    }
  };

  // Reset engine filters
  const handleResetFilters = () => {
    setSelectedGenres([]);
    setSelectedThemes([]);
    setCustomPreferences([]);
    setCustomPicks([]);
    setIsFallback(false);
  };

  const isTitleInLibrary = (item: DiscoveryTitle) => {
    return libraryItems.some(
      (lib) =>
        (item.netflixId && lib.videoId === item.netflixId) ||
        (item.tmdbId && lib.externalId === item.tmdbId) ||
        (item.imdbId && lib.imdbId === item.imdbId) ||
        lib.originalTitle.toLowerCase().trim() === item.title.toLowerCase().trim()
    );
  };

  if (loading && !heroPick) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center text-white px-4">
        <div className="relative mb-6">
          <div className="w-16 h-16 rounded-full border-4 border-red-600/20 border-t-red-600 animate-spin flex items-center justify-center" />
          <Sparkles className="w-6 h-6 text-[#E50914] absolute inset-0 m-auto" />
        </div>
        <h2 className="text-xl font-bold tracking-tight mb-2">Analyzing Your Netflix Taste Profile...</h2>
        <p className="text-xs text-zinc-400 font-mono max-w-sm text-center">
          Synthesizing watch history, semantic vectors, and multi-objective catalog intelligence.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-[#141414] text-white overflow-x-hidden pb-20">
      {/* Cinematic Top Hero Recommendation */}
      <div className="relative">
        <HeroRecommendation
          candidate={heroPick}
          isInLibrary={heroPick ? isTitleInLibrary(heroPick.item) : false}
          onOpenDetail={onOpenDetail}
          onAddToLibrary={onAddToLibrary}
        />

        {/* Floating Refresh Discovery Action */}
        <div className="absolute top-4 right-4 sm:right-10 z-30 flex items-center gap-2">
          <button
            onClick={() => runPipeline(true)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 hover:bg-black/90 backdrop-blur-md text-xs font-semibold text-zinc-200 border border-white/10 shadow-lg hover:border-white/30 transition-all active:scale-95 disabled:opacity-50"
            title="Refresh Recommendations with new exploratory suggestions"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#E50914]' : ''}`} />
            <span className="hidden sm:inline">Refresh Discovery</span>
          </button>
        </div>
      </div>

      {/* Personalized Content Rows */}
      <div className="space-y-8 sm:space-y-12 relative z-20 pt-4 sm:pt-6">
        {contentRows.map((row) => (
          <RecommendationRow
            key={row.id}
            row={row}
            libraryItems={libraryItems}
            onOpenDetail={onOpenDetail}
            onAddToLibrary={onAddToLibrary}
            onStartWatching={onStartWatching}
            onSelectLovedTitle={handleSelectLovedTitle}
          />
        ))}
      </div>

      {/* Interactive Recommendation Engine Tool */}
      <RecommendationEngineUI
        selectedGenres={selectedGenres}
        onChangeGenres={setSelectedGenres}
        selectedThemes={selectedThemes}
        onChangeThemes={setSelectedThemes}
        customPreferences={customPreferences}
        onChangePreferences={setCustomPreferences}
        onFindRecommendations={handleRunEngineSearch}
        onResetFilters={handleResetFilters}
        isSearching={isEngineSearching}
        results={customPicks}
        isFallback={isFallback}
        fallbackMessage={fallbackMessage}
        libraryItems={libraryItems}
        catalog={catalog}
        onOpenDetail={onOpenDetail}
        onAddToLibrary={onAddToLibrary}
        onStartWatching={onStartWatching}
      />
    </div>
  );
};
