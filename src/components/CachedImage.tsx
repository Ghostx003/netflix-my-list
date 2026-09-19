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

    if (!src) {
      setImageSrc(undefined);
      return;
    }

    async function checkAndCache() {
      // 1. Check local IndexedDB cache first
      const cached = await getCachedThumbnail(src!);
      if (cached && !isCancelled) {
        setImageSrc(cached);
        return;
      }

      // If not cached, start with original src
      if (!isCancelled) {
        setImageSrc(src);
      }

      // 2. Fetch as blob in background and cache if remote URL
      if (src!.startsWith('http')) {
        try {
          const res = await fetch(src!, { mode: 'cors' });
          if (res.ok) {
            const blob = await res.blob();
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64data = reader.result as string;
              if (base64data && !isCancelled) {
                setCachedThumbnail(src!, base64data);
              }
            };
            reader.readAsDataURL(blob);
          }
        } catch {
          // Cross-origin restriction or offline — keep original imageSrc
        }
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
      onError={() => setHasError(true)}
      loading="lazy"
      {...props}
    />
  );
};
