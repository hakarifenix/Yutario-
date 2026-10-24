import { useEffect, useState } from 'react';
import { isNativePlatform, YutarioNative } from './native';

const MAX_ENTRIES = 240;
const cache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

function remember(key: string, value: string | null) {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

export async function loadArtwork(uri: string, size = 300): Promise<string | null> {
  const key = `${uri}@${size}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const existing = inflight.get(key);
  if (existing) return existing;
  if (!isNativePlatform) {
    remember(key, null);
    return null;
  }
  const request = (async () => {
    try {
      const result = await YutarioNative.getArtwork({ uri, size });
      const value = result?.dataUrl ?? null;
      remember(key, value);
      return value;
    } catch (error) {
      console.error('artwork load failed', error);
      remember(key, null);
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, request);
  return request;
}

/** Returns cached artwork immediately and loads it lazily otherwise. */
export function useArtwork(uri: string | undefined, size = 300): { dataUrl: string | null; loading: boolean } {
  const key = uri ? `${uri}@${size}` : '';
  const [dataUrl, setDataUrl] = useState<string | null>(() => (key ? cache.get(key) ?? null : null));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!uri || !isNativePlatform) {
      setDataUrl(null);
      setLoading(false);
      return;
    }
    const cacheKey = `${uri}@${size}`;
    if (cache.has(cacheKey)) {
      setDataUrl(cache.get(cacheKey) ?? null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadArtwork(uri, size).then((value) => {
      if (cancelled) return;
      setDataUrl(value);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [uri, size]);

  return { dataUrl, loading };
}
