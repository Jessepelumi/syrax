import { describe, expect, it } from "vitest";

import {
  assertUploadFileTransition,
  canTransitionUploadFile,
  deriveSubmissionStatus,
  isTerminalUploadState,
  UploadStateTransitionError,
} from "@/server/uploads/upload-state";

describe("upload file state transitions", () => {
  it("allows the provider-confirmed success path", () => {
    const path = [
      ["CREATED", "SESSION_READY"],
      ["SESSION_READY", "UPLOADING"],
      ["UPLOADING", "VERIFYING"],
      ["VERIFYING", "COMPLETED"],
    ] as const;

    for (const [from, to] of path) {
      expect(canTransitionUploadFile(from, to)).toBe(true);
      expect(() => assertUploadFileTransition(from, to)).not.toThrow();
    }
  });

  it("permits a bounded retry loop without treating retry as completion", () => {
    expect(canTransitionUploadFile("UPLOADING", "RETRY_WAIT")).toBe(true);
    expect(canTransitionUploadFile("RETRY_WAIT", "UPLOADING")).toBe(true);
    expect(isTerminalUploadState("RETRY_WAIT")).toBe(false);
  });

  it.each(["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"] as const)(
    "treats %s as terminal",
    (state) => {
      expect(isTerminalUploadState(state)).toBe(true);
      expect(canTransitionUploadFile(state, "UPLOADING")).toBe(false);
    },
  );

  it("rejects client progress skipping provider verification", () => {
    expect(() => assertUploadFileTransition("UPLOADING", "COMPLETED")).toThrow(
      UploadStateTransitionError,
    );
    expect(canTransitionUploadFile("CREATED", "COMPLETED")).toBe(false);
  });
});

describe("deriveSubmissionStatus", () => {
  it.each([
    { expected: "CREATED", states: [] },
    { expected: "CREATED", states: ["CREATED", "CREATED"] },
    { expected: "UPLOADING", states: ["COMPLETED", "UPLOADING"] },
    { expected: "VERIFYING", states: ["UPLOADING", "VERIFYING"] },
    { expected: "COMPLETED", states: ["COMPLETED", "COMPLETED"] },
    { expected: "PARTIAL", states: ["COMPLETED", "FAILED"] },
    { expected: "FAILED", states: ["FAILED", "CANCELLED", "EXPIRED"] },
  ] as const)("derives $expected from $states", ({ expected, states }) => {
    expect(deriveSubmissionStatus(states)).toBe(expected);
  });
});
