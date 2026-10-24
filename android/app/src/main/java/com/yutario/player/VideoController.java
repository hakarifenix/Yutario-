package com.yutario.player;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.annotation.Nullable;
import androidx.coordinatorlayout.widget.CoordinatorLayout;
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
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Dedicated native video engine. The PlayerView sits behind the transparent WebView so the
 * React controls stay on top while decoding happens in ExoPlayer.
 */
public final class VideoController implements Player.Listener {

  public interface StateListener {
    void onVideoState(JSONObject state);
  }

  private final Activity activity;
  private final WebView webView;
  private final ExoPlayer player;
  private final Handler handler = new Handler(Looper.getMainLooper());

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
  private int originalOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
  @Nullable
  private String currentUri;
  @Nullable
  private String currentTitle;
  @Nullable
  private String subtitleUri;
  @Nullable
  private String subtitleName;
  @Nullable
  private String lastError;
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

  public VideoController(Activity activity, WebView webView) {
    this.activity = activity;
    this.webView = webView;
    this.player = new ExoPlayer.Builder(activity).build();
    this.player.addListener(this);
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
      android.util.Log.w("YutarioVideo", "video state emit failed", error);
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
      out.put("visible", visible);
    } catch (JSONException ignored) {
      /* primitives only */
    }
    return out;
  }

  private void ensureViews() {
    if (container != null) return;
    ViewGroup parent = (ViewGroup) webView.getParent();
    if (parent == null) throw new IllegalStateException("WebView is not attached");
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
      if (transparent) {
        webView.setBackgroundColor(Color.TRANSPARENT);
      } else {
        webView.setBackgroundColor(Color.parseColor("#0a0b12"));
      }
    } catch (Exception ignored) {
      /* WebView may be mid-teardown. */
    }
  }

  public JSONObject show(JSONObject options) {
    ensureViews();
    String uri = options.optString("uri", "");
    if (uri.isEmpty()) throw new IllegalArgumentException("A media uri is required");
    currentUri = uri;
    currentTitle = options.optString("title", "");
    subtitleUri = options.optString("subtitleUri", null);
    subtitleName = options.optString("subtitleName", null);
    speed = options.optDouble("speed", 1.0) > 0 ? (float) options.optDouble("speed", 1.0) : 1f;
    long startPosition = Math.max(0, options.optLong("startPositionMs", 0));
    lastError = null;
    visible = true;
    player.setMediaItem(buildMediaItem());
    player.prepare();
    player.setPlaybackSpeed(speed);
    if (startPosition > 0) player.seekTo(startPosition);
    player.setPlayWhenReady(options.optBoolean("autoPlay", true));
    applyKeepScreenOn(keepScreenOn);
    startTicker();
    emit();
    return state();
  }

  private MediaItem buildMediaItem() {
    if (currentUri == null) throw new IllegalStateException("No video selected");
    MediaMetadata metadata = new MediaMetadata.Builder()
      .setTitle(currentTitle == null ? "" : currentTitle)
      .setIsPlayable(true)
      .setIsBrowsable(false)
      .build();
    MediaItem.Builder builder = new MediaItem.Builder()
      .setUri(currentUri)
      .setMediaMetadata(metadata);
    if (subtitleUri != null && !subtitleUri.isEmpty()) {
      MediaItem.SubtitleConfiguration subtitle = new MediaItem.SubtitleConfiguration.Builder(Uri.parse(subtitleUri))
        .setMimeType(subtitleMimeType(subtitleName))
        .setLanguage("und")
        .setLabel(subtitleName == null ? "External subtitles" : subtitleName)
        .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
        .build();
      builder.setSubtitleConfigurations(Collections.singletonList(subtitle));
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
      setWebViewTransparent(!above);
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
      if (player.getPlaybackState() == Player.STATE_IDLE) player.prepare();
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
    if (currentUri != null) {
      player.setMediaItem(buildMediaItem());
      player.prepare();
      player.seekTo(position);
      player.setPlayWhenReady(playWhenReady);
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
    player.pause();
    handler.removeCallbacks(ticker);
    tickerRunning = false;
    if (container != null && host != null) {
      host.removeView(container);
    }
    if (playerView != null) {
      playerView.setPlayer(null);
    }
    container = null;
    playerView = null;
    host = null;
    setWebViewTransparent(false);
    applyKeepScreenOn(false);
    unlockOrientation();
    emit();
  }

  public void release() {
    hide();
    player.removeListener(this);
    player.release();
  }

  @Override
  public void onIsPlayingChanged(boolean isPlaying) {
    emit();
  }

  @Override
  public void onPlaybackStateChanged(int playbackState) {
    if (playbackState == Player.STATE_READY) {
      lastError = null;
      startTicker();
    }
    emit();
  }

  @Override
  public void onPlayerError(PlaybackException error) {
    lastError = error.getErrorCodeName() + (error.getMessage() == null ? "" : ": " + error.getMessage());
    android.util.Log.w("YutarioVideo", "video error " + lastError, error);
    emit();
  }

  @Override
  public void onTracksChanged(Tracks tracks) {
    emit();
  }
}
