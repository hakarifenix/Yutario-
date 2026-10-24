package com.yutario.player;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.util.Size;
import androidx.core.content.ContextCompat;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class MediaLibrary {

  private static final String PREFS = "yutario_prefs";
  private static final String KEY_ASKED = "media_permission_requested";

  private MediaLibrary() {}

  public static boolean hasAudioPermission(Context context) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      return ContextCompat.checkSelfPermission(context, Manifest.permission.READ_MEDIA_AUDIO) ==
        PackageManager.PERMISSION_GRANTED;
    }
    return ContextCompat.checkSelfPermission(context, Manifest.permission.READ_EXTERNAL_STORAGE) ==
      PackageManager.PERMISSION_GRANTED;
  }

  public static boolean hasVideoPermission(Context context) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      return ContextCompat.checkSelfPermission(context, Manifest.permission.READ_MEDIA_VIDEO) ==
        PackageManager.PERMISSION_GRANTED;
    }
    return ContextCompat.checkSelfPermission(context, Manifest.permission.READ_EXTERNAL_STORAGE) ==
      PackageManager.PERMISSION_GRANTED;
  }

  public static boolean hasNotificationPermission(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
    return ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
      PackageManager.PERMISSION_GRANTED;
  }

  public static void markPermissionRequested(Context context) {
    SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    preferences.edit().putBoolean(KEY_ASKED, true).apply();
  }

  public static JSONObject permissionStatus(Context context) {
    JSONObject out = new JSONObject();
    boolean audio = hasAudioPermission(context);
    boolean video = hasVideoPermission(context);
    boolean notifications = hasNotificationPermission(context);
    SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    boolean asked = preferences.getBoolean(KEY_ASKED, false);
    String state;
    if (audio && video) {
      state = "granted";
    } else if (audio || video) {
      state = "partial";
    } else {
      state = asked ? "denied" : "prompt";
    }
    try {
      out.put("state", state);
      out.put("readAudio", audio);
      out.put("readVideo", video);
      out.put("notifications", notifications);
      out.put("sdk", Build.VERSION.SDK_INT);
    } catch (JSONException ignored) {
      /* primitives only */
    }
    return out;
  }

  private static String[] audioProjection() {
    java.util.List<String> columns = new java.util.ArrayList<>();
    columns.add(MediaStore.Audio.Media._ID);
    columns.add(MediaStore.Audio.Media.DISPLAY_NAME);
    columns.add(MediaStore.Audio.Media.TITLE);
    columns.add(MediaStore.Audio.Media.ARTIST);
    columns.add(MediaStore.Audio.Media.ALBUM);
    columns.add(MediaStore.Audio.Media.ALBUM_ID);
    columns.add(MediaStore.Audio.Media.DURATION);
    columns.add(MediaStore.Audio.Media.SIZE);
    columns.add(MediaStore.Audio.Media.DATE_ADDED);
    columns.add(MediaStore.Audio.Media.MIME_TYPE);
    columns.add(MediaStore.Audio.Media.TRACK);
    columns.add(MediaStore.Audio.Media.YEAR);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      columns.add(MediaStore.Audio.Media.BITRATE);
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      columns.add(MediaStore.Audio.Media.RELATIVE_PATH);
    } else {
      columns.add(MediaStore.Audio.Media.DATA);
    }
    return columns.toArray(new String[0]);
  }

  private static String[] videoProjection() {
    java.util.List<String> columns = new java.util.ArrayList<>();
    columns.add(MediaStore.Video.Media._ID);
    columns.add(MediaStore.Video.Media.DISPLAY_NAME);
    columns.add(MediaStore.Video.Media.TITLE);
    columns.add(MediaStore.Video.Media.DURATION);
    columns.add(MediaStore.Video.Media.SIZE);
    columns.add(MediaStore.Video.Media.DATE_ADDED);
    columns.add(MediaStore.Video.Media.MIME_TYPE);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      columns.add(MediaStore.Video.Media.RELATIVE_PATH);
    } else {
      columns.add(MediaStore.Video.Media.DATA);
    }
    return columns.toArray(new String[0]);
  }

  private static String sortColumn(String kind, String sort) {
    boolean audio = "audio".equals(kind);
    if (sort == null) sort = "date";
    switch (sort) {
      case "name":
        return audio ? MediaStore.Audio.Media.TITLE : MediaStore.Video.Media.TITLE;
      case "duration":
        return audio ? MediaStore.Audio.Media.DURATION : MediaStore.Video.Media.DURATION;
      case "size":
        return audio ? MediaStore.Audio.Media.SIZE : MediaStore.Video.Media.SIZE;
      case "artist":
        return audio ? MediaStore.Audio.Media.ARTIST : MediaStore.Video.Media.TITLE;
      case "album":
        return audio ? MediaStore.Audio.Media.ALBUM : MediaStore.Video.Media.TITLE;
      case "date":
      default:
        return audio ? MediaStore.Audio.Media.DATE_ADDED : MediaStore.Video.Media.DATE_ADDED;
    }
  }

  public static JSONObject scan(
    Context context,
    String kind,
    int offset,
    int limit,
    String sort,
    boolean reverse
  ) throws Exception {
    boolean audio = !"video".equals(kind);
    Uri collection = audio ? MediaStore.Audio.Media.EXTERNAL_CONTENT_URI : MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
    String[] projection = audio ? audioProjection() : videoProjection();
    String selection = audio
      ? MediaStore.Audio.Media.IS_RINGTONE + "=0 AND " + MediaStore.Audio.Media.IS_ALARM + "=0 AND " +
        MediaStore.Audio.Media.IS_NOTIFICATION + "=0 AND " + MediaStore.Audio.Media.DURATION + ">0"
      : null;
    String order = sortColumn(kind, sort) + (reverse ? " DESC" : " ASC") + " , " +
      (audio ? MediaStore.Audio.Media._ID : MediaStore.Video.Media._ID) + " ASC";

    JSONArray items = new JSONArray();
    ContentResolver resolver = context.getContentResolver();
    int total = -1;
    if (offset == 0) {
      try (Cursor countCursor = resolver.query(collection, new String[] { audio ? MediaStore.Audio.Media._ID : MediaStore.Video.Media._ID }, selection, null, null)) {
        total = countCursor == null ? 0 : countCursor.getCount();
      } catch (Exception ignored) {
        total = -1;
      }
    }

    try (Cursor cursor = resolver.query(collection, projection, selection, null, order)) {
      if (cursor == null) {
        JSONObject empty = new JSONObject();
        empty.put("items", items);
        empty.put("total", total);
        return empty;
      }
      if (!cursor.moveToPosition(offset)) {
        JSONObject empty = new JSONObject();
        empty.put("items", items);
        empty.put("total", total);
        return empty;
      }
      int idColumn = cursor.getColumnIndexOrThrow(audio ? MediaStore.Audio.Media._ID : MediaStore.Video.Media._ID);
      int nameColumn = cursor.getColumnIndex(MediaStore.MediaColumns.DISPLAY_NAME);
      int titleColumn = cursor.getColumnIndex(audio ? MediaStore.Audio.Media.TITLE : MediaStore.Video.Media.TITLE);
      int durationColumn = cursor.getColumnIndex(audio ? MediaStore.Audio.Media.DURATION : MediaStore.Video.Media.DURATION);
      int sizeColumn = cursor.getColumnIndex(audio ? MediaStore.Audio.Media.SIZE : MediaStore.Video.Media.SIZE);
      int dateColumn = cursor.getColumnIndex(MediaStore.MediaColumns.DATE_ADDED);
      int mimeColumn = cursor.getColumnIndex(MediaStore.MediaColumns.MIME_TYPE);

      do {
        if (items.length() >= limit) break;
        long id = cursor.getLong(idColumn);
        Uri uri = ContentUris.withAppendedId(collection, id);
        JSONObject item = new JSONObject();
        String displayName = nameColumn >= 0 ? cursor.getString(nameColumn) : null;
        String title = titleColumn >= 0 ? cursor.getString(titleColumn) : null;
        item.put("uri", uri.toString());
        item.put("kind", audio ? "audio" : "video");
        item.put("displayName", displayName == null ? "" : displayName);
        item.put("title", cleanTitle(title, displayName));
        item.put("durationMs", durationColumn >= 0 ? cursor.getLong(durationColumn) : 0);
        item.put("sizeBytes", sizeColumn >= 0 ? cursor.getLong(sizeColumn) : 0);
        item.put("dateAdded", dateColumn >= 0 ? cursor.getLong(dateColumn) * 1000L : 0);
        item.put("mimeType", mimeColumn >= 0 ? cursor.getString(mimeColumn) : null);
        item.put("source", "mediastore");

        if (audio) {
          int artistColumn = cursor.getColumnIndex(MediaStore.Audio.Media.ARTIST);
          int albumColumn = cursor.getColumnIndex(MediaStore.Audio.Media.ALBUM);
          int albumIdColumn = cursor.getColumnIndex(MediaStore.Audio.Media.ALBUM_ID);
          int trackColumn = cursor.getColumnIndex(MediaStore.Audio.Media.TRACK);
          int yearColumn = cursor.getColumnIndex(MediaStore.Audio.Media.YEAR);
          String artist = artistColumn >= 0 ? cursor.getString(artistColumn) : null;
          String album = albumColumn >= 0 ? cursor.getString(albumColumn) : null;
          item.put("artist", normalizeUnknown(artist));
          item.put("album", normalizeUnknown(album));
          item.put("albumId", albumIdColumn >= 0 ? cursor.getLong(albumIdColumn) : 0);
          item.put("trackNumber", trackColumn >= 0 ? cursor.getInt(trackColumn) % 1000 : 0);
          item.put("year", yearColumn >= 0 ? cursor.getInt(yearColumn) : 0);
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            int bitrateColumn = cursor.getColumnIndex(MediaStore.Audio.Media.BITRATE);
            item.put("bitrate", bitrateColumn >= 0 ? cursor.getInt(bitrateColumn) : 0);
          }
        } else {
          item.put("artist", "");
          item.put("album", "");
        }

        String path = folderPath(cursor);
        item.put("relPath", path);
        item.put("folderPath", path);
        items.put(item);
      } while (cursor.moveToNext());
    }

    JSONObject out = new JSONObject();
    out.put("items", items);
    out.put("total", total);
    return out;
  }

  private static String folderPath(Cursor cursor) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      int relColumn = cursor.getColumnIndex(MediaStore.MediaColumns.RELATIVE_PATH);
      if (relColumn >= 0) {
        String relative = cursor.getString(relColumn);
        if (relative != null) {
          return relative.replaceAll("/+$", "");
        }
      }
      return "";
    }
    int dataColumn = cursor.getColumnIndex(MediaStore.MediaColumns.DATA);
    if (dataColumn >= 0) {
      String data = cursor.getString(dataColumn);
      if (data != null) {
        File file = new File(data);
        File parent = file.getParentFile();
        return parent == null ? "" : parent.getAbsolutePath();
      }
    }
    return "";
  }

  private static String cleanTitle(String title, String displayName) {
    String clean = normalizeUnknown(title);
    if (!clean.isEmpty()) return clean;
    if (displayName == null || displayName.isEmpty()) return "";
    int dot = displayName.lastIndexOf('.');
    return dot > 0 ? displayName.substring(0, dot) : displayName;
  }

  private static String normalizeUnknown(String value) {
    if (value == null) return "";
    String trimmed = value.trim();
    if (trimmed.isEmpty()) return "";
    if ("<unknown>".equalsIgnoreCase(trimmed)) return "";
    return trimmed;
  }

  public static JSONObject buildSafItem(Context context, Uri uri, String kindHint) {
    JSONObject item = new JSONObject();
    ContentResolver resolver = context.getContentResolver();
    String displayName = null;
    long size = 0;
    try (Cursor cursor = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }, null, null, null)) {
      if (cursor != null && cursor.moveToFirst()) {
        int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
        int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
        if (nameIndex >= 0) displayName = cursor.getString(nameIndex);
        if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex);
      }
    } catch (Exception ignored) {
      /* Some providers do not expose OpenableColumns. */
    }
    String mime = resolver.getType(uri);
    String kind = kindHint;
    if (kind == null || "any".equals(kind)) {
      kind = mime != null && mime.startsWith("video") ? "video" : "audio";
    }
    String title = displayName == null ? "" : displayName;
    int dot = title.lastIndexOf('.');
    if (dot > 0) title = title.substring(0, dot);
    long duration = 0;
    String artist = "";
    String album = "";
    MediaMetadataRetriever retriever = new MediaMetadataRetriever();
    try {
      retriever.setDataSource(context, uri);
      String durationText = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
      if (durationText != null) duration = Long.parseLong(durationText);
      artist = normalizeUnknown(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST));
      album = normalizeUnknown(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM));
      String metaTitle = normalizeUnknown(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE));
      if (!metaTitle.isEmpty()) title = metaTitle;
    } catch (Exception ignored) {
      /* Unreadable metadata still yields a playable item with a filename title. */
    } finally {
      try {
        retriever.release();
      } catch (Exception ignored) {
        /* nothing to release */
      }
    }
    try {
      item.put("uri", uri.toString());
      item.put("kind", kind);
      item.put("displayName", displayName == null ? "" : displayName);
      item.put("title", title);
      item.put("artist", artist);
      item.put("album", album);
      item.put("durationMs", duration);
      item.put("sizeBytes", size);
      item.put("dateAdded", System.currentTimeMillis());
      item.put("mimeType", mime == null ? JSONObject.NULL : mime);
      item.put("relPath", "Selected files");
      item.put("folderPath", "Selected files");
      item.put("source", "saf");
    } catch (JSONException ignored) {
      /* primitives only */
    }
    return item;
  }

  public static JSONArray buildItemsForUris(Context context, List<Uri> uris) {
    JSONArray items = new JSONArray();
    if (uris == null) return items;
    for (Uri uri : uris) {
      if (uri == null) continue;
      try {
        items.put(buildSafItem(context, uri, null));
      } catch (Exception ignored) {
        /* skip unreadable share targets */
      }
    }
    return items;
  }

  public static String artworkDataUrl(Context context, Uri uri, int size) {
    Bitmap bitmap = null;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      try {
        bitmap = context.getContentResolver().loadThumbnail(uri, new Size(size, size), null);
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
          int sample = 1;
          while (options.outWidth / (sample * 2) > size && options.outHeight / (sample * 2) > size) {
            sample *= 2;
          }
          options.inJustDecodeBounds = false;
          options.inSampleSize = sample;
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
    if (bitmap == null) return null;
    try {
      int width = bitmap.getWidth();
      int height = bitmap.getHeight();
      float scale = Math.min(1f, (float) size / Math.max(width, height));
      if (scale < 1f) {
        Bitmap scaled = Bitmap.createScaledBitmap(bitmap, Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)), true);
        if (scaled != bitmap) bitmap.recycle();
        bitmap = scaled;
      }
      ByteArrayOutputStream stream = new ByteArrayOutputStream();
      bitmap.compress(Bitmap.CompressFormat.JPEG, 82, stream);
      String encoded = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP);
      return "data:image/jpeg;base64," + encoded;
    } catch (Exception error) {
      return null;
    } finally {
      bitmap.recycle();
    }
  }

  public static JSONObject fileInfo(Context context, Uri uri) {
    JSONObject out = new JSONObject();
    ContentResolver resolver = context.getContentResolver();
    boolean exists = true;
    long size = 0;
    String displayName = null;
    String mime = null;
    String path = null;
    try (android.content.res.AssetFileDescriptor descriptor = resolver.openAssetFileDescriptor(uri, "r")) {
      if (descriptor == null) {
        exists = false;
      } else if (descriptor.getLength() > 0) {
        size = descriptor.getLength();
      }
    } catch (Exception error) {
      exists = false;
    }
    try (Cursor cursor = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }, null, null, null)) {
      if (cursor != null && cursor.moveToFirst()) {
        int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
        int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
        if (nameIndex >= 0) displayName = cursor.getString(nameIndex);
        if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex);
      }
    } catch (Exception ignored) {
      /* Not all providers implement OpenableColumns. */
    }
    try {
      mime = resolver.getType(uri);
    } catch (Exception ignored) {
      mime = null;
    }
    if ("file".equals(uri.getScheme())) path = uri.getPath();
    try {
      out.put("exists", exists);
      out.put("sizeBytes", size);
      out.put("mimeType", mime == null ? JSONObject.NULL : mime);
      out.put("displayName", displayName == null ? JSONObject.NULL : displayName);
      out.put("path", path == null ? JSONObject.NULL : path);
    } catch (JSONException ignored) {
      /* primitives only */
    }
    return out;
  }
}
