import { create } from 'zustand';
import type { MediaItem } from '../lib/types';
import { createDebouncedWriter, readJson, STORAGE_KEYS } from '../lib/storage';
import { dedupeById, moveItem } from '../lib/queue';

export interface Playlist {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  items: MediaItem[];
}

export interface FavoriteEntry {
  item: MediaItem;
  addedAt: number;
}

export interface HistoryEntry {
  item: MediaItem;
  playedAt: number;
  positionMs: number;
}

export type ProgressMap = Record<string, number>;

const writer = createDebouncedWriter(400);
const MAX_HISTORY = 300;
const MAX_PROGRESS_ENTRIES = 800;

function uid(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface CollectionsStore {
  playlists: Playlist[];
  favorites: FavoriteEntry[];
  history: HistoryEntry[];
  progress: ProgressMap;
  hydrated: boolean;
  hydrate: () => Promise<void>;

  createPlaylist: (name: string, items?: MediaItem[]) => string;
  renamePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  addToPlaylist: (playlistId: string, items: MediaItem[]) => number;
  removeFromPlaylist: (playlistId: string, itemId: string) => void;
  movePlaylistItem: (playlistId: string, from: number, to: number) => void;

  isFavorite: (id: string) => boolean;
  toggleFavorite: (item: MediaItem) => boolean;
  favoriteItems: () => MediaItem[];

  recordPlayed: (item: MediaItem, positionMs?: number) => void;
  setProgress: (id: string, positionMs: number) => void;
  getProgress: (id: string) => number;
  clearHistory: () => void;
}

function persist(key: string, value: unknown) {
  writer.queue(key, value);
}

function pruneProgress(progress: ProgressMap): ProgressMap {
  const entries = Object.entries(progress);
  if (entries.length <= MAX_PROGRESS_ENTRIES) return progress;
  entries.sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(entries.slice(0, MAX_PROGRESS_ENTRIES));
}

export const useCollections = create<CollectionsStore>((set, get) => ({
  playlists: [],
  favorites: [],
  history: [],
  progress: {},
  hydrated: false,

  hydrate: async () => {
    const [playlists, favorites, history, progress] = await Promise.all([
      readJson<Playlist[]>(STORAGE_KEYS.playlists, []),
      readJson<FavoriteEntry[]>(STORAGE_KEYS.favorites, []),
      readJson<HistoryEntry[]>(STORAGE_KEYS.history, []),
      readJson<ProgressMap>(STORAGE_KEYS.progress, {}),
    ]);
    set({
      playlists: Array.isArray(playlists) ? playlists.filter((p) => p && typeof p.id === 'string') : [],
      favorites: Array.isArray(favorites) ? favorites.filter((f) => f?.item?.id) : [],
      history: Array.isArray(history) ? history.filter((h) => h?.item?.id) : [],
      progress: progress && typeof progress === 'object' ? progress : {},
      hydrated: true,
    });
  },

  createPlaylist: (name, items = []) => {
    const trimmed = name.trim() || 'Playlist';
    const now = Date.now();
    const playlist: Playlist = {
      id: uid(),
      name: trimmed,
      createdAt: now,
      updatedAt: now,
      items: dedupeById(items),
    };
    const playlists = [playlist, ...get().playlists];
    set({ playlists });
    persist(STORAGE_KEYS.playlists, playlists);
    return playlist.id;
  },

  renamePlaylist: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const playlists = get().playlists.map((playlist) =>
      playlist.id === id ? { ...playlist, name: trimmed, updatedAt: Date.now() } : playlist,
    );
    set({ playlists });
    persist(STORAGE_KEYS.playlists, playlists);
  },

  deletePlaylist: (id) => {
    const playlists = get().playlists.filter((playlist) => playlist.id !== id);
    set({ playlists });
    persist(STORAGE_KEYS.playlists, playlists);
  },

  addToPlaylist: (playlistId, items) => {
    let added = 0;
    const playlists = get().playlists.map((playlist) => {
      if (playlist.id !== playlistId) return playlist;
      const existing = new Set(playlist.items.map((item) => item.id));
      const fresh = items.filter((item) => !existing.has(item.id));
      added = fresh.length;
      if (fresh.length === 0) return playlist;
      return { ...playlist, items: [...playlist.items, ...fresh], updatedAt: Date.now() };
    });
    set({ playlists });
    persist(STORAGE_KEYS.playlists, playlists);
    return added;
  },

  removeFromPlaylist: (playlistId, itemId) => {
    const playlists = get().playlists.map((playlist) =>
      playlist.id === playlistId
        ? { ...playlist, items: playlist.items.filter((item) => item.id !== itemId), updatedAt: Date.now() }
        : playlist,
    );
    set({ playlists });
    persist(STORAGE_KEYS.playlists, playlists);
  },

  movePlaylistItem: (playlistId, from, to) => {
    const playlists = get().playlists.map((playlist) =>
      playlist.id === playlistId
        ? { ...playlist, items: moveItem(playlist.items, from, to), updatedAt: Date.now() }
        : playlist,
    );
    set({ playlists });
    persist(STORAGE_KEYS.playlists, playlists);
  },

  isFavorite: (id) => get().favorites.some((entry) => entry.item.id === id),

  toggleFavorite: (item) => {
    const existing = get().favorites.some((entry) => entry.item.id === item.id);
    const favorites = existing
      ? get().favorites.filter((entry) => entry.item.id !== item.id)
      : [{ item, addedAt: Date.now() }, ...get().favorites];
    set({ favorites });
    persist(STORAGE_KEYS.favorites, favorites);
    return !existing;
  },

  favoriteItems: () => get().favorites.map((entry) => entry.item),

  recordPlayed: (item, positionMs = 0) => {
    const history: HistoryEntry[] = [
      { item, playedAt: Date.now(), positionMs },
      ...get().history.filter((entry) => entry.item.id !== item.id),
    ].slice(0, MAX_HISTORY);
    set({ history });
    persist(STORAGE_KEYS.history, history);
  },

  setProgress: (id, positionMs) => {
    const progress = pruneProgress({ ...get().progress, [id]: Math.max(0, Math.round(positionMs)) });
    set({ progress });
    persist(STORAGE_KEYS.progress, progress);
  },

  getProgress: (id) => get().progress[id] ?? 0,

  clearHistory: () => {
    set({ history: [], progress: {} });
    persist(STORAGE_KEYS.history, []);
    persist(STORAGE_KEYS.progress, {});
  },
}));
