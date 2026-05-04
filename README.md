# Private Perps

A privacy-preserving perpetuals trading protocol on Solana, powered by [Arcium](https://arcium.com) MPC/FHE.

Position data — size, direction, entry price, collateral, and owner — is **always encrypted on-chain**. The Arcium network handles all state transitions as a confidential co-processor: liquidation checks reveal only a boolean, and PnL is revealed only to the position owner at close.

## How it works

Arcium acts as an off-chain co-processor for encrypted state. Every confidential operation follows the same pattern:

1. The Solana program queues a computation with encrypted inputs
2. Arcium's MPC nodes execute the circuit over the ciphertext
3. The result is posted back via a callback instruction

Encrypted circuits live in `encrypted-ixs/src/lib.rs` (written in Arcis). The Anchor program in `programs/private_perps/src/lib.rs` handles the queue and callback instructions.

## Circuits

| Circuit | Input | Output |
|---|---|---|
| `open_position` | Encrypted `Position` | Re-encrypted `Position` (stored on-chain) |
| `compute_pnl` | Encrypted `Position` + mark price | Encrypted `i64` (only trader can decrypt) |
| `check_liquidation` | Encrypted `Position` + mark price | Public `bool` |
| `close_position` | Encrypted `Position` + mark price | Encrypted `i64` PnL (only trader can decrypt) |

The `Position` struct:
```rust
pub struct Position {
    size: u64,
    is_long: bool,
    entry_price: u64,
    collateral: u64,
    owner: u128,
    is_open: bool,
}
```

Liquidation triggers when `loss * 1.1 >= collateral` (10% maintenance margin).

## Project structure

```
programs/private_perps/src/lib.rs   # Anchor program (queue + callback instructions)
encrypted-ixs/src/lib.rs            # Arcis circuits (confidential computation logic)
tests/private_perps.ts              # Integration tests
```

## Running tests

```bash
export PATH="$HOME/bin:$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
arcium test
```

Expected output:
```
  private_perps
    ✔ inits all computation definitions
    ✔ opens a private position
    ✔ checks liquidation (should return false at entry price)
    ✔ closes position and reveals PnL

  4 passing
```

## Dependencies

- [Anchor](https://www.anchor-lang.com/) 0.32.1
- [Arcium](https://docs.arcium.com) SDK + CLI
- Solana 2.3.0
