import React, { useState, useEffect } from 'react';
import { getCachedThumbnail, setCachedThumbnail } from '../services/db';

interface CachedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  fallbackIcon?: React.ReactNode;
}

/**
 * Image component that loads and persistently caches thumbnails in IndexedDB,
 * ensuring they load instantaneously next time even when offline.
 */
export const CachedImage: React.FC<CachedImageProps> = ({
  src,
  alt,
  className,
  fallbackIcon,
  ...props
}) => {
  const [imageSrc, setImageSrc] = useState<string | undefined>(src);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    setHasError(false);
    setImageSrc(src);

    if (!src) {
      return;
    }

    async function checkAndCache() {
      try {
        // 1. Check local IndexedDB cache first
        const cached = await getCachedThumbnail(src!);
        if (cached && !isCancelled) {
          setImageSrc(cached);
          return;
        }

        // 2. We do NOT perform cross-origin AJAX fetch() for CDN images (e.g. image.tmdb.org)
        // because TMDB does not return Access-Control-Allow-Origin headers, which causes browser CORS errors.
        // Standard <img> tags load them directly without any CORS restrictions.
      } catch {
        // Ignore cache lookup errors
      }
    }

    checkAndCache();

    return () => {
      isCancelled = true;
    };
  }, [src]);

  if (!imageSrc || hasError) {
    return <>{fallbackIcon || null}</>;
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={className}
      onError={() => {
        setHasError(true);
      }}
      loading="lazy"
      {...props}
    />
  );
};
