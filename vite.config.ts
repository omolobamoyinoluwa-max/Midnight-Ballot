import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import wasm from 'vite-plugin-wasm';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * Where `npm run compile` writes the Compact artifacts (`contract/`, `keys/`, `zkir/`).
 * This is the single source of truth — nothing is copied into `public/`, so the
 * served ZK keys can never drift from the deployed contract.
 */
const MANAGED_DIR = path.join(projectRoot, 'contracts', 'managed', 'ballot');

/**
 * Public path the browser fetches ZK artifacts from.
 * `FetchZkConfigProvider` appends `keys/<circuit>.prover`, `keys/<circuit>.verifier`
 * and `zkir/<circuit>.bzkir` to this base.
 */
const ZK_MOUNT = '/zk/ballot';

const OCTET_STREAM = 'application/octet-stream';

/**
 * Exposes the compiled circuit artifacts at `ZK_MOUNT` in dev, and copies them into
 * `dist/` on build so `vite preview` and any static host serve the same files.
 *
 * Only `keys/` and `zkir/` are published: the `contract/` bindings are imported as a
 * module and bundled, never fetched.
 */
function midnightZkAssets(): Plugin {
  const publish = ['keys', 'zkir'] as const;

  return {
    name: 'midnight-ballot:zk-assets',
    configureServer(server) {
      // connect() strips the mount prefix, so req.url arrives as `/keys/<id>.prover`.
      server.middlewares.use(ZK_MOUNT, (req, res, next) => {
        const relative = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/+/, '');
        const file = path.resolve(MANAGED_DIR, relative);

        // Reject anything that escapes MANAGED_DIR (e.g. `/..%2F..%2Fpackage.json`).
        if (!file.startsWith(MANAGED_DIR + path.sep)) return next();

        // Under this mount, "missing" must be a real 404. Falling through would hit
        // Vite's SPA fallback and hand the browser index.html with a 200, which the
        // SDK reports as a confusing "Expected ZK artifact, but received text/html".
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
          res.statusCode = 404;
          res.end(`No such ZK artifact: ${relative}\n`);
          return;
        }

        res.setHeader('Content-Type', OCTET_STREAM);
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      const dest = path.join(projectRoot, 'dist', ZK_MOUNT);
      for (const dir of publish) {
        const from = path.join(MANAGED_DIR, dir);
        if (!fs.existsSync(from)) continue;
        fs.cpSync(from, path.join(dest, dir), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), wasm(), midnightZkAssets()],
  resolve: {
    // Midnight's ledger and onchain runtimes are wasm-bindgen modules. If Vite
    // resolves two copies of them, each gets its own wasm instance and
    // `instanceof` checks across packages silently return false. Pinning both to
    // a single resolution keeps class identity intact. See the Midnight.js guide
    // `docs/guides/vite-wasm-resolution.md`.
    dedupe: ['@midnight-ntwrk/compact-runtime', '@midnight-ntwrk/onchain-runtime-v3'],
  },
  optimizeDeps: {
    // The WASM-bearing packages must not be pre-bundled by esbuild: it would
    // rewrite their `.wasm` imports into something the browser cannot instantiate.
    exclude: [
      '@midnight-ntwrk/compact-runtime',
      '@midnight-ntwrk/ledger-v8',
      '@midnight-ntwrk/onchain-runtime-v3',
      '@midnight-ntwrk/midnight-js-protocol',
    ],
  },
  build: {
    target: 'es2022',
    // The prover keys are megabytes of WASM-adjacent data, so warn on genuinely
    // large JS chunks only.
    chunkSizeWarningLimit: 2048,
  },
});
