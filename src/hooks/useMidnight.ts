/**
 * `useMidnight` — the single React entry point into Midnight.
 *
 * The hook owns every piece of mutable dApp state: the injected wallet, the
 * connection, the provider set, the deployed-contract handle, the public ledger
 * snapshot and the in-flight vote. Components read from it and call into it; none
 * of them touch the SDK directly.
 *
 * The voter credential flows through this file but never out of it: it is loaded
 * only to build `initialPrivateState` and to recompute the public nullifier. No
 * value derived from it is ever put into state that a component renders.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  BALLOT_CONTRACT_ADDRESS_TYPED,
  BALLOT_NETWORK_ID,
  CANDIDATES,
  listMidnightWallets,
  loadOrCreateVoterSecret,
  connectWallet,
  createBallotProviders,
  hasVoterSecret,
  openBallot,
  readElection,
  rotateVoterSecret,
  type BallotProviders,
  type CandidateId,
  type ElectionSnapshot,
  type FoundBallot,
  type MidnightWallet,
  type VoteStage,
  type WalletSession,
} from '../midnight';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';
export type VotePhase = 'idle' | VoteStage | 'done';

/** The outcome of a call transaction, limited to what is public. */
export interface VoteReceipt {
  readonly txId: string;
  readonly blockHeight: number;
  readonly candidate: string;
  /**
   * The nullifier the contract published for this vote. Public by design — it is a
   * one-way hash of the credential and cannot be reversed to the voter.
   */
  readonly nullifier: string | null;
}

export interface UseMidnight {
  /** Midnight wallets injected into this page. Empty ⇒ none installed. */
  readonly wallets: readonly MidnightWallet[];
  readonly status: ConnectionState;
  readonly walletName: string | null;
  readonly address: string | null;
  /** Always set: it is the network the dApp requires, or the one the wallet reported. */
  readonly networkId: string;
  readonly contractAddress: string;
  /** Distinguishes "not installed" / "rejected" / "wrong network" for the UI. */
  readonly connectionError: string | null;

  readonly election: ElectionSnapshot | null;
  readonly electionError: string | null;
  readonly electionLoading: boolean;

  readonly votePhase: VotePhase;
  readonly voteError: string | null;
  readonly receipt: VoteReceipt | null;

  /** True once a credential exists in this browser. Reveals nothing about it. */
  readonly hasCredential: boolean;
  readonly credentialGeneration: number;

  connect: () => Promise<void>;
  disconnect: () => void;
  refreshElection: () => Promise<void>;
  castVote: (choice: CandidateId) => Promise<void>;
  /** Mint a fresh credential, to demonstrate a second, distinct voter. */
  useNewCredential: () => Promise<void>;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Turn a circuit rejection into something a voter can act on.
 *
 * The two assertions in `castVote` are the ones users actually hit, and both are
 * *expected* outcomes rather than bugs, so they get purpose-written copy.
 */
function describeVoteFailure(cause: unknown): string {
  const raw = messageOf(cause);
  if (/already cast a ballot/i.test(raw)) {
    return 'This credential has already voted. The contract rejected the second ballot because its nullifier is already spent on-chain — one voter, one vote, with no identity revealed.';
  }
  if (/not open/i.test(raw)) {
    return 'Voting is currently closed for this election.';
  }
  if (/proof/i.test(raw) && /timeout|fetch|network|connect/i.test(raw)) {
    return `Proof generation did not complete: ${raw}`;
  }
  return raw;
}

export function useMidnight(): UseMidnight {
  const [wallets, setWallets] = useState<readonly MidnightWallet[]>([]);
  const [status, setStatus] = useState<ConnectionState>('disconnected');
  const [session, setSession] = useState<WalletSession | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [election, setElection] = useState<ElectionSnapshot | null>(null);
  const [electionError, setElectionError] = useState<string | null>(null);
  const [electionLoading, setElectionLoading] = useState(false);

  const [votePhase, setVotePhase] = useState<VotePhase>('idle');
  const [voteError, setVoteError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<VoteReceipt | null>(null);

  const [hasCredential, setHasCredential] = useState(false);
  const [credentialGeneration, setCredentialGeneration] = useState(0);

  const providersRef = useRef<BallotProviders | null>(null);
  const ballotRef = useRef<FoundBallot | null>(null);

  /**
   * The provider set is built once per connection but needs the *current* phase
   * setter. A ref keeps the callback stable while always calling the live setter.
   */
  const stageRef = useRef<(stage: VoteStage) => void>(() => {});
  useEffect(() => {
    stageRef.current = (stage) => setVotePhase(stage);
  }, []);

  // Wallet extensions inject before the page's scripts run, so one pass is enough.
  useEffect(() => {
    setWallets(listMidnightWallets());
    setHasCredential(hasVoterSecret());
  }, []);

  const readLedger = useCallback(async (providers: BallotProviders) => {
    setElectionLoading(true);
    setElectionError(null);
    try {
      // Reading needs the credential only to recompute this browser's nullifier —
      // it is never sent to the indexer, which is queried for public state only.
      const snapshot = await readElection(
        providers,
        BALLOT_CONTRACT_ADDRESS_TYPED,
        loadOrCreateVoterSecret(),
      );
      setElection(snapshot);
    } catch (cause) {
      setElectionError(`Could not read the election from the indexer: ${messageOf(cause)}`);
    } finally {
      setElectionLoading(false);
    }
  }, []);

  const refreshElection = useCallback(async () => {
    if (!providersRef.current) return;
    await readLedger(providersRef.current);
  }, [readLedger]);

  const connect = useCallback(async () => {
    setConnectionError(null);
    setVoteError(null);

    const available = listMidnightWallets();
    setWallets(available);

    if (available.length === 0) {
      setConnectionError(
        'No Midnight wallet detected. Install the Lace extension for Midnight, then reload this page.',
      );
      setStatus('disconnected');
      return;
    }

    setStatus('connecting');
    try {
      const next = await connectWallet(available[0]);
      const providers = await createBallotProviders(next, (stage) => stageRef.current(stage));
      const voterSecret = loadOrCreateVoterSecret();
      const ballot = await openBallot(providers, voterSecret);

      providersRef.current = providers;
      ballotRef.current = ballot;
      setSession(next);
      setHasCredential(true);
      setStatus('connected');

      await readLedger(providers);
    } catch (cause) {
      providersRef.current = null;
      ballotRef.current = null;
      setSession(null);
      setStatus('disconnected');
      setConnectionError(messageOf(cause));
    }
  }, [readLedger]);

  const disconnect = useCallback(() => {
    // Nothing to revoke on-chain: dropping the providers drops the local handle.
    // The credential stays in the browser, so reconnecting is the same voter.
    providersRef.current = null;
    ballotRef.current = null;
    setSession(null);
    setStatus('disconnected');
    setElection(null);
    setElectionError(null);
    setConnectionError(null);
    setVoteError(null);
    setReceipt(null);
    setVotePhase('idle');
  }, []);

  const castVote = useCallback(
    async (choice: CandidateId) => {
      const ballot = ballotRef.current;
      if (!ballot) {
        setVoteError('Connect your wallet before casting a ballot.');
        return;
      }

      const candidate = CANDIDATES.find((c) => c.id === choice)?.name ?? `Choice ${choice}`;

      setVoteError(null);
      setReceipt(null);
      setVotePhase('proving');

      try {
        // Runs the witness, generates the proof locally, has the wallet balance and
        // sign, then submits. `stageRef` narrates the real stages as they happen.
        const call = await ballot.callTx.castVote(choice);
        setVotePhase('done');

        const providers = providersRef.current;
        let nullifier: string | null = null;
        if (providers) {
          await readLedger(providers);
          nullifier = (await readElection(
            providers,
            BALLOT_CONTRACT_ADDRESS_TYPED,
            loadOrCreateVoterSecret(),
          ))?.myNullifier ?? null;
        }

        setReceipt({
          txId: String(call.public.txId),
          blockHeight: call.public.blockHeight,
          candidate,
          nullifier,
        });
      } catch (cause) {
        setVotePhase('idle');
        setVoteError(describeVoteFailure(cause));
      }
    },
    [readLedger],
  );

  const useNewCredential = useCallback(async () => {
    setVoteError(null);
    setReceipt(null);
    try {
      const secret = rotateVoterSecret();
      setHasCredential(true);
      setCredentialGeneration((generation) => generation + 1);

      const providers = providersRef.current;
      if (providers) {
        // Re-open the same contract with the new credential so the witnesses pick
        // up the new private state.
        ballotRef.current = await openBallot(providers, secret);
        await readLedger(providers);
      }
    } catch (cause) {
      setVoteError(messageOf(cause));
    }
  }, [readLedger]);

  return {
    wallets,
    status,
    walletName: session?.wallet.name ?? null,
    address: session?.unshieldedAddress ?? null,
    networkId: session?.config.networkId ?? BALLOT_NETWORK_ID,
    contractAddress: BALLOT_CONTRACT_ADDRESS_TYPED,
    connectionError,

    election,
    electionError,
    electionLoading,

    votePhase,
    voteError,
    receipt,

    hasCredential,
    credentialGeneration,

    connect,
    disconnect,
    refreshElection,
    castVote,
    useNewCredential,
  };
}
