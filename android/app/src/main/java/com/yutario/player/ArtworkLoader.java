package com.yutario.player;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.util.LruCache;
import android.util.Size;
import androidx.annotation.NonNull;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.session.BitmapLoader;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.common.util.concurrent.ListeningExecutorService;
import com.google.common.util.concurrent.MoreExecutors;
import java.util.concurrent.Executors;

/**
 * Loads artwork for the media notification and lock screen. MediaStore thumbnails are
 * used on Android 10+, with an embedded-picture fallback for older devices.
 */
@UnstableApi
public final class ArtworkLoader implements BitmapLoader {

  private final Context context;
  private final ListeningExecutorService executor = MoreExecutors.listeningDecorator(
    Executors.newSingleThreadExecutor()
  );
  private final LruCache<String, Bitmap> cache = new LruCache<>(12);

  public ArtworkLoader(Context context) {
    this.context = context.getApplicationContext();
  }

  @Override
  public boolean supportsMimeType(@NonNull String mimeType) {
    return true;
  }

  @Override
  public ListenableFuture<Bitmap> decodeBitmap(@NonNull byte[] data) {
    return executor.submit(() -> {
      Bitmap bitmap = BitmapFactory.decodeByteArray(data, 0, data.length);
      if (bitmap == null) throw new IllegalStateException("Unable to decode artwork");
      return bitmap;
    });
  }

  @Override
  public ListenableFuture<Bitmap> loadBitmap(@NonNull Uri uri) {
    Bitmap cached = cache.get(uri.toString());
    if (cached != null) return com.google.common.util.concurrent.Futures.immediateFuture(cached);
    return executor.submit(() -> {
      Bitmap bitmap = load(uri);
      if (bitmap == null) throw new IllegalStateException("No artwork for " + uri);
      cache.put(uri.toString(), bitmap);
      return bitmap;
    });
  }

  @Override
  public ListenableFuture<Bitmap> loadBitmapFromMetadata(@NonNull MediaMetadata metadata) {
    if (metadata.artworkData != null) return decodeBitmap(metadata.artworkData);
    if (metadata.artworkUri != null) return loadBitmap(metadata.artworkUri);
    return com.google.common.util.concurrent.Futures.immediateFailedFuture(
      new IllegalStateException("No artwork metadata")
    );
  }

  private Bitmap load(Uri uri) {
    Bitmap bitmap = null;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      try {
        bitmap = context.getContentResolver().loadThumbnail(uri, new Size(512, 512), null);
      } catch (Exception ignored) {
        bitmap = null;
      }
    }
    if (bitmap == null) {
      MediaMetadataRetriever retriever = new MediaMetadataRetriever();
      try {
        retriever.setDataSource(context, uri);
        byte[] picture = retriever.getEmbeddedPicture();
        if (picture != null) {
          BitmapFactory.Options options = new BitmapFactory.Options();
          options.inJustDecodeBounds = true;
          BitmapFactory.decodeByteArray(picture, 0, picture.length, options);
          options.inSampleSize = sampleSize(options.outWidth, options.outHeight, 512);
          options.inJustDecodeBounds = false;
          bitmap = BitmapFactory.decodeByteArray(picture, 0, picture.length, options);
        }
      } catch (Exception ignored) {
        bitmap = null;
      } finally {
        try {
          retriever.release();
        } catch (Exception ignored) {
          /* nothing to release */
        }
      }
    }
    return bitmap;
  }

  private static int sampleSize(int width, int height, int target) {
    int sample = 1;
    while (width / (sample * 2) > target && height / (sample * 2) > target) {
      sample *= 2;
    }
    return sample;
  }
}
