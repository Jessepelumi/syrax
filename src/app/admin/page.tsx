import Link from "next/link";
import { redirect } from "next/navigation";

import { getAdminSession } from "@/server/auth/admin-session";

const errorMessages: Record<string, string> = {
  oauth_denied: "Google authorization was cancelled.",
  oauth_failed: "Google authorization failed. Check configuration and try again.",
  oauth_state_invalid: "Authorization session expired. Start again.",
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage = error ? errorMessages[error] : undefined;
  const session = await getAdminSession();

  if (session && !errorMessage) {
    redirect("/admin/destination");
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16 sm:py-24">
      <Link className="text-sm font-semibold text-slate-600 hover:text-slate-950" href="/">
        Syrax Intake
      </Link>
      <h1 className="mt-8 text-4xl font-semibold tracking-tight text-slate-950">
        Connect your Google account
      </h1>
      <p className="mt-4 text-lg leading-8 text-slate-600">
        Access is restricted to the configured administrator. Syrax requests only
        <code className="mx-1 rounded bg-slate-200 px-1.5 py-0.5 text-sm">drive.file</code>
        plus basic identity scopes.
      </p>
      {errorMessage ? (
        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <a
        className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-slate-950 px-6 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-950"
        href="/api/auth/google/start"
      >
        Connect Google Drive
      </a>
      <p className="mt-5 text-sm leading-6 text-slate-500">
        Google refresh token stays encrypted in PostgreSQL. Picker access token is issued only
        to the authenticated administrator&apos;s browser and is never stored in page markup.
      </p>
    </main>
  );
}
