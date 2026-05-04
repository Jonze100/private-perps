'use client';

import { FC, useState } from 'react';
import { useAnchorWallet } from '@solana/wallet-adapter-react';
import { AnchorProvider } from '@coral-xyz/anchor';
import { Connection } from '@solana/web3.js';
import { RPC_ENDPOINT, checkLiquidation, closePosition, hexToBytes } from '@/lib/program';
import { updatePosition } from '@/lib/storage';
import { StoredPosition } from '@/lib/types';

interface Props {
  position: StoredPosition;
  markPrice: number;
  onUpdate: () => void;
}

type ActionStatus = 'idle' | 'checking' | 'closing' | 'error';

const PositionCard: FC<Props> = ({ position, markPrice, onUpdate }) => {
  const anchorWallet = useAnchorWallet();
  const [actionStatus, setActionStatus] = useState<ActionStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleCheckLiquidation = async () => {
    if (!anchorWallet) return;
    setErrorMsg('');
    setActionStatus('checking');

    try {
      const connection = new Connection(RPC_ENDPOINT, 'confirmed');
      const provider = new AnchorProvider(connection, anchorWallet, { commitment: 'confirmed' });

      const publicKey = hexToBytes(position.publicKeyHex);
      const nonce = hexToBytes(position.nonceHex);

      const result = await checkLiquidation(
        provider,
        position.encryptedFields,
        publicKey,
        nonce,
        markPrice
      );

      updatePosition(position.id, {
        healthStatus: result.shouldLiquidate ? 'LIQUIDATABLE' : 'SAFE',
      });
      onUpdate();
      setActionStatus('idle');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setActionStatus('error');
    }
  };

  const handleClose = async () => {
    if (!anchorWallet) return;
    setErrorMsg('');
    setActionStatus('closing');

    try {
      const connection = new Connection(RPC_ENDPOINT, 'confirmed');
      const provider = new AnchorProvider(connection, anchorWallet, { commitment: 'confirmed' });

      const publicKey = hexToBytes(position.publicKeyHex);
      const nonce = hexToBytes(position.nonceHex);

      const result = await closePosition(
        provider,
        position.encryptedFields,
        publicKey,
        nonce,
        markPrice,
        position.sharedSecretHex
      );

      updatePosition(position.id, {
        isClosed: true,
        decryptedPnl: result.decryptedPnl.toString(),
      });
      onUpdate();
      setActionStatus('idle');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setActionStatus('error');
    }
  };

  const healthBadge = () => {
    switch (position.healthStatus) {
      case 'SAFE':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            SAFE
          </span>
        );
      case 'LIQUIDATABLE':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-rose-400">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
            LIQUIDATABLE
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-xs font-semibold text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
            UNKNOWN
          </span>
        );
    }
  };

  const formattedDate = new Date(position.openedAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={`rounded-xl border bg-[#0e1117] p-5 transition-colors ${
        position.isClosed ? 'border-slate-700/50 opacity-75' : 'border-[#1a2035]'
      }`}
    >
      {/* Header row */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] text-slate-600 mb-0.5">{formattedDate}</p>
          <p className="font-mono text-xs text-slate-400 truncate max-w-[160px]">{position.id}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {position.isClosed ? (
            <span className="rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-xs font-semibold text-slate-500">
              CLOSED
            </span>
          ) : (
            healthBadge()
          )}
        </div>
      </div>

      {/* Privacy note */}
      <div className="mb-4 rounded-lg border border-[#1a2035] bg-[#080b11] px-3 py-2">
        <p className="font-mono text-[10px] text-slate-600">
          Size &amp; direction are private — encrypted on-chain via MPC
        </p>
      </div>

      {/* PnL reveal */}
      {position.isClosed && position.decryptedPnl !== null && (
        <div className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
          <p className="font-mono text-[10px] text-slate-500 mb-1">Realized PnL (decrypted)</p>
          <p className={`font-mono text-xl font-bold ${
            BigInt(position.decryptedPnl) >= 0n ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {BigInt(position.decryptedPnl) >= 0n ? '+' : ''}
            {position.decryptedPnl}
          </p>
        </div>
      )}

      {errorMsg && (
        <p className="mb-3 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 font-mono text-[11px] text-rose-400">
          {errorMsg}
        </p>
      )}

      {/* Actions */}
      {!position.isClosed && (
        <div className="flex gap-2">
          <button
            onClick={handleCheckLiquidation}
            disabled={actionStatus !== 'idle' || !anchorWallet}
            className="flex-1 rounded-lg border border-[#1a2035] bg-[#080b11] py-2 font-mono text-xs text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {actionStatus === 'checking' ? 'Checking…' : 'Check Health'}
          </button>
          <button
            onClick={handleClose}
            disabled={actionStatus !== 'idle' || !anchorWallet}
            className="flex-1 rounded-lg border border-rose-500/30 bg-rose-500/10 py-2 font-mono text-xs text-rose-400 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {actionStatus === 'closing' ? 'Closing…' : 'Close & Reveal PnL'}
          </button>
        </div>
      )}
    </div>
  );
};

export default PositionCard;
