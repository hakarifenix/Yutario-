import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Captions,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Lock,
  Maximize2,
  Pause,
  Play,
  RotateCw,
  Unlock,
} from 'lucide-react';
import { useLibrary } from '../state/library';
import { useCollections } from '../state/collections';
import { useSettings } from '../state/settings';
import { useT } from '../lib/i18n';
import { isNativePlatform, YutarioNative } from '../lib/native';
import { formatTime } from '../lib/format';
import { IconButton, Sheet } from '../components/ui';
import { notify } from '../state/toast';
import type { VideoEngineState, VideoTracks } from '../lib/types';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const ASPECTS = [
  { value: 'fit' as const, labelKey: 'video.aspectFit' as const },
  { value: 'zoom' as const, labelKey: 'video.aspectZoom' as const },
  { value: 'fill' as const, labelKey: 'video.aspectFill' as const },
];

export function VideoPlayerScreen() {
  const t = useT();
  const navigate = useNavigate();
  const params = useParams();
  const id = params.id ? decodeURIComponent(params.id) : '';
  const videos = useLibrary((state) => state.videos);
  const music = useLibrary((state) => state.music);
  const nativeVideoMode = useSettings((state) => state.nativeVideoMode);
  const item = videos.find((entry) => entry.id === id) ?? music.find((entry) => entry.id === id);

  const [state, setState] = useState<VideoEngineState>({
    isPlaying: false,
    isBuffering: true,
    positionMs: 0,
    durationMs: 0,
    bufferedMs: 0,
    ended: false,
    error: null,
    ready: false,
  });
  const [chromeVisible, setChromeVisible] = useState(true);
  const [locked, setLocked] = useState(false);
  const [sheet, setSheet] = useState<'subtitles' | 'speed' | 'aspect' | null>(null);
  const [tracks, setTracks] = useState<VideoTracks>({ audio: [], text: [] });
  const [subtitleName, setSubtitleName] = useState<string | null>(null);
  const [subtitleSize, setSubtitleSize] = useState(0.06);
  const [aspect, setAspect] = useState<'fit' | 'zoom' | 'fill'>('fit');
  const [speed, setSpeed] = useState(1);
  const [landscape, setLandscape] = useState(false);
  const [dragPosition, setDragPosition] = useState<number | null>(null);

  const tapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const syncBounds = useCallback(() => {
    if (!isNativePlatform) return;
    YutarioNative.setVideoBounds({
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    }).catch(() => undefined);
  }, []);

  const startVideo = useCallback(
    async (fromPositionMs?: number) => {
      if (!item || !isNativePlatform) return;
      const saved =
        fromPositionMs ??
        (useSettings.getState().resumePlayback ? useCollections.getState().getProgress(item.id) : 0);
      const startPositionMs =
        saved > 5000 && (item.durationMs === 0 || saved < item.durationMs - 5000) ? saved : 0;
      setState((previous) => ({
        ...previous,
        error: null,
        errorDetail: null,
        isBuffering: true,
        ended: false,
        positionMs: startPositionMs,
      }));
      try {
        await YutarioNative.setKeepScreenOn({ on: true });
        const nativeState = await YutarioNative.showVideo({
          uri: item.uri,
          title: item.title,
          startPositionMs,
          speed: 1,
        });
        if (nativeState) setState(nativeState);
        await YutarioNative.setVideoResizeMode({ mode: 'fit' });
        if (nativeVideoMode) {
          await YutarioNative.setVideoOverlay({ aboveWebView: true, nativeControls: true });
        }
        syncBounds();
        await new Promise((resolve) => setTimeout(resolve, 700));
        const videoTracks = await YutarioNative.getVideoTracks();
        setTracks({ audio: videoTracks?.audio ?? [], text: videoTracks?.text ?? [] });
      } catch (error) {
        console.error('video start failed', error);
        setState((previous) => ({
          ...previous,
          error: 'START_FAILED',
          errorDetail: error instanceof Error ? error.message : String(error),
        }));
      }
    },
    [item, nativeVideoMode, syncBounds],
  );

  // Keeps the start function out of the effect dependencies so a library refresh cannot restart
  // (and therefore hide) a video that is already playing.
  const startRef = useRef(startVideo);
  startRef.current = startVideo;

  useEffect(() => {
    if (!item || !isNativePlatform) return;
    document.documentElement.dataset.videoActive = 'true';

    // Subscribed before playback starts: the engine can report an error before showVideo resolves,
    // and those early events used to be dropped.
    const listener = YutarioNative.addListener('videoState', (engineState) => setState(engineState));
    if (!startedRef.current) {
      startedRef.current = true;
      void startRef.current();
    }

    const onResize = () => syncBounds();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      void listener.then((handle) => handle.remove());
      if (stateRef.current.positionMs > 3000) {
        useCollections.getState().setProgress(item.id, stateRef.current.positionMs);
      }
      void YutarioNative.hideVideo().catch(() => undefined);
      void YutarioNative.setKeepScreenOn({ on: false }).catch(() => undefined);
      void YutarioNative.setOrientation({ orientation: 'unlocked' }).catch(() => undefined);
      delete document.documentElement.dataset.videoActive;
      startedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, nativeVideoMode, syncBounds]);

  const retryPlayback = () => {
    registerInteraction();
    void startRef.current(stateRef.current.positionMs);
  };

  useEffect(() => {
    if (!item || !isNativePlatform) return;
    const timer = setInterval(() => {
      const position = stateRef.current.positionMs;
      if (position > 3000) useCollections.getState().setProgress(item.id, position);
    }, 5000);
    return () => clearInterval(timer);
  }, [item]);

  useEffect(() => {
    if (!state.isPlaying) {
      setChromeVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      return;
    }
    if (locked) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setChromeVisible(false), 3500);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [state.isPlaying, chromeVisible, locked]);

  const registerInteraction = () => {
    setChromeVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (state.isPlaying && !locked) {
      hideTimer.current = setTimeout(() => setChromeVisible(false), 3500);
    }
  };

  const togglePlay = async () => {
    if (!isNativePlatform) return;
    registerInteraction();
    await YutarioNative.setVideoPaused({ paused: state.isPlaying });
  };

  const seekBy = async (deltaMs: number) => {
    if (!isNativePlatform) return;
    const target = Math.max(0, Math.min((state.durationMs || 0) - 1000, state.positionMs + deltaMs));
    await YutarioNative.seekVideo({ positionMs: target });
    registerInteraction();
  };

  const handleSurfaceTap = (event: React.PointerEvent<HTMLDivElement>) => {
    if (locked) return;
    const now = Date.now();
    const { time } = tapRef.current;
    if (now - time < 280) {
      const mid = window.innerWidth / 2;
      void seekBy(event.clientX < mid ? -10000 : 10000);
      tapRef.current = { time: 0, x: 0 };
      return;
    }
    tapRef.current = { time: now, x: event.clientX };
    setChromeVisible((previous) => !previous);
    registerInteraction();
  };

  const pickSubtitle = async () => {
    if (!isNativePlatform) return;
    try {
      const result = await YutarioNative.pickSubtitle();
      if (!result?.uri) return;
      await YutarioNative.setVideoSubtitle({ uri: result.uri, name: result.name });
      setSubtitleName(result.name);
      const videoTracks = await YutarioNative.getVideoTracks();
      setTracks({ audio: videoTracks?.audio ?? [], text: videoTracks?.text ?? [] });
      notify(t('video.subtitleLoaded'), 'success');
    } catch (error) {
      console.error('subtitle load failed', error);
      notify(t('video.subtitleError'), 'error');
    }
  };

  const selectTrack = async (index: number) => {
    if (!isNativePlatform) return;
    try {
      const videoTracks = await YutarioNative.selectVideoTrack({ type: 'text', index });
      setTracks({ audio: videoTracks?.audio ?? [], text: videoTracks?.text ?? [] });
    } catch (error) {
      console.error('track selection failed', error);
    }
  };

  const applyAspect = async (mode: 'fit' | 'zoom' | 'fill') => {
    setAspect(mode);
    setSheet(null);
    if (isNativePlatform) await YutarioNative.setVideoResizeMode({ mode });
  };

  const applySpeed = async (value: number) => {
    setSpeed(value);
    setSheet(null);
    if (isNativePlatform) await YutarioNative.setVideoSpeed({ speed: value });
  };

  const toggleOrientation = async () => {
    const next = !landscape;
    setLandscape(next);
    if (isNativePlatform) {
      await YutarioNative.setOrientation({ orientation: next ? 'landscape' : 'portrait' });
    }
    setTimeout(syncBounds, 320);
  };

  if (!item) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
        <p className="text-sm text-muted">{t('video.unsupported')}</p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="tap rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          {t('a11y.back')}
        </button>
      </div>
    );
  }

  if (!isNativePlatform) {
    return (
      <div className="fixed inset-0 flex flex-col bg-black">
        <div className="flex items-center gap-2 px-3 py-2 text-white">
          <IconButton label={t('a11y.back')} onClick={() => navigate(-1)} className="text-white">
            <ArrowLeft size={20} />
          </IconButton>
          <p className="truncate text-sm font-semibold">{item.title}</p>
        </div>
        <video
          src={item.uri}
          controls
          autoPlay
          playsInline
          className="min-h-0 flex-1 bg-black"
        />
      </div>
    );
  }

  const duration = state.durationMs || item.durationMs;
  const shownPosition = dragPosition ?? state.positionMs;
  const progress = duration > 0 ? Math.min(100, (shownPosition / duration) * 100) : 0;
  const showChrome = chromeVisible && !nativeVideoMode;

  return (
    <div className="fixed inset-0 z-30 select-none bg-transparent">
      <div className="absolute inset-0" onPointerUp={handleSurfaceTap} aria-hidden="true" />

      {!nativeVideoMode ? (
        <div className={`absolute inset-0 flex flex-col transition-opacity ${showChrome ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="bg-gradient-to-b from-black/80 to-transparent px-2 pb-8 pt-[calc(env(safe-area-inset-top,0px)+6px)]">
            <div className="flex items-center gap-2">
              <IconButton label={t('a11y.back')} onClick={() => navigate(-1)} className="text-white">
                <ArrowLeft size={20} />
              </IconButton>
              <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">{item.title}</p>
              <IconButton
                label={locked ? t('video.unlock') : t('video.lock')}
                onClick={() => setLocked(!locked)}
                className="text-white"
              >
                {locked ? <Unlock size={18} /> : <Lock size={18} />}
              </IconButton>
            </div>
          </div>

          {!locked ? (
            <div className="flex flex-1 items-center justify-center gap-8">
              <button
                type="button"
                onClick={() => void seekBy(-10000)}
                aria-label={`-10s`}
                className="tap flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur"
              >
                <ChevronLeft size={24} />
                <span className="absolute mt-8 text-[9px] font-bold">10</span>
              </button>
              <button
                type="button"
                onClick={() => void togglePlay()}
                aria-label={state.isPlaying ? t('common.pause') : t('common.play')}
                className="tap flex h-16 w-16 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
              >
                {state.isBuffering && !state.isPlaying ? (
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : state.isPlaying ? (
                  <Pause size={26} fill="currentColor" />
                ) : (
                  <Play size={26} fill="currentColor" className="ms-1" />
                )}
              </button>
              <button
                type="button"
                onClick={() => void seekBy(10000)}
                aria-label="+10s"
                className="tap flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur"
              >
                <ChevronRight size={24} />
                <span className="absolute mt-8 text-[9px] font-bold">10</span>
              </button>
            </div>
          ) : (
            <div className="flex-1" />
          )}

          <div className="bg-gradient-to-t from-black/85 to-transparent px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-10">
            {!locked ? (
              <>
                <div className="mb-1 flex items-center gap-2 text-[10.5px] tabular-nums text-white/80">
                  <span>{formatTime(shownPosition)}</span>
                  <div className="relative flex-1">
                    <input
                      type="range"
                      aria-label={t('a11y.seek')}
                      className="yr-range w-full"
                      min={0}
                      max={duration > 0 ? duration : 1}
                      step={500}
                      value={Math.min(shownPosition, duration > 0 ? duration : 1)}
                      style={{ ['--range-progress' as string]: `${progress}%` }}
                      onChange={(event) => setDragPosition(Number(event.target.value))}
                      onPointerUp={(event) => {
                        const value = Number((event.target as HTMLInputElement).value);
                        setDragPosition(null);
                        void YutarioNative.seekVideo({ positionMs: value });
                        registerInteraction();
                      }}
                    />
                  </div>
                  <span>{formatTime(duration)}</span>
                </div>
                <div className="flex items-center justify-between gap-1 pt-1">
                  <ControlChip
                    icon={<Gauge size={15} />}
                    label={`${speed}×`}
                    onClick={() => setSheet('speed')}
                    active={speed !== 1}
                  />
                  <ControlChip
                    icon={<Captions size={15} />}
                    label={subtitleName ? t('video.subtitleExternal') : t('video.subtitles')}
                    onClick={() => setSheet('subtitles')}
                    active={Boolean(subtitleName) || tracks.text.some((track) => track.selected)}
                  />
                  <ControlChip
                    icon={<Maximize2 size={15} />}
                    label={t(ASPECTS.find((entry) => entry.value === aspect)?.labelKey ?? 'video.aspectFit')}
                    onClick={() => setSheet('aspect')}
                    active={aspect !== 'fit'}
                  />
                  <ControlChip
                    icon={<RotateCw size={15} />}
                    label={t('video.orientation')}
                    onClick={() => void toggleOrientation()}
                  />
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {locked && showChrome ? (
        <button
          type="button"
          onClick={() => {
            setLocked(false);
            registerInteraction();
          }}
          className="tap absolute end-4 top-[calc(env(safe-area-inset-top,0px)+16px)] flex h-10 items-center gap-1.5 rounded-full bg-black/60 px-3 text-[11px] font-semibold text-white"
        >
          <Unlock size={14} />
          {t('video.unlock')}
        </button>
      ) : null}

      {state.error || (state.ended && !state.isPlaying) ? (
        <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-2xl border border-white/15 bg-black/80 p-4 text-center">
          <p className="text-[12.5px] leading-relaxed text-white/85">
            {state.error ? t('video.error') : t('player.error')}
          </p>
          {state.error && state.errorDetail ? (
            <p className="mt-2 max-h-24 overflow-y-auto break-words text-[10px] leading-relaxed text-white/55" dir="ltr">
              {state.errorDetail}
              {state.mimeType ? ` · ${state.mimeType}` : ''}
            </p>
          ) : null}
          <div className="mt-3 flex items-center justify-center gap-2">
            {state.error ? (
              <button
                type="button"
                onClick={retryPlayback}
                className="tap rounded-lg bg-accent px-3 py-1.5 text-[11px] font-semibold text-white"
              >
                {t('video.retry')}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="tap rounded-lg bg-white/15 px-3 py-1.5 text-[11px] font-semibold text-white"
            >
              {t('a11y.back')}
            </button>
          </div>
        </div>
      ) : null}

      <Sheet open={sheet === 'subtitles'} onClose={() => setSheet(null)} title={t('video.subtitles')}>
        <ul className="space-y-0.5 pb-2">
          <li>
            <button
              type="button"
              onClick={async () => {
                await selectTrack(-1);
                setSubtitleName(null);
                setSheet(null);
              }}
              className="tap w-full rounded-xl px-3 py-3 text-start text-sm text-ink hover:bg-surface-2"
            >
              {t('video.subtitleOff')}
            </button>
          </li>
          {tracks.text.map((track) => (
            <li key={`${track.index}-${track.id}`}>
              <button
                type="button"
                onClick={async () => {
                  await selectTrack(track.index);
                  setSheet(null);
                }}
                className={`tap flex w-full items-center justify-between rounded-xl px-3 py-3 text-start text-sm ${
                  track.selected ? 'bg-accent/15 font-semibold text-accent' : 'text-ink'
                }`}
              >
                <span className="truncate">{track.label}</span>
                <span className="text-[10px] uppercase text-muted">{track.language}</span>
              </button>
            </li>
          ))}
          {tracks.text.length === 0 && !subtitleName ? (
            <li className="px-3 py-2 text-[12px] text-muted">{t('video.noSubtitles')}</li>
          ) : null}
          <li className="pt-2">
            <button
              type="button"
              onClick={() => void pickSubtitle()}
              className="tap w-full rounded-xl border border-dashed border-line px-3 py-3 text-start text-sm font-semibold text-accent"
            >
              {t('video.loadSubtitle')}
            </button>
          </li>
        </ul>
        <div className="px-1 pb-2">
          <div className="mb-1 flex items-center justify-between text-[12px] font-medium text-ink">
            <span>{t('video.subtitleSize')}</span>
            <span className="tabular-nums text-muted">{Math.round(subtitleSize * 1000)}</span>
          </div>
          <input
            type="range"
            min={30}
            max={140}
            value={Math.round(subtitleSize * 1000)}
            onChange={(event) => {
              const fraction = Number(event.target.value) / 1000;
              setSubtitleSize(fraction);
            }}
            onPointerUp={async () => {
              await YutarioNative.setSubtitleSize({ fraction: subtitleSize });
            }}
            className="yr-range w-full"
            aria-label={t('video.subtitleSize')}
          />
          <p className="mt-1 text-[10.5px] text-muted">{t('video.subtitleOffsetUnsupported')}</p>
        </div>
      </Sheet>

      <Sheet open={sheet === 'speed'} onClose={() => setSheet(null)} title={t('player.speed')}>
        <ul className="space-y-0.5 pb-2">
          {SPEEDS.map((option) => (
            <li key={option}>
              <button
                type="button"
                onClick={() => void applySpeed(option)}
                className={`tap w-full rounded-xl px-3 py-3 text-start text-sm ${
                  speed === option ? 'bg-accent/15 font-semibold text-accent' : 'text-ink'
                }`}
              >
                {option}×
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet open={sheet === 'aspect'} onClose={() => setSheet(null)} title={t('video.aspectFit')}>
        <ul className="space-y-0.5 pb-2">
          {ASPECTS.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                onClick={() => void applyAspect(option.value)}
                className={`tap w-full rounded-xl px-3 py-3 text-start text-sm ${
                  aspect === option.value ? 'bg-accent/15 font-semibold text-accent' : 'text-ink'
                }`}
              >
                {t(option.labelKey)}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      {state.isBuffering && !state.error ? (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <span className="block h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        </div>
      ) : null}
    </div>
  );
}

function ControlChip({
  icon,
  label,
  onClick,
  active,
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
      className={`tap flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10.5px] font-semibold ${
        active ? 'bg-white/20 text-white' : 'text-white/75'
      }`}
    >
      {icon}
      <span className="max-w-[72px] truncate">{label}</span>
    </button>
  );
}
