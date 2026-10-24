import type { MediaItem } from './types';

export type SortKey = 'name' | 'date' | 'duration' | 'artist' | 'album' | 'size';
export type SortDirection = 'asc' | 'desc';

function secondary(item: MediaItem): string {
  return [item.artist, item.album, item.title].filter(Boolean).join(' ').toLowerCase();
}

export function sortMedia(items: MediaItem[], key: SortKey, direction: SortDirection): MediaItem[] {
  const factor = direction === 'asc' ? 1 : -1;
  const sorted = items.slice();
  sorted.sort((a, b) => {
    switch (key) {
      case 'date':
        return ((a.dateAdded ?? 0) - (b.dateAdded ?? 0)) * factor;
      case 'duration':
        return ((a.durationMs ?? 0) - (b.durationMs ?? 0)) * factor;
      case 'size':
        return ((a.sizeBytes ?? 0) - (b.sizeBytes ?? 0)) * factor;
      case 'artist':
        return (a.artist ?? '').localeCompare(b.artist ?? '') * factor || a.title.localeCompare(b.title);
      case 'album':
        return (
          (a.album ?? '').localeCompare(b.album ?? '') * factor ||
          (a.trackNumber ?? 0) - (b.trackNumber ?? 0) ||
          a.title.localeCompare(b.title)
        );
      case 'name':
      default:
        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) * factor;
    }
  });
  return sorted;
}

export function filterMedia(items: MediaItem[], query: string): MediaItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) => {
    if (item.title.toLowerCase().includes(needle)) return true;
    if (secondary(item).includes(needle)) return true;
    if (item.folder && item.folder.toLowerCase().includes(needle)) return true;
    if (item.mimeType && item.mimeType.toLowerCase().includes(needle)) return true;
    return false;
  });
}

export function albumKeyOf(item: MediaItem): string | null {
  const album = (item.album ?? '').trim();
  if (!album) return null;
  return `${album.toLowerCase()}::${(item.artist ?? '').toLowerCase()}`;
}

export function artistKeyOf(item: MediaItem): string | null {
  const artist = (item.artist ?? '').trim();
  return artist ? artist.toLowerCase() : null;
}

export function folderKeyOf(item: MediaItem): string {
  return item.folderPath || item.folder || '';
}

export function tracksForAlbum(items: MediaItem[], key: string): MediaItem[] {
  return sortMedia(
    items.filter((item) => albumKeyOf(item) === key),
    'album',
    'asc',
  );
}

export function tracksForArtist(items: MediaItem[], key: string): MediaItem[] {
  return sortMedia(
    items.filter((item) => artistKeyOf(item) === key),
    'album',
    'asc',
  );
}

export function tracksForFolder(items: MediaItem[], key: string): MediaItem[] {
  return sortMedia(
    items.filter((item) => folderKeyOf(item) === key),
    'name',
    'asc',
  );
}
