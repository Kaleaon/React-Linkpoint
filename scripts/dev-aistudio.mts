// AI Studio previews may reject WebSocket upgrades. Serve the full viewer/API
// with Vite's development transport disabled; reload the preview after edits.
process.env.DISABLE_HMR = 'true';
await import('../server.ts');
