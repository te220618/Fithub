import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'jp.fithub.app',
  appName: 'FithubFast',
  webDir: '../static',
  server: {
    url: 'https://fithub.jp',
    cleartext: false,
    allowNavigation: ['fithub.jp'],
  },
};

export default config;
