import { describe, expect, it } from 'vitest';
import { albumKeyOf, filterMedia, sortMedia, tracksForAlbum, tracksForArtist } from './libraryView';
import type { MediaItem } from './types';

function makeItem(partial: Partial<MediaItem> & { id: string; title: string }): MediaItem {
  return {
    uri: `content://media/${partial.id}`,
    kind: 'audio',
    durationMs: 0,
    source: 'mediastore',
    ...partial,
  };
}

const tracks: MediaItem[] = [
  makeItem({ id: '1', title: 'Beta', artist: 'Zed', album: 'Two', durationMs: 5000, dateAdded: 100, trackNumber: 2 }),
  makeItem({ id: '2', title: 'alpha', artist: 'Amy', album: 'One', durationMs: 9000, dateAdded: 300, trackNumber: 1 }),
  makeItem({ id: '3', title: 'Gamma', artist: 'Amy', album: 'One', durationMs: 1000, dateAdded: 200, trackNumber: 2 }),
];

describe('filterMedia', () => {
  it('matches title, artist, album and file name case-insensitively', () => {
    expect(filterMedia(tracks, 'beta').map((item) => item.id)).toEqual(['1']);
    expect(filterMedia(tracks, 'amy').map((item) => item.id)).toEqual(['2', '3']);
    expect(filterMedia(tracks, 'one').map((item) => item.id)).toEqual(['2', '3']);
  });

  it('returns everything for an empty query', () => {
    expect(filterMedia(tracks, '   ')).toHaveLength(3);
  });

  it('returns no results for unknown text', () => {
    expect(filterMedia(tracks, 'zzz')).toHaveLength(0);
  });
});

describe('sortMedia', () => {
  it('sorts by name ascending and descending', () => {
    expect(sortMedia(tracks, 'name', 'asc').map((item) => item.title)).toEqual(['alpha', 'Beta', 'Gamma']);
    expect(sortMedia(tracks, 'name', 'desc').map((item) => item.title)).toEqual(['Gamma', 'Beta', 'alpha']);
  });

  it('sorts by date, duration and artist', () => {
    expect(sortMedia(tracks, 'date', 'desc').map((item) => item.id)).toEqual(['2', '3', '1']);
    expect(sortMedia(tracks, 'duration', 'asc').map((item) => item.id)).toEqual(['3', '1', '2']);
    expect(sortMedia(tracks, 'artist', 'asc').map((item) => item.artist)).toEqual(['Amy', 'Amy', 'Zed']);
  });

  it('does not mutate the input array', () => {
    const original = tracks.map((item) => item.id);
    sortMedia(tracks, 'name', 'desc');
    expect(tracks.map((item) => item.id)).toEqual(original);
  });
});

describe('collection keys', () => {
  it('builds stable album keys and resolves album/artist tracks', () => {
    const key = albumKeyOf(tracks[1]);
    expect(key).toBe('one::amy');
    expect(tracksForAlbum(tracks, key!).map((item) => item.id)).toEqual(['2', '3']);
    expect(tracksForArtist(tracks, 'amy').map((item) => item.id)).toEqual(['2', '3']);
  });

  it('ignores tracks without album or artist metadata', () => {
    expect(albumKeyOf(makeItem({ id: 'x', title: 'Untitled' }))).toBeNull();
    expect(tracksForArtist(tracks, '')).toHaveLength(0);
  });
});
