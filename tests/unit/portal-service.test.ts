import { describe, expect, it } from "vitest";

import {
  assertPortalAcceptsSubmissions,
  type PublicPortal,
  PortalServiceError,
} from "@/server/portals/portal-service";

const openPortal = {
  allowedMimeTypes: ["image/jpeg"],
  destinationAvailable: true,
  expiresAt: new Date("2026-08-31T23:59:59.000Z"),
  id: "portal_test",
  maxFileSizeBytes: 100,
  maxFilesPerSubmission: 2,
  maxSubmissionBytes: 200,
  name: "Wedding photos",
  status: "OPEN",
} satisfies PublicPortal;

function expectPortalError(
  portal: PublicPortal,
  expectedCode: PortalServiceError["code"],
): void {
  try {
    assertPortalAcceptsSubmissions(portal);
    throw new Error("Expected portal validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(PortalServiceError);
    expect((error as PortalServiceError).code).toBe(expectedCode);
  }
}

describe("assertPortalAcceptsSubmissions", () => {
  it("accepts an open portal with a healthy pinned destination", () => {
    expect(() => assertPortalAcceptsSubmissions(openPortal)).not.toThrow();
  });

  it("rejects closed and expired capabilities with distinct errors", () => {
    expectPortalError({ ...openPortal, status: "CLOSED" }, "PORTAL_CLOSED");
    expectPortalError({ ...openPortal, status: "EXPIRED" }, "PORTAL_EXPIRED");
  });

  it("rejects a portal whose pinned provider destination is unavailable", () => {
    expectPortalError(
      { ...openPortal, destinationAvailable: false },
      "DESTINATION_UNAVAILABLE",
    );
  });
});
