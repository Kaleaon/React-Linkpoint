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
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Second Life Viewer Workbench</h2>
        <p className="text-sm text-gray-600">Protocol status: <span className="font-mono">{status}</span> • Initialized: {ready ? 'yes' : 'no'}</p>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <form onSubmit={handleLogin} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
          <h3 className="font-semibold">Login</h3>
          <label className="block text-sm">
            Grid
            <select className="mt-1 w-full rounded border border-gray-300 p-2" value={grid} onChange={(e) => setGrid(e.target.value)}>
              <option value="agni">Second Life (Agni)</option>
              <option value="aditi">Second Life Beta (Aditi)</option>
              <option value="osgrid">OSGrid</option>
            </select>
          </label>
          <label className="block text-sm">
            Username
            <input className="mt-1 w-full rounded border border-gray-300 p-2" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="first last" />
          </label>
          <label className="block text-sm">
            Password
            <input type="password" className="mt-1 w-full rounded border border-gray-300 p-2" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
            Remember username + grid
          </label>
          <button className="w-full rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700" type="submit">Connect</button>
        </form>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm lg:col-span-2">
          <h3 className="mb-2 font-semibold">World</h3>
          <div className="h-64 overflow-hidden rounded border border-gray-200 bg-gray-50">
            <canvas id="world-canvas" className="h-full w-full" />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Region: <span id="region-name">Unknown</span> • Coordinates: <span id="coordinates">0, 0, 0</span>
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="font-semibold">Local Chat</h3>
          <div className="mt-2 h-56 overflow-y-auto rounded border border-gray-200 p-2 text-sm">
            {messages.length === 0 ? <p className="text-gray-500">No messages yet.</p> : messages.map((msg) => (
              <p key={msg.id} className="mb-1"><span className="font-semibold">{msg.sender}:</span> {msg.text}</p>
            ))}
          </div>
          <form className="mt-2 flex gap-2" onSubmit={handleSendChat}>
            <input className="flex-1 rounded border border-gray-300 p-2 text-sm" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Type chat message" />
            <button className="rounded bg-gray-800 px-3 py-2 text-sm text-white" type="submit">Send</button>
          </form>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="font-semibold">Inventory</h3>
          <div className="mt-2 h-64 overflow-y-auto rounded border border-gray-200 p-2 text-sm">
            {inventoryRows.length === 0 ? (
              <p className="text-gray-500">Inventory will populate after successful login and caps fetch.</p>
            ) : inventoryRows.map((row) => (
              <p key={row.id} style={{ paddingLeft: `${row.depth * 14}px` }}>
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
