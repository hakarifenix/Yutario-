import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EqualizerState } from '../lib/types';

const native = vi.hoisted(() => ({
  setEqualizer: vi.fn(),
  getEqualizer: vi.fn(),
}));

vi.mock('../lib/native', () => ({
  isNativePlatform: true,
  YutarioNative: native,
}));

const EMPTY_STATE: EqualizerState = {
  supported: true,
  enabled: false,
  preset: -1,
  presets: [],
  bandLevels: [],
  bandFrequencies: [],
  minLevel: -1500,
  maxLevel: 1500,
  bassBoost: 0,
  bassMax: 1000,
  virtualizer: 0,
  virtualizerMax: 1000,
};

async function loadStore() {
  const module = await import('./audioEffects');
  return module.useAudioEffects;
}

describe('audio effects store', () => {
  beforeEach(() => {
    native.setEqualizer.mockReset().mockResolvedValue({ ...EMPTY_STATE });
    native.getEqualizer.mockReset().mockResolvedValue({ ...EMPTY_STATE });
    localStorage.clear();
  });

  it('never builds native effects while hydrating at startup', async () => {
    // Creating an Equalizer/Virtualizer while ExoPlayer is setting up its audio session killed the
    // process on some devices, so hydration may only read stored settings.
    const store = await loadStore();
    await store.getState().hydrate();

    expect(store.getState().hydrated).toBe(true);
    expect(native.setEqualizer).not.toHaveBeenCalled();
    expect(native.getEqualizer).not.toHaveBeenCalled();
  });

  it('pushes settings to native only when the panel applies them', async () => {
    const store = await loadStore();
    await store.getState().hydrate();
    await store.getState().apply({ enabled: true, preset: 2 });

    expect(native.setEqualizer).toHaveBeenCalledTimes(1);
    expect(native.setEqualizer).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, preset: 2 }),
    );
    expect(store.getState().nativeState?.supported).toBe(true);
  });
});
