import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { en, type TranslationKey } from './locales/en';
import { fr } from './locales/fr';
import { ar } from './locales/ar';

export type Language = 'en' | 'fr' | 'ar';
export type TranslateVars = Record<string, string | number | undefined | null>;

const dictionaries: Record<Language, Record<TranslationKey, string>> = { en, fr, ar };

export const LANGUAGES: { code: Language; label: string; dir: 'ltr' | 'rtl' }[] = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'fr', label: 'Français', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
];

export function languageDir(language: Language): 'ltr' | 'rtl' {
  return language === 'ar' ? 'rtl' : 'ltr';
}

export function isLanguage(value: string | null | undefined): value is Language {
  return value === 'en' || value === 'fr' || value === 'ar';
}

export function translate(language: Language, key: TranslationKey, vars?: TranslateVars): string {
  const table = dictionaries[language] ?? dictionaries.en;
  const template = table[key] ?? dictionaries.en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined || value === null ? match : String(value);
  });
}

export type TFunction = (key: TranslationKey, vars?: TranslateVars) => string;

const I18nContext = createContext<{ language: Language; t: TFunction }>({
  language: 'en',
  t: (key, vars) => translate('en', key, vars),
});

export function I18nProvider({ language, children }: { language: Language; children: ReactNode }) {
  const value = useMemo(() => {
    const t: TFunction = (key, vars) => translate(language, key, vars);
    return { language, t };
  }, [language]);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = language;
    root.dir = languageDir(language);
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): TFunction {
  return useContext(I18nContext).t;
}

export function useLanguage(): Language {
  return useContext(I18nContext).language;
}

export type { TranslationKey };
