import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Disc3, Folder, Play, Shuffle, User } from 'lucide-react';
import { useLibrary } from '../state/library';
import { usePlayer } from '../state/player';
import { useT } from '../lib/i18n';
import { Artwork } from '../components/Artwork';
import { VirtualList } from '../components/VirtualList';
import { TrackRow } from '../components/TrackRow';
import { TrackMenu } from '../components/TrackMenu';
import { EmptyState, IconButton } from '../components/ui';
import { tracksForAlbum, tracksForArtist, tracksForFolder } from '../lib/libraryView';
import { folderNameFromPath, formatDurationLong } from '../lib/format';
import type { MediaItem } from '../lib/types';

export function CollectionScreen({ type }: { type: 'album' | 'artist' | 'folder' }) {
  const t = useT();
  const navigate = useNavigate();
  const params = useParams();
  const key = params.key ? decodeURIComponent(params.key) : '';
  const music = useLibrary((state) => state.music);
  const playNow = usePlayer((state) => state.playNow);
  const shuffle = usePlayer((state) => state.shuffle);
  const toggleShuffle = usePlayer((state) => state.toggleShuffle);
  const [menuItem, setMenuItem] = useState<MediaItem | null>(null);

  const tracks = useMemo(() => {
    if (type === 'album') return tracksForAlbum(music, key);
    if (type === 'artist') return tracksForArtist(music, key);
    return tracksForFolder(music, key);
  }, [music, key, type]);

  const title =
    type === 'album'
      ? tracks[0]?.album || key.split('::')[0]
      : type === 'artist'
        ? tracks[0]?.artist || key
        : folderNameFromPath(key) || t('common.folder');
  const subtitle =
    type === 'album'
      ? tracks[0]?.artist || t('common.unknownArtist')
      : type === 'artist'
        ? t('music.artists')
        : key;
  const totalDuration = tracks.reduce((total, item) => total + item.durationMs, 0);

  const playAll = async () => {
    if (tracks.length === 0) return;
    await playNow(tracks, 0);
  };

  const shuffleAll = async () => {
    if (tracks.length === 0) return;
    await playNow(tracks, 0);
    if (!shuffle) await toggleShuffle();
  };

  return (
    <div className="page-enter px-4 pt-[calc(env(safe-area-inset-top,0px)+14px)]">
      <div className="mb-4 flex items-center gap-2">
        <IconButton label={t('a11y.back')} onClick={() => navigate(-1)}>
          <ArrowLeft size={20} className="rtl:rotate-180" />
        </IconButton>
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          {type === 'album' ? t('music.albums') : type === 'artist' ? t('music.artists') : t('music.folders')}
        </span>
      </div>

      <div className="mb-5 flex items-end gap-4">
        {type === 'artist' ? (
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent/30 to-accent-2/20 text-accent">
            <User size={38} strokeWidth={1.5} />
          </div>
        ) : (
          <Artwork
            uri={tracks[0]?.uri}
            size={360}
            className="h-24 w-24"
            rounded={type === 'folder' ? 'rounded-2xl' : 'rounded-2xl'}
          />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-balance text-[20px] font-bold leading-tight text-ink">{title}</h1>
          <p className="mt-1 truncate text-[12px] text-muted">{subtitle}</p>
          <p className="mt-0.5 text-[11px] text-muted">
            {tracks.length} {t('common.tracks')} · {formatDurationLong(totalDuration)}
          </p>
        </div>
      </div>

      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={() => void playAll()}
          className="tap flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-[13px] font-semibold text-white"
        >
          <Play size={15} />
          {t('music.playAll')}
        </button>
        <button
          type="button"
          onClick={() => void shuffleAll()}
          className="tap flex items-center gap-2 rounded-xl border border-line px-4 py-2 text-[13px] font-semibold text-ink"
        >
          <Shuffle size={15} />
          {t('music.shuffleAll')}
        </button>
      </div>

      {tracks.length === 0 ? (
        <EmptyState
          icon={type === 'folder' ? <Folder size={22} /> : <Disc3 size={22} />}
          title={t('music.noResults')}
          body={t('library.emptyMusic')}
        />
      ) : (
        <VirtualList
          items={tracks}
          itemHeight={68}
          keyFor={(item) => item.id}
          renderItem={(item, index) => (
            <TrackRow
              item={item}
              onPress={() => void playNow(tracks, index)}
              onMore={() => setMenuItem(item)}
            />
          )}
        />
      )}

      <TrackMenu
        open={menuItem !== null}
        item={menuItem}
        onClose={() => setMenuItem(null)}
        context="library"
      />
    </div>
  );
}
