package com.yutario.player;

import android.app.PendingIntent;
import android.content.Intent;
import androidx.annotation.Nullable;
import androidx.media3.session.DefaultMediaNotificationProvider;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

/**
 * Foreground media service. Media3 owns the notification, lock-screen and headset
 * integration; the player itself is the shared PlaybackController instance.
 *
 * <p>Session setup is deliberately defensive: a device that rejects the notification or the
 * artwork loader must still get audio, so a failure here is logged and playback continues without
 * lock-screen controls instead of taking the process down.
 */
public class PlaybackService extends MediaSessionService {

  private static final String TAG = "YutarioService";

  @Nullable
  private MediaSession session;

  @Override
  public void onCreate() {
    super.onCreate();
    try {
      DefaultMediaNotificationProvider provider = new DefaultMediaNotificationProvider.Builder(this)
        .setChannelName(R.string.playback_channel_name)
        .build();
      setMediaNotificationProvider(provider);
    } catch (Exception error) {
      Diagnostics.log(this, "service", "could not configure the media notification", error);
    }

    try {
      PlaybackController controller = PlaybackController.getInstance(this);
      session = new MediaSession.Builder(this, controller.getPlayer())
        .setBitmapLoader(new ArtworkLoader(this))
        .setSessionActivity(openAppIntent())
        .build();
    } catch (Exception error) {
      session = null;
      Diagnostics.log(this, "service", "could not create the media session", error);
    }
  }

  private PendingIntent openAppIntent() {
    Intent intent = new Intent(this, MainActivity.class);
    intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
    return PendingIntent.getActivity(this, 0, intent, flags);
  }

  @Nullable
  @Override
  public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
    return session;
  }

  @Override
  public void onTaskRemoved(@Nullable Intent rootIntent) {
    if (session == null || !session.getPlayer().getPlayWhenReady()) {
      stopSelf();
    }
  }

  @Override
  public void onDestroy() {
    if (session != null) {
      try {
        session.release();
      } catch (Exception error) {
        Diagnostics.log(this, "service", "could not release the media session", error);
      }
      session = null;
    }
    super.onDestroy();
  }
}
