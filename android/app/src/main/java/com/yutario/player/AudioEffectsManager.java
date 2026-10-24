package com.yutario.player;

import android.media.audiofx.AudioEffect;
import android.media.audiofx.BassBoost;
import android.media.audiofx.Equalizer;
import android.media.audiofx.Virtualizer;
import java.util.UUID;
import androidx.annotation.Nullable;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Wraps android.media.audiofx effects for the active ExoPlayer audio session.
 * Nothing here pretends to work: unsupported effects are reported as such.
 */
public final class AudioEffectsManager {

  private static final float[] CUSTOM_FREQUENCIES = { 60f, 230f, 910f, 3600f, 14000f };

  @Nullable
  private Equalizer equalizer;
  @Nullable
  private BassBoost bassBoost;
  @Nullable
  private Virtualizer virtualizer;

  private int sessionId = 0;
  private boolean enabled = false;
  private int preset = -1;
  private short[] bandLevels = new short[0];
  private short bassStrength = 0;
  private short virtualizerStrength = 0;
  @Nullable
  private String reason;

  public synchronized void attach(int newSessionId) {
    if (newSessionId <= 0 || newSessionId == sessionId) return;
    release();
    sessionId = newSessionId;
    try {
      equalizer = new Equalizer(0, sessionId);
      equalizer.setEnabled(enabled);
      if (bandLevels.length == equalizer.getNumberOfBands()) {
        short[] range = equalizer.getBandLevelRange();
        for (short band = 0; band < bandLevels.length; band++) {
          short level = (short) Math.max(range[0], Math.min(range[1], bandLevels[band]));
          equalizer.setBandLevel(band, level);
        }
      }
      if (preset >= 0 && preset < equalizer.getNumberOfPresets()) {
        equalizer.usePreset((short) preset);
      }
    } catch (Exception error) {
      equalizer = null;
      reason = safeMessage(error);
    }
    try {
      bassBoost = new BassBoost(0, sessionId);
      bassBoost.setStrength(bassStrength);
      bassBoost.setEnabled(enabled);
    } catch (Exception error) {
      bassBoost = null;
      reason = safeMessage(error);
    }
    try {
      virtualizer = new Virtualizer(0, sessionId);
      virtualizer.setStrength(virtualizerStrength);
      virtualizer.setEnabled(enabled);
    } catch (Exception error) {
      virtualizer = null;
      reason = safeMessage(error);
    }
  }

  private static String safeMessage(Exception error) {
    return error.getClass().getSimpleName() + (error.getMessage() == null ? "" : ": " + error.getMessage());
  }

  public synchronized void release() {
    releaseEffect(equalizer);
    releaseEffect(bassBoost);
    releaseEffect(virtualizer);
    equalizer = null;
    bassBoost = null;
    virtualizer = null;
  }

  private static void releaseEffect(@Nullable Object effect) {
    if (effect == null) return;
    try {
      if (effect instanceof Equalizer) {
        Equalizer e = (Equalizer) effect;
        e.setEnabled(false);
        e.release();
      } else if (effect instanceof BassBoost) {
        BassBoost b = (BassBoost) effect;
        b.setEnabled(false);
        b.release();
      } else if (effect instanceof Virtualizer) {
        Virtualizer v = (Virtualizer) effect;
        v.setEnabled(false);
        v.release();
      }
    } catch (Exception ignored) {
      /* Effect already released by the platform. */
    }
  }

  /** True when the device advertises an effect, even before an audio session exists. */
  private static boolean deviceSupports(UUID type) {
    try {
      for (AudioEffect.Descriptor descriptor : AudioEffect.queryEffects()) {
        if (type.equals(descriptor.type)) return true;
      }
    } catch (Exception ignored) {
      /* queryEffects can fail on locked-down devices. */
    }
    return false;
  }

  public synchronized JSONObject state() {
    JSONObject out = new JSONObject();
    try {
      boolean supported = equalizer != null || deviceSupports(AudioEffect.EFFECT_TYPE_EQUALIZER);
      out.put("supported", supported);
      out.put("enabled", enabled);
      out.put("preset", preset);
      out.put("presetCount", equalizer != null ? equalizer.getNumberOfPresets() : 0);
      JSONArray presets = new JSONArray();
      if (equalizer != null) {
        for (short i = 0; i < equalizer.getNumberOfPresets(); i++) {
          presets.put(equalizer.getPresetName(i));
        }
      }
      out.put("presets", presets);
      JSONArray frequencies = new JSONArray();
      JSONArray levels = new JSONArray();
      short minLevel = -1500;
      short maxLevel = 1500;
      if (equalizer != null) {
        short[] range = equalizer.getBandLevelRange();
        minLevel = range[0];
        maxLevel = range[1];
        for (short band = 0; band < equalizer.getNumberOfBands(); band++) {
          frequencies.put(Math.round(equalizer.getCenterFreq(band) / 1000f));
          levels.put(equalizer.getBandLevel(band));
        }
      } else if (bandLevels.length > 0) {
        for (int i = 0; i < bandLevels.length; i++) {
          frequencies.put(Math.round(CUSTOM_FREQUENCIES[Math.min(i, CUSTOM_FREQUENCIES.length - 1)]));
          levels.put(bandLevels[i]);
        }
      }
      out.put("bandFrequencies", frequencies);
      out.put("bandLevels", levels);
      out.put("minLevel", minLevel);
      out.put("maxLevel", maxLevel);
      out.put("bassBoost", bassBoost != null ? bassBoost.getRoundedStrength() : 0);
      out.put("bassMax", 1000);
      out.put("virtualizer", virtualizer != null ? virtualizer.getRoundedStrength() : 0);
      out.put("virtualizerMax", 1000);
      out.put("sessionId", sessionId);
      out.put("reason", reason == null ? JSONObject.NULL : reason);
    } catch (JSONException error) {
      // JSONObject only throws for non-finite doubles; levels are ints.
    }
    return out;
  }

  public synchronized JSONObject apply(
    @Nullable Boolean nextEnabled,
    @Nullable Integer nextPreset,
    @Nullable JSONArray nextBands,
    @Nullable Integer nextBass,
    @Nullable Integer nextVirtualizer
  ) {
    if (nextEnabled != null) enabled = nextEnabled;
    if (nextBass != null) bassStrength = (short) Math.max(0, Math.min(1000, nextBass));
    if (nextVirtualizer != null) virtualizerStrength = (short) Math.max(0, Math.min(1000, nextVirtualizer));

    if (equalizer != null) {
      try {
        if (nextPreset != null && nextPreset >= 0 && nextPreset < equalizer.getNumberOfPresets()) {
          preset = nextPreset;
          equalizer.usePreset((short) preset);
        }
        if (nextBands != null) {
          preset = -1;
          bandLevels = new short[nextBands.length()];
          short[] range = equalizer.getBandLevelRange();
          for (short band = 0; band < Math.min(nextBands.length(), equalizer.getNumberOfBands()); band++) {
            short level = (short) Math.max(range[0], Math.min(range[1], nextBands.optInt(band)));
            bandLevels[band] = level;
            equalizer.setBandLevel(band, level);
          }
        } else if (nextPreset != null && preset >= 0) {
          bandLevels = new short[equalizer.getNumberOfBands()];
          for (short band = 0; band < bandLevels.length; band++) {
            bandLevels[band] = equalizer.getBandLevel(band);
          }
        }
        equalizer.setEnabled(enabled);
      } catch (Exception error) {
        reason = safeMessage(error);
      }
    } else if (nextBands != null) {
      preset = -1;
      bandLevels = new short[nextBands.length()];
      for (int i = 0; i < nextBands.length(); i++) {
        bandLevels[i] = (short) nextBands.optInt(i);
      }
    }

    try {
      if (bassBoost != null) {
        bassBoost.setStrength(bassStrength);
        bassBoost.setEnabled(enabled);
      }
      if (virtualizer != null) {
        virtualizer.setStrength(virtualizerStrength);
        virtualizer.setEnabled(enabled);
      }
    } catch (Exception error) {
      reason = safeMessage(error);
    }
    return state();
  }
}
