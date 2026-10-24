import { MoreVertical } from 'lucide-react';
import type { MediaItem } from '../lib/types';
import { formatTime } from '../lib/format';
import { useT } from '../lib/i18n';
import { Artwork } from './Artwork';
import { IconButton } from './ui';

export function TrackRow({
  item,
  active = false,
  playing = false,
  onPress,
  onMore,
  secondary,
  trailingAccessory,
}: {
  item: MediaItem;
  active?: boolean;
  playing?: boolean;
  onPress: () => void;
  onMore?: () => void;
  secondary?: string;
  trailingAccessory?: React.ReactNode;
}) {
  const t = useT();
  const subtitle =
    secondary ??
    [item.artist || t('common.unknownArtist'), item.album].filter(Boolean).join(' · ');

  return (
    <div
      className={`group flex h-full items-center gap-3 rounded-xl px-1.5 ${
        active ? 'bg-accent/10' : 'hover:bg-surface-2/70'
      }`}
    >
      <button
        type="button"
        onClick={onPress}
        className="tap flex min-w-0 flex-1 items-center gap-3 py-1.5 text-start"
        aria-current={active ? 'true' : undefined}
      >
        <Artwork uri={item.uri} size={120} className="h-11 w-11" rounded="rounded-lg" kind={item.kind} />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[14px] font-medium ${active ? 'text-accent' : 'text-ink'}`}>
            {item.title}
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-muted">{subtitle}</span>
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted">
          {active && playing ? (
            <span className="eq" aria-label={t('common.play')} role="img">
              <span />
              <span />
              <span />
            </span>
          ) : (
            formatTime(item.durationMs)
          )}
        </span>
      </button>
      {trailingAccessory}
      {onMore ? (
        <IconButton label={t('a11y.more')} size="sm" onClick={onMore} className="opacity-70">
          <MoreVertical size={17} />
        </IconButton>
      ) : null}
    </div>
  );
}
