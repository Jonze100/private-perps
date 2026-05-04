import { StoredPosition } from './types';

const STORAGE_KEY = 'private_perps_positions';

export function loadPositions(): StoredPosition[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredPosition[];
  } catch {
    return [];
  }
}

export function savePositions(positions: StoredPosition[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
}

export function addPosition(position: StoredPosition): void {
  const positions = loadPositions();
  positions.unshift(position);
  savePositions(positions);
}

export function updatePosition(id: string, updates: Partial<StoredPosition>): void {
  const positions = loadPositions();
  const idx = positions.findIndex((p) => p.id === id);
  if (idx === -1) return;
  positions[idx] = { ...positions[idx], ...updates };
  savePositions(positions);
}

export function getPosition(id: string): StoredPosition | null {
  const positions = loadPositions();
  return positions.find((p) => p.id === id) ?? null;
}
