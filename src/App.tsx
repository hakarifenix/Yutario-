import { useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { MiniPlayer } from './components/MiniPlayer';
import { BottomNav } from './components/BottomNav';
import { Toaster } from './components/ui';
import { HomeScreen } from './screens/Home';
import { MusicScreen } from './screens/Music';
import { CollectionScreen } from './screens/Collection';
import { VideosScreen } from './screens/Videos';
import { PlaylistsScreen } from './screens/Playlists';
import { PlaylistDetailScreen } from './screens/PlaylistDetail';
import { SettingsScreen } from './screens/Settings';
import { EqualizerScreen } from './screens/Equalizer';
import { FullPlayerScreen } from './screens/FullPlayer';
import { VideoPlayerScreen } from './screens/VideoPlayer';
import { I18nProvider } from './lib/i18n';
import { isNativePlatform, toMediaItem, YutarioNative } from './lib/native';
import { resolveTheme, useSettings } from './state/settings';
import { useCollections } from './state/collections';
import { useLibrary } from './state/library';
import { usePlayer } from './state/player';
import { useAudioEffects } from './state/audioEffects';
import { useToasts } from './state/toast';
import { runBackHandlers } from './lib/back';
import { notify } from './state/toast';

const ROOT_PATHS = ['/', '/music', '/videos', '/playlists', '/settings'];

function useBootstrap() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await useSettings.getState().hydrate();
      await useCollections.getState().hydrate();
      await useLibrary.getState().init();
      await usePlayer.getState().hydrate();
      void useAudioEffects.getState().hydrate();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}

function useTheme() {
  const theme = useSettings((state) => state.theme);
  useEffect(() => {
    const resolved = resolveTheme(theme);
    document.documentElement.dataset.theme = resolved;
    const background = resolved === 'light' ? '#f6fbf8' : '#06110d';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
    if (isNativePlatform) {
      void StatusBar.setStyle({ style: resolved === 'light' ? Style.Light : Style.Dark }).catch(() => undefined);
      void StatusBar.setBackgroundColor({ color: background }).catch(() => undefined);
    }
  }, [theme]);
}

function useAndroidBack() {
  const location = useLocation();
  const navigate = useNavigate();
  const locationRef = useRef(location.pathname);
  locationRef.current = location.pathname;

  useEffect(() => {
    if (!isNativePlatform) return;
    const handle = CapacitorApp.addListener('backButton', () => {
      if (runBackHandlers()) return;
      const path = locationRef.current;
      if (path === '/player' || path.startsWith('/video/')) {
        navigate(-1);
        return;
      }
      if (ROOT_PATHS.includes(path)) {
        void CapacitorApp.minimizeApp();
        return;
      }
      navigate(-1);
    });
    return () => {
      void handle.then((listener) => listener.remove());
    };
  }, [navigate]);
}

function useShareIntents() {
  const addItems = useLibrary((state) => state.addItems);
  const playNow = usePlayer((state) => state.playNow);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNativePlatform) return;
    let disposed = false;
    const handlePayload = (payload: { items?: unknown[] }) => {
      const items = (payload?.items ?? []).map((item) => toMediaItem(item as never));
      if (items.length === 0) return;
      addItems(items);
      const audio = items.filter((item) => item.kind === 'audio');
      if (audio.length > 0) {
        void playNow(audio, 0);
        notify(audio[0].title);
      } else {
        navigate(`/video/${encodeURIComponent(items[0].id)}`);
      }
    };
    const listener = YutarioNative.addListener('shareIntent', handlePayload);
    void YutarioNative.getPendingShare()
      .then((pending) => {
        if (!disposed && pending?.items?.length) handlePayload(pending);
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      void listener.then((handle) => handle.remove());
    };
  }, [addItems, playNow, navigate]);
}

function useNotificationPrompt() {
  const isPlaying = usePlayer((state) => state.isPlaying);
  const asked = useRef(false);

  useEffect(() => {
    if (!isPlaying || asked.current || !isNativePlatform) return;
    const permission = useLibrary.getState().permission;
    if (permission && !permission.notifications) {
      asked.current = true;
      void useLibrary.getState().requestNotifications();
    }
  }, [isPlaying]);
}

function Shell() {
  const ready = useBootstrap();
  const language = useSettings((state) => state.language);
  const location = useLocation();
  const toasts = useToasts((state) => state.toasts);
  const dismiss = useToasts((state) => state.dismiss);

  useTheme();
  useAndroidBack();
  useShareIntents();
  useNotificationPrompt();

  const hideChrome = location.pathname === '/player' || location.pathname.startsWith('/video/');

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 animate-pulse-soft rounded-2xl bg-gradient-to-br from-accent to-accent-2" />
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Yutario</span>
        </div>
      </div>
    );
  }

  return (
    <I18nProvider language={language}>
      <div className={hideChrome ? '' : 'mx-auto min-h-full max-w-2xl pb-[calc(154px+env(safe-area-inset-bottom,0px))]'}>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/music" element={<MusicScreen />} />
          <Route path="/music/album/:key" element={<CollectionScreen type="album" />} />
          <Route path="/music/artist/:key" element={<CollectionScreen type="artist" />} />
          <Route path="/music/folder/:key" element={<CollectionScreen type="folder" />} />
          <Route path="/videos" element={<VideosScreen />} />
          <Route path="/playlists" element={<PlaylistsScreen />} />
          <Route path="/playlists/:id" element={<PlaylistDetailScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/settings/equalizer" element={<EqualizerScreen />} />
          <Route path="/player" element={<FullPlayerScreen />} />
          <Route path="/video/:id" element={<VideoPlayerScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        {!hideChrome ? (
          <>
            <MiniPlayer />
            <BottomNav />
          </>
        ) : null}
      </div>
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </I18nProvider>
  );
}

export default function App() {
  return <Shell />;
}
