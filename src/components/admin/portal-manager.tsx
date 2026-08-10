"use client";

import { useMemo, useState, type FormEvent } from "react";

interface PortalSummary {
  expiresAt: string;
  id: string;
  name: string;
  status: "DRAFT" | "OPEN" | "CLOSED" | "EXPIRED";
}

interface PortalManagerProps {
  defaultExpiry: string;
  initialPortals: PortalSummary[];
}

interface ErrorEnvelope {
  error?: { message?: string };
}

function utcDateTimeValue(value: string): string {
  return new Date(value).toISOString().slice(0, 16);
}

async function responseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as ErrorEnvelope | null;

  return body?.error?.message ?? "Request failed. Try again.";
}

export function PortalManager({ defaultExpiry, initialPortals }: PortalManagerProps) {
  const [portals, setPortals] = useState(initialPortals);
  const [name, setName] = useState("Share your wedding photos");
  const [expiresAt, setExpiresAt] = useState(utcDateTimeValue(defaultExpiry));
  const [generatedUrl, setGeneratedUrl] = useState<string>();
  const [copyStatus, setCopyStatus] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const openPortal = useMemo(
    () => portals.find((portal) => portal.status === "OPEN"),
    [portals],
  );

  async function createPortal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    setGeneratedUrl(undefined);
    setCopyStatus(undefined);

    try {
      const parsedExpiry = new Date(`${expiresAt}:00.000Z`);

      if (Number.isNaN(parsedExpiry.getTime())) {
        setError("Choose a valid expiry time.");
        return;
      }

      const response = await fetch("/api/admin/portals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, expiresAt: parsedExpiry.toISOString() }),
      });

      if (!response.ok) {
        setError(await responseError(response));
        return;
      }

      const result = (await response.json()) as {
        portal: PortalSummary;
        portalUrl: string;
      };

      setPortals((current) => [
        result.portal,
        ...current.filter((portal) => portal.id !== result.portal.id),
      ]);
      setGeneratedUrl(result.portalUrl);
    } catch {
      setError("Portal could not be created. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(portalId: string, status: "OPEN" | "CLOSED") {
    setBusy(true);
    setError(undefined);

    try {
      const response = await fetch(`/api/admin/portals/${encodeURIComponent(portalId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        setError(await responseError(response));
        return;
      }

      const result = (await response.json()) as { portal: PortalSummary };
      setPortals((current) =>
        current.map((portal) =>
          portal.id === result.portal.id ? result.portal : portal,
        ),
      );
    } catch {
      setError("Portal status could not be changed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copyGeneratedLink() {
    if (!generatedUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(generatedUrl);
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Select and copy the link manually");
    }
  }

  return (
    <div className="mt-8 space-y-8">
      {generatedUrl ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="font-semibold text-emerald-950">Guest link created</h2>
          <p className="mt-2 text-sm leading-6 text-emerald-900">
            Copy it now. Syrax stores only its secure hash and cannot reveal this exact link again.
          </p>
          <label className="mt-4 block text-sm font-semibold text-emerald-950" htmlFor="portal-url">
            Portal URL
          </label>
          <input
            className="mt-2 w-full rounded-xl border border-emerald-300 bg-white px-3 py-3 text-sm text-slate-950"
            id="portal-url"
            readOnly
            value={generatedUrl}
          />
          <button
            className="mt-3 min-h-11 rounded-full bg-emerald-900 px-5 text-sm font-semibold text-white disabled:opacity-60"
            onClick={copyGeneratedLink}
            type="button"
          >
            Copy guest link
          </button>
          {copyStatus ? <span className="ml-3 text-sm text-emerald-900" role="status">{copyStatus}</span> : null}
        </section>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-950">Create guest link</h2>
        {openPortal ? (
          <p className="mt-3 text-sm leading-6 text-slate-600">
            One portal is already open. Close it below before generating a replacement link.
          </p>
        ) : (
          <form className="mt-5 space-y-5" onSubmit={createPortal}>
            <div>
              <label className="block text-sm font-semibold text-slate-800" htmlFor="portal-name">
                Portal title
              </label>
              <input
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-slate-950"
                id="portal-name"
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                required
                value={name}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-800" htmlFor="portal-expiry">
                Closes automatically (UTC)
              </label>
              <input
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-slate-950"
                id="portal-expiry"
                min={utcDateTimeValue(new Date().toISOString())}
                onChange={(event) => setExpiresAt(event.target.value)}
                required
                type="datetime-local"
                value={expiresAt}
              />
            </div>
            <button
              className="min-h-12 rounded-full bg-slate-950 px-6 font-semibold text-white disabled:opacity-60"
              disabled={busy}
              type="submit"
            >
              {busy ? "Creating…" : "Generate guest link"}
            </button>
          </form>
        )}
      </section>

      <section>
        <h2 className="text-xl font-semibold text-slate-950">Portal history</h2>
        {portals.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No portals created yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {portals.map((portal) => (
              <li className="rounded-2xl border border-slate-200 bg-white p-5" key={portal.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{portal.name}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Expires {new Date(portal.expiresAt).toLocaleString()}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {portal.status}
                  </span>
                </div>
                {portal.status === "OPEN" ? (
                  <button
                    className="mt-4 text-sm font-semibold text-red-700 underline disabled:opacity-60"
                    disabled={busy}
                    onClick={() => changeStatus(portal.id, "CLOSED")}
                    type="button"
                  >
                    Close portal
                  </button>
                ) : null}
                {portal.status === "CLOSED" ? (
                  <button
                    className="mt-4 text-sm font-semibold text-emerald-800 underline disabled:opacity-60"
                    disabled={busy}
                    onClick={() => changeStatus(portal.id, "OPEN")}
                    type="button"
                  >
                    Reopen retained link
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
