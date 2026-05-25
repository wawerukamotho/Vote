"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import { WalletConnectButton } from "../wallet-connect-button";
import {
  associatedTokenPda,
  bn,
  candidatePda,
  CandidateAccount,
  formatAddress,
  formatUnixTime,
  loadKnownCandidates,
  pollPda,
  PollAccount,
  saveKnownCandidate,
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  useVotingProgram,
  voteReceiptPda,
} from "@/lib/votingapp";

type Notice = { tone: "success" | "error" | "info"; text: string } | null;
type CandidateView = {
  name: string;
  address: PublicKey;
  votes: string;
  exists: boolean;
};

export default function VotePage() {
  const { program, wallet } = useVotingProgram();
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pollId, setPollId] = useState("");
  const [poll, setPoll] = useState<PollAccount | null>(null);
  const [candidateInput, setCandidateInput] = useState("");
  const [candidateNames, setCandidateNames] = useState<string[]>([]);
  const [candidateViews, setCandidateViews] = useState<CandidateView[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState("");
  const [tokenAccountInput, setTokenAccountInput] = useState("");
  const [useQuadratic, setUseQuadratic] = useState(true);

  const pollAddress = useMemo(() => (pollId ? pollPda(pollId) : null), [pollId]);
  const receiptAddress = useMemo(() => {
    if (!pollId || !wallet.publicKey) return null;
    return voteReceiptPda(pollId, wallet.publicKey);
  }, [pollId, wallet.publicKey]);

  async function loadPoll(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!program || !pollId) return;

    try {
      setBusy("load");
      setNotice({ tone: "info", text: `Loading poll ${pollId}...` });

      const account = (await program.account.pollAccount.fetch(
        pollPda(pollId),
      )) as PollAccount;

      const known = loadKnownCandidates(pollId);
      setPoll(account);
      setCandidateNames(known);
      setNotice({ tone: "success", text: `Loaded ${account.pollName}.` });
      await refreshCandidates(known);
    } catch (error) {
      setPoll(null);
      setCandidateViews([]);
      setNotice({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  async function refreshCandidates(names = candidateNames) {
    if (!program || !pollId) return;

    const rows = await Promise.all(
      names.map(async (name) => {
        const address = candidatePda(pollId, name);
        try {
          const account = (await program.account.candidateAccount.fetch(
            address,
          )) as CandidateAccount;
          return {
            name: account.candidateName,
            address,
            votes: account.candidateVotes.toString(),
            exists: true,
          };
        } catch {
          return {
            name,
            address,
            votes: "0",
            exists: false,
          };
        }
      }),
    );

    setCandidateViews(rows);
    if (!selectedCandidate && rows[0]) setSelectedCandidate(rows[0].name);
  }

  function trackCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = candidateInput.trim();
    if (!pollId || !candidate) return;

    saveKnownCandidate(pollId, candidate);
    const next = Array.from(new Set([...candidateNames, candidate]));
    setCandidateNames(next);
    setCandidateInput("");
    void refreshCandidates(next);
  }

  function handlePollIdChange(value: string) {
    setPollId(value);
    setPoll(null);
    setSelectedCandidate("");
    setCandidateViews([]);
    setCandidateNames(loadKnownCandidates(value));
  }

  async function vote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!program || !wallet.publicKey || !selectedCandidate) return;

    try {
      setBusy("vote");
      setNotice({ tone: "info", text: `Submitting vote for ${selectedCandidate}...` });

      const baseAccounts = {
        signer: wallet.publicKey,
        pollAccount: pollPda(pollId),
        candidateAccount: candidatePda(pollId, selectedCandidate),
        voteReceipt: voteReceiptPda(pollId, wallet.publicKey),
        systemProgram: SYSTEM_PROGRAM_ID,
      };

      let tx: string;

      if (poll?.requiredTokenMint) {
        const tokenAccount = tokenAccountInput.trim()
          ? new PublicKey(tokenAccountInput.trim())
          : associatedTokenPda(wallet.publicKey, poll.requiredTokenMint);

        tx = await program.methods
          .voteTokenGated(bn(pollId), selectedCandidate, useQuadratic)
          .accounts({
            ...baseAccounts,
            voterTokenAccount: tokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
      } else {
        tx = await program.methods
          .vote(bn(pollId), selectedCandidate)
          .accounts(baseAccounts)
          .rpc();
      }

      setNotice({ tone: "success", text: `Vote submitted: ${tx}` });
      await refreshCandidates();
    } catch (error) {
      setNotice({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  async function closePoll() {
    if (!program || !wallet.publicKey || !pollId) return;

    try {
      setBusy("close");
      setNotice({ tone: "info", text: `Closing poll ${pollId}...` });

      const tx = await program.methods
        .closePoll(bn(pollId))
        .accounts({
          signer: wallet.publicKey,
          pollAccount: pollPda(pollId),
        })
        .rpc();

      setNotice({ tone: "success", text: `Poll closed: ${tx}` });
      await loadPoll();
    } catch (error) {
      setNotice({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-[#172026]">
      <AppHeader />

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-6">
          <div className="panel">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="label">Vote page</p>
                <h1 className="mt-2 text-3xl font-semibold">Open ballot</h1>
              </div>
              <WalletConnectButton />
            </div>

            <form className="mt-6 grid gap-4" onSubmit={loadPoll}>
              <label className="grid gap-2 text-sm font-medium text-[#33424d]">
                Poll ID
                <input
                  className="input"
                  value={pollId}
                  onChange={(event) => handlePollIdChange(event.target.value)}
                  inputMode="numeric"
                  required
                />
              </label>

              <button
                className="button-primary"
                disabled={!program || busy === "load"}
                type="submit"
              >
                {busy === "load" ? "Loading..." : "Load poll"}
              </button>
            </form>
          </div>

          <div className="panel">
            <p className="label">Track candidate</p>
            <form className="mt-4 grid gap-3" onSubmit={trackCandidate}>
              <input
                className="input"
                value={candidateInput}
                onChange={(event) => setCandidateInput(event.target.value)}
                placeholder="Candidate name"
                maxLength={32}
              />
              <button className="button-secondary" type="submit">
                Add to ballot
              </button>
            </form>
          </div>

          {notice && <div className={`notice ${notice.tone}`}>{notice.text}</div>}
        </aside>

        <div className="space-y-6">
          <div className="panel">
            {poll ? (
              <div className="grid gap-5">
                <div className="flex flex-col gap-3 border-b border-[#dde5ea] pb-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="label">
                      {poll.isActive ? "Active poll" : "Closed poll"}
                    </p>
                    <h2 className="mt-2 text-3xl font-semibold">{poll.pollName}</h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-[#56616b]">
                      {poll.description}
                    </p>
                  </div>
                  <button
                    className="button-danger"
                    disabled={!program || busy === "close"}
                    onClick={closePoll}
                    type="button"
                  >
                    {busy === "close" ? "Closing..." : "Close poll"}
                  </button>
                </div>

                <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <Stat label="Poll PDA" value={pollAddress ? formatAddress(pollAddress) : "-"} />
                  <Stat label="Candidates" value={poll.pollOptionIndex.toString()} />
                  <Stat label="Starts" value={formatUnixTime(poll.pollStartTime)} />
                  <Stat label="Ends" value={formatUnixTime(poll.pollEndTime)} />
                </dl>

                <div className="rounded-lg border border-[#dde5ea] bg-[#fbfcfd] p-4">
                  <p className="text-sm font-medium text-[#33424d]">
                    {poll.requiredTokenMint
                      ? `Token-gated: ${formatAddress(poll.requiredTokenMint, 6)}`
                      : "Open vote: one vote per wallet"}
                  </p>
                  {receiptAddress && (
                    <p className="mt-2 break-all font-mono text-xs text-[#697782]">
                      Receipt PDA: {formatAddress(receiptAddress, 6)}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="empty-state">
                Load a poll ID to see its ballot, timing, token gate, and derived
                vote receipt address.
              </div>
            )}
          </div>

          <form className="panel" onSubmit={vote}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="label">Candidates</p>
                <h2 className="mt-2 text-2xl font-semibold">Cast vote</h2>
              </div>
              <button
                className="button-secondary"
                disabled={!program || busy === "load"}
                onClick={() => void refreshCandidates()}
                type="button"
              >
                Refresh
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              {candidateViews.length > 0 ? (
                candidateViews.map((candidate) => (
                  <label
                    className={`candidate-row ${
                      selectedCandidate === candidate.name ? "selected" : ""
                    }`}
                    key={candidate.name}
                  >
                    <input
                      checked={selectedCandidate === candidate.name}
                      name="candidate"
                      onChange={() => setSelectedCandidate(candidate.name)}
                      type="radio"
                    />
                    <span className="min-w-0 flex-1">
                      <strong>{candidate.name}</strong>
                      <span className="block break-all font-mono text-xs text-[#697782]">
                        {formatAddress(candidate.address, 6)}
                      </span>
                    </span>
                    <span className="text-right text-sm font-semibold">
                      {candidate.exists ? candidate.votes : "Missing"}
                    </span>
                  </label>
                ))
              ) : (
                <div className="empty-state">
                  Track a candidate name to derive its PDA and load live votes.
                </div>
              )}
            </div>

            {poll?.requiredTokenMint && (
              <div className="mt-5 grid gap-4 border-t border-[#dde5ea] pt-5">
                <label className="grid gap-2 text-sm font-medium text-[#33424d]">
                  Token account
                  <input
                    className="input"
                    value={tokenAccountInput}
                    onChange={(event) => setTokenAccountInput(event.target.value)}
                    placeholder="Leave empty to use your associated token account"
                  />
                </label>

                <label className="toggle-row">
                  <input
                    checked={useQuadratic}
                    onChange={(event) => setUseQuadratic(event.target.checked)}
                    type="checkbox"
                  />
                  Use quadratic vote weight
                </label>
              </div>
            )}

            <button
              className="button-primary mt-6"
              disabled={!program || !poll || !selectedCandidate || busy === "vote"}
              type="submit"
            >
              {busy === "vote" ? "Voting..." : "Submit vote"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function AppHeader() {
  return (
    <header className="border-b border-[#dde5ea] bg-white">
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
        <Link className="font-semibold text-[#12181f]" href="/">
          Vote
        </Link>
        <div className="flex gap-2 text-sm">
          <Link className="nav-link" href="/create">
            Create
          </Link>
          <Link className="nav-link active" href="/vote">
            Vote
          </Link>
        </div>
      </nav>
    </header>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[#697782]">{label}</dt>
      <dd className="mt-1 font-medium text-[#172026]">{value}</dd>
    </div>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Transaction failed.";
}
