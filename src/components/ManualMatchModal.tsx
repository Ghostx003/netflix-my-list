import React, { useState } from 'react';
import { X, Search, Check, AlertCircle, Film, Tv, Loader2 } from 'lucide-react';
import { LibraryItem } from '../types';
import { searchTMDB, TMDBMatchCandidate, fetchFullDetails } from '../services/tmdb';

interface ManualMatchModalProps {
  item: LibraryItem | null;
  apiKey: string;
  onClose: () => void;
  onSelectMatch: (updatedItem: LibraryItem) => void;
}

export const ManualMatchModal: React.FC<ManualMatchModalProps> = ({
  item,
  apiKey,
  onClose,
  onSelectMatch,
}) => {
  if (!item) return null;

  const [query, setQuery] = useState(item.originalTitle);
  const [candidates, setCandidates] = useState<TMDBMatchCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setHasSearched(true);
    try {
      const results = await searchTMDB(query.trim(), apiKey);
      setCandidates(results);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleChoose = async (candidate: TMDBMatchCandidate) => {
    setSelecting(true);
    try {
      const fullDetails = await fetchFullDetails(candidate.id, candidate.mediaType, apiKey);
      const updated: LibraryItem = {
        ...item,
        ...(fullDetails || {
          externalId: candidate.id,
          externalTitle: candidate.title,
          mediaType: candidate.mediaType,
          releaseYear: candidate.releaseYear,
          posterPath: candidate.posterPath,
          backdropPath: candidate.backdropPath,
          rating: candidate.rating,
          voteCount: candidate.voteCount,
          synopsis: candidate.overview,
        }),
        isManualMatch: true,
        status: 'matched',
        updatedAt: new Date().toISOString(),
      };
      onSelectMatch(updated);
      onClose();
    } catch (err) {
      console.error('Failed to apply match:', err);
    } finally {
      setSelecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-2xl bg-[#18181b] border border-white/10 rounded-2xl shadow-2xl p-6 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-xl font-bold">Match Metadata</h3>
        <p className="text-xs text-gray-400 mt-1">
          Fix or change TMDB match for Netflix item: <span className="text-white font-semibold">"{item.originalTitle}"</span>
        </p>

        {/* Search input form */}
        <form onSubmit={handleSearch} className="flex gap-2 mt-4">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title on TMDB..."
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 pl-10 text-sm focus:outline-none focus:border-[#E50914]"
            />
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 bg-[#E50914] hover:bg-red-700 text-white font-semibold rounded-xl text-sm transition-colors flex items-center gap-1.5"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span>Search</span>
          </button>
        </form>

        {/* Results Container */}
        <div className="mt-4 max-h-[380px] overflow-y-auto space-y-2 pr-1">
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center text-gray-400">
              <Loader2 className="w-8 h-8 animate-spin text-[#E50914] mb-2" />
              <span className="text-sm">Searching TMDB catalog...</span>
            </div>
          )}

          {!loading && candidates.length > 0 && (
            candidates.map((c) => (
              <div
                key={`${c.mediaType}_${c.id}`}
                className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-colors gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {c.posterPath ? (
                    <img
                      src={c.posterPath}
                      alt={c.title}
                      className="w-12 h-16 object-cover rounded-md flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-16 bg-neutral-800 rounded-md flex items-center justify-center flex-shrink-0">
                      {c.mediaType === 'movie' ? <Film className="w-6 h-6 text-gray-600" /> : <Tv className="w-6 h-6 text-gray-600" />}
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase font-bold px-1.5 py-0.5 rounded bg-neutral-800 text-gray-300">
                        {c.mediaType}
                      </span>
                      {c.releaseYear && (
                        <span className="text-xs text-gray-400 font-mono">
                          {c.releaseYear}
                        </span>
                      )}
                      {c.rating > 0 && (
                        <span className="text-xs text-yellow-400 font-semibold">
                          ★ {c.rating}
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-semibold text-white truncate mt-1">
                      {c.title}
                    </h4>
                    <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">
                      {c.overview || 'No synopsis'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleChoose(c)}
                  disabled={selecting}
                  className="px-3 py-1.5 bg-[#E50914] hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 flex-shrink-0"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Select</span>
                </button>
              </div>
            ))
          )}

          {!loading && hasSearched && candidates.length === 0 && (
            <div className="py-8 text-center text-gray-400">
              <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-gray-300">No matching titles found</p>
              <p className="text-xs text-gray-500 mt-1">
                Try shortening or adjusting your search keywords.
              </p>
            </div>
          )}

          {!hasSearched && (
            <div className="py-8 text-center text-gray-500 text-xs">
              Click search to query TMDB database for matches.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
