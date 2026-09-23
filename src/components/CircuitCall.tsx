/**
 * Circuit call — `castVote` on the Preprod contract.
 *
 * The voter picks a candidate, the browser builds the call, the witness supplies
 * the private credential, a proof is generated, the wallet balances and signs, and
 * the result lands on-chain. The UI narrates those stages using the real provider
 * progress events rather than a synthetic progress bar.
 *
 * What this component is careful *not* to do is show the private input. The
 * credential never reaches a prop, and the only value derived from it that appears
 * on screen is the nullifier — which the contract publishes on-chain anyway and
 * which cannot be reversed to the voter.
 */

import { CANDIDATES, type CandidateId } from '../midnight';
import type { VotePhase, VoteReceipt } from '../hooks/useMidnight';

export interface CircuitCallProps {
  readonly connected: boolean;
  readonly electionOpen: boolean | null;
  readonly hasVoted: boolean;
  readonly votePhase: VotePhase;
  readonly voteError: string | null;
  readonly receipt: VoteReceipt | null;
  readonly onCast: (choice: CandidateId) => void;
}

/** Human copy for each stage of the call transaction. */
const STAGE_LABEL: Record<Exclude<VotePhase, 'idle'>, string> = {
  proving: 'Generating zero-knowledge proof locally…',
  balancing: 'Wallet is balancing and signing the transaction…',
  submitting: 'Submitting the proven transaction to Preprod…',
  done: 'Included on-chain.',
};

function shortenHash(value: string): string {
  if (value.length <= 30) return value;
  return `${value.slice(0, 16)}…${value.slice(-12)}`;
}

export function CircuitCall({
  connected,
  electionOpen,
  hasVoted,
  votePhase,
  voteError,
  receipt,
  onCast,
}: CircuitCallProps) {
  const busy = votePhase !== 'idle' && votePhase !== 'done';
  const votingClosed = electionOpen === false;
  const blocked = !connected || busy || votingClosed || hasVoted;

  return (
    <section className="card" aria-labelledby="circuit-heading">
      <header className="card-header">
        <h2 id="circuit-heading">
          Cast a private ballot <code>castVote(choice)</code>
        </h2>
      </header>

      <p className="lede">
        Your choice and your credential stay on this device. Only a zero-knowledge
        proof and an unlinkable nullifier go to the network.
      </p>

      {!connected && <p className="notice">Connect your wallet to enable voting.</p>}

      {hasVoted && (
        <p className="notice notice-warn">
          <strong>This credential has already voted.</strong> Its nullifier is in the
          on-chain spent set, so the contract will reject another ballot — that is the
          double-vote guard working. Use “New voter credential” to vote as a second,
          unlinkable voter.
        </p>
      )}

      {votingClosed && (
        <p className="notice notice-warn">This election is closed. The contract will reject ballots.</p>
      )}

      <fieldset className="choices" disabled={blocked}>
        <legend>Your ballot</legend>
        {CANDIDATES.map((candidate) => (
          <button
            key={candidate.name}
            type="button"
            className="btn btn-choice"
            onClick={() => onCast(candidate.id)}
          >
            Vote {candidate.name}
          </button>
        ))}
      </fieldset>

      {busy && (
        <div className="progress" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <div>
            <strong>{STAGE_LABEL[votePhase as Exclude<VotePhase, 'idle'>]}</strong>
            <p className="hint">
              Proof generation runs on your machine and can take up to a minute.
            </p>
          </div>
        </div>
      )}

      {/* The audit label, stated where the proof is actually produced. */}
      <p className="privacy-badge">🔒 Proved without revealing your input</p>

      {voteError && (
        <p className="notice notice-error" role="alert">
          {voteError}
        </p>
      )}

      {receipt && (
        <div className="receipt" role="status">
          <h3>Transaction result</h3>
          <dl className="facts">
            <div>
              <dt>Ballot</dt>
              <dd>{receipt.candidate}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <span className="pill pill-on">Finalized</span>
              </dd>
            </div>
            <div>
              <dt>Transaction</dt>
              <dd className="mono" title={receipt.txId}>
                {shortenHash(receipt.txId)}
              </dd>
            </div>
            <div>
              <dt>Block height</dt>
              <dd className="mono">{receipt.blockHeight.toLocaleString()}</dd>
            </div>
            {receipt.nullifier && (
              <div>
                <dt>Nullifier (published on-chain)</dt>
                <dd className="mono" title={receipt.nullifier}>
                  {shortenHash(receipt.nullifier)}
                </dd>
              </div>
            )}
          </dl>
          <p className="hint">
            The nullifier is a one-way hash of your private credential. It is what makes a
            second ballot from this voter detectable — it cannot be reversed to your
            identity, and it is not linked to the candidate you chose.
          </p>
        </div>
      )}
    </section>
  );
}
