import { preview } from 'vite';

const port = Number(process.env.PORT) || 3000;
const host = '0.0.0.0';

console.log(`[server] Initializing Vtab AI Leads & Marketing Agent production server on ${host}:${port}...`);

try {
  const server = await preview({
    preview: {
      port,
      host,
      allowedHosts: true,
    },
  });

  console.log(`[server] Service ready on port ${port}`);
  server.printUrls();
} catch (err) {
  console.error('[server] Failed to start:', err);
  process.exit(1);
}
