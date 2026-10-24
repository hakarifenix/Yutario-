import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yutario.player',
  appName: 'Yutario',
  webDir: 'dist',
  android: {
    backgroundColor: '#0a0b12',
    allowMixedContent: false,
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0b12',
      overlaysWebView: false,
    },
  },
};

export default config;
