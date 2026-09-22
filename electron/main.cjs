const { app, BrowserWindow, ipcMain } = require('electron');
const dns = require('node:dns').promises;
const net = require('node:net');
const path = require('node:path');
const { ViewerSession } = require('./viewer-session.cjs');

const LOGIN_HOSTS = new Set([
  'login.agni.lindenlab.com',
  'login.aditi.lindenlab.com',
  'login.osgrid.org',
  'grid.kitely.com',
  ...String(process.env.SL_ALLOWED_LOGIN_HOSTS || '').split(',').map((host) => host.trim().toLowerCase()).filter(Boolean),
]);
const permittedOrigins = new Set();
const viewerSessions = new Map();

function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const value = address.toLowerCase();
  return value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb');
}

async function assertSafeTarget(rawUrl) {
  const target = new URL(rawUrl);
  if (target.protocol !== 'https:' || target.username || target.password) throw new Error('Only credential-free HTTPS grid endpoints are allowed');
  const host = target.hostname.toLowerCase();
  if (!LOGIN_HOSTS.has(host) && !permittedOrigins.has(target.origin)) throw new Error('Grid endpoint is not authorized for this session');
  return target;
}

ipcMain.handle('linkpoint:allow-login', async (_event, rawUrl) => {
  const target = new URL(rawUrl);
  if (target.protocol !== 'https:' || target.username || target.password) throw new Error('Only credential-free HTTPS grid endpoints are allowed');
  const addresses = await dns.lookup(target.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error('Private or unresolved grid endpoints are not allowed');
  LOGIN_HOSTS.add(target.hostname.toLowerCase());
  return true;
});

function learnCapabilityOrigins(text) {
  for (const match of text.matchAll(/https:\/\/[^\s<"']+/g)) {
    try { permittedOrigins.add(new URL(match[0].replace(/&amp;/g, '&')).origin); } catch { /* ignore malformed response text */ }
  }
}

ipcMain.handle('linkpoint:request', async (_event, request) => {
  const target = await assertSafeTarget(request.url);
  const response = await fetch(target, {
    method: request.method || 'GET',
    headers: request.headers || {},
    body: ['GET', 'HEAD'].includes(request.method || 'GET') ? undefined : request.body,
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  if (response.ok) learnCapabilityOrigins(text);
  return { ok: response.ok, status: response.status, statusText: response.statusText, text, headers: Object.fromEntries(response.headers.entries()) };
});

function sessionFor(event) {
  let session = viewerSessions.get(event.sender.id);
  if (!session) {
    session = new ViewerSession((type, data) => {
      if (!event.sender.isDestroyed()) event.sender.send('linkpoint:viewer-event', { type, data });
    });
    viewerSessions.set(event.sender.id, session);
    event.sender.once('destroyed', () => {
      viewerSessions.delete(event.sender.id);
      void session.close();
    });
  }
  return session;
}

ipcMain.handle('linkpoint:viewer-connect', async (event, request) => {
  const target = await assertSafeTarget(request.loginUrl);
  return sessionFor(event).connect({ ...request, loginUrl: target.toString() });
});
ipcMain.handle('linkpoint:viewer-chat', (event, request) => sessionFor(event).sendChat(request.message, request.channel, request.type));
ipcMain.handle('linkpoint:viewer-disconnect', async (event) => {
  const session = viewerSessions.get(event.sender.id);
  viewerSessions.delete(event.sender.id);
  if (session) await session.close();
});

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 420,
    minHeight: 640,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  window.removeMenu();
  window.once('ready-to-show', () => window.show());
  window.loadFile(path.join(__dirname, '../dist/index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
