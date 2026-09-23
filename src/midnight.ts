/**
 * Midnight Ballot — browser SDK wiring.
 *
 * Everything that talks to Midnight.js lives in this one module so the React
 * components stay presentational and the privacy-critical code is in a single,
 * reviewable place. There are four moving parts:
 *
 *   1. Wallet discovery + connection over the Midnight DApp Connector API
 *      (`window.midnight`). This is how the page reaches Lace.
 *   2. The provider set Midnight.js needs — public data, ZK artifacts, proving,
 *      balancing and submission — with the wallet as the trust boundary.
 *   3. The Compact contract binding: the compiled circuits plus our witnesses.
 *   4. A private-state provider that holds the voter credential for the session.
 *
 * ── Privacy invariant ────────────────────────────────────────────────────────
 * `voterSecret` is read by the `getVoterSecret` witness and nothing else. It is
 * never logged, never rendered, and never sent off-device. The only value that
 * leaves this module is the nullifier — `persistentHash` of the secret — which
 * the contract publishes on purpose so a second vote from the same credential is
 * detectable. See `contracts/ballot.compact` for the on-chain half of this.
 */

import type { Configuration, ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { findDeployedContract, type FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import {
  Binding,
  Proof,
  SignatureEnabled,
  Transaction,
  type FinalizedTransaction,
  type ProvingProvider as LedgerProvingProvider,
  type TransactionId,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import {
  createProofProvider,
  asContractAddress,
  type MidnightProviders,
  type PrivateStateId,
  type PrivateStateProvider,
  type ProofProvider,
  type UnboundTransaction,
} from '@midnight-ntwrk/midnight-js-types';
import { fromHex, toHex } from '@midnight-ntwrk/compact-runtime';
import type { ContractAddress, SigningKey } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';

import {
  Contract as BallotContract,
  ledger as ballotLedger,
  pureCircuits as ballotPureCircuits,
  type Ledger as BallotLedger,
  type Witnesses as BallotWitnesses,
} from '../contracts/managed/ballot/contract/index.js';

// ─── Configuration ───────────────────────────────────────────────────────────

/**
 * The network this dApp requires the wallet to be connected to. The Level 1
 * contract lives on Preprod, so a wallet on any other network is a hard error
 * rather than a silent mismatch.
 */
export const BALLOT_NETWORK_ID: string = import.meta.env.VITE_MIDNIGHT_NETWORK ?? 'preprod';

/**
 * Ledger address of the deployed ballot contract.
 *
 * Both networks the contract is deployed to are recorded in README.md; Preprod is
 * the default because that is the deployment this dApp talks to. Override with
 * `VITE_BALLOT_CONTRACT_ADDRESS` to point a build at another deployment.
 */
export const BALLOT_CONTRACT_ADDRESS: string =
  import.meta.env.VITE_BALLOT_CONTRACT_ADDRESS ??
  '1cdf979909dc9f8de812744aecc5659eda9bd3a57f95a0036b7951f94e0c3497';

/** Must match the `privateStateId` convention used by `src/deploy.ts`. */
export const BALLOT_PRIVATE_STATE_ID = 'ballotPrivateState';

/** Public path the ZK artifacts are served from (see `vite.config.ts`). */
const ZK_ASSETS_MOUNT = '/zk/ballot';

/** Circuits that carry a proof, i.e. the ones whose keys the browser fetches. */
export type BallotCircuitId = 'castVote' | 'openElection' | 'closeElection' | 'isElectionOpen';

/** The two choices `castVote` accepts. `Uint<0..2>` admits exactly {0, 1}. */
export const CANDIDATES = [
  { id: 0n, name: 'Candidate A' },
  { id: 1n, name: 'Candidate B' },
] as const;

export type CandidateId = (typeof CANDIDATES)[number]['id'];

// ─── Errors ──────────────────────────────────────────────────────────────────

export type WalletErrorCode =
  /** No Midnight wallet injected into the page. */
  | 'not-installed'
  /** The user declined the connection request in the wallet. */
  | 'rejected'
  /** The wallet is on a different network than the contract. */
  | 'network-mismatch'
  /** The wallet exposed no way to generate proofs. */
  | 'no-prover'
  /** Anything else — the original message is preserved. */
  | 'unknown';

/** A connection failure that the UI can render as a specific, actionable message. */
export class WalletError extends Error {
  readonly code: WalletErrorCode;

  constructor(code: WalletErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'WalletError';
    this.code = code;
  }
}

function messageOf(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}

// ─── Wallet discovery + connection ───────────────────────────────────────────

/** A wallet injected under `window.midnight`, as described by CAIP-372. */
export interface MidnightWallet {
  readonly key: string;
  readonly name: string;
  readonly icon: string;
  readonly apiVersion: string;
  readonly api: InitialAPI;
}

/**
 * Enumerate every Midnight wallet injected into the page.
 *
 * An empty result is the "wallet not installed" case — the caller turns it into a
 * message pointing at the Lace install page rather than a raw `undefined`.
 */
export function listMidnightWallets(): MidnightWallet[] {
  if (typeof window === 'undefined') return [];

  const registry = (window as unknown as { midnight?: Record<string, unknown> }).midnight;
  if (!registry || typeof registry !== 'object') return [];

  const wallets: MidnightWallet[] = [];
  for (const [key, value] of Object.entries(registry)) {
    const candidate = value as Partial<InitialAPI> | null;
    if (!candidate || typeof candidate.connect !== 'function') continue;
    wallets.push({
      key,
      name: typeof candidate.name === 'string' && candidate.name.length > 0 ? candidate.name : key,
      icon: typeof candidate.icon === 'string' ? candidate.icon : '',
      apiVersion: typeof candidate.apiVersion === 'string' ? candidate.apiVersion : 'unknown',
      api: candidate as InitialAPI,
    });
  }
  return wallets;
}

/** Everything the dApp needs after a successful wallet handshake. */
export interface WalletSession {
  readonly wallet: MidnightWallet;
  readonly api: ConnectedAPI;
  readonly config: Configuration;
  readonly unshieldedAddress: string;
  readonly coinPublicKey: string;
  readonly encryptionPublicKey: string;
}

function connectFailure(cause: unknown): WalletError {
  const raw = messageOf(cause);
  if (/reject|denied|cancel|declin|refus/i.test(raw)) {
    return new WalletError(
      'rejected',
      `You declined the connection request in ${BALLOT_NETWORK_ID === 'preprod' ? 'Lace' : 'your wallet'}. Approve it to continue.`,
      { cause },
    );
  }
  return new WalletError('unknown', `The wallet could not connect: ${raw}`, { cause });
}

/**
 * Connect to a discovered wallet and validate the result.
 *
 * Three failure modes are handled explicitly, because each needs a different
 * message and a different user action: the request was rejected, the wallet is on
 * the wrong network, or the wallet failed for some other reason.
 */
export async function connectWallet(wallet: MidnightWallet): Promise<WalletSession> {
  let api: ConnectedAPI;
  try {
    api = await wallet.api.connect(BALLOT_NETWORK_ID);
  } catch (cause) {
    throw connectFailure(cause);
  }

  let config: Configuration;
  try {
    config = await api.getConfiguration();
  } catch (cause) {
    throw new WalletError(
      'unknown',
      `Connected to ${wallet.name}, but it did not report its configuration: ${messageOf(cause)}`,
      { cause },
    );
  }

  if (config.networkId !== BALLOT_NETWORK_ID) {
    throw new WalletError(
      'network-mismatch',
      `${wallet.name} is connected to "${config.networkId}", but this ballot is deployed on "${BALLOT_NETWORK_ID}". Switch networks in the wallet and reconnect.`,
    );
  }

  try {
    const [unshielded, shielded] = await Promise.all([
      api.getUnshieldedAddress(),
      api.getShieldedAddresses(),
    ]);
    return {
      wallet,
      api,
      config,
      unshieldedAddress: unshielded.unshieldedAddress,
      coinPublicKey: shielded.shieldedCoinPublicKey,
      encryptionPublicKey: shielded.shieldedEncryptionPublicKey,
    };
  } catch (cause) {
    throw new WalletError('unknown', `Could not read the wallet address: ${messageOf(cause)}`, {
      cause,
    });
  }
}

// ─── Voter credential ────────────────────────────────────────────────────────

/**
 * The voter credential is a random 32-byte secret. It is the `VoterSecret`
 * witness input, and the whole privacy model rests on it never leaving the
 * browser.
 *
 * It is persisted in `localStorage` — not to make it recoverable, but so that a
 * page reload does not silently mint a *new* credential. One credential means one
 * nullifier, which means the contract's double-vote guard stays meaningful across
 * reloads: voting twice from the same browser is rejected on-chain.
 */
const VOTER_SECRET_STORAGE_KEY = 'midnight-ballot:voter-secret:v1';

/** Used only when `localStorage` is unavailable (private mode, storage disabled). */
let inMemoryVoterSecret: Uint8Array | null = null;

function voterSecretStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : (window.localStorage ?? null);
  } catch {
    // Access itself can throw when storage is blocked by policy.
    return null;
  }
}

function isValidSecret(bytes: Uint8Array): boolean {
  return bytes.length === 32;
}

/**
 * Report a credential-storage failure once per session.
 *
 * These paths used to swallow their errors, which is how a fatal
 * `Buffer is not defined` inside `toHex`/`fromHex` stayed invisible: persistence
 * quietly did nothing while the UI reported "not yet created". A credential that
 * cannot be persisted or read back is a real degradation, so it is said out loud
 * rather than hidden — the in-memory copy still covers the session.
 */
const reportedStorageFailures = new Set<string>();

function warnStorageFailure(context: string, err: unknown): void {
  if (reportedStorageFailures.has(context)) return;
  reportedStorageFailures.add(context);
  const detail = err instanceof Error ? err.message : String(err);
  console.warn(
    `[midnight-ballot] Voter credential storage failed during ${context}: ${detail}. ` +
      'The credential is still held in memory for this session, but it will not survive a reload.',
  );
}

function readStoredVoterSecret(): Uint8Array | null {
  const storage = voterSecretStorage();
  if (!storage) return inMemoryVoterSecret;

  let raw: string | null;
  try {
    raw = storage.getItem(VOTER_SECRET_STORAGE_KEY);
  } catch (err) {
    warnStorageFailure('read', err);
    return inMemoryVoterSecret;
  }
  if (!raw) return null;

  try {
    const bytes = fromHex(raw);
    return isValidSecret(bytes) ? bytes : null;
  } catch (err) {
    // A stored value we cannot decode is worse than none: it would silently mint
    // a second voter and make the double-vote guard look broken.
    warnStorageFailure('decode', err);
    return null;
  }
}

function writeVoterSecret(secret: Uint8Array): void {
  inMemoryVoterSecret = secret;
  const storage = voterSecretStorage();
  if (!storage) return;
  try {
    storage.setItem(VOTER_SECRET_STORAGE_KEY, toHex(secret));
  } catch (err) {
    warnStorageFailure('write', err);
  }
}

/**
 * Return this browser's voter credential, creating one on first use.
 *
 * The return value is deliberately never handed to a component: the hook uses it
 * only to build `initialPrivateState`. Displaying it, logging it, or putting it in
 * a URL would break the privacy claim the contract is designed around.
 */
export function loadOrCreateVoterSecret(): Uint8Array {
  const existing = readStoredVoterSecret();
  if (existing) return existing;

  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);
  writeVoterSecret(secret);
  return secret;
}

/**
 * Forget the stored credential, so the next call to {@link loadOrCreateVoterSecret}
 * mints a fresh one. Used by the "new voter credential" control: it lets the demo
 * show a *second* distinct voter casting a ballot without ever revealing either
 * secret.
 */
export function rotateVoterSecret(): Uint8Array {
  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);
  writeVoterSecret(secret);
  return secret;
}

/** Whether a credential already exists locally (safe to show; it reveals nothing). */
export function hasVoterSecret(): boolean {
  return readStoredVoterSecret() !== null;
}

// ─── Private state provider ──────────────────────────────────────────────────

/** What the SDK stores as this contract's private state. */
export interface BallotPrivateState {
  /** The voter credential. Read by the witness, never rendered. */
  readonly voterSecret: Uint8Array;
}

/**
 * An in-memory `PrivateStateProvider`.
 *
 * The Level 1 CLI uses `levelPrivateStateProvider`, which is Node-only. In the
 * browser the private state here is a single 32-byte credential that the SDK
 * re-hydrates from `initialPrivateState` on every connect, so a store that
 * survives the tab has nothing to add — and `localStorage` is already used for
 * the credential itself, deliberately, by {@link loadOrCreateVoterSecret}.
 *
 * Entries are scoped per contract address, matching the SDK contract.
 */
export function createInMemoryPrivateStateProvider<PSI extends PrivateStateId, PS>(): PrivateStateProvider<
  PSI,
  PS
> {
  const privateStates = new Map<string, PS>();
  const signingKeys = new Map<string, SigningKey>();
  let contractAddress = '';

  const scoped = (privateStateId: PSI): string => `${contractAddress}:${String(privateStateId)}`;

  return {
    setContractAddress(address: ContractAddress): void {
      contractAddress = address;
    },
    async set(privateStateId: PSI, state: PS): Promise<void> {
      privateStates.set(scoped(privateStateId), state);
    },
    async get(privateStateId: PSI): Promise<PS | null> {
      return privateStates.get(scoped(privateStateId)) ?? null;
    },
    async remove(privateStateId: PSI): Promise<void> {
      privateStates.delete(scoped(privateStateId));
    },
    async clear(): Promise<void> {
      const prefix = `${contractAddress}:`;
      for (const key of [...privateStates.keys()]) {
        if (key.startsWith(prefix)) privateStates.delete(key);
      }
    },
    async setSigningKey(address: ContractAddress, signingKey: SigningKey): Promise<void> {
      signingKeys.set(address, signingKey);
    },
    async getSigningKey(address: ContractAddress): Promise<SigningKey | null> {
      return signingKeys.get(address) ?? null;
    },
    async removeSigningKey(address: ContractAddress): Promise<void> {
      signingKeys.delete(address);
    },
    async clearSigningKeys(): Promise<void> {
      signingKeys.clear();
    },
    // Export/import exist for portable key backup. This dApp never prompts for a
    // password, so it says so plainly instead of returning a plausible-looking
    // empty export that would silently lose state.
    exportPrivateStates(): Promise<never> {
      return Promise.reject(new Error('Private state export is not supported in the browser dApp.'));
    },
    importPrivateStates(): Promise<never> {
      return Promise.reject(new Error('Private state import is not supported in the browser dApp.'));
    },
    exportSigningKeys(): Promise<never> {
      return Promise.reject(new Error('Signing key export is not supported in the browser dApp.'));
    },
    importSigningKeys(): Promise<never> {
      return Promise.reject(new Error('Signing key import is not supported in the browser dApp.'));
    },
  };
}

// ─── Contract binding ────────────────────────────────────────────────────────

type BallotContractType = BallotContract<BallotPrivateState, BallotWitnesses<BallotPrivateState>>;

/**
 * The contract's only witness.
 *
 * It reads the credential out of private state and hands it to the circuit, which
 * immediately hashes it. There is no I/O here, and the returned tuple is the
 * SDK's contract for "new private state, witness output".
 */
const ballotWitnesses: BallotWitnesses<BallotPrivateState> = {
  getVoterSecret: ({ privateState }) => [privateState, { bytes: privateState.voterSecret }],
};

/**
 * Binds the compiled circuits to their witnesses.
 *
 * `withCompiledFileAssets` records where the ZK artifacts *would* live on disk.
 * In the browser the actual retrieval goes through the `zkConfigProvider` below,
 * which fetches the same files over HTTP — so the value here is a marker.
 */
export const CompiledBallotContract = CompiledContract.make('ballot', BallotContract).pipe(
  CompiledContract.withWitnesses(ballotWitnesses),
  CompiledContract.withCompiledFileAssets('./contracts/managed/ballot'),
);

// ─── Providers ───────────────────────────────────────────────────────────────

/** Coarse progress, surfaced by the UI while a call transaction is in flight. */
export type VoteStage = 'proving' | 'balancing' | 'submitting';

export type BallotProviders = MidnightProviders<BallotCircuitId, string, BallotPrivateState>;
export type FoundBallot = FoundContract<BallotContractType>;

/** Absolute base URL the ZK artifacts are fetched from. */
export function zkAssetsBaseUrl(): string {
  const configured = import.meta.env.VITE_ZK_ASSETS_BASE_URL;
  if (configured) return configured;
  return `${window.location.origin}${ZK_ASSETS_MOUNT}`;
}

/**
 * Choose how proofs get generated.
 *
 * Preference order matters for the privacy claim:
 *
 *   1. **Delegate to the wallet** (`getProvingProvider`). The wallet runs the
 *      prover locally, so the witness preimage never leaves the user's machine.
 *   2. **The wallet's own proof server** (`proverServerUri`). Still proofs-about-
 *      private-data, but with the preimage sent to a remote service, so it is the
 *      fallback rather than the default.
 *
 * `getProvingProvider` is feature-detected: it is part of the 4.x connector API,
 * but wallets in the wild still ship builds without it, and a hard call would
 * break the dApp for those users.
 */
async function resolveProofProvider(
  api: ConnectedAPI,
  config: Configuration,
  zkConfigProvider: FetchZkConfigProvider<BallotCircuitId>,
): Promise<ProofProvider> {
  if (typeof api.getProvingProvider === 'function') {
    try {
      const provingProvider = await api.getProvingProvider(zkConfigProvider.asKeyMaterialProvider());
      // The connector's `ProvingProvider` is structurally the ledger's.
      return createProofProvider(provingProvider as LedgerProvingProvider);
    } catch {
      // Fall through to the HTTP prover below.
    }
  }

  if (config.proverServerUri) {
    return httpClientProofProvider(config.proverServerUri, zkConfigProvider);
  }

  throw new WalletError(
    'no-prover',
    'The wallet exposes no proving service and reported no proof server, so a proof cannot be generated. Update the wallet, or run a local Midnight proof server on http://127.0.0.1:6300 and reconnect.',
  );
}

/**
 * Assemble the full provider set.
 *
 * `onStage` is called as the transaction moves through proving, balancing and
 * submission — real signals from inside the pipeline, not a guessed progress bar.
 */
export async function createBallotProviders(
  session: WalletSession,
  onStage: (stage: VoteStage) => void = () => {},
): Promise<BallotProviders> {
  const { api, config, coinPublicKey, encryptionPublicKey } = session;

  // Midnight.js internals read the network id from this global.
  setNetworkId(config.networkId);

  const zkConfigProvider = new FetchZkConfigProvider<BallotCircuitId>(
    zkAssetsBaseUrl(),
    fetch.bind(window),
  );

  const proofProvider = await resolveProofProvider(api, config, zkConfigProvider);

  return {
    privateStateProvider:
      createInMemoryPrivateStateProvider<typeof BALLOT_PRIVATE_STATE_ID, BallotPrivateState>(),
    // The third argument is the websocket implementation the indexer client opens
    // subscriptions with. The SDK defaults it to `isomorphic-ws`'s `WebSocket`
    // named export, but that package's browser build only *default*-exports the
    // constructor — so the default resolves to `undefined` in a bundle and
    // subscriptions never connect. Passing the platform implementation
    // explicitly keeps `contractStateObservable` and the `watchFor*` helpers
    // working. The cast bridges the SDK's `ws`-package typing to the DOM class.
    publicDataProvider: indexerPublicDataProvider(
      config.indexerUri,
      config.indexerWsUri,
      globalThis.WebSocket as unknown as Parameters<typeof indexerPublicDataProvider>[2],
    ),
    zkConfigProvider,
    proofProvider: {
      proveTx: (unprovenTx, proveTxConfig) => {
        onStage('proving');
        return proofProvider.proveTx(unprovenTx, proveTxConfig);
      },
    },
    // The wallet is the trust boundary: it holds the keys and pays the fee, so
    // balancing and submission are delegated to it rather than done in the page.
    walletProvider: {
      getCoinPublicKey: () => coinPublicKey,
      getEncryptionPublicKey: () => encryptionPublicKey,
      balanceTx: async (tx: UnboundTransaction): Promise<FinalizedTransaction> => {
        onStage('balancing');
        const balanced = await api.balanceUnsealedTransaction(toHex(tx.serialize()));
        return Transaction.deserialize<SignatureEnabled, Proof, Binding>(
          'signature',
          'proof',
          'binding',
          fromHex(balanced.tx),
        );
      },
    },
    midnightProvider: {
      submitTx: async (tx: FinalizedTransaction): Promise<TransactionId> => {
        onStage('submitting');
        // The connector resolves once the wallet has accepted the transaction and
        // does not hand back an id, so derive it from the finalized transaction —
        // this must happen before submitting.
        const identifiers = tx.identifiers();
        await api.submitTransaction(toHex(tx.serialize()));
        return identifiers[0];
      },
    },
  };
}

// ─── Contract session ────────────────────────────────────────────────────────

/**
 * Reconnect to the already-deployed contract.
 *
 * `findDeployedContract` does not deploy — it reads the contract's current state
 * from the indexer and verifies the local ZK artifacts match the on-chain verifier
 * keys, which is exactly the check we want before letting anyone vote.
 */
export async function openBallot(
  providers: BallotProviders,
  voterSecret: Uint8Array,
): Promise<FoundBallot> {
  return findDeployedContract(providers, {
    compiledContract: CompiledBallotContract,
    contractAddress: asContractAddress(BALLOT_CONTRACT_ADDRESS),
    privateStateId: BALLOT_PRIVATE_STATE_ID,
    initialPrivateState: { voterSecret },
  });
}

// ─── Public state reads ──────────────────────────────────────────────────────

/** A snapshot of the *public* ledger, plus whether this browser already voted. */
export interface ElectionSnapshot {
  readonly electionId: string;
  readonly electionOpen: boolean;
  readonly totalVotes: bigint;
  readonly candidateAVotes: bigint;
  readonly candidateBVotes: bigint;
  /** How many nullifiers are spent on-chain. */
  readonly nullifiersSpent: number;
  /**
   * This browser's nullifier. Public by design: the contract publishes it, it is a
   * one-way hash of the credential, and it is what makes a second vote detectable.
   */
  readonly myNullifier: string;
  /** True when this credential's nullifier is already in the on-chain spent set. */
  readonly hasVoted: boolean;
}

/**
 * Read the contract's public state.
 *
 * Everything returned here is visible to any observer of the chain. The local
 * nullifier is recomputed with the contract's own `deriveNullifier` pure circuit so
 * the membership check is against the real derivation, not a reimplementation.
 */
export async function readElection(
  providers: BallotProviders,
  contractAddress: ContractAddress,
  voterSecret: Uint8Array,
): Promise<ElectionSnapshot | null> {
  const onChain = await providers.publicDataProvider.queryContractState(contractAddress);
  if (!onChain) return null;

  const state: BallotLedger = ballotLedger(onChain.data);
  const nullifier = ballotPureCircuits.deriveNullifier({ bytes: voterSecret });

  return {
    electionId: state.electionId,
    electionOpen: state.electionOpen,
    totalVotes: state.totalVotes,
    candidateAVotes: state.candidateAVotes,
    candidateBVotes: state.candidateBVotes,
    nullifiersSpent: Number(state.nullifierSpent.size()),
    myNullifier: toHex(nullifier.bytes),
    hasVoted: state.nullifierSpent.member({ bytes: nullifier.bytes }),
  };
}

/** Convenience wrapper so callers do not repeat the address conversion. */
export const BALLOT_CONTRACT_ADDRESS_TYPED: ContractAddress = asContractAddress(
  BALLOT_CONTRACT_ADDRESS,
);
