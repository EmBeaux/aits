import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const cid = '[a-f0-9]{64}';
const reads = new RegExp(
  `^/api/aits/(?:lineage/(?:runs/|${cid}/|nodes/${cid}/(?:traceback/)?)?|` +
    `(?:duts|configs|verify)/${cid}/|commits/|audit/)$`,
  'i',
);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'AITS_');
  const target = new URL(env.AITS_API_URL || 'http://127.0.0.1:8000');
  if (
    !['http:', 'https:'].includes(target.protocol) ||
    target.username ||
    target.password ||
    target.pathname !== '/' ||
    target.search ||
    target.hash
  ) {
    throw new Error('AITS_API_URL must be an HTTP(S) origin without credentials.');
  }

  const readOnlyLedgerProxy = (request, response, next) => {
    const url = new URL(request.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/aits/')) return next();
    if (request.method !== 'GET' || !reads.test(url.pathname)) {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      return response.end(JSON.stringify({ detail: 'Ledger endpoint unavailable.' }));
    }
    return next();
  };

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
    plugins: [
      react(),
      viteSingleFile(),
      {
        name: 'local-ledger-read-routes',
        configureServer(server) {
          server.middlewares.use(readOnlyLedgerProxy);
        },
        configurePreviewServer(server) {
          server.middlewares.use(readOnlyLedgerProxy);
        },
      },
    ],
    server: local,
    preview: local,
    define: {
      __AITS_API_URL__: JSON.stringify(env.AITS_API_URL || 'http://127.0.0.1:8000'),
    },
  };
});
