package com.yutario.player;

import java.util.Locale;

/**
 * Normalizes media locations coming from the web layer.
 *
 * <p>The library stores {@code content://} URIs exactly as Android hands them out. Those must never
 * be turned into filesystem paths. This class only rewrites the two shapes that cannot be given to
 * ExoPlayer directly: Capacitor's local http server URLs and plain absolute paths.
 *
 * <p>Kept free of Android classes so it can be unit tested on the JVM.
 */
public final class MediaUris {

  /** Capacitor serves local files through a virtual host that ExoPlayer cannot open. */
  private static final String CAPACITOR_FILE_MARKER = "/_capacitor_file_";

  private MediaUris() {}

  /**
   * Returns a value ready for {@code Uri.parse}: either a URI with a scheme, or an absolute path.
   * Blank input yields an empty string so callers can report a precise error.
   */
  public static String normalize(String raw) {
    if (raw == null) return "";
    String value = raw.trim();
    if (value.isEmpty()) return "";

    int marker = value.indexOf(CAPACITOR_FILE_MARKER);
    if (marker >= 0) {
      String path = value.substring(marker + CAPACITOR_FILE_MARKER.length());
      if (!path.startsWith("/")) path = "/" + path;
      return path;
    }

    // Capacitor also serves plugin downloads through the same virtual host.
    int downloads = value.indexOf("/_capacitor_downloads_");
    if (downloads >= 0) {
      String path = value.substring(downloads + "/_capacitor_downloads_".length());
      if (!path.startsWith("/")) path = "/" + path;
      return path;
    }

    if (hasScheme(value) || value.startsWith("/")) return value;
    // A bare filename such as "song.mp3" is treated as a path relative to the app sandbox.
    return value;
  }

  /** True when the value carries an explicit URI scheme (content://, file://, https://, ...). */
  public static boolean hasScheme(String value) {
    if (value == null) return false;
    int colon = value.indexOf(':');
    if (colon <= 0) return false;
    int slash = value.indexOf('/');
    if (slash >= 0 && slash < colon) return false;
    for (int i = 0; i < colon; i++) {
      char c = value.charAt(i);
      boolean valid =
        (c >= 'a' && c <= 'z') ||
        (c >= 'A' && c <= 'Z') ||
        (c >= '0' && c <= '9') ||
        c == '+' ||
        c == '-' ||
        c == '.';
      if (!valid) return false;
    }
    char first = value.charAt(0);
    return (first >= 'a' && first <= 'z') || (first >= 'A' && first <= 'Z');
  }

  /** True when the normalized value points at a local file rather than a content provider. */
  public static boolean isLocalFile(String normalized) {
    if (normalized == null || normalized.isEmpty()) return false;
    String lower = normalized.toLowerCase(Locale.US);
    if (lower.startsWith("content://")) return false;
    if (lower.startsWith("file://")) return true;
    if (lower.startsWith("/")) return true;
    return false;
  }

  /** Best-effort container MIME type from a file name; empty when the extension is unknown. */
  public static String mimeFromName(String name) {
    if (name == null) return "";
    String lower = name.toLowerCase(Locale.US);
    int dot = lower.lastIndexOf('.');
    if (dot < 0 || dot == lower.length() - 1) return "";
    String extension = lower.substring(dot + 1);
    switch (extension) {
      case "mp4":
      case "m4v":
        return "video/mp4";
      case "mkv":
        return "video/x-matroska";
      case "webm":
        return "video/webm";
      case "mov":
        return "video/quicktime";
      case "3gp":
        return "video/3gpp";
      case "ts":
      case "m2ts":
        return "video/mp2t";
      case "avi":
        return "video/x-msvideo";
      case "flv":
        return "video/x-flv";
      case "ogv":
        return "video/ogg";
      case "mp3":
        return "audio/mpeg";
      case "m4a":
        return "audio/mp4";
      case "aac":
        return "audio/aac";
      case "flac":
        return "audio/flac";
      case "ogg":
      case "oga":
        return "audio/ogg";
      case "opus":
        return "audio/opus";
      case "wav":
        return "audio/wav";
      case "amr":
        return "audio/amr";
      case "wma":
        return "audio/x-ms-wma";
      default:
        return "";
    }
  }

  /** Short human readable form of a URI for logs and error messages. */
  public static String describe(String value) {
    if (value == null || value.isEmpty()) return "(empty)";
    if (value.length() <= 96) return value;
    return value.substring(0, 60) + "…" + value.substring(value.length() - 28);
  }
}
