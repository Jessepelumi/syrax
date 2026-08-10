import Link from "next/link";
import { redirect } from "next/navigation";

import { PortalManager } from "@/components/admin/portal-manager";
import { getEnvironment } from "@/lib/env";
import { getAdminSession } from "@/server/auth/admin-session";
import { getActiveDriveDestinationForAdmin } from "@/server/drive/destination-repository";
import { listPortalsForAdmin } from "@/server/portals/portal-service";

export default async function PortalPage() {
  const session = await getAdminSession();

  if (!session) {
    redirect("/admin");
  }

  const destination = await getActiveDriveDestinationForAdmin(session.adminId);
  const portals = await listPortalsForAdmin(session.adminId);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16 sm:py-24">
      <Link className="text-sm font-semibold text-slate-600 hover:text-slate-950" href="/">
        Syrax Intake
      </Link>
      <p className="mt-8 text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">
        {destination
          ? `Destination: ${destination.displayName}`
          : "No current destination selected"}
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
        File request portal
      </h1>
      <p className="mt-4 text-lg leading-8 text-slate-600">
        Generate one high-entropy request link. Each portal remains pinned to the Drive destination
        selected when it was created.
      </p>

      <PortalManager
        canCreatePortal={Boolean(destination)}
        defaultExpiry={getEnvironment().DEFAULT_PORTAL_EXPIRY}
        initialPortals={portals.map((portal) => ({
          id: portal.id,
          name: portal.name,
          status: portal.status,
          expiresAt: portal.expiresAt.toISOString(),
          portalUrl: portal.portalUrl,
        }))}
      />

      <Link className="mt-10 inline-block text-sm font-semibold text-slate-600 underline" href="/admin/destination">
        {destination ? "Change Drive destination" : "Select Drive destination"}
      </Link>
    </main>
  );
}
