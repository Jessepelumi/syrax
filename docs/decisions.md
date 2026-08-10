# Decisions

## D-001: Product directory

- **Decision:** Keep Syrax Intake directly in repository root while it is only implemented product.
- **Reason:** Root-level app keeps npm, CI, and deployment configuration simple. Premature app
  nesting adds no current boundary. Move to `apps/intake` only when another product becomes real.
- **Status:** Supersedes initial `syrax-intake/` subdirectory decision on 2026-08-07.

## D-002: Milestone 0 schema boundary

- **Decision:** Initial migration contains `admins`, `drive_connections`, `drive_destinations`, and
  `audit_events` only.
- **Reason:** Portal, submission, and upload-file resources belong after Drive feasibility gate.
  Creating them now would violate guide order.
- **Status:** Accepted. Add remaining schema only after Gate B.

## D-003: Google Picker token handoff

- **Decision:** Authenticated admin browser gets short-lived Google access token from
  `GET /api/drive/picker-config`, marked `private, no-store`. Refresh token never leaves server.
- **Reason:** Picker's `setOAuthToken` requires access token. Endpoint requires signed admin session;
  guest routes do not exist and cannot call it successfully.
- **Status:** Accepted for pilot. Reassess browser token exposure before broader multi-admin scope.

## D-004: Folder validation depth

- **Decision:** Milestone 0 validates Picker-selected ID with Drive `files.get`, exact folder MIME
  type, `trashed !== true`, expected name, and `capabilities.canAddChildren === true`.
- **Reason:** This proves selection and permission metadata without creating or deleting files.
- **Status:** Provisional. Actual create permission and browser-to-Drive path remain unproven until
  one-file resumable upload spike. Do not pass Gate B using capability metadata alone.

## D-005: PostgreSQL connection defaults

- **Decision:** Per-process pool maximum is five connections; prepared statements disabled.
- **Reason:** Conservative Vercel-compatible default for pilot. Final managed PostgreSQL limits and
  deployment concurrency are unknown.
- **Status:** Revisit before production load test.

## D-006: OAuth reconnection

- **Decision:** Start flow requests `offline` access and explicit consent/account selection. Callback
  preserves stored encrypted refresh token when Google omits a new one.
- **Reason:** Google generally returns refresh token on first grant and does not guarantee one on
  every authorization.
- **Status:** Accepted for one-admin pilot.

## D-007: Development-only advisory

- **Decision:** Keep Drizzle Kit `0.31.10`; do not apply npm's forced downgrade to `0.18.1`.
- **Reason:** `npm audit` reports moderate `GHSA-67mh-4wv8-2f99` through Drizzle Kit's deprecated
  `@esbuild-kit/esm-loader` development path. Production-only audit reports zero vulnerabilities.
  Forced fix is a breaking downgrade and does not improve runtime exposure. Migration tooling must
  remain local-only and must not bind a network-accessible development server.
- **Status:** Accepted temporarily. Recheck on every Drizzle Kit upgrade.

## D-008: Environment loading for root tooling

- **Decision:** Root tooling such as Drizzle Kit loads `.env*` files with Next.js `@next/env`
  before calling validated accessors in `src/lib/env.ts`.
- **Reason:** Next.js loads `.env.local` only inside its runtime. Drizzle config executes in a
  standalone Node process and otherwise sees no `DATABASE_URL`, even while the app runs correctly.
- **Status:** Accepted. `src/lib/env.ts` remains the only module that reads and validates
  `process.env` directly.

## D-009: Milestone 0 resumable-upload shape

- **Decision:** Prove the provider-direct byte path with an authenticated admin-only, one-file,
  single-request `PUT` to a Google Drive resumable-session URI. Return that bearer-like URI only in
  a private, no-store response; never persist or log it. Verify the resulting provider file
  server-side using opaque app properties, declared metadata, and selected parent folder. Cap this
  destructive-to-Drive test at 25 MiB even when the eventual portal limit is larger. When the
  browser cannot read the final provider response after a successful preflight, reconcile by the
  opaque upload app property and selected parent; never proxy file bytes through the application.
- **Reason:** Google documents single-request content transfer as a valid resumable upload. This
  isolates CORS, browser, permission, and provider-acknowledgement risk before building the chunked
  guest upload engine or durable upload resources.
- **Status:** Implemented for feasibility testing. Desktop testing proved direct byte delivery but
  exposed an ambiguous final browser response; reconciliation added 2026-08-08. Gate B still needs
  a successful reconciled desktop rerun and mobile-browser tests.

## D-010: HEIC provider MIME normalization

- **Decision:** When a validated browser file declares registered `image/heic`, accept Google
  Drive returning registered `image/heif` during provider verification. Keep every other MIME
  comparison exact, and continue requiring exact opaque upload ID, byte count, generated name, and
  selected parent folder.
- **Reason:** Three live HEIC tests on 2026-08-10 delivered every declared byte, but Drive normalized
  the stored MIME type from `image/heic` to `image/heif`. IANA registers both image media types.
  Treating the observed pair as equivalent avoids a false failure without allowing arbitrary image
  types.
- **Status:** Accepted for the pilot; covered by regression tests.

## D-011: Immutable destination binding for portals

- **Decision:** Preserve one destination row per Drive connection and provider folder ID. A portal
  references that immutable destination row; selecting a different folder creates another row
  instead of rewriting the existing row.
- **Reason:** Existing upload links must continue targeting the destination explicitly chosen when
  they were created. Mutating a shared destination row could silently redirect live portal uploads.
- **Status:** Accepted for Milestone 1. The latest verified row remains the admin default for new
  portals.

## D-012: Milestone 1 concurrency and secret storage primitives

- **Decision:** Add integer `version` columns to mutable submission and upload-file resources for
  optimistic concurrency. Store Drive resumable-session references only as encrypted values while
  retaining the guide's `provider_session_ref` database column name.
- **Reason:** Upload callbacks and retries can race. Versioned updates allow services to reject stale
  transitions, while encrypted session references avoid persisting bearer-like URLs in plaintext.
- **Status:** Accepted. Service methods must update state, version, counters, and redacted audit
  events in one transaction.

## D-013: One-time portal capability display and rotation

- **Decision:** Return the raw 256-bit portal capability only in the no-store portal-creation
  response. Persist only its SHA-256 hash. Allow one unexpired open portal per pilot admin; closing
  the current portal permits creating a replacement capability.
- **Reason:** A retrievable plaintext capability would turn the database into a guest-link secret
  store. A transaction-scoped PostgreSQL advisory lock serializes concurrent create/reopen requests
  for the same admin without adding pilot-only schema.
- **Status:** Accepted for the pilot. Hosts must copy a new link when shown; reopening is useful only
  when they retained the original link.

## D-014: Initial durable portal media policy

- **Decision:** Newly created pilot portals allow only the provider-tested `image/jpeg`,
  `image/png`, and `image/heic` declarations. Destination extensions are derived from that MIME
  policy, never from the guest filename.
- **Reason:** The wedding MVP currently targets images, and these three types passed the direct
  browser-to-Drive feasibility gate. MP4 and MOV remain untested and must not be silently enabled.
- **Status:** Accepted for Milestone 1. Expand only after real-device provider testing.

## D-015: Atomic guest submission acceptance

- **Decision:** Lock the resolved portal row while rechecking `OPEN`, expiry, Drive connection, and
  destination state; insert the submission, all file records, and redacted audit event in the same
  transaction.
- **Reason:** Portal closure or provider disconnection must not leave a partially accepted guest
  submission. The per-submission client file ID unique index remains the durable file idempotency
  boundary.
- **Status:** Accepted for Milestone 1.
