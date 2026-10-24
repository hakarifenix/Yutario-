import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCollections } from './collections';
import { useLibrary } from './library';
import { readJson, STORAGE_KEYS } from '../lib/storage';
import type { MediaItem } from '../lib/types';

const track = (id: string, title = id): MediaItem => ({
  id,
  uri: `content://media/audio/${id}`,
  kind: 'audio',
  title,
  artist: 'Artist',
  album: 'Album',
  durationMs: 120000,
  source: 'mediastore',
});

const reset = () => {
  useCollections.setState({
    playlists: [],
    favorites: [],
    history: [],
    progress: {},
    hydrated: true,
  });
};

beforeEach(() => {
  reset();
  localStorage.clear();
});

describe('playlists', () => {
  it('creates a playlist with trimmed names and no duplicate tracks', () => {
    const id = useCollections.getState().createPlaylist('  Road trip  ', [track('a'), track('a'), track('b')]);
    const playlist = useCollections.getState().playlists.find((entry) => entry.id === id);
    expect(playlist?.name).toBe('Road trip');
    expect(playlist?.items.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('renames, reorders and removes entries', () => {
    const id = useCollections.getState().createPlaylist('Mine', [track('a'), track('b'), track('c')]);
    useCollections.getState().renamePlaylist(id, 'Renamed');
    useCollections.getState().movePlaylistItem(id, 0, 2);
    useCollections.getState().removeFromPlaylist(id, 'b');

    const playlist = useCollections.getState().playlists.find((entry) => entry.id === id);
    expect(playlist?.name).toBe('Renamed');
    expect(playlist?.items.map((item) => item.id)).toEqual(['c', 'a']);
  });

  it('does not add the same track twice', () => {
    const id = useCollections.getState().createPlaylist('Mine', [track('a')]);
    const added = useCollections.getState().addToPlaylist(id, [track('a'), track('b')]);
    expect(added).toBe(1);
    expect(useCollections.getState().playlists.find((entry) => entry.id === id)?.items).toHaveLength(2);
  });

  it('deletes a playlist without touching other data', () => {
    const first = useCollections.getState().createPlaylist('One', [track('a')]);
    const second = useCollections.getState().createPlaylist('Two', [track('b')]);
    useCollections.getState().toggleFavorite(track('a'));
    useCollections.getState().deletePlaylist(first);

    expect(useCollections.getState().playlists.map((entry) => entry.id)).toEqual([second]);
    expect(useCollections.getState().favorites).toHaveLength(1);
  });
});

describe('favourites and progress', () => {
  it('toggles favourites', () => {
    const item = track('a');
    expect(useCollections.getState().toggleFavorite(item)).toBe(true);
    expect(useCollections.getState().isFavorite('a')).toBe(true);
    expect(useCollections.getState().favoriteItems()).toHaveLength(1);
    expect(useCollections.getState().toggleFavorite(item)).toBe(false);
    expect(useCollections.getState().isFavorite('a')).toBe(false);
  });

  it('stores resume positions and clears history', () => {
    useCollections.getState().setProgress('a', 42000);
    expect(useCollections.getState().getProgress('a')).toBe(42000);
    useCollections.getState().recordPlayed(track('a'), 1000);
    expect(useCollections.getState().history[0].item.id).toBe('a');

    useCollections.getState().clearHistory();
    expect(useCollections.getState().history).toHaveLength(0);
    expect(useCollections.getState().progress).toEqual({});
  });
});

describe('persistence', () => {
  it('writes playlists to storage and restores them on hydrate', async () => {
    vi.useFakeTimers();
    const id = useCollections.getState().createPlaylist('Persisted', [track('a'), track('b')]);
    await vi.advanceTimersByTimeAsync(600);
    vi.useRealTimers();

    const stored = await readJson<{ id: string; name: string; items: MediaItem[] }[]>(
      STORAGE_KEYS.playlists,
      [],
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(id);
    expect(stored[0].items).toHaveLength(2);

    useCollections.setState({ playlists: [], hydrated: false });
    await useCollections.getState().hydrate();
    expect(useCollections.getState().playlists[0].name).toBe('Persisted');
  });

  it('keeps playlists when the media library is refreshed or emptied', () => {
    const id = useCollections.getState().createPlaylist('Keep me', [track('a')]);
    useLibrary.setState({ music: [track('a'), track('b')], videos: [] });
    useLibrary.setState({ music: [], videos: [] });

    expect(useCollections.getState().playlists.find((entry) => entry.id === id)?.items).toHaveLength(1);
  });
});
