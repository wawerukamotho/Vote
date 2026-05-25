"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import { WalletConnectButton } from "../wallet-connect-button";
import {
  bn,
  candidatePda,
  formatAddress,
  pollPda,
  saveKnownCandidate,
  SYSTEM_PROGRAM_ID,
  toUnixSeconds,
  treasuryPda,
  useVotingProgram,
} from "@/lib/votingapp";

type Notice = { tone: "success" | "error" | "info"; text: string } | null;

export default function CreatePollPage() {
  const { program, wallet } = useVotingProgram();
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pollId, setPollId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [metadataUri, setMetadataUri] = useState("");
  const [tokenMint, setTokenMint] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [addedCandidates, setAddedCandidates] = useState<string[]>([]);

  const addresses = useMemo(() => {
    if (!pollId) return null;
    return {
      poll: pollPda(pollId),
      treasury: treasuryPda(),
    };
  }, [pollId]);

  function fillGeneratedDefaults() {
    setPollId(Date.now().toString());
    setStart(defaultDateTime(2));
    setEnd(defaultDateTime(24));
  }

  async function initializeTreasury() {
    if (!program || !wallet.publicKey) return;

    try {
      setBusy("treasury");
      setNotice({ tone: "info", text: "Submitting treasury initialization..." });
      const tx = await program.methods
        .initializeTreasury()
        .accounts({
          signer: wallet.publicKey,
          treasury: treasuryPda(),
          systemProgram: SYSTEM_PROGRAM_ID,
        })
        .rpc();
      setNotice({ tone: "success", text: `Treasury ready: ${tx}` });
    } catch (error) {
      setNotice({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  async function createPoll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!program || !wallet.publicKey) return;

    try {
      const startUnix = toUnixSeconds(start);
      const endUnix = toUnixSeconds(end);
      const requiredMint = tokenMint.trim()
        ? new PublicKey(tokenMint.trim())
        : null;

      setBusy("poll");
      setNotice({ tone: "info", text: "Creating poll and paying 0.001 SOL fee..." });

      const tx = await program.methods
        .initPoll(
          bn(pollId),
          bn(startUnix),
          bn(endUnix),
          name.trim(),
          description.trim(),
          metadataUri.trim(),
          requiredMint,
        )
        .accounts({
          signer: wallet.publicKey,
          pollAccount: pollPda(pollId),
          treasury: treasuryPda(),
          systemProgram: SYSTEM_PROGRAM_ID,
        })
        .rpc();

      setNotice({ tone: "success", text: `Poll created: ${tx}` });
    } catch (error) {
      setNotice({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  async function addCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!program || !wallet.publicKey) return;

    const candidate = candidateName.trim();
    if (!candidate) return;

    try {
      setBusy("candidate");
      setNotice({ tone: "info", text: `Adding ${candidate} to poll ${pollId}...` });

      const tx = await program.methods
        .initializeCandidate(bn(pollId), candidate)
        .accounts({
          signer: wallet.publicKey,
          pollAccount: pollPda(pollId),
          candidateAccount: candidatePda(pollId, candidate),
          systemProgram: SYSTEM_PROGRAM_ID,
        })
        .rpc();

      saveKnownCandidate(pollId, candidate);
      setAddedCandidates((current) => Array.from(new Set([...current, candidate])));
      setCandidateName("");
      setNotice({ tone: "success", text: `Candidate added: ${tx}` });
    } catch (error) {
      setNotice({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-[#172026]">
      <AppHeader />

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="panel">
            <div className="flex flex-col gap-4 border-b border-[#dde5ea] pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="label">Create page</p>
                <h1 className="mt-2 text-3xl font-semibold">New poll</h1>
              </div>
              <WalletConnectButton />
            </div>

            <form className="mt-6 grid gap-5" onSubmit={createPoll}>
              <div>
                <button
                  className="button-secondary"
                  onClick={fillGeneratedDefaults}
                  type="button"
                >
                  Generate default ID and times
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Poll ID">
                  <input
                    className="input"
                    value={pollId}
                    onChange={(event) => setPollId(event.target.value)}
                    inputMode="numeric"
                    required
                  />
                </Field>

                <Field label="Required token mint">
                  <input
                    className="input"
                    value={tokenMint}
                    onChange={(event) => setTokenMint(event.target.value)}
                    placeholder="Optional SPL mint address"
                  />
                </Field>
              </div>

              <Field label="Poll name">
                <input
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={32}
                  required
                />
              </Field>

              <Field label="Description">
                <textarea
                  className="input min-h-28 resize-y"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={280}
                  required
                />
              </Field>

              <Field label="Metadata URI">
                <input
                  className="input"
                  value={metadataUri}
                  onChange={(event) => setMetadataUri(event.target.value)}
                  placeholder="ipfs://..."
                  maxLength={128}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Start time">
                  <input
                    className="input"
                    type="datetime-local"
                    value={start}
                    onChange={(event) => setStart(event.target.value)}
                    required
                  />
                </Field>
                <Field label="End time">
                  <input
                    className="input"
                    type="datetime-local"
                    value={end}
                    onChange={(event) => setEnd(event.target.value)}
                    required
                  />
                </Field>
              </div>

              <button
                className="button-primary"
                disabled={!program || busy === "poll"}
                type="submit"
              >
                {busy === "poll" ? "Creating..." : "Create poll"}
              </button>
            </form>
          </div>

          <div className="panel">
            <p className="label">Candidate management</p>
            <form className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]" onSubmit={addCandidate}>
              <input
                className="input"
                value={candidateName}
                onChange={(event) => setCandidateName(event.target.value)}
                placeholder="Candidate name, max 32 characters"
                maxLength={32}
              />
              <button
                className="button-secondary"
                disabled={!program || busy === "candidate"}
                type="submit"
              >
                {busy === "candidate" ? "Adding..." : "Add candidate"}
              </button>
            </form>

            {addedCandidates.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {addedCandidates.map((candidate) => (
                  <span className="pill" key={candidate}>
                    {candidate}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-6">
          <div className="panel">
            <p className="label">Protocol</p>
            <button
              className="button-secondary mt-4 w-full"
              disabled={!program || busy === "treasury"}
              onClick={initializeTreasury}
              type="button"
            >
              {busy === "treasury" ? "Initializing..." : "Initialize treasury"}
            </button>
          </div>

          <div className="panel">
            <p className="label">Derived addresses</p>
            <dl className="mt-4 space-y-4 text-sm">
              <AddressRow label="Poll PDA" value={addresses?.poll} />
              <AddressRow label="Treasury PDA" value={addresses?.treasury} />
            </dl>
          </div>

          {notice && <NoticeBox notice={notice} />}
        </aside>
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
          <Link className="nav-link active" href="/create">
            Create
          </Link>
          <Link className="nav-link" href="/vote">
            Vote
          </Link>
        </div>
      </nav>
    </header>
  );
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-[#33424d]">
      {label}
      {children}
    </label>
  );
}

function AddressRow({
  label,
  value,
}: {
  label: string;
  value?: PublicKey;
}) {
  return (
    <div>
      <dt className="text-[#697782]">{label}</dt>
      <dd className="mt-1 break-all font-mono text-xs text-[#172026]">
        {value ? formatAddress(value, 6) : "Pending"}
      </dd>
    </div>
  );
}

function NoticeBox({ notice }: { notice: NonNullable<Notice> }) {
  return <div className={`notice ${notice.tone}`}>{notice.text}</div>;
}

function defaultDateTime(hoursFromNow: number) {
  const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Transaction failed.";
}
