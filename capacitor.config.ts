import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yutario.player',
  appName: 'Yutario',
  webDir: 'dist',
  android: {
    backgroundColor: '#f6fbf8',
    allowMixedContent: false,
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#f6fbf8',
      overlaysWebView: false,
    },
  },
};

export default config;
