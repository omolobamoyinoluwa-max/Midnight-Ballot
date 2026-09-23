/**
 * Midnight Ballot — dApp shell.
 *
 * Layout mirrors the story the audit asks for: who you are (wallet), what the
 * public ledger currently says (tallies), the action itself (circuit call), and an
 * explicit statement of what is public versus private.
 */

import { CircuitCall } from './components/CircuitCall';
import { WalletConnect } from './components/WalletConnect';
import { useMidnight } from './hooks/useMidnight';
import { BALLOT_CONTRACT_ADDRESS, BALLOT_NETWORK_ID } from './midnight';

const number = (value: bigint) => value.toLocaleString();

function App() {
  const midnight = useMidnight();
  const { election } = midnight;

  const leader =
    election && election.candidateAVotes > election.candidateBVotes
      ? 'Candidate A'
      : election && election.candidateBVotes > election.candidateAVotes
        ? 'Candidate B'
        : null;

  return (
    <div className="page">
      <header className="masthead">
        <div>
          <h1>Midnight Ballot</h1>
          <p className="tagline">
            Cast a verifiable vote on Midnight without revealing who you are or which
            tally you moved.
          </p>
        </div>
        <div className="masthead-meta">
          <span className="pill pill-network">{BALLOT_NETWORK_ID}</span>
          <a
            className="mono contract-link"
            href={`https://preprod.midnightexplorer.com/contracts/${BALLOT_CONTRACT_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
            title={BALLOT_CONTRACT_ADDRESS}
          >
            {BALLOT_CONTRACT_ADDRESS.slice(0, 10)}…{BALLOT_CONTRACT_ADDRESS.slice(-6)}
          </a>
        </div>
      </header>

      <main className="grid">
        <WalletConnect
          status={midnight.status}
          wallets={midnight.wallets}
          walletName={midnight.walletName}
          address={midnight.address}
          networkId={midnight.networkId}
          error={midnight.connectionError}
          onConnect={midnight.connect}
          onDisconnect={midnight.disconnect}
        />

        <section className="card" aria-labelledby="tally-heading">
          <header className="card-header">
            <h2 id="tally-heading">On-chain tally</h2>
            <button
              type="button"
              className="link"
              onClick={midnight.refreshElection}
              disabled={midnight.status !== 'connected' || midnight.electionLoading}
            >
              {midnight.electionLoading ? 'refreshing…' : 'refresh'}
            </button>
          </header>

          {midnight.electionError && (
            <p className="notice notice-error" role="alert">
              {midnight.electionError}
            </p>
          )}

          {!midnight.electionError && !election && (
            <p className="notice">
              {midnight.status === 'connected'
                ? 'Reading public state from the Preprod indexer…'
                : 'Connect a wallet to read the ledger.'}
            </p>
          )}

          {election && (
            <>
              <p className="election-name">{election.electionId}</p>
              <div className="tallies">
                <div className="tally">
                  <span className="tally-label">Candidate A</span>
                  <strong className="tally-value">{number(election.candidateAVotes)}</strong>
                </div>
                <div className="tally">
                  <span className="tally-label">Candidate B</span>
                  <strong className="tally-value">{number(election.candidateBVotes)}</strong>
                </div>
                <div className="tally">
                  <span className="tally-label">Total ballots</span>
                  <strong className="tally-value">{number(election.totalVotes)}</strong>
                </div>
              </div>
              <dl className="facts compact">
                <div>
                  <dt>Election</dt>
                  <dd>{election.electionOpen ? 'Open' : 'Closed'}</dd>
                </div>
                <div>
                  <dt>Nullifiers spent</dt>
                  <dd className="mono">{election.nullifiersSpent}</dd>
                </div>
                <div>
                  <dt>This credential</dt>
                  <dd>{election.hasVoted ? 'has voted' : 'has not voted'}</dd>
                </div>
                <div>
                  <dt>Leading</dt>
                  <dd>{leader ?? 'tied'}</dd>
                </div>
              </dl>
            </>
          )}
        </section>

        <CircuitCall
          connected={midnight.status === 'connected'}
          electionOpen={election?.electionOpen ?? null}
          hasVoted={election?.hasVoted ?? false}
          votePhase={midnight.votePhase}
          voteError={midnight.voteError}
          receipt={midnight.receipt}
          onCast={midnight.castVote}
        />

        <section className="card" aria-labelledby="privacy-heading">
          <header className="card-header">
            <h2 id="privacy-heading">Privacy model</h2>
            <button
              type="button"
              className="link"
              onClick={midnight.useNewCredential}
              disabled={midnight.status !== 'connected'}
              title="Mint a fresh voter credential, to vote again as a second unlinkable voter"
            >
              new voter credential
            </button>
          </header>

          <div className="privacy-grid">
            <div className="privacy-col privacy-public">
              <h3>Public on-chain</h3>
              <ul>
                <li>
                  Election name — <code>electionId</code>
                </li>
                <li>
                  Whether voting is open — <code>electionOpen</code>
                </li>
                <li>
                  Aggregate tallies — <code>totalVotes</code>, <code>candidateAVotes</code>,{' '}
                  <code>candidateBVotes</code>
                </li>
                <li>
                  Spent nullifiers — <code>nullifierSpent</code> (hashes only)
                </li>
              </ul>
            </div>
            <div className="privacy-col privacy-private">
              <h3>Private, stays in this browser</h3>
              <ul>
                <li>
                  Your voter credential — a single private witness value, 32 bytes. It is
                  never displayed, logged, or transmitted.
                </li>
              </ul>
            </div>
          </div>

          <div className="claim">
            <h3>Privacy claim</h3>
            <p>
              An on-chain observer sees a ballot was cast, which tally moved, and a
              nullifier — a one-way hash. They <strong>cannot</strong> learn who cast it,
              which nullifier belongs to which voter, or link two ballots to the same
              person without already knowing that voter's secret.
            </p>
            <p className="hint">
              Your credential is {midnight.hasCredential ? 'held' : 'not yet created'} in this
              browser and is never displayed, logged, or transmitted. Enabling this in the UI
              would break the guarantee the contract is built around.
            </p>
          </div>
        </section>
      </main>

      <footer className="footer">
        <p>
          Midnight Builder Challenge — Level 2 · Compact contract + React/Vite dApp on{' '}
          {BALLOT_NETWORK_ID}
        </p>
      </footer>
    </div>
  );
}

export default App;
