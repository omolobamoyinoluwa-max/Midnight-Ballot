/**
 * Browser polyfills. **Must be imported before anything that touches Midnight.js.**
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Midnight's SDK is written for Node and reaches for `Buffer` at runtime. The
 * sharpest example is `@midnight-ntwrk/compact-runtime`, whose hex helpers are:
 *
 *     export const fromHex = (s) => Buffer.from(s, 'hex');
 *     export const toHex   = (s) => Buffer.from(s).toString('hex');
 *
 * There is no `Buffer` in a browser, so both throw `ReferenceError: Buffer is
 * not defined`. That matters far beyond cosmetics:
 *
 *   • `toHex(tx.serialize())` is how a proven transaction is handed to the wallet
 *     for balancing *and* for submission — so the vote path cannot complete.
 *   • `fromHex(balanced.tx)` is how the wallet's response is read back.
 *   • `toHex(nullifier.bytes)` is how the public tally read reports the voter's
 *     nullifier.
 *
 * `Buffer` is also referenced by `midnight-js-utils`, the indexer public data
 * provider, the HTTP proof provider, the fetch ZK config provider and
 * `platform-js` — hence a global shim rather than avoiding the helper locally.
 *
 * ── Why this is easy to miss ─────────────────────────────────────────────────
 * TypeScript is happy (`@types/node` declares `Buffer`), `vite build` is happy
 * (a bare global reference is not a module resolution failure), and in Node —
 * where the tests and the CLI run — `Buffer` genuinely exists. The failure only
 * appears in a real browser, and the earlier version of this dApp swallowed it:
 * the credential read was inside a `try/catch`, so persistence silently did
 * nothing and the UI reported "not yet created" while the value sat in
 * `localStorage`.
 */

import { Buffer } from 'buffer';

const globals = globalThis as unknown as {
  Buffer?: unknown;
  global?: unknown;
};

// Do not clobber a host-provided implementation if one is already present.
globals.Buffer ??= Buffer;
// Some bundled dependencies feature-test bare `global`; point it at the real
// global object so those checks resolve the same way they do under Node.
globals.global ??= globalThis;

export {};
