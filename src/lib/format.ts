export function formatTime(ms: number | undefined | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '--:--';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

export function formatDurationLong(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0 min';
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function formatBytes(bytes: number | undefined | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function formatDate(epochMs?: number): string {
  if (!epochMs) return '';
  try {
    return new Date(epochMs).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

/** Groups a list of tracks into albums, preserving deterministic ordering. */
export function groupAlbums<T extends { album?: string; artist?: string; durationMs: number; id: string; albumId?: number }>(
  items: T[],
): { key: string; title: string; artist: string; trackCount: number; artId: string; durationMs: number }[] {
  const map = new Map<string, { title: string; artist: string; trackCount: number; artId: string; durationMs: number }>();
  for (const item of items) {
    const title = (item.album ?? '').trim();
    if (!title) continue;
    const key = `${title.toLowerCase()}::${(item.artist ?? '').toLowerCase()}`;
    const existing = map.get(key);
    if (existing) {
      existing.trackCount += 1;
      existing.durationMs += item.durationMs || 0;
    } else {
      map.set(key, {
        title,
        artist: item.artist ?? '',
        trackCount: 1,
        artId: item.id,
        durationMs: item.durationMs || 0,
      });
    }
  }
  return Array.from(map.entries())
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function groupArtists<T extends { artist?: string; album?: string }>(items: T[]) {
  const map = new Map<string, { name: string; trackCount: number; albums: Set<string> }>();
  for (const item of items) {
    const name = (item.artist ?? '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const entry = map.get(key);
    if (entry) {
      entry.trackCount += 1;
      if (item.album) entry.albums.add(item.album.toLowerCase());
    } else {
      map.set(key, { name, trackCount: 1, albums: new Set(item.album ? [item.album.toLowerCase()] : []) });
    }
  }
  return Array.from(map.entries())
    .map(([key, value]) => ({ key, name: value.name, trackCount: value.trackCount, albumCount: value.albums.size }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function stripExtension(fileName: string): string {
  const index = fileName.lastIndexOf('.');
  return index > 0 ? fileName.slice(0, index) : fileName;
}

export function folderNameFromPath(path: string): string {
  const cleaned = path.replace(/\/+$/, '');
  const parts = cleaned.split('/');
  return parts[parts.length - 1] || path;
}
