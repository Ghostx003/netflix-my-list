import React, { useState, useEffect } from 'react';
import { Film } from 'lucide-react';
import { getCachedThumbnail } from '../services/db';
import { sanitizeImageUrl, fetchPosterByTitle } from '../services/imageResolver';

interface CachedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  fallbackSrc?: string;
  fallbackIcon?: React.ReactNode;
}

/**
 * Robust image component that handles:
 * - Persistent caching in IndexedDB
 * - Automatic URL normalization (relative TMDB paths, blocking fake placeholders)
 * - Automatic fallbackSrc cascade (backdrop -> poster)
 * - Dynamic fallback fetching from TMDB by title if primary fails
 * - High-end Netflix aesthetic fallback card so NO movie thumbnail is ever blank.
 */
export const CachedImage: React.FC<CachedImageProps> = ({
  src,
  fallbackSrc,
  alt,
  className,
  fallbackIcon,
  ...props
}) => {
  // Sanitize initial inputs
  const initialResolved = sanitizeImageUrl(src, alt) || sanitizeImageUrl(fallbackSrc, alt);
  const [imageSrc, setImageSrc] = useState<string | undefined>(initialResolved);
  const [hasTriedFallbackSrc, setHasTriedFallbackSrc] = useState(false);
  const [hasTriedDynamicFetch, setHasTriedDynamicFetch] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    setHasError(false);
    setHasTriedFallbackSrc(false);
    setHasTriedDynamicFetch(false);

    const resolved = sanitizeImageUrl(src, alt) || sanitizeImageUrl(fallbackSrc, alt);
    setImageSrc(resolved);

    if (!resolved) {
      // If no valid URL resolved from props, immediately try dynamic title search if alt (title) is available
      if (alt && !isCancelled) {
        setHasTriedDynamicFetch(true);
        fetchPosterByTitle(alt).then((fetched) => {
          if (!isCancelled && fetched) {
            setImageSrc(fetched);
          } else if (!isCancelled) {
            setHasError(true);
          }
        });
      } else {
        setHasError(true);
      }
      return;
    }

    async function checkLocalCache() {
      try {
        const cached = await getCachedThumbnail(resolved!);
        if (cached && !isCancelled) {
          setImageSrc(cached);
        }
      } catch {
        // Ignore cache lookup errors
      }
    }

    checkLocalCache();

    return () => {
      isCancelled = true;
    };
  }, [src, fallbackSrc, alt]);

  const handleImageError = () => {
    // 1. Try fallbackSrc if not tried yet
    const sanitizedFallback = sanitizeImageUrl(fallbackSrc, alt);
    if (!hasTriedFallbackSrc && sanitizedFallback && sanitizedFallback !== imageSrc) {
      setHasTriedFallbackSrc(true);
      setImageSrc(sanitizedFallback);
      return;
    }

    // 2. Try dynamic TMDB search by title (alt)
    if (!hasTriedDynamicFetch && alt) {
      setHasTriedDynamicFetch(true);
      fetchPosterByTitle(alt).then((fetched) => {
        if (fetched && fetched !== imageSrc) {
          setImageSrc(fetched);
        } else {
          setHasError(true);
        }
      });
      return;
    }

    // 3. Mark as error to trigger fallback display
    setHasError(true);
  };

  if (!imageSrc || hasError) {
    if (fallbackIcon) {
      return <>{fallbackIcon}</>;
    }

    // Premium Netflix-styled fallback card with title and film reel icon
    return (
      <div
        className={`relative flex flex-col items-center justify-between p-3 text-center bg-gradient-to-br from-zinc-800 via-zinc-900 to-black select-none border border-white/5 ${
          className || 'w-full h-full'
        }`}
        title={alt || 'Netflix Title'}
      >
        <div className="w-full flex justify-end">
          <span className="text-[9px] uppercase tracking-wider font-mono text-zinc-500 bg-black/60 px-1.5 py-0.5 rounded border border-white/5">
            Netflix
          </span>
        </div>
        <div className="flex flex-col items-center my-auto px-1">
          <div className="w-9 h-9 rounded-full bg-red-600/15 border border-red-500/20 flex items-center justify-center mb-1.5 shadow-inner">
            <Film className="w-4 h-4 text-[#E50914]" />
          </div>
          <span className="text-xs font-bold text-zinc-200 line-clamp-3 leading-snug drop-shadow">
            {alt || 'Netflix Title'}
          </span>
        </div>
        <div className="w-full h-1 bg-red-600/30 rounded-full" />
      </div>
    );
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={className}
      onError={handleImageError}
      loading="lazy"
      {...props}
    />
  );
};
