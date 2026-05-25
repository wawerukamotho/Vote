import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f8fb] text-[#172026]">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-12">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#227c6f]">
          Anchor voting app
        </p>
        <h1 className="mt-5 max-w-3xl text-5xl font-semibold leading-tight text-[#12181f] sm:text-6xl">
          Create polls and cast verified Solana votes.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-[#56616b]">
          A working frontend for your Anchor program with treasury setup, poll
          creation, candidate management, standard voting, and token-gated voting.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <Link className="action-card border-[#9fd6cb] bg-white" href="/create">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#227c6f]">
              Create
            </span>
            <strong className="mt-4 block text-2xl text-[#12181f]">
              Launch a poll
            </strong>
            <span className="mt-3 block text-sm leading-6 text-[#56616b]">
              Initialize the treasury, create a poll, and add candidates from one
              focused workspace.
            </span>
          </Link>

          <Link className="action-card border-[#f0ca78] bg-white" href="/vote">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#a76a00]">
              Vote
            </span>
            <strong className="mt-4 block text-2xl text-[#12181f]">
              Open a ballot
            </strong>
            <span className="mt-3 block text-sm leading-6 text-[#56616b]">
              Load a poll by ID, track candidates, and submit a standard or
              token-gated vote.
            </span>
          </Link>
        </div>
      </section>
    </main>
  );
}
