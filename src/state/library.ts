import { create } from 'zustand';
import { isNativePlatform, toMediaItem, YutarioNative } from '../lib/native';
import type { MediaItem, MediaKind, PermissionStatus } from '../lib/types';
import { dedupeById } from '../lib/queue';
import { fileToMediaItem, pickBrowserFiles } from '../lib/browserFiles';

const PAGE_SIZE = 400;

let scanToken = 0;

interface LibraryStore {
  music: MediaItem[];
  videos: MediaItem[];
  permission: PermissionStatus | null;
  status: 'idle' | 'scanning' | 'ready' | 'error';
  error: string | null;
  scannedAt: number | null;
  progressText: { loaded: number; total: number };
  initialized: boolean;

  init: () => Promise<void>;
  refresh: () => Promise<void>;
  requestPermission: () => Promise<void>;
  requestNotifications: () => Promise<void>;
  importMedia: (kind: MediaKind | 'any') => Promise<MediaItem[]>;
  addItems: (items: MediaItem[]) => void;
  clearError: () => void;
}

function mergeItems(existing: MediaItem[], incoming: MediaItem[]): MediaItem[] {
  return dedupeById([...incoming, ...existing]);
}

function sortByDate(items: MediaItem[]): MediaItem[] {
  return items.slice().sort((a, b) => (b.dateAdded ?? 0) - (a.dateAdded ?? 0));
}

export const useLibrary = create<LibraryStore>((set, get) => ({
  music: [],
  videos: [],
  permission: null,
  status: 'idle',
  error: null,
  scannedAt: null,
  progressText: { loaded: 0, total: 0 },
  initialized: false,

  init: async () => {
    if (!isNativePlatform) {
      set({
        initialized: true,
        permission: { state: 'unsupported', readAudio: false, readVideo: false, notifications: false, sdk: 0 },
      });
      return;
    }
    let permission: PermissionStatus | null = null;
    try {
      permission = await YutarioNative.getLibraryPermissionStatus();
    } catch (error) {
      console.error('permission status failed', error);
    }
    set({ initialized: true, permission });
    if (permission && (permission.readAudio || permission.readVideo)) {
      await get().refresh();
    }
  },

  refresh: async () => {
    if (!isNativePlatform) return;
    const token = ++scanToken;
    let permission = get().permission;
    try {
      permission = await YutarioNative.getLibraryPermissionStatus();
      set({ permission });
    } catch {
      /* keep last known status */
    }
    if (!permission || (!permission.readAudio && !permission.readVideo)) {
      set({ status: 'idle' });
      return;
    }
    set({ status: 'scanning', error: null });
    try {
      const collected: { audio: MediaItem[]; video: MediaItem[] } = { audio: [], video: [] };
      const kinds: MediaKind[] = [];
      if (permission.readAudio) kinds.push('audio');
      if (permission.readVideo) kinds.push('video');

      for (const kind of kinds) {
        let offset = 0;
        let total = 0;
        do {
          if (token !== scanToken) return;
          const page = await YutarioNative.scanMedia({
            kind,
            offset,
            limit: PAGE_SIZE,
            sort: 'date',
            reverse: true,
          });
          total = page.total ?? 0;
          const items = (page.items ?? []).map(toMediaItem);
          if (kind === 'audio') collected.audio.push(...items);
          else collected.video.push(...items);
          offset += items.length;
          set({
            progressText: {
              loaded: collected.audio.length + collected.video.length,
              total: Math.max(total, collected.audio.length + collected.video.length),
            },
          });
          if (items.length === 0) break;
        } while (offset < total);
      }

      if (token !== scanToken) return;
      set((state) => ({
        music: sortByDate(mergeItems(state.music, collected.audio)),
        videos: sortByDate(mergeItems(state.videos, collected.video)),
        status: 'ready',
        scannedAt: Date.now(),
      }));
    } catch (error) {
      console.error('library scan failed', error);
      if (token !== scanToken) return;
      set({ status: 'error', error: error instanceof Error ? error.message : 'scan failed' });
    }
  },

  requestPermission: async () => {
    if (!isNativePlatform) return;
    try {
      const permission = await YutarioNative.requestLibraryPermission();
      set({ permission });
      if (permission.readAudio || permission.readVideo) {
        await get().refresh();
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'permission request failed' });
    }
  },

  requestNotifications: async () => {
    if (!isNativePlatform) return;
    try {
      const result = await YutarioNative.requestNotificationPermission();
      set((state) => ({
        permission: state.permission ? { ...state.permission, notifications: result.granted } : state.permission,
      }));
    } catch (error) {
      console.error('notification permission failed', error);
    }
  },

  importMedia: async (kind) => {
    if (!isNativePlatform) {
      const files = await pickBrowserFiles(kind);
      const items = files.map(fileToMediaItem);
      get().addItems(items);
      return items;
    }
    try {
      const result = await YutarioNative.pickMedia({ kind });
      const items = (result.items ?? []).map(toMediaItem);
      get().addItems(items);
      return items;
    } catch (error) {
      console.error('file pick failed', error);
      set({ error: error instanceof Error ? error.message : 'file pick failed' });
      return [];
    }
  },

  addItems: (items) => {
    if (items.length === 0) return;
    const audio = items.filter((item) => item.kind === 'audio');
    const video = items.filter((item) => item.kind === 'video');
    set((state) => ({
      music: audio.length ? sortByDate(mergeItems(state.music, audio)) : state.music,
      videos: video.length ? sortByDate(mergeItems(state.videos, video)) : state.videos,
    }));
  },

  clearError: () => set({ error: null }),
}));

export function findMediaItem(id: string): MediaItem | undefined {
  const state = useLibrary.getState();
  return state.music.find((item) => item.id === id) ?? state.videos.find((item) => item.id === id);
}
