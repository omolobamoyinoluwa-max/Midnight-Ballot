/**
 * Print the wallet address for a network, without syncing.
 *
 * The full deploy has to sync the wallet with the network before it prints
 * anything, which takes several minutes on a first run. If all you need is the
 * address to paste into a faucet, this derives it directly from the seed.
 *
 * Like `deploy.ts`, this creates and persists a wallet for the network the
 * first time you ask for one, so the address it prints is the same address the
 * later deploy will use.
 *
 *   npm run address -- --network preview
 *   npm run address -- --network preprod
 */
import { WebSocket } from 'ws';
import { resolveNetwork, getOrCreateSeed } from '../src/network';
import { createWallet } from '../src/wallet';

// @ts-expect-error Required for wallet construction
globalThis.WebSocket = WebSocket;

const { network, config: networkConfig, source } = resolveNetwork();

if (source !== 'flag') {
  process.stderr.write(
    `No --network flag given, defaulting to "${network}".\n` +
      `Pass one explicitly: npm run address -- --network preview|preprod\n\n`,
  );
}

const seed = getOrCreateSeed(network);
const ctx = await createWallet({ network, networkConfig, seed, restore: false });

process.stdout.write(`\n  Network:  ${network}\n`);
process.stdout.write(`  Address:  ${ctx.unshieldedKeystore.getBech32Address()}\n`);
process.stdout.write(`  Faucet:   ${networkConfig.faucet ?? '(none — local devnet)'}\n\n`);
process.stdout.write('  Fund this address at the faucet, then run the deploy.\n\n');

await ctx.wallet.stop();
process.exit(0);
