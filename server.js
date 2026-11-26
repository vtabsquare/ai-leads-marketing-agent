import { preview } from 'vite';

// Prevent @supabase/supabase-js realtime init from throwing on Node < 22
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class {};
}

const port = Number(process.env.PORT) || 3005;
const host = process.env.HOST || '127.0.0.1';

console.log(`[server] Initializing Vtab AI Leads & Marketing Agent production server on ${host}:${port}...`);

try {
  const server = await preview({
    preview: {
      port,
      host,
      strictPort: true,
      allowedHosts: true,
    },
  });

  console.log(`[server] Service ready on port ${port}`);
  server.printUrls();
} catch (err) {
  console.error('[server] Failed to start:', err);
  process.exit(1);
}
