use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

declare_id!("BGKwvkV3e9DEr38NxKXtd1UTuHoGPwrF6yMDSoDRSGvc");
// Constants
pub const MAX_CANDIDATES: u8 = 30;
pub const POLL_FEE_LAMPORTS: u64 = 1_000_000; // 0.001 SOL

#[program]
pub mod votingapp {
    use super::*;

    // PDA protocol treasury initilization
    pub fn initialize_treasury(ctx: Context<InitTreasury>) -> Result<()> {
        let treasury = &mut ctx.accounts.treasury;
        treasury.authority = ctx.accounts.signer.key();
        treasury.total_collected = 0;
        emit!(TreasuryInitialized {
            authority: treasury.authority,
        });
        Ok(())
    }

    pub fn init_poll(
        ctx: Context<InitPoll>,
        poll_id: u64,
        start: u64,
        end: u64,
        name: String,
        description: String,
        metadata_uri: String, // for offchain IPFS
        required_token_limit: Option<Pubkey>, 
    ) -> Result<()> {
        
        require!(start < end, ErrorCode::InvalidPollTimes);
        require!(name.len() <=32, ErrorCode::NameTooLong);
        require!(description.len() <= 280, ErrorCode::DescriptionTooLong);

        let cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.signer.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
            },
        );

        anchor_lang::system_program::transfer(cpi_ctx, POLL_FEE_LAMPORTS)?;
        ctx.accounts.treasury.total_collected = ctx
            .accounts
            .treasury
            .total_collected
            .checked_add(POLL_FEE_LAMPORTS)
            .ok_or(ErrorCode::Overflow)?;
 
        // ── State ───────────────────────────────────────────────────────────
        let poll = &mut ctx.accounts.poll_account;
        poll.poll_id = poll_id;
        poll.authority = ctx.accounts.signer.key();
        poll.poll_name = name.clone();
        poll.description = description;
        poll.metadata_uri = metadata_uri;
        poll.poll_start_time = start;
        poll.poll_end_time = end;
        poll.poll_option_index = 0;
        poll.required_token_mint = required_token_mint;
        poll.is_active = true;
 
        emit!(PollCreated {
            poll_id,
            authority: poll.authority,
            name,
            start,
            end,
        });
        Ok(())
    }

    // initialize candidate only poll authority
    pub fn initialize_candidate(
        ctx: Context<InitCandidate>,
        _poll_id: u64,
        candidate: String,
    ) -> Result<()> {
        let poll = &mut ctx.accounts.poll_account;
 
        // Role check
        require!(
            ctx.accounts.signer.key() == poll.authority,
            ErrorCode::Unauthorized
        );
        // Cap
        require!(
            poll.poll_option_index < MAX_CANDIDATES as u64,
            ErrorCode::TooManyCandidates
        );
        // Name length
        require!(candidate.len() <= 32, ErrorCode::NameTooLong);
 
        let candidate_account = &mut ctx.accounts.candidate_account;
        candidate_account.candidate_name = candidate.clone();
        candidate_account.candidate_votes = 0;
        poll.poll_option_index = poll
            .poll_option_index
            .checked_add(1)
            .ok_or(ErrorCode::Overflow)?;
 
        emit!(CandidateAdded {
            poll_id: poll.poll_id,
            candidate_name: candidate,
        });
        Ok(())
    }

    pub fn vote(ctx: Context<CastVote>, poll_id: u64, _candidate: String) -> Result<()> {
        let clock = Clock::get()?;
        let now = clock.unix_timestamp;
        let poll = &ctx.accounts.poll_account;

        require!(poll.is_active, ErrorCode::PollClosed);
        require!(now >= poll.poll_start_time as i64, ErrorCode::VotingNotStarted);
        require!(now <= poll.poll_end_time as i64, ErrorCode::VotingEnded);
        // No token gate on this instruction
        require!(
            poll.required_token_mint.is_none(),
            ErrorCode::TokenGatingRequired
        );

        // receipt to prevent double voting
        let receipt = &mut ctx.accounts.vote_receipt;
        receipt.voter = ctx.accounts.signer.key();
        receipt.poll_id = poll_id;
        receipt.candidate = ctx.accounts.candidate_accounts.candidate_name.clone();
        receipt.timestamp = now;
        receipt.vote_weight = 1; // standard 1 vote per wallet

        let candidate = &mut ctx.accounts.candidate_account;
        candidate.candidate_votes = candidate
            .candidate_votes
            .checked_add(1)
            .ok_or(ErrorCode::Overflow)?;
 
        emit!(VoteCast {
            voter: receipt.voter,
            poll_id,
            candidate: receipt.candidate.clone(),
            weight: 1,
            timestamp: now,
        });
        Ok(())


    }
    // token gate implementation
    //>0 of required spl token and weight of vote = token amount approx sqrt

    pub fn vote_token_gated(ctx: Context<CastVoteTokenGated>, poll_id: u64, _candidate: String, use_quadratic: bool,) -> Result<()> {
        let clock = Clock::get()?;
        let now = clock.unix_timestamp;
        let poll = &ctx.accounts.poll_account;
        require!(poll.is_active, ErrorCode::PollClosed);
        require!(now >= poll.poll_start_time as i64, ErrorCode::VotingNotStarted);
        require!(now <= poll.poll_end_time as i64, ErrorCode::VotingEnded);
 
        // Confirm the poll actually requires tokens
        let required_mint = poll.required_token_mint.ok_or(ErrorCode::NoTokenGating)?;
        require!(
            ctx.accounts.voter_token_account.mint == required_mint,
            ErrorCode::WrongTokenMint
        );
        let balance = ctx.accounts.voter_token_account.amount;
        require!(balance > 0, ErrorCode::InsufficientTokenBalance);
 
        // Weight calculation
        let weight: u64 = if use_quadratic {
            integer_sqrt(balance).max(1)
        } else {
            balance
        };
 
        // VoteReceipt – same PDA seeds → double-vote impossible
        let receipt = &mut ctx.accounts.vote_receipt;
        receipt.voter = ctx.accounts.signer.key();
        receipt.poll_id = poll_id;
        receipt.candidate = ctx.accounts.candidate_account.candidate_name.clone();
        receipt.timestamp = now;
        receipt.vote_weight = weight;
 
        let candidate = &mut ctx.accounts.candidate_account;
        candidate.candidate_votes = candidate
            .candidate_votes
            .checked_add(weight)
            .ok_or(ErrorCode::Overflow)?;
 
        emit!(VoteCast {
            voter: receipt.voter,
            poll_id,
            candidate: receipt.candidate.clone(),
            weight,
            timestamp: now,
        });
        
        Ok(())
   }
   // closing poll by authority, sets is_active to false, no more votes accepted
    pub fn close_poll(ctx: Context<ClosePoll>, poll_id: u64) -> Result <()> {
        require!(
            ctx.accounts.signer.key() == ctx.accounts.poll_account.authority,
            ErrorCode::Unauthorized
        );
        ctx.accounts.poll_account.is_active = false;
        emit!(PollClosed {
            poll_id: ctx.accounts.poll_account.poll_id,
            authority: ctx.accounts.signer.key(),
        });
        Ok(())
    }

    // withdraw from treasury by authority, in case of wanting to collect fees or migrate protocol
    

}
    
#[error_code]
pub enum ErrorCode {
    #[msg("Poll has not started yet.")]
    VotingNotStarted,
    #[msg("Poll has already ended.")]
    VotingEnded,
    #[msg("Unauthorized: you are not the poll authority.")]
    Unauthorized,
    #[msg("Candidate limit reached (max 20).")]
    TooManyCandidates,
    #[msg("Name exceeds maximum length.")]
    NameTooLong,
    #[msg("Description exceeds maximum length.")]
    DescriptionTooLong,
    #[msg("Poll start time must be before end time.")]
    InvalidPollTimes,
    #[msg("Arithmetic overflow.")]
    Overflow,
    #[msg("This poll is closed.")]
    PollClosed,
    #[msg("This poll requires token-gated voting; use vote_token_gated.")]
    TokenGatingRequired,
    #[msg("This poll has no token requirement; use the standard vote instruction.")]
    NoTokenGating,
    #[msg("Token account mint does not match the poll's required mint.")]
    WrongTokenMint,
    #[msg("Insufficient token balance to vote.")]
    InsufficientTokenBalance,
}
    