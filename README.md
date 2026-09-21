# Midnight Ballot

> A privacy-preserving voting smart contract built on the Midnight Network using Compact, enabling users to cast verifiable votes without revealing their choices.

## Contract Address

| Network  | Address                        |
|----------|--------------------------------|
| Preview  | _Not deployed yet — see Setup_ |
| Preprod  | _Not deployed yet — see Setup_ |

> **Manual step:** run `npm run deploy -- --network preview`, fund the wallet it
> prints, and paste the contract address it reports into the table above.
> The address is also recorded in `.midnight-state.json` (git-ignored).

## What This Does

Midnight Ballot demonstrates how zero-knowledge smart contracts on the Midnight Network can power confidential elections. Voters cast ballots through a privacy-preserving circuit that proves:

- The voter knows a valid voter secret (witness)
- The voter has not already voted (nullifier check)
- The vote choice is valid (type-constrained to candidate A or B)
- The election is currently open

**Only aggregate vote counters change on-chain.** An observer can see that a vote was cast and which candidate's tally increased, but cannot link any vote to a specific voter. The voter's identity and private witness data are never exposed on the public ledger.

## Privacy Model

### PUBLIC (on-chain, visible to anyone)

| Field | Type | Description |
|---|---|---|
| `electionId` | `Opaque<"string">` | Human-readable election name |
| `electionOpen` | `Boolean` | Whether voting is currently allowed |
| `totalVotes` | `Counter` | Total number of votes cast |
| `candidateAVotes` | `Counter` | Aggregate tally for Candidate A |
| `candidateBVotes` | `Counter` | Aggregate tally for Candidate B |
| `nullifierSpent` | `Map<Nullifier, Boolean>` | Set of spent nullifiers (prevents double-voting) |

### PRIVATE (witness, never on-chain)

| Field | Type | Description |
|---|---|---|
| `voterSecret` | `Bytes<32>` | Voter's private identity credential |
| `candidateChoice` | `Uint<0..1>` | 0 = Candidate A, 1 = Candidate B |

### ZERO-KNOWLEDGE PROOF

Each `castVote` call proves, without revealing:

- **Knowledge of a voter secret** — the caller provides a witness (`getVoterSecret`) that derives a valid nullifier via `persistentHash`
- **No double-voting** — the derived nullifier is checked against `nullifierSpent` and marked as spent on first use
- **Valid vote** — the `candidateChoice` parameter is type-constrained to `Uint<0..1>`
- **Election open** — an `assert(electionOpen == true)` gate prevents voting after closure

The voter's identity (`voterSecret`) is never disclosed. The nullifier is a one-way hash with domain-separated tags that cannot be reversed to the original secret. The `disclose()` calls on the nullifier and candidate choice are deliberate and documented — they enable the public double-vote guard and aggregate tally update while preserving voter anonymity.

## Tech Stack

- **Midnight Network** — privacy-first blockchain with ZK smart contracts
- **Compact** — domain-specific smart contract language (v0.23+)
- **Node.js** v22+
- **Docker** — for the proof server
- **TypeScript** — test runner and DApp integration

## Prerequisites

- **Node.js** ≥ 22.0.0 ([download](https://nodejs.org))
- **Docker** ([download](https://docker.com))
- **Compact CLI** ([install guide](https://docs.midnight.network/getting-started/installation))

### Install the Compact toolchain

```bash
# Install the Compact compiler
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh

# Pull and run the proof server
docker pull midnightnetwork/proof-server
docker run -d -p 6300:6300 --name proof-server midnightnetwork/proof-server

# Verify installation
compact --version
```

## Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd Midnight-Ballot

# Install dependencies
npm install

# Compile the contract
npm run compile

# Verify compilation
ls contracts/managed/ballot/contract/
```

## Run Tests

```bash
npm test
```

The suite has two layers, so it is useful on a fresh clone *and* exhaustive once
the contract is compiled:

| Layer | Tests | Status |
|---|---|---|
| Contract source assertions (`contracts/ballot.compact`) | 8 | ✅ Passing (no toolchain needed) |
| Ledger semantics — reference model | 7 | ✅ Passing (no toolchain needed) |
| Privacy model | 4 | ✅ Passing (no toolchain needed) |
| Compiled circuits (Compact runtime simulator) | 12 | ⏭ Skipped until `npm run compile` |

**Offline layer — no compiler, Docker or proof server required.** It asserts that
the contract source really declares the public ledger state, the private witness,
the deliberate `disclose()` calls and the public/private header comment, and it
exercises a reference model of the ledger (`castVote` / `closeElection` /
`openElection`) built on the same `persistentHash` builtin. This layer verifies:

- Commitment and nullifier derivation are deterministic and domain-separated
- Voter secrets never appear in ledger state and the nullifier is one-way
- Different voters are counted separately, one vote per nullifier
- Votes are rejected on a closed election and after reopening they resume

**Compiled layer — runs the real generated circuits.** Once `npm run compile` has
produced `contracts/managed/ballot/`, the simulator tests execute the actual
circuits in-process (no network, no proof server):

```bash
npm run compile
npm test
```

### End-to-end tests (requires deployed contract)

```bash
# Deploy to preview network
NODE_OPTIONS="--max-old-space-size=12288" npm run deploy -- --network preview

# Run e2e smoke test
npm run test:e2e
```

## Contract Architecture

```
contracts/
├── ballot.compact          # Voting contract (Compact language)
└── managed/ballot/         # Compiled output (auto-generated)
    ├── contract/           # TypeScript bindings
    ├── keys/               # Proving & verifying keys
    └── zkir/               # Zero-knowledge intermediate representation
```

### Circuits

| Circuit | Type | Description |
|---|---|---|
| `castVote` | Impure | Cast a private vote (updates ledger state) |
| `openElection` | Impure | Open voting |
| `closeElection` | Impure | Close voting |
| `isElectionOpen` | Impure | Check election status |
| `deriveVoterCommitment` | Pure | Derive commitment from voter secret |
| `deriveNullifier` | Pure | Derive nullifier from voter secret |

## Initial Idea

Midnight Ballot was born from a simple question: **can we build a voting system where every vote is counted, but no vote can be traced back to a voter?**

Traditional electronic voting systems force a trade-off between transparency and privacy. You can have a public ledger where anyone can verify the tally, but then individual votes are exposed. Or you can encrypt votes, but then the tally can't be independently verified without complex cryptographic ceremonies.

Zero-knowledge proofs flip this trade-off on its head. With Midnight's Compact language, you can write a smart contract where a voter proves "I am eligible and I cast exactly one valid vote" without ever revealing which candidate they chose. The blockchain stores only what the public needs to see: the election status and the aggregate tally. Everything else — voter identity, ballot choice, private credentials — stays in the voter's local DApp.

This project is a proof-of-concept for confidential on-chain governance. The same pattern — prove eligibility without revealing identity, prove a valid action without revealing which action — extends to DAOs, shareholder voting, surveys, and anywhere else privacy and verifiability need to coexist.

## Screenshots

> **Manual step:** add the screenshots below before submitting.

### Compilation Output

_[TODO: paste a screenshot of `npm run compile` showing the generated
`contracts/managed/ballot/` output with its circuits and keys.]_

### Test Results

_[TODO: paste a screenshot of `npm test`.]_

### Deployed Contract Address

_[TODO: paste a screenshot of `npm run deploy -- --network preview` printing the
contract address, and add that address to the Contract Address table above.]_

---

Built for the [Midnight Builder Challenge](https://risein.com) — Level 1
