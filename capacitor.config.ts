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
};

export default config;
