/**
 * Wallet connect / disconnect.
 *
 * Three states get three different treatments, because each needs a different
 * user action:
 *   • no wallet injected → an install pointer, and the connect button is disabled
 *   • wallet present, not connected → the connect button
 *   • connected → the address, the network it is on, and disconnect
 *
 * The error banner covers the three failures the connector can report: wallet not
 * installed, the user rejected the request, and a network mismatch.
 */

import { useState } from 'react';

import type { ConnectionState } from '../hooks/useMidnight';
import type { MidnightWallet } from '../midnight';

export interface WalletConnectProps {
  readonly status: ConnectionState;
  readonly wallets: readonly MidnightWallet[];
  readonly walletName: string | null;
  readonly address: string | null;
  readonly networkId: string;
  readonly error: string | null;
  readonly onConnect: () => void;
  readonly onDisconnect: () => void;
}

/** `mn_addr_preprod1q9x…f4k2` — long enough to verify, short enough to scan. */
function shorten(address: string): string {
  if (address.length <= 26) return address;
  return `${address.slice(0, 18)}…${address.slice(-8)}`;
}

export function WalletConnect({
  status,
  wallets,
  walletName,
  address,
  networkId,
  error,
  onConnect,
  onDisconnect,
}: WalletConnectProps) {
  const [copied, setCopied] = useState(false);

  const connected = status === 'connected';
  const connecting = status === 'connecting';
  const missingWallet = wallets.length === 0;

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the address is on screen regardless.
      setCopied(false);
    }
  }

  return (
    <section className="card wallet" aria-labelledby="wallet-heading">
      <header className="card-header">
        <h2 id="wallet-heading">Wallet</h2>
        <span className={connected ? 'pill pill-on' : 'pill pill-off'}>
          {connected ? 'Connected' : connecting ? 'Connecting…' : 'Disconnected'}
        </span>
      </header>

      {missingWallet && (
        <p className="notice notice-warn">
          <strong>No Midnight wallet detected.</strong> Install the{' '}
          <a href="https://www.lace.io/midnight" target="_blank" rel="noreferrer">
            Lace extension for Midnight
          </a>
          , unlock it, then reload this page.
        </p>
      )}

      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}

      {connected && address ? (
        <div className="wallet-body">
          <dl className="facts">
            <div>
              <dt>Address</dt>
              <dd className="mono" title={address}>
                {shorten(address)}
                <button type="button" className="link" onClick={copyAddress}>
                  {copied ? 'copied' : 'copy'}
                </button>
              </dd>
            </div>
            <div>
              <dt>Wallet</dt>
              <dd>{walletName ?? 'unknown'}</dd>
            </div>
            <div>
              <dt>Network</dt>
              <dd>
                <span className="pill pill-network">{networkId}</span>
              </dd>
            </div>
          </dl>

          <button type="button" className="btn btn-ghost" onClick={onDisconnect}>
            Disconnect
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-primary"
          onClick={onConnect}
          disabled={connecting || missingWallet}
        >
          {connecting ? 'Waiting for wallet…' : 'Connect Lace wallet'}
        </button>
      )}
    </section>
  );
}
