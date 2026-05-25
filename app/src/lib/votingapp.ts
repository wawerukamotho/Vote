"use client";

import * as anchor from "@coral-xyz/anchor";
import { Idl, Program } from "@coral-xyz/anchor";
import { Wallet } from "@coral-xyz/anchor/dist/cjs/provider";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import idl from "../../../target/idl/votingapp.json";

export const PROGRAM_ID = new PublicKey(
  "EfMBRyBhRQSbx5buug3gMYuoMFBtoieHpE2iY1iwhLmP",
);

export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);

export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

export const SYSTEM_PROGRAM_ID = SystemProgram.programId;

export type PollAccount = {
  pollId: anchor.BN;
  authority: PublicKey;
  pollName: string;
  description: string;
  metadataUri: string;
  pollStartTime: anchor.BN;
  pollEndTime: anchor.BN;
  pollOptionIndex: anchor.BN;
  requiredTokenMint: PublicKey | null;
  isActive: boolean;
};

export type CandidateAccount = {
  candidateName: string;
  candidateVotes: anchor.BN;
};

type VotingProgram = Program<Idl> & {
  account: {
    pollAccount: {
      fetch(address: PublicKey): Promise<unknown>;
    };
    candidateAccount: {
      fetch(address: PublicKey): Promise<unknown>;
    };
  };
  methods: Record<string, (...args: unknown[]) => unknown>;
};

export function useVotingProgram() {
  const { connection } = useConnection();
  const wallet = useWallet();

  if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) {
    return { program: null, wallet, provider: null };
  }

  const provider = new anchor.AnchorProvider(
    connection,
    wallet as Wallet,
    anchor.AnchorProvider.defaultOptions(),
  );

  return {
    program: new Program(idl as Idl, provider) as VotingProgram,
    wallet,
    provider,
  };
}

export function bn(value: string | number | bigint) {
  return new anchor.BN(value.toString());
}

export function toUnixSeconds(value: string) {
  return Math.floor(new Date(value).getTime() / 1000);
}

export function formatAddress(value: PublicKey | string, size = 4) {
  const text = value.toString();
  return `${text.slice(0, size)}...${text.slice(-size)}`;
}

export function formatUnixTime(value: anchor.BN) {
  return new Date(value.toNumber() * 1000).toLocaleString();
}

export function pollPda(pollId: string | number | bigint) {
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("poll"), u64LeBytes(pollId)],
    PROGRAM_ID,
  )[0];
}

export function treasuryPda() {
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("treasury")],
    PROGRAM_ID,
  )[0];
}

export function candidatePda(pollId: string | number | bigint, candidate: string) {
  return PublicKey.findProgramAddressSync(
    [
      new TextEncoder().encode("candidate"),
      u64LeBytes(pollId),
      new TextEncoder().encode(candidate),
    ],
    PROGRAM_ID,
  )[0];
}

export function voteReceiptPda(
  pollId: string | number | bigint,
  voter: PublicKey,
) {
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("vote"), u64LeBytes(pollId), voter.toBuffer()],
    PROGRAM_ID,
  )[0];
}

export function associatedTokenPda(owner: PublicKey, mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

export function knownCandidatesKey(pollId: string) {
  return `votingapp:candidates:${pollId}`;
}

export function loadKnownCandidates(pollId: string) {
  if (typeof window === "undefined" || !pollId) return [];

  try {
    const raw = window.localStorage.getItem(knownCandidatesKey(pollId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function saveKnownCandidate(pollId: string, candidate: string) {
  const trimmed = candidate.trim();
  if (typeof window === "undefined" || !pollId || !trimmed) return;

  const existing = loadKnownCandidates(pollId);
  const next = Array.from(new Set([...existing, trimmed]));
  window.localStorage.setItem(knownCandidatesKey(pollId), JSON.stringify(next));
}

function u64LeBytes(value: string | number | bigint) {
  let source = BigInt(value);
  const bytes = new Uint8Array(8);

  for (let index = 0; index < 8; index += 1) {
    bytes[index] = Number(source & BigInt(255));
    source /= BigInt(256);
  }

  return bytes;
}
