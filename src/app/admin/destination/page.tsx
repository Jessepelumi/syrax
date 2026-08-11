import Link from "next/link";
import { redirect } from "next/navigation";

import { GoogleFolderPicker } from "@/components/admin/google-folder-picker";
import { getAdminSession } from "@/server/auth/admin-session";
import { getDriveDestinationForAdmin } from "@/server/drive/destination-repository";

export default async function DestinationPage() {
  const session = await getAdminSession();

  if (!session) {
    redirect("/admin");
  }

  const destination = await getDriveDestinationForAdmin(session.adminId);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16 sm:py-24">
      <Link className="text-sm font-semibold text-slate-600 hover:text-slate-950" href="/">
        Syrax Intake
      </Link>
      <p className="mt-8 text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">
        Connected as {session.email}
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
        Select folder destination
      </h1>
      <p className="mt-4 text-lg leading-8 text-slate-600">
        Choose any existing folder, or create a new folder. Syrax will
        verify the destination before request links are created.
      </p>

      {destination ? (
        <>
          <section className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <h2 className="font-semibold text-emerald-950">Verified destination</h2>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm text-emerald-900">
              <dt>Status</dt>
              <dd className="font-semibold">{destination.status}</dd>
              <dt>Name</dt>
              <dd className="font-semibold">{destination.displayName}</dd>
              <dt>Verified</dt>
              <dd>{destination.verifiedAt.toISOString()}</dd>
            </dl>
          </section>
          <Link
            className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-slate-950 px-6 font-semibold text-white"
            href="/admin/portal"
          >
            Manage request portal
          </Link>
        </>
      ) : (
        <p className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
          No destination is selected. Choose an existing folder or create one below before managing
          request portals.
        </p>
      )}

      <GoogleFolderPicker />

      <a className="mt-8 inline-block text-sm font-semibold text-slate-600 underline" href="/api/auth/google/start">
        Reconnect Google account
      </a>
    </main>
  );
}
