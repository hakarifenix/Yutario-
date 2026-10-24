import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AudioLines, Info, Sliders } from 'lucide-react';
import { useAudioEffects } from '../state/audioEffects';
import { usePlayer } from '../state/player';
import { useT } from '../lib/i18n';
import { EmptyState, IconButton, Slider } from '../components/ui';

export function EqualizerScreen() {
  const t = useT();
  const navigate = useNavigate();
  const effects = useAudioEffects();
  const isPlaying = usePlayer((state) => state.isPlaying);
  const [localBands, setLocalBands] = useState<number[]>([]);
  const [localBass, setLocalBass] = useState(0);
  const [localSpatial, setLocalSpatial] = useState(0);

  useEffect(() => {
    if (!effects.hydrated) void effects.hydrate();
  }, [effects]);

  useEffect(() => {
    const timer = setInterval(() => {
      void useAudioEffects.getState().refresh();
    }, isPlaying ? 8000 : 15000);
    return () => clearInterval(timer);
  }, [isPlaying]);

  const state = effects.nativeState;

  useEffect(() => {
    if (!state) return;
    setLocalBands(state.bandLevels ?? []);
    setLocalBass(state.bassBoost ?? 0);
    setLocalSpatial(state.virtualizer ?? 0);
  }, [state]);

  const unsupported = effects.hydrated && !state?.supported && !effects.supported;

  return (
    <div className="page-enter px-4 pt-[calc(env(safe-area-inset-top,0px)+14px)]">
      <header className="mb-5 flex items-center gap-2">
        <IconButton label={t('a11y.back')} onClick={() => navigate(-1)}>
          <ArrowLeft size={20} className="rtl:rotate-180" />
        </IconButton>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[20px] font-bold tracking-tight text-ink">{t('equalizer.title')}</h1>
          <p className="text-[11px] text-muted">{t('settings.audio')}</p>
        </div>
      </header>

      {unsupported ? (
        <EmptyState
          icon={<Sliders size={22} />}
          title={t('equalizer.title')}
          body={t('equalizer.unsupported')}
        />
      ) : !state ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-line/60 bg-surface px-3.5 py-3">
            <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
              <AudioLines size={16} className="text-accent" />
              {t('equalizer.enabled')}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={effects.enabled}
              aria-label={t('equalizer.enabled')}
              onClick={() => void effects.apply({ enabled: !effects.enabled })}
              className={`tap flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${
                effects.enabled ? 'bg-accent' : 'bg-line'
              }`}
            >
              <span
                className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  effects.enabled ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {!isPlaying ? (
            <p className="flex items-start gap-2 rounded-xl border border-line/60 bg-surface/60 p-3 text-[11.5px] leading-relaxed text-muted">
              <Info size={14} className="mt-0.5 shrink-0" />
              {t('equalizer.notWhileIdle')}
            </p>
          ) : null}

          {state.presets.length > 0 ? (
            <section>
              <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                {t('equalizer.preset')}
              </h2>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => void effects.apply({ preset: -1, bands: localBands })}
                  className={`tap rounded-full px-3 py-1.5 text-[11.5px] font-semibold ${
                    effects.preset === -1 ? 'bg-accent text-white' : 'bg-surface-2 text-muted'
                  }`}
                >
                  {t('equalizer.custom')}
                </button>
                {state.presets.map((preset, index) => (
                  <button
                    key={preset + index}
                    type="button"
                    onClick={() => void effects.apply({ preset: index, bands: null })}
                    className={`tap rounded-full px-3 py-1.5 text-[11.5px] font-semibold ${
                      effects.preset === index && effects.bands === null
                        ? 'bg-accent text-white'
                        : 'bg-surface-2 text-muted'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {localBands.length > 0 ? (
            <section className="rounded-2xl border border-line/60 bg-surface p-3.5">
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                {t('equalizer.preset')}
              </h2>
              <div className="flex items-end justify-between gap-2">
                {localBands.map((level, index) => {
                  const frequency = state.bandFrequencies[index] ?? 0;
                  const range = Math.max(1, state.maxLevel - state.minLevel);
                  const percent = ((level - state.minLevel) / range) * 100;
                  return (
                    <div key={index} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                      <div className="relative h-28 w-1.5 rounded-full bg-surface-2">
                        <div
                          className="absolute inset-x-0 bottom-0 rounded-full bg-gradient-to-t from-accent to-accent-2"
                          style={{ height: `${Math.max(2, Math.min(100, percent))}%` }}
                        />
                      </div>
                      <input
                        type="range"
                        aria-label={`${frequency} Hz`}
                        min={state.minLevel}
                        max={state.maxLevel}
                        step={100}
                        value={level}
                        onChange={(event) => {
                          const next = localBands.slice();
                          next[index] = Number(event.target.value);
                          setLocalBands(next);
                        }}
                        onPointerUp={() => void effects.apply({ bands: localBands, preset: -1 })}
                        onKeyUp={() => void effects.apply({ bands: localBands, preset: -1 })}
                        className="h-5 w-full accent-[rgb(var(--c-accent))]"
                        style={{ writingMode: 'horizontal-tb' }}
                      />
                      <span className="text-[9px] text-muted">
                        {frequency >= 1000 ? `${Math.round(frequency / 1000)}k` : frequency}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] text-muted">
                {state.minLevel / 100} dB … {state.maxLevel / 100} dB
              </p>
            </section>
          ) : null}

          <section className="rounded-2xl border border-line/60 bg-surface p-3.5">
            <Row
              label={t('equalizer.bassBoost')}
              value={`${Math.round((localBass / Math.max(1, state.bassMax)) * 100)}%`}
            >
              <Slider
                label={t('equalizer.bassBoost')}
                value={localBass}
                max={state.bassMax || 1000}
                onChange={setLocalBass}
                onCommit={(value) => void effects.apply({ bass: value })}
              />
            </Row>
            <Row
              label={t('equalizer.virtualizer')}
              value={`${Math.round((localSpatial / Math.max(1, state.virtualizerMax)) * 100)}%`}
            >
              <Slider
                label={t('equalizer.virtualizer')}
                value={localSpatial}
                max={state.virtualizerMax || 1000}
                onChange={setLocalSpatial}
                onCommit={(value) => void effects.apply({ virtualizer: value })}
              />
            </Row>
          </section>

          {state.reason ? (
            <p className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-[11.5px] leading-relaxed text-muted">
              {state.reason}
            </p>
          ) : null}
          <p className="px-1 text-[10.5px] leading-relaxed text-muted">
            {t('equalizer.effectsUnavailable')} · {t('equalizer.session')} {state.sessionId ?? 0}
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <div className="mb-1 flex items-center justify-between text-[12px] font-medium text-ink">
        <span>{label}</span>
        <span className="tabular-nums text-muted">{value}</span>
      </div>
      {children}
    </div>
  );
}
