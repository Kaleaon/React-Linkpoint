#!/usr/bin/env node

const baseUrl = (process.env.LINKPOINT_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const loginUrl = process.env.SL_LOGIN_URL;
const username = process.env.SL_USERNAME;
const password = process.env.SL_PASSWORD;
const allowMutations = process.env.SL_SMOKE_ALLOW_MUTATIONS === '1';

if (!loginUrl || !username || !password) {
  console.error('Live-grid smoke test requires SL_LOGIN_URL, SL_USERNAME, and SL_PASSWORD.');
  console.error('Start Linkpoint first, then provide credentials for a dedicated OpenSim/Aditi test account.');
  process.exit(2);
}

async function jsonRequest(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || `HTTP ${response.status}`);
  return data;
}

const results = [];
let sessionId;

async function check(area, name, operation) {
  const started = performance.now();
  try {
    const value = await operation();
    results.push({ area, name, status: 'pass', durationMs: Math.round(performance.now() - started) });
    return value;
  } catch (error) {
    results.push({ area, name, status: 'fail', error: error instanceof Error ? error.message : String(error) });
    return undefined;
  }
}

try {
  const login = await check('session', 'login and region handshake', () => jsonRequest('/api/sl/connect', {
    loginUrl,
    username,
    password,
    start: process.env.SL_START || 'last',
    mfaToken: process.env.SL_MFA_TOKEN || undefined,
    mfaHash: process.env.SL_MFA_HASH || undefined,
  }));
  sessionId = login?.sessionId;
  if (!sessionId) throw new Error('Login did not return a viewer session');

  const call = (method, params) => jsonRequest('/api/sl/call', { sessionId, method, params });
  await check('graphics', 'scene objects and render assets', () => call('getSceneSnapshot'));
  await check('graphics', 'scene object compatibility view', () => call('getSceneObjects'));
  await check('world', 'map blocks', () => call('getMapBlocks', { minX: 999, minY: 999, maxX: 1001, maxY: 1001 }));
  await check('screens', 'inventory', () => call('getInventory'));
  await check('screens', 'friends', () => call('getFriends'));
  await check('screens', 'groups', () => call('getGroups'));
  await check('screens', 'balance', () => call('getBalance'));
  await check('screens', 'people directory search', () => call('searchDir', { category: 'people', query: username, start: 0 }));
  await check('diagnostics', 'live session telemetry', () => call('getDiagnostics'));

  if (allowMutations) {
    await check('movement', 'forward control', async () => {
      await call('setMovement', { forward: 1 });
      await new Promise(resolve => setTimeout(resolve, 250));
      return call('setMovement', { forward: 0, right: 0, up: 0, turn: 0, run: false });
    });
    await check('chat', 'local chat round trip request', () => call('sendChat', {
      message: `[Linkpoint smoke test ${new Date().toISOString()}]`,
      channel: 0,
      type: 1,
    }));
  } else {
    results.push({ area: 'movement/chat', name: 'mutating checks', status: 'skip', error: 'Set SL_SMOKE_ALLOW_MUTATIONS=1 to enable' });
  }
} catch (error) {
  results.push({
    area: 'session',
    name: 'complete live-grid suite',
    status: 'fail',
    error: error instanceof Error ? error.message : String(error),
  });
} finally {
  if (sessionId) {
    await jsonRequest('/api/sl/disconnect', { sessionId }).catch(error => {
      results.push({ area: 'session', name: 'disconnect', status: 'fail', error: error.message });
    });
  }
}

console.table(results);
const failed = results.filter(result => result.status === 'fail');
console.log(JSON.stringify({ baseUrl, loginUrl, mutationsEnabled: allowMutations, results }, null, 2));
if (failed.length) process.exitCode = 1;
