import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">
        Syrax Intake
      </p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 sm:text-6xl">
        Wedding guest upload pilot
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
        Milestone 0 connects one approved host account and verifies the selected Google Drive
        destination before guest uploads are enabled.
      </p>
      <div className="mt-10">
        <Link
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-slate-950 px-6 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-950"
          href="/admin"
        >
          Open host setup
        </Link>
      </div>
    </main>
  );
}
