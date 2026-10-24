package com.yutario.player;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.pm.ActivityInfo;
import android.content.res.AssetFileDescriptor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.annotation.Nullable;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.TrackGroup;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.common.Tracks;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.mediacodec.MediaCodecInfo;
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector;
import androidx.media3.exoplayer.mediacodec.MediaCodecUtil;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;
import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Dedicated native video engine. The PlayerView sits behind the transparent WebView so the
 * React controls stay on top while decoding happens in ExoPlayer.
 *
 * <p>Every failure path is reported with the real ExoPlayer error code, the resolved URI and the
 * detected container type. Decoder failures get one automatic retry with software codecs before
 * the UI is told the file cannot be played.
 */
@UnstableApi
public final class VideoController implements Player.Listener {

  public interface StateListener {
    void onVideoState(JSONObject state);
  }

  private static final String TAG = "YutarioVideo";

  private final Activity activity;
  private final WebView webView;
  private final Handler handler = new Handler(Looper.getMainLooper());

  private ExoPlayer player;

  @Nullable
  private PlayerView playerView;
  @Nullable
  private ViewGroup container;
  @Nullable
  private ViewGroup host;
  @Nullable
  private StateListener listener;

  private boolean visible = false;
  private boolean aboveWebView = false;
  private boolean nativeControls = false;
  private boolean keepScreenOn = false;
  private boolean softwareFallback = false;
  private boolean fallbackAttempted = false;
  /** The audio track could not be decoded, so the video is played silently. */
  private boolean audioDisabled = false;
  private boolean audioFallbackAttempted = false;
  private int originalOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
  @Nullable
  private String currentUri;
  @Nullable
  private String playableUri;
  @Nullable
  private String currentTitle;
  @Nullable
  private String subtitleUri;
  @Nullable
  private String subtitleName;
  @Nullable
  private String lastError;
  @Nullable
  private String lastErrorDetail;
  @Nullable
  private String detectedMime;
  private float speed = 1f;
  private boolean tickerRunning = false;

  private final Runnable ticker = new Runnable() {
    @Override
    public void run() {
      emit();
      if (player.isPlaying()) {
        handler.postDelayed(this, 400);
      } else {
        tickerRunning = false;
      }
    }
  };

  /**
   * A local file never needs more than a moment to prepare. When ExoPlayer stays buffering (or idle)
   * the UI used to spin forever with the MediaStore duration and no error at all, which is exactly
   * the "video never starts" report. This reports the stall with the container and decoder state
   * instead of hanging.
   */
  private final Runnable prepareWatchdog = new Runnable() {
    @Override
    public void run() {
      int playbackState = player.getPlaybackState();
      if (
        lastError != null ||
        playbackState == Player.STATE_READY ||
        playbackState == Player.STATE_ENDED
      ) {
        return;
      }
      fail(
        "PREPARE_TIMEOUT",
        "ExoPlayer stayed in " +
        playbackStateName(playbackState) +
        " for 12s. container=" +
        detectedMime +
        " software=" +
        softwareFallback +
        " audioDisabled=" +
        audioDisabled
      );
    }
  };

  public VideoController(Activity activity, WebView webView) {
    this.activity = activity;
    this.webView = webView;
    this.player = buildPlayer(false);
    this.player.addListener(this);
  }

  private ExoPlayer buildPlayer(boolean preferSoftware) {
    DefaultRenderersFactory renderers = new DefaultRenderersFactory(activity)
      .setEnableDecoderFallback(true);
    if (preferSoftware) {
      renderers.setMediaCodecSelector(new SoftwareFirstSelector());
    }
    ExoPlayer built = new ExoPlayer.Builder(activity, renderers).build();
    built.setPlaybackSpeed(speed);
    return built;
  }

  public void setStateListener(@Nullable StateListener stateListener) {
    this.listener = stateListener;
  }

  private void emit() {
    StateListener current = listener;
    if (current == null) return;
    try {
      current.onVideoState(state());
    } catch (Exception error) {
      android.util.Log.w(TAG, "video state emit failed", error);
    }
  }

  public JSONObject state() {
    JSONObject out = new JSONObject();
    try {
      long duration = player.getDuration();
      out.put("ready", player.getPlaybackState() == Player.STATE_READY);
      out.put("isPlaying", player.isPlaying());
      out.put("isBuffering", player.getPlaybackState() == Player.STATE_BUFFERING);
      out.put("positionMs", Math.max(0, player.getCurrentPosition()));
      out.put("durationMs", duration == C.TIME_UNSET ? 0 : Math.max(0, duration));
      out.put("bufferedMs", Math.max(0, player.getBufferedPosition()));
      out.put("ended", player.getPlaybackState() == Player.STATE_ENDED);
      out.put("error", lastError == null ? JSONObject.NULL : lastError);
      out.put("errorDetail", lastErrorDetail == null ? JSONObject.NULL : lastErrorDetail);
      out.put("mimeType", detectedMime == null ? JSONObject.NULL : detectedMime);
      out.put("softwareDecoding", softwareFallback);
      out.put("audioUnavailable", audioDisabled);
      out.put("visible", visible);
    } catch (JSONException ignored) {
      /* primitives only */
    }
    return out;
  }

  private void ensureViews() {
    if (container != null) return;
    ViewGroup parent = (ViewGroup) webView.getParent();
    if (parent == null) {
      throw new IllegalStateException("The video surface has no parent view to attach to");
    }
    host = parent;

    container = new android.widget.FrameLayout(activity);
    container.setBackgroundColor(Color.BLACK);
    PlayerView view = new PlayerView(activity);
    view.setUseController(nativeControls);
    view.setControllerAutoShow(true);
    view.setShutterBackgroundColor(Color.BLACK);
    view.setKeepContentOnPlayerReset(true);
    view.setPlayer(player);
    view.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
    container.addView(
      view,
      new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    );
    playerView = view;

    ViewGroup.LayoutParams params = new ViewGroup.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.MATCH_PARENT
    );
    int index = aboveWebView ? host.getChildCount() : 0;
    host.addView(container, index, params);
    setWebViewTransparent(true);
  }

  private void setWebViewTransparent(boolean transparent) {
    try {
      // The page paints its own background, so the WebView itself must stay transparent while the
      // native video surface is behind it. It used to be repainted with a solid colour on exit,
      // which left the surface hidden after returning to a video.
      webView.setBackgroundColor(Color.TRANSPARENT);
    } catch (Exception ignored) {
      /* WebView may be mid-teardown. */
    }
  }

  public JSONObject show(JSONObject options) {
    String requested = options.optString("uri", "");
    currentTitle = options.optString("title", "");
    subtitleUri = options.optString("subtitleUri", null);
    subtitleName = options.optString("subtitleName", null);
    speed = options.optDouble("speed", 1.0) > 0 ? (float) options.optDouble("speed", 1.0) : 1f;

    lastError = null;
    lastErrorDetail = null;
    detectedMime = null;
    currentUri = requested;
    playableUri = null;
    // Every video starts from a clean engine state. Leaving these set meant that after one
    // decoder failure every following video was forced into software decoding and could no
    // longer fall back at all.
    fallbackAttempted = false;
    softwareFallback = false;
    audioFallbackAttempted = false;
    audioDisabled = false;

    try {
      ensureViews();
    } catch (Exception error) {
      fail("SURFACE_UNAVAILABLE", "The video view could not be created: " + describe(error));
      return state();
    }

    long startPosition = Math.max(0, options.optLong("startPositionMs", 0));
    boolean autoPlay = options.optBoolean("autoPlay", true);
    visible = true;

    try {
      open(startPosition, autoPlay);
    } catch (Exception error) {
      Diagnostics.log(activity, "video", "Could not open " + MediaUris.describe(requested), error);
      fail("MEDIA_OPEN_FAILED", describe(error));
    }

    applyKeepScreenOn(keepScreenOn);
    startTicker();
    emit();
    return state();
  }

  private void open(long startPosition, boolean autoPlay) {
    Uri uri = resolvePlayableUri(currentUri);
    playableUri = uri.toString();
    detectedMime = detectMimeType(uri);
    // A silence fallback from a previous file must not leak into this one.
    player.setTrackSelectionParameters(
      player.getTrackSelectionParameters().buildUpon().setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, false).build()
    );
    player.setMediaItem(buildMediaItem(uri));
    player.prepare();
    scheduleWatchdog();
    player.setPlaybackSpeed(speed);
    if (startPosition > 0) player.seekTo(startPosition);
    player.setPlayWhenReady(autoPlay);
    Diagnostics.log(
      activity,
      "video",
      "Opening " + MediaUris.describe(playableUri) + " mime=" + detectedMime + " software=" + softwareFallback
    );
  }

  /**
   * Resolves the stored location into something ExoPlayer can read, and proves the app is actually
   * allowed to read it. content:// URIs are never converted into filesystem paths.
   */
  private Uri resolvePlayableUri(@Nullable String raw) {
    String normalized = MediaUris.normalize(raw);
    if (normalized.isEmpty()) {
      throw new IllegalArgumentException("No video file was selected");
    }
    Uri uri;
    if (MediaUris.isLocalFile(normalized) && !normalized.startsWith("file://")) {
      uri = Uri.fromFile(new File(normalized));
    } else if (MediaUris.hasScheme(normalized)) {
      uri = Uri.parse(normalized);
    } else {
      uri = Uri.fromFile(new File(normalized));
    }

    String scheme = uri.getScheme() == null ? "" : uri.getScheme();
    if (ContentResolver.SCHEME_CONTENT.equals(scheme) || "android.resource".equals(scheme)) {
      // Opening a descriptor is the only reliable permission check for a content URI.
      try (AssetFileDescriptor descriptor =
        activity.getContentResolver().openAssetFileDescriptor(uri, "r")) {
        if (descriptor == null) {
          throw new IllegalStateException("The system media provider returned no data for this file");
        }
      } catch (SecurityException error) {
        throw new IllegalStateException(
          "Access to this file was denied. Import it again from storage so the app keeps permission.",
          error
        );
      } catch (java.io.FileNotFoundException error) {
        throw new IllegalStateException(
          "This file is no longer on the device. It may have been moved or deleted.",
          error
        );
      } catch (Exception error) {
        throw new IllegalStateException("Could not read the file: " + describe(error), error);
      }
      return uri;
    }

    if ("file".equals(scheme)) {
      String path = uri.getPath();
      if (path == null) throw new IllegalStateException("The file path is empty");
      if (path.startsWith("/_capacitor_file_")) {
        path = path.substring("/_capacitor_file_".length());
        uri = Uri.fromFile(new File(path));
      }
      File file = new File(path);
      if (!file.exists()) {
        throw new IllegalStateException("The file was not found at " + path);
      }
      if (!file.canRead()) {
        throw new IllegalStateException("The app is not allowed to read " + path);
      }
      // Files outside shared storage are not readable unless the grant survived; report early.
      String external = Environment.getExternalStorageDirectory().getAbsolutePath();
      if (!path.startsWith(external) && !path.startsWith(activity.getFilesDir().getAbsolutePath())) {
        if (!file.canRead()) {
          throw new IllegalStateException("No read access to " + path);
        }
      }
      return uri;
    }

    if (uri.getScheme() == null) {
      throw new IllegalStateException("Unsupported media location: " + MediaUris.describe(raw));
    }
    return uri;
  }

  @Nullable
  private String detectMimeType(Uri uri) {
    try {
      String fromProvider = activity.getContentResolver().getType(uri);
      if (fromProvider != null && !fromProvider.isEmpty()) return fromProvider;
    } catch (Exception ignored) {
      /* Providers are allowed to fail; the extension is a fine fallback. */
    }
    String fromName = MediaUris.mimeFromName(uri.getLastPathSegment());
    return fromName.isEmpty() ? null : fromName;
  }

  private MediaItem buildMediaItem(Uri uri) {
    MediaMetadata metadata = new MediaMetadata.Builder()
      .setTitle(currentTitle == null ? "" : currentTitle)
      .setIsPlayable(true)
      .setIsBrowsable(false)
      .build();
    // No MIME hint is passed on purpose: ExoPlayer's container sniffing is more reliable than the
    // MIME type MediaStore guesses from a file extension.
    MediaItem.Builder builder = new MediaItem.Builder()
      .setUri(uri)
      .setMediaMetadata(metadata);
    if (subtitleUri != null && !subtitleUri.isEmpty()) {
      String subtitle = MediaUris.normalize(subtitleUri);
      MediaItem.SubtitleConfiguration configuration =
        new MediaItem.SubtitleConfiguration.Builder(Uri.parse(subtitle))
          .setMimeType(subtitleMimeType(subtitleName))
          .setLanguage("und")
          .setLabel(subtitleName == null ? "External subtitles" : subtitleName)
          .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
          .build();
      builder.setSubtitleConfigurations(Collections.singletonList(configuration));
    }
    return builder.build();
  }

  public static String subtitleMimeType(@Nullable String name) {
    String lower = name == null ? "" : name.toLowerCase(java.util.Locale.US);
    if (lower.endsWith(".vtt")) return MimeTypes.TEXT_VTT;
    if (lower.endsWith(".ssa") || lower.endsWith(".ass")) return MimeTypes.TEXT_SSA;
    if (lower.endsWith(".ttml") || lower.endsWith(".xml")) return MimeTypes.APPLICATION_TTML;
    return MimeTypes.APPLICATION_SUBRIP;
  }

  public void setBounds(float x, float y, float width, float height) {
    if (container == null || host == null) return;
    float density = activity.getResources().getDisplayMetrics().density;
    int[] webLocation = new int[2];
    int[] hostLocation = new int[2];
    webView.getLocationOnScreen(webLocation);
    host.getLocationOnScreen(hostLocation);
    int left = Math.round((webLocation[0] - hostLocation[0]) + x * density);
    int top = Math.round((webLocation[1] - hostLocation[1]) + y * density);
    int w = Math.max(1, Math.round(width * density));
    int h = Math.max(1, Math.round(height * density));
    ViewGroup.LayoutParams params = container.getLayoutParams();
    if (params instanceof ViewGroup.MarginLayoutParams) {
      ViewGroup.MarginLayoutParams margins = (ViewGroup.MarginLayoutParams) params;
      margins.width = w;
      margins.height = h;
      margins.leftMargin = left;
      margins.topMargin = top;
      container.setLayoutParams(margins);
    } else {
      android.widget.FrameLayout.LayoutParams fresh = new android.widget.FrameLayout.LayoutParams(w, h);
      fresh.leftMargin = left;
      fresh.topMargin = top;
      container.setLayoutParams(fresh);
    }
  }

  public void setResizeMode(String mode) {
    if (playerView == null) return;
    int resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT;
    if ("fill".equals(mode)) resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FILL;
    else if ("zoom".equals(mode)) resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM;
    playerView.setResizeMode(resizeMode);
  }

  public JSONObject setOverlay(boolean above, boolean useNativeControls) {
    aboveWebView = above;
    nativeControls = useNativeControls;
    if (container != null && host != null) {
      host.removeView(container);
      if (playerView != null) playerView.setUseController(nativeControls);
      int index = above ? host.getChildCount() : 0;
      host.addView(container, index, container.getLayoutParams());
      setWebViewTransparent(true);
    }
    emit();
    return state();
  }

  public JSONObject setSpeed(float value) {
    speed = Math.max(0.25f, Math.min(4f, value));
    player.setPlaybackSpeed(speed);
    emit();
    return state();
  }

  public JSONObject setPaused(boolean paused) {
    if (!paused) {
      if (player.getPlaybackState() == Player.STATE_IDLE && player.getMediaItemCount() > 0) {
        player.prepare();
      }
      player.play();
      startTicker();
    } else {
      player.pause();
    }
    emit();
    return state();
  }

  public JSONObject seek(long positionMs) {
    player.seekTo(Math.max(0, positionMs));
    emit();
    return state();
  }

  public JSONObject setSubtitle(@Nullable String uri, @Nullable String name) {
    long position = player.getCurrentPosition();
    boolean playWhenReady = player.getPlayWhenReady();
    subtitleUri = uri;
    subtitleName = name;
    if (playableUri != null) {
      try {
        Uri media = Uri.parse(playableUri);
        player.setMediaItem(buildMediaItem(media));
        player.prepare();
        player.seekTo(position);
        player.setPlayWhenReady(playWhenReady);
        scheduleWatchdog();
      } catch (Exception error) {
        Diagnostics.log(activity, "video", "subtitle reload failed", error);
        fail("MEDIA_OPEN_FAILED", describe(error));
      }
    }
    emit();
    return state();
  }

  public void setSubtitleSize(float fraction) {
    if (playerView == null) return;
    if (playerView.getSubtitleView() != null) {
      playerView.getSubtitleView().setFractionalTextSize(Math.max(0.03f, Math.min(0.16f, fraction)));
    }
  }

  public void setKeepScreenOn(boolean on) {
    keepScreenOn = on;
    applyKeepScreenOn(on);
  }

  private void applyKeepScreenOn(boolean on) {
    activity.runOnUiThread(() -> {
      if (on) {
        activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
      } else {
        activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
      }
    });
  }

  public void lockOrientation(boolean landscape) {
    if (originalOrientation == ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED) {
      originalOrientation = activity.getRequestedOrientation();
    }
    activity.setRequestedOrientation(
      landscape ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
    );
  }

  public void unlockOrientation() {
    activity.setRequestedOrientation(originalOrientation);
    originalOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
  }

  private void startTicker() {
    if (tickerRunning) return;
    tickerRunning = true;
    handler.post(ticker);
  }

  private void scheduleWatchdog() {
    handler.removeCallbacks(prepareWatchdog);
    handler.postDelayed(prepareWatchdog, 12_000);
  }

  private void cancelWatchdog() {
    handler.removeCallbacks(prepareWatchdog);
  }

  private static String playbackStateName(int playbackState) {
    switch (playbackState) {
      case Player.STATE_IDLE:
        return "IDLE";
      case Player.STATE_BUFFERING:
        return "BUFFERING";
      case Player.STATE_READY:
        return "READY";
      case Player.STATE_ENDED:
        return "ENDED";
      default:
        return "STATE_" + playbackState;
    }
  }

  public JSONObject getTracks() {
    JSONArray audio = new JSONArray();
    JSONArray text = new JSONArray();
    Tracks tracks = player.getCurrentTracks();
    int audioIndex = 0;
    int textIndex = 0;
    for (Tracks.Group group : tracks.getGroups()) {
      for (int i = 0; i < group.length; i++) {
        androidx.media3.common.Format format = group.getTrackFormat(i);
        boolean selected = group.isTrackSelected(i);
        JSONObject entry = new JSONObject();
        try {
          String label = format.label != null ? format.label : (format.language != null ? format.language : "#" + (i + 1));
          entry.put("id", (format.language == null ? "und" : format.language) + ":" + i);
          entry.put("label", label);
          entry.put("language", format.language == null ? "" : format.language);
          entry.put("selected", selected);
          if (group.getType() == C.TRACK_TYPE_TEXT) {
            entry.put("index", textIndex++);
            text.put(entry);
          } else if (group.getType() == C.TRACK_TYPE_AUDIO) {
            entry.put("index", audioIndex++);
            audio.put(entry);
          }
        } catch (JSONException ignored) {
          /* primitives only */
        }
      }
    }
    JSONObject out = new JSONObject();
    try {
      out.put("audio", audio);
      out.put("text", text);
    } catch (JSONException ignored) {
      /* primitives only */
    }
    return out;
  }

  public JSONObject selectTrack(String type, int index) {
    int trackType = "audio".equals(type) ? C.TRACK_TYPE_AUDIO : C.TRACK_TYPE_TEXT;
    TrackSelectionParameters.Builder builder = player.getTrackSelectionParameters().buildUpon();
    builder.clearOverridesOfType(trackType);
    if (index < 0) {
      builder.setTrackTypeDisabled(trackType, true);
    } else {
      builder.setTrackTypeDisabled(trackType, false);
      List<TrackGroup> groups = new ArrayList<>();
      Tracks tracks = player.getCurrentTracks();
      for (Tracks.Group group : tracks.getGroups()) {
        if (group.getType() == trackType) groups.add(group.getMediaTrackGroup());
      }
      int remaining = index;
      for (TrackGroup group : groups) {
        if (remaining < group.length) {
          builder.setOverrideForType(new TrackSelectionOverride(group, remaining));
          break;
        }
        remaining -= group.length;
      }
    }
    player.setTrackSelectionParameters(builder.build());
    emit();
    return getTracks();
  }

  public void hide() {
    visible = false;
    handler.removeCallbacks(ticker);
    tickerRunning = false;
    cancelWatchdog();
    try {
      player.pause();
      player.stop();
      player.clearMediaItems();
    } catch (Exception error) {
      Diagnostics.log(activity, "video", "could not stop the video player", error);
    }
    if (container != null && host != null) {
      host.removeView(container);
    }
    if (playerView != null) {
      playerView.setPlayer(null);
    }
    container = null;
    playerView = null;
    host = null;
    playableUri = null;
    lastError = null;
    lastErrorDetail = null;
    fallbackAttempted = false;
    softwareFallback = false;
    audioFallbackAttempted = false;
    audioDisabled = false;
    detectedMime = null;
    applyKeepScreenOn(false);
    unlockOrientation();
    emit();
  }

  public void release() {
    hide();
    try {
      player.removeListener(this);
      player.release();
    } catch (Exception error) {
      Diagnostics.log(activity, "video", "player release failed", error);
    }
  }

  // ---------------------------------------------------------------- error handling

  private void fail(String code, String detail) {
    cancelWatchdog();
    lastError = code;
    lastErrorDetail = detail;
    Diagnostics.log(activity, "video", "Failure " + code + " for " + MediaUris.describe(playableUri == null ? currentUri : playableUri) + ": " + detail);
    emit();
  }

  private static String describe(Throwable error) {
    String message = error.getMessage();
    return error.getClass().getSimpleName() + (message == null || message.isEmpty() ? "" : ": " + message);
  }

  private static boolean isDecoderFailure(int errorCode) {
    switch (errorCode) {
      case PlaybackException.ERROR_CODE_DECODER_INIT_FAILED:
      case PlaybackException.ERROR_CODE_DECODER_QUERY_FAILED:
      case PlaybackException.ERROR_CODE_DECODING_FAILED:
      case PlaybackException.ERROR_CODE_DECODING_FORMAT_EXCEEDS_CAPABILITIES:
      case PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED:
        return true;
      default:
        return false;
    }
  }

  private static String causeChain(Throwable error) {
    StringBuilder out = new StringBuilder();
    Throwable current = error;
    int depth = 0;
    while (current != null && depth < 4) {
      if (depth > 0) out.append(" <- ");
      out.append(current.getClass().getSimpleName());
      if (current.getMessage() != null) out.append(": ").append(current.getMessage());
      Throwable next = current.getCause();
      if (next == current) break;
      current = next;
      depth += 1;
    }
    return out.toString();
  }

  @Override
  public void onIsPlayingChanged(boolean isPlaying) {
    emit();
  }

  @Override
  public void onPlaybackStateChanged(int playbackState) {
    if (playbackState == Player.STATE_READY) {
      lastError = null;
      lastErrorDetail = null;
      cancelWatchdog();
      startTicker();
    }
    emit();
  }

  @Override
  public void onPlayerError(PlaybackException error) {
    int code = error.errorCode;
    String name = error.getErrorCodeName();
    String detail = causeChain(error);
    Diagnostics.log(
      activity,
      "video",
      "PlaybackException code=" + code + " (" + name + ") uri=" + MediaUris.describe(playableUri)
        + " mime=" + detectedMime + " software=" + softwareFallback + " detail=" + detail,
      error
    );
    if (isDecoderFailure(code) && !fallbackAttempted) {
      retryWithSoftwareDecoders(name, detail);
      return;
    }
    // A file whose *audio* codec is unsupported (AC3, DTS, TrueHD in MP4/MKV are common) fails the
    // whole playback even when the video decodes fine. Playing it silently beats refusing it.
    if ((isDecoderFailure(code) || isAudioTrackFailure(code)) && !audioFallbackAttempted && hasVideoTrack()) {
      retryWithoutAudio(name, detail);
      return;
    }
    fail(name, buildUserDetail(code, name, detail));
  }

  private boolean hasVideoTrack() {
    try {
      for (Tracks.Group group : player.getCurrentTracks().getGroups()) {
        if (group.getType() == C.TRACK_TYPE_VIDEO) return true;
      }
    } catch (Exception error) {
      Diagnostics.log(activity, "video", "could not inspect tracks", error);
    }
    return false;
  }

  private static boolean isAudioTrackFailure(int errorCode) {
    return errorCode == PlaybackException.ERROR_CODE_AUDIO_TRACK_INIT_FAILED
      || errorCode == PlaybackException.ERROR_CODE_AUDIO_TRACK_WRITE_FAILED;
  }

  /**
   * Rebuilds the current item with the audio track disabled. ExoPlayer disables the failing
   * renderer's stream and keeps video playback alive; the UI is told so it can say there is no
   * sound instead of showing a decoding error for a perfectly watchable video.
   */
  private void retryWithoutAudio(String name, String detail) {
    audioFallbackAttempted = true;
    audioDisabled = true;
    long position = Math.max(0, player.getCurrentPosition());
    Diagnostics.log(
      activity,
      "video",
      "Retrying without the audio track after " + name + ": " + detail
    );
    handler.post(() -> {
      try {
        player.setTrackSelectionParameters(
          player.getTrackSelectionParameters().buildUpon().setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, true).build()
        );
        player.prepare();
        if (position > 0) player.seekTo(position);
        player.setPlayWhenReady(true);
        scheduleWatchdog();
        emit();
      } catch (Exception error) {
        Diagnostics.log(activity, "video", "silent playback fallback failed", error);
        fail("AUDIO_FALLBACK_FAILED", describe(error));
      }
    });
  }

  private String buildUserDetail(int code, String name, String detail) {
    String suffix = code == PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED
      || code == PlaybackException.ERROR_CODE_DECODER_QUERY_FAILED
        ? "no decoder for this format on this device"
        : "decoder could not start this stream";
    return name + " (" + code + ") — " + suffix + ". " + detail;
  }

  /**
   * Hardware decoders reject plenty of valid files. Rebuilding the player with software codecs
   * first fixes the common cases and is always preferable to failing outright.
   */
  private void retryWithSoftwareDecoders(String name, String detail) {
    fallbackAttempted = true;
    long position = Math.max(0, player.getCurrentPosition());
    boolean wasPlaying = player.getPlayWhenReady();
    Diagnostics.log(activity, "video", "Retrying with software decoders after " + name + ": " + detail);
    softwareFallback = true;
    handler.post(() -> {
      try {
        player.removeListener(this);
        player.release();
      } catch (Exception releaseError) {
        Diagnostics.log(activity, "video", "old player release failed", releaseError);
      }
      player = buildPlayer(true);
      player.addListener(this);
      if (playerView != null) playerView.setPlayer(player);
      try {
        if (playableUri == null || MediaUris.normalize(currentUri).isEmpty()) {
          open(position, wasPlaying);
        } else {
          player.setMediaItem(buildMediaItem(Uri.parse(playableUri)));
          player.prepare();
          player.seekTo(position);
          player.setPlayWhenReady(wasPlaying);
        }
        scheduleWatchdog();
        emit();
      } catch (Exception error) {
        Diagnostics.log(activity, "video", "software fallback failed", error);
        fail("SOFTWARE_FALLBACK_FAILED", describe(error));
      }
    });
  }

  @Override
  public void onTracksChanged(Tracks tracks) {
    emit();
  }

  /** Orders decoder lists so software codecs are tried before hardware ones. */
  private static final class SoftwareFirstSelector implements MediaCodecSelector {
    @Override
    public List<MediaCodecInfo> getDecoderInfos(
      String mimeType,
      boolean requiresSecureDecoder,
      boolean requiresTunnelingDecoder
    ) throws MediaCodecUtil.DecoderQueryException {
      List<MediaCodecInfo> all = MediaCodecUtil.getDecoderInfos(
        mimeType,
        requiresSecureDecoder,
        requiresTunnelingDecoder
      );
      List<MediaCodecInfo> software = new ArrayList<>(all.size());
      List<MediaCodecInfo> hardware = new ArrayList<>(all.size());
      for (MediaCodecInfo info : all) {
        if (info.softwareOnly) software.add(info);
        else hardware.add(info);
      }
      software.addAll(hardware);
      return software;
    }
  }
}
