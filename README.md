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

### PRIVATE (witness, never on-chain, never disclosed)

| Field | Type | Description |
|---|---|---|
| `voterSecret` | `Bytes<32>` | Voter's private identity credential — the only witness |

### DISCLOSED BY DESIGN (revealed by an explicit `disclose()`, never the secret)

| Value | Type | Why it is public |
|---|---|---|
| `nullifier` | `Bytes<32>` | Publishing the hash of the voter secret is what makes double-voting detectable without identifying the voter |
| `candidateChoice` | `Uint<0..2>` | Circuit argument; disclosing it is what lets the public tally move — *which* tally grew is public, *who* grew it is not |

### ZERO-KNOWLEDGE PROOF

Each `castVote` call proves, without revealing:

- **Knowledge of a voter secret** — the caller provides a witness (`getVoterSecret`) whose hash is the nullifier it publishes
- **No double-voting** — the derived nullifier is checked against `nullifierSpent` and marked as spent on first use
- **Valid vote** — `candidateChoice` is type-constrained: Compact's `Uint<a..b>` admits `a..b-1`, so `Uint<0..2>` admits exactly `{0, 1}`. (`Uint<0..1>` would admit only `0` and make Candidate B unreachable — the bound is deliberate.)
- **Election open** — an `assert(electionOpen == true)` gate prevents voting after closure

The voter's identity (`voterSecret`) is the one thing never disclosed: only its hash (the nullifier) is published, and `persistentHash` with domain-separated tags cannot be reversed to the secret. The `disclose()` calls on the nullifier and the candidate choice are deliberate and commented in the contract — they enable the public double-vote guard and the public tally while preserving voter anonymity.

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
# 1. Install the Compact launcher
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh

# 2. Pin the compiler to the version this repo's SDK stack expects
#    (compactc 0.31.1 → language 0.23.0, runtime 0.16.0, which is what
#    @midnight-ntwrk/compact-runtime 0.16.0 in package.json requires).
#    A newer compiler emits code for a newer runtime and fails with
#    "Version mismatch: compiled code expects <x>, runtime is 0.16.0".
compact update 0.31.1

# 3. Verify
compact --version
```

### Run the proof server

```bash
# Preferred: the compose service, which pins the image tag
npm run proof-server:start

# or run it directly
docker pull midnightntwrk/proof-server:8.1.0
docker run -d -p 6300:6300 --name proof-server midnightntwrk/proof-server:8.1.0

# Verify
curl http://127.0.0.1:6300   # → {"status":"ok",...}
```

> The proof server downloads SRS parameters (~tens of MB) from
> `srs.midnight.network` on first start, so it needs working DNS and egress.

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
| Compiled circuits (Compact runtime simulator) | 12 | ✅ Passing (after `npm run compile`) |

**31 tests, 0 skipped** on a compiled checkout.

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

> **Manual step:** add image screenshots of these terminal runs before submitting.
> The captured text is below.

### Compilation Output

```console
$ compact --version
compact 0.5.2

$ npm run compile
> midnight-ballot@1.0.0 compile
> compact compile contracts/ballot.compact contracts/managed/ballot

Compiling 4 circuits:

$ cat contracts/managed/ballot/compiler/contract-info.json | head -4
{
  "compiler-version": "0.31.1",
  "language-version": "0.23.0",
  "runtime-version": "0.16.0",

$ ls contracts/managed/ballot
compiler  contract  keys  zkir

$ ls contracts/managed/ballot/keys
castVote.prover        castVote.verifier
closeElection.prover   closeElection.verifier
isElectionOpen.prover  isElectionOpen.verifier
openElection.prover    openElection.verifier
```

### Test Results

```console
$ npm test
> npx tsx --test tests/ballot.test.ts

▶ Midnight Ballot — contract source
  ✔ declares public ledger state for the election and the tallies
  ✔ declares a private witness as a circuit input
  ✔ never stores the witness value in ledger state
  ✔ discloses deliberately: the nullifier and the tally branch only
  ✔ guards castVote on election state and on a fresh nullifier
  ✔ updates the total plus exactly one candidate tally
  ✔ documents what is public and what is private in the header comment
  ✔ uses the domain-separation tags the reference model reproduces
✔ Midnight Ballot — contract source
▶ Midnight Ballot — ledger semantics (reference model)
  ✔ initialises with a zeroed, open election
  ✔ counts a vote for candidate A in the total and in A only
  ✔ counts a vote for candidate B
  ✔ counts different voters separately and keeps both nullifiers
  ✔ rejects a second vote from the same voter
  ✔ rejects votes while the election is closed, and accepts them again after reopening
  ✔ keeps no trace of voter secrets anywhere in the ledger
✔ Midnight Ballot — ledger semantics (reference model)
▶ Midnight Ballot — privacy model
  ✔ derives a deterministic 32-byte commitment from a voter secret
  ✔ gives every voter a distinct commitment
  ✔ derives a deterministic nullifier that domain separation keeps distinct from the commitment
  ✔ leaves the nullifier one-way: it never equals or contains the secret
✔ Midnight Ballot — privacy model
▶ Midnight Ballot — compiled circuits
  ▶ pure circuits (4 passed)
  ▶ state transitions (8 passed)
    ✔ initialises an open election with empty tallies
    ✔ reports the election as open right after initialisation
    ✔ closes and reopens the election
    ✔ casts a vote for candidate A and increments exactly one tally
    ✔ casts a vote for candidate B and increments exactly one tally
    ✔ rejects a second vote from the same voter
    ✔ rejects a vote while the election is closed
    ✔ lets different voters each cast one vote
✔ Midnight Ballot — compiled circuits

ℹ tests 31
ℹ pass 31
ℹ fail 0
ℹ skipped 0
```

### Deployed Contract Address

_[TODO: paste a screenshot of `npm run deploy -- --network preview` printing the
contract address, and add that address to the Contract Address table above.]_

---

Built for the [Midnight Builder Challenge](https://risein.com) — Level 1
