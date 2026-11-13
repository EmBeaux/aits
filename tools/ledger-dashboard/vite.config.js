import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const reads = /^\/api\/aits\/(?:lineage\/(?:[a-f0-9]{64}\/)?|duts\/[a-f0-9]{64}\/|verify\/[a-f0-9]{64}\/)$/i;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'AITS_');
  const target = new URL(env.AITS_API_URL || 'http://127.0.0.1:8000');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) ||
      !['http:', 'https:'].includes(target.protocol) || target.username || target.password ||
      target.pathname !== '/' || target.search || target.hash) {
    throw new Error('AITS_API_URL must be a local HTTP(S) origin.');
  }

  function readOnlyLedgerProxy(request, response, next) {
    const url = new URL(request.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/aits/')) return next();
    if (request.method !== 'GET' || !reads.test(url.pathname)) {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      return response.end(JSON.stringify({ detail: 'Ledger endpoint unavailable.' }));
    }
    return next();
  }

  const proxy = {
    '/api/aits/': {
      target: target.origin,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api\/aits/, ''),
      configure(server) {
        server.on('proxyRes', (response) => {
          response.headers['cache-control'] = 'no-store';
        });
      },
    },
  };
  const local = { host: '127.0.0.1', port: 4173, strictPort: true, cors: false, proxy };

  return {
    plugins: [react(), {
      name: 'local-ledger-read-routes',
      configureServer(server) { server.middlewares.use(readOnlyLedgerProxy); },
      configurePreviewServer(server) { server.middlewares.use(readOnlyLedgerProxy); },
    }],
    server: local,
    preview: local,
  };
});
