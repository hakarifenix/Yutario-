import { Music2, Video } from 'lucide-react';
import { useArtwork } from '../lib/artwork';
import { useT } from '../lib/i18n';

const GRADIENTS = [
  'from-violet-500/40 to-sky-400/25',
  'from-indigo-500/40 to-fuchsia-400/25',
  'from-sky-500/35 to-emerald-400/25',
  'from-purple-500/40 to-rose-400/25',
  'from-blue-500/40 to-cyan-300/25',
];

function gradientFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
}

export function Artwork({
  uri,
  size = 300,
  className = '',
  rounded = 'rounded-xl',
  kind = 'audio',
  alt,
}: {
  uri?: string;
  size?: number;
  className?: string;
  rounded?: string;
  kind?: 'audio' | 'video';
  alt?: string;
}) {
  const t = useT();
  const { dataUrl } = useArtwork(uri, size);
  const seed = uri ?? 'yutario';
  const Icon = kind === 'video' ? Video : Music2;

  return (
    <div
      className={`relative shrink-0 overflow-hidden bg-gradient-to-br ${gradientFor(seed)} ${rounded} ${className}`}
    >
      {dataUrl ? (
        <img
          src={dataUrl}
          alt={alt ?? t('a11y.artwork')}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-ink/60">
          <Icon size={Math.max(14, Math.round(size / 6))} strokeWidth={1.6} aria-hidden="true" />
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/5" />
    </div>
  );
}
