import "server-only";

export const PORTAL_STATES = ["DRAFT", "OPEN", "CLOSED", "EXPIRED"] as const;
export type PortalState = (typeof PORTAL_STATES)[number];

const PORTAL_TRANSITIONS: Record<PortalState, readonly PortalState[]> = {
  DRAFT: ["OPEN", "CLOSED", "EXPIRED"],
  OPEN: ["CLOSED", "EXPIRED"],
  CLOSED: ["OPEN", "EXPIRED"],
  EXPIRED: [],
};

export class PortalStateTransitionError extends Error {
  constructor(
    readonly from: PortalState,
    readonly to: PortalState,
  ) {
    super(`Portal cannot transition from ${from} to ${to}`);
    this.name = "PortalStateTransitionError";
  }
}

export function canTransitionPortal(from: PortalState, to: PortalState): boolean {
  return PORTAL_TRANSITIONS[from].includes(to);
}

export function assertPortalTransition(from: PortalState, to: PortalState): void {
  if (!canTransitionPortal(from, to)) {
    throw new PortalStateTransitionError(from, to);
  }
}
