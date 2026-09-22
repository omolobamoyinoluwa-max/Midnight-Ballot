# Midnight Ballot

> A privacy-preserving voting smart contract built on the Midnight Network using Compact, enabling users to cast verifiable votes without revealing their choices.

## Contract Address

| Network  | Contract Address                                                      |
|----------|-----------------------------------------------------------------------|
| Preview  | `66d5bbeda6bf264c040c7cd17ac3541f276555f0d38a421f64a0c95f61056200`   |
| Preprod  | _pending — see [Deploy](#deploy)_                                     |

Deployed on Preview on 2026-09-22 from wallet
`mn_addr_preview1v6jw9pgj2reuuzzednz0wamtn9xfq0em02crwwla6qphruv00j8qxg3ucu`,
with the constructor argument `Midnight Ballot Election 2026`.

Preprod wallet `mn_addr_preprod1pnvh8undk0hmdawut92w96xazmjvpezwt3kkt54y56qkxjqttegsmq6utn`
has been funded with 5000 tNight from the faucet — transaction submitted,
tx ID `005bd8eba5b8ea3fdb0ae1aadd8e4e1696372e4063188275c96a8f985a405b1173`.
The Preprod contract address will replace the placeholder above once
`npm run deploy -- --network preprod` completes against this funded wallet.

You can verify it against the public indexer:

```bash
curl -sS -X POST -H 'Content-Type: application/json' \
  -d '{"query":"query { contract(address: \"66d5bbeda6bf264c040c7cd17ac3541f276555f0d38a421f64a0c95f61056200\") { address state } }"}' \
  https://indexer.preview.midnight.network/api/v4/graphql
```

> **To populate a row:** follow [Deploy](#deploy) below. The deploy prints a wallet
> address to fund at the network's faucet, then prints the contract address.
> Addresses are also recorded in `.midnight-state.json` (git-ignored).
>
> **⚠ Blocks submission:** the Preprod row is still a placeholder, and Level 1 will
> not pass review until every row holds a real deployed address.

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

The proof server runs **locally** and is used by both Preview and Preprod. For
public networks only this one service is needed — the local devnet `node` and
`indexer` are not used.

```bash
# Just the proof server (correct for Preview / Preprod)
docker compose up -d proof-server

# Everything: local node + indexer + proof server (for the `undeployed` devnet)
npm run proof-server:start

# or run it directly, without compose
docker pull midnightntwrk/proof-server:8.1.0
docker run -d -p 6300:6300 --name proof-server midnightntwrk/proof-server:8.1.0

# Verify
curl http://127.0.0.1:6300   # → {"status":"ok",...}
```

> The proof server downloads SRS parameters (~33 MB, cached at `/.cache/midnight`
> in the container) from `srs.midnight.network` on first start, so it needs working
> DNS and egress. Persist the cache so later runs skip the download:
>
> ```bash
> docker run -d --name proof-server -p 6300:6300 \
>   -v midnight-zk-params:/.cache/midnight \
>   midnightntwrk/proof-server:8.1.0
> ```

<details>
<summary><strong>Troubleshooting: proof server exits with "Failed to fetch data from srs.midnight.network"</strong></summary>

In some sandboxed/DinD environments (notably GitHub Codespaces) Docker's
**user-defined bridge networks have no outbound egress**, so the container cannot
reach `srs.midnight.network` and the proof server exits with
`Failed to fetch data from https://srs.midnight.network/... after 3 attempts`.

The tell-tale symptom is DNS looking broken *only* on the compose network:

```bash
# works (default bridge)
docker run --rm curlimages/curl -sS -o /dev/null -w '%{http_code}\n' https://srs.midnight.network/bls_midnight_2p10

# fails (compose-created network)
docker run --rm --network midnight-ballot-devnet_default curlimages/curl -sS -o /dev/null -w '%{http_code}\n' https://srs.midnight.network/bls_midnight_2p10
```

**Workaround** — run the proof server on the default bridge instead of the compose
network. It is still reachable on `127.0.0.1:6300`, so nothing else changes:

```bash
docker rm -f ballot-proof-server 2>/dev/null
docker run -d --name ballot-proof-server \
  --network bridge \
  -p 6300:6300 \
  -v midnight-zk-params:/.cache/midnight \
  --restart unless-stopped \
  midnightntwrk/proof-server:8.1.0
```

</details>

## Setup

```bash
# Clone the repository
git clone https://github.com/omolobamoyinoluwa-max/Midnight-Ballot.git
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
npm run test:e2e
```

## Deploy

Deployment targets **Preview** and **Preprod**. Both are public test networks, so
the deploy needs two things: a locally running proof server, and a wallet funded
from that network's faucet.

> **Shortcut:** run `npm run address -- --network preview` and
> `npm run address -- --network preprod` first. That prints both wallet addresses
> immediately, so you can fund both faucets in one sitting instead of waiting
> through a sync, funding, and then repeating for the second network.

### How funding works

Each network gets its **own freshly generated wallet** the first time you deploy.
The seed is written to `.midnight-state.json` (git-ignored) and reused on every
later run, so your address stays the same and you only fund once per network.

`npm run deploy` is non-interactive and prints the wallet address, then **polls the
network for up to 10 minutes** waiting for tNIGHT to land. While it waits, open the
faucet in a browser, paste the address, and request funds — the deploy continues on
its own as soon as the balance arrives.

> The faucet is protected by a Cloudflare captcha, so funding cannot be scripted.
> This is the one step that must be done by hand, in a browser.

### Faucets and endpoints

| Network | Faucet | Indexer |
|---|---|---|
| **Preview** | [midnight-tmnight-preview.nethermind.dev](https://midnight-tmnight-preview.nethermind.dev) | `https://indexer.preview.midnight.network/api/v4/graphql` |
| **Preprod** | [midnight-tmnight-preprod.nethermind.dev](https://midnight-tmnight-preprod.nethermind.dev) | `https://indexer.preprod.midnight.network/api/v4/graphql` |

### Step by step

```bash
# 1. Start the proof server (both networks use the local one on :6300)
docker compose up -d proof-server
curl http://127.0.0.1:6300        # → {"status":"ok",...}

# 2. Deploy to Preview
NODE_OPTIONS="--max-old-space-size=12288" npm run deploy -- --network preview
```

The run does this, in order:

1. Syncs the wallet with the network (**several minutes on first run**; later runs
   resume from the checkpoint in `.midnight-wallet-state/`).
2. Prints `Wallet Address:` and `Balance: 0 tNight`.
3. Prints the faucet URL and starts polling.

**➡️ Now open the faucet, paste the printed address, and request tNIGHT.**

The deploy then registers the funds for DUST generation, waits for DUST, generates
proofs against the local proof server, deploys, and finally prints:

```
✅ Contract deployed successfully!

Contract Address: <address>
```

4. Repeat for Preprod:

```bash
NODE_OPTIONS="--max-old-space-size=12288" npm run deploy -- --network preprod
```

5. Paste both addresses into the [Contract Address](#contract-address) table at the
top of this README. They are also recorded in `.midnight-state.json`, and you can
re-print the last one any time with `npm run network`.

### If funding times out

The wallet seed is preserved, so simply re-run the same deploy command — the wallet
sync resumes from its checkpoint instead of starting over. To extend the wait window:

```bash
# default is 600000 ms (10 minutes)
MIDNIGHT_FAUCET_TIMEOUT_MS=1800000 npm run deploy -- --network preview
```

To get a network's wallet address up front — so you can fund it *before* sitting
through the first sync — derive it straight from the seed:

```bash
npm run address -- --network preview
npm run address -- --network preprod
```

This creates and persists the wallet for that network, so it is the same address
the deploy will later use. Once you have deployed, `npm run network` re-prints the
active network and its last deployment, and `npm run check-balance` shows the
wallet balance.

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

> **Manual step — required before submitting:** capture real PNG screenshots of the
> runs below, save the image files into the repo and embed them here.
>
> The blocks below are **plain-text transcripts**, not images. They were re-verified
> against a clean checkout (Compact launcher 0.5.2, compiler 0.31.1 holding language
> 0.23.0 / runtime 0.16.0, `npm run compile && npm test` → 31 passing, 0 skipped),
> but text alone does **not** satisfy the challenge's screenshot requirement.

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
