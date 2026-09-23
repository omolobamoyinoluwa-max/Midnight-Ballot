# Managed Artifacts

This directory contains the auto-generated artifacts produced by the Compact compiler:
- `contract/`: TypeScript bindings and runtime contract definitions
- `keys/`: Prover and verifier cryptographic keys for zero-knowledge circuits
- `zkir/`: Zero-Knowledge Intermediate Representation bytecodes
- `compiler/`: Metadata and version compatibility records

Compiled via:
```bash
compact compile contracts/ballot.compact contracts/managed/ballot
```
and mirrored to `managed/ballot`.
