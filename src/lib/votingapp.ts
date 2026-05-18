import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "BGKwvkV3e9DEr38NxKXtd1UTuHoGPwrF6yMDSoDRSGvc",
);

export const DEVNET_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);

export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

export const SYSTEM_PROGRAM_ID = SystemProgram.programId;

const textEncoder = new TextEncoder();

function u64Seed(value: string | number | bigint) {
  const data = new ArrayBuffer(8);
  const view = new DataView(data);
  view.setBigUint64(0, BigInt(value), true);
  return new Uint8Array(data);
}

export function treasuryPda() {
  return PublicKey.findProgramAddressSync([textEncoder.encode("treasury")], PROGRAM_ID)[0];
}

export function pollPda(pollId: string | number | bigint) {
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("poll"), u64Seed(pollId)],
    PROGRAM_ID,
  )[0];
}

export function candidatePda(pollId: string | number | bigint, candidate: string) {
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("candidate"), u64Seed(pollId), textEncoder.encode(candidate)],
    PROGRAM_ID,
  )[0];
}

export function voteReceiptPda(pollId: string | number | bigint, voter: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("vote"), u64Seed(pollId), voter.toBytes()],
    PROGRAM_ID,
  )[0];
}

export function associatedTokenAddress(owner: PublicKey, mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [owner.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mint.toBytes()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

export const VOTINGAPP_IDL = {
  address: PROGRAM_ID.toBase58(),
  metadata: {
    name: "votingapp",
    version: "0.1.0",
    spec: "0.1.0",
    description: "Anchor voting app",
  },
  instructions: [
    {
      name: "initializeTreasury",
      discriminator: [61, 26, 198, 87, 218, 105, 87, 36],
      accounts: [
        { name: "signer", writable: true, signer: true },
        { name: "treasury", writable: true, pda: { seeds: [{ kind: "const", value: [116, 114, 101, 97, 115, 117, 114, 121] }] } },
        { name: "systemProgram", address: "11111111111111111111111111111111" },
      ],
      args: [],
    },
    {
      name: "initPoll",
      discriminator: [125, 33, 167, 77, 242, 214, 203, 107],
      accounts: [
        { name: "signer", writable: true, signer: true },
        { name: "pollAccount", writable: true, pda: { seeds: [{ kind: "const", value: [112, 111, 108, 108] }, { kind: "arg", path: "pollId" }] } },
        { name: "treasury", writable: true, pda: { seeds: [{ kind: "const", value: [116, 114, 101, 97, 115, 117, 114, 121] }] } },
        { name: "systemProgram", address: "11111111111111111111111111111111" },
      ],
      args: [
        { name: "pollId", type: "u64" },
        { name: "start", type: "u64" },
        { name: "end", type: "u64" },
        { name: "name", type: "string" },
        { name: "description", type: "string" },
        { name: "metadataUri", type: "string" },
        { name: "requiredTokenMint", type: { option: "pubkey" } },
      ],
    },
    {
      name: "initializeCandidate",
      discriminator: [210, 107, 118, 204, 255, 97, 112, 26],
      accounts: [
        { name: "signer", writable: true, signer: true },
        { name: "pollAccount", writable: true, pda: { seeds: [{ kind: "const", value: [112, 111, 108, 108] }, { kind: "arg", path: "pollId" }] } },
        { name: "candidateAccount", writable: true, pda: { seeds: [{ kind: "const", value: [99, 97, 110, 100, 105, 100, 97, 116, 101] }, { kind: "arg", path: "pollId" }, { kind: "arg", path: "candidate" }] } },
        { name: "systemProgram", address: "11111111111111111111111111111111" },
      ],
      args: [
        { name: "pollId", type: "u64" },
        { name: "candidate", type: "string" },
      ],
    },
    {
      name: "vote",
      discriminator: [227, 110, 155, 23, 136, 126, 172, 25],
      accounts: [
        { name: "signer", writable: true, signer: true },
        { name: "pollAccount", writable: true, pda: { seeds: [{ kind: "const", value: [112, 111, 108, 108] }, { kind: "arg", path: "pollId" }] } },
        { name: "candidateAccount", writable: true, pda: { seeds: [{ kind: "const", value: [99, 97, 110, 100, 105, 100, 97, 116, 101] }, { kind: "arg", path: "pollId" }, { kind: "arg", path: "candidate" }] } },
        { name: "voteReceipt", writable: true, pda: { seeds: [{ kind: "const", value: [118, 111, 116, 101] }, { kind: "arg", path: "pollId" }, { kind: "account", path: "signer" }] } },
        { name: "systemProgram", address: "11111111111111111111111111111111" },
      ],
      args: [
        { name: "pollId", type: "u64" },
        { name: "candidate", type: "string" },
      ],
    },
    {
      name: "voteTokenGated",
      discriminator: [156, 102, 250, 90, 211, 139, 123, 57],
      accounts: [
        { name: "signer", writable: true, signer: true },
        { name: "pollAccount", writable: true, pda: { seeds: [{ kind: "const", value: [112, 111, 108, 108] }, { kind: "arg", path: "pollId" }] } },
        { name: "candidateAccount", writable: true, pda: { seeds: [{ kind: "const", value: [99, 97, 110, 100, 105, 100, 97, 116, 101] }, { kind: "arg", path: "pollId" }, { kind: "arg", path: "candidate" }] } },
        { name: "voteReceipt", writable: true, pda: { seeds: [{ kind: "const", value: [118, 111, 116, 101] }, { kind: "arg", path: "pollId" }, { kind: "account", path: "signer" }] } },
        { name: "voterTokenAccount" },
        { name: "tokenProgram", address: TOKEN_PROGRAM_ID.toBase58() },
        { name: "systemProgram", address: "11111111111111111111111111111111" },
      ],
      args: [
        { name: "pollId", type: "u64" },
        { name: "candidate", type: "string" },
        { name: "useQuadratic", type: "bool" },
      ],
    },
    {
      name: "closePoll",
      discriminator: [139, 78, 255, 244, 49, 119, 131, 237],
      accounts: [
        { name: "signer", writable: true, signer: true },
        { name: "pollAccount", writable: true, pda: { seeds: [{ kind: "const", value: [112, 111, 108, 108] }, { kind: "arg", path: "pollId" }] } },
      ],
      args: [{ name: "pollId", type: "u64" }],
    },
    {
      name: "withdrawTreasury",
      discriminator: [40, 15, 228, 199, 87, 29, 96, 20],
      accounts: [
        { name: "signer", writable: true, signer: true },
        { name: "treasury", writable: true, pda: { seeds: [{ kind: "const", value: [116, 114, 101, 97, 115, 117, 114, 121] }] } },
        { name: "destination", writable: true },
      ],
      args: [{ name: "amount", type: "u64" }],
    },
  ],
  accounts: [
    { name: "treasuryAccount", discriminator: [173, 222, 7, 133, 175, 109, 31, 13] },
    { name: "pollAccount", discriminator: [109, 81, 78, 117, 125, 155, 56, 200] },
    { name: "candidateAccount", discriminator: [69, 203, 73, 43, 203, 170, 96, 121] },
    { name: "voteReceipt", discriminator: [224, 64, 154, 36, 39, 145, 209, 142] },
  ],
  types: [
    {
      name: "treasuryAccount",
      type: {
        kind: "struct",
        fields: [
          { name: "authority", type: "pubkey" },
          { name: "totalCollected", type: "u64" },
        ],
      },
    },
    {
      name: "pollAccount",
      type: {
        kind: "struct",
        fields: [
          { name: "pollId", type: "u64" },
          { name: "authority", type: "pubkey" },
          { name: "pollName", type: "string" },
          { name: "description", type: "string" },
          { name: "metadataUri", type: "string" },
          { name: "pollStartTime", type: "u64" },
          { name: "pollEndTime", type: "u64" },
          { name: "pollOptionIndex", type: "u64" },
          { name: "requiredTokenMint", type: { option: "pubkey" } },
          { name: "isActive", type: "bool" },
        ],
      },
    },
    {
      name: "candidateAccount",
      type: {
        kind: "struct",
        fields: [
          { name: "candidateName", type: "string" },
          { name: "candidateVotes", type: "u64" },
        ],
      },
    },
    {
      name: "voteReceipt",
      type: {
        kind: "struct",
        fields: [
          { name: "voter", type: "pubkey" },
          { name: "pollId", type: "u64" },
          { name: "candidate", type: "string" },
          { name: "timestamp", type: "i64" },
          { name: "voteWeight", type: "u64" },
        ],
      },
    },
  ],
  events: [
    { name: "TreasuryInitialized", discriminator: [165, 146, 196, 211, 82, 88, 85, 146] },
    { name: "PollCreated", discriminator: [182, 52, 35, 133, 14, 30, 69, 140] },
    { name: "CandidateAdded", discriminator: [220, 135, 203, 32, 166, 136, 96, 59] },
    { name: "VoteCast", discriminator: [177, 57, 181, 113, 228, 68, 194, 155] },
    { name: "PollClosed", discriminator: [42, 45, 76, 41, 135, 117, 239, 190] },
  ],
  errors: [
    { code: 6000, name: "VotingNotStarted", msg: "Poll has not started yet." },
    { code: 6001, name: "VotingEnded", msg: "Poll has already ended." },
    { code: 6002, name: "Unauthorized", msg: "Unauthorized: you are not the poll authority." },
    { code: 6003, name: "TooManyCandidates", msg: "Candidate limit reached (max 20)." },
    { code: 6004, name: "NameTooLong", msg: "Name exceeds maximum length." },
    { code: 6005, name: "DescriptionTooLong", msg: "Description exceeds maximum length." },
    { code: 6006, name: "InvalidPollTimes", msg: "Poll start time must be before end time." },
    { code: 6007, name: "Overflow", msg: "Arithmetic overflow." },
    { code: 6008, name: "PollClosed", msg: "This poll is closed." },
    { code: 6009, name: "TokenGatingRequired", msg: "This poll requires token-gated voting; use vote_token_gated." },
    { code: 6010, name: "NoTokenGating", msg: "This poll has no token requirement; use the standard vote instruction." },
    { code: 6011, name: "WrongTokenMint", msg: "Token account mint does not match the poll's required mint." },
    { code: 6012, name: "InsufficientTokenBalance", msg: "Insufficient token balance to vote." },
  ],
} as anchor.Idl;
