import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  Clock3,
  FolderPlus,
  Heart,
  Music2,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Video,
} from 'lucide-react';
import { useLibrary } from '../state/library';
import { useCollections } from '../state/collections';
import { usePlayer } from '../state/player';
import { useT } from '../lib/i18n';
import { Artwork } from '../components/Artwork';
import { IconButton, SectionHeader, Spinner, EmptyState } from '../components/ui';
import { formatTime } from '../lib/format';
import { isNativePlatform } from '../lib/native';
import { notify } from '../state/toast';
import type { MediaItem } from '../lib/types';

function greetingKey(): 'home.morning' | 'home.afternoon' | 'home.evening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'home.morning';
  if (hour < 18) return 'home.afternoon';
  return 'home.evening';
}

export function HomeScreen() {
  const t = useT();
  const navigate = useNavigate();
  const music = useLibrary((state) => state.music);
  const videos = useLibrary((state) => state.videos);
  const permission = useLibrary((state) => state.permission);
  const status = useLibrary((state) => state.status);
  const scan = useLibrary((state) => state.refresh);
  const requestPermission = useLibrary((state) => state.requestPermission);
  const requestNotifications = useLibrary((state) => state.requestNotifications);
  const importMedia = useLibrary((state) => state.importMedia);
  const history = useCollections((state) => state.history);
  const favorites = useCollections((state) => state.favorites);
  const progress = useCollections((state) => state.progress);
  const playNow = usePlayer((state) => state.playNow);
  const shuffle = usePlayer((state) => state.shuffle);
  const toggleShuffle = usePlayer((state) => state.toggleShuffle);
  const [importing, setImporting] = useState(false);

  const recent = useMemo(() => music.slice(0, 10), [music]);
  const continueItems = useMemo(() => history.slice(0, 4).map((entry) => entry.item), [history]);
  const favoriteItems = useMemo(() => favorites.slice(0, 4).map((entry) => entry.item), [favorites]);
  const permissionMissing = isNativePlatform && permission && permission.state !== 'granted';
  const notificationsMissing = isNativePlatform && permission && !permission.notifications;

  const handleImport = async () => {
    setImporting(true);
    try {
      const imported = await importMedia('any');
      if (imported.length) notify(`${imported.length} +`);
    } finally {
      setImporting(false);
    }
  };

  const playAll = async (items: MediaItem[], index = 0) => {
    if (items.length === 0) return;
    await playNow(items, index);
    if (isNativePlatform && permission && !permission.notifications) void requestNotifications();
  };

  const playShuffle = async () => {
    await playAll(music);
    if (!shuffle) await toggleShuffle();
  };

  return (
    <div className="stagger-in px-4 pt-[calc(env(safe-area-inset-top,0px)+18px)]">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">{t('app.name')}</p>
          <h1 className="mt-1 text-[26px] font-bold leading-tight tracking-tight text-ink">{t(greetingKey())}</h1>
          <p className="mt-1 text-[13px] text-muted">
            {t('home.stats', { tracks: music.length, videos: videos.length })}
          </p>
        </div>
        <div className="flex gap-1">
          <IconButton label={t('common.search')} onClick={() => navigate('/music')}>
            <Search size={19} />
          </IconButton>
          <IconButton label={t('settings.title')} onClick={() => navigate('/settings')}>
            <Settings2 size={19} />
          </IconButton>
        </div>
      </header>

      {permissionMissing ? (
        <section className="mb-5 rounded-2xl border border-accent/30 bg-accent/10 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/20 text-accent">
              <Sparkles size={17} />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-ink">{t('library.permissionTitle')}</h2>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">{t('library.permissionBody')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void requestPermission()}
                  className="tap rounded-xl bg-accent px-3.5 py-2 text-[13px] font-semibold text-white"
                >
                  {t('library.grant')}
                </button>
                <button
                  type="button"
                  onClick={() => void importMedia('audio')}
                  className="tap rounded-xl border border-line px-3.5 py-2 text-[13px] font-semibold text-ink"
                >
                  {t('library.importFiles')}
                </button>
              </div>
              {permission?.state === 'denied' ? (
                <p className="mt-2 text-[11px] leading-relaxed text-muted">{t('library.denied')}</p>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {notificationsMissing ? (
        <button
          type="button"
          onClick={() => void requestNotifications()}
          className="tap mb-5 flex w-full items-center justify-between gap-3 rounded-2xl border border-line/70 bg-surface px-4 py-3 text-start"
        >
          <span className="text-[12px] leading-relaxed text-muted">{t('library.notifications')}</span>
          <ChevronRight size={16} className="shrink-0 text-accent" />
        </button>
      ) : null}

      <div className="mb-6 grid grid-cols-3 gap-2">
        <QuickAction
          icon={<RefreshCw size={18} className={status === 'scanning' ? 'animate-spin' : ''} />}
          label={t('home.quickScan')}
          onClick={() => void scan()}
          disabled={status === 'scanning' || !isNativePlatform}
        />
        <QuickAction
          icon={importing ? <Spinner size={18} /> : <FolderPlus size={18} />}
          label={t('library.importFiles')}
          onClick={() => void handleImport()}
          disabled={importing}
        />
        <QuickAction
          icon={<Sparkles size={18} />}
          label={t('music.shuffleAll')}
          onClick={() => void playShuffle()}
          disabled={music.length === 0}
        />
      </div>

      {!isNativePlatform ? (
        <p className="mb-5 rounded-xl border border-line/60 bg-surface/60 px-3 py-2.5 text-[11px] leading-relaxed text-muted">
          {t('library.webNotice')}
        </p>
      ) : null}

      {continueItems.length > 0 ? (
        <section className="mb-7">
          <SectionHeader
            title={t('home.continue')}
            action={{ label: t('common.all'), onClick: () => navigate('/music') }}
          />
          <div className="space-y-1">
            {continueItems.map((item) => {
              const saved = progress[item.id] ?? 0;
              const percent = item.durationMs > 0 ? Math.min(100, (saved / item.durationMs) * 100) : 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void playAll(continueItems, continueItems.indexOf(item))}
                  className="tap flex w-full items-center gap-3 rounded-xl p-1.5 text-start hover:bg-surface-2/70"
                >
                  <Artwork uri={item.uri} size={120} className="h-11 w-11" rounded="rounded-lg" kind={item.kind} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-ink">{item.title}</span>
                    <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
                      <Clock3 size={11} />
                      {formatTime(saved)} / {formatTime(item.durationMs)}
                    </span>
                    <span className="mt-1 block h-[2px] w-full overflow-hidden rounded-full bg-line/60">
                      <span className="block h-full bg-accent" style={{ width: `${percent}%` }} />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {recent.length > 0 ? (
        <section className="mb-7">
          <SectionHeader
            title={t('home.recent')}
            action={{ label: t('home.openLibrary'), onClick: () => navigate('/music') }}
          />
          <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {recent.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void playAll(recent, index)}
                className="tap w-[112px] shrink-0 text-start"
              >
                <Artwork uri={item.uri} size={280} className="aspect-square w-full" rounded="rounded-xl" />
                <p className="mt-2 truncate text-[12px] font-semibold text-ink">{item.title}</p>
                <p className="truncate text-[11px] text-muted">{item.artist || t('common.unknownArtist')}</p>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {favoriteItems.length > 0 ? (
        <section className="mb-7">
          <SectionHeader
            title={t('home.favorites')}
            action={{ label: t('common.all'), onClick: () => navigate('/music?tab=favorites') }}
          />
          <div className="space-y-1">
            {favoriteItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void playAll(favoriteItems, favoriteItems.indexOf(item))}
                className="tap flex w-full items-center gap-3 rounded-xl p-1.5 text-start hover:bg-surface-2/70"
              >
                <Artwork uri={item.uri} size={120} className="h-11 w-11" rounded="rounded-lg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-ink">{item.title}</span>
                  <span className="block truncate text-[11px] text-muted">
                    {item.artist || t('common.unknownArtist')}
                  </span>
                </span>
                <Heart size={15} className="shrink-0 text-accent" fill="currentColor" />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {music.length === 0 && videos.length === 0 ? (
        <div className="mt-2">
          <EmptyState
            icon={<Music2 size={22} />}
            title={t('library.emptyTitle')}
            body={t('library.emptyBody')}
            action={{ label: t('library.importFiles'), onClick: () => void handleImport() }}
            secondaryAction={
              isNativePlatform ? { label: t('library.rescan'), onClick: () => void scan() } : undefined
            }
          />
        </div>
      ) : null}

      {videos.length > 0 ? (
        <button
          type="button"
          onClick={() => navigate('/videos')}
          className="tap flex w-full items-center justify-between gap-3 rounded-2xl border border-line/70 bg-surface px-4 py-3.5 text-start"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <Video size={17} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">{t('videos.title')}</span>
              <span className="block text-[11px] text-muted">
                {videos.length} {t('common.videos')}
              </span>
            </span>
          </span>
          <ChevronRight size={17} className="text-muted" />
        </button>
      ) : null}
    </div>
  );
}

function QuickAction({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="tap flex flex-col items-center gap-2 rounded-2xl border border-line/70 bg-surface py-3 text-[11px] font-semibold text-ink disabled:opacity-50"
    >
      <span className="text-accent">{icon}</span>
      <span className="max-w-full truncate px-1">{label}</span>
    </button>
  );
}
