# Product Proposal

## What is the product, and who uses it?
Midnight Ballot is a privacy-preserving election and polling dApp designed for decentralized autonomous organizations (DAOs), corporate boards, and community governance. It allows credentialed voters to cast their ballots securely and immutably without publicly revealing their identities or which specific candidate/option they voted for. 

## Why Midnight specifically?
A traditional transparent blockchain (like Ethereum or Cardano without zero-knowledge layers) exposes the exact address of every voter alongside their ballot choice. This transparency often leads to voter coercion, bribery, or groupthink (where people vote based on early trends rather than conviction). Midnight solves this by executing the ballot verification circuit locally via the wallet. The network only verifies the ZK proof (ensuring the voter is authorized and hasn't double-voted) and increments the public tally, completely severing the link between the voter's identity and their specific vote.

## Data Model
| Data Point       | Type           | Disclosed To |
|------------------|----------------|--------------|
| Election Tally   | Public ledger  | Everyone     |
| Nullifier Tree   | Public ledger  | Everyone     |
| Voter Credential | Private witness| No one       |
| Chosen Candidate | Private witness| No one       |

## Mainnet Feasibility
Yes, this is highly realistic to reach Mainnet by Level 6. The core Compact contract is already fully functional on Preprod, properly handling state transitions, nullifier checks, and public tally updates. The remaining work involves hardening the frontend wallet integration, adding a robust admin flow for issuing voter credentials, and finalizing the UI/UX for production release.
