// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { GuestUpload } from "@/components/upload/guest-upload";

describe("GuestUpload aggregate progress", () => {
  afterEach(cleanup);

  it("collapses selected-file details beneath one aggregate progress bar", () => {
    render(
      createElement(GuestUpload, {
        allowedMimeTypes: ["image/jpeg"],
        concurrency: 2,
        maxImageBytesPerSubmission: 20_000,
        maxImageFileSizeBytes: 10_000,
        maxFilesPerSubmission: 20,
        maxSubmissionBytes: 40_000,
        maxVideoBytesPerSubmission: 20_000,
        maxVideoFileSizeBytes: 20_000,
        portalToken: "a".repeat(43),
      }),
    );

    fireEvent.change(screen.getByLabelText("Choose files"), {
      target: {
        files: [
          new File([new Uint8Array(100)], "one.jpg", { type: "image/jpeg" }),
          new File([new Uint8Array(200)], "two.jpg", { type: "image/jpeg" }),
        ],
      },
    });

    expect(screen.getByText("0/2 files uploaded")).toBeVisible();
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Upload 2 files" })).toBeVisible();
    expect(screen.getByText("Photos:", { exact: false })).toHaveTextContent(
      "Photos: 1 KiB / 20 KiB selected",
    );

    const summary = screen.getByText("File details", { exact: false });
    const details = summary.closest("details");

    expect(details).not.toHaveAttribute("open");
    expect(screen.getByText("one.jpg")).not.toBeVisible();
    expect(screen.getByText("two.jpg")).not.toBeVisible();

    fireEvent.click(summary);

    expect(details).toHaveAttribute("open");
    expect(screen.getByText("one.jpg")).toBeVisible();
    expect(screen.getByText("two.jpg")).toBeVisible();

    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);

    expect(screen.queryByText("one.jpg")).not.toBeInTheDocument();
    expect(screen.getByText("(1 file selected)")).toBeVisible();
    expect(screen.getByRole("button", { name: "Upload 1 file" })).toBeVisible();
  });

  it("applies independent photo and video file-size limits", () => {
    render(
      createElement(GuestUpload, {
        allowedMimeTypes: ["image/jpeg", "video/mp4"],
        concurrency: 2,
        maxImageBytesPerSubmission: 200,
        maxImageFileSizeBytes: 100,
        maxFilesPerSubmission: 20,
        maxSubmissionBytes: 400,
        maxVideoBytesPerSubmission: 200,
        maxVideoFileSizeBytes: 200,
        portalToken: "a".repeat(43),
      }),
    );

    fireEvent.change(screen.getByLabelText("Choose files"), {
      target: {
        files: [
          new File([new Uint8Array(101)], "too-large.jpg", {
            type: "image/jpeg",
          }),
          new File([new Uint8Array(150)], "clip.mp4", { type: "video/mp4" }),
        ],
      },
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "too-large.jpg must be non-empty and no larger than 1 KiB.",
    );
    expect(screen.getByText("(1 file selected)")).toBeVisible();
    expect(screen.getByRole("button", { name: "Upload 1 file" })).toBeVisible();
  });

  it("accepts short videos until the video category budget is exhausted", () => {
    render(
      createElement(GuestUpload, {
        allowedMimeTypes: ["image/jpeg", "video/mp4"],
        concurrency: 2,
        maxImageBytesPerSubmission: 200,
        maxImageFileSizeBytes: 100,
        maxFilesPerSubmission: 20,
        maxSubmissionBytes: 450,
        maxVideoBytesPerSubmission: 250,
        maxVideoFileSizeBytes: 200,
        portalToken: "a".repeat(43),
      }),
    );

    fireEvent.change(screen.getByLabelText("Choose files"), {
      target: {
        files: [
          new File([new Uint8Array(150)], "clip-one.mp4", { type: "video/mp4" }),
          new File([new Uint8Array(150)], "clip-two.mp4", { type: "video/mp4" }),
        ],
      },
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "clip-two.mp4 exceeds the remaining 1 KiB video selection capacity.",
    );
    expect(screen.getByText("(1 file selected)")).toBeVisible();
    expect(screen.getByText("Videos:", { exact: false })).toHaveTextContent(
      "Videos: 1 KiB / 1 KiB selected",
    );
  });
});
