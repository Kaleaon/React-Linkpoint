import react from '@vitejs/plugin-react';
import type { Server } from 'node:http';
import path from 'path';
import { defineConfig, loadEnv, type Plugin, type UserConfig } from 'vite';

function disablePreviewTransport(): Plugin {
  return {
    name: 'linkpoint-disable-preview-transport',
    enforce: 'post',
    apply: 'serve',
    transform(code, id) {
      if (!id.replaceAll('\\', '/').endsWith('/vite/dist/client/client.mjs')) return;
      // Vite 8 still injects its client with ws:false. Keep its CSS helpers,
      // but do not initiate a socket that this preview cannot accept.
      const connect = 'transport.connect(createHMRHandler(handleMessage));';
      if (!code.includes(connect)) {
        throw new Error('The Vite preview client changed; update the disabled transport adapter.');
      }
      return { code: code.replace(connect, ''), map: null };
    },
  };
}

export function createViewerViteConfig(mode: string, httpServer?: Server): UserConfig {
  const env = loadEnv(mode, '.', '');
  // Vercel (and installed PWAs) serve the application from the origin root.
  // GitHub Pages can still opt into its repository prefix with
  // VITE_BASE_PATH=/React-Linkpoint/ at build time.
  const base = env.VITE_BASE_PATH || '/';
  let appHost: string | undefined;
  try {
    appHost = env.APP_URL ? new URL(env.APP_URL).hostname : undefined;
  } catch {
    // Invalid API origin settings must not broaden the dev server's host allowlist.
  }
  const aiStudioPreview = Boolean(appHost?.startsWith('ais-dev-') && appHost.endsWith('.run.app'));
  const liveReload = env.DISABLE_HMR !== 'true' && !aiStudioPreview;

  return {
    base,
    plugins: [react(), ...(!liveReload ? [disablePreviewTransport()] : [])],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
        'react-native': 'react-native-web',
      },
    },
    server: {
      allowedHosts: appHost ? [appHost] : [],
      hmr: liveReload,
      forwardConsole: liveReload ? undefined : false,
      // Vite 8 can open a console-forwarding socket even with HMR disabled.
      // Preview proxies that reject upgrades need the transport disabled too.
      ws: liveReload ? (httpServer ? { server: httpServer } : undefined) : false,
    },
  };
}

export default defineConfig(({ mode }) => createViewerViteConfig(mode));
