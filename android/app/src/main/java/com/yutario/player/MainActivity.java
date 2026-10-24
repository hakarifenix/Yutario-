package com.yutario.player;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Installed first so a crash during plugin or bridge setup is still recorded.
    Diagnostics.installCrashHandler(this);
    registerPlugin(YutarioPlugin.class);
    super.onCreate(savedInstanceState);
    handleExternalIntent(getIntent());
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    handleExternalIntent(intent);
  }

  private void handleExternalIntent(Intent intent) {
    if (intent == null) return;
    String action = intent.getAction();
    if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_VIEW.equals(action)) return;
    try {
      YutarioPlugin.deliverIntent(this, intent);
    } catch (Exception error) {
      Diagnostics.log(this, "intent", "could not read the shared file", error);
    }
  }
}
