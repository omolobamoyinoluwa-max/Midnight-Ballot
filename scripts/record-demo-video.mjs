import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const TARGET = process.env.TARGET ?? 'https://midnight-ballot-one.vercel.app';
const OUT_DIR = path.resolve('docs');

console.log(`Starting demo video recording on: ${TARGET}`);

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
});

const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1.5,
  recordVideo: {
    dir: OUT_DIR,
    size: { width: 1280, height: 720 },
  },
});

const page = await context.newPage();

// Inject mock Lace wallet matching Midnight DApp connector spec
await page.addInitScript(() => {
  const mockConnectedApi = {
    getConfiguration: async () => ({
      networkId: 'preprod',
      indexerUri: 'https://indexer.preprod.midnight.network/api/v4/graphql',
      indexerWsUri: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
    }),
    getUnshieldedAddress: async () => ({
      unshieldedAddress: 'mn_addr_preprod1altehvs5pv3kjtm8upzd6gr5vmzdxaw6fz2qduns3pqmps60q76qr8x8vq',
    }),
    getShieldedAddresses: async () => ({
      shieldedCoinPublicKey: '00'.repeat(32),
      shieldedEncryptionPublicKey: '00'.repeat(32),
    }),
    getProvingProvider: async () => ({
      proveTx: async (tx) => tx,
      check: async () => true,
    }),
    balanceTx: async (tx) => tx,
    submitTx: async (tx) => '4f8a91b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0',
  };

  window.midnight = {
    lace: {
      name: 'Lace for Midnight',
      icon: '',
      apiVersion: '0.1.0',
      connect: async () => mockConnectedApi,
    },
  };
});

page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
page.on('pageerror', (err) => console.log('PAGE ERROR:', err));

console.log('Loading deployed application...');
await page.goto(TARGET, { waitUntil: 'load', timeout: 90000 });
await page.waitForSelector('#root > *', { timeout: 60000 });
await page.waitForTimeout(3000);

// Helper for smooth mouse movements
async function smoothMove(locator) {
  try {
    const box = await locator.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
      await page.waitForTimeout(800);
    }
  } catch (err) {
    // Ignore bounding box errors
  }
}

// ── Beat 1: Connect Lace Wallet (0:00 - 0:25) ──
console.log('Beat 1: Connect Lace wallet and show address');
await page.click('button:has-text("Connect Lace wallet")');
await page.waitForTimeout(4000);
console.log('Lace connected! Address displayed on screen.');
const addressElement = page.locator('dd.mono[title^="mn_addr"]');
if (await addressElement.isVisible()) {
  await smoothMove(addressElement);
}
await page.waitForTimeout(4000);

// ── Beat 2: Inspect Public Tally (0:25 - 0:45) ──
console.log('Beat 2: Inspecting public on-chain tally panel');
const tallySection = page.locator('section:has-text("On-chain tally")');
if (await tallySection.isVisible()) {
  await smoothMove(tallySection);
  await page.waitForTimeout(4000);
}

// ── Beat 3: Call Circuit & Proof Generation (0:45 - 1:20) ──
console.log('Beat 3: Showcase Circuit Call castVote');
const circuitSection = page.locator('section:has-text("Cast a private ballot")');
if (await circuitSection.isVisible()) {
  await smoothMove(circuitSection);
  const voteAliceBtn = page.locator('button:has-text("Vote Candidate A"), button:has-text("Vote Alice")').first();
  if (await voteAliceBtn.isVisible()) {
    await smoothMove(voteAliceBtn);
    try {
      if (await voteAliceBtn.isEnabled()) {
        await voteAliceBtn.click({ timeout: 2000 });
      }
    } catch {
      // Keep going
    }
  }
  await page.waitForTimeout(5000);
}

// ── Beat 4: Show Privacy Model & Claim (1:20 - 1:55) ──
console.log('Beat 4: Displaying Privacy Model and Privacy Claim');
const privacySection = page.locator('section:has-text("Privacy model")');
if (await privacySection.isVisible()) {
  await privacySection.scrollIntoViewIfNeeded();
  await smoothMove(privacySection);
  await page.waitForTimeout(5000);
}

// Focus on the audit label: "Proved without revealing your input"
const privacyBadge = page.locator('text=Proved without revealing your input');
if (await privacyBadge.isVisible()) {
  await privacyBadge.scrollIntoViewIfNeeded();
  await smoothMove(privacyBadge);
  await page.waitForTimeout(4000);
}

// Highlight Privacy Claim paragraph
const privacyClaim = page.locator('.claim');
if (await privacyClaim.isVisible()) {
  await privacyClaim.scrollIntoViewIfNeeded();
  await smoothMove(privacyClaim);
  await page.waitForTimeout(4000);
}

// Scroll back up to the top view
console.log('Smoothly returning to top overview...');
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
await page.waitForTimeout(3000);

console.log('Finalizing video recording...');
await page.close();
await context.close();
await browser.close();

// Check created video file and rename to docs/demo-video.webm
const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.webm') && f !== 'ui-walkthrough-broll-no-wallet.webm');
if (files.length > 0) {
  const generatedVideo = path.join(OUT_DIR, files[0]);
  const targetVideo = path.join(OUT_DIR, 'demo-video.webm');
  if (fs.existsSync(targetVideo)) {
    fs.unlinkSync(targetVideo);
  }
  fs.renameSync(generatedVideo, targetVideo);
  const sizeMB = (fs.statSync(targetVideo).size / (1024 * 1024)).toFixed(2);
  console.log(`✓ Demo video recorded and saved to: ${targetVideo} (${sizeMB} MB)`);
} else {
  console.log('Video recorded.');
}
