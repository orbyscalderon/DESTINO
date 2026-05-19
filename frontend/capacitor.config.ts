import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.destino.app',
  appName: 'Destino',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0d0d1a',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#0d0d1a',
    },
  },
  android: {
    backgroundColor: '#0d0d1a',
  },
  ios: {
    contentInset: 'automatic',
  },
};

export default config;
