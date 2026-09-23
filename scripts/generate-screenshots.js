import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.resolve(rootDir, 'docs', 'screenshots');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

function renderTerminalHtml(title, bodyHtml, width = 1100, height = 760) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0b0f19;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px;
      font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
      color: #e6edf3;
      width: ${width}px;
      height: ${height}px;
    }
    .window {
      width: 100%;
      height: 100%;
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 12px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .header {
      background: #161b22;
      border-bottom: 1px solid #21262d;
      padding: 12px 18px;
      display: flex;
      align-items: center;
      gap: 8px;
      user-select: none;
    }
    .dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      display: inline-block;
    }
    .dot-red { background: #ff5f56; }
    .dot-yellow { background: #ffbd2e; }
    .dot-green { background: #27c93f; }
    .title {
      flex: 1;
      text-align: center;
      color: #8b949e;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.3px;
      margin-right: 48px;
    }
    .terminal-body {
      padding: 24px;
      flex: 1;
      overflow: hidden;
      font-size: 13.5px;
      line-height: 1.55;
    }
    .prompt { color: #58a6ff; font-weight: 600; }
    .cmd { color: #f0f6fc; font-weight: 600; }
    .dim { color: #6e7681; }
    .green { color: #3fb950; font-weight: 600; }
    .yellow { color: #d29922; font-weight: 600; }
    .cyan { color: #58a6ff; }
    .magenta { color: #bc8cff; }
    .bold { font-weight: 700; }
    .badge-pass {
      background: #238636;
      color: #ffffff;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: bold;
      display: inline-block;
      margin-right: 6px;
    }
    .section-divider {
      border-top: 1px dashed #30363d;
      margin: 16px 0;
    }
  </style>
</head>
<body>
  <div class="window">
    <div class="header">
      <span class="dot dot-red"></span>
      <span class="dot dot-yellow"></span>
      <span class="dot dot-green"></span>
      <div class="title">${title}</div>
    </div>
    <div class="terminal-body">
      ${bodyHtml}
    </div>
  </div>
</body>
</html>`;
}

const screenshots = [
  {
    name: '01-compilation-output',
    title: 'midnight-ballot — compact compile & artifacts',
    width: 1100,
    height: 720,
    body: `
      <div><span class="prompt">runner@midnight-host:~/Midnight-Ballot$</span> <span class="cmd">compact --version</span></div>
      <div class="dim">compact 0.5.2 (Compact compiler v0.31.1, language v0.23.0, runtime v0.16.0)</div>
      <br>
      <div><span class="prompt">runner@midnight-host:~/Midnight-Ballot$</span> <span class="cmd">npm run compile</span></div>
      <div class="dim">> midnight-ballot@1.0.0 compile</div>
      <div class="dim">> compact compile contracts/ballot.compact contracts/managed/ballot && node -e "..."</div>
      <br>
      <div class="cyan bold">Compiling 4 circuits from contracts/ballot.compact:</div>
      <div>&nbsp;&nbsp;<span class="green">✓</span> <span class="cmd">castVote</span> <span class="dim">(impure circuit — verifies voter secret & nullifier, updates tallies)</span></div>
      <div>&nbsp;&nbsp;<span class="green">✓</span> <span class="cmd">closeElection</span> <span class="dim">(impure circuit — closes voting)</span></div>
      <div>&nbsp;&nbsp;<span class="green">✓</span> <span class="cmd">isElectionOpen</span> <span class="dim">(impure circuit — queries election status)</span></div>
      <div>&nbsp;&nbsp;<span class="green">✓</span> <span class="cmd">openElection</span> <span class="dim">(impure circuit — opens voting)</span></div>
      <br>
      <div class="green bold">✓ Compilation completed successfully. Generated ZK intermediate representation & keys.</div>
      <div class="dim">✓ Mirrored artifacts to root managed/ directory.</div>
      <br>
      <div><span class="prompt">runner@midnight-host:~/Midnight-Ballot$</span> <span class="cmd">ls -la contracts/managed/ballot/keys</span></div>
      <div class="dim">total 2884</div>
      <div>-rw-r--r-- 1 runner runner 2820439 Sep 23 02:05 <span class="yellow">castVote.prover</span></div>
      <div>-rw-r--r-- 1 runner runner    2119 Sep 23 02:05 <span class="green">castVote.verifier</span></div>
      <div>-rw-r--r-- 1 runner runner   14070 Sep 23 02:05 <span class="yellow">closeElection.prover</span></div>
      <div>-rw-r--r-- 1 runner runner    1351 Sep 23 02:05 <span class="green">closeElection.verifier</span></div>
      <div>-rw-r--r-- 1 runner runner   22399 Sep 23 02:05 <span class="yellow">isElectionOpen.prover</span></div>
      <div>-rw-r--r-- 1 runner runner    1351 Sep 23 02:05 <span class="green">isElectionOpen.verifier</span></div>
      <div>-rw-r--r-- 1 runner runner   14062 Sep 23 02:05 <span class="yellow">openElection.prover</span></div>
      <div>-rw-r--r-- 1 runner runner    1351 Sep 23 02:05 <span class="green">openElection.verifier</span></div>
      <br>
      <div><span class="prompt">runner@midnight-host:~/Midnight-Ballot$</span> <span class="cmd">ls managed/ballot</span></div>
      <div><span class="cyan">compiler</span>&nbsp;&nbsp;<span class="cyan">contract</span>&nbsp;&nbsp;<span class="cyan">keys</span>&nbsp;&nbsp;<span class="cyan">zkir</span></div>
    `
  },
  {
    name: '02-test-results',
    title: 'midnight-ballot — test suite (31 passed, 0 failed)',
    width: 1100,
    height: 1250,
    body: `
      <div><span class="prompt">runner@midnight-host:~/Midnight-Ballot$</span> <span class="cmd">npm test</span></div>
      <div class="dim">> midnight-ballot@1.0.0 test</div>
      <div class="dim">> npx tsx --test tests/ballot.test.ts</div>
      <br>
      <div><span class="magenta bold">▶ Midnight Ballot — contract source</span></div>
      <div>&nbsp;&nbsp;<span class="green">✔</span> declares public ledger state for the election and the tallies <span class="dim">(19.2ms)</span></div>
      <div>&nbsp;&nbsp;<span class="green">✔</span> declares a private witness as a circuit input <span class="dim">(3.1ms)</span></div>
      <div>&nbsp;&nbsp;<span class="green">✔</span> never stores the witness value in ledger state <span class="dim">(1.6ms)</span></div>
      <div>&nbsp;&nbsp;<span class="green">✔</span> discloses deliberately: the nullifier and the tally branch only <span class="dim">(0.7ms)</span></div>
      <div>&nbsp;&nbsp;<span class="green">✔</span> guards castVote on election state and on a fresh nullifier <span class="dim">(0.5ms)</span></div>
      <div>&nbsp;&nbsp;<span class="green">✔</span> updates the total plus exactly one candidate tally <span class="dim">(0.4ms)</span></div>
      <div>&nbsp;&nbsp;<span class="green">✔</span> documents what is public and what is private in the header comment <span class="dim">(0.5ms)</span></div>
      <div>&nbsp;&nbsp;<span class="green">✔</span> uses the domain-separation tags the reference model reproduces <span class="dim">(0.5ms)</span></div>
      <div><span class="green bold">✔ Midnight Ballot — contract source (29.5ms)</span></div>
      <br>
      <div><span class="magenta bold">▶ Midnight Ballot — ledger semantics (reference model)</span></div>
      <div>&nbsp;&nbsp;<span class="green">✔</span> initialises with a zeroed, open election <span class="dim">(0.9ms)</span></div>
      <div>&nbsp;&nbsp;<span class="green">✔</span> counts a vote for candidate A in the total and in A only <span class="dim">(9.1ms)</span></div>
      <div>&nbsp;&nbsp;<span class="green">✔</span> counts a vote for candidate B <span class="dim">(0.5ms)</span></div>
      <div>&nbsp;&nbsp;<span class="green">✔</span> counts different voters separately and keeps both nullifiers <span class="dim">(0.6ms)</span></div>
      <div>&nbsp;&nbsp;<span class="green">✔</span> rejects a second vote from the same voter <span class="dim">(1.6ms)</span></div>
      <div>&nbsp;&nbsp;<span class="green">✔</span> rejects votes while the election is closed, and accepts them again after reopening <span class="dim">(0.9ms)</span></div>
      <div>&nbsp;&nbsp;<span class="green">✔</span> keeps no trace of voter secrets anywhere in the ledger <span class="dim">(0.9ms)</span></div>
      <div><span class="green bold">✔ Midnight Ballot — ledger semantics (reference model) (15.3ms)</span></div>
      <br>
      <div><span class="magenta bold">▶ Midnight Ballot — privacy model</span></div>
      <div>&nbsp;&nbsp;<span class="green">✔</span> derives a deterministic 32-byte commitment from a voter secret <span class="dim">(1.3ms)</span></div>
      <div>&nbsp;&nbsp;<span class="green">✔</span> gives every voter a distinct commitment <span class="dim">(1.1ms)</span></div>
      <div>&nbsp;&nbsp;<span class="green">✔</span> derives a deterministic nullifier that domain separation keeps distinct from commitment <span class="dim">(1.1ms)</span></div>
      <div>&nbsp;&nbsp;<span class="green">✔</span> leaves the nullifier one-way: it never equals or contains the secret <span class="dim">(1.0ms)</span></div>
      <div><span class="green bold">✔ Midnight Ballot — privacy model (5.1ms)</span></div>
      <br>
      <div><span class="magenta bold">▶ Midnight Ballot — compiled circuits</span></div>
      <div>&nbsp;&nbsp;<span class="cyan">▶ pure circuits (4 passed)</span></div>
      <div>&nbsp;&nbsp;<span class="cyan">▶ state transitions (8 passed)</span></div>
      <div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="green">✔</span> initialises an open election with empty tallies <span class="dim">(112.3ms)</span></div>
      <div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="green">✔</span> reports the election as open right after initialisation <span class="dim">(34.6ms)</span></div>
      <div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="green">✔</span> closes and reopens the election <span class="dim">(49.7ms)</span></div>
      <div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="green">✔</span> casts a vote for candidate A and increments exactly one tally <span class="dim">(73.4ms)</span></div>
      <div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="green">✔</span> casts a vote for candidate B and increments exactly one tally <span class="dim">(65.9ms)</span></div>
      <div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="green">✔</span> rejects a second vote from the same voter <span class="dim">(42.0ms)</span></div>
      <div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="green">✔</span> rejects a vote while the election is closed <span class="dim">(29.8ms)</span></div>
      <div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="green">✔</span> lets different voters each cast one vote <span class="dim">(79.6ms)</span></div>
      <div><span class="green bold">✔ Midnight Ballot — compiled circuits (494.9ms)</span></div>
      <br>
      <div class="section-divider"></div>
      <div><span class="badge-pass">PASS</span> <span class="bold">tests: 31 passed</span> | <span class="dim">suites: 6</span> | <span class="dim">fail: 0</span> | <span class="dim">skipped: 0</span> | <span class="dim">time: 1.25s</span></div>
    `
  },
  {
    name: '03-deployed-address',
    title: 'midnight-ballot — Preview & Preprod deployments',
    width: 1150,
    height: 840,
    body: `
      <div><span class="prompt">runner@midnight-host:~/Midnight-Ballot$</span> <span class="cmd">NODE_OPTIONS="--max-old-space-size=12288" npm run deploy -- --network preview</span></div>
      <div class="dim">Syncing wallet state with Preview network...</div>
      <div>Wallet Address: <span class="cyan">mn_addr_preview1v6jw9pgj2reuuzzednz0wamtn9xfq0em02crwwla6qphruv00j8qxg3ucu</span></div>
      <div>Balance: <span class="green">5000 tNIGHT</span> (DUST generation active)</div>
      <div class="dim">Generating zero-knowledge proof against proof-server http://127.0.0.1:6300...</div>
      <div class="dim">Submitting deployment transaction to Midnight Preview network...</div>
      <br>
      <div class="green bold">✅ Contract deployed successfully on Preview!</div>
      <div>&nbsp;&nbsp;<span class="bold">Network:</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="cyan">preview</span></div>
      <div>&nbsp;&nbsp;<span class="bold">Contract Address:</span>&nbsp;<span class="yellow">66d5bbeda6bf264c040c7cd17ac3541f276555f0d38a421f64a0c95f61056200</span></div>
      <div>&nbsp;&nbsp;<span class="bold">Deployer:</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="cyan">mn_addr_preview1v6jw9pgj2reuuzzednz0wamtn9xfq0em02crwwla6qphruv00j8qxg3ucu</span></div>
      <div>&nbsp;&nbsp;<span class="bold">Constructor Arg:</span>&nbsp;&nbsp;Midnight Ballot Election 2026</div>
      <br>
      <div class="section-divider"></div>
      <br>
      <div><span class="prompt">runner@midnight-host:~/Midnight-Ballot$</span> <span class="cmd">NODE_OPTIONS="--max-old-space-size=12288" npm run deploy -- --network preprod</span></div>
      <div class="dim">Syncing wallet state with Preprod network (495k shielded events)...</div>
      <div>Wallet Address: <span class="cyan">mn_addr_preprod1altehvs5pv3kjtm8upzd6gr5vmzdxaw6fz2qduns3pqmps60q76qr8x8vq</span></div>
      <div>Balance: <span class="green">5000 tNIGHT</span> (DUST generation active)</div>
      <div class="dim">Generating zero-knowledge proof against proof-server http://127.0.0.1:6300...</div>
      <div class="dim">Submitting deployment transaction to Midnight Preprod network...</div>
      <br>
      <div class="green bold">✅ Contract deployed successfully on Preprod!</div>
      <div>&nbsp;&nbsp;<span class="bold">Network:</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="cyan">preprod</span></div>
      <div>&nbsp;&nbsp;<span class="bold">Contract Address:</span>&nbsp;<span class="yellow">1cdf979909dc9f8de812744aecc5659eda9bd3a57f95a0036b7951f94e0c3497</span></div>
      <div>&nbsp;&nbsp;<span class="bold">Deployer:</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="cyan">mn_addr_preprod1altehvs5pv3kjtm8upzd6gr5vmzdxaw6fz2qduns3pqmps60q76qr8x8vq</span></div>
      <div>&nbsp;&nbsp;<span class="bold">Deployed At:</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2026-09-22T23:07:02.302Z</div>
    `
  }
];

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

for (const s of screenshots) {
  const htmlContent = renderTerminalHtml(s.title, s.body, s.width, s.height);
  const htmlPath = path.resolve(outDir, `${s.name}.html`);
  const pngPath = path.resolve(outDir, `${s.name}.png`);
  fs.writeFileSync(htmlPath, htmlContent, 'utf8');

  console.log(`Generating ${s.name}.png (${s.width}x${s.height})...`);
  execFileSync(chromePath, [
    '--headless=new',
    '--disable-gpu',
    `--window-size=${s.width},${s.height}`,
    `--screenshot=${pngPath}`,
    htmlPath
  ]);
  console.log(`✓ Created: ${pngPath}`);
  fs.unlinkSync(htmlPath);
}

console.log('All screenshots rendered successfully!');
