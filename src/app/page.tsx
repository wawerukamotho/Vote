"use client";

import * as anchor from "@coral-xyz/anchor";
import type { Idl } from "@coral-xyz/anchor";
import BN from "bn.js";
import { useMemo, useState } from "react";
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  associatedTokenAddress,
  candidatePda,
  DEVNET_RPC_URL,
  pollPda,
  PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  treasuryPda,
  voteReceiptPda,
  VOTINGAPP_IDL,
} from "@/lib/votingapp";

type SolanaProvider = {
  isPhantom?: boolean;
  publicKey?: PublicKey;
  connect: () => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  signTransaction: <T extends Transaction | VersionedTransaction>(transaction: T) => Promise<T>;
  signAllTransactions: <T extends Transaction | VersionedTransaction>(transactions: T[]) => Promise<T[]>;
};

declare global {
  interface Window {
    solana?: SolanaProvider;
  }
}

type CandidateView = {
  name: string;
  pda: string;
  votes?: string;
  missing?: boolean;
};

type PollView = {
  pda: string;
  pollId: string;
  name: string;
  description: string;
  metadataUri: string;
  authority: string;
  start: string;
  end: string;
  candidateCount: string;
  requiredTokenMint: string;
  isActive: boolean;
};

type VotingProgram = anchor.Program<Idl> & {
  account: Record<string, { fetch: (address: PublicKey) => Promise<any> }>;
  methods: Record<string, (...args: any[]) => any>;
};

const initialPollId = String(Date.now());
const nowSeconds = Math.floor(Date.now() / 1000);

function getSolanaProvider() {
  if (typeof window === "undefined") return undefined;
  return window.solana;
}

function toUnixSeconds(value: string) {
  return Math.floor(new Date(value).getTime() / 1000);
}

function dateTimeValue(offsetMinutes: number) {
  const date = new Date(Date.now() + offsetMinutes * 60_000);
  date.setSeconds(0, 0);
  return date.toISOString().slice(0, 16);
}

function formatUnix(value: BN | number | string) {
  const seconds = Number(BN.isBN(value) ? value.toString() : value);
  return new Date(seconds * 1000).toLocaleString();
}

function shortKey(value: string) {
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function lamportsToSol(value: string) {
  return Number(value) / anchor.web3.LAMPORTS_PER_SOL;
}

export default function Home() {
  const [walletAddress, setWalletAddress] = useState("");
  const [status, setStatus] = useState("Connect a devnet wallet to begin.");
  const [busy, setBusy] = useState(false);
  const [pollId, setPollId] = useState(initialPollId);
  const [pollName, setPollName] = useState("Community treasury vote");
  const [description, setDescription] = useState("Choose the direction for the next funding round.");
  const [metadataUri, setMetadataUri] = useState("");
  const [requiredMint, setRequiredMint] = useState("");
  const [startAt, setStartAt] = useState(dateTimeValue(-5));
  const [endAt, setEndAt] = useState(dateTimeValue(60 * 24));
  const [candidateName, setCandidateName] = useState("Alice");
  const [candidateList, setCandidateList] = useState("Alice, Bob");
  const [selectedCandidate, setSelectedCandidate] = useState("Alice");
  const [useQuadratic, setUseQuadratic] = useState(false);
  const [withdrawAmountSol, setWithdrawAmountSol] = useState("0.01");
  const [destination, setDestination] = useState("");
  const [poll, setPoll] = useState<PollView | null>(null);
  const [candidates, setCandidates] = useState<CandidateView[]>([]);
  const [treasury, setTreasury] = useState<{ pda: string; authority: string; totalCollected: string } | null>(null);

  const connection = useMemo(() => new Connection(DEVNET_RPC_URL, "confirmed"), []);
  const connected = Boolean(walletAddress);

  function getProgram(): VotingProgram {
    const solana = getSolanaProvider();
    const publicKey = solana?.publicKey;
    if (!publicKey) {
      throw new Error("Connect Phantom or another injected Solana wallet first.");
    }

    const wallet = {
      publicKey,
      signTransaction: solana.signTransaction.bind(solana),
      signAllTransactions: solana.signAllTransactions.bind(solana),
    };
    const provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    return new anchor.Program(VOTINGAPP_IDL as Idl, provider) as VotingProgram;
  }

  async function runAction(label: string, action: () => Promise<string | void>) {
    setBusy(true);
    setStatus(`${label}...`);
    try {
      const signature = await action();
      setStatus(signature ? `${label} confirmed: ${signature}` : `${label} complete.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`${label} failed: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function connectWallet() {
    const solana = getSolanaProvider();
    if (!solana) {
      setStatus("No injected wallet found. Install Phantom, Solflare, or another Solana wallet.");
      return;
    }
    const response = await solana.connect();
    setWalletAddress(response.publicKey.toBase58());
    setDestination(response.publicKey.toBase58());
    setStatus(`Connected to ${response.publicKey.toBase58()} on devnet.`);
  }

  async function refreshTreasury() {
    const program = getProgram();
    const pda = treasuryPda();
    const account = await program.account.treasuryAccount.fetch(pda);
    setTreasury({
      pda: pda.toBase58(),
      authority: account.authority.toBase58(),
      totalCollected: account.totalCollected.toString(),
    });
  }

  async function fetchPollAndCandidates() {
    const program = getProgram();
    const pollAddress = pollPda(pollId);
    const pollAccount = await program.account.pollAccount.fetch(pollAddress);
    const mint = pollAccount.requiredTokenMint as PublicKey | null;

    setPoll({
      pda: pollAddress.toBase58(),
      pollId: pollAccount.pollId.toString(),
      name: pollAccount.pollName,
      description: pollAccount.description,
      metadataUri: pollAccount.metadataUri,
      authority: pollAccount.authority.toBase58(),
      start: formatUnix(pollAccount.pollStartTime),
      end: formatUnix(pollAccount.pollEndTime),
      candidateCount: pollAccount.pollOptionIndex.toString(),
      requiredTokenMint: mint ? mint.toBase58() : "Open vote",
      isActive: pollAccount.isActive,
    });

    const names = candidateList
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const fetchedCandidates = await Promise.all(
      names.map(async (name) => {
        const pda = candidatePda(pollId, name);
        try {
          const account = await program.account.candidateAccount.fetch(pda);
          return {
            name: account.candidateName,
            pda: pda.toBase58(),
            votes: account.candidateVotes.toString(),
          };
        } catch {
          return {
            name,
            pda: pda.toBase58(),
            missing: true,
          };
        }
      }),
    );
    setCandidates(fetchedCandidates);

    try {
      await refreshTreasury();
    } catch {
      setTreasury(null);
    }
  }

  async function initializeTreasury() {
    await runAction("Initialize treasury", async () => {
      const program = getProgram();
      const tx = await program.methods
        .initializeTreasury()
        .accounts({
          signer: program.provider.publicKey,
          treasury: treasuryPda(),
          systemProgram: SYSTEM_PROGRAM_ID,
        })
        .rpc();
      await refreshTreasury();
      return tx;
    });
  }

  async function createPoll() {
    await runAction("Create poll", async () => {
      const program = getProgram();
      const mint = requiredMint.trim() ? new PublicKey(requiredMint.trim()) : null;
      const tx = await program.methods
        .initPoll(
          new BN(pollId),
          new BN(toUnixSeconds(startAt)),
          new BN(toUnixSeconds(endAt)),
          pollName,
          description,
          metadataUri,
          mint,
        )
        .accounts({
          signer: program.provider.publicKey,
          pollAccount: pollPda(pollId),
          treasury: treasuryPda(),
          systemProgram: SYSTEM_PROGRAM_ID,
        })
        .rpc();
      await fetchPollAndCandidates();
      return tx;
    });
  }

  async function addCandidate() {
    await runAction("Add candidate", async () => {
      const program = getProgram();
      const name = candidateName.trim();
      const tx = await program.methods
        .initializeCandidate(new BN(pollId), name)
        .accounts({
          signer: program.provider.publicKey,
          pollAccount: pollPda(pollId),
          candidateAccount: candidatePda(pollId, name),
          systemProgram: SYSTEM_PROGRAM_ID,
        })
        .rpc();
      setCandidateList((current) => {
        const names = current.split(",").map((item) => item.trim()).filter(Boolean);
        return names.includes(name) ? current : [...names, name].join(", ");
      });
      await fetchPollAndCandidates();
      return tx;
    });
  }

  async function castVote(tokenGated: boolean) {
    await runAction(tokenGated ? "Cast token-gated vote" : "Cast vote", async () => {
      const program = getProgram();
      const voter = program.provider.publicKey;
      if (!voter) throw new Error("Wallet public key is missing.");
      const name = selectedCandidate.trim();

      const baseAccounts = {
        signer: voter,
        pollAccount: pollPda(pollId),
        candidateAccount: candidatePda(pollId, name),
        voteReceipt: voteReceiptPda(pollId, voter),
        systemProgram: SYSTEM_PROGRAM_ID,
      };

      const tx = tokenGated
        ? await program.methods
            .voteTokenGated(new BN(pollId), name, useQuadratic)
            .accounts({
              ...baseAccounts,
              voterTokenAccount: associatedTokenAddress(voter, new PublicKey(requiredMint.trim())),
              tokenProgram: TOKEN_PROGRAM_ID,
            })
            .rpc()
        : await program.methods.vote(new BN(pollId), name).accounts(baseAccounts).rpc();

      await fetchPollAndCandidates();
      return tx;
    });
  }

  async function closePoll() {
    await runAction("Close poll", async () => {
      const program = getProgram();
      const tx = await program.methods
        .closePoll(new BN(pollId))
        .accounts({
          signer: program.provider.publicKey,
          pollAccount: pollPda(pollId),
        })
        .rpc();
      await fetchPollAndCandidates();
      return tx;
    });
  }

  async function withdrawTreasury() {
    await runAction("Withdraw treasury", async () => {
      const program = getProgram();
      const lamports = Math.round(Number(withdrawAmountSol) * anchor.web3.LAMPORTS_PER_SOL);
      const tx = await program.methods
        .withdrawTreasury(new BN(lamports))
        .accounts({
          signer: program.provider.publicKey,
          treasury: treasuryPda(),
          destination: new PublicKey(destination.trim()),
        })
        .rpc();
      await refreshTreasury();
      return tx;
    });
  }

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-[#17201b]">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-[#d7ddd7] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-[#5d7167]">Solana devnet</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-[#101713]">VotingApp Control Panel</h1>
          </div>
          <button className="primary-button" disabled={busy} onClick={connectWallet}>
            {connected ? shortKey(walletAddress) : "Connect Wallet"}
          </button>
        </header>

        <div className="status-bar">
          <span className="status-dot" />
          <span>{status}</span>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="panel">
            <div className="panel-heading">
              <h2>Poll Setup</h2>
              <span>{PROGRAM_ID.toBase58()}</span>
            </div>

            <div className="form-grid">
              <label>
                Poll ID
                <input value={pollId} onChange={(event) => setPollId(event.target.value)} />
              </label>
              <label>
                Poll name
                <input maxLength={32} value={pollName} onChange={(event) => setPollName(event.target.value)} />
              </label>
              <label className="wide">
                Description
                <textarea maxLength={280} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
              </label>
              <label className="wide">
                Metadata URI
                <input maxLength={128} placeholder="ipfs://... or https://..." value={metadataUri} onChange={(event) => setMetadataUri(event.target.value)} />
              </label>
              <label>
                Start
                <input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} />
              </label>
              <label>
                End
                <input type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} />
              </label>
              <label className="wide">
                Required token mint
                <input placeholder="Leave empty for open voting" value={requiredMint} onChange={(event) => setRequiredMint(event.target.value)} />
              </label>
            </div>

            <div className="button-row">
              <button disabled={busy || !connected} onClick={initializeTreasury}>Initialize Treasury</button>
              <button disabled={busy || !connected} onClick={createPoll}>Create Poll</button>
              <button disabled={busy || !connected} onClick={() => runAction("Refresh poll", fetchPollAndCandidates)}>Refresh</button>
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <h2>Candidate Actions</h2>
              <span>One wallet, one receipt</span>
            </div>

            <div className="form-grid single">
              <label>
                Candidate to add
                <input maxLength={32} value={candidateName} onChange={(event) => setCandidateName(event.target.value)} />
              </label>
              <label>
                Candidates to fetch
                <input value={candidateList} onChange={(event) => setCandidateList(event.target.value)} />
              </label>
              <label>
                Candidate to vote for
                <input maxLength={32} value={selectedCandidate} onChange={(event) => setSelectedCandidate(event.target.value)} />
              </label>
            </div>

            <label className="toggle-row">
              <input type="checkbox" checked={useQuadratic} onChange={(event) => setUseQuadratic(event.target.checked)} />
              <span>Use quadratic token weight</span>
            </label>

            <div className="button-row">
              <button disabled={busy || !connected} onClick={addCandidate}>Add Candidate</button>
              <button disabled={busy || !connected} onClick={() => castVote(false)}>Vote</button>
              <button disabled={busy || !connected || !requiredMint.trim()} onClick={() => castVote(true)}>Token Vote</button>
              <button disabled={busy || !connected} onClick={closePoll}>Close Poll</button>
            </div>
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <section className="panel">
            <div className="panel-heading">
              <h2>Poll State</h2>
              <span>{poll ? (poll.isActive ? "Active" : "Closed") : "Not loaded"}</span>
            </div>
            {poll ? (
              <dl className="details-list">
                <div><dt>PDA</dt><dd>{poll.pda}</dd></div>
                <div><dt>Name</dt><dd>{poll.name}</dd></div>
                <div><dt>Description</dt><dd>{poll.description}</dd></div>
                <div><dt>Authority</dt><dd>{poll.authority}</dd></div>
                <div><dt>Voting window</dt><dd>{poll.start} to {poll.end}</dd></div>
                <div><dt>Candidates</dt><dd>{poll.candidateCount}</dd></div>
                <div><dt>Token gate</dt><dd>{poll.requiredTokenMint}</dd></div>
                <div><dt>Metadata</dt><dd>{poll.metadataUri || "None"}</dd></div>
              </dl>
            ) : (
              <p className="empty-state">Create or refresh a poll to see on-chain state.</p>
            )}
          </section>

          <section className="panel">
            <div className="panel-heading">
              <h2>Results</h2>
              <span>{candidates.length} tracked</span>
            </div>
            <div className="candidate-list">
              {candidates.length ? candidates.map((candidate) => (
                <article className="candidate-card" key={candidate.pda}>
                  <div>
                    <h3>{candidate.name}</h3>
                    <p>{candidate.pda}</p>
                  </div>
                  <strong>{candidate.missing ? "Missing" : candidate.votes}</strong>
                </article>
              )) : <p className="empty-state">No candidate accounts loaded yet.</p>}
            </div>
          </section>
        </div>

        <section className="panel">
          <div className="panel-heading">
            <h2>Treasury</h2>
            <span>{treasury ? `${lamportsToSol(treasury.totalCollected)} SOL collected` : "Not loaded"}</span>
          </div>
          <div className="treasury-grid">
            <div className="details-list">
              <div><dt>PDA</dt><dd>{treasury?.pda ?? treasuryPda().toBase58()}</dd></div>
              <div><dt>Authority</dt><dd>{treasury?.authority ?? "Initialize or refresh treasury"}</dd></div>
              <div><dt>Total collected</dt><dd>{treasury ? `${treasury.totalCollected} lamports` : "Unknown"}</dd></div>
              <div><dt>Current devnet time</dt><dd>{formatUnix(nowSeconds)}</dd></div>
            </div>
            <div className="form-grid single">
              <label>
                Destination wallet
                <input value={destination} onChange={(event) => setDestination(event.target.value)} />
              </label>
              <label>
                Amount SOL
                <input inputMode="decimal" value={withdrawAmountSol} onChange={(event) => setWithdrawAmountSol(event.target.value)} />
              </label>
              <div className="button-row">
                <button disabled={busy || !connected} onClick={() => runAction("Refresh treasury", refreshTreasury)}>Refresh Treasury</button>
                <button disabled={busy || !connected} onClick={withdrawTreasury}>Withdraw</button>
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
