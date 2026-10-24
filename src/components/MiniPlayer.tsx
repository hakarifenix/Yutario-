import { useNavigate } from 'react-router-dom';
import { Pause, Play, SkipForward } from 'lucide-react';
import { usePlayer } from '../state/player';
import { useT } from '../lib/i18n';
import { Artwork } from './Artwork';
import { IconButton } from './ui';

export function MiniPlayer() {
  const t = useT();
  const navigate = useNavigate();
  const queue = usePlayer((state) => state.queue);
  const index = usePlayer((state) => state.index);
  const isPlaying = usePlayer((state) => state.isPlaying);
  const positionMs = usePlayer((state) => state.positionMs);
  const durationMs = usePlayer((state) => state.durationMs);
  const buffering = usePlayer((state) => state.buffering);
  const togglePlay = usePlayer((state) => state.togglePlay);
  const next = usePlayer((state) => state.next);

  const item = queue[index];
  if (!item) return null;

  const progress = durationMs > 0 ? Math.min(100, (positionMs / durationMs) * 100) : 0;

  return (
    <div
      className="fixed inset-x-0 z-40 animate-fade-up px-2"
      style={{ bottom: 'calc(64px + env(safe-area-inset-bottom, 0px) + 8px)' }}
    >
      <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-line/70 bg-surface/95 shadow-lift backdrop-blur-md">
        <div className="flex items-center gap-2 p-2 pe-3">
          <button
            type="button"
            onClick={() => navigate('/player')}
            aria-label={t('a11y.openPlayer')}
            className="tap flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-0.5 text-start"
          >
            <Artwork uri={item.uri} size={120} className="h-11 w-11" rounded="rounded-lg" kind={item.kind} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-tight text-ink">{item.title}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted">
                {buffering ? t('common.loading') : item.artist || t('common.unknownArtist')}
              </p>
            </div>
          </button>
          <IconButton
            label={isPlaying ? t('common.pause') : t('common.play')}
            variant="surface"
            size="sm"
            onClick={() => void togglePlay()}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} className="ms-0.5" />}
          </IconButton>
          <IconButton label={t('common.next')} size="sm" onClick={() => void next()}>
            <SkipForward size={18} />
          </IconButton>
        </div>
        <div className="h-[2px] w-full bg-line/50">
          <div
            className="h-full bg-gradient-to-r from-accent to-accent-2 transition-[width] duration-500 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
