// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PortalManager } from "@/components/admin/portal-manager";

const portalUrl = "https://syrax.example/upload/guest-capability";
const defaultExpiry = "2099-08-31T23:59:59.000Z";

function portal(status: "OPEN" | "CLOSED", includeUrl = true) {
  return {
    expiresAt: defaultExpiry,
    id: "portal-id",
    name: "Wedding photos",
    ...(includeUrl ? { portalUrl } : {}),
    status,
  } as const;
}

describe("PortalManager active links", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the existing link whenever the portal page loads open", () => {
    render(
      createElement(PortalManager, {
        canCreatePortal: true,
        defaultExpiry,
        initialPortals: [portal("OPEN")],
      }),
    );

    expect(screen.getByRole("heading", { name: "Active guest link" })).toBeVisible();
    expect(screen.getByDisplayValue(portalUrl)).toBeVisible();
    expect(screen.getByRole("button", { name: "Copy guest link" })).toBeEnabled();
  });

  it("restores the same link after reopening a closed portal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ portal: portal("OPEN") }),
          { headers: { "Content-Type": "application/json" }, status: 200 },
        ),
      ),
    );
    render(
      createElement(PortalManager, {
        canCreatePortal: true,
        defaultExpiry,
        initialPortals: [portal("CLOSED", false)],
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Reopen retained link" }));

    expect(await screen.findByDisplayValue(portalUrl)).toBeVisible();
  });

  it("deletes a closed portal after explicit confirmation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(
      createElement(PortalManager, {
        canCreatePortal: true,
        defaultExpiry,
        initialPortals: [portal("CLOSED", false)],
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete portal" }));

    await waitFor(() =>
      expect(screen.queryByText("Wedding photos")).not.toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/portals/portal-id", {
      method: "DELETE",
    });
    expect(screen.getByText("No portals created yet.")).toBeVisible();
  });

  it("never offers deletion for an open portal", () => {
    render(
      createElement(PortalManager, {
        canCreatePortal: true,
        defaultExpiry,
        initialPortals: [portal("OPEN")],
      }),
    );

    expect(screen.queryByRole("button", { name: "Delete portal" })).not.toBeInTheDocument();
  });

  it("keeps closed portal history manageable without a selected destination", () => {
    render(
      createElement(PortalManager, {
        canCreatePortal: false,
        defaultExpiry,
        initialPortals: [portal("CLOSED", false)],
      }),
    );

    expect(screen.getByRole("button", { name: "Delete portal" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Generate guest link" })).not.toBeInTheDocument();
  });
});
