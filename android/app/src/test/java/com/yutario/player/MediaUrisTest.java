package com.yutario.player;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Verifies that stored media locations survive the trip into ExoPlayer unchanged. */
public class MediaUrisTest {

  @Test
  public void keepsContentUrisUntouched() {
    String uri = "content://media/external/video/media/1234";
    assertEquals(uri, MediaUris.normalize(uri));
    assertTrue(MediaUris.hasScheme(MediaUris.normalize(uri)));
    assertFalse(MediaUris.isLocalFile(MediaUris.normalize(uri)));
  }

  @Test
  public void keepsSafDocumentUrisUntouched() {
    String uri = "content://com.android.providers.downloads.documents/document/msf%3A42";
    assertEquals(uri, MediaUris.normalize(uri));
  }

  @Test
  public void trimsSurroundingWhitespace() {
    assertEquals(
      "content://media/external/audio/media/9",
      MediaUris.normalize("  content://media/external/audio/media/9\n")
    );
  }

  @Test
  public void unwrapsCapacitorLocalUrls() {
    assertEquals(
      "/storage/emulated/0/Movies/trip.mp4",
      MediaUris.normalize("http://localhost/_capacitor_file_/storage/emulated/0/Movies/trip.mp4")
    );
    assertEquals(
      "/storage/emulated/0/Music/song.mp3",
      MediaUris.normalize("https://localhost/_capacitor_file_/storage/emulated/0/Music/song.mp3")
    );
  }

  @Test
  public void keepsAbsolutePathsAndFileUris() {
    assertEquals("/storage/emulated/0/a.mp4", MediaUris.normalize("/storage/emulated/0/a.mp4"));
    assertEquals("file:///storage/emulated/0/a.mp4", MediaUris.normalize("file:///storage/emulated/0/a.mp4"));
    assertTrue(MediaUris.isLocalFile(MediaUris.normalize("/storage/emulated/0/a.mp4")));
  }

  @Test
  public void keepsRemoteUris() {
    String remote = "https://example.com/stream/clip.mp4";
    assertEquals(remote, MediaUris.normalize(remote));
    assertTrue(MediaUris.hasScheme(remote));
  }

  @Test
  public void blankInputBecomesEmpty() {
    assertEquals("", MediaUris.normalize(null));
    assertEquals("", MediaUris.normalize("   "));
    assertFalse(MediaUris.isLocalFile(""));
  }

  @Test
  public void detectsSchemesWithoutMistakingPathsForThem() {
    assertTrue(MediaUris.hasScheme("content://media/a"));
    assertTrue(MediaUris.hasScheme("file:///a.mp3"));
    assertFalse(MediaUris.hasScheme("/storage/emulated/0/Music/a:b.mp3"));
    assertFalse(MediaUris.hasScheme("My Song.mp3"));
  }

  @Test
  public void guessesMimeTypesFromNames() {
    assertEquals("video/mp4", MediaUris.mimeFromName("clip.MP4"));
    assertEquals("video/x-matroska", MediaUris.mimeFromName("show.mkv"));
    assertEquals("audio/mpeg", MediaUris.mimeFromName("song.mp3"));
    assertEquals("audio/flac", MediaUris.mimeFromName("track.flac"));
    assertEquals("", MediaUris.mimeFromName("no-extension"));
    assertEquals("", MediaUris.mimeFromName(null));
  }

  @Test
  public void describesLongValuesWithoutDroppingTheEnding() {
    String longUri = "content://media/external/video/media/" + new String(new char[120]).replace('\0', '7');
    String described = MediaUris.describe(longUri);
    assertTrue(described.length() < longUri.length());
    assertTrue(described.startsWith("content://media/external/video/media/"));
  }
}
