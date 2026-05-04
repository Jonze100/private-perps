'use client';

import { FC, useState } from 'react';
import { useWallet, useAnchorWallet } from '@solana/wallet-adapter-react';
import { AnchorProvider } from '@coral-xyz/anchor';
import { Connection } from '@solana/web3.js';
import { RPC_ENDPOINT, setupEncryption, openPosition } from '@/lib/program';
import { addPosition } from '@/lib/storage';
import { StoredPosition } from '@/lib/types';

interface Props {
  onPositionOpened: () => void;
}

type Status = 'idle' | 'encrypting' | 'sending' | 'awaiting_mpc' | 'done' | 'error';

const OpenPositionForm: FC<Props> = ({ onPositionOpened }) => {
  const { connected, publicKey } = useWallet();
  const anchorWallet = useAnchorWallet();

  const [size, setSize] = useState('');
  const [isLong, setIsLong] = useState(true);
  const [entryPrice, setEntryPrice] = useState('');
  const [collateral, setCollateral] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connected || !publicKey || !anchorWallet) {
      setErrorMsg('Connect your wallet first.');
      setStatus('error');
      return;
    }

    const sizeBig = BigInt(Math.round(parseFloat(size)));
    const entryBig = BigInt(Math.round(parseFloat(entryPrice)));
    const collBig = BigInt(Math.round(parseFloat(collateral)));

    if (sizeBig <= 0n || entryBig <= 0n || collBig <= 0n) {
      setErrorMsg('All values must be positive integers.');
      setStatus('error');
      return;
    }

    setErrorMsg('');

    try {
      setStatus('encrypting');
      const connection = new Connection(RPC_ENDPOINT, 'confirmed');
      const provider = new AnchorProvider(connection, anchorWallet, { commitment: 'confirmed' });

      const enc = await setupEncryption(provider, publicKey, sizeBig, isLong, entryBig, collBig);

      setStatus('sending');
      setStatus('awaiting_mpc');

      await openPosition(provider, enc.encryptedFields, enc.publicKey, enc.nonce);

      const position: StoredPosition = {
        id: `pos_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        openedAt: Date.now(),
        encryptedFields: enc.encryptedFields,
        nonceHex: enc.nonceHex,
        publicKeyHex: enc.publicKeyHex,
        sharedSecretHex: enc.sharedSecretHex,
        healthStatus: 'UNKNOWN',
        isClosed: false,
        decryptedPnl: null,
      };
      addPosition(position);

      setStatus('done');
      setSize('');
      setEntryPrice('');
      setCollateral('');
      onPositionOpened();

      setTimeout(() => setStatus('idle'), 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setStatus('error');
    }
  };

  const statusLabel: Record<Status, string> = {
    idle: 'Open Position',
    encrypting: 'Encrypting…',
    sending: 'Sending tx…',
    awaiting_mpc: 'Awaiting MPC…',
    done: 'Opened!',
    error: 'Retry',
  };

  const isLoading = ['encrypting', 'sending', 'awaiting_mpc'].includes(status);

  return (
    <div className="rounded-xl border border-[#1a2035] bg-[#0e1117] p-6">
      <h2 className="mb-5 font-mono text-sm font-semibold uppercase tracking-widest text-slate-400">
        Open Position
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Direction toggle */}
        <div>
          <label className="mb-1.5 block font-mono text-xs text-slate-500">Direction</label>
          <div className="flex rounded-lg overflow-hidden border border-[#1a2035]">
            <button
              type="button"
              onClick={() => setIsLong(true)}
              className={`flex-1 py-2.5 font-mono text-sm font-semibold transition-colors ${
                isLong
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-[#080b11] text-slate-500 hover:bg-[#0e1117]'
              }`}
            >
              LONG
            </button>
            <button
              type="button"
              onClick={() => setIsLong(false)}
              className={`flex-1 py-2.5 font-mono text-sm font-semibold transition-colors ${
                !isLong
                  ? 'bg-rose-500/20 text-rose-400'
                  : 'bg-[#080b11] text-slate-500 hover:bg-[#0e1117]'
              }`}
            >
              SHORT
            </button>
          </div>
        </div>

        {/* Size */}
        <div>
          <label className="mb-1.5 block font-mono text-xs text-slate-500">
            Size <span className="text-slate-600">(integer units)</span>
          </label>
          <input
            type="number"
            min="1"
            step="1"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            placeholder="10"
            required
            className="w-full rounded-lg border border-[#1a2035] bg-[#080b11] px-4 py-2.5 font-mono text-sm text-white placeholder-slate-600 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>

        {/* Entry Price */}
        <div>
          <label className="mb-1.5 block font-mono text-xs text-slate-500">Entry Price</label>
          <input
            type="number"
            min="1"
            step="1"
            value={entryPrice}
            onChange={(e) => setEntryPrice(e.target.value)}
            placeholder="100"
            required
            className="w-full rounded-lg border border-[#1a2035] bg-[#080b11] px-4 py-2.5 font-mono text-sm text-white placeholder-slate-600 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>

        {/* Collateral */}
        <div>
          <label className="mb-1.5 block font-mono text-xs text-slate-500">Collateral</label>
          <input
            type="number"
            min="1"
            step="1"
            value={collateral}
            onChange={(e) => setCollateral(e.target.value)}
            placeholder="500"
            required
            className="w-full rounded-lg border border-[#1a2035] bg-[#080b11] px-4 py-2.5 font-mono text-sm text-white placeholder-slate-600 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>

        {/* Privacy note */}
        <div className="rounded-lg border border-[#1a2035] bg-[#080b11] px-4 py-3">
          <p className="font-mono text-[11px] text-slate-500 leading-relaxed">
            Size, direction, entry price, and collateral are encrypted with RescueCipher
            before leaving your browser. The MPC network never sees your plaintext.
          </p>
        </div>

        {errorMsg && (
          <p className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-2 font-mono text-xs text-rose-400">
            {errorMsg}
          </p>
        )}

        <button
          type="submit"
          disabled={isLoading || !connected}
          className={`w-full rounded-lg py-3 font-mono text-sm font-semibold transition-all ${
            !connected
              ? 'cursor-not-allowed bg-slate-700 text-slate-500'
              : isLoading
              ? 'cursor-not-allowed bg-slate-700 text-slate-400'
              : status === 'done'
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 active:scale-[0.98]'
          }`}
        >
          {!connected ? 'Connect Wallet' : statusLabel[status]}
        </button>
      </form>
    </div>
  );
};

export default OpenPositionForm;
