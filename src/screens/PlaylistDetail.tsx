import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, ListMusic, Pencil, Play, Plus, Shuffle, Trash2 } from 'lucide-react';
import { useCollections } from '../state/collections';
import { usePlayer } from '../state/player';
import { useT } from '../lib/i18n';
import { Artwork } from '../components/Artwork';
import { VirtualList } from '../components/VirtualList';
import { TrackRow } from '../components/TrackRow';
import { TrackMenu } from '../components/TrackMenu';
import { Dialog, EmptyState, IconButton, TextField } from '../components/ui';
import { formatDurationLong } from '../lib/format';
import type { MediaItem } from '../lib/types';
import { notify } from '../state/toast';

export function PlaylistDetailScreen() {
  const t = useT();
  const navigate = useNavigate();
  const params = useParams();
  const playlistId = params.id ?? '';
  const playlist = useCollections((state) => state.playlists.find((entry) => entry.id === playlistId));
  const renamePlaylist = useCollections((state) => state.renamePlaylist);
  const deletePlaylist = useCollections((state) => state.deletePlaylist);
  const movePlaylistItem = useCollections((state) => state.movePlaylistItem);
  const playNow = usePlayer((state) => state.playNow);
  const shuffle = usePlayer((state) => state.shuffle);
  const toggleShuffle = usePlayer((state) => state.toggleShuffle);

  const [menuItem, setMenuItem] = useState<MediaItem | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState(playlist?.name ?? '');
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!playlist) {
    return (
      <div className="px-4 pt-[calc(env(safe-area-inset-top,0px)+14px)]">
        <IconButton label={t('a11y.back')} onClick={() => navigate(-1)}>
          <ArrowLeft size={20} className="rtl:rotate-180" />
        </IconButton>
        <div className="mt-6">
          <EmptyState icon={<ListMusic size={22} />} title={t('playlists.empty')} />
        </div>
      </div>
    );
  }

  const items = playlist.items;
  const totalDuration = items.reduce((total, item) => total + item.durationMs, 0);

  const playAll = async (index = 0) => {
    if (items.length === 0) return;
    await playNow(items, index);
  };

  const shuffleAll = async () => {
    if (items.length === 0) return;
    await playNow(items, 0);
    if (!shuffle) await toggleShuffle();
  };

  return (
    <div className="page-enter px-4 pt-[calc(env(safe-area-inset-top,0px)+14px)]">
      <div className="mb-4 flex items-center gap-2">
        <IconButton label={t('a11y.back')} onClick={() => navigate(-1)}>
          <ArrowLeft size={20} className="rtl:rotate-180" />
        </IconButton>
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          {t('playlists.title')}
        </span>
        <div className="ms-auto flex gap-1">
          <IconButton
            label={t('playlists.rename')}
            size="sm"
            onClick={() => {
              setName(playlist.name);
              setRenameOpen(true);
            }}
          >
            <Pencil size={16} />
          </IconButton>
          <IconButton label={t('playlists.delete')} size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 size={16} className="text-danger" />
          </IconButton>
        </div>
      </div>

      <div className="mb-5 flex items-end gap-4">
        <Artwork uri={items[0]?.uri} size={360} className="h-24 w-24" rounded="rounded-2xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-balance text-[20px] font-bold leading-tight text-ink">{playlist.name}</h1>
          <p className="mt-1 text-[11px] text-muted">
            {items.length} {t('common.tracks')} · {formatDurationLong(totalDuration)}
          </p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void playAll()}
          disabled={items.length === 0}
          className="tap flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
        >
          <Play size={15} />
          {t('music.playAll')}
        </button>
        <button
          type="button"
          onClick={() => void shuffleAll()}
          disabled={items.length === 0}
          className="tap flex items-center gap-2 rounded-xl border border-line px-4 py-2 text-[13px] font-semibold text-ink disabled:opacity-40"
        >
          <Shuffle size={15} />
          {t('music.shuffleAll')}
        </button>
        <button
          type="button"
          onClick={() => navigate('/music')}
          className="tap flex items-center gap-2 rounded-xl border border-line px-4 py-2 text-[13px] font-semibold text-ink"
        >
          <Plus size={15} />
          {t('playlists.addTo')}
        </button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<ListMusic size={22} />}
          title={t('playlists.emptyList')}
          body={t('playlists.emptyBody')}
          action={{ label: t('library.importFiles'), onClick: () => navigate('/music') }}
        />
      ) : (
        <>
          <p className="mb-1 text-[11px] text-muted">{t('playlists.reorderHint')}</p>
          <VirtualList
            items={items}
            itemHeight={68}
            keyFor={(item) => item.id}
            renderItem={(item, index) => (
              <TrackRow
                item={item}
                onPress={() => void playAll(index)}
                onMore={() => setMenuItem(item)}
                trailingAccessory={
                  <span className="flex shrink-0 items-center">
                    <IconButton
                      label={t('playlists.moveUp')}
                      size="sm"
                      disabled={index === 0}
                      onClick={() => movePlaylistItem(playlist.id, index, index - 1)}
                    >
                      <ArrowUp size={15} />
                    </IconButton>
                    <IconButton
                      label={t('playlists.moveDown')}
                      size="sm"
                      disabled={index === items.length - 1}
                      onClick={() => movePlaylistItem(playlist.id, index, index + 1)}
                    >
                      <ArrowDown size={15} />
                    </IconButton>
                  </span>
                }
              />
            )}
          />
        </>
      )}

      <TrackMenu
        open={menuItem !== null}
        item={menuItem}
        onClose={() => setMenuItem(null)}
        context="playlist"
        playlistId={playlist.id}
      />

      <Dialog
        open={renameOpen}
        title={t('playlists.rename')}
        confirmLabel={t('common.save')}
        confirmDisabled={name.trim().length === 0}
        onClose={() => setRenameOpen(false)}
        onConfirm={() => {
          if (name.trim()) {
            renamePlaylist(playlist.id, name);
            notify(t('common.save'));
          }
          setRenameOpen(false);
        }}
      >
        <TextField value={name} onChange={setName} placeholder={t('playlists.name')} autoFocus />
      </Dialog>

      <Dialog
        open={deleteOpen}
        title={t('playlists.delete')}
        message={t('playlists.deleteConfirm', { name: playlist.name })}
        confirmLabel={t('common.delete')}
        danger
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          deletePlaylist(playlist.id);
          setDeleteOpen(false);
          navigate(-1);
        }}
      />
    </div>
  );
}
