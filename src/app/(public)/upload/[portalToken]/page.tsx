import Link from "next/link";
import { notFound } from "next/navigation";

import { resolvePublicPortal } from "@/server/portals/portal-service";

export default async function UploadPortalPage({
  params,
}: {
  params: Promise<{ portalToken: string }>;
}) {
  const { portalToken } = await params;
  const portal = await resolvePublicPortal(portalToken);

  if (!portal) {
    notFound();
  }

  const unavailable = !portal.destinationAvailable && portal.status === "OPEN";
  const active = portal.status === "OPEN" && !unavailable;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-16">
      <Link className="text-sm font-semibold text-slate-600" href="/">
        Syrax Intake
      </Link>
      <p className="mt-8 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
        Wedding uploads
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
        {portal.name}
      </h1>

      {active ? (
        <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="font-semibold text-emerald-950">Upload link active</h2>
          <p className="mt-2 text-sm leading-6 text-emerald-900">
            This capability is valid and ready for the multi-file upload interface. Do not
            distribute it until the guest uploader slice is deployed.
          </p>
        </section>
      ) : (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5" role="status">
          <h2 className="font-semibold text-amber-950">
            {portal.status === "EXPIRED"
              ? "This upload link has expired"
              : unavailable
                ? "Uploads are temporarily unavailable"
                : "This upload link is closed"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-amber-900">Contact the wedding host for help.</p>
        </section>
      )}

      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm text-slate-600">
        <dt>Allowed</dt>
        <dd>JPEG, PNG, and HEIC images</dd>
        <dt>Maximum files</dt>
        <dd>{portal.maxFilesPerSubmission}</dd>
        <dt>Closes</dt>
        <dd>{portal.expiresAt.toLocaleString()}</dd>
      </dl>
    </main>
  );
}
