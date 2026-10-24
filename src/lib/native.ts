import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type {
  EngineState,
  EqualizerState,
  FileInfo,
  MediaItem,
  MediaKind,
  PermissionStatus,
  QueueItemPayload,
  TrackInfo,
  VideoEngineState,
  VideoTracks,
} from './types';

export interface NativeMediaItem {
  uri: string;
  kind: MediaKind;
  displayName?: string;
  title: string;
  artist?: string;
  album?: string;
  albumId?: number;
  durationMs: number;
  sizeBytes?: number;
  dateAdded?: number;
  mimeType?: string;
  relPath?: string;
  folderPath?: string;
  trackNumber?: number;
  year?: number;
  bitrate?: number;
  source?: 'mediastore' | 'saf';
}

interface ScanResult {
  items: NativeMediaItem[];
  total: number;
}

export interface YutarioNativePlugin {
  getLibraryPermissionStatus(): Promise<PermissionStatus>;
  requestLibraryPermission(): Promise<PermissionStatus>;
  requestNotificationPermission(): Promise<{ granted: boolean }>;

  scanMedia(options: {
    kind: MediaKind;
    offset: number;
    limit: number;
    sort?: string;
    reverse?: boolean;
  }): Promise<ScanResult>;
  pickMedia(options: { kind: MediaKind | 'any' }): Promise<ScanResult>;
  getArtwork(options: { uri: string; size: number }): Promise<{ dataUrl: string | null }>;
  getFileInfo(options: { uri: string }): Promise<FileInfo>;
  shareFile(options: { uri: string; mimeType?: string; title?: string; kind: MediaKind }): Promise<void>;
  pickSubtitle(): Promise<{ uri: string; name: string } | null>;
  getPendingShare(): Promise<{ items: NativeMediaItem[] } | null>;

  play(options: {
    items: QueueItemPayload[];
    startIndex: number;
    startPositionMs?: number;
    autoPlay?: boolean;
  }): Promise<EngineState>;
  enqueue(options: { items: QueueItemPayload[]; mode: 'end' | 'next' }): Promise<EngineState>;
  removeFromQueue(options: { index: number }): Promise<EngineState>;
  moveQueueItem(options: { from: number; to: number }): Promise<EngineState>;
  clearQueue(): Promise<EngineState>;
  playPause(): Promise<EngineState>;
  resume(): Promise<EngineState>;
  pause(): Promise<EngineState>;
  next(): Promise<EngineState>;
  previous(): Promise<EngineState>;
  seek(options: { positionMs: number }): Promise<EngineState>;
  setRepeatMode(options: { mode: 'off' | 'one' | 'all' }): Promise<EngineState>;
  setShuffle(options: { enabled: boolean }): Promise<EngineState>;
  setSpeed(options: { speed: number }): Promise<EngineState>;
  stop(): Promise<void>;
  getPlayerState(): Promise<EngineState>;
  setSleepTimer(options: { minutes: number | null; stopAfterTrack: boolean }): Promise<EngineState>;

  getEqualizer(): Promise<EqualizerState>;
  setEqualizer(options: {
    enabled?: boolean;
    preset?: number;
    bandLevels?: number[];
    bassBoost?: number;
    virtualizer?: number;
  }): Promise<EqualizerState>;

  showVideo(options: {
    uri: string;
    title?: string;
    artist?: string;
    startPositionMs?: number;
    speed?: number;
    subtitleUri?: string | null;
    resumeKey?: string;
  }): Promise<VideoEngineState>;
  hideVideo(): Promise<void>;
  setVideoBounds(options: { x: number; y: number; width: number; height: number }): Promise<void>;
  setVideoResizeMode(options: { mode: 'fit' | 'fill' | 'zoom' }): Promise<void>;
  setVideoOverlay(options: { aboveWebView: boolean; nativeControls: boolean }): Promise<void>;
  setVideoSpeed(options: { speed: number }): Promise<VideoEngineState>;
  setVideoPaused(options: { paused: boolean }): Promise<VideoEngineState>;
  seekVideo(options: { positionMs: number }): Promise<VideoEngineState>;
  setVideoSubtitle(options: { uri: string | null; name?: string }): Promise<VideoEngineState>;
  setSubtitleSize(options: { fraction: number }): Promise<void>;
  getVideoTracks(): Promise<VideoTracks>;
  selectVideoTrack(options: { type: 'text' | 'audio'; index: number }): Promise<VideoTracks>;
  setKeepScreenOn(options: { on: boolean }): Promise<void>;
  setOrientation(options: { orientation: 'landscape' | 'portrait' | 'unlocked' }): Promise<void>;
  getCapabilities(): Promise<Record<string, boolean>>;
  openAppSettings(): Promise<void>;
  getDiagnostics(): Promise<{ log: string; lastError: string | null }>;
  clearDiagnostics(): Promise<void>;

  addListener(
    eventName: 'playerState',
    listener: (state: EngineState) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'videoState',
    listener: (state: VideoEngineState) => void,
  ): Promise<PluginListenerHandle>;
  addListener(eventName: 'shareIntent', listener: (payload: { items: NativeMediaItem[] }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'videoError', listener: (payload: { message: string }) => void): Promise<PluginListenerHandle>;
}

export const YutarioNative = registerPlugin<YutarioNativePlugin>('Yutario');

export const isNativePlatform = Capacitor.isNativePlatform();
export const isAndroid = Capacitor.getPlatform() === 'android';

export function toMediaItem(item: NativeMediaItem): MediaItem {
  return {
    id: item.uri,
    uri: item.uri,
    kind: item.kind,
    title: item.title || item.displayName || 'Unknown',
    artist: item.artist,
    album: item.album,
    albumId: item.albumId,
    durationMs: item.durationMs || 0,
    sizeBytes: item.sizeBytes,
    dateAdded: item.dateAdded,
    mimeType: item.mimeType,
    folder: item.relPath,
    folderPath: item.folderPath,
    trackNumber: item.trackNumber,
    year: item.year,
    bitrate: item.bitrate,
    source: item.source === 'saf' ? 'saf' : 'mediastore',
  };
}

export function toQueuePayload(item: MediaItem): QueueItemPayload {
  return {
    id: item.id,
    uri: item.uri,
    title: item.title,
    artist: item.artist,
    album: item.album,
    durationMs: item.durationMs,
    kind: item.kind,
  };
}

export function normalizeTrackList(tracks: TrackInfo[] | undefined): TrackInfo[] {
  return Array.isArray(tracks) ? tracks : [];
}
