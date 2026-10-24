import { create } from 'zustand';
import { isNativePlatform, YutarioNative } from '../lib/native';
import type { EqualizerState } from '../lib/types';
import { readJson, writeJson } from '../lib/storage';

const STORAGE_KEY = 'yutario.effects.v1';

interface EffectsSettings {
  enabled: boolean;
  preset: number;
  bands: number[] | null;
  bass: number;
  virtualizer: number;
}

const DEFAULTS: EffectsSettings = {
  enabled: false,
  preset: -1,
  bands: null,
  bass: 0,
  virtualizer: 0,
};

interface EffectsStore extends EffectsSettings {
  hydrated: boolean;
  supported: boolean;
  nativeState: EqualizerState | null;
  error: string | null;
  hydrate: () => Promise<void>;
  refresh: () => Promise<EqualizerState | null>;
  apply: (patch: Partial<EffectsSettings>) => Promise<void>;
}

async function pushToNative(settings: EffectsSettings): Promise<EqualizerState | null> {
  if (!isNativePlatform) return null;
  try {
    return await YutarioNative.setEqualizer({
      enabled: settings.enabled,
      preset: settings.bands ? undefined : settings.preset,
      bandLevels: settings.bands ?? undefined,
      bassBoost: settings.bass,
      virtualizer: settings.virtualizer,
    });
  } catch (error) {
    console.error('equalizer apply failed', error);
    return null;
  }
}

export const useAudioEffects = create<EffectsStore>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,
  supported: false,
  nativeState: null,
  error: null,

  hydrate: async () => {
    // Storage only. Touching the native audio effects is the panel's job: building an Equalizer
    // when the app or a track starts is what crashed playback on devices with a broken audio
    // effect chain, so the playback path never asks for them.
    const stored = await readJson<Partial<EffectsSettings>>(STORAGE_KEY, {});
    const settings: EffectsSettings = { ...DEFAULTS, ...stored };
    set({ ...settings, hydrated: true });
  },

  refresh: async () => {
    if (!isNativePlatform) {
      set({ supported: false, nativeState: null });
      return null;
    }
    try {
      const state = await YutarioNative.getEqualizer();
      set({ nativeState: state, supported: state.supported, error: state.reason ?? null });
      return state;
    } catch (error) {
      set({ supported: false, error: error instanceof Error ? error.message : 'effects unavailable' });
      return null;
    }
  },

  apply: async (patch) => {
    const next: EffectsSettings = {
      enabled: patch.enabled ?? get().enabled,
      preset: patch.preset ?? get().preset,
      bands: patch.bands !== undefined ? patch.bands : get().bands,
      bass: patch.bass ?? get().bass,
      virtualizer: patch.virtualizer ?? get().virtualizer,
    };
    set(next);
    await writeJson(STORAGE_KEY, next);
    const state = await pushToNative(next);
    if (state) set({ nativeState: state });
  },
}));
