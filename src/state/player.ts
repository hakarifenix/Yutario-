import { create } from 'zustand';
import { engine } from '../lib/engine';
import type { EngineState, MediaItem, RepeatMode, SleepTimerState } from '../lib/types';
import { clampIndex, computeNextIndex, moveItem, removeAt } from '../lib/queue';
import { useCollections } from './collections';
import { useSettings } from './settings';
import { createDebouncedWriter, readJson, STORAGE_KEYS } from '../lib/storage';

interface LastSession {
  queue: MediaItem[];
  index: number;
  positionMs: number;
  repeat: RepeatMode;
  shuffle: boolean;
  speed: number;
  updatedAt: number;
}

const writer = createDebouncedWriter(1200);
let lastProgressSave = 0;
let lastSavedTrackId: string | null = null;
let lastSession: LastSession | null = null;
let unsubscribed: (() => void) | null = null;

const EMPTY_TIMER: SleepTimerState = { endsAt: null, minutes: null, stopAfterTrack: false };

interface PlayerStore {
  queue: MediaItem[];
  index: number;
  isPlaying: boolean;
  buffering: boolean;
  positionMs: number;
  durationMs: number;
  bufferedMs: number;
  repeat: RepeatMode;
  shuffle: boolean;
  speed: number;
  error: string | null;
  /** Readable cause reported by the engine (ExoPlayer error code and cause chain). */
  errorDetail: string | null;
  ended: boolean;
  sleepTimer: SleepTimerState;
  ready: boolean;

  hydrate: () => Promise<void>;
  syncEngine: (state: EngineState) => void;
  playNow: (
    items: MediaItem[],
    startIndex: number,
    options?: { positionMs?: number; autoPlay?: boolean },
  ) => Promise<void>;
  togglePlay: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  cycleRepeat: () => Promise<void>;
  toggleShuffle: () => Promise<void>;
  setSpeed: (speed: number) => Promise<void>;
  addToQueue: (items: MediaItem[], mode?: 'end' | 'next') => Promise<void>;
  removeFromQueue: (index: number) => Promise<void>;
  moveInQueue: (from: number, to: number) => Promise<void>;
  stop: () => Promise<void>;
  setSleepTimer: (minutes: number | null, stopAfterTrack?: boolean) => Promise<void>;
  clearError: () => void;
  currentItem: () => MediaItem | undefined;
}

function saveSession() {
  const state = usePlayer.getState();
  lastSession = {
    queue: state.queue.slice(0, 300),
    index: state.index,
    positionMs: state.positionMs,
    repeat: state.repeat,
    shuffle: state.shuffle,
    speed: state.speed,
    updatedAt: Date.now(),
  };
  writer.queue(STORAGE_KEYS.lastSession, lastSession);
}

export const usePlayer = create<PlayerStore>((set, get) => ({
  queue: [],
  index: 0,
  isPlaying: false,
  buffering: false,
  positionMs: 0,
  durationMs: 0,
  bufferedMs: 0,
  repeat: 'off',
  shuffle: false,
  speed: 1,
  error: null,
  errorDetail: null,
  ended: false,
  sleepTimer: EMPTY_TIMER,
  ready: false,

  hydrate: async () => {
    if (!unsubscribed) {
      unsubscribed = engine.subscribe((state) => get().syncEngine(state));
    }
    const stored = await readJson<LastSession | null>(STORAGE_KEYS.lastSession, null);
    if (stored && Array.isArray(stored.queue) && stored.queue.length > 0) {
      lastSession = stored;
      const index = clampIndex(stored.index, stored.queue.length);
      set({
        queue: stored.queue,
        index,
        durationMs: stored.queue[index]?.durationMs ?? 0,
        positionMs: stored.positionMs,
        repeat: stored.repeat ?? 'off',
        shuffle: Boolean(stored.shuffle),
        speed: stored.speed || 1,
        ready: true,
      });
      try {
        await engine.setRepeat(get().repeat);
        await engine.setShuffle(get().shuffle);
        await engine.setSpeed(get().speed);
        await engine.play(stored.queue, index, {
          positionMs: useSettings.getState().resumePlayback ? stored.positionMs : 0,
          autoPlay: false,
        });
      } catch (error) {
        console.error('session restore failed', error);
      }
    }
    set({ ready: true });
  },

  syncEngine: (state) => {
    const current = get();
    const queueChanged =
      state.queueIds.length !== current.queue.length ||
      state.queueIds.some((id, index) => current.queue[index]?.id !== id);
    let queue = current.queue;
    if (queueChanged && state.queueIds.length > 0) {
      const byId = new Map(current.queue.map((item) => [item.id, item]));
      const rebuilt = state.queueIds.map((id) => byId.get(id)).filter((item): item is MediaItem => Boolean(item));
      if (rebuilt.length === state.queueIds.length) queue = rebuilt;
    }
    if (state.queueIds.length === 0) queue = [];

    const index = clampIndex(state.index, Math.max(queue.length, 1));
    const item = queue[index];
    const trackChanged = item?.id !== lastSavedTrackId;

    const endsAt = state.sleepTimerEndsAt ?? null;
    const minutes = endsAt ? Math.max(0, Math.round((endsAt - Date.now()) / 60000)) : null;

    set({
      queue,
      index,
      isPlaying: state.isPlaying,
      buffering: state.isBuffering,
      positionMs: state.positionMs,
      durationMs: state.durationMs || item?.durationMs || 0,
      bufferedMs: state.bufferedMs,
      repeat: state.repeat,
      shuffle: state.shuffle,
      speed: state.speed,
      ended: state.ended,
      error: state.error ?? null,
      errorDetail: state.errorDetail ?? null,
      sleepTimer: { endsAt, minutes, stopAfterTrack: Boolean(state.stopAfterTrack) },
      ready: true,
    });

    if (!item) {
      lastSavedTrackId = null;
    }

    if (item && trackChanged) {
      lastSavedTrackId = item.id;
      lastProgressSave = 0;
      useCollections.getState().recordPlayed(item, state.positionMs);
      saveSession();
    }

    if (item && Date.now() - lastProgressSave > 5000) {
      lastProgressSave = Date.now();
      const position = state.positionMs;
      if (position > 3000 && state.durationMs > 0) {
        useCollections.getState().setProgress(item.id, position);
        saveSession();
      }
    }
  },

  playNow: async (items, startIndex, options) => {
    if (items.length === 0) return;
    const index = clampIndex(startIndex, items.length);
    const item = items[index];
    const saved = useSettings.getState().resumePlayback ? useCollections.getState().getProgress(item.id) : 0;
    const canResume = saved > 5000 && (item.durationMs === 0 || saved < item.durationMs - 10000);
    const positionMs = options?.positionMs ?? (canResume ? saved : 0);
    lastSavedTrackId = null;
    set({
      queue: items,
      index,
      positionMs,
      durationMs: item.durationMs,
      isPlaying: options?.autoPlay !== false,
      error: null,
      errorDetail: null,
      ended: false,
    });
    try {
      await engine.play(items, index, { positionMs, autoPlay: options?.autoPlay !== false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('playback could not start', error);
      set({ isPlaying: false, error: 'START_FAILED', errorDetail: message });
      return;
    }
    saveSession();
  },

  togglePlay: async () => {
    if (get().queue.length === 0) return;
    await engine.toggle();
  },

  next: async () => {
    if (get().queue.length === 0) return;
    await engine.next();
  },

  previous: async () => {
    if (get().queue.length === 0) return;
    await engine.previous();
  },

  seek: async (positionMs) => {
    set({ positionMs: Math.max(0, positionMs) });
    await engine.seek(positionMs);
  },

  cycleRepeat: async () => {
    const order: RepeatMode[] = ['off', 'all', 'one'];
    const next = order[(order.indexOf(get().repeat) + 1) % order.length];
    set({ repeat: next });
    await engine.setRepeat(next);
    saveSession();
  },

  toggleShuffle: async () => {
    const shuffle = !get().shuffle;
    set({ shuffle });
    await engine.setShuffle(shuffle);
    saveSession();
  },

  setSpeed: async (speed) => {
    set({ speed });
    await engine.setSpeed(speed);
    saveSession();
  },

  addToQueue: async (items, mode = 'end') => {
    if (items.length === 0) return;
    if (get().queue.length === 0) {
      await get().playNow(items, 0);
      return;
    }
    const existing = new Set(get().queue.map((item) => item.id));
    const fresh = items.filter((item) => !existing.has(item.id));
    if (fresh.length === 0) return;
    if (mode === 'end') {
      set({ queue: [...get().queue, ...fresh] });
    } else {
      const index = get().index;
      const next = [...get().queue];
      next.splice(index + 1, 0, ...fresh);
      set({ queue: next });
    }
    await engine.addToQueue(fresh, mode);
    saveSession();
  },

  removeFromQueue: async (index) => {
    const { queue } = get();
    if (index < 0 || index >= queue.length) return;
    const next = removeAt(queue, index);
    set({ queue: next, index: clampIndex(get().index, Math.max(next.length, 1)) });
    await engine.removeFromQueue(index);
    saveSession();
  },

  moveInQueue: async (from, to) => {
    const { queue } = get();
    if (from === to || from < 0 || from >= queue.length) return;
    set({ queue: moveItem(queue, from, to) });
    await engine.moveInQueue(from, to);
    saveSession();
  },

  stop: async () => {
    await engine.stop();
    lastSavedTrackId = null;
    set({
      queue: [],
      index: 0,
      isPlaying: false,
      positionMs: 0,
      durationMs: 0,
      error: null,
      errorDetail: null,
      ended: false,
      sleepTimer: EMPTY_TIMER,
    });
    writer.queue(STORAGE_KEYS.lastSession, null);
  },

  setSleepTimer: async (minutes, stopAfterTrack = false) => {
    await engine.setSleepTimer(minutes, stopAfterTrack);
    set({
      sleepTimer: {
        endsAt: minutes ? Date.now() + minutes * 60000 : null,
        minutes,
        stopAfterTrack,
      },
    });
  },

  clearError: () => set({ error: null, errorDetail: null }),

  currentItem: () => get().queue[get().index],
}));

/** Reads the next index for the current settings (used by tests and UI previews). */
export function previewNextIndex(queueLength: number, index: number, repeat: RepeatMode): number | null {
  return computeNextIndex(index, queueLength, repeat);
}

export function getLastSession(): LastSession | null {
  return lastSession;
}
