'use client';

import { FC, useState, useEffect, useCallback } from 'react';
import { loadPositions } from '@/lib/storage';
import { StoredPosition } from '@/lib/types';
import PositionCard from './PositionCard';

const PositionDashboard: FC = () => {
  const [positions, setPositions] = useState<StoredPosition[]>([]);
  const [markPrice, setMarkPrice] = useState(100);

  const refresh = useCallback(() => {
    setPositions(loadPositions());
  }, []);

  useEffect(() => {
    refresh();
    // Poll for updates every 5 seconds in case of external changes
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const openPositions = positions.filter((p) => !p.isClosed);
  const closedPositions = positions.filter((p) => p.isClosed);

  return (
    <div className="space-y-6">
      {/* Mark Price input */}
      <div className="rounded-xl border border-[#1a2035] bg-[#0e1117] p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-widest text-slate-400">
              Mark Price
            </p>
            <p className="font-mono text-[10px] text-slate-600 mt-0.5">
              Used for health checks and close operations
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              step="1"
              value={markPrice}
              onChange={(e) => setMarkPrice(Number(e.target.value))}
              className="w-28 rounded-lg border border-[#1a2035] bg-[#080b11] px-3 py-2 font-mono text-sm text-white focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 text-right"
            />
          </div>
        </div>
      </div>

      {/* Open positions */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-mono text-sm font-semibold uppercase tracking-widest text-slate-400">
            Open Positions
          </h2>
          <span className="rounded-md border border-[#1a2035] bg-[#080b11] px-2 py-0.5 font-mono text-xs text-slate-500">
            {openPositions.length}
          </span>
        </div>

        {openPositions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#1a2035] p-8 text-center">
            <p className="font-mono text-sm text-slate-600">No open positions</p>
            <p className="font-mono text-xs text-slate-700 mt-1">
              Open a position using the form on the left
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {openPositions.map((pos) => (
              <PositionCard
                key={pos.id}
                position={pos}
                markPrice={markPrice}
                onUpdate={refresh}
              />
            ))}
          </div>
        )}
      </div>

      {/* Closed positions */}
      {closedPositions.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-mono text-sm font-semibold uppercase tracking-widest text-slate-500">
              Closed Positions
            </h2>
            <span className="rounded-md border border-[#1a2035] bg-[#080b11] px-2 py-0.5 font-mono text-xs text-slate-600">
              {closedPositions.length}
            </span>
          </div>
          <div className="space-y-3">
            {closedPositions.map((pos) => (
              <PositionCard
                key={pos.id}
                position={pos}
                markPrice={markPrice}
                onUpdate={refresh}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PositionDashboard;
