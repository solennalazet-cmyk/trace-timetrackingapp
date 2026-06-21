import type { CapacitorConfig } from '@capacitor/cli';

// Production Android/iOS config.
//
// IMPORTANT: `server.url` is intentionally NOT set here so the installed app
// loads its bundle from the local `dist/` folder bundled into the APK/IPA.
// If `server.url` pointed at the Lovable preview URL, every cold start would
// fetch the whole web bundle over HTTPS before painting anything — that is
// the dominant cause of "the native app feels slower than the browser".
//
// To temporarily re-enable hot-reload against the Lovable sandbox during
// local development, uncomment the `server` block below. Never ship a
// production build with `server.url` set.
//
// server: {
//   url: 'https://2e45d467-d812-47ba-90ec-68595339560d.lovableproject.com?forceHideBadge=true',
//   cleartext: true,
// },

const config: CapacitorConfig = {
  appId: 'app.lovable.2e45d467d81247ba90ec68595339560d',
  appName: 'trace-timetrackingapp',
  webDir: 'dist',
  android: {
    // Use the modern WebView contents (matches browser perf characteristics).
    allowMixedContent: false,
  },
  plugins: {
    // Native splash screen: shown by the OS the instant the app process
    // starts, before the WebView even loads. We hide it ourselves from JS
    // (`launchAutoHide: false`) once React has mounted and painted the first
    // frame — see `src/main.tsx`. This eliminates the white/black flash
    // during cold start on Android.
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: false,
      backgroundColor: '#f5f4f1',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      androidSpinnerStyle: 'small',
      spinnerColor: '#7a3f86',
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
