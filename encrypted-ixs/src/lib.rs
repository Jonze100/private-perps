use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    #[derive(Copy, Clone)]
    pub struct Position {
        size: u64,
        is_long: bool,
        entry_price: u64,
        collateral: u64,
        owner: u128,
        is_open: bool,
    }

    // Circuit 1: Open a new position (re-encrypts under same shared key)
    #[instruction]
    pub fn open_position(pos_ctxt: Enc<Shared, Position>) -> Enc<Shared, Position> {
        let pos = pos_ctxt.to_arcis();
        pos_ctxt.owner.from_arcis(pos)
    }

    // Circuit 2: Compute PnL (returns encrypted i64 only trader can decrypt)
    #[instruction]
    pub fn compute_pnl(
        pos_ctxt: Enc<Shared, Position>,
        mark_price: u64,
    ) -> Enc<Shared, i64> {
        let pos = pos_ctxt.to_arcis();
        let price_diff = mark_price as i64 - pos.entry_price as i64;
        let pnl = if pos.is_long {
            price_diff * pos.size as i64
        } else {
            -price_diff * pos.size as i64
        };
        pos_ctxt.owner.from_arcis(pnl)
    }

    // Circuit 3: Check liquidation (reveals only true/false, no position data)
    #[instruction]
    pub fn check_liquidation(
        pos_ctxt: Enc<Shared, Position>,
        mark_price: u64,
    ) -> bool {
        let pos = pos_ctxt.to_arcis();
        let price_diff = mark_price as i64 - pos.entry_price as i64;
        let loss = if pos.is_long {
            if price_diff < 0 { (-price_diff) as u64 * pos.size } else { 0 }
        } else {
            if price_diff > 0 { price_diff as u64 * pos.size } else { 0 }
        };
        let should_liquidate = loss * 110 / 100 >= pos.collateral;
        should_liquidate.reveal()
    }

    // Circuit 4: Close position (reveals final PnL to trader)
    #[instruction]
    pub fn close_position(
        pos_ctxt: Enc<Shared, Position>,
        mark_price: u64,
    ) -> Enc<Shared, i64> {
        let pos = pos_ctxt.to_arcis();
        let price_diff = mark_price as i64 - pos.entry_price as i64;
        let pnl = if pos.is_long {
            price_diff * pos.size as i64
        } else {
            -price_diff * pos.size as i64
        };
        pos_ctxt.owner.from_arcis(pnl)
    }
}
