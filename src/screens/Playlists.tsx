import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ListMusic, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCollections, type Playlist } from '../state/collections';
import { useT } from '../lib/i18n';
import { Artwork } from '../components/Artwork';
import { Dialog, EmptyState, IconButton, Sheet, TextField } from '../components/ui';
import { notify } from '../state/toast';

export function PlaylistsScreen() {
  const t = useT();
  const navigate = useNavigate();
  const playlists = useCollections((state) => state.playlists);
  const createPlaylist = useCollections((state) => state.createPlaylist);
  const renamePlaylist = useCollections((state) => state.renamePlaylist);
  const deletePlaylist = useCollections((state) => state.deletePlaylist);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [menuPlaylist, setMenuPlaylist] = useState<Playlist | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div className="page-enter px-4 pt-[calc(env(safe-area-inset-top,0px)+18px)]">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-ink">{t('playlists.title')}</h1>
          <p className="text-[12px] text-muted">
            {playlists.length} {t('playlists.title').toLowerCase()}
          </p>
        </div>
        <IconButton
          label={t('playlists.new')}
          variant="surface"
          onClick={() => {
            setName('');
            setCreateOpen(true);
          }}
        >
          <Plus size={19} />
        </IconButton>
      </header>

      {playlists.length === 0 ? (
        <EmptyState
          icon={<ListMusic size={22} />}
          title={t('playlists.empty')}
          body={t('playlists.emptyBody')}
          action={{
            label: t('playlists.create'),
            onClick: () => {
              setName('');
              setCreateOpen(true);
            },
          }}
        />
      ) : (
        <ul className="space-y-1.5">
          {playlists.map((playlist) => (
            <li
              key={playlist.id}
              className="flex items-center gap-3 rounded-2xl border border-line/60 bg-surface px-2.5 py-2"
            >
              <button
                type="button"
                onClick={() => navigate(`/playlists/${playlist.id}`)}
                className="tap flex min-w-0 flex-1 items-center gap-3 text-start"
              >
                <Artwork uri={playlist.items[0]?.uri} size={160} className="h-12 w-12" rounded="rounded-xl" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-ink">{playlist.name}</span>
                  <span className="block text-[11px] text-muted">
                    {playlist.items.length} {t('common.tracks')}
                  </span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-muted rtl:rotate-180" />
              </button>
              <IconButton label={t('a11y.more')} size="sm" onClick={() => setMenuPlaylist(playlist)}>
                <MoreVertical size={17} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={createOpen}
        title={t('playlists.create')}
        confirmLabel={t('common.save')}
        confirmDisabled={name.trim().length === 0}
        onClose={() => setCreateOpen(false)}
        onConfirm={() => {
          if (!name.trim()) return;
          createPlaylist(name);
          setCreateOpen(false);
          notify(t('playlists.create'));
        }}
      >
        <TextField
          value={name}
          onChange={setName}
          placeholder={t('playlists.namePlaceholder')}
          autoFocus
          onSubmit={() => {
            if (!name.trim()) return;
            createPlaylist(name);
            setCreateOpen(false);
          }}
        />
      </Dialog>

      <Sheet
        open={menuPlaylist !== null}
        onClose={() => setMenuPlaylist(null)}
        title={menuPlaylist?.name ?? t('playlists.title')}
      >
        <ul className="space-y-0.5 pb-2">
          <li>
            <button
              type="button"
              onClick={() => {
                setRenameValue(menuPlaylist?.name ?? '');
                setRenameOpen(true);
              }}
              className="tap flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start text-sm font-medium text-ink hover:bg-surface-2"
            >
              <Pencil size={16} className="text-muted" />
              {t('playlists.rename')}
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="tap flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start text-sm font-medium text-danger hover:bg-surface-2"
            >
              <Trash2 size={16} />
              {t('playlists.delete')}
            </button>
          </li>
        </ul>
      </Sheet>

      <Dialog
        open={renameOpen && menuPlaylist !== null}
        title={t('playlists.rename')}
        confirmLabel={t('common.save')}
        confirmDisabled={renameValue.trim().length === 0}
        onClose={() => setRenameOpen(false)}
        onConfirm={() => {
          if (menuPlaylist && renameValue.trim()) {
            renamePlaylist(menuPlaylist.id, renameValue);
            notify(t('common.save'));
          }
          setRenameOpen(false);
          setMenuPlaylist(null);
        }}
      >
        <TextField value={renameValue} onChange={setRenameValue} placeholder={t('playlists.name')} autoFocus />
      </Dialog>

      <Dialog
        open={deleteOpen && menuPlaylist !== null}
        title={t('playlists.delete')}
        message={t('playlists.deleteConfirm', { name: menuPlaylist?.name ?? '' })}
        confirmLabel={t('common.delete')}
        danger
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          if (menuPlaylist) deletePlaylist(menuPlaylist.id);
          setDeleteOpen(false);
          setMenuPlaylist(null);
        }}
      />
    </div>
  );
}
