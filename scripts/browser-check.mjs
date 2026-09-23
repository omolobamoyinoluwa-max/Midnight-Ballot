/**
 * Headless-browser regression check for the Midnight Ballot dApp.
 *
 *   npm run check:browser                      # checks the live deployment
 *   TARGET=http://127.0.0.1:4173 npm run check:browser   # checks a local build
 *
 * Requires Playwright and its browser, neither of which is a project dependency:
 *
 *   npm i -D playwright && npx playwright install chromium
 *   # on a bare Linux image, also: npx playwright install-deps chromium
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * Three classes of failure are invisible to `npm test`, `tsc` and `vite build`,
 * and this script is the only thing in the repo that catches them:
 *
 *   1. **Node-only globals in the browser bundle.** Midnight's SDK calls
 *      `Buffer.from(...)` for hex, which throws `ReferenceError` in a browser —
 *      and it breaks the credential store, the vote path and the tally read.
 *      tsc accepts it (`@types/node` declares `Buffer`) and the build succeeds
 *      (a bare global is not a module-resolution failure).
 *   2. **The audit criterion itself.** "The private input is never shown" cannot
 *      be asserted from source inspection in any way that stays true as the UI
 *      changes. This seeds a credential and asserts on the rendered DOM.
 *   3. **A blank page.** A runtime error before React mounts yields a 200 with
 *      an empty `<div id="root">`.
 */

const TARGET = process.env.TARGET ?? 'https://midnight-ballot-one.vercel.app';
const OUT = process.env.OUT ?? 'docs/screenshots/04-dapp.png';

/** A fixed credential, pre-seeded to put the page in the returning-voter state. */
const SECRET_HEX = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
const SECRET_STORAGE_KEY = 'midnight-ballot:voter-secret:v1';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed. Run:\n');
  console.error('  npm i -D playwright && npx playwright install chromium\n');
  process.exit(2);
}

const failures = [];
const check = (label, pass, detail = '') => {
  console.log(`  ${pass ? '\u2713' : '\u2717'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures.push(label);
};

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 1100 },
  deviceScaleFactor: 2,
});

// Runs before any app script, so the credential exists from the first render.
await page.addInitScript(
  ([key, value]) => window.localStorage.setItem(key, value),
  [SECRET_STORAGE_KEY, SECRET_HEX],
);

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('requestfailed', (r) =>
  failedRequests.push(`${r.url()} — ${r.failure()?.errorText ?? 'unknown'}`),
);

console.log(`\ntarget: ${TARGET}\n`);

const response = await page.goto(TARGET, { waitUntil: 'load', timeout: 90_000 });
await page.waitForSelector('#root > *', { timeout: 60_000 });
await page.waitForTimeout(2000);

console.log('— page —');
check('HTTP 200', response?.status() === 200, `status ${response?.status()}`);
check(
  'React mounted',
  (await page.evaluate(() => document.getElementById('root')?.children.length ?? 0)) > 0,
);

/**
 * The exact API surface `@midnight-ntwrk/compact-runtime` depends on. Asserting
 * the semantics, not just the presence of the global: a stub that cannot
 * `Buffer.from(hex, 'hex')` would pass a presence check and still break voting.
 */
console.log('\n— Node globals the Midnight SDK needs (see src/polyfills.ts) —');
const bufferCheck = await page.evaluate(() => {
  const B = globalThis.Buffer;
  if (!B) return { present: false };
  const bytes = B.from('a1b2c3d4', 'hex');
  return {
    present: true,
    fromHex: bytes instanceof Uint8Array && bytes.length === 4 && bytes[0] === 0xa1,
    toHex: B.from(bytes).toString('hex') === 'a1b2c3d4',
  };
});
check('Buffer global is present', bufferCheck.present === true);
check('Buffer.from(hex, "hex") decodes', bufferCheck.fromHex === true);
check('Buffer.from(bytes).toString("hex") encodes', bufferCheck.toHex === true);

console.log('\n— WASM (ledger + onchain runtime) —');
const resources = await page.evaluate(() =>
  performance.getEntriesByType('resource').map((r) => r.name),
);
check('both WASM modules loaded', resources.filter((u) => u.includes('.wasm')).length === 2);

console.log('\n— the credential round-tripped (proves the hex helpers work) —');
const body = await page.locator('body').innerText();
check(
  'pre-seeded credential is recognised as held',
  /credential is held in this browser/i.test(body),
);

console.log('\n— AUDIT CRITERION: the private input is never displayed —');
const dom = await page.evaluate(() => document.documentElement.outerHTML);
check('credential value not in rendered text', !body.toLowerCase().includes(SECRET_HEX));
check('credential value not anywhere in the DOM', !dom.toLowerCase().includes(SECRET_HEX));
check('no `voterSecret` identifier in visible text', !body.includes('voterSecret'));
check('no `getVoterSecret` in visible text', !body.includes('getVoterSecret'));
check(
  'no stray 64-char hex in visible text',
  !(body.match(/\b[0-9a-f]{64}\b/gi) ?? []).some((h) => !h.toLowerCase().startsWith('1cdf9799')),
);

console.log('\n— required UI present —');
for (const [label, needle] of [
  ['wallet connect control', 'Connect Lace wallet'],
  ['wallet-not-installed notice', 'No Midnight wallet detected'],
  ['on-chain tally panel', 'On-chain tally'],
  ['privacy model panel', 'Privacy model'],
  ['privacy claim', 'Privacy claim'],
  ['proof label', 'Proved without revealing your input'],
  ['preprod contract address', '1cdf9799'],
]) {
  check(label, body.includes(needle));
}

console.log('\n— no runtime errors —');
check('no console errors', consoleErrors.length === 0, consoleErrors.join(' | '));
check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
check('no failed requests', failedRequests.length === 0, failedRequests.join(' | '));

await page.screenshot({ path: OUT, fullPage: true });
console.log(`\nscreenshot: ${OUT}`);

await browser.close();

if (failures.length) {
  console.error(`\n\u2717 ${failures.length} check(s) failed:`);
  for (const f of failures) console.error(`   - ${f}`);
  process.exit(1);
}
console.log('\n\u2713 all checks passed\n');
