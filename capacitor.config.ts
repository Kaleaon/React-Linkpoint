/**
 * Capacitor wrapper configuration for free Android-device testing.
 * Install the Capacitor packages described in README.md before running sync.
 */
const config = {
  appId: 'io.linkpoint.viewer',
  appName: 'Linkpoint',
  webDir: 'dist',
  bundledWebRuntime: false,
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
