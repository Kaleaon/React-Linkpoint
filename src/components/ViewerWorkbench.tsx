import React, { useEffect, useMemo, useState } from 'react';
import { app } from '../linkpoint/app';

function flattenInventoryTree(rootId: string | null) {
  if (!rootId) return [] as Array<{ id: string; name: string; type: 'folder' | 'item'; depth: number }>;

  const rows: Array<{ id: string; name: string; type: 'folder' | 'item'; depth: number }> = [];
  const walk = (id: string, depth: number) => {
    const folder = app.inventory.folders.get(id);
    if (!folder) return;
    rows.push({ id: folder.id, name: folder.name, type: 'folder', depth });

    for (const childId of folder.children || []) {
      const childFolder = app.inventory.folders.get(childId);
      if (childFolder) {
        walk(childFolder.id, depth + 1);
        continue;
      }

      const item = app.inventory.items.get(childId);
      if (item) {
        rows.push({ id: item.id, name: item.name, type: 'item', depth: depth + 1 });
      }
    }
  };

  walk(rootId, 0);
  return rows;
}

const ViewerWorkbench: React.FC = () => {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('IDLE');
  const [grid, setGrid] = useState('agni');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [inventoryVersion, setInventoryVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      await app.init();
      if (mounted) {
        setReady(true);
        setMessages([...app.chat.messages]);
      }
    };

    const onStateChange = (nextState: string) => setStatus(nextState);
    const onLoginSuccess = () => {
      setError(null);
      setMessages([...app.chat.messages]);
    };
    const onLoginFailed = (err: Error) => setError(err?.message || 'Login failed');
    const onMessage = () => setMessages([...app.chat.messages]);
    const onInventory = () => setInventoryVersion((x) => x + 1);

    app.protocol.on('state_changed', onStateChange);
    app.auth.on('login_success', onLoginSuccess);
    app.auth.on('login_failed', onLoginFailed);
    app.chat.on('message_received', onMessage);
    app.chat.on('message_sent', onMessage);
    app.inventory.on('inventory_loaded', onInventory);
    app.inventory.on('inventory_updated', onInventory);

    boot().catch((e) => setError(e?.message || 'Initialization error'));

    return () => {
      mounted = false;
      app.protocol.off('state_changed', onStateChange);
      app.auth.off('login_success', onLoginSuccess);
      app.auth.off('login_failed', onLoginFailed);
      app.chat.off('message_received', onMessage);
      app.chat.off('message_sent', onMessage);
      app.inventory.off('inventory_loaded', onInventory);
      app.inventory.off('inventory_updated', onInventory);
    };
  }, []);

  const inventoryRows = useMemo(() => {
    // inventoryVersion forces memo refresh after live updates
    void inventoryVersion;
    return flattenInventoryTree(app.inventory.rootFolder?.id || null);
  }, [inventoryVersion]);

  const statusTone = useMemo(() => {
    if (status === 'CONNECTED') return 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30';
    if (status === 'CONNECTING') return 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30';
    if (status === 'ERROR' || error) return 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30';
    return 'bg-slate-500/15 text-slate-300 ring-1 ring-slate-400/30';
  }, [error, status]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await app.auth.login(grid, username, password, rememberMe);
    } catch (e: any) {
      setError(e?.message || 'Failed to login');
    }
  };

  const handleSendChat = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!chatInput.trim()) return;
    await app.chat.sendMessage(chatInput.trim());
    setChatInput('');
  };

  return (
    <div className="space-y-5 text-slate-100">
      <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-5 shadow-[0_20px_65px_-35px_rgba(74,158,255,0.55)] backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">Linkpoint</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Second Life Viewer Workbench</h2>
            <p className="mt-1 text-sm text-slate-300">
              Connected tools for protocol state, world rendering, chat, and inventory.
            </p>
          </div>
          <div className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone}`}>
            {status}
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-300">
          Initialized: <span className="font-mono text-slate-100">{ready ? 'yes' : 'no'}</span>
        </p>
        {error ? <p className="mt-2 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-200 ring-1 ring-rose-500/30">{error}</p> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <form onSubmit={handleLogin} className="space-y-3 rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4 shadow-lg backdrop-blur">
          <h3 className="font-semibold text-white">Login</h3>
          <label className="block text-sm text-slate-200">
            Grid
            <select className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950/70 p-2 text-slate-100 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30" value={grid} onChange={(e) => setGrid(e.target.value)}>
              <option value="agni">Second Life (Agni)</option>
              <option value="aditi">Second Life Beta (Aditi)</option>
              <option value="osgrid">OSGrid</option>
            </select>
          </label>
          <label className="block text-sm text-slate-200">
            Username
            <input className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950/70 p-2 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="first last" />
          </label>
          <label className="block text-sm text-slate-200">
            Password
            <input type="password" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950/70 p-2 text-slate-100 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input className="h-4 w-4 accent-blue-500" type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
            Remember username + grid
          </label>
          <button className="w-full rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 px-3 py-2 font-semibold text-white shadow-md shadow-blue-900/30 transition hover:from-blue-400 hover:to-blue-500" type="submit">Connect</button>
        </form>

        <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4 shadow-lg backdrop-blur lg:col-span-2">
          <h3 className="mb-2 font-semibold text-white">World</h3>
          <div className="h-72 overflow-hidden rounded-xl border border-slate-700 bg-slate-950/80 shadow-inner">
            <canvas id="world-canvas" className="h-full w-full" />
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Region: <span id="region-name" className="text-slate-200">Unknown</span> • Coordinates: <span id="coordinates" className="text-slate-200">0, 0, 0</span>
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4 shadow-lg backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold text-white">Local Chat</h3>
            <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs text-blue-300 ring-1 ring-blue-500/30">
              {messages.length} messages
            </span>
          </div>
          <div className="mt-2 h-56 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-sm">
            {messages.length === 0 ? <p className="text-slate-500">No messages yet.</p> : messages.map((msg) => (
              <p key={msg.id} className="mb-1 text-slate-200"><span className="font-semibold text-blue-300">{msg.sender}:</span> {msg.text}</p>
            ))}
          </div>
          <form className="mt-2 flex gap-2" onSubmit={handleSendChat}>
            <input className="flex-1 rounded-lg border border-slate-600 bg-slate-950/70 p-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Type chat message" />
            <button className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white" type="submit">Send</button>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4 shadow-lg backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold text-white">Inventory</h3>
            <span className="rounded-full bg-slate-500/15 px-2 py-0.5 text-xs text-slate-300 ring-1 ring-slate-500/30">
              {inventoryRows.length} entries
            </span>
          </div>
          <div className="mt-2 h-64 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950/70 p-2 text-sm">
            {inventoryRows.length === 0 ? (
              <p className="text-slate-500">Inventory will populate after successful login and caps fetch.</p>
            ) : inventoryRows.map((row) => (
              <p key={row.id} className="text-slate-200" style={{ paddingLeft: `${row.depth * 14}px` }}>
                {row.type === 'folder' ? '📁' : '📄'} {row.name}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViewerWorkbench;
