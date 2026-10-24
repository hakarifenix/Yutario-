package com.yutario.player;

import android.Manifest;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.webkit.WebView;
import androidx.activity.result.ActivityResult;
import androidx.annotation.Nullable;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(
  name = "Yutario",
  permissions = {
    @Permission(
      alias = "media",
      strings = { Manifest.permission.READ_MEDIA_AUDIO, Manifest.permission.READ_MEDIA_VIDEO }
    ),
    @Permission(alias = "mediaLegacy", strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
  }
)
public class YutarioPlugin extends Plugin implements PlaybackController.StateListener, VideoController.StateListener {

  private static WeakReference<YutarioPlugin> currentRef;
  private static final List<Uri> pendingUris = new ArrayList<>();

  private final Handler mainHandler = new Handler(Looper.getMainLooper());
  private final ExecutorService io = Executors.newSingleThreadExecutor();
  private PlaybackController playback;
  @Nullable
  private VideoController video;

  @Override
  public void load() {
    currentRef = new WeakReference<>(this);
    playback = PlaybackController.getInstance(getContext());
    playback.setStateListener(this);
    // Pending share intents are collected by the web layer through getPendingShare so a cold
    // start cannot lose them before the UI subscribes.
  }

  @Override
  protected void handleOnDestroy() {
    if (playback != null) playback.setStateListener(null);
    if (video != null) {
      video.setStateListener(null);
      video.release();
      video = null;
    }
    if (currentRef != null && currentRef.get() == this) currentRef = null;
    super.handleOnDestroy();
  }

  @Override
  protected void handleOnPause() {
    if (video != null) {
      video.setPaused(true);
    }
    super.handleOnPause();
  }

  private static JSObject toJsObject(JSONObject object) {
    try {
      return JSObject.fromJSONObject(object);
    } catch (JSONException error) {
      return new JSObject();
    }
  }

  private void resolve(PluginCall call, JSONObject object) {
    call.resolve(toJsObject(object));
  }

  private void resolve(PluginCall call, JSObject object) {
    call.resolve(object);
  }

  // ---------------------------------------------------------------- permissions

  @PluginMethod
  public void getLibraryPermissionStatus(PluginCall call) {
    resolve(call, MediaLibrary.permissionStatus(getContext()));
  }

  @PluginMethod
  public void requestLibraryPermission(PluginCall call) {
    String alias = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "media" : "mediaLegacy";
    requestPermissionForAlias(alias, call, "mediaPermissionCallback");
  }

  @PermissionCallback
  private void mediaPermissionCallback(PluginCall call) {
    MediaLibrary.markPermissionRequested(getContext());
    resolve(call, MediaLibrary.permissionStatus(getContext()));
  }

  @PluginMethod
  public void requestNotificationPermission(PluginCall call) {
    JSObject result = new JSObject();
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      result.put("granted", true);
      call.resolve(result);
      return;
    }
    if (MediaLibrary.hasNotificationPermission(getContext())) {
      result.put("granted", true);
      call.resolve(result);
      return;
    }
    requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
  }

  @PermissionCallback
  private void notificationPermissionCallback(PluginCall call) {
    JSObject result = new JSObject();
    result.put("granted", MediaLibrary.hasNotificationPermission(getContext()));
    call.resolve(result);
  }

  // ---------------------------------------------------------------- library

  @PluginMethod
  public void scanMedia(PluginCall call) {
    final String kind = call.getString("kind", "audio");
    final int offset = Math.max(0, call.getInt("offset", 0));
    final int limit = Math.max(1, Math.min(1000, call.getInt("limit", 400)));
    final String sort = call.getString("sort", "date");
    final boolean reverse = Boolean.TRUE.equals(call.getBoolean("reverse", Boolean.TRUE));
    final Context context = getContext();
    io.execute(() -> {
      try {
        final JSONObject result = MediaLibrary.scan(context, kind, offset, limit, sort, reverse);
        mainHandler.post(() -> resolve(call, result));
      } catch (Exception error) {
        mainHandler.post(() -> call.reject("Scan failed: " + error.getMessage(), error));
      }
    });
  }

  @PluginMethod
  public void pickMedia(PluginCall call) {
    String kind = call.getString("kind", "audio");
    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    if ("audio".equals(kind)) {
      intent.setType("audio/*");
      intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "audio/*", "application/ogg" });
    } else if ("video".equals(kind)) {
      intent.setType("video/*");
    } else {
      intent.setType("*/*");
      intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "audio/*", "video/*" });
    }
    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
    startActivityForResult(call, intent, "pickMediaResult");
  }

  @ActivityCallback
  private void pickMediaResult(PluginCall call, ActivityResult result) {
    if (call == null) return;
    if (result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null) {
      JSObject empty = new JSObject();
      empty.put("items", new JSArray());
      empty.put("total", 0);
      call.resolve(empty);
      return;
    }
    List<Uri> uris = extractUris(result.getData());
    int flags = result.getData().getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION;
    for (Uri uri : uris) {
      try {
        getContext().getContentResolver().takePersistableUriPermission(uri, flags);
      } catch (Exception ignored) {
        /* Provider may not offer persistable grants. */
      }
    }
    JSONArray items = MediaLibrary.buildItemsForUris(getContext(), uris);
    JSObject out = new JSObject();
    out.put("items", JSArray.from(items));
    out.put("total", items.length());
    call.resolve(out);
  }

  @PluginMethod
  public void pickSubtitle(PluginCall call) {
    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType("*/*");
    intent.putExtra(
      Intent.EXTRA_MIME_TYPES,
      new String[] { "application/x-subrip", "text/plain", "text/vtt", "text/x-ssa", "application/octet-stream", "text/*" }
    );
    startActivityForResult(call, intent, "pickSubtitleResult");
  }

  @ActivityCallback
  private void pickSubtitleResult(PluginCall call, ActivityResult result) {
    if (call == null) return;
    if (result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
      call.resolve();
      return;
    }
    Uri uri = result.getData().getData();
    int flags = result.getData().getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION;
    try {
      getContext().getContentResolver().takePersistableUriPermission(uri, flags);
    } catch (Exception ignored) {
      /* ignore */
    }
    String name = null;
    try (android.database.Cursor cursor = getContext().getContentResolver().query(
      uri,
      new String[] { android.provider.OpenableColumns.DISPLAY_NAME },
      null,
      null,
      null
    )) {
      if (cursor != null && cursor.moveToFirst()) {
        int index = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
        if (index >= 0) name = cursor.getString(index);
      }
    } catch (Exception ignored) {
      /* ignore */
    }
    JSObject out = new JSObject();
    out.put("uri", uri.toString());
    out.put("name", name == null ? "subtitle.srt" : name);
    call.resolve(out);
  }

  @PluginMethod
  public void getArtwork(PluginCall call) {
    String uriString = call.getString("uri");
    int size = Math.max(64, Math.min(1024, call.getInt("size", 320)));
    if (uriString == null) {
      call.reject("uri is required");
      return;
    }
    final Context context = getContext();
    final Uri uri = Uri.parse(uriString);
    io.execute(() -> {
      String dataUrl = MediaLibrary.artworkDataUrl(context, uri, size);
      JSObject out = new JSObject();
      out.put("dataUrl", dataUrl);
      mainHandler.post(() -> call.resolve(out));
    });
  }

  @PluginMethod
  public void getFileInfo(PluginCall call) {
    String uriString = call.getString("uri");
    if (uriString == null) {
      call.reject("uri is required");
      return;
    }
    final Context context = getContext();
    final Uri uri = Uri.parse(uriString);
    io.execute(() -> {
      JSONObject info = MediaLibrary.fileInfo(context, uri);
      mainHandler.post(() -> resolve(call, info));
    });
  }

  @PluginMethod
  public void shareFile(PluginCall call) {
    String uriString = call.getString("uri");
    String mime = call.getString("mimeType", "*/*");
    String title = call.getString("title", "Yutario");
    if (uriString == null) {
      call.reject("uri is required");
      return;
    }
    try {
      Uri uri = Uri.parse(uriString);
      Intent intent = new Intent(Intent.ACTION_SEND);
      intent.setType(mime == null || mime.isEmpty() ? "*/*" : mime);
      intent.putExtra(Intent.EXTRA_STREAM, uri);
      intent.setClipData(ClipData.newRawUri(title, uri));
      intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      getActivity().startActivity(Intent.createChooser(intent, title));
      call.resolve();
    } catch (Exception error) {
      call.reject("Could not share file: " + error.getMessage());
    }
  }

  @PluginMethod
  public void getPendingShare(PluginCall call) {
    call.resolve(pendingSharePayload());
  }

  public static void deliverIntent(Context context, Intent intent) {
    List<Uri> uris = extractUris(intent);
    if (uris.isEmpty()) return;
    synchronized (pendingUris) {
      pendingUris.addAll(uris);
    }
    YutarioPlugin plugin = currentRef == null ? null : currentRef.get();
    if (plugin != null) {
      plugin.flushPendingShare();
    }
  }

  private static List<Uri> extractUris(Intent intent) {
    List<Uri> uris = new ArrayList<>();
    if (intent == null) return uris;
    ClipData clip = intent.getClipData();
    if (clip != null) {
      for (int i = 0; i < clip.getItemCount(); i++) {
        Uri uri = clip.getItemAt(i).getUri();
        if (uri != null) uris.add(uri);
      }
    }
    if (uris.isEmpty()) {
      Uri data = intent.getData();
      if (data != null) uris.add(data);
    }
    if (uris.isEmpty() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      android.os.Parcelable parcelable = intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class);
      if (parcelable instanceof Uri) uris.add((Uri) parcelable);
    } else if (uris.isEmpty()) {
      Object extra = intent.getParcelableExtra(Intent.EXTRA_STREAM);
      if (extra instanceof Uri) uris.add((Uri) extra);
    }
    for (Uri uri : uris) {
      try {
        currentContextGrant(uri);
      } catch (Exception ignored) {
        /* ignore */
      }
    }
    return uris;
  }

  private static void currentContextGrant(Uri uri) {
    YutarioPlugin plugin = currentRef == null ? null : currentRef.get();
    if (plugin == null) return;
    try {
      plugin.getContext().getContentResolver().takePersistableUriPermission(
        uri,
        Intent.FLAG_GRANT_READ_URI_PERMISSION
      );
    } catch (Exception ignored) {
      /* Share grants are temporary and may not be persistable. */
    }
  }

  private JSObject pendingSharePayload() {
    List<Uri> copy;
    synchronized (pendingUris) {
      copy = new ArrayList<>(pendingUris);
      pendingUris.clear();
    }
    JSONArray items = MediaLibrary.buildItemsForUris(getContext(), copy);
    JSObject out = new JSObject();
    out.put("items", JSArray.from(items));
    return out;
  }

  private void flushPendingShare() {
    JSObject payload = pendingSharePayload();
    try {
      if (payload.getJSONArray("items") != null && payload.getJSONArray("items").length() > 0) {
        notifyListeners("shareIntent", payload);
      }
    } catch (JSONException ignored) {
      /* no items */
    }
  }

  // ---------------------------------------------------------------- audio playback

  private void ensureServiceStarted() {
    try {
      getContext().startService(new Intent(getContext(), PlaybackService.class));
    } catch (Exception error) {
      android.util.Log.w("YutarioPlugin", "Could not start playback service", error);
    }
  }

  @PluginMethod
  public void play(PluginCall call) {
    ensureServiceStarted();
    JSArray items = call.getArray("items", new JSArray());
    int startIndex = call.getInt("startIndex", 0);
    long startPosition = call.getLong("startPositionMs", 0L);
    boolean autoPlay = !Boolean.FALSE.equals(call.getBoolean("autoPlay", Boolean.TRUE));
    resolve(call, playback.playQueue(items, startIndex, startPosition, autoPlay));
  }

  @PluginMethod
  public void enqueue(PluginCall call) {
    resolve(call, playback.enqueue(call.getArray("items", new JSArray()), call.getString("mode", "end")));
  }

  @PluginMethod
  public void removeFromQueue(PluginCall call) {
    resolve(call, playback.removeFromQueue(call.getInt("index", -1)));
  }

  @PluginMethod
  public void moveQueueItem(PluginCall call) {
    resolve(call, playback.moveQueueItem(call.getInt("from", -1), call.getInt("to", -1)));
  }

  @PluginMethod
  public void clearQueue(PluginCall call) {
    resolve(call, playback.clearQueue());
  }

  @PluginMethod
  public void playPause(PluginCall call) {
    ensureServiceStarted();
    resolve(call, playback.playPause());
  }

  @PluginMethod
  public void resume(PluginCall call) {
    ensureServiceStarted();
    resolve(call, playback.play());
  }

  @PluginMethod
  public void pause(PluginCall call) {
    resolve(call, playback.pause());
  }

  @PluginMethod
  public void next(PluginCall call) {
    ensureServiceStarted();
    resolve(call, playback.next());
  }

  @PluginMethod
  public void previous(PluginCall call) {
    resolve(call, playback.previous());
  }

  @PluginMethod
  public void seek(PluginCall call) {
    resolve(call, playback.seek(call.getLong("positionMs", 0L)));
  }

  @PluginMethod
  public void setRepeatMode(PluginCall call) {
    resolve(call, playback.setRepeatMode(call.getString("mode", "off")));
  }

  @PluginMethod
  public void setShuffle(PluginCall call) {
    resolve(call, playback.setShuffle(Boolean.TRUE.equals(call.getBoolean("enabled", Boolean.FALSE))));
  }

  @PluginMethod
  public void setSpeed(PluginCall call) {
    resolve(call, playback.setSpeed(floatValue(call.getDouble("speed", 1.0), 1f)));
  }

  @PluginMethod
  public void stop(PluginCall call) {
    playback.clearQueue();
    call.resolve();
  }

  @PluginMethod
  public void getPlayerState(PluginCall call) {
    resolve(call, playback.snapshot());
  }

  @PluginMethod
  public void setSleepTimer(PluginCall call) {
    Integer minutes = call.getInt("minutes", null);
    boolean afterTrack = Boolean.TRUE.equals(call.getBoolean("stopAfterTrack", Boolean.FALSE));
    playback.setSleepTimer(minutes, afterTrack);
    resolve(call, playback.snapshot());
  }

  // ---------------------------------------------------------------- audio effects

  @PluginMethod
  public void getEqualizer(PluginCall call) {
    resolve(call, playback.getEffects().state());
  }

  @PluginMethod
  public void setEqualizer(PluginCall call) {
    Boolean enabled = call.getBoolean("enabled", null);
    Integer preset = call.getInt("preset", null);
    JSONArray bands = call.getArray("bandLevels", null);
    Integer bass = call.getInt("bassBoost", null);
    Integer virtualizer = call.getInt("virtualizer", null);
    resolve(call, playback.getEffects().apply(enabled, preset, bands, bass, virtualizer));
  }

  // ---------------------------------------------------------------- video

  private VideoController ensureVideo() {
    if (video == null) {
      WebView webView = getBridge().getWebView();
      video = new VideoController(getActivity(), webView);
      video.setStateListener(this);
    }
    return video;
  }

  @PluginMethod
  public void showVideo(PluginCall call) {
    try {
      JSONObject options = new JSONObject();
      options.put("uri", call.getString("uri", ""));
      options.put("title", call.getString("title", ""));
      options.put("startPositionMs", call.getLong("startPositionMs", 0L));
      options.put("speed", call.getDouble("speed", 1.0));
      options.put("subtitleUri", call.getString("subtitleUri", null));
      options.put("subtitleName", call.getString("subtitleName", null));
      options.put("autoPlay", !Boolean.FALSE.equals(call.getBoolean("autoPlay", Boolean.TRUE)));
      resolve(call, ensureVideo().show(options));
    } catch (Exception error) {
      call.reject("Could not start video: " + error.getMessage(), error);
    }
  }

  @PluginMethod
  public void hideVideo(PluginCall call) {
    if (video != null) video.hide();
    call.resolve();
  }

  private static float floatValue(@Nullable Double value, float fallback) {
    return value == null ? fallback : value.floatValue();
  }

  @PluginMethod
  public void setVideoBounds(PluginCall call) {
    if (video != null) {
      video.setBounds(
        floatValue(call.getDouble("x", 0.0), 0f),
        floatValue(call.getDouble("y", 0.0), 0f),
        floatValue(call.getDouble("width", 0.0), 0f),
        floatValue(call.getDouble("height", 0.0), 0f)
      );
    }
    call.resolve();
  }

  @PluginMethod
  public void setVideoResizeMode(PluginCall call) {
    if (video != null) video.setResizeMode(call.getString("mode", "fit"));
    call.resolve();
  }

  @PluginMethod
  public void setVideoOverlay(PluginCall call) {
    if (video == null) {
      call.resolve(new JSObject());
      return;
    }
    boolean above = Boolean.TRUE.equals(call.getBoolean("aboveWebView", Boolean.FALSE));
    boolean controls = Boolean.TRUE.equals(call.getBoolean("nativeControls", Boolean.FALSE));
    resolve(call, video.setOverlay(above, controls));
  }

  @PluginMethod
  public void setVideoSpeed(PluginCall call) {
    if (video == null) {
      call.reject("No video session");
      return;
    }
    resolve(call, video.setSpeed(floatValue(call.getDouble("speed", 1.0), 1f)));
  }

  @PluginMethod
  public void setVideoPaused(PluginCall call) {
    if (video == null) {
      call.reject("No video session");
      return;
    }
    resolve(call, video.setPaused(Boolean.TRUE.equals(call.getBoolean("paused", Boolean.TRUE))));
  }

  @PluginMethod
  public void seekVideo(PluginCall call) {
    if (video == null) {
      call.reject("No video session");
      return;
    }
    resolve(call, video.seek(call.getLong("positionMs", 0L)));
  }

  @PluginMethod
  public void setVideoSubtitle(PluginCall call) {
    if (video == null) {
      call.reject("No video session");
      return;
    }
    resolve(call, video.setSubtitle(call.getString("uri", null), call.getString("name", null)));
  }

  @PluginMethod
  public void setSubtitleSize(PluginCall call) {
    if (video != null) video.setSubtitleSize(floatValue(call.getDouble("fraction", 0.06), 0.06f));
    call.resolve();
  }

  @PluginMethod
  public void getVideoTracks(PluginCall call) {
    if (video == null) {
      resolve(call, new JSObject());
      return;
    }
    resolve(call, video.getTracks());
  }

  @PluginMethod
  public void selectVideoTrack(PluginCall call) {
    if (video == null) {
      call.reject("No video session");
      return;
    }
    resolve(call, video.selectTrack(call.getString("type", "text"), call.getInt("index", -1)));
  }

  @PluginMethod
  public void setKeepScreenOn(PluginCall call) {
    boolean on = Boolean.TRUE.equals(call.getBoolean("on", Boolean.TRUE));
    if (video != null) {
      video.setKeepScreenOn(on);
    } else if (getActivity() != null) {
      getActivity().runOnUiThread(() -> {
        if (on) getActivity().getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else getActivity().getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
      });
    }
    call.resolve();
  }

  @PluginMethod
  public void setOrientation(PluginCall call) {
    String orientation = call.getString("orientation", "unlocked");
    if (getActivity() == null) {
      call.reject("No activity");
      return;
    }
    int requested;
    if ("landscape".equals(orientation)) {
      requested = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE;
    } else if ("portrait".equals(orientation)) {
      requested = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
    } else {
      requested = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
    }
    getActivity().setRequestedOrientation(requested);
    call.resolve();
  }

  @PluginMethod
  public void getCapabilities(PluginCall call) {
    JSObject out = new JSObject();
    out.put("nativePlayback", true);
    out.put("backgroundAudio", true);
    out.put("mediaSession", true);
    out.put("equalizer", true);
    out.put("externalSubtitles", true);
    out.put("embeddedSubtitles", true);
    out.put("subtitleOffset", false);
    out.put("pictureInPicture", false);
    out.put("videoOverlay", true);
    call.resolve(out);
  }

  @PluginMethod
  public void openAppSettings(PluginCall call) {
    try {
      Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
      intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
      getActivity().startActivity(intent);
      call.resolve();
    } catch (Exception error) {
      call.reject("Could not open settings", error);
    }
  }

  // ---------------------------------------------------------------- state listeners

  @Override
  public void onState(JSONObject state) {
    if (getBridge() == null) return;
    notifyListeners("playerState", toJsObject(state));
  }

  @Override
  public void onVideoState(JSONObject state) {
    if (getBridge() == null) return;
    notifyListeners("videoState", toJsObject(state));
  }
}
