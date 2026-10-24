import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  Gauge,
  Heart,
  ListMusic,
  MoreVertical,
  Pause,
  Play,
  ListX,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Timer,
  Sliders,
} from 'lucide-react';
import { usePlayer } from '../state/player';
import { useCollections } from '../state/collections';
import { useT } from '../lib/i18n';
import { Artwork } from '../components/Artwork';
import { IconButton, Sheet, Slider, EmptyState } from '../components/ui';
import { TrackMenu } from '../components/TrackMenu';
import { formatTime } from '../lib/format';
import { notify } from '../state/toast';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const TIMERS = [15, 30, 45, 60, 90];

export function FullPlayerScreen() {
  const t = useT();
  const navigate = useNavigate();
  const queue = usePlayer((state) => state.queue);
  const index = usePlayer((state) => state.index);
  const isPlaying = usePlayer((state) => state.isPlaying);
  const positionMs = usePlayer((state) => state.positionMs);
  const durationMs = usePlayer((state) => state.durationMs);
  const buffering = usePlayer((state) => state.buffering);
  const repeat = usePlayer((state) => state.repeat);
  const shuffle = usePlayer((state) => state.shuffle);
  const speed = usePlayer((state) => state.speed);
  const error = usePlayer((state) => state.error);
  const errorDetail = usePlayer((state) => state.errorDetail);
  const sleepTimer = usePlayer((state) => state.sleepTimer);
  const togglePlay = usePlayer((state) => state.togglePlay);
  const next = usePlayer((state) => state.next);
  const previous = usePlayer((state) => state.previous);
  const seek = usePlayer((state) => state.seek);
  const cycleRepeat = usePlayer((state) => state.cycleRepeat);
  const toggleShuffle = usePlayer((state) => state.toggleShuffle);
  const setSpeed = usePlayer((state) => state.setSpeed);
  const setSleepTimer = usePlayer((state) => state.setSleepTimer);
  const removeFromQueue = usePlayer((state) => state.removeFromQueue);
  const playNow = usePlayer((state) => state.playNow);
  const favorites = useCollections((state) => state.favorites);
  const toggleFavorite = useCollections((state) => state.toggleFavorite);

  const [sheet, setSheet] = useState<'queue' | 'speed' | 'timer' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragPosition, setDragPosition] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  const item = queue[index];
  const favorite = item ? favorites.some((entry) => entry.item.id === item.id) : false;

  useEffect(() => {
    if (!sleepTimer.endsAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [sleepTimer.endsAt]);

  useEffect(() => {
    if (!error) return;
    notify(t('player.error'), 'error');
  }, [error, t]);

  if (!item) {
    return (
      <div className="flex min-h-screen flex-col px-4 pt-[calc(env(safe-area-inset-top,0px)+14px)]">
        <IconButton label={t('a11y.back')} onClick={() => navigate(-1)}>
          <ChevronDown size={22} />
        </IconButton>
        <div className="mt-8">
          <EmptyState
            icon={<ListMusic size={22} />}
            title={t('player.empty')}
            action={{ label: t('nav.music'), onClick: () => navigate('/music') }}
          />
        </div>
      </div>
    );
  }

  const effectivePosition = dragPosition ?? positionMs;
  const progressMax = durationMs > 0 ? durationMs : item.durationMs || 1;
  const timerRemaining = sleepTimer.endsAt ? Math.max(0, sleepTimer.endsAt - now) : 0;

  return (
    <div className="page-enter relative flex min-h-screen flex-col overflow-hidden bg-bg">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 animate-glow-pulse rounded-full bg-accent/20 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-32 right-0 h-[360px] w-[360px] animate-glow-pulse rounded-full bg-accent-2/15 blur-[110px]" />

      <div className="relative flex flex-1 flex-col px-5 pb-[calc(env(safe-area-inset-bottom,0px)+18px)] pt-[calc(env(safe-area-inset-top,0px)+12px)]">
        <header className="mb-4 flex items-center justify-between gap-2">
          <IconButton label={t('a11y.back')} onClick={() => navigate(-1)}>
            <ChevronDown size={22} />
          </IconButton>
          <div className="min-w-0 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
              {t('player.nowPlaying')}
            </p>
            <p className="truncate text-[12px] font-medium text-ink/80">
              {item.album || t('common.unknownAlbum')}
            </p>
          </div>
          <IconButton label={t('a11y.more')} onClick={() => setMenuOpen(true)}>
            <MoreVertical size={20} />
          </IconButton>
        </header>

        <div className="mx-auto mb-6 w-full max-w-[340px] animate-float">
          <Artwork
            uri={item.uri}
            size={640}
            className="aspect-square w-full shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)]"
            rounded="rounded-[28px]"
            kind={item.kind}
          />
        </div>

        <div className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-balance text-[22px] font-bold leading-tight tracking-tight text-ink">
              {item.title}
            </h1>
            <p className="mt-1 truncate text-[13px] text-muted">
              {item.artist || t('common.unknownArtist')}
            </p>
          </div>
          <button
            type="button"
            aria-label={favorite ? t('player.removeFromFavorites') : t('player.addToFavorites')}
            aria-pressed={favorite}
            onClick={() => {
              const added = toggleFavorite(item);
              notify(added ? t('player.favorited') : t('player.removeFromFavorites'));
            }}
            className="tap mt-1 shrink-0 text-accent"
          >
            <Heart key={String(favorite)} size={22} fill={favorite ? 'currentColor' : 'none'} className="animate-scale-in" />
          </button>
        </div>

        {error ? (
          <div className="mb-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-[11.5px] leading-relaxed text-ink">
            <p className="m-0">{t('player.error')}</p>
            {errorDetail ? (
              <p className="m-0 mt-1 break-words text-[10.5px] text-muted" dir="ltr">
                {errorDetail}
              </p>
            ) : null}
            {error === 'PLAYER_ERROR' || error === 'START_FAILED' ? (
              <button
                type="button"
                onClick={() => void next()}
                className="tap mt-2 rounded-lg bg-accent px-3 py-1.5 text-[11px] font-semibold text-white"
              >
                {t('common.next')}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mb-1">
          <Slider
            label={t('a11y.seek')}
            value={effectivePosition}
            max={progressMax}
            onChange={setDragPosition}
            onCommit={(value) => {
              setDragPosition(null);
              void seek(value);
            }}
          />
          <div className="flex justify-between text-[10.5px] tabular-nums text-muted">
            <span>{formatTime(effectivePosition)}</span>
            <span>{formatTime(progressMax)}</span>
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between">
          <IconButton
            label={t('player.shuffle')}
            aria-pressed={shuffle}
            onClick={() => void toggleShuffle()}
            className={shuffle ? 'text-accent' : 'text-muted'}
          >
            <Shuffle size={18} />
          </IconButton>
          <IconButton label={t('common.previous')} onClick={() => void previous()}>
            <SkipBack size={26} fill="currentColor" />
          </IconButton>
          <button
            type="button"
            onClick={() => void togglePlay()}
            aria-label={isPlaying ? t('common.pause') : t('common.play')}
            className="tap flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-white shadow-glow active:scale-95"
          >
            {buffering && !isPlaying ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : isPlaying ? (
              <Pause size={26} fill="currentColor" />
            ) : (
              <Play size={26} fill="currentColor" className="ms-1" />
            )}
          </button>
          <IconButton label={t('common.next')} onClick={() => void next()}>
            <SkipForward size={26} fill="currentColor" />
          </IconButton>
          <IconButton
            label={
              repeat === 'one'
                ? t('player.repeatOne')
                : repeat === 'all'
                  ? t('player.repeatAll')
                  : t('player.repeatOff')
            }
            onClick={() => void cycleRepeat()}
            className={repeat === 'off' ? 'text-muted' : 'text-accent'}
          >
            {repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
          </IconButton>
        </div>

        <div className="mt-auto grid grid-cols-4 gap-2 pt-2">
          <PillButton
            icon={<Gauge size={16} />}
            label={`${speed}×`}
            onClick={() => setSheet('speed')}
            active={speed !== 1}
          />
          <PillButton
            icon={<Timer size={16} />}
            label={sleepTimer.endsAt ? formatTime(timerRemaining) : t('player.sleepTimer')}
            onClick={() => setSheet('timer')}
            active={Boolean(sleepTimer.endsAt)}
          />
          <PillButton
            icon={<ListMusic size={16} />}
            label={String(queue.length)}
            onClick={() => setSheet('queue')}
          />
          <PillButton icon={<Sliders size={16} />} label={t('player.equalizer')} onClick={() => navigate('/settings/equalizer')} />
        </div>
      </div>

      <Sheet open={sheet === 'queue'} onClose={() => setSheet(null)} title={t('player.queue')}>
        <div className="-mx-1 max-h-[52vh] overflow-y-auto">
          {queue.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted">{t('player.queueEmpty')}</p>
          ) : (
            <ul className="space-y-0.5">
              {queue.map((queueItem, queueIndex) => {
                const active = queueIndex === index;
                return (
                  <li key={`${queueItem.id}-${queueIndex}`} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void playNow(queue, queueIndex);
                        setSheet(null);
                      }}
                      className={`tap flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 text-start ${
                        active ? 'bg-accent/10' : 'hover:bg-surface-2'
                      }`}
                    >
                      <Artwork uri={queueItem.uri} size={120} className="h-9 w-9" rounded="rounded-md" />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[13px] ${active ? 'font-semibold text-accent' : 'text-ink'}`}>
                          {queueItem.title}
                        </span>
                        <span className="block truncate text-[11px] text-muted">
                          {queueItem.artist || t('common.unknownArtist')}
                        </span>
                      </span>
                      <span className="text-[10px] tabular-nums text-muted">{formatTime(queueItem.durationMs)}</span>
                    </button>
                    <IconButton
                      label={t('player.removeFromQueue')}
                      size="sm"
                      onClick={() => void removeFromQueue(queueIndex)}
                    >
                      <ListX size={15} />
                    </IconButton>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Sheet>

      <Sheet open={sheet === 'speed'} onClose={() => setSheet(null)} title={t('player.speed')}>
        <ul className="space-y-0.5 pb-2">
          {SPEEDS.map((option) => (
            <li key={option}>
              <button
                type="button"
                onClick={() => {
                  void setSpeed(option);
                  setSheet(null);
                }}
                className={`tap flex w-full items-center justify-between rounded-xl px-3 py-3 text-sm ${
                  speed === option ? 'bg-accent/15 font-semibold text-accent' : 'text-ink'
                }`}
              >
                {option}×
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet open={sheet === 'timer'} onClose={() => setSheet(null)} title={t('player.sleepTimer')}>
        <ul className="space-y-0.5 pb-2">
          <li>
            <button
              type="button"
              onClick={() => {
                void setSleepTimer(null);
                notify(t('player.sleepTimerOff'));
                setSheet(null);
              }}
              className={`tap flex w-full items-center justify-between rounded-xl px-3 py-3 text-sm ${
                !sleepTimer.endsAt ? 'bg-accent/15 font-semibold text-accent' : 'text-ink'
              }`}
            >
              {t('player.sleepTimerOff')}
            </button>
          </li>
          {TIMERS.map((minutes) => (
            <li key={minutes}>
              <button
                type="button"
                onClick={() => {
                  void setSleepTimer(minutes);
                  notify(t('player.timerSet'));
                  setSheet(null);
                }}
                className="tap flex w-full items-center justify-between rounded-xl px-3 py-3 text-sm text-ink hover:bg-surface-2"
              >
                {minutes} {t('common.minutes')}
              </button>
            </li>
          ))}
          <li className="pt-1">
            <button
              type="button"
              onClick={() => {
                void setSleepTimer(null, true);
                notify(t('player.stopAfterTrack'));
                setSheet(null);
              }}
              className={`tap w-full rounded-xl px-3 py-3 text-start text-sm ${
                sleepTimer.stopAfterTrack ? 'text-accent' : 'text-ink'
              } hover:bg-surface-2`}
            >
              {t('player.stopAfterTrack')}
            </button>
          </li>
        </ul>
        {sleepTimer.endsAt ? (
          <p className="px-1 pb-2 text-[11px] text-muted">
            {t('player.timerEnds', { time: formatTime(timerRemaining) })}
          </p>
        ) : null}
      </Sheet>

      <TrackMenu open={menuOpen} item={item} onClose={() => setMenuOpen(false)} context="library" />
    </div>
  );
}

function PillButton({
  icon,
  label,
  onClick,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tap flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[10px] font-semibold ${
        active ? 'border-accent/40 bg-accent/10 text-accent' : 'border-line/60 bg-surface/60 text-muted'
      }`}
    >
      {icon}
      <span className="max-w-full truncate px-0.5">{label}</span>
    </button>
  );
}
