export interface StoredPosition {
  /** Unique id generated at open time */
  id: string;
  /** When the position was opened */
  openedAt: number;

  // ── encrypted fields (as number[][] — one [u8;32] per field) ──────────────
  encryptedFields: number[][];
  /** 16-byte nonce used for encryption, stored as hex string */
  nonceHex: string;
  /** x25519 ephemeral public key as hex string (32 bytes) */
  publicKeyHex: string;
  /**
   * x25519 shared secret as hex string (32 bytes).
   * Used to reconstruct RescueCipher for decryption.
   */
  sharedSecretHex: string;

  // ── health status (updated by checkLiquidation) ───────────────────────────
  healthStatus: 'UNKNOWN' | 'SAFE' | 'LIQUIDATABLE';

  // ── close / PnL state ─────────────────────────────────────────────────────
  isClosed: boolean;
  /** Decrypted PnL as a string (bigint stringified) */
  decryptedPnl: string | null;
}
