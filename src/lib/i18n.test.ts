import { describe, expect, it } from 'vitest';
import { en } from './locales/en';
import { fr } from './locales/fr';
import { ar } from './locales/ar';
import { isLanguage, languageDir, translate } from './i18n';

describe('dictionaries', () => {
  it('have identical key sets for every language', () => {
    const englishKeys = Object.keys(en).sort();
    expect(Object.keys(fr).sort()).toEqual(englishKeys);
    expect(Object.keys(ar).sort()).toEqual(englishKeys);
  });

  it('have no empty translations', () => {
    for (const [key, value] of Object.entries({ ...en, ...fr, ...ar })) {
      expect(value.trim(), key).not.toBe('');
    }
  });
});

describe('translate', () => {
  it('interpolates named variables', () => {
    expect(translate('en', 'home.stats', { tracks: 3, videos: 1 })).toBe('3 tracks · 1 videos');
    expect(translate('fr', 'home.stats', { tracks: 3, videos: 1 })).toContain('3 titres');
  });

  it('falls back to English for a missing entry', () => {
    expect(translate('fr', 'app.name')).toBe('Yutario');
  });

  it('returns the key when nothing matches', () => {
    // @ts-expect-error deliberately invalid key
    expect(translate('en', 'missing.key')).toBe('missing.key');
  });
});

describe('language direction', () => {
  it('marks Arabic as right-to-left', () => {
    expect(languageDir('ar')).toBe('rtl');
    expect(languageDir('en')).toBe('ltr');
    expect(languageDir('fr')).toBe('ltr');
  });

  it('validates language codes', () => {
    expect(isLanguage('ar')).toBe(true);
    expect(isLanguage('de')).toBe(false);
    expect(isLanguage(null)).toBe(false);
  });
});
