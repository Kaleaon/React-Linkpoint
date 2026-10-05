import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../../server';

describe('server payload limit handling', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = await createApp();
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('accepts JSON bodies larger than 1MB without PayloadTooLargeError', async () => {
    // Create a 2.5MB payload
    const largeString = 'a'.repeat(2.5 * 1024 * 1024);
    const res = await fetch(`${baseUrl}/api/sl/cache/inventory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'test-agent', inventoryData: { blob: largeString } }),
    });

    expect(res.status).not.toBe(413);
  });

  it('accepts XML/text bodies larger than 100KB without PayloadTooLargeError', async () => {
    // 500KB XML text body (which would fail under default 100kb limit)
    const xmlBody = `<llsd><string>${'x'.repeat(500 * 1024)}</string></llsd>`;
    const res = await fetch(`${baseUrl}/api/proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/llsd+xml' },
      body: xmlBody,
    });

    expect(res.status).not.toBe(413);
  });
});
