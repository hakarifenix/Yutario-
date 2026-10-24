import { create } from 'zustand';
import type { Language } from '../lib/i18n';
import { createDebouncedWriter, readJson, STORAGE_KEYS } from '../lib/storage';

export type ThemeMode = 'dark' | 'light' | 'system';

export interface SettingsData {
  theme: ThemeMode;
  language: Language;
  resumePlayback: boolean;
  defaultSpeed: number;
  nativeVideoMode: boolean;
  autoScanOnLaunch: boolean;
}

const DEFAULTS: SettingsData = {
  theme: 'dark',
  language: 'en',
  resumePlayback: true,
  defaultSpeed: 1,
  nativeVideoMode: false,
  autoScanOnLaunch: true,
};

const writer = createDebouncedWriter();

interface SettingsStore extends SettingsData {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  update: <K extends keyof SettingsData>(key: K, value: SettingsData[K]) => void;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,
  hydrate: async () => {
    const stored = await readJson<Partial<SettingsData>>(STORAGE_KEYS.settings, {});
    set({ ...DEFAULTS, ...stored, hydrated: true });
  },
  update: (key, value) => {
    set({ [key]: value } as Pick<SettingsData, typeof key>);
    const { hydrated: _hydrated, hydrate: _hydrate, update: _update, ...data } = get();
    writer.queue(STORAGE_KEYS.settings, data);
  },
}));

export function resolveTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode !== 'system') return mode;
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}
