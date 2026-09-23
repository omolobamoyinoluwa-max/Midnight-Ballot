import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  getVoterSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, { bytes: Uint8Array
                                                                             }];
}

export type ImpureCircuits<PS> = {
  openElection(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  closeElection(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  castVote(context: __compactRuntime.CircuitContext<PS>,
           candidateChoice_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  isElectionOpen(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, boolean>;
}

export type ProvableCircuits<PS> = {
  openElection(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  closeElection(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  castVote(context: __compactRuntime.CircuitContext<PS>,
           candidateChoice_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  isElectionOpen(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, boolean>;
}

export type PureCircuits = {
  deriveVoterCommitment(secret_0: { bytes: Uint8Array }): { bytes: Uint8Array };
  deriveNullifier(secret_0: { bytes: Uint8Array }): { bytes: Uint8Array };
}

export type Circuits<PS> = {
  deriveVoterCommitment(context: __compactRuntime.CircuitContext<PS>,
                        secret_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, { bytes: Uint8Array
                                                                                              }>;
  deriveNullifier(context: __compactRuntime.CircuitContext<PS>,
                  secret_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, { bytes: Uint8Array
                                                                                        }>;
  openElection(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  closeElection(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  castVote(context: __compactRuntime.CircuitContext<PS>,
           candidateChoice_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  isElectionOpen(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, boolean>;
}

export type Ledger = {
  readonly electionId: string;
  readonly electionOpen: boolean;
  readonly totalVotes: bigint;
  readonly candidateAVotes: bigint;
  readonly candidateBVotes: bigint;
  nullifierSpent: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: { bytes: Uint8Array }): boolean;
    lookup(key_0: { bytes: Uint8Array }): boolean;
    [Symbol.iterator](): Iterator<[{ bytes: Uint8Array }, boolean]>
  };
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               electionName_0: string): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
