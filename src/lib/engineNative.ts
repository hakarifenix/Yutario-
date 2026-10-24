import { toQueuePayload, YutarioNative } from './native';
import type { PlaybackEngine } from './engine';
import type { EngineState, MediaItem, RepeatMode } from './types';

const subscribers = new Set<(state: EngineState) => void>();
let attached = false;

function fanOut(state: EngineState) {
  if (!state) return;
  for (const listener of subscribers) {
    try {
      listener(state);
    } catch (error) {
      console.error('player state listener failed', error);
    }
  }
}

/** Attaches native listeners exactly once, no matter how many components subscribe. */
async function attachListeners() {
  if (attached) return;
  attached = true;
  try {
    await YutarioNative.addListener('playerState', (state) => fanOut(state));
  } catch (error) {
    attached = false;
    console.error('failed to attach native player listener', error);
  }
}

async function safe<T>(operation: () => Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.error(`player engine: ${label} failed`, error);
    return fallback;
  }
}

class NativePlaybackEngine implements PlaybackEngine {
  readonly isNative = true;

  async play(
    items: MediaItem[],
    startIndex: number,
    options?: { positionMs?: number; autoPlay?: boolean },
  ): Promise<void> {
    await attachListeners();
    // A failed start is surfaced to the UI instead of being swallowed: the previous version
    // returned a null state and left the player silently stuck.
    const state = await YutarioNative.play({
      items: items.map(toQueuePayload),
      startIndex,
      startPositionMs: options?.positionMs ?? 0,
      autoPlay: options?.autoPlay !== false,
    });
    fanOut(state);
  }

  async toggle(): Promise<void> {
    await attachListeners();
    fanOut(await safe(() => YutarioNative.playPause(), null as unknown as EngineState, 'toggle'));
  }

  async resume(): Promise<void> {
    fanOut(await safe(() => YutarioNative.resume(), null as unknown as EngineState, 'resume'));
  }

  async pause(): Promise<void> {
    await safe(() => YutarioNative.pause(), undefined, 'pause');
  }

  async next(): Promise<void> {
    await safe(() => YutarioNative.next(), undefined, 'next');
  }

  async previous(): Promise<void> {
    await safe(() => YutarioNative.previous(), undefined, 'previous');
  }

  async seek(positionMs: number): Promise<void> {
    await safe(
      () => YutarioNative.seek({ positionMs: Math.max(0, Math.round(positionMs)) }),
      undefined,
      'seek',
    );
  }

  async setRepeat(mode: RepeatMode): Promise<void> {
    await safe(() => YutarioNative.setRepeatMode({ mode }), undefined, 'setRepeat');
  }

  async setShuffle(enabled: boolean): Promise<void> {
    await safe(() => YutarioNative.setShuffle({ enabled }), undefined, 'setShuffle');
  }

  async setSpeed(speed: number): Promise<void> {
    await safe(() => YutarioNative.setSpeed({ speed }), undefined, 'setSpeed');
  }

  async addToQueue(items: MediaItem[], mode: 'end' | 'next'): Promise<void> {
    await safe(
      () => YutarioNative.enqueue({ items: items.map(toQueuePayload), mode }),
      undefined,
      'enqueue',
    );
  }

  async removeFromQueue(index: number): Promise<void> {
    await safe(() => YutarioNative.removeFromQueue({ index }), undefined, 'removeFromQueue');
  }

  async moveInQueue(from: number, to: number): Promise<void> {
    await safe(() => YutarioNative.moveQueueItem({ from, to }), undefined, 'moveQueueItem');
  }

  async stop(): Promise<void> {
    await safe(() => YutarioNative.stop(), undefined, 'stop');
  }

  async getState(): Promise<EngineState | null> {
    return safe(() => YutarioNative.getPlayerState(), null, 'getState');
  }

  async setSleepTimer(minutes: number | null, stopAfterTrack: boolean): Promise<void> {
    const state = await safe(
      () => YutarioNative.setSleepTimer({ minutes, stopAfterTrack }),
      null as unknown as EngineState,
      'setSleepTimer',
    );
    fanOut(state);
  }

  subscribe(listener: (state: EngineState) => void): () => void {
    subscribers.add(listener);
    void attachListeners();
    return () => {
      subscribers.delete(listener);
    };
  }
}

export function createNativeEngine(): PlaybackEngine {
  return new NativePlaybackEngine();
}
