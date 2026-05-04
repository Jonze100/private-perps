'use client';

import { FC } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

const Header: FC = () => {
  return (
    <header className="border-b border-[#1a2035] bg-[#0e1117] px-6 py-4">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/30">
            <span className="text-sm font-bold text-emerald-400">P</span>
          </div>
          <div>
            <h1 className="font-mono text-base font-semibold tracking-tight text-white">
              PrivatePerps
            </h1>
            <p className="font-mono text-[10px] text-slate-500">MPC-encrypted perpetuals</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-1.5 sm:flex">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-xs text-slate-400">localnet</span>
          </div>
          <WalletMultiButton className="!bg-[#1a2035] !hover:bg-[#232d48] !rounded-lg !border !border-[#1a2035] !text-white !font-mono !text-sm" />
        </div>
      </div>
    </header>
  );
};

export default Header;
