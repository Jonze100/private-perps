'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import OpenPositionForm from '@/components/OpenPositionForm';
import PositionDashboard from '@/components/PositionDashboard';

export default function Home() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="flex min-h-screen flex-col bg-[#080b11]">
      <Header />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {/* Info banner */}
        <div className="mb-8 rounded-xl border border-[#1a2035] bg-[#0e1117] px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="font-mono text-xs text-slate-400">
                Program:{' '}
                <span className="text-slate-300">
                  C4vJTBnKr3A5gc3aP8BZXb3H6csCGrTaeiZHbSChAh9M
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-400" />
              <span className="font-mono text-xs text-slate-400">
                All position data encrypted with RescueCipher before leaving browser
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-purple-400" />
              <span className="font-mono text-xs text-slate-400">
                PnL revealed only after MPC computation finalizes
              </span>
            </div>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          {/* Left: Open position form */}
          <div className="lg:sticky lg:top-8 lg:self-start">
            <OpenPositionForm onPositionOpened={() => setRefreshKey((k) => k + 1)} />
          </div>

          {/* Right: Position dashboard */}
          <div key={refreshKey}>
            <PositionDashboard />
          </div>
        </div>
      </main>

      <footer className="border-t border-[#1a2035] px-6 py-4">
        <div className="mx-auto max-w-7xl">
          <p className="font-mono text-[10px] text-slate-700">
            PrivatePerps — Arcium MPC + Anchor on Solana localnet (
            <span className="text-slate-600">http://localhost:8899</span>)
          </p>
        </div>
      </footer>
    </div>
  );
}
