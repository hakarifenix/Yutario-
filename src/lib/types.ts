export type MediaKind = 'audio' | 'video';

export type MediaSource = 'mediastore' | 'saf' | 'web';

/** A local media item. `id` is the stable content URI (or blob URL on web). */
export interface MediaItem {
  id: string;
  uri: string;
  kind: MediaKind;
  title: string;
  artist?: string;
  album?: string;
  albumId?: number;
  durationMs: number;
  sizeBytes?: number;
  dateAdded?: number;
  mimeType?: string;
  folder?: string;
  folderPath?: string;
  trackNumber?: number;
  year?: number;
  bitrate?: number;
  source: MediaSource;
}

export interface FolderGroup {
  path: string;
  name: string;
  count: number;
}

export interface AlbumGroup {
  key: string;
  title: string;
  artist: string;
  trackCount: number;
  artId: string;
  durationMs: number;
}

export interface ArtistGroup {
  key: string;
  name: string;
  trackCount: number;
  albumCount: number;
}

export type RepeatMode = 'off' | 'one' | 'all';

export type LibraryPermissionState = 'granted' | 'partial' | 'prompt' | 'denied' | 'unsupported';

export interface PermissionStatus {
  state: LibraryPermissionState;
  readAudio: boolean;
  readVideo: boolean;
  notifications: boolean;
  sdk: number;
}

/** Raw playback state emitted by the native engine (single source of truth). */
export interface EngineState {
  queueIds: string[];
  index: number;
  isPlaying: boolean;
  playWhenReady: boolean;
  isBuffering: boolean;
  positionMs: number;
  durationMs: number;
  bufferedMs: number;
  repeat: RepeatMode;
  shuffle: boolean;
  speed: number;
  ended: boolean;
  error?: string | null;
  sleepTimerEndsAt?: number | null;
  stopAfterTrack?: boolean;
}

export interface VideoEngineState {
  isPlaying: boolean;
  isBuffering: boolean;
  positionMs: number;
  durationMs: number;
  bufferedMs: number;
  ended: boolean;
  error?: string | null;
  ready: boolean;
}

export interface TrackInfo {
  index: number;
  id: string;
  label: string;
  language: string;
  selected: boolean;
}

export interface VideoTracks {
  audio: TrackInfo[];
  text: TrackInfo[];
}

export interface EqualizerState {
  supported: boolean;
  enabled: boolean;
  preset: number;
  presets: string[];
  bandLevels: number[];
  bandFrequencies: number[];
  minLevel: number;
  maxLevel: number;
  bassBoost: number;
  bassMax: number;
  virtualizer: number;
  virtualizerMax: number;
  sessionId?: number;
  reason?: string | null;
}

export interface FileInfo {
  exists: boolean;
  sizeBytes: number;
  mimeType?: string;
  displayName?: string;
  path?: string | null;
}

export interface QueueItemPayload {
  id: string;
  uri: string;
  title: string;
  artist?: string;
  album?: string;
  durationMs: number;
  kind: MediaKind;
}

export interface SleepTimerState {
  endsAt: number | null;
  minutes: number | null;
  stopAfterTrack: boolean;
}
