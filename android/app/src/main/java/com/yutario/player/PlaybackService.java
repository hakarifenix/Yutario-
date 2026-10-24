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
 */
public class PlaybackService extends MediaSessionService {

  @Nullable
  private MediaSession session;

  @Override
  public void onCreate() {
    super.onCreate();
    PlaybackController controller = PlaybackController.getInstance(this);

    session = new MediaSession.Builder(this, controller.getPlayer())
      .setBitmapLoader(new ArtworkLoader(this))
      .setSessionActivity(openAppIntent())
      .build();

    DefaultMediaNotificationProvider provider = new DefaultMediaNotificationProvider.Builder(this)
      .setChannelName(R.string.playback_channel_name)
      .build();
    setMediaNotificationProvider(provider);
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
      session.release();
      session = null;
    }
    super.onDestroy();
  }
}
