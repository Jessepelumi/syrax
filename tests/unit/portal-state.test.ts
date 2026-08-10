import { describe, expect, it } from "vitest";

import {
  assertPortalTransition,
  canTransitionPortal,
  PortalStateTransitionError,
} from "@/server/portals/portal-state";

describe("portal state transitions", () => {
  it("supports opening, closing, and explicitly reopening a portal", () => {
    expect(canTransitionPortal("DRAFT", "OPEN")).toBe(true);
    expect(canTransitionPortal("OPEN", "CLOSED")).toBe(true);
    expect(canTransitionPortal("CLOSED", "OPEN")).toBe(true);
  });

  it("allows any non-expired state to expire", () => {
    expect(canTransitionPortal("DRAFT", "EXPIRED")).toBe(true);
    expect(canTransitionPortal("OPEN", "EXPIRED")).toBe(true);
    expect(canTransitionPortal("CLOSED", "EXPIRED")).toBe(true);
  });

  it("treats expiry as terminal", () => {
    expect(canTransitionPortal("EXPIRED", "OPEN")).toBe(false);
    expect(() => assertPortalTransition("EXPIRED", "OPEN")).toThrow(
      PortalStateTransitionError,
    );
  });

  it("rejects self-transitions so services must handle idempotency explicitly", () => {
    expect(canTransitionPortal("OPEN", "OPEN")).toBe(false);
  });
});
