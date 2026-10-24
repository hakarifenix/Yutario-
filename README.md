# Yutario Player

An offline-first music and video player for Android. The interface is React + TypeScript,
playback is native AndroidX Media3 (ExoPlayer) with a MediaSessionService for background audio,
lock-screen and notification controls.

The app has no account, no cloud service and no bundled media. It plays files that are already on
the device (through Android MediaStore) or files the user picks with the Android document picker.

![Yutario app icon](artifacts/branding/app-icon.png)

---

## Current status

This repository was empty except for a placeholder README, so Yutario Player was built from
scratch in phases. Everything below was verified in this environment:

| Check | Result |
| --- | --- |
| `npm run typecheck` (TypeScript, strict) | Pass |
| `npm run test:run` (Vitest, 10 files) | 68 tests pass |
| `npm run build` (Vite production bundle) | Pass (≈100 kB gzipped) |
| Gradle `assembleDebug` (Java 21, compileSdk 35) | Pass |
| APK produced, signed with the Android debug key, correct manifest and bundled web assets | Verified (`app-debug.apk`, ≈8.7 MB) |

**Not verified here:** there is no Android device, emulator or USB debugging in this environment.
Every behaviour that depends on a real device is listed in
[Device verification checklist](#device-verification-checklist). Do not treat the checklist as
already passed.

---

## What is implemented

### Library and file access
- Android **MediaStore** scanning for audio and video, paginated and off the UI thread.
- Permission handling for Android 13+ (`READ_MEDIA_AUDIO`, `READ_MEDIA_VIDEO`) and older
  versions (`READ_EXTERNAL_STORAGE`), with rationale text in the UI.
- Manual file selection through the **Storage Access Framework** (multiple files, persistable URI
  permissions) for both music and video.
- Share/“open with” intents: `ACTION_SEND` and `ACTION_VIEW` for `audio/*` and `video/*`.
- Search across title, artist, album, folder and MIME type; debounced input.
- Sorting by name, date added, duration, artist, album and file size, ascending or descending.
- Folders, albums, artists, favourites, recently added, continue-listening and play history.
- File details sheet (size, type, folder, date, availability) and Android share sheet.
- Windowed list rendering plus lazy, bounded album-artwork cache (max 240 thumbnails).

### Music playback
- Native Media3 `ExoPlayer`, one authoritative engine for audio.
- Play/pause, previous/next, seek, repeat off/one/all, shuffle.
- Queue with play-next, add-to-queue, remove, reorder, unique entries.
- Playlists (create, rename, reorder, remove tracks, delete) and favourites — persisted locally.
- Resume positions per track and a restored last session (paused) on app launch.
- Playback speed 0.5×–2×, sleep timer (15/30/45/60/90 min, or stop after the current track).

### Background audio and system controls
- `MediaSessionService` (Media3) with a foreground media notification, play/pause/next/previous,
  lock-screen controls, Bluetooth/wired headset buttons and audio focus handling.
- Notification artwork is read from embedded album art (`MediaStore` thumbnails on Android 10+).
- `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `POST_NOTIFICATIONS` requested in context.

### Video
- Dedicated native ExoPlayer surface rendered **behind a transparent WebView**, so the React
  controls stay on top; the surface is positioned in CSS pixels and converted per density.
- Fit / crop / stretch aspect modes, playback speed, ±10 s seek buttons, double-tap left/right to
  seek 10 s, control lock, auto-hiding chrome, keep-screen-on, orientation toggle.
- Subtitles: embedded track selection (on/off per track), external SRT/VTT/SSA/TTML file loading
  through the document picker, and subtitle size adjustment.
- Resume position for videos, graceful error overlay for broken or unsupported files.
- “Video compatibility mode” fallback (native surface above the WebView with Media3's own
  controller) for devices where WebView transparency is unavailable.

### Audio effects
- `android.media.audiofx` Equalizer, BassBoost and Virtualizer bound to the ExoPlayer audio session.
- Device presets plus custom band levels; unsupported effects are detected and explained instead
  of faked. Settings are persisted and re-applied when playback starts.

### Interface
- Deep charcoal/midnight palette with violet and electric-blue accents; dark, light and system
  themes with CSS-variable tokens.
- Home, Music, Videos, Playlists, Settings tabs; persistent mini player; full player; video player.
- Android back handling: closes sheets/dialogs and the expanded player before leaving a screen,
  then minimises the app from a root tab instead of terminating playback.
- English, French and Arabic (full RTL) localisation, accessible labels on icon buttons,
  reduced-motion support and safe-area insets.

### Deliberate limitations
- **Picture-in-picture is not implemented** (`getCapabilities().pictureInPicture === false`).
- **Subtitle delay/offset is not implemented** — Media3 1.5 has no public offset API, so the UI
  states that instead of showing a slider that does nothing.
- ASS/SSA styling is whatever Media3 renders; complex positioning/karaoke effects are not
  guaranteed.
- Codec coverage is whatever the device's MediaCodec stack offers. MP3/AAC/M4A/WAV/FLAC/Vorbis/Opus
  and H.264/H.265/VP9 in MP4/WebM/MKV are typical, but nothing is promised per device.
- Online streaming is intentionally absent. Yutario is a local player.
- Audio effects depend on the device's hardware/software effect implementation.

---

## Architecture

```
React UI (Vite + TypeScript + Tailwind)
├── state/            zustand stores: player mirror, library, collections, settings, effects
├── lib/engine.ts     PlaybackEngine interface
│   ├── engineNative  Capacitor bridge → Media3 (production, Android)
│   └── engineWeb     HTMLAudioElement fallback (browser preview only)
└── lib/native.ts     typed bindings for the custom "Yutario" Capacitor plugin

android/app/src/main/java/com/yutario/player
├── MainActivity.java          registers the plugin, forwards share/view intents
├── YutarioPlugin.java         Capacitor API: library, playback, effects, video
├── PlaybackController.java    singleton ExoPlayer, queue, sleep timer, state events
├── PlaybackService.java       MediaSessionService (foreground notification, lock screen)
├── AudioEffectsManager.java   Equalizer / BassBoost / Virtualizer on the audio session
├── VideoController.java       video ExoPlayer + surface behind the WebView + subtitles
├── MediaLibrary.java          MediaStore queries, SAF metadata, artwork, file info
└── ArtworkLoader.java         notification artwork from embedded tags
```

The queue lives in ExoPlayer; the UI mirrors it and never maintains a competing playback state.
Native state events (`playerState`, `videoState`) are throttled and only re-send the queue ids when
the queue actually changes.

---

## Requirements

- Node.js 20+ (CI uses 22)
- Java 21 for the Android build (Capacitor 7 / Gradle 8.11)
- Android SDK: platform 35, build-tools 35.0.0

## Local development

```bash
npm ci            # install from the lockfile
npm run dev       # browser preview on http://localhost:3000
npm run typecheck
npm run test      # watch mode; `npm run test:run` for CI
npm run build     # production web bundle in dist/
```

The browser preview cannot read device storage; use **Add files** there. Android-only features
(native scanning, background playback, notification, video surface) require the APK.

## Build the APK locally

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.
`npm run android:apk` runs the same sequence in one step.

---

## Build with GitHub Actions

The workflow is [`.github/workflows/android-build.yml`](.github/workflows/android-build.yml). It runs
on every push to `main` and on manual dispatch.

1. **Push your changes** to the repository (`git push origin main`, or merge a pull request into
   `main`).
2. **Start the workflow manually** if you do not want to push: open the repository on GitHub →
   **Actions** → **Android Debug APK** → **Run workflow** → choose the `main` branch → **Run**.
3. **Check the status**: the run appears in the Actions list. A red cross means a step failed — open
   the failing step's log; the log names the exact command (typecheck, tests, web build, sync,
   Gradle).
4. **Download the APK**: open the successful run → scroll to **Artifacts** → download
   `yutario-debug-apk.zip` → unzip to get `app-debug.apk`. Artifacts are kept for 30 days.
5. **Install on a phone**: transfer the APK to the device (USB, cloud drive or `adb install
   app-debug.apk`). On the phone, allow **Install unknown apps** for the app you use to open the
   file, tap the APK, confirm, then open **Yutario** and grant media access.
6. **Troubleshooting a failed build**:
   - `npm ci` fails → the lockfile and `package.json` disagree; run `npm install` locally and commit
     the updated `package-lock.json`.
   - Typecheck or tests fail → run `npm run typecheck` / `npm run test:run` locally; the CI log
     prints the same errors.
   - `cap sync` fails → run `npm run build` first; the native project needs `dist/`.
   - Gradle fails on SDK/Java → confirm the log shows Java 21 and that the
     `sdkmanager "platforms;android-35" "build-tools;35.0.0"` step succeeded.
   - No APK found → the “Verify APK” step fails with `::error::APK was not produced`; read the
     Gradle task output above it.
7. **Debug vs release signing**: the artifact is a debug build signed with the throwaway Android
   debug key — fine for personal testing, not for distribution. A public release needs a release
   keystore (`keytool -genkeypair`), a `signingConfigs.release` block fed from repository secrets,
   `./gradlew assembleRelease`, and Play Store/APK signing. Never commit the keystore or its
   passwords.

---

## Android permissions

| Permission | When it is requested | Why |
| --- | --- | --- |
| `READ_MEDIA_AUDIO` (Android 13+) | First library scan | Read audio files indexed by MediaStore |
| `READ_MEDIA_VIDEO` (Android 13+) | First library scan | Read video files indexed by MediaStore |
| `READ_EXTERNAL_STORAGE` (≤ Android 12) | First library scan | Same access on older versions (maxSdk 32) |
| `POST_NOTIFICATIONS` (Android 13+) | When playback starts (and from Settings) | Show the media notification / lock-screen controls |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | Declared only | Keep audio playing in the background |
| `WAKE_LOCK` | Declared only | Keep playback stable while the screen is off |
| `MODIFY_AUDIO_SETTINGS` | Declared only | Attach equalizer/bass effects to the audio session |

Manual file picks use the system document picker and need no broad storage permission; the app keeps
persistable read access only to the files the user chose.

---

## Device verification checklist

Run these on a real phone after installing the APK. None of them were executed in this build
environment.

- [ ] Grant media access and confirm songs/videos appear; deny it and confirm the app explains why.
- [ ] Play a local MP3/FLAC; verify title, artist and embedded artwork.
- [ ] Lock the screen: audio continues; notification and lock-screen play/pause/next work.
- [ ] Connect Bluetooth/headset and test hardware play/pause and skip.
- [ ] Receive a call or enable another audio app; verify pause/duck and resume behaviour.
- [ ] Add tracks to a playlist, force-stop the app, reopen: playlist still present.
- [ ] Test repeat one/all and shuffle, including next at the end of the queue.
- [ ] Open a video: image appears (WebView transparency), controls, seek, speed, aspect modes.
- [ ] Rotate the phone; confirm the surface follows and orientation is restored on exit.
- [ ] Load an SRT subtitle, switch tracks, disable subtitles, resize them.
- [ ] Play a corrupt file and confirm a clear error rather than a crash.
- [ ] Enable the equalizer and confirm the sound changes (device-dependent).
- [ ] Use the Android back gesture from a sheet, the full player, a tab and the home tab.
- [ ] Switch to Arabic and confirm right-to-left layout.
- [ ] Scan a large library (thousands of tracks) and confirm the list stays responsive.
- [ ] If the video image does not appear, enable **Settings → Playback → Video compatibility mode**
      and report the device model.

Bugs found on a device belong in the tracker with the device model, Android version and a logcat
excerpt (`adb logcat | grep -E "Yutario|ExoPlayer"`).

---

## Tests

```
npm run test:run
```

| File | Covers |
| --- | --- |
| `src/lib/queue.test.ts` | next/previous with repeat modes, clamping, dedupe, reorder, shuffle order |
| `src/state/player.test.ts` | engine→store synchronisation, error surfacing, queue ops, repeat cycle, sleep timer |
| `src/state/collections.test.ts` | playlist CRUD/reorder, favourites, history, storage round-trip, library refresh safety |
| `src/state/library.test.ts` | permission denial, partial access, pagination, scan errors, manual import |
| `src/lib/libraryView.test.ts` | search, sorting, album/artist grouping |
| `src/lib/format.test.ts` | duration/byte formatting, grouping, path helpers |
| `src/lib/i18n.test.ts` | key parity across en/fr/ar, interpolation, RTL |
| `src/lib/back.test.ts` | back-handler stack ordering and cleanup |
| `src/components/ui.test.tsx` | sheet/dialog accessibility and back behaviour, mini player controls |
| `src/App.test.tsx` | full shell boot, tab navigation, settings reachable |

Native playback, notification, lock-screen, subtitle rendering and video surface behaviour cannot be
covered by these tests; they require the device checklist above.

---

## Project layout

```
src/
  components/     UI primitives, artwork, virtual list, mini player, track menu
  screens/        Home, Music, Collection, Videos, Playlists, PlaylistDetail, Settings,
                  Equalizer, FullPlayer, VideoPlayer
  state/          zustand stores (player, library, collections, settings, effects, toasts)
  lib/            native bridge, engines, i18n, formatting, persistence, queue helpers
  test/           Vitest setup
android/          Capacitor Android project with the Media3 plugin
.github/          CI workflow producing the APK
```

## Privacy

Yutario never uploads media, has no analytics and no account. Playlists, favourites, history,
resume positions and settings are stored on the device via Capacitor Preferences. Deleting the app
removes that data; it is not backed up to a server.

## License and media

No music or video is bundled. Play only content you own or are allowed to access. Third-party
libraries keep their own licences (React, Vite, Tailwind, Capacitor, AndroidX Media3, lucide icons).
