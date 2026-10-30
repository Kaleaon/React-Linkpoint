import { afterEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import { createServer, resolveConfig } from 'vite';
import { createViewerViteConfig } from '../../../vite.config.mts';

afterEach(() => vi.unstubAllEnvs());

async function resolvedPreviewConfig() {
  return resolveConfig(
    { ...createViewerViteConfig('test', http.createServer()), configFile: false },
    'serve',
  );
}

describe('preview development transport', () => {
  it('disables the WebSocket transport as well as HMR when requested', async () => {
    vi.stubEnv('DISABLE_HMR', 'true');
    vi.stubEnv('APP_URL', '');
    const config = await resolvedPreviewConfig();
    expect(config.server.hmr).toBe(false);
    expect(config.server.ws).toBe(false);
  });

  it('serves a preview client with CSS helpers and no connection attempt', async () => {
    vi.stubEnv('DISABLE_HMR', 'true');
    vi.stubEnv('APP_URL', '');
    const config = createViewerViteConfig('test');
    const server = await createServer({
      ...config,
      configFile: false,
      server: { ...config.server, middlewareMode: true },
    });
    try {
      const client = await server.transformRequest('/@vite/client');
      expect(client?.code).toContain('updateStyle');
      expect(client?.code).not.toContain('transport.connect(createHMRHandler(handleMessage));');
    } finally {
      await server.close();
    }
  });

  it('disables preview transport for an AI Studio APP_URL and allows its exact host', async () => {
    vi.stubEnv('DISABLE_HMR', '');
    vi.stubEnv('APP_URL', 'https://ais-dev-preview.us-east1.run.app');
    const config = await resolvedPreviewConfig();
    expect(config.server.ws).toBe(false);
    expect(config.server.allowedHosts).toContain('ais-dev-preview.us-east1.run.app');
    expect(config.server.allowedHosts).not.toBe(true);
  });

  it('uses the supplied HTTP server for ordinary development', async () => {
    vi.stubEnv('DISABLE_HMR', '');
    vi.stubEnv('APP_URL', '');
    const server = http.createServer();
    const config = await resolveConfig(
      { ...createViewerViteConfig('test', server), configFile: false },
      'serve',
    );
    expect(config.server.hmr).not.toBe(false);
    expect(config.server.ws).toMatchObject({ server });
  });
});
