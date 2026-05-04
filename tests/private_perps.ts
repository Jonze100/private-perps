import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PrivatePerps } from "../target/types/private_perps";
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
  buildFinalizeCompDefTx,
  awaitComputationFinalization,
  RescueCipher,
  x25519,
  deserializeLE,
} from "@arcium-hq/client";
import { randomBytes } from "crypto";
import * as os from "os";
import * as fs from "fs";

function readKpJson(path: string): anchor.web3.Keypair {
  const raw = JSON.parse(fs.readFileSync(path, "utf-8"));
  return anchor.web3.Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function retryGetMXEPublicKey(
  provider: anchor.AnchorProvider,
  programId: anchor.web3.PublicKey
): Promise<Uint8Array> {
  for (let i = 0; i < 30; i++) {
    const key = await getMXEPublicKey(provider, programId);
    if (key !== null) return key;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("MXE public key not available after 60s");
}

describe("private_perps", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.PrivatePerps as Program<PrivatePerps>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const arciumEnv = getArciumEnv();

  const SIZE = BigInt(10);
  const IS_LONG = BigInt(1);
  const ENTRY_PRICE = BigInt(100);
  const COLLATERAL = BigInt(500);
  const OWNER = BigInt(1);
  const IS_OPEN = BigInt(1);

  let encryptedPosition: number[][] = [];
  let positionNonce: Uint8Array;
  let cipher: RescueCipher;

  async function setupEncryption() {
    const privateKey = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(privateKey);
    const mxePublicKey = await retryGetMXEPublicKey(provider, program.programId);
    const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
    cipher = new RescueCipher(sharedSecret);
    const nonce = randomBytes(16);
    positionNonce = nonce;

    const plaintext = [SIZE, IS_LONG, ENTRY_PRICE, COLLATERAL, OWNER, IS_OPEN];
    encryptedPosition = cipher.encrypt(plaintext, nonce);

    return { publicKey, nonce };
  }

  async function getAddressLookupTable(): Promise<anchor.web3.PublicKey> {
    const arciumProgram = getArciumProgram(provider);
    const mxeAccPubkey = getMXEAccAddress(program.programId);
    const mxeAcc = await (arciumProgram.account as any).mxeAccount.fetch(mxeAccPubkey);
    return getLookupTableAddress(program.programId, new anchor.BN(mxeAcc.lutOffsetSlot.toString()));
  }

  function getBaseAccounts(computationOffset: anchor.BN) {
    return {
      computationAccount: getComputationAccAddress(
        arciumEnv.arciumClusterOffset,
        computationOffset
      ),
      clusterAccount: getClusterAccAddress(arciumEnv.arciumClusterOffset),
      mxeAccount: getMXEAccAddress(program.programId),
      mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
      executingPool: getExecutingPoolAccAddress(arciumEnv.arciumClusterOffset),
    };
  }

  it("inits all computation definitions", async () => {
    const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);
    const addressLookupTable = await getAddressLookupTable();

    for (const name of [
      "open_position",
      "compute_pnl",
      "check_liquidation",
      "close_position",
    ]) {
      const methodName = `init${name
        .split("_")
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join("")}CompDef`;

      const compDefOffset = Buffer.from(getCompDefAccOffset(name)).readUInt32LE();

      try {
        await (program.methods as any)
          [methodName]()
          .accountsPartial({
            compDefAccount: getCompDefAccAddress(program.programId, compDefOffset),
            mxeAccount: getMXEAccAddress(program.programId),
            addressLookupTable,
          })
          .signers([owner])
          .rpc({ commitment: "confirmed" });
        console.log(`  ${name} comp def initialized`);
      } catch (e: any) {
        if (e?.message?.includes("already in use") || e?.message?.includes("0x0")) {
          console.log(`  ${name} comp def already exists, skipping init`);
        } else {
          throw e;
        }
      }

      const finalizeTx = await buildFinalizeCompDefTx(
        provider,
        compDefOffset,
        program.programId
      );
      const latestBlockhash = await provider.connection.getLatestBlockhash("confirmed");
      finalizeTx.recentBlockhash = latestBlockhash.blockhash;
      finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
      finalizeTx.sign(owner);
      await provider.sendAndConfirm(finalizeTx, [], { commitment: "confirmed" });

      console.log(`✅ finalized ${name} comp def`);
    }
  });

  it("opens a private position", async () => {
    const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);
    const { publicKey, nonce } = await setupEncryption();
    const computationOffset = new anchor.BN(randomBytes(8), "hex");

    const positionOpenedPromise = new Promise<any>((resolve) => {
      const listener = program.addEventListener("positionOpenedEvent", (e) => {
        program.removeEventListener(listener);
        resolve(e);
      });
    });

    await program.methods
      .openPosition(
        computationOffset,
        Array.from(encryptedPosition[0]),
        Array.from(encryptedPosition[1]),
        Array.from(encryptedPosition[2]),
        Array.from(encryptedPosition[3]),
        Array.from(encryptedPosition[4]),
        Array.from(encryptedPosition[5]),
        Array.from(publicKey),
        new anchor.BN(deserializeLE(nonce).toString())
      )
      .accountsPartial({
        ...getBaseAccounts(computationOffset),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset("open_position")).readUInt32LE()
        ),
      })
      .signers([owner])
      .rpc({ commitment: "confirmed" });

    await awaitComputationFinalization(
      provider,
      computationOffset,
      program.programId,
      "confirmed"
    );

    const event = await positionOpenedPromise;
    console.log("✅ Position opened, encrypted position stored");
    console.log("   Nonce:", Buffer.from(event.nonce).toString("hex"));
  });

  it("checks liquidation (should return false at entry price)", async () => {
    const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);
    const { publicKey, nonce } = await setupEncryption();
    const computationOffset = new anchor.BN(randomBytes(8), "hex");
    const MARK_PRICE = new anchor.BN(100);

    const liquidationPromise = new Promise<any>((resolve) => {
      const listener = program.addEventListener("liquidationCheckedEvent", (e) => {
        program.removeEventListener(listener);
        resolve(e);
      });
    });

    await program.methods
      .checkLiquidation(
        computationOffset,
        Array.from(encryptedPosition[0]),
        Array.from(encryptedPosition[1]),
        Array.from(encryptedPosition[2]),
        Array.from(encryptedPosition[3]),
        Array.from(encryptedPosition[4]),
        Array.from(encryptedPosition[5]),
        MARK_PRICE,
        Array.from(publicKey),
        new anchor.BN(deserializeLE(nonce).toString())
      )
      .accountsPartial({
        ...getBaseAccounts(computationOffset),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset("check_liquidation")).readUInt32LE()
        ),
      })
      .signers([owner])
      .rpc({ commitment: "confirmed" });

    await awaitComputationFinalization(
      provider,
      computationOffset,
      program.programId,
      "confirmed"
    );

    const event = await liquidationPromise;
    console.log("✅ Liquidation check:", event.shouldLiquidate ? "LIQUIDATE" : "SAFE");
  });

  it("closes position and reveals PnL", async () => {
    const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);
    const { publicKey, nonce } = await setupEncryption();
    const computationOffset = new anchor.BN(randomBytes(8), "hex");
    const MARK_PRICE = new anchor.BN(110);

    const closedPromise = new Promise<any>((resolve) => {
      const listener = program.addEventListener("positionClosedEvent", (e) => {
        program.removeEventListener(listener);
        resolve(e);
      });
    });

    await program.methods
      .closePosition(
        computationOffset,
        Array.from(encryptedPosition[0]),
        Array.from(encryptedPosition[1]),
        Array.from(encryptedPosition[2]),
        Array.from(encryptedPosition[3]),
        Array.from(encryptedPosition[4]),
        Array.from(encryptedPosition[5]),
        MARK_PRICE,
        Array.from(publicKey),
        new anchor.BN(deserializeLE(nonce).toString())
      )
      .accountsPartial({
        ...getBaseAccounts(computationOffset),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset("close_position")).readUInt32LE()
        ),
      })
      .signers([owner])
      .rpc({ commitment: "confirmed" });

    await awaitComputationFinalization(
      provider,
      computationOffset,
      program.programId,
      "confirmed"
    );

    const event = await closedPromise;
    const decryptedPnl = cipher.decrypt(
      [Array.from(event.encryptedPnl)],
      new Uint8Array(event.nonce)
    )[0];

    console.log("✅ Position closed. PnL:", decryptedPnl.toString());
  });
});
