import React, { useState } from 'react';
import { app } from '../linkpoint/app';

interface LoginScreenProps {
  onLoginSuccess: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [grid, setGrid] = useState('agni');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [status, setStatus] = useState('IDLE');
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please enter both username and password.');
      return;
    }

    setStatus('CONNECTING');
    setError(null);

    try {
      const [first, last = 'Resident'] = username.trim().split(/\s+/);

      const success = await app.auth.login(
        first,
        last,
        password,
        grid as any
      );

      if (success) {
        setStatus('CONNECTED');
        if (rememberMe) {
          (app.auth as any).saveSession(first, last, grid);
        }
        onLoginSuccess();
      } else {
        setStatus('ERROR');
        setError('Login failed. Please check your credentials.');
      }
    } catch (err: any) {
      setStatus('ERROR');
      setError(err.message || 'An error occurred during login.');
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#1e293b] bg-[#101a1c] p-6 shadow-2xl backdrop-blur-sm sm:p-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white">Linkpoint</h1>
          <p className="mt-2 text-sm text-[#e2e8f0]/70">Enter the grid.</p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label htmlFor="grid" className="block text-sm font-medium text-[#e2e8f0]/80">Grid</label>
            <div className="mt-1">
              <select
                id="grid"
                value={grid}
                onChange={(e) => setGrid(e.target.value)}
                className="w-full rounded-lg border border-[#1e293b] bg-[#1b2a2d] px-4 py-2.5 text-[#e2e8f0] outline-none transition focus:border-[#4a9eff] focus:ring-1 focus:ring-[#4a9eff]"
              >
                <option value="agni">Second Life (Agni)</option>
                <option value="aditi">Second Life Beta (Aditi)</option>
                <option value="osgrid">OSGrid</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="username" className="block text-sm font-medium text-[#e2e8f0]/80">Avatar Name</label>
            <div className="mt-1">
              <input
                id="username"
                type="text"
                placeholder="First Last"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-[#1e293b] bg-[#1b2a2d] px-4 py-2.5 text-[#e2e8f0] outline-none transition placeholder:text-[#e2e8f0]/40 focus:border-[#4a9eff] focus:ring-1 focus:ring-[#4a9eff]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[#e2e8f0]/80">Password</label>
            <div className="mt-1">
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-[#1e293b] bg-[#1b2a2d] px-4 py-2.5 text-[#e2e8f0] outline-none transition focus:border-[#4a9eff] focus:ring-1 focus:ring-[#4a9eff]"
              />
            </div>
          </div>

          <div className="flex items-center">
            <input
              id="remember"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-[#1e293b] bg-[#1b2a2d] text-[#6cff9a] focus:ring-[#6cff9a] focus:ring-offset-[#101a1c]"
            />
            <label htmlFor="remember" className="ml-2 block text-sm text-[#e2e8f0]/80">
              Remember me
            </label>
          </div>

          <button
            type="submit"
            disabled={status === 'CONNECTING'}
            className="mt-6 flex w-full justify-center rounded-lg bg-[#6cff9a] px-4 py-3 text-sm font-bold text-[#101a1c] shadow-lg shadow-[#6cff9a]/20 transition-all hover:bg-[#5be689] hover:shadow-[#6cff9a]/40 focus:outline-none focus:ring-2 focus:ring-[#6cff9a] focus:ring-offset-2 focus:ring-offset-[#101a1c] disabled:opacity-70"
          >
            {status === 'CONNECTING' ? 'CONNECTING...' : 'CONNECT'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginScreen;
