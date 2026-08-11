import Link from "next/link";
import { notFound } from "next/navigation";

import { GuestUpload } from "@/components/upload/guest-upload";
import { getEnvironment } from "@/lib/env";
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
        File uploads
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
        {portal.name}
      </h1>

      {!active ? (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5" role="status">
          <h2 className="font-semibold text-amber-950">
            {portal.status === "EXPIRED"
              ? "This upload link has expired"
              : unavailable
                ? "Uploads are temporarily unavailable"
                : "This upload link is closed"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            Contact the person who shared this link for help.
          </p>
        </section>
      ) : null}

      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm text-slate-600">
        <dt>Allowed</dt>
        <dd>JPEG, PNG, HEIC, MP4, and MOV files</dd>
        <dt>Photo limit</dt>
        <dd>
          {Math.round(portal.maxImageFileSizeBytes / (1024 * 1024))} MiB per file; {" "}
          {(portal.maxImageBytesPerSubmission / (1024 * 1024 * 1024)).toFixed(1)} GiB total
        </dd>
        <dt>Video limit</dt>
        <dd>
          {portal.maxVideoFileSizeBytes / (1024 * 1024 * 1024)} GiB per file and total
        </dd>
        <dt>Maximum files</dt>
        <dd>{portal.maxFilesPerSubmission}</dd>
        <dt>Closes</dt>
        <dd>{portal.expiresAt.toLocaleString()}</dd>
      </dl>

      {active ? (
        <GuestUpload
          allowedMimeTypes={portal.allowedMimeTypes}
          concurrency={getEnvironment().UPLOAD_CLIENT_CONCURRENCY}
          maxImageBytesPerSubmission={portal.maxImageBytesPerSubmission}
          maxImageFileSizeBytes={portal.maxImageFileSizeBytes}
          maxFilesPerSubmission={portal.maxFilesPerSubmission}
          maxSubmissionBytes={portal.maxSubmissionBytes}
          maxVideoBytesPerSubmission={portal.maxVideoBytesPerSubmission}
          maxVideoFileSizeBytes={portal.maxVideoFileSizeBytes}
          portalToken={portalToken}
        />
      ) : null}
    </main>
  );
}
