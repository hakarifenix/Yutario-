import type { EngineState, MediaItem, RepeatMode } from './types';
import { createNativeEngine } from './engineNative';
import { createWebEngine } from './engineWeb';
import { isNativePlatform } from './native';

export interface PlaybackEngine {
  readonly isNative: boolean;
  play(items: MediaItem[], startIndex: number, options?: { positionMs?: number; autoPlay?: boolean }): Promise<void>;
  toggle(): Promise<void>;
  resume(): Promise<void>;
  pause(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setRepeat(mode: RepeatMode): Promise<void>;
  setShuffle(enabled: boolean): Promise<void>;
  setSpeed(speed: number): Promise<void>;
  addToQueue(items: MediaItem[], mode: 'end' | 'next'): Promise<void>;
  removeFromQueue(index: number): Promise<void>;
  moveInQueue(from: number, to: number): Promise<void>;
  stop(): Promise<void>;
  getState(): Promise<EngineState | null>;
  setSleepTimer(minutes: number | null, stopAfterTrack: boolean): Promise<void>;
  subscribe(listener: (state: EngineState) => void): () => void;
}

export const engine: PlaybackEngine = isNativePlatform ? createNativeEngine() : createWebEngine();
