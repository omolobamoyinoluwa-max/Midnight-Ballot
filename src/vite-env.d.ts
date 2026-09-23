/// <reference types="vite/client" />

/**
 * Build-time configuration for the dApp.
 *
 * `VITE_BALLOT_CONTRACT_ADDRESS` and `VITE_MIDNIGHT_NETWORK` let a deployment
 * point at a different deployment without editing source. Both fall back to the
 * Preprod deployment recorded in the README, so a plain `npm run dev`/`build`
 * connects to the real contract with no configuration at all.
 */
interface ImportMetaEnv {
  /** Ledger address of the deployed ballot contract. */
  readonly VITE_BALLOT_CONTRACT_ADDRESS?: string;
  /** Midnight network id the dApp requires the wallet to be on. */
  readonly VITE_MIDNIGHT_NETWORK?: string;
  /** Base URL the browser fetches ZK artifacts from. Defaults to `<origin>/zk/ballot`. */
  readonly VITE_ZK_ASSETS_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
