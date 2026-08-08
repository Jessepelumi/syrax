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
