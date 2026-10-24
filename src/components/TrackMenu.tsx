import { useEffect, useState } from 'react';
import {
  Clock3,
  FileAudio,
  Folder,
  Heart,
  Info,
  ListPlus,
  ListX,
  Play,
  Plus,
  Share2,
  SkipForward,
  Trash2,
} from 'lucide-react';
import type { FileInfo, MediaItem } from '../lib/types';
import { useT } from '../lib/i18n';
import { usePlayer } from '../state/player';
import { useCollections } from '../state/collections';
import { notify } from '../state/toast';
import { Dialog, Sheet, TextField } from './ui';
import { isNativePlatform, YutarioNative } from '../lib/native';
import { formatBytes, formatDate, formatTime } from '../lib/format';

type MenuAction = {
  icon: React.ReactNode;
  label: string;
  onSelect: () => void;
  tone?: 'danger';
};

export function TrackMenu({
  open,
  onClose,
  item,
  context = 'library',
  queueIndex,
  playlistId,
}: {
  open: boolean;
  onClose: () => void;
  item: MediaItem | null;
  context?: 'library' | 'queue' | 'playlist';
  queueIndex?: number;
  playlistId?: string;
}) {
  const t = useT();
  const playNow = usePlayer((state) => state.playNow);
  const addToQueue = usePlayer((state) => state.addToQueue);
  const removeFromQueue = usePlayer((state) => state.removeFromQueue);
  const favorites = useCollections((state) => state.favorites);
  const toggleFavorite = useCollections((state) => state.toggleFavorite);
  const playlists = useCollections((state) => state.playlists);
  const addToPlaylist = useCollections((state) => state.addToPlaylist);
  const removeFromPlaylist = useCollections((state) => state.removeFromPlaylist);
  const createPlaylist = useCollections((state) => state.createPlaylist);

  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false);
  const [newPlaylistOpen, setNewPlaylistOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [infoOpen, setInfoOpen] = useState(false);
  const [info, setInfo] = useState<FileInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setPlaylistPickerOpen(false);
      setInfoOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (!infoOpen || !item || !isNativePlatform) return;
    let cancelled = false;
    setInfoLoading(true);
    YutarioNative.getFileInfo({ uri: item.uri })
      .then((result) => {
        if (!cancelled) setInfo(result);
      })
      .catch(() => {
        if (!cancelled) setInfo({ exists: false, sizeBytes: 0 });
      })
      .finally(() => {
        if (!cancelled) setInfoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [infoOpen, item]);

  if (!item) return null;
  const isFavorite = favorites.some((entry) => entry.item.id === item.id);

  const actions: MenuAction[] = [
    {
      icon: <Play size={17} />,
      label: t('common.play'),
      onSelect: () => {
        void playNow([item], 0);
        onClose();
      },
    },
    {
      icon: <SkipForward size={17} />,
      label: t('player.playNext'),
      onSelect: () => {
        void addToQueue([item], 'next');
        notify(t('player.upNext'));
        onClose();
      },
    },
    {
      icon: <ListPlus size={17} />,
      label: t('player.addToQueue'),
      onSelect: () => {
        void addToQueue([item], 'end');
        notify(t('player.addToQueue'));
        onClose();
      },
    },
    {
      icon: <Heart size={17} fill={isFavorite ? 'currentColor' : 'none'} />,
      label: isFavorite ? t('player.removeFromFavorites') : t('player.addToFavorites'),
      onSelect: () => {
        const added = toggleFavorite(item);
        notify(added ? t('player.favorited') : t('player.removeFromFavorites'));
        onClose();
      },
    },
    {
      icon: <ListPlus size={17} />,
      label: t('playlists.addTo'),
      onSelect: () => setPlaylistPickerOpen(true),
    },
    {
      icon: <Info size={17} />,
      label: t('file.info'),
      onSelect: () => setInfoOpen(true),
    },
  ];

  if (isNativePlatform) {
    actions.push({
      icon: <Share2 size={17} />,
      label: t('file.share'),
      onSelect: () => {
        YutarioNative.shareFile({
          uri: item.uri,
          mimeType: item.mimeType,
          title: item.title,
          kind: item.kind,
        }).catch(() => notify(t('error.share'), 'error'));
        onClose();
      },
    });
  }

  if (context === 'queue' && queueIndex !== undefined) {
    actions.push({
      icon: <ListX size={17} />,
      label: t('player.removeFromQueue'),
      tone: 'danger',
      onSelect: () => {
        void removeFromQueue(queueIndex);
        onClose();
      },
    });
  }

  if (context === 'playlist' && playlistId) {
    actions.push({
      icon: <Trash2 size={17} />,
      label: t('file.removeFromPlaylist'),
      tone: 'danger',
      onSelect: () => {
        removeFromPlaylist(playlistId, item.id);
        notify(t('file.deleted'));
        onClose();
      },
    });
  }

  return (
    <>
      <Sheet open={open} onClose={onClose} title={item.title}>
        <p className="-mt-1 mb-3 truncate text-xs text-muted">
          {[item.artist || t('common.unknownArtist'), item.album].filter(Boolean).join(' · ')}
        </p>
        <ul className="space-y-0.5">
          {actions.map((action) => (
            <li key={action.label}>
              <button
                type="button"
                onClick={action.onSelect}
                className={`tap flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start text-[14px] font-medium ${
                  action.tone === 'danger' ? 'text-danger' : 'text-ink'
                } hover:bg-surface-2`}
              >
                <span className="text-muted">{action.icon}</span>
                {action.label}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet
        open={playlistPickerOpen && open}
        onClose={() => setPlaylistPickerOpen(false)}
        title={t('playlists.addTo')}
      >
        <button
          type="button"
          onClick={() => {
            setNewName('');
            setNewPlaylistOpen(true);
          }}
          className="tap mb-2 flex w-full items-center gap-3 rounded-xl border border-dashed border-line px-3 py-3 text-sm font-semibold text-accent"
        >
          <Plus size={17} />
          {t('playlists.new')}
        </button>
        {playlists.length === 0 ? (
          <p className="px-1 py-3 text-sm text-muted">{t('playlists.none')}</p>
        ) : (
          <ul className="space-y-0.5">
            {playlists.map((playlist) => (
              <li key={playlist.id}>
                <button
                  type="button"
                  onClick={() => {
                    const added = addToPlaylist(playlist.id, [item]);
                    notify(added > 0 ? t('playlists.added') : t('playlists.emptyList'));
                    setPlaylistPickerOpen(false);
                    onClose();
                  }}
                  className="tap flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-start hover:bg-surface-2"
                >
                  <span className="truncate text-sm font-medium">{playlist.name}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {playlist.items.length} {t('common.tracks')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      <Dialog
        open={newPlaylistOpen}
        title={t('playlists.create')}
        confirmLabel={t('common.save')}
        onClose={() => setNewPlaylistOpen(false)}
        confirmDisabled={newName.trim().length === 0}
        onConfirm={() => {
          const id = createPlaylist(newName, [item]);
          notify(t('playlists.added'));
          void id;
          setNewPlaylistOpen(false);
          setPlaylistPickerOpen(false);
          onClose();
        }}
      >
        <TextField
          value={newName}
          onChange={setNewName}
          placeholder={t('playlists.namePlaceholder')}
          autoFocus
          onSubmit={() => {
            if (newName.trim()) {
              createPlaylist(newName, [item]);
              setNewPlaylistOpen(false);
              setPlaylistPickerOpen(false);
              onClose();
            }
          }}
        />
      </Dialog>

      <Sheet open={infoOpen && open} onClose={() => setInfoOpen(false)} title={t('file.info')}>
        <dl className="divide-y divide-line/60 text-sm">
          <InfoRow label={t('common.track')} value={item.title} />
          <InfoRow label={t('music.sort.artist')} value={item.artist || t('common.unknownArtist')} />
          <InfoRow label={t('music.sort.album')} value={item.album || t('common.unknownAlbum')} />
          <InfoRow label={t('common.duration')} value={formatTime(item.durationMs)} />
          <InfoRow
            label={t('common.size')}
            value={formatBytes(info?.sizeBytes || item.sizeBytes)}
            icon={<FileAudio size={14} />}
          />
          <InfoRow label={t('common.type')} value={item.mimeType || '—'} />
          <InfoRow
            label={t('common.folder')}
            value={item.folder || item.folderPath || '—'}
            icon={<Folder size={14} />}
          />
          <InfoRow
            label={t('common.dateAdded')}
            value={formatDate(item.dateAdded)}
            icon={<Clock3 size={14} />}
          />
          {info ? (
            <InfoRow
              label={t('common.options')}
              value={infoLoading ? t('common.loading') : info.exists ? '✓' : t('player.missing')}
            />
          ) : null}
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-muted">{t('settings.privacyBody')}</p>
      </Sheet>
    </>
  );
}

function InfoRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="flex items-center gap-1.5 text-xs text-muted">
        {icon}
        {label}
      </dt>
      <dd className="max-w-[62%] break-words text-end text-[13px] text-ink">{value}</dd>
    </div>
  );
}
