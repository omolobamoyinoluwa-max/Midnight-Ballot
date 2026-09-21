/**
 * Midnight Ballot — Test Suite
 *
 * The suite has two layers, so `npm test` is meaningful on a fresh clone AND
 * exhaustive once the contract is compiled:
 *
 *   1. Offline layer (always runs — no toolchain, no docker, no proof server):
 *      • Contract source assertions — `contracts/ballot.compact` really declares
 *        the public ledger state, the private witness, the deliberate `disclose()`
 *        calls and the public/private comment block the design depends on.
 *      • Ledger semantics — a reference model of the ledger effects of
 *        `castVote` / `closeElection` / `openElection`, driven by the same
 *        `persistentHash` builtin the contract uses. The model is pinned to the
 *        contract source by the assertions above.
 *
 *   2. Compiled layer (auto-skips until `npm run compile` has produced
 *      `contracts/managed/ballot/contract/index.js`): executes the *real*
 *      generated circuits in the Compact runtime simulator, in-process —
 *      midnight contract tests do not need a network or a proof server.
 *
 * Run everything:
 *   npm run compile && npm test
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  CompactTypeBytes,
  CompactTypeVector,
  createCircuitContext,
  createConstructorContext,
  dummyContractAddress,
  emptyZswapLocalState,
  persistentHash,
} from '@midnight-ntwrk/compact-runtime';

// ─── Paths ──────────────────────────────────────────────────

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONTRACT_SOURCE_PATH = path.resolve(HERE, '..', 'contracts', 'ballot.compact');
const MANAGED_DIR = path.resolve(HERE, '..', 'contracts', 'managed', 'ballot');
const COMPILED_CONTRACT_PATH = path.join(MANAGED_DIR, 'contract', 'index.js');

const contractSource = fs.readFileSync(CONTRACT_SOURCE_PATH, 'utf8');

/** A valid 32-byte CoinPublicKey, used by both the compiled tests and the runtime. */
const COIN_PUBLIC_KEY = '01'.repeat(32);

// ─── Reference derivation (mirrors the contract's persistentHash calls) ──────

/**
 * Domain separation tags, byte-for-byte identical to the tags passed to
 * `pad(32, …)` in `contracts/ballot.compact`. The source assertions in
 * "Contract source" fail if either tag drifts from the contract.
 */
const VOTER_TAG = 'midnight-ballot:voter:v1';
const NULLIFIER_TAG = 'midnight-ballot:nullifier:v1';

const BYTES_32 = new CompactTypeBytes(32);
const BYTE_PAIR = new CompactTypeVector(2, BYTES_32);

/**
 * Encode a domain-separation tag the way `pad(32, tag)` does in Compact:
 * ASCII bytes, zero-padded on the right to 32 bytes.
 */
function paddedTag(tag: string): Uint8Array {
  const encoded = new TextEncoder().encode(tag);
  if (encoded.length > 32) throw new Error(`tag too long: ${tag}`);
  const bytes = new Uint8Array(32);
  bytes.set(encoded);
  return bytes;
}

/** Deterministic 32-byte secret standing in for a voter's private credential. */
function voterSecret(index: number): Uint8Array {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = (index * 31 + i * 7) % 256;
  return bytes;
}

/** `deriveVoterCommitment` from the contract, run through the real hash builtin. */
function deriveVoterCommitment(secret: Uint8Array): Uint8Array {
  return persistentHash(BYTE_PAIR, [paddedTag(VOTER_TAG), secret]);
}

/** `deriveNullifier` from the contract, run through the real hash builtin. */
function deriveNullifier(secret: Uint8Array): Uint8Array {
  return persistentHash(BYTE_PAIR, [paddedTag(NULLIFIER_TAG), secret]);
}

const toHex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');

// ─── Reference ledger model ────────────────────────────────

/**
 * Public ledger state, mirroring `contracts/ballot.compact`.
 * Deliberately contains no field holding a voter secret — see the
 * "private inputs" tests.
 */
type LedgerState = {
  readonly electionId: string;
  readonly electionOpen: boolean;
  readonly totalVotes: number;
  readonly candidateAVotes: number;
  readonly candidateBVotes: number;
  /** Spent nullifiers — the on-chain double-vote guard. Hashes only, never secrets. */
  readonly nullifierSpent: ReadonlySet<string>;
};

/** Ledger state produced by the contract constructor. */
function newElection(electionId: string): LedgerState {
  return {
    electionId,
    electionOpen: true,
    totalVotes: 0,
    candidateAVotes: 0,
    candidateBVotes: 0,
    nullifierSpent: new Set<string>(),
  };
}

/** `castVote(choice)` — asserts on a closed election and on a spent nullifier. */
function castVote(state: LedgerState, secret: Uint8Array, choice: 0 | 1): LedgerState {
  if (!state.electionOpen) throw new Error('Election is not open');

  // The contract discloses the nullifier on purpose: it is a one-way hash, and
  // publishing it is what makes replay detectable without revealing the voter.
  const nullifier = toHex(deriveNullifier(secret));
  if (state.nullifierSpent.has(nullifier)) throw new Error('Voter has already cast a ballot');

  return {
    ...state,
    totalVotes: state.totalVotes + 1,
    candidateAVotes: state.candidateAVotes + (choice === 0 ? 1 : 0),
    candidateBVotes: state.candidateBVotes + (choice === 1 ? 1 : 0),
    nullifierSpent: new Set(state.nullifierSpent).add(nullifier),
  };
}

/** `closeElection()` */
const closeElection = (state: LedgerState): LedgerState => ({ ...state, electionOpen: false });

/** `openElection()` */
const openElection = (state: LedgerState): LedgerState => ({ ...state, electionOpen: true });

// ═════════════════════════════════════════════════════════════
// Layer 1 — offline
// ═════════════════════════════════════════════════════════════

describe('Midnight Ballot — contract source', () => {
  it('declares public ledger state for the election and the tallies', () => {
    for (const field of [
      'electionId',
      'electionOpen',
      'totalVotes',
      'candidateAVotes',
      'candidateBVotes',
      'nullifierSpent',
    ]) {
      assert.match(
        contractSource,
        new RegExp(`export ledger ${field}\\b`),
        `${field} must be exported ledger (public) state`,
      );
    }
  });

  it('declares a private witness as a circuit input', () => {
    assert.match(contractSource, /^witness getVoterSecret\(\): VoterSecret;/m);
  });

  it('never stores the witness value in ledger state', () => {
    const ledgerDeclarations = contractSource.match(/^export ledger .*$/gm) ?? [];
    assert.ok(ledgerDeclarations.length > 0, 'contract must declare public ledger state');
    for (const declaration of ledgerDeclarations) {
      assert.doesNotMatch(
        declaration,
        /getVoterSecret|voterSecret|VoterSecret/,
        'the voter secret must never be a ledger (public) field',
      );
    }
  });

  it('discloses deliberately: the nullifier and the tally branch only', () => {
    const disclosures = contractSource.match(/disclose\(/g) ?? [];
    assert.ok(
      disclosures.length >= 3,
      `expected deliberate disclose() calls, found ${disclosures.length}`,
    );
    // The secret itself is hashed, never disclosed.
    assert.doesNotMatch(contractSource, /disclose\(\s*getVoterSecret\(\)/, 'the witness must never be disclosed');
    assert.match(contractSource, /disclose\(nullifier\)/, 'the nullifier is disclosed on purpose');
    assert.match(contractSource, /disclose\(candidateChoice\)/, 'the vote branch is disclosed on purpose');
  });

  it('guards castVote on election state and on a fresh nullifier', () => {
    assert.match(contractSource, /assert\(electionOpen == true/, 'castVote must require an open election');
    assert.match(
      contractSource,
      /!nullifierSpent\.member\(disclose\(nullifier\)\)/,
      'castVote must reject an already-spent nullifier',
    );
    assert.match(contractSource, /nullifierSpent\.insert\(disclose\(nullifier\)/, 'castVote must spend the nullifier');
  });

  it('updates the total plus exactly one candidate tally', () => {
    assert.match(contractSource, /totalVotes\.increment\(1\)/);
    assert.match(contractSource, /candidateAVotes\.increment\(1\)/);
    assert.match(contractSource, /candidateBVotes\.increment\(1\)/);
  });

  it('documents what is public and what is private in the header comment', () => {
    const header = contractSource.slice(0, contractSource.indexOf('struct VoterSecret'));
    assert.match(header, /PUBLIC \(on-chain/, 'header must list the public surface');
    assert.match(header, /PRIVATE \(witness, never stored on-chain/, 'header must list the private surface');
    assert.match(
      header,
      /DISCLOSED BY DESIGN/,
      'header must distinguish what is private from what disclose() reveals on purpose',
    );
  });

  it('uses the domain-separation tags the reference model reproduces', () => {
    assert.match(contractSource, new RegExp(`pad\\(32, "${VOTER_TAG}"\\)`));
    assert.match(contractSource, new RegExp(`pad\\(32, "${NULLIFIER_TAG}"\\)`));
    assert.match(contractSource, /persistentHash<Vector<2, Bytes<32>>>/);
  });
});

describe('Midnight Ballot — ledger semantics (reference model)', () => {
  it('initialises with a zeroed, open election', () => {
    const ledger = newElection('Test Election 2026');
    assert.equal(ledger.electionId, 'Test Election 2026');
    assert.equal(ledger.electionOpen, true);
    assert.equal(ledger.totalVotes, 0);
    assert.equal(ledger.candidateAVotes, 0);
    assert.equal(ledger.candidateBVotes, 0);
    assert.equal(ledger.nullifierSpent.size, 0);
  });

  it('counts a vote for candidate A in the total and in A only', () => {
    const before = newElection('Test');
    const after = castVote(before, voterSecret(1), 0);

    assert.equal(after.totalVotes, 1);
    assert.equal(after.candidateAVotes, 1);
    assert.equal(after.candidateBVotes, 0, 'candidate B must not move');
    assert.equal(before.totalVotes, 0, 'the previous state is untouched');

    // Exactly one new nullifier was spent; it is a hash, not the secret.
    assert.equal(after.nullifierSpent.size, 1);
    const spent = [...after.nullifierSpent][0];
    assert.equal(spent.length, 64, 'nullifier must be a 32-byte hash');
    assert.notEqual(spent, toHex(voterSecret(1)), 'the ledger must never hold raw secret bytes');
  });

  it('counts a vote for candidate B', () => {
    const after = castVote(newElection('Test'), voterSecret(2), 1);
    assert.equal(after.totalVotes, 1);
    assert.equal(after.candidateBVotes, 1);
    assert.equal(after.candidateAVotes, 0);
  });

  it('counts different voters separately and keeps both nullifiers', () => {
    const first = castVote(newElection('Test'), voterSecret(10), 0);
    const second = castVote(first, voterSecret(20), 1);

    assert.equal(second.totalVotes, 2);
    assert.equal(second.candidateAVotes, 1);
    assert.equal(second.candidateBVotes, 1);
    assert.equal(second.nullifierSpent.size, 2);
  });

  it('rejects a second vote from the same voter', () => {
    const voter = voterSecret(42);
    const voted = castVote(newElection('Test'), voter, 0);

    assert.throws(
      () => castVote(voted, voter, 1),
      /already cast a ballot/,
      'the same secret must not vote twice',
    );
    // The rejected call left the tallies alone.
    assert.equal(voted.totalVotes, 1);
  });

  it('rejects votes while the election is closed, and accepts them again after reopening', () => {
    const closed = closeElection(newElection('Test'));

    assert.equal(closed.electionOpen, false);
    assert.throws(() => castVote(closed, voterSecret(3), 0), /not open/);

    const reopened = openElection(closed);
    assert.equal(reopened.electionOpen, true);
    assert.equal(castVote(reopened, voterSecret(3), 0).totalVotes, 1);
  });

  it('keeps no trace of voter secrets anywhere in the ledger', () => {
    const voter = voterSecret(999);
    const ledger = castVote(newElection('Test'), voter, 1);
    const serialised = JSON.stringify({ ...ledger, nullifierSpent: [...ledger.nullifierSpent] });

    assert.ok(!serialised.includes(toHex(voter)), 'raw secret bytes must not appear in ledger state');
    // Only the nullifier may reference the voter, and it cannot be reversed.
    assert.notEqual(toHex(deriveNullifier(voter)), toHex(voter));
  });
});

describe('Midnight Ballot — privacy model', () => {
  it('derives a deterministic 32-byte commitment from a voter secret', () => {
    const secret = voterSecret(7);
    const commitment = deriveVoterCommitment(secret);

    assert.equal(commitment.length, 32);
    assert.equal(toHex(commitment), toHex(deriveVoterCommitment(secret)));
  });

  it('gives every voter a distinct commitment', () => {
    assert.notEqual(
      toHex(deriveVoterCommitment(voterSecret(1))),
      toHex(deriveVoterCommitment(voterSecret(2))),
    );
  });

  it('derives a deterministic nullifier that domain separation keeps distinct from the commitment', () => {
    const secret = voterSecret(99);
    const nullifier = deriveNullifier(secret);

    assert.equal(nullifier.length, 32);
    assert.equal(toHex(nullifier), toHex(deriveNullifier(secret)), 'the same vote is always the same nullifier');
    assert.notEqual(
      toHex(deriveVoterCommitment(secret)),
      toHex(nullifier),
      'the v1 tags must keep `midnight-ballot:voter` and `midnight-ballot:nullifier` apart',
    );
  });

  it('leaves the nullifier one-way: it never equals or contains the secret', () => {
    for (const index of [0, 5, 123, 4242]) {
      const secret = voterSecret(index);
      const nullifier = deriveNullifier(secret);

      assert.notEqual(toHex(nullifier), toHex(secret));
      assert.ok(!toHex(nullifier).includes(toHex(secret)), 'nullifier must not embed the secret');
      assert.ok(!toHex(secret).includes(toHex(nullifier)), 'secret must not embed the nullifier');
    }
  });
});

// ═════════════════════════════════════════════════════════════
// Layer 2 — the real generated circuits (skipped until compiled)
// ═════════════════════════════════════════════════════════════

const compiledAvailable = fs.existsSync(COMPILED_CONTRACT_PATH);
const compiled: any = compiledAvailable
  ? await import(pathToFileURL(COMPILED_CONTRACT_PATH).href)
  : undefined;

describe(
  'Midnight Ballot — compiled circuits',
  { skip: compiledAvailable ? false : 'run `npm run compile` to generate contracts/managed/ballot' },
  () => {
    /** Witnesses the generated contract needs; each scenario gets its own secret. */
    const witnessesFor = (secret: Uint8Array) => ({
      getVoterSecret: (_context: unknown) => [{}, { bytes: secret }],
    });

    /**
     * Initialise the contract and hand back a circuit context factory.
     * `initialState` runs the constructor; each caller then threads
     * `result.context` forward to simulate the next circuit call.
     */
    const simulate = (electionName: string, secret: Uint8Array) => {
      const contract = new compiled.Contract(witnessesFor(secret));
      const init = contract.initialState(createConstructorContext({}, COIN_PUBLIC_KEY), electionName);
      const context = createCircuitContext(
        dummyContractAddress(),
        emptyZswapLocalState(COIN_PUBLIC_KEY),
        init.currentContractState,
        init.currentPrivateState,
      );
      return { contract, context };
    };

    /** Decode the public ledger out of a circuit context. */
    const ledgerOf = (context: any) => compiled.ledger(context.currentQueryContext.state);

    describe('pure circuits', () => {
      it('deriveVoterCommitment is deterministic and 32 bytes', () => {
        const secret = { bytes: voterSecret(42) };
        const first = compiled.pureCircuits.deriveVoterCommitment(secret);
        const second = compiled.pureCircuits.deriveVoterCommitment(secret);

        assert.deepStrictEqual(first, second);
        assert.equal(first.bytes.length, 32);
      });

      it('different secrets produce different commitments', () => {
        assert.notDeepStrictEqual(
          compiled.pureCircuits.deriveVoterCommitment({ bytes: voterSecret(1) }),
          compiled.pureCircuits.deriveVoterCommitment({ bytes: voterSecret(2) }),
        );
      });

      it('deriveNullifier is deterministic and domain-separated from the commitment', () => {
        const secret = { bytes: voterSecret(7) };
        const commitment = compiled.pureCircuits.deriveVoterCommitment(secret);
        const nullifier = compiled.pureCircuits.deriveNullifier(secret);

        assert.deepStrictEqual(nullifier, compiled.pureCircuits.deriveNullifier(secret));
        assert.equal(nullifier.bytes.length, 32);
        assert.notDeepStrictEqual(commitment.bytes, nullifier.bytes);
      });

      it('different voters have different nullifiers', () => {
        assert.notDeepStrictEqual(
          compiled.pureCircuits.deriveNullifier({ bytes: voterSecret(10) }),
          compiled.pureCircuits.deriveNullifier({ bytes: voterSecret(20) }),
        );
      });
    });

    describe('state transitions', () => {
      it('initialises an open election with empty tallies', () => {
        const { context } = simulate('Presidential Election 2026', voterSecret(0));
        const ledger = ledgerOf(context);

        assert.equal(ledger.electionOpen, true);
        assert.equal(ledger.totalVotes, 0n);
        assert.equal(ledger.candidateAVotes, 0n);
        assert.equal(ledger.candidateBVotes, 0n);
      });

      it('reports the election as open right after initialisation', () => {
        const { contract, context } = simulate('Test Election', voterSecret(1));
        assert.equal(contract.impureCircuits.isElectionOpen(context).result, true);
      });

      it('closes and reopens the election', () => {
        const { contract, context } = simulate('Test Election', voterSecret(1));

        const closed = contract.impureCircuits.closeElection(context);
        assert.equal(contract.impureCircuits.isElectionOpen(closed.context).result, false);

        const reopened = contract.impureCircuits.openElection(closed.context);
        assert.equal(contract.impureCircuits.isElectionOpen(reopened.context).result, true);
      });

      it('casts a vote for candidate A and increments exactly one tally', () => {
        const { contract, context } = simulate('Test Election', voterSecret(11));
        const voted = contract.impureCircuits.castVote(context, 0n);
        const ledger = ledgerOf(voted.context);

        assert.equal(ledger.totalVotes, 1n);
        assert.equal(ledger.candidateAVotes, 1n);
        assert.equal(ledger.candidateBVotes, 0n);
      });

      it('casts a vote for candidate B and increments exactly one tally', () => {
        const { contract, context } = simulate('Test Election', voterSecret(12));
        const voted = contract.impureCircuits.castVote(context, 1n);
        const ledger = ledgerOf(voted.context);

        assert.equal(ledger.totalVotes, 1n);
        assert.equal(ledger.candidateBVotes, 1n);
        assert.equal(ledger.candidateAVotes, 0n);
      });

      it('rejects a second vote from the same voter', () => {
        const { contract, context } = simulate('Test Election', voterSecret(13));
        const voted = contract.impureCircuits.castVote(context, 0n);

        assert.throws(
          () => contract.impureCircuits.castVote(voted.context, 1n),
          /already cast a ballot/,
        );
      });

      it('rejects a vote while the election is closed', () => {
        const { contract, context } = simulate('Test Election', voterSecret(14));
        const closed = contract.impureCircuits.closeElection(context);

        assert.throws(() => contract.impureCircuits.castVote(closed.context, 0n), /not open/);
      });

      it('lets different voters each cast one vote', () => {
        const first = simulate('Test Election', voterSecret(15));
        const firstVote = first.contract.impureCircuits.castVote(first.context, 0n);
        assert.equal(ledgerOf(firstVote.context).totalVotes, 1n);

        const second = simulate('Test Election', voterSecret(16));
        const secondVote = second.contract.impureCircuits.castVote(second.context, 1n);
        assert.equal(ledgerOf(secondVote.context).candidateBVotes, 1n);
      });
    });
  },
);
