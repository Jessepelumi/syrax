// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { createElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GuestUpload } from "@/components/upload/guest-upload";

describe("GuestUpload aggregate progress", () => {
  it("shows one progress bar and a completed-image count for the full selection", () => {
    render(
      createElement(GuestUpload, {
        allowedMimeTypes: ["image/jpeg"],
        concurrency: 2,
        maxFileSizeBytes: 10_000,
        maxFilesPerSubmission: 20,
        maxSubmissionBytes: 20_000,
        portalToken: "a".repeat(43),
      }),
    );

    fireEvent.change(screen.getByLabelText("Wedding photos"), {
      target: {
        files: [
          new File([new Uint8Array(100)], "one.jpg", { type: "image/jpeg" }),
          new File([new Uint8Array(200)], "two.jpg", { type: "image/jpeg" }),
        ],
      },
    });

    expect(screen.getByText("0/2 images uploaded")).toBeVisible();
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
    expect(screen.getByText("one.jpg")).toBeVisible();
    expect(screen.getByText("two.jpg")).toBeVisible();
  });
});
