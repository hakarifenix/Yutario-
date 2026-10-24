import { describe, expect, it } from 'vitest';
import { folderNameFromPath, formatBytes, formatTime, groupAlbums, groupArtists, stripExtension } from './format';

describe('formatTime', () => {
  it('formats minutes and seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65_000)).toBe('1:05');
    expect(formatTime(3_723_000)).toBe('1:02:03');
  });

  it('handles missing or invalid durations', () => {
    expect(formatTime(undefined)).toBe('--:--');
    expect(formatTime(-5)).toBe('--:--');
    expect(formatTime(Number.NaN)).toBe('--:--');
  });
});

describe('formatBytes', () => {
  it('formats byte sizes', () => {
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(15 * 1024 * 1024)).toBe('15 MB');
    expect(formatBytes(undefined)).toBe('—');
  });
});

describe('groupAlbums', () => {
  it('groups by album and artist and counts tracks', () => {
    const albums = groupAlbums([
      { id: '1', album: 'Night', artist: 'A', durationMs: 1000 },
      { id: '2', album: 'Night', artist: 'A', durationMs: 2000 },
      { id: '3', album: 'Day', artist: 'B', durationMs: 500 },
      { id: '4', durationMs: 100 },
    ]);
    expect(albums).toHaveLength(2);
    const night = albums.find((album) => album.title === 'Night');
    expect(night?.trackCount).toBe(2);
    expect(night?.durationMs).toBe(3000);
  });

  it('groups artists with album counts', () => {
    const artists = groupArtists([
      { artist: 'A', album: 'One' },
      { artist: 'A', album: 'Two' },
      { artist: 'B', album: 'One' },
      { album: 'unknown' },
    ]);
    expect(artists.map((artist) => artist.name)).toEqual(['A', 'B']);
    expect(artists[0].albumCount).toBe(2);
  });
});

describe('paths', () => {
  it('derives folder names and strips extensions', () => {
    expect(folderNameFromPath('Music/Albums/')).toBe('Albums');
    expect(folderNameFromPath('/storage/emulated/0/Music')).toBe('Music');
    expect(stripExtension('Track 01.flac')).toBe('Track 01');
    expect(stripExtension('no-extension')).toBe('no-extension');
  });
});
