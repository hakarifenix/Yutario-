import { Preferences } from '@capacitor/preferences';

const memory = new Map<string, string>();

function localStore(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

async function nativeGet(key: string): Promise<string | null> {
  try {
    const result = await Preferences.get({ key });
    return result.value ?? null;
  } catch {
    const store = localStore();
    return store ? store.getItem(key) : (memory.get(key) ?? null);
  }
}

async function nativeSet(key: string, value: string): Promise<void> {
  try {
    await Preferences.set({ key, value });
  } catch {
    const store = localStore();
    if (store) store.setItem(key, value);
    else memory.set(key, value);
  }
}

async function nativeRemove(key: string): Promise<void> {
  try {
    await Preferences.remove({ key });
  } catch {
    const store = localStore();
    if (store) store.removeItem(key);
    else memory.delete(key);
  }
}

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await nativeGet(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  await nativeSet(key, JSON.stringify(value));
}

export async function removeKey(key: string): Promise<void> {
  await nativeRemove(key);
}

/** Debounced writer so bursty state changes do not hammer native preferences. */
export function createDebouncedWriter(delayMs = 350) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const pending = new Map<string, unknown>();
  return {
    queue(key: string, value: unknown) {
      pending.set(key, value);
      const existing = timers.get(key);
      if (existing) clearTimeout(existing);
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          const next = pending.get(key);
          pending.delete(key);
          if (next !== undefined) void writeJson(key, next);
        }, delayMs),
      );
    },
    async flush(key?: string) {
      const keys = key ? [key] : Array.from(pending.keys());
      for (const k of keys) {
        const timer = timers.get(k);
        if (timer) clearTimeout(timer);
        const value = pending.get(k);
        pending.delete(k);
        timers.delete(k);
        if (value !== undefined) await writeJson(k, value);
      }
    },
  };
}

export const STORAGE_KEYS = {
  settings: 'yutario.settings.v1',
  playlists: 'yutario.playlists.v1',
  favorites: 'yutario.favorites.v1',
  history: 'yutario.history.v1',
  progress: 'yutario.progress.v1',
  lastSession: 'yutario.lastsession.v1',
} as const;
