import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronRight,
  Disc3,
  Folder,
  Heart,
  Music2,
  Play,
  Search,
  Shuffle,
  SlidersHorizontal,
  User,
  X,
} from 'lucide-react';
import { useLibrary } from '../state/library';
import { useCollections } from '../state/collections';
import { usePlayer } from '../state/player';
import { useT } from '../lib/i18n';
import { Artwork } from '../components/Artwork';
import { VirtualList } from '../components/VirtualList';
import { TrackRow } from '../components/TrackRow';
import { TrackMenu } from '../components/TrackMenu';
import { EmptyState, IconButton, Sheet, Spinner, Tabs } from '../components/ui';
import { filterMedia, sortMedia, type SortDirection, type SortKey } from '../lib/libraryView';
import { formatDurationLong, folderNameFromPath, groupAlbums, groupArtists } from '../lib/format';
import type { MediaItem } from '../lib/types';
import { isNativePlatform } from '../lib/native';
import { notify } from '../state/toast';

type MusicTab = 'songs' | 'albums' | 'artists' | 'folders' | 'favorites';

export function MusicScreen() {
  const t = useT();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const music = useLibrary((state) => state.music);
  const status = useLibrary((state) => state.status);
  const scan = useLibrary((state) => state.refresh);
  const permission = useLibrary((state) => state.permission);
  const requestPermission = useLibrary((state) => state.requestPermission);
  const favorites = useCollections((state) => state.favorites);
  const playNow = usePlayer((state) => state.playNow);
  const toggleShuffle = usePlayer((state) => state.toggleShuffle);
  const shuffle = usePlayer((state) => state.shuffle);

  const initialTab = (params.get('tab') as MusicTab | null) ?? 'songs';
  const [tab, setTab] = useState<MusicTab>(
    ['songs', 'albums', 'artists', 'folders', 'favorites'].includes(initialTab) ? initialTab : 'songs',
  );
  const [rawQuery, setRawQuery] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('date');
  const [direction, setDirection] = useState<SortDirection>('desc');
  const [sortOpen, setSortOpen] = useState(false);
  const [menuItem, setMenuItem] = useState<MediaItem | null>(null);
  const [menuIndex, setMenuIndex] = useState(0);

  useEffect(() => {
    const handle = setTimeout(() => setQuery(rawQuery), 250);
    return () => clearTimeout(handle);
  }, [rawQuery]);

  useEffect(() => {
    setParams(tab === 'songs' ? {} : { tab }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const favoriteItems = useMemo(() => favorites.map((entry) => entry.item), [favorites]);
  const source = tab === 'favorites' ? favoriteItems : music;

  const visible = useMemo(() => {
    const filtered = filterMedia(source, query);
    return sortMedia(filtered, sort, direction);
  }, [source, query, sort, direction]);

  const albums = useMemo(() => groupAlbums(visible), [visible]);
  const artists = useMemo(() => groupArtists(visible), [visible]);
  const folders = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of visible) {
      const key = item.folderPath || item.folder || '';
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [visible]);

  const playFrom = (items: MediaItem[], index: number) => {
    if (items.length === 0) return;
    void playNow(items, index);
  };

  const playAll = () => {
    if (visible.length === 0) return;
    playFrom(visible, 0);
  };

  const shuffleAll = async () => {
    if (visible.length === 0) return;
    playFrom(visible, 0);
    if (!shuffle) await toggleShuffle();
  };

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: 'date', label: t('music.sort.date') },
    { key: 'name', label: t('music.sort.name') },
    { key: 'artist', label: t('music.sort.artist') },
    { key: 'album', label: t('music.sort.album') },
    { key: 'duration', label: t('music.sort.duration') },
    { key: 'size', label: t('music.sort.size') },
  ];

  return (
    <div className="page-enter px-4 pt-[calc(env(safe-area-inset-top,0px)+18px)]">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-ink">{t('music.songs')}</h1>
          <p className="text-[12px] text-muted">
            {visible.length} {t('common.tracks')}
            {status === 'scanning' ? ` · ${t('library.scanning')}` : ''}
          </p>
        </div>
        <div className="flex gap-1">
          {isNativePlatform ? (
            <IconButton
              label={t('library.rescan')}
              onClick={() => {
                if (permission && permission.state !== 'granted') {
                  void requestPermission();
                  return;
                }
                void scan();
                notify(t('library.scanning'));
              }}
            >
              {status === 'scanning' ? <Spinner size={18} /> : <Music2 size={18} />}
            </IconButton>
          ) : null}
          <IconButton label={t('music.sortBy')} onClick={() => setSortOpen(true)}>
            <SlidersHorizontal size={18} />
          </IconButton>
        </div>
      </header>

      <div className="mb-3 flex items-center gap-2 rounded-xl border border-line/70 bg-surface px-3">
        <Search size={16} className="shrink-0 text-muted" />
        <input
          value={rawQuery}
          onChange={(event) => setRawQuery(event.target.value)}
          placeholder={t('music.searchPlaceholder')}
          className="h-10 w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
          type="search"
          enterKeyHint="search"
        />
        {rawQuery ? (
          <button type="button" onClick={() => setRawQuery('')} aria-label={t('common.close')} className="tap text-muted">
            <X size={15} />
          </button>
        ) : null}
      </div>

      <Tabs<MusicTab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'songs', label: t('music.songs') },
          { value: 'albums', label: t('music.albums') },
          { value: 'artists', label: t('music.artists') },
          { value: 'folders', label: t('music.folders') },
          { value: 'favorites', label: t('music.favorites') },
        ]}
      />

      <div className="mb-2 mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={playAll}
          disabled={visible.length === 0}
          className="tap flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
        >
          <Play size={15} />
          {t('music.playAll')}
        </button>
        <button
          type="button"
          onClick={() => void shuffleAll()}
          disabled={visible.length === 0}
          className="tap flex items-center gap-2 rounded-xl border border-line px-3.5 py-2 text-[13px] font-semibold text-ink disabled:opacity-40"
        >
          <Shuffle size={15} />
          {t('music.shuffleAll')}
        </button>
        <button
          type="button"
          onClick={() => setDirection(direction === 'asc' ? 'desc' : 'asc')}
          className="tap ms-auto flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-muted"
        >
          {direction === 'asc' ? <ArrowUpAZ size={15} /> : <ArrowDownAZ size={15} />}
          {direction === 'asc' ? t('music.ascending') : t('music.descending')}
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={<Music2 size={22} />}
            title={query ? t('music.noResults') : tab === 'favorites' ? t('home.favorites') : t('library.emptyTitle')}
            body={query ? t('music.noResultsBody') : t('library.emptyMusic')}
            action={
              !query && isNativePlatform
                ? { label: t('library.rescan'), onClick: () => void scan() }
                : undefined
            }
          />
        </div>
      ) : tab === 'songs' || tab === 'favorites' ? (
        <div className="mt-1">
          <VirtualList
            items={visible}
            itemHeight={68}
            keyFor={(item) => item.id}
            renderItem={(item, index) => (
              <TrackRow
                item={item}
                onPress={() => playFrom(visible, index)}
                onMore={() => {
                  setMenuItem(item);
                  setMenuIndex(index);
                }}
              />
            )}
          />
        </div>
      ) : tab === 'albums' ? (
        <div className="mt-3 grid grid-cols-2 gap-3 pb-4">
          {albums.map((album) => (
            <button
              key={album.key}
              type="button"
              onClick={() => navigate(`/music/album/${encodeURIComponent(album.key)}`)}
              className="tap text-start"
            >
              <Artwork uri={album.artId} size={320} className="aspect-square w-full" rounded="rounded-2xl" />
              <p className="mt-2 truncate text-[13px] font-semibold text-ink">{album.title}</p>
              <p className="truncate text-[11px] text-muted">
                {album.artist || t('common.unknownArtist')} · {album.trackCount}
              </p>
            </button>
          ))}
        </div>
      ) : tab === 'artists' ? (
        <ul className="mt-2 space-y-1">
          {artists.map((artist) => (
            <li key={artist.key}>
              <button
                type="button"
                onClick={() => navigate(`/music/artist/${encodeURIComponent(artist.key)}`)}
                className="tap flex w-full items-center gap-3 rounded-xl p-2 text-start hover:bg-surface-2/70"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-accent">
                  <User size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-ink">{artist.name}</span>
                  <span className="block text-[11px] text-muted">
                    {artist.trackCount} {t('common.tracks')} · {artist.albumCount} {t('music.albums')}
                  </span>
                </span>
                <ChevronRight size={16} className="text-muted" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-2 space-y-1">
          {folders.map((folder) => (
            <li key={folder.path}>
              <button
                type="button"
                onClick={() => navigate(`/music/folder/${encodeURIComponent(folder.path)}`)}
                className="tap flex w-full items-center gap-3 rounded-xl p-2 text-start hover:bg-surface-2/70"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-accent">
                  <Folder size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-ink">
                    {folderNameFromPath(folder.path) || folder.path}
                  </span>
                  <span className="block truncate text-[11px] text-muted">
                    {folder.count} {t('common.tracks')} · {folder.path}
                  </span>
                </span>
                <ChevronRight size={16} className="text-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={sortOpen} onClose={() => setSortOpen(false)} title={t('music.sortBy')}>
        <ul className="space-y-0.5 pb-2">
          {sortOptions.map((option) => (
            <li key={option.key}>
              <button
                type="button"
                onClick={() => {
                  setSort(option.key);
                  setSortOpen(false);
                }}
                className={`tap flex w-full items-center justify-between rounded-xl px-3 py-3 text-start text-sm ${
                  sort === option.key ? 'bg-accent/15 font-semibold text-accent' : 'text-ink hover:bg-surface-2'
                }`}
              >
                {option.label}
                {sort === option.key ? <Disc3 size={16} /> : null}
              </button>
            </li>
          ))}
          <li className="pt-2">
            <button
              type="button"
              onClick={() => setDirection(direction === 'asc' ? 'desc' : 'asc')}
              className="tap flex w-full items-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold text-ink hover:bg-surface-2"
            >
              {direction === 'asc' ? <ArrowUpAZ size={16} /> : <ArrowDownAZ size={16} />}
              {direction === 'asc' ? t('music.ascending') : t('music.descending')}
            </button>
          </li>
        </ul>
      </Sheet>

      <TrackMenu
        open={menuItem !== null}
        item={menuItem}
        onClose={() => setMenuItem(null)}
        context="library"
        queueIndex={menuIndex}
      />

      {source.length > 0 && tab !== 'songs' ? (
        <p className="mt-6 flex items-center justify-center gap-1 text-[11px] text-muted">
          <Heart size={11} />
          {formatDurationLong(source.reduce((total, item) => total + item.durationMs, 0))}
        </p>
      ) : null}
    </div>
  );
}
