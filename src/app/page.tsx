import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">
        Syrax Intake
      </p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 sm:text-6xl">
        Receive files directly in your cloud storage
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
        Connect a Google Drive folder, create a secure request link, and receive files directly in
        your cloud storage.
      </p>
      <div className="mt-10">
        <Link
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-slate-950 px-6 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-950"
          href="/admin"
        >
          Get started
        </Link>
      </div>
    </main>
  );
}
