package com.yutario.player;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.common.Player;
import androidx.media3.common.Timeline;
import androidx.media3.exoplayer.ExoPlayer;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Single authoritative audio playback engine. The queue lives in ExoPlayer so that
 * notification, lock-screen and headset actions stay in sync with the UI.
 */
public final class PlaybackController implements Player.Listener {

  public interface StateListener {
    void onState(JSONObject state);
  }

  private static PlaybackController instance;

  private final Context context;
  private final ExoPlayer player;
  private final Handler handler = new Handler(Looper.getMainLooper());
  private final AudioEffectsManager effects;

  @Nullable
  private StateListener stateListener;

  @Nullable
  private android.os.CountDownTimer sleepTimer;
  private long sleepEndsAt = 0L;
  private boolean stopAfterTrack = false;

  @Nullable
  private String lastError;
  private int queueVersion = 0;
  private int lastEmittedQueueVersion = -1;
  private boolean tickerRunning = false;
  private int audioSessionId = C.AUDIO_SESSION_ID_UNSET;

  private final Runnable ticker = new Runnable() {
    @Override
    public void run() {
      emit();
      if (player.isPlaying()) {
        handler.postDelayed(this, 500);
      } else {
        tickerRunning = false;
      }
    }
  };

  private PlaybackController(Context ctx) {
    this.context = ctx.getApplicationContext();
    AudioAttributes attributes = new AudioAttributes.Builder()
      .setUsage(C.USAGE_MEDIA)
      .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
      .build();
    this.player = new ExoPlayer.Builder(this.context)
      .setAudioAttributes(attributes, true)
      .setHandleAudioBecomingNoisy(true)
      .setWakeMode(C.WAKE_MODE_LOCAL)
      .build();
    this.player.addListener(this);
    this.effects = new AudioEffectsManager();
  }

  public static synchronized PlaybackController getInstance(Context context) {
    if (instance == null) {
      instance = new PlaybackController(context);
    }
    return instance;
  }

  public ExoPlayer getPlayer() {
    return player;
  }

  public AudioEffectsManager getEffects() {
    return effects;
  }

  public void setStateListener(@Nullable StateListener listener) {
    this.stateListener = listener;
    if (listener != null) {
      emit();
    }
  }

  private void emit() {
    StateListener listener = stateListener;
    if (listener == null) return;
    try {
      listener.onState(snapshot());
    } catch (Exception error) {
      android.util.Log.w("YutarioPlayback", "state emit failed", error);
    }
  }

  private void startTicker() {
    if (tickerRunning) return;
    tickerRunning = true;
    handler.post(ticker);
  }

  private void bumpQueue() {
    queueVersion += 1;
  }

  public JSONObject snapshot() {
    JSONObject out = new JSONObject();
    try {
      out.put("index", player.getCurrentMediaItemIndex());
      out.put("isPlaying", player.isPlaying());
      out.put("playWhenReady", player.getPlayWhenReady());
      out.put("isBuffering", player.getPlaybackState() == Player.STATE_BUFFERING);
      out.put("positionMs", Math.max(0, player.getCurrentPosition()));
      long duration = player.getDuration();
      out.put("durationMs", duration == C.TIME_UNSET ? 0 : Math.max(0, duration));
      out.put("bufferedMs", Math.max(0, player.getBufferedPosition()));
      out.put("repeat", repeatModeToKey(player.getRepeatMode()));
      out.put("shuffle", player.getShuffleModeEnabled());
      out.put("speed", player.getPlaybackParameters().speed);
      out.put("ended", player.getPlaybackState() == Player.STATE_ENDED);
      out.put("error", lastError == null ? JSONObject.NULL : lastError);
      out.put(
        "sleepTimerEndsAt",
        sleepEndsAt > 0 ? sleepEndsAt : JSONObject.NULL
      );
      out.put("stopAfterTrack", stopAfterTrack);
      if (queueVersion != lastEmittedQueueVersion) {
        JSONArray ids = new JSONArray();
        for (int i = 0; i < player.getMediaItemCount(); i++) {
          MediaItem item = player.getMediaItemAt(i);
          ids.put(item.mediaId);
        }
        out.put("queueIds", ids);
        lastEmittedQueueVersion = queueVersion;
      }
    } catch (JSONException error) {
      android.util.Log.w("YutarioPlayback", "snapshot failed", error);
    }
    return out;
  }

  private static String repeatModeToKey(int mode) {
    if (mode == Player.REPEAT_MODE_ONE) return "one";
    if (mode == Player.REPEAT_MODE_ALL) return "all";
    return "off";
  }

  private static int keyToRepeatMode(String key) {
    if ("one".equals(key)) return Player.REPEAT_MODE_ONE;
    if ("all".equals(key)) return Player.REPEAT_MODE_ALL;
    return Player.REPEAT_MODE_OFF;
  }

  private static MediaItem toMediaItem(JSONObject object) {
    String uri = object.optString("uri", "");
    String title = object.optString("title", "");
    String artist = object.optString("artist", "");
    String album = object.optString("album", "");
    MediaMetadata.Builder metadata = new MediaMetadata.Builder()
      .setTitle(title)
      .setIsPlayable(true)
      .setIsBrowsable(false);
    if (!artist.isEmpty()) metadata.setArtist(artist);
    if (!album.isEmpty()) metadata.setAlbumTitle(album);
    if (!uri.isEmpty()) metadata.setArtworkUri(Uri.parse(uri));
    return new MediaItem.Builder()
      .setMediaId(object.optString("id", uri))
      .setUri(uri)
      .setMediaMetadata(metadata.build())
      .build();
  }

  public static List<MediaItem> parseItems(JSONArray items) {
    List<MediaItem> result = new ArrayList<>();
    if (items == null) return result;
    for (int i = 0; i < items.length(); i++) {
      JSONObject object = items.optJSONObject(i);
      if (object == null) continue;
      String uri = object.optString("uri", "");
      if (uri.isEmpty()) continue;
      result.add(toMediaItem(object));
    }
    return result;
  }

  public JSONObject playQueue(JSONArray items, int startIndex, long startPositionMs, boolean autoPlay) {
    List<MediaItem> mediaItems = parseItems(items);
    lastError = null;
    if (mediaItems.isEmpty()) {
      player.clearMediaItems();
      player.setPlayWhenReady(false);
      bumpQueue();
      emit();
      return snapshot();
    }
    int index = Math.max(0, Math.min(startIndex, mediaItems.size() - 1));
    player.setMediaItems(mediaItems, index, Math.max(0, startPositionMs));
    player.prepare();
    player.setPlayWhenReady(autoPlay);
    bumpQueue();
    emit();
    return snapshot();
  }

  public JSONObject enqueue(JSONArray items, String mode) {
    List<MediaItem> mediaItems = parseItems(items);
    if (mediaItems.isEmpty()) return snapshot();
    if (player.getMediaItemCount() == 0) {
      player.setMediaItems(mediaItems, 0, 0L);
      player.prepare();
    } else if ("next".equals(mode)) {
      int insertAt = Math.min(player.getCurrentMediaItemIndex() + 1, player.getMediaItemCount());
      player.addMediaItems(insertAt, mediaItems);
    } else {
      player.addMediaItems(mediaItems);
    }
    bumpQueue();
    emit();
    return snapshot();
  }

  public JSONObject removeFromQueue(int index) {
    if (index >= 0 && index < player.getMediaItemCount()) {
      boolean wasCurrent = index == player.getCurrentMediaItemIndex();
      player.removeMediaItem(index);
      if (wasCurrent) {
        player.prepare();
      }
      bumpQueue();
      emit();
    }
    return snapshot();
  }

  public JSONObject moveQueueItem(int from, int to) {
    int count = player.getMediaItemCount();
    if (from >= 0 && from < count && to >= 0 && to < count) {
      player.moveMediaItem(from, to);
      bumpQueue();
      emit();
    }
    return snapshot();
  }

  public JSONObject clearQueue() {
    player.stop();
    player.clearMediaItems();
    cancelSleepTimer();
    lastError = null;
    bumpQueue();
    emit();
    return snapshot();
  }

  public JSONObject playPause() {
    player.setPlayWhenReady(!player.getPlayWhenReady());
    if (player.getPlaybackState() == Player.STATE_IDLE) {
      player.prepare();
    }
    emit();
    return snapshot();
  }

  public JSONObject play() {
    if (player.getMediaItemCount() > 0) {
      if (player.getPlaybackState() == Player.STATE_IDLE) player.prepare();
      player.play();
    }
    emit();
    return snapshot();
  }

  public JSONObject pause() {
    player.pause();
    emit();
    return snapshot();
  }

  public JSONObject next() {
    if (player.hasNextMediaItem()) {
      player.seekToNextMediaItem();
      player.play();
    }
    emit();
    return snapshot();
  }

  public JSONObject previous() {
    if (player.getCurrentPosition() > 3000) {
      player.seekTo(0);
    } else if (player.hasPreviousMediaItem()) {
      player.seekToPreviousMediaItem();
      player.play();
    } else {
      player.seekTo(0);
    }
    emit();
    return snapshot();
  }

  public JSONObject seek(long positionMs) {
    player.seekTo(Math.max(0, positionMs));
    emit();
    return snapshot();
  }

  public JSONObject setRepeatMode(String mode) {
    player.setRepeatMode(keyToRepeatMode(mode));
    emit();
    return snapshot();
  }

  public JSONObject setShuffle(boolean enabled) {
    player.setShuffleModeEnabled(enabled);
    emit();
    return snapshot();
  }

  public JSONObject setSpeed(float speed) {
    player.setPlaybackSpeed(Math.max(0.25f, Math.min(4f, speed)));
    emit();
    return snapshot();
  }

  public void setSleepTimer(@Nullable Integer minutes, boolean afterTrack) {
    cancelSleepTimer();
    stopAfterTrack = afterTrack;
    if (minutes != null && minutes > 0) {
      long millis = minutes * 60_000L;
      sleepEndsAt = System.currentTimeMillis() + millis;
      sleepTimer = new android.os.CountDownTimer(millis, 1000) {
        @Override
        public void onTick(long millisUntilFinished) {
          /* Countdown is derived from sleepEndsAt in the UI. */
        }

        @Override
        public void onFinish() {
          sleepEndsAt = 0L;
          player.pause();
          emit();
        }
      };
      sleepTimer.start();
    }
    emit();
  }

  private void cancelSleepTimer() {
    if (sleepTimer != null) {
      sleepTimer.cancel();
      sleepTimer = null;
    }
    sleepEndsAt = 0L;
    stopAfterTrack = false;
  }

  public void release() {
    cancelSleepTimer();
    handler.removeCallbacks(ticker);
    tickerRunning = false;
    effects.release();
    player.removeListener(this);
    player.release();
  }

  // Player.Listener

  @Override
  public void onIsPlayingChanged(boolean isPlaying) {
    if (isPlaying) startTicker();
    emit();
  }

  @Override
  public void onPlaybackStateChanged(int state) {
    if (state == Player.STATE_ENDED) {
      if (stopAfterTrack) {
        stopAfterTrack = false;
        player.pause();
      }
      emit();
    } else if (state == Player.STATE_READY) {
      lastError = null;
      emit();
    }
  }

  @Override
  public void onMediaItemTransition(@Nullable MediaItem mediaItem, int reason) {
    emit();
  }

  @Override
  public void onPositionDiscontinuity(
    Player.PositionInfo oldPosition,
    Player.PositionInfo newPosition,
    int reason
  ) {
    emit();
  }

  @Override
  public void onTimelineChanged(Timeline timeline, int reason) {
    bumpQueue();
    emit();
  }

  @Override
  public void onRepeatModeChanged(int repeatMode) {
    emit();
  }

  @Override
  public void onShuffleModeEnabledChanged(boolean shuffleModeEnabled) {
    emit();
  }

  @Override
  public void onPlaybackParametersChanged(PlaybackParameters playbackParameters) {
    emit();
  }

  @Override
  public void onAudioSessionIdChanged(int newAudioSessionId) {
    audioSessionId = newAudioSessionId;
    effects.attach(newAudioSessionId);
    emit();
  }

  public int getAudioSessionId() {
    return audioSessionId;
  }

  @Override
  public void onPlayerError(PlaybackException error) {
    lastError = error.getErrorCodeName() + ": " + (error.getMessage() == null ? "" : error.getMessage());
    android.util.Log.w("YutarioPlayback", "player error " + lastError, error);
    emit();
  }
}
