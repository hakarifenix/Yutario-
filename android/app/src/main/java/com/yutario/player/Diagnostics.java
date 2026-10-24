package com.yutario.player;

import android.content.Context;
import android.util.Log;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.io.Writer;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Captures playback failures and fatal crashes so they can be read back from the UI.
 *
 * <p>A native crash kills the process before any JavaScript runs, so the only way to see the real
 * cause on a phone is to write it to disk first. Crashes are logged and then re-thrown to the
 * previous handler: the app must still fail loudly instead of pretending it recovered.
 */
public final class Diagnostics {

  private static final String TAG = "YutarioDiag";
  private static final String FILE_NAME = "yutario-diagnostics.log";
  private static final long MAX_BYTES = 96 * 1024;
  private static final Object LOCK = new Object();

  private Diagnostics() {}

  public static void log(Context context, String scope, String message) {
    log(context, scope, message, null);
  }

  public static void log(Context context, String scope, String message, Throwable error) {
    String line = stamp() + " [" + scope + "] " + message;
    if (error != null) {
      line += "\n" + stackTrace(error);
    }
    Log.w(TAG, line);
    if (context == null) return;
    Context app = context.getApplicationContext();
    synchronized (LOCK) {
      File file = new File(app.getFilesDir(), FILE_NAME);
      try {
        if (file.length() > MAX_BYTES) {
          File rotated = new File(app.getFilesDir(), FILE_NAME + ".1");
          if (rotated.exists() && !rotated.delete()) {
            Log.w(TAG, "could not delete the previous log");
          }
          if (!file.renameTo(rotated)) {
            Log.w(TAG, "could not rotate the log");
          }
        }
        try (Writer writer = new OutputStreamWriter(new FileOutputStream(file, true), "UTF-8")) {
          writer.write(line);
          writer.write('\n');
        }
      } catch (Exception writeError) {
        Log.w(TAG, "could not persist diagnostics", writeError);
      }
    }
  }

  /** Full contents of the current log, newest last. Never throws. */
  public static String read(Context context) {
    if (context == null) return "";
    Context app = context.getApplicationContext();
    StringBuilder out = new StringBuilder();
    synchronized (LOCK) {
      File rotated = new File(app.getFilesDir(), FILE_NAME + ".1");
      appendFile(out, rotated);
      appendFile(out, new File(app.getFilesDir(), FILE_NAME));
    }
    return out.toString();
  }

  public static void clear(Context context) {
    if (context == null) return;
    Context app = context.getApplicationContext();
    synchronized (LOCK) {
      File file = new File(app.getFilesDir(), FILE_NAME);
      if (file.exists() && !file.delete()) {
        Log.w(TAG, "could not clear the log");
      }
      File rotated = new File(app.getFilesDir(), FILE_NAME + ".1");
      if (rotated.exists() && !rotated.delete()) {
        Log.w(TAG, "could not clear the rotated log");
      }
    }
  }

  private static void appendFile(StringBuilder out, File file) {
    if (!file.exists()) return;
    try (InputStream input = new java.io.FileInputStream(file)) {
      byte[] buffer = new byte[8192];
      int read;
      while ((read = input.read(buffer)) > 0) {
        out.append(new String(buffer, 0, read, "UTF-8"));
      }
    } catch (IOException error) {
      Log.w(TAG, "could not read the log", error);
    }
  }

  /**
   * Records the next uncaught exception before the process dies. The previous handler is always
   * invoked afterwards so the crash is not swallowed.
   */
  public static void installCrashHandler(final Context context) {
    final Context app = context.getApplicationContext();
    final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
    Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
      log(app, "crash", "Uncaught on thread " + thread.getName(), error);
      if (previous != null) {
        previous.uncaughtException(thread, error);
      }
    });
  }

  private static String stamp() {
    return new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US).format(new Date());
  }

  private static String stackTrace(Throwable error) {
    StringWriter buffer = new StringWriter();
    PrintWriter writer = new PrintWriter(buffer);
    Throwable current = error;
    int depth = 0;
    while (current != null && depth < 6) {
      current.printStackTrace(writer);
      Throwable cause = current.getCause();
      if (cause == current) break;
      current = cause;
      depth += 1;
    }
    writer.flush();
    return buffer.toString();
  }
}
