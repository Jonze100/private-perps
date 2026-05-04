use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

const COMP_DEF_OFFSET_OPEN_POSITION: u32 = comp_def_offset("open_position");
const COMP_DEF_OFFSET_COMPUTE_PNL: u32 = comp_def_offset("compute_pnl");
const COMP_DEF_OFFSET_CHECK_LIQUIDATION: u32 = comp_def_offset("check_liquidation");
const COMP_DEF_OFFSET_CLOSE_POSITION: u32 = comp_def_offset("close_position");

declare_id!("C4vJTBnKr3A5gc3aP8BZXb3H6csCGrTaeiZHbSChAh9M");

#[arcium_program]
pub mod private_perps {
    use super::*;

    // ─── Init comp defs (call once after deploy) ───────────────────────────────

    pub fn init_open_position_comp_def(ctx: Context<InitOpenPositionCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    pub fn init_compute_pnl_comp_def(ctx: Context<InitComputePnlCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    pub fn init_check_liquidation_comp_def(
        ctx: Context<InitCheckLiquidationCompDef>,
    ) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    pub fn init_close_position_comp_def(ctx: Context<InitClosePositionCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    // ─── Open Position ─────────────────────────────────────────────────────────
    // Position fields are encrypted individually (one [u8;32] ciphertext per field).

    pub fn open_position(
        ctx: Context<OpenPosition>,
        computation_offset: u64,
        enc_size: [u8; 32],
        enc_is_long: [u8; 32],
        enc_entry_price: [u8; 32],
        enc_collateral: [u8; 32],
        enc_owner: [u8; 32],
        enc_is_open: [u8; 32],
        pub_key: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        let args = ArgBuilder::new()
            .x25519_pubkey(pub_key)
            .plaintext_u128(nonce)
            .encrypted_u64(enc_size)
            .encrypted_bool(enc_is_long)
            .encrypted_u64(enc_entry_price)
            .encrypted_u64(enc_collateral)
            .encrypted_u128(enc_owner)
            .encrypted_bool(enc_is_open)
            .build();

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![OpenPositionCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[],
            )?],
            1,
            0,
        )?;
        Ok(())
    }

    #[arcium_callback(encrypted_ix = "open_position")]
    pub fn open_position_callback(
        ctx: Context<OpenPositionCallback>,
        output: SignedComputationOutputs<OpenPositionOutput>,
    ) -> Result<()> {
        match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(OpenPositionOutput { field_0 }) => {
                emit!(PositionOpenedEvent {
                    enc_size: field_0.ciphertexts[0],
                    enc_is_long: field_0.ciphertexts[1],
                    enc_entry_price: field_0.ciphertexts[2],
                    enc_collateral: field_0.ciphertexts[3],
                    enc_owner: field_0.ciphertexts[4],
                    enc_is_open: field_0.ciphertexts[5],
                    nonce: field_0.nonce.to_le_bytes(),
                });
            }
            Err(e) => {
                msg!("Error: {}", e);
                return Err(ErrorCode::AbortedComputation.into());
            }
        }
        Ok(())
    }

    // ─── Compute PnL ───────────────────────────────────────────────────────────

    pub fn compute_pnl(
        ctx: Context<ComputePnl>,
        computation_offset: u64,
        enc_size: [u8; 32],
        enc_is_long: [u8; 32],
        enc_entry_price: [u8; 32],
        enc_collateral: [u8; 32],
        enc_owner: [u8; 32],
        enc_is_open: [u8; 32],
        mark_price: u64,
        pub_key: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        let args = ArgBuilder::new()
            .x25519_pubkey(pub_key)
            .plaintext_u128(nonce)
            .encrypted_u64(enc_size)
            .encrypted_bool(enc_is_long)
            .encrypted_u64(enc_entry_price)
            .encrypted_u64(enc_collateral)
            .encrypted_u128(enc_owner)
            .encrypted_bool(enc_is_open)
            .plaintext_u64(mark_price)
            .build();

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![ComputePnlCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[],
            )?],
            1,
            0,
        )?;
        Ok(())
    }

    #[arcium_callback(encrypted_ix = "compute_pnl")]
    pub fn compute_pnl_callback(
        ctx: Context<ComputePnlCallback>,
        output: SignedComputationOutputs<ComputePnlOutput>,
    ) -> Result<()> {
        match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(ComputePnlOutput { field_0 }) => {
                emit!(PnlComputedEvent {
                    encrypted_pnl: field_0.ciphertexts[0],
                    nonce: field_0.nonce.to_le_bytes(),
                });
            }
            Err(e) => {
                msg!("Error: {}", e);
                return Err(ErrorCode::AbortedComputation.into());
            }
        }
        Ok(())
    }

    // ─── Check Liquidation ─────────────────────────────────────────────────────

    pub fn check_liquidation(
        ctx: Context<CheckLiquidation>,
        computation_offset: u64,
        enc_size: [u8; 32],
        enc_is_long: [u8; 32],
        enc_entry_price: [u8; 32],
        enc_collateral: [u8; 32],
        enc_owner: [u8; 32],
        enc_is_open: [u8; 32],
        mark_price: u64,
        pub_key: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        let args = ArgBuilder::new()
            .x25519_pubkey(pub_key)
            .plaintext_u128(nonce)
            .encrypted_u64(enc_size)
            .encrypted_bool(enc_is_long)
            .encrypted_u64(enc_entry_price)
            .encrypted_u64(enc_collateral)
            .encrypted_u128(enc_owner)
            .encrypted_bool(enc_is_open)
            .plaintext_u64(mark_price)
            .build();

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![CheckLiquidationCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[],
            )?],
            1,
            0,
        )?;
        Ok(())
    }

    #[arcium_callback(encrypted_ix = "check_liquidation")]
    pub fn check_liquidation_callback(
        ctx: Context<CheckLiquidationCallback>,
        output: SignedComputationOutputs<CheckLiquidationOutput>,
    ) -> Result<()> {
        match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(CheckLiquidationOutput { field_0 }) => {
                emit!(LiquidationCheckedEvent {
                    should_liquidate: field_0,
                });
            }
            Err(e) => {
                msg!("Error: {}", e);
                return Err(ErrorCode::AbortedComputation.into());
            }
        }
        Ok(())
    }

    // ─── Close Position ────────────────────────────────────────────────────────

    pub fn close_position(
        ctx: Context<ClosePosition>,
        computation_offset: u64,
        enc_size: [u8; 32],
        enc_is_long: [u8; 32],
        enc_entry_price: [u8; 32],
        enc_collateral: [u8; 32],
        enc_owner: [u8; 32],
        enc_is_open: [u8; 32],
        mark_price: u64,
        pub_key: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        let args = ArgBuilder::new()
            .x25519_pubkey(pub_key)
            .plaintext_u128(nonce)
            .encrypted_u64(enc_size)
            .encrypted_bool(enc_is_long)
            .encrypted_u64(enc_entry_price)
            .encrypted_u64(enc_collateral)
            .encrypted_u128(enc_owner)
            .encrypted_bool(enc_is_open)
            .plaintext_u64(mark_price)
            .build();

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![ClosePositionCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[],
            )?],
            1,
            0,
        )?;
        Ok(())
    }

    #[arcium_callback(encrypted_ix = "close_position")]
    pub fn close_position_callback(
        ctx: Context<ClosePositionCallback>,
        output: SignedComputationOutputs<ClosePositionOutput>,
    ) -> Result<()> {
        match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(ClosePositionOutput { field_0 }) => {
                emit!(PositionClosedEvent {
                    encrypted_pnl: field_0.ciphertexts[0],
                    nonce: field_0.nonce.to_le_bytes(),
                });
            }
            Err(e) => {
                msg!("Error: {}", e);
                return Err(ErrorCode::AbortedComputation.into());
            }
        }
        Ok(())
    }
}

// ─── Account Structs: Open Position ───────────────────────────────────────────

#[queue_computation_accounts("open_position", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(
        mut,
        address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_OPEN_POSITION))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    pub cluster_account: Account<'info, Cluster>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("open_position")]
#[derive(Accounts)]
pub struct OpenPositionCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_OPEN_POSITION))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account, checked by arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint.
    pub instructions_sysvar: AccountInfo<'info>,
}

#[init_computation_definition_accounts("open_position", payer)]
#[derive(Accounts)]
pub struct InitOpenPositionCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

// ─── Account Structs: Compute PnL ─────────────────────────────────────────────

#[queue_computation_accounts("compute_pnl", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct ComputePnl<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(
        mut,
        address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMPUTE_PNL))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    pub cluster_account: Account<'info, Cluster>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("compute_pnl")]
#[derive(Accounts)]
pub struct ComputePnlCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMPUTE_PNL))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account, checked by arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint.
    pub instructions_sysvar: AccountInfo<'info>,
}

#[init_computation_definition_accounts("compute_pnl", payer)]
#[derive(Accounts)]
pub struct InitComputePnlCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

// ─── Account Structs: Check Liquidation ───────────────────────────────────────

#[queue_computation_accounts("check_liquidation", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct CheckLiquidation<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(
        mut,
        address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CHECK_LIQUIDATION))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    pub cluster_account: Account<'info, Cluster>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("check_liquidation")]
#[derive(Accounts)]
pub struct CheckLiquidationCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CHECK_LIQUIDATION))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account, checked by arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint.
    pub instructions_sysvar: AccountInfo<'info>,
}

#[init_computation_definition_accounts("check_liquidation", payer)]
#[derive(Accounts)]
pub struct InitCheckLiquidationCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

// ─── Account Structs: Close Position ──────────────────────────────────────────

#[queue_computation_accounts("close_position", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct ClosePosition<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(
        mut,
        address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CLOSE_POSITION))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    pub cluster_account: Account<'info, Cluster>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("close_position")]
#[derive(Accounts)]
pub struct ClosePositionCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CLOSE_POSITION))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account, checked by arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint.
    pub instructions_sysvar: AccountInfo<'info>,
}

#[init_computation_definition_accounts("close_position", payer)]
#[derive(Accounts)]
pub struct InitClosePositionCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

// ─── Events ────────────────────────────────────────────────────────────────────

#[event]
pub struct PositionOpenedEvent {
    pub enc_size: [u8; 32],
    pub enc_is_long: [u8; 32],
    pub enc_entry_price: [u8; 32],
    pub enc_collateral: [u8; 32],
    pub enc_owner: [u8; 32],
    pub enc_is_open: [u8; 32],
    pub nonce: [u8; 16],
}

#[event]
pub struct PnlComputedEvent {
    pub encrypted_pnl: [u8; 32],
    pub nonce: [u8; 16],
}

#[event]
pub struct LiquidationCheckedEvent {
    pub should_liquidate: bool,
}

#[event]
pub struct PositionClosedEvent {
    pub encrypted_pnl: [u8; 32],
    pub nonce: [u8; 16],
}

// ─── Error codes ───────────────────────────────────────────────────────────────

#[error_code]
pub enum ErrorCode {
    #[msg("Computation was aborted")]
    AbortedComputation,
    #[msg("Cluster not set on MXE account")]
    ClusterNotSet,
}
