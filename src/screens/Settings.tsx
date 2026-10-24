import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  FolderSearch,
  Info,
  Languages,
  ListMusic,
  MonitorSmartphone,
  Moon,
  Shield,
  Sliders,
  Sun,
  Trash2,
  Volume2,
} from 'lucide-react';
import { useSettings, type ThemeMode } from '../state/settings';
import { useLibrary } from '../state/library';
import { useCollections } from '../state/collections';
import { usePlayer } from '../state/player';
import { useT, LANGUAGES, type Language } from '../lib/i18n';
import { IconButton, Sheet, Dialog, Spinner } from '../components/ui';
import { isNativePlatform, YutarioNative } from '../lib/native';
import { notify } from '../state/toast';

const APP_VERSION = '1.0.0';
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function SettingsScreen() {
  const t = useT();
  const navigate = useNavigate();
  const settings = useSettings();
  const permission = useLibrary((state) => state.permission);
  const status = useLibrary((state) => state.status);
  const scan = useLibrary((state) => state.refresh);
  const requestPermission = useLibrary((state) => state.requestPermission);
  const requestNotifications = useLibrary((state) => state.requestNotifications);
  const clearHistory = useCollections((state) => state.clearHistory);
  const setSpeed = usePlayer((state) => state.setSpeed);

  const [speedOpen, setSpeedOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  const themes: { value: ThemeMode; label: string; icon: ReactNode }[] = [
    { value: 'dark', label: t('settings.themeDark'), icon: <Moon size={14} /> },
    { value: 'light', label: t('settings.themeLight'), icon: <Sun size={14} /> },
    { value: 'system', label: t('settings.themeSystem'), icon: <MonitorSmartphone size={14} /> },
  ];

  return (
    <div className="page-enter px-4 pt-[calc(env(safe-area-inset-top,0px)+18px)]">
      <header className="mb-5 flex items-center gap-2">
        <IconButton label={t('a11y.back')} onClick={() => navigate('/')}>
          <ArrowLeft size={20} className="rtl:rotate-180" />
        </IconButton>
        <h1 className="text-[22px] font-bold tracking-tight text-ink">{t('settings.title')}</h1>
      </header>

      <Section title={t('settings.appearance')}>
        <Row icon={<Moon size={16} />} label={t('settings.theme')}>
          <div className="flex rounded-xl border border-line bg-surface-2 p-0.5">
            {themes.map((theme) => (
              <button
                key={theme.value}
                type="button"
                onClick={() => settings.update('theme', theme.value)}
                aria-pressed={settings.theme === theme.value}
                className={`tap flex items-center gap-1 rounded-[10px] px-2 py-1.5 text-[11px] font-semibold ${
                  settings.theme === theme.value ? 'bg-accent text-white' : 'text-muted'
                }`}
              >
                {theme.icon}
                {theme.label}
              </button>
            ))}
          </div>
        </Row>
        <Row icon={<Languages size={16} />} label={t('settings.language')}>
          <div className="flex gap-1">
            {LANGUAGES.map((language) => (
              <button
                key={language.code}
                type="button"
                onClick={() => settings.update('language', language.code as Language)}
                aria-pressed={settings.language === language.code}
                className={`tap rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
                  settings.language === language.code ? 'bg-accent text-white' : 'bg-surface-2 text-muted'
                }`}
              >
                {language.code.toUpperCase()}
              </button>
            ))}
          </div>
        </Row>
      </Section>

      <Section title={t('settings.playback')}>
        <ToggleRow
          icon={<ListMusic size={16} />}
          label={t('settings.resumePlayback')}
          hint={t('settings.resumePlaybackHint')}
          checked={settings.resumePlayback}
          onChange={(value) => settings.update('resumePlayback', value)}
        />
        <Row icon={<Volume2 size={16} />} label={t('settings.defaultSpeed')}>
          <button
            type="button"
            onClick={() => setSpeedOpen(true)}
            className="tap rounded-lg bg-surface-2 px-3 py-1.5 text-[12px] font-semibold text-ink"
          >
            {settings.defaultSpeed}×
          </button>
        </Row>
        <ToggleRow
          icon={<MonitorSmartphone size={16} />}
          label={t('settings.nativeVideo')}
          hint={t('settings.nativeVideoHint')}
          checked={settings.nativeVideoMode}
          onChange={(value) => settings.update('nativeVideoMode', value)}
        />
      </Section>

      <Section title={t('settings.audio')}>
        <button
          type="button"
          onClick={() => navigate('/settings/equalizer')}
          className="tap flex w-full items-center gap-3 rounded-2xl border border-line/60 bg-surface px-3.5 py-3 text-start"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2 text-accent">
            <Sliders size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-ink">{t('settings.equalizer')}</span>
            <span className="block text-[11px] text-muted">{t('equalizer.title')}</span>
          </span>
          <ChevronRight size={16} className="text-muted rtl:rotate-180" />
        </button>
      </Section>

      <Section title={t('settings.library')}>
        <button
          type="button"
          onClick={() => {
            if (!isNativePlatform) return;
            if (permission && permission.state !== 'granted') {
              void requestPermission();
              return;
            }
            void scan();
            notify(t('library.scanning'));
          }}
          className="tap flex w-full items-center gap-3 rounded-2xl border border-line/60 bg-surface px-3.5 py-3 text-start"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2 text-accent">
            {status === 'scanning' ? <Spinner size={16} /> : <FolderSearch size={17} />}
          </span>
          <span className="min-w-0 flex-1 text-[13px] font-semibold text-ink">{t('settings.scanNow')}</span>
          {status === 'scanning' ? <span className="text-[11px] text-muted">{t('common.loading')}</span> : null}
        </button>
      </Section>

      {isNativePlatform ? (
        <Section title={t('settings.permissions')}>
          <Row icon={<FolderSearch size={16} />} label={t('settings.mediaPermission')}>
            <StatusPill granted={permission?.state === 'granted'} label={
              permission?.state === 'granted' ? t('settings.granted') : t('settings.notGranted')
            } />
          </Row>
          <Row icon={<Bell size={16} />} label={t('settings.notificationPermission')}>
            <button
              type="button"
              onClick={() => void requestNotifications()}
              className="tap"
            >
              <StatusPill
                granted={Boolean(permission?.notifications)}
                label={permission?.notifications ? t('settings.granted') : t('library.allowNotifications')}
              />
            </button>
          </Row>
          <button
            type="button"
            onClick={() => {
              if (permission && permission.state !== 'granted') void requestPermission();
              else void YutarioNative.openAppSettings().catch(() => undefined);
            }}
            className="tap w-full rounded-xl px-3 py-2.5 text-start text-[12px] font-semibold text-accent"
          >
            {t('library.openSettings')}
          </button>
        </Section>
      ) : null}

      <Section title={t('settings.about')}>
        <button
          type="button"
          onClick={() => setClearOpen(true)}
          className="tap flex w-full items-center gap-3 rounded-2xl border border-line/60 bg-surface px-3.5 py-3 text-start"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2 text-danger">
            <Trash2 size={17} />
          </span>
          <span className="min-w-0 flex-1 text-[13px] font-semibold text-ink">{t('settings.clearHistory')}</span>
        </button>
        <div className="rounded-2xl border border-line/60 bg-surface px-3.5 py-3">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-ink">
            <Shield size={15} className="text-accent" />
            {t('settings.privacy')}
          </div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{t('settings.privacyBody')}</p>
        </div>
        <div className="flex items-center gap-2 px-1 py-2 text-[11px] text-muted">
          <Info size={13} />
          {t('settings.version')} {APP_VERSION} · {t('settings.storage')}
        </div>
      </Section>

      <Sheet open={speedOpen} onClose={() => setSpeedOpen(false)} title={t('settings.defaultSpeed')}>
        <ul className="space-y-0.5 pb-2">
          {SPEEDS.map((speed) => (
            <li key={speed}>
              <button
                type="button"
                onClick={() => {
                  settings.update('defaultSpeed', speed);
                  void setSpeed(speed);
                  setSpeedOpen(false);
                }}
                className={`tap flex w-full items-center justify-between rounded-xl px-3 py-3 text-sm ${
                  settings.defaultSpeed === speed ? 'bg-accent/15 font-semibold text-accent' : 'text-ink'
                }`}
              >
                {speed}×
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <Dialog
        open={clearOpen}
        title={t('settings.clearHistory')}
        message={t('settings.clearHistoryConfirm')}
        confirmLabel={t('common.delete')}
        danger
        onClose={() => setClearOpen(false)}
        onConfirm={() => {
          clearHistory();
          setClearOpen(false);
          notify(t('settings.cleared'));
        }}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{title}</h2>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line/60 bg-surface px-3.5 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-accent">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{label}</span>
      {children}
    </div>
  );
}

function ToggleRow({
  icon,
  label,
  hint,
  checked,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-line/60 bg-surface px-3.5 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-accent">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        {hint ? <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`tap mt-1 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          checked ? 'bg-accent' : 'bg-line'
        }`}
      >
        <span
          className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

function StatusPill({ granted, label }: { granted: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${
        granted ? 'bg-emerald-500/15 text-emerald-400' : 'bg-danger/15 text-danger'
      }`}
    >
      {label}
    </span>
  );
}
