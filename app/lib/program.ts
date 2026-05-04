'use client';

import * as anchor from '@coral-xyz/anchor';
import { AnchorProvider, BN } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  getArciumEnv,
  getClusterAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getComputationAccAddress,
  getMXEAccAddress,
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
  getMXEPublicKey,
  getLookupTableAddress,
  getArciumProgram,
  awaitComputationFinalization,
  RescueCipher,
  x25519,
  deserializeLE,
} from '@arcium-hq/client';

// RPC endpoint — change to devnet/mainnet as needed
// devnet: https://api.devnet.solana.com
// mainnet: https://api.mainnet-beta.solana.com
export const RPC_ENDPOINT = 'http://localhost:8899';

export const PROGRAM_ID = new PublicKey('C4vJTBnKr3A5gc3aP8BZXb3H6csCGrTaeiZHbSChAh9M');

// We use `any` as the IDL type to avoid import path issues in the browser build.
// The IDL is at ../../target/types/private_perps relative to the app dir.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProgram = anchor.Program<any>;

/**
 * Generate a random 8-byte computation offset using the Web Crypto API.
 */
export function randomComputationOffset(): BN {
  const bytes = new Uint8Array(8);
  window.crypto.getRandomValues(bytes);
  // interpret as little-endian u64
  let value = BigInt(0);
  for (let i = 7; i >= 0; i--) {
    value = (value << BigInt(8)) | BigInt(bytes[i]);
  }
  return new BN(value.toString());
}

/**
 * Generate a random 16-byte nonce using the Web Crypto API.
 */
export function randomNonce(): Uint8Array {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return bytes;
}

export interface EncryptionResult {
  encryptedFields: number[][];
  nonceHex: string;
  publicKeyHex: string;
  sharedSecretHex: string;
  cipher: RescueCipher;
  publicKey: Uint8Array;
  nonce: Uint8Array;
}

/**
 * Encode a wallet PublicKey as a u128 (first 16 bytes, little-endian BigInt).
 */
export function pubkeyToU128(pubkey: PublicKey): bigint {
  const bytes = pubkey.toBytes().slice(0, 16);
  let value = BigInt(0);
  for (let i = 15; i >= 0; i--) {
    value = (value << BigInt(8)) | BigInt(bytes[i]);
  }
  return value;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    result[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return result;
}

export function hexToBytes(hex: string): Uint8Array {
  return fromHex(hex);
}

/**
 * Set up x25519 encryption and encrypt position fields.
 */
export async function setupEncryption(
  provider: AnchorProvider,
  ownerPubkey: PublicKey,
  size: bigint,
  isLong: boolean,
  entryPrice: bigint,
  collateral: bigint
): Promise<EncryptionResult> {
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);

  const mxePublicKey = await getMXEPublicKey(provider, PROGRAM_ID);
  if (!mxePublicKey) {
    throw new Error('MXE public key not available. Is the localnet running?');
  }

  const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
  const cipher = new RescueCipher(sharedSecret);
  const nonce = randomNonce();

  const owner = pubkeyToU128(ownerPubkey);
  const plaintext = [size, isLong ? BigInt(1) : BigInt(0), entryPrice, collateral, owner, BigInt(1)];
  const encryptedFields = cipher.encrypt(plaintext, nonce);

  return {
    encryptedFields,
    nonceHex: toHex(nonce),
    publicKeyHex: toHex(publicKey),
    sharedSecretHex: toHex(sharedSecret),
    cipher,
    publicKey,
    nonce,
  };
}

/**
 * Reconstruct a RescueCipher from a stored shared secret hex string.
 */
export function cipherFromSecret(sharedSecretHex: string): RescueCipher {
  return new RescueCipher(fromHex(sharedSecretHex));
}

/**
 * Build a provider from a wallet adapter wallet.
 */
export function buildProvider(wallet: anchor.Wallet): AnchorProvider {
  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  return new AnchorProvider(connection, wallet as anchor.Wallet, { commitment: 'confirmed' });
}

/**
 * Load the program using the IDL fetched on-chain.
 */
export async function getProgram(provider: AnchorProvider): Promise<AnyProgram> {
  // Dynamically import the IDL types — falls back to `any` if not found
  let idl: anchor.Idl;
  try {
    // Path relative to the Next.js build — the target dir is two levels up
    const mod = await import('../../target/idl/private_perps.json');
    idl = mod.default as anchor.Idl;
  } catch {
    // Fetch IDL on-chain if local file not available
    const fetched = await anchor.Program.fetchIdl(PROGRAM_ID, provider);
    if (!fetched) throw new Error('Could not load IDL');
    idl = fetched;
  }
  return new anchor.Program(idl, provider);
}

function getBaseAccounts(computationOffset: BN) {
  const arciumEnv = getArciumEnv();
  return {
    computationAccount: getComputationAccAddress(arciumEnv.arciumClusterOffset, computationOffset),
    clusterAccount: getClusterAccAddress(arciumEnv.arciumClusterOffset),
    mxeAccount: getMXEAccAddress(PROGRAM_ID),
    mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
    executingPool: getExecutingPoolAccAddress(arciumEnv.arciumClusterOffset),
  };
}

function compDefAccount(name: string): PublicKey {
  const offset = Buffer.from(getCompDefAccOffset(name)).readUInt32LE();
  return getCompDefAccAddress(PROGRAM_ID, offset);
}

async function getAddressLookupTable(provider: AnchorProvider): Promise<PublicKey> {
  const arciumProgram = getArciumProgram(provider);
  const mxeAccPubkey = getMXEAccAddress(PROGRAM_ID);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mxeAcc = await (arciumProgram.account as any).mxeAccount.fetch(mxeAccPubkey);
  return getLookupTableAddress(PROGRAM_ID, new BN(mxeAcc.lutOffsetSlot.toString()));
}

export interface OpenPositionResult {
  event: {
    encSize: number[];
    encIsLong: number[];
    encEntryPrice: number[];
    encCollateral: number[];
    encOwner: number[];
    encIsOpen: number[];
    nonce: number[];
  };
}

/**
 * Open a position by encrypting fields and calling the on-chain instruction.
 * Returns after the MPC computation finalizes and the positionOpenedEvent fires.
 */
export async function openPosition(
  provider: AnchorProvider,
  encryptedFields: number[][],
  publicKey: Uint8Array,
  nonce: Uint8Array
): Promise<OpenPositionResult> {
  const program = await getProgram(provider);
  const computationOffset = randomComputationOffset();
  const arciumEnv = getArciumEnv();

  const nonceU128 = new BN(deserializeLE(nonce).toString());

  const eventPromise = new Promise<OpenPositionResult['event']>((resolve) => {
    const listener = program.addEventListener('positionOpenedEvent', (e: unknown) => {
      program.removeEventListener(listener);
      resolve(e as OpenPositionResult['event']);
    });
  });

  const altAddress = await getAddressLookupTable(provider);
  const altAccount = await provider.connection.getAddressLookupTable(altAddress);
  const lookupTables = altAccount.value ? [altAccount.value] : [];

  await (program.methods as any)
    .openPosition(
      computationOffset,
      Array.from(encryptedFields[0]),
      Array.from(encryptedFields[1]),
      Array.from(encryptedFields[2]),
      Array.from(encryptedFields[3]),
      Array.from(encryptedFields[4]),
      Array.from(encryptedFields[5]),
      Array.from(publicKey),
      nonceU128
    )
    .accountsPartial({
      ...getBaseAccounts(computationOffset),
      compDefAccount: compDefAccount('open_position'),
    })
    .preInstructions([])
    .transaction()
    .then(async (tx: anchor.web3.Transaction) => {
      // Send with lookup tables if available (v0 transaction)
      const { blockhash, lastValidBlockHeight } = await provider.connection.getLatestBlockhash('confirmed');
      const messageV0 = new anchor.web3.TransactionMessage({
        payerKey: provider.wallet.publicKey,
        recentBlockhash: blockhash,
        instructions: tx.instructions,
      }).compileToV0Message(lookupTables);
      const vtx = new anchor.web3.VersionedTransaction(messageV0);
      const signed = await provider.wallet.signTransaction(vtx);
      return provider.connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
    });

  await awaitComputationFinalization(provider, computationOffset, PROGRAM_ID, 'confirmed');

  const event = await eventPromise;
  return { event };
}

export interface CheckLiquidationResult {
  shouldLiquidate: boolean;
}

/**
 * Check whether a position should be liquidated.
 */
export async function checkLiquidation(
  provider: AnchorProvider,
  encryptedFields: number[][],
  publicKey: Uint8Array,
  nonce: Uint8Array,
  markPrice: number
): Promise<CheckLiquidationResult> {
  const program = await getProgram(provider);
  const computationOffset = randomComputationOffset();

  const nonceU128 = new BN(deserializeLE(nonce).toString());
  const markPriceBN = new BN(markPrice);

  const eventPromise = new Promise<{ shouldLiquidate: boolean }>((resolve) => {
    const listener = program.addEventListener('liquidationCheckedEvent', (e: unknown) => {
      program.removeEventListener(listener);
      resolve(e as { shouldLiquidate: boolean });
    });
  });

  const altAddress = await getAddressLookupTable(provider);
  const altAccount = await provider.connection.getAddressLookupTable(altAddress);
  const lookupTables = altAccount.value ? [altAccount.value] : [];

  await (program.methods as any)
    .checkLiquidation(
      computationOffset,
      Array.from(encryptedFields[0]),
      Array.from(encryptedFields[1]),
      Array.from(encryptedFields[2]),
      Array.from(encryptedFields[3]),
      Array.from(encryptedFields[4]),
      Array.from(encryptedFields[5]),
      markPriceBN,
      Array.from(publicKey),
      nonceU128
    )
    .accountsPartial({
      ...getBaseAccounts(computationOffset),
      compDefAccount: compDefAccount('check_liquidation'),
    })
    .transaction()
    .then(async (tx: anchor.web3.Transaction) => {
      const { blockhash } = await provider.connection.getLatestBlockhash('confirmed');
      const messageV0 = new anchor.web3.TransactionMessage({
        payerKey: provider.wallet.publicKey,
        recentBlockhash: blockhash,
        instructions: tx.instructions,
      }).compileToV0Message(lookupTables);
      const vtx = new anchor.web3.VersionedTransaction(messageV0);
      const signed = await provider.wallet.signTransaction(vtx);
      return provider.connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
    });

  await awaitComputationFinalization(provider, computationOffset, PROGRAM_ID, 'confirmed');

  const event = await eventPromise;
  return { shouldLiquidate: event.shouldLiquidate };
}

export interface ClosePositionResult {
  decryptedPnl: bigint;
}

/**
 * Close a position and decrypt the resulting PnL.
 */
export async function closePosition(
  provider: AnchorProvider,
  encryptedFields: number[][],
  publicKey: Uint8Array,
  nonce: Uint8Array,
  markPrice: number,
  sharedSecretHex: string
): Promise<ClosePositionResult> {
  const program = await getProgram(provider);
  const computationOffset = randomComputationOffset();

  const nonceU128 = new BN(deserializeLE(nonce).toString());
  const markPriceBN = new BN(markPrice);

  const eventPromise = new Promise<{ encryptedPnl: number[]; nonce: number[] }>((resolve) => {
    const listener = program.addEventListener('positionClosedEvent', (e: unknown) => {
      program.removeEventListener(listener);
      resolve(e as { encryptedPnl: number[]; nonce: number[] });
    });
  });

  const altAddress = await getAddressLookupTable(provider);
  const altAccount = await provider.connection.getAddressLookupTable(altAddress);
  const lookupTables = altAccount.value ? [altAccount.value] : [];

  await (program.methods as any)
    .closePosition(
      computationOffset,
      Array.from(encryptedFields[0]),
      Array.from(encryptedFields[1]),
      Array.from(encryptedFields[2]),
      Array.from(encryptedFields[3]),
      Array.from(encryptedFields[4]),
      Array.from(encryptedFields[5]),
      markPriceBN,
      Array.from(publicKey),
      nonceU128
    )
    .accountsPartial({
      ...getBaseAccounts(computationOffset),
      compDefAccount: compDefAccount('close_position'),
    })
    .transaction()
    .then(async (tx: anchor.web3.Transaction) => {
      const { blockhash } = await provider.connection.getLatestBlockhash('confirmed');
      const messageV0 = new anchor.web3.TransactionMessage({
        payerKey: provider.wallet.publicKey,
        recentBlockhash: blockhash,
        instructions: tx.instructions,
      }).compileToV0Message(lookupTables);
      const vtx = new anchor.web3.VersionedTransaction(messageV0);
      const signed = await provider.wallet.signTransaction(vtx);
      return provider.connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
    });

  await awaitComputationFinalization(provider, computationOffset, PROGRAM_ID, 'confirmed');

  const event = await eventPromise;

  const cipher = cipherFromSecret(sharedSecretHex);
  const decrypted = cipher.decrypt([Array.from(event.encryptedPnl)], new Uint8Array(event.nonce));
  const decryptedPnl = decrypted[0];

  return { decryptedPnl };
}
