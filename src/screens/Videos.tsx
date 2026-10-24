import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Film, FolderPlus, Play, RefreshCw } from 'lucide-react';
import { useLibrary } from '../state/library';
import { useT } from '../lib/i18n';
import { Artwork } from '../components/Artwork';
import { EmptyState, IconButton, Spinner } from '../components/ui';
import { formatBytes, formatDate, formatTime } from '../lib/format';
import { isNativePlatform } from '../lib/native';
import { notify } from '../state/toast';

export function VideosScreen() {
  const t = useT();
  const navigate = useNavigate();
  const videos = useLibrary((state) => state.videos);
  const status = useLibrary((state) => state.status);
  const scan = useLibrary((state) => state.refresh);
  const importMedia = useLibrary((state) => state.importMedia);
  const permission = useLibrary((state) => state.permission);
  const requestPermission = useLibrary((state) => state.requestPermission);
  const [importing, setImporting] = useState(false);

  const sorted = useMemo(
    () => videos.slice().sort((a, b) => (b.dateAdded ?? 0) - (a.dateAdded ?? 0)),
    [videos],
  );

  const handleScan = () => {
    if (!isNativePlatform) return;
    if (permission && permission.state !== 'granted') {
      void requestPermission();
      return;
    }
    void scan();
    notify(t('library.scanning'));
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      await importMedia('video');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="page-enter px-4 pt-[calc(env(safe-area-inset-top,0px)+18px)]">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-ink">{t('videos.title')}</h1>
          <p className="text-[12px] text-muted">
            {sorted.length} {t('common.videos')}
          </p>
        </div>
        <div className="flex gap-1">
          <IconButton label={t('library.importFiles')} onClick={() => void handleImport()} disabled={importing}>
            {importing ? <Spinner size={18} /> : <FolderPlus size={18} />}
          </IconButton>
          {isNativePlatform ? (
            <IconButton label={t('library.rescan')} onClick={handleScan}>
              {status === 'scanning' ? <Spinner size={18} /> : <RefreshCw size={18} />}
            </IconButton>
          ) : null}
        </div>
      </header>

      {sorted.length === 0 ? (
        <EmptyState
          icon={<Film size={22} />}
          title={t('videos.title')}
          body={t('videos.empty')}
          action={{ label: t('library.importFiles'), onClick: () => void handleImport() }}
          secondaryAction={isNativePlatform ? { label: t('library.rescan'), onClick: handleScan } : undefined}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 pb-4">
          {sorted.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(`/video/${encodeURIComponent(item.id)}`)}
              className="tap group text-start"
            >
              <div className="relative overflow-hidden rounded-xl">
                <Artwork uri={item.uri} size={360} className="aspect-video w-full" rounded="rounded-xl" kind="video" />
                <span className="absolute bottom-1.5 end-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
                  {formatTime(item.durationMs)}
                </span>
                <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-active:opacity-100">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white">
                    <Play size={18} fill="currentColor" />
                  </span>
                </span>
              </div>
              <p className="mt-1.5 truncate text-[12.5px] font-semibold text-ink">{item.title}</p>
              <p className="truncate text-[10.5px] text-muted">
                {formatDate(item.dateAdded)} · {formatBytes(item.sizeBytes)}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
