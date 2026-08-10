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

  if (!destination) {
    redirect("/admin/destination");
  }

  const portals = await listPortalsForAdmin(session.adminId);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16 sm:py-24">
      <Link className="text-sm font-semibold text-slate-600 hover:text-slate-950" href="/">
        Syrax Intake
      </Link>
      <p className="mt-8 text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">
        Destination: {destination.displayName}
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
        Wedding guest portal
      </h1>
      <p className="mt-4 text-lg leading-8 text-slate-600">
        Generate one high-entropy guest link. New submissions remain pinned to this verified
        Drive destination even if a different folder is selected later.
      </p>

      <PortalManager
        defaultExpiry={getEnvironment().DEFAULT_PORTAL_EXPIRY}
        initialPortals={portals.map((portal) => ({
          id: portal.id,
          name: portal.name,
          status: portal.status,
          expiresAt: portal.expiresAt.toISOString(),
        }))}
      />

      <Link className="mt-10 inline-block text-sm font-semibold text-slate-600 underline" href="/admin/destination">
        Change Drive destination
      </Link>
    </main>
  );
}
