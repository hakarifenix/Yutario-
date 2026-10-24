import type { PlaybackEngine } from './engine';
import type { EngineState, MediaItem, RepeatMode } from './types';
import { buildShuffleOrder, clampIndex } from './queue';

/**
 * Development/preview engine. Android uses the native Media3 engine; this exists so the
 * interface can be exercised in a browser and is never used inside the Android app.
 */
class WebPlaybackEngine implements PlaybackEngine {
  readonly isNative = false;

  private audio: HTMLAudioElement | null;
  private subscribers = new Set<(state: EngineState) => void>();
  private queue: MediaItem[] = [];
  private order: number[] = [];
  private cursor = 0;
  private repeat: RepeatMode = 'off';
  private shuffle = false;
  private ended = false;
  private error: string | null = null;
  private pendingPosition = 0;
  private pendingPlay = false;
  private sleepTimerHandle: ReturnType<typeof setTimeout> | null = null;
  private sleepEndsAt: number | null = null;
  private stopAfterTrack = false;
  private progressTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.audio = typeof Audio !== 'undefined' ? new Audio() : null;
    if (this.audio) {
      this.audio.preload = 'metadata';
      this.audio.addEventListener('loadedmetadata', this.handleLoadedMetadata);
      this.audio.addEventListener('play', this.handlePlay);
      this.audio.addEventListener('pause', this.handlePause);
      this.audio.addEventListener('ended', this.handleEnded);
      this.audio.addEventListener('waiting', this.handleProgress);
      this.audio.addEventListener('playing', this.handleProgress);
      this.audio.addEventListener('error', this.handleError);
    }
    this.progressTimer = setInterval(() => {
      if (this.audio && !this.audio.paused) this.emit();
    }, 500);
    this.attachMediaSession();
  }

  private currentItem(): MediaItem | undefined {
    return this.queue[this.order[this.cursor]];
  }

  private handleLoadedMetadata = () => {
    const audio = this.audio;
    if (!audio) return;
    if (this.pendingPosition > 0 && Number.isFinite(audio.duration)) {
      const target = Math.min(this.pendingPosition / 1000, Math.max(0, audio.duration - 0.25));
      try {
        audio.currentTime = Math.max(0, target);
      } catch {
        /* seeking before metadata settles is ignored */
      }
    }
    this.pendingPosition = 0;
    this.emit();
    if (this.pendingPlay) {
      void audio.play().catch((error: unknown) => {
        this.error = error instanceof Error ? error.message : 'Playback was blocked by the browser.';
        this.emit();
      });
    }
  };

  private handlePlay = () => {
    this.ended = false;
    this.updateMediaSession();
    this.emit();
  };

  private handlePause = () => {
    this.updateMediaSession();
    this.emit();
  };

  private handleEnded = () => {
    if (this.stopAfterTrack) {
      this.stopAfterTrack = false;
      this.emit();
      return;
    }
    this.advance(true);
  };

  private handleProgress = () => this.emit();

  private handleError = () => {
    this.error = this.audio?.error?.message || 'This file could not be played.';
    this.emit();
  };

  private snapshot(): EngineState {
    const audio = this.audio;
    if (!audio) {
      return {
        queueIds: this.queue.map((item) => item.id),
        index: 0,
        isPlaying: false,
        playWhenReady: false,
        isBuffering: false,
        positionMs: 0,
        durationMs: 0,
        bufferedMs: 0,
        repeat: this.repeat,
        shuffle: this.shuffle,
        speed: 1,
        ended: false,
        error: 'Audio playback is not available in this environment.',
        sleepTimerEndsAt: this.sleepEndsAt,
        stopAfterTrack: this.stopAfterTrack,
      };
    }
    let buffered = 0;
    try {
      if (audio.buffered.length > 0) buffered = audio.buffered.end(audio.buffered.length - 1) * 1000;
    } catch {
      buffered = 0;
    }
    return {
      queueIds: this.queue.map((item) => item.id),
      index: this.order[this.cursor] ?? 0,
      isPlaying: !audio.paused && !audio.ended,
      playWhenReady: !audio.paused,
      isBuffering: audio.readyState < 3 && !audio.paused,
      positionMs: Number.isFinite(audio.currentTime) ? audio.currentTime * 1000 : 0,
      durationMs: Number.isFinite(audio.duration)
        ? audio.duration * 1000
        : (this.currentItem()?.durationMs ?? 0),
      bufferedMs: buffered,
      repeat: this.repeat,
      shuffle: this.shuffle,
      speed: audio.playbackRate || 1,
      ended: this.ended,
      error: this.error,
      sleepTimerEndsAt: this.sleepEndsAt,
      stopAfterTrack: this.stopAfterTrack,
    };
  }

  private emit() {
    if (this.subscribers.size === 0) return;
    const state = this.snapshot();
    for (const listener of this.subscribers) {
      try {
        listener(state);
      } catch (error) {
        console.error('web engine listener failed', error);
      }
    }
  }

  private updateMediaSession() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const item = this.currentItem();
    if (!item) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: item.title,
        artist: item.artist ?? '',
        album: item.album ?? '',
      });
      navigator.mediaSession.playbackState = this.audio && !this.audio.paused ? 'playing' : 'paused';
    } catch {
      /* MediaSession metadata is best-effort on the web preview. */
    }
  }

  private loadCurrent(positionMs = 0, autoPlay = true) {
    const audio = this.audio;
    const item = this.currentItem();
    if (!audio || !item) return;
    this.error = null;
    this.ended = false;
    this.pendingPosition = positionMs;
    this.pendingPlay = autoPlay;
    audio.src = item.uri;
    audio.playbackRate = audio.playbackRate || 1;
    this.updateMediaSession();
  }

  private advance(auto: boolean) {
    const audio = this.audio;
    if (!audio || this.queue.length === 0) return;
    if (this.cursor < this.order.length - 1) {
      this.cursor += 1;
      this.loadCurrent(0, true);
      return;
    }
    if (this.repeat === 'all') {
      this.cursor = 0;
      this.loadCurrent(0, true);
      return;
    }
    if (auto && this.repeat === 'one') {
      audio.currentTime = 0;
      void audio.play().catch(() => undefined);
      return;
    }
    audio.pause();
    this.ended = true;
    this.emit();
  }

  private clearSleepTimer() {
    if (this.sleepTimerHandle) clearTimeout(this.sleepTimerHandle);
    this.sleepTimerHandle = null;
    this.sleepEndsAt = null;
    this.stopAfterTrack = false;
  }

  private attachMediaSession() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler('play', () => void this.audio?.play());
      navigator.mediaSession.setActionHandler('pause', () => this.audio?.pause());
      navigator.mediaSession.setActionHandler('nexttrack', () => void this.next());
      navigator.mediaSession.setActionHandler('previoustrack', () => void this.previous());
    } catch {
      /* Older browsers may not support every action handler. */
    }
  }

  async play(
    items: MediaItem[],
    startIndex: number,
    options?: { positionMs?: number; autoPlay?: boolean },
  ): Promise<void> {
    this.queue = items.slice();
    this.cursor = 0;
    this.order = this.shuffle
      ? buildShuffleOrder(this.queue.length, startIndex)
      : this.queue.map((_, index) => index);
    if (this.shuffle) {
      const found = this.order.indexOf(startIndex);
      this.cursor = found >= 0 ? found : 0;
    } else {
      this.cursor = clampIndex(startIndex, this.queue.length);
    }
    this.loadCurrent(options?.positionMs ?? 0, options?.autoPlay !== false);
    this.emit();
  }

  async toggle(): Promise<void> {
    const audio = this.audio;
    if (!audio) return;
    if (audio.paused) {
      await audio.play().catch((error: unknown) => {
        this.error = error instanceof Error ? error.message : 'Playback failed.';
        this.emit();
      });
    } else {
      audio.pause();
    }
  }

  async resume(): Promise<void> {
    await this.audio?.play().catch(() => undefined);
  }

  async pause(): Promise<void> {
    this.audio?.pause();
  }

  async next(): Promise<void> {
    this.advance(false);
  }

  async previous(): Promise<void> {
    const audio = this.audio;
    if (!audio) return;
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      this.emit();
      return;
    }
    if (this.cursor > 0) {
      this.cursor -= 1;
    } else if (this.repeat === 'all') {
      this.cursor = Math.max(0, this.order.length - 1);
    } else {
      audio.currentTime = 0;
      this.emit();
      return;
    }
    this.loadCurrent(0, true);
  }

  async seek(positionMs: number): Promise<void> {
    const audio = this.audio;
    if (!audio) return;
    try {
      audio.currentTime = Math.max(0, positionMs / 1000);
    } catch {
      /* ignore seek before metadata */
    }
    this.emit();
  }

  async setRepeat(mode: RepeatMode): Promise<void> {
    this.repeat = mode;
    this.emit();
  }

  async setShuffle(enabled: boolean): Promise<void> {
    this.shuffle = enabled;
    const activeIndex = this.order[this.cursor] ?? 0;
    this.order = enabled
      ? buildShuffleOrder(this.queue.length, activeIndex)
      : this.queue.map((_, index) => index);
    this.cursor = enabled ? 0 : activeIndex;
    this.emit();
  }

  async setSpeed(speed: number): Promise<void> {
    if (this.audio) this.audio.playbackRate = speed;
    this.emit();
  }

  async addToQueue(items: MediaItem[], mode: 'end' | 'next'): Promise<void> {
    if (mode === 'next') {
      const currentId = this.queue[this.order[this.cursor]]?.id;
      const currentIndex = Math.max(0, this.queue.findIndex((item) => item.id === currentId));
      const fresh = items.filter((item) => !this.queue.some((existing) => existing.id === item.id));
      this.queue = [...this.queue.slice(0, currentIndex + 1), ...fresh, ...this.queue.slice(currentIndex + 1)];
      if (this.shuffle) {
        this.order = buildShuffleOrder(this.queue.length, currentIndex);
        this.cursor = 0;
      } else {
        this.order = this.queue.map((_, index) => index);
        this.cursor = currentIndex;
      }
    } else {
      for (const item of items) {
        if (this.queue.some((existing) => existing.id === item.id)) continue;
        this.queue.push(item);
        this.order.push(this.queue.length - 1);
      }
    }
    this.emit();
  }

  async removeFromQueue(index: number): Promise<void> {
    if (index < 0 || index >= this.queue.length) return;
    const removedId = this.queue[index].id;
    const wasCurrent = (this.order[this.cursor] ?? -1) === index;
    this.queue = this.queue.filter((_, position) => position !== index);
    if (this.shuffle) {
      this.order = buildShuffleOrder(this.queue.length, 0);
      this.cursor = Math.max(
        0,
        Math.min(this.order.length - 1, this.queue.findIndex((item) => item.id === removedId)),
      );
    } else {
      this.order = this.queue.map((_, position) => position);
      this.cursor = clampIndex(index, this.queue.length);
    }
    if (wasCurrent && this.audio) {
      this.loadCurrent(0, !this.audio.paused);
    }
    this.emit();
  }

  async moveInQueue(from: number, to: number): Promise<void> {
    if (from < 0 || from >= this.queue.length || to < 0 || to >= this.queue.length || from === to) return;
    const currentId = this.queue[this.order[this.cursor]]?.id;
    const next = this.queue.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    this.queue = next;
    this.order = this.queue.map((_, index) => index);
    const index = this.queue.findIndex((item) => item.id === currentId);
    this.cursor = index >= 0 ? index : clampIndex(to, this.queue.length);
    this.emit();
  }

  async stop(): Promise<void> {
    const audio = this.audio;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    this.queue = [];
    this.order = [];
    this.cursor = 0;
    this.clearSleepTimer();
    this.emit();
  }

  async getState(): Promise<EngineState> {
    return this.snapshot();
  }

  async setSleepTimer(minutes: number | null, stopAfterTrack: boolean): Promise<void> {
    this.clearSleepTimer();
    this.stopAfterTrack = stopAfterTrack;
    if (minutes != null && minutes > 0) {
      this.sleepEndsAt = Date.now() + minutes * 60000;
      this.sleepTimerHandle = setTimeout(() => {
        this.audio?.pause();
        this.clearSleepTimer();
        this.emit();
      }, minutes * 60000);
    }
    this.emit();
  }

  subscribe(listener: (state: EngineState) => void): () => void {
    this.subscribers.add(listener);
    if (this.queue.length > 0) listener(this.snapshot());
    return () => {
      this.subscribers.delete(listener);
    };
  }

  dispose() {
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.progressTimer = null;
  }
}

export function createWebEngine(): PlaybackEngine {
  return new WebPlaybackEngine();
}
