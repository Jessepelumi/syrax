import Link from "next/link";
import { redirect } from "next/navigation";

import { GoogleFolderPicker } from "@/components/admin/google-folder-picker";
import { getEnvironment } from "@/lib/env";
import { getAdminSession } from "@/server/auth/admin-session";
import { getDriveDestinationForAdmin } from "@/server/drive/destination-repository";

export default async function DestinationPage() {
  const session = await getAdminSession();

  if (!session) {
    redirect("/admin");
  }

  const destination = await getDriveDestinationForAdmin(session.adminId);
  const expectedName = getEnvironment().PILOT_DESTINATION_NAME;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16 sm:py-24">
      <Link className="text-sm font-semibold text-slate-600 hover:text-slate-950" href="/">
        Syrax Intake
      </Link>
      <p className="mt-8 text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">
        Connected as {session.email}
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
        Select wedding destination
      </h1>
      <p className="mt-4 text-lg leading-8 text-slate-600">
        Use Google Picker to deliberately choose existing <strong>{expectedName}</strong> folder.
        Server verifies folder type, trash state, exact pilot name, and ability to add children.
      </p>

      {destination ? (
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
      ) : null}

      <GoogleFolderPicker expectedName={expectedName} />

      <a className="mt-8 inline-block text-sm font-semibold text-slate-600 underline" href="/api/auth/google/start">
        Reconnect Google account
      </a>
    </main>
  );
}
