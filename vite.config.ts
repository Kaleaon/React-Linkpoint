import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  // Vercel (and installed PWAs) serve the application from the origin root.
  // GitHub Pages can still opt into its repository prefix with
  // VITE_BASE_PATH=/React-Linkpoint/ at build time.
  const base = env.VITE_BASE_PATH || '/';

  return {
    base,
    plugins: [react()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        'react-native': 'react-native-web',
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
