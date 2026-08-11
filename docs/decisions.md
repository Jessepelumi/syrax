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
- **Status:** Superseded by D-020 for portals created after migration `0003_shallow_stone_men`.
  Existing hash-only portals remain intentionally unrecoverable.

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

## D-016: Idempotent resumable-session creation lease

- **Decision:** Claim a two-minute database lease before requesting a Google Drive resumable
  session. Persist the returned session URI only as AES-256-GCM ciphertext with upload-specific
  authenticated data, and expose it only in a no-store response. Reuse an unexpired stored session
  for repeated requests. Treat it as unusable after six days, conservatively inside Google's
  documented approximately one-week lifetime.
- **Reason:** Google session creation does not provide an application idempotency key. A durable
  lease prevents concurrent HTTP retries from creating multiple usable provider sessions for one
  file without holding a database transaction open across a network request.
- **Status:** Accepted for the pilot. The lease and provider-expiry columns are additive migration
  `0002_fancy_scorpion`.

## D-017: Chunk confirmation and ambiguous browser reconciliation

- **Decision:** Upload directly from the guest browser in configured chunks aligned to 256 KiB.
  Advance progress only from Google's `Range` response or the server status endpoint. On an
  ambiguous browser/CORS result, the server sends Google's documented empty status `PUT`, then
  verifies the completed Drive resource by private app properties, generated name, exact size,
  allowed MIME equivalence, and pinned parent folder.
- **Reason:** Google documents `308 Resume Incomplete` plus `Range` as authoritative, `200/201` as
  complete, and `404` as an expired session. Browser-reported bytes alone cannot prove delivery.
- **References:** [Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads),
  [Drive app-property search](https://developers.google.com/workspace/drive/api/guides/search-files).
- **Status:** Implemented; live chunked CORS/device verification remains required before the guest
  link is distributed.

## D-018: Pilot cancellation boundary

- **Decision:** Explicit guest cancellation aborts the browser request, removes the stored session
  capability, and transitions a non-verifying file to `CANCELLED`. Do not call an undocumented
  provider-session cancellation method.
- **Reason:** Current Drive guidance documents status and expiry but not cancellation of a Drive v3
  resumable session. The remaining provider session receives no further bytes from Syrax and ages
  out; a final request already accepted by Google may still reconcile as completed.
- **Status:** Accepted for the pilot; document this nuance in the event runbook.

## D-019: Flexible Drive destinations and root-level folder creation

- **Decision:** Accept any Picker-selected folder that is a non-trashed Drive folder with
  `canAddChildren=true`. Remove the pilot name equality gate. Let the admin create a normalized,
  root-level My Drive folder through `files.create`; verify and persist the returned immutable folder
  ID through the same destination path used by Picker.
- **Reason:** Destination identity and write capability are the security boundaries. A folder name is
  mutable display metadata and should not restrict the product to one wedding folder. Root-level
  creation is the smallest unambiguous admin flow when no parent was requested.
- **Status:** Accepted. Existing portals stay pinned to their original destination row; only the
  destination explicitly marked current under D-022 is used for newly generated portals.

## D-020: Recoverable active portal links for authenticated admins

- **Decision:** Continue storing the SHA-256 portal-token hash as the guest lookup boundary. Also
  store an AES-256-GCM encrypted capability for authenticated admin display, with the hash included
  as authenticated data. Return the decrypted URL only while the portal is `OPEN`; retain the
  ciphertext while closed so reopening restores the same link.
- **Reason:** Hosts must be able to retrieve an active link after navigation, reload, or reopening.
  Authenticated encryption avoids plaintext capability storage and prevents ciphertext from being
  moved between portal records without detection.
- **Status:** Accepted in additive migration `0003_shallow_stone_men`. Pre-migration hash-only links
  cannot be reconstructed and require replacement if the host did not retain them.

## D-021: Aggregate guest upload progress

- **Decision:** Display one byte-based progress bar for the full submission and pair it with a
  provider-confirmed completed-file count such as `4/20 images uploaded`. Keep per-file state,
  retry, and cancellation controls without individual progress bars.
- **Reason:** A single aggregate bar is easier to scan on mobile while byte-based movement remains
  smoother and more accurate than advancing only when a whole image completes.
- **Status:** Accepted for the wedding upload experience.

## D-022: Explicit current destination selection

- **Decision:** Track the admin's current destination with nullable `selected_at`. Historical rows
  remain available for portals already pinned to them, while only one destination per Drive
  connection can have a non-null selection timestamp. Existing rows migrate unselected.
- **Reason:** Destination health and current user intent are different states. Treating the most
  recently updated healthy row as implicitly selected caused an old pilot folder to remain active.
- **Status:** Accepted. Selecting or creating a folder atomically clears the previous selection and
  marks the new destination current.

## D-023: Inactive portal deletion

- **Decision:** Authenticated admins may permanently delete `CLOSED` or `EXPIRED` portals. Deletion
  removes their Syrax submissions, upload-file records, and stored capability, but never deletes
  files from Google Drive. A redacted deletion audit event is retained.
- **Reason:** Closed links need a safe cleanup path without broadening Syrax into a Drive file
  deletion tool. Restricting deletion to inactive portals prevents live links from disappearing by
  accident while allowing expired history to be cleaned up.
- **Status:** Accepted with an explicit browser confirmation and server-side state enforcement.

## D-024: Temporary beta administrator allowlist

- **Decision:** Replace the single configured administrator email with a server-only,
  comma-separated `BETA_ADMIN_EMAILS` allowlist. Google continues to provide authentication and the
  Drive integration during the beta. Every invited Google identity receives its own administrator,
  Drive connection, destinations, and portals. Do not expose the allowlist to the browser.
- **Reason:** A narrow allowlist lets multiple known people test Syrax immediately while preserving
  the existing ownership checks. It avoids opening self-service registration before email OTP,
  identity linking, provider-neutral integrations, rate limits, and account lifecycle controls
  exist.
- **Status:** Temporary bridge. Replace it with the identity and integration architecture in
  `docs/product-roadmap.md`; do not expand it into a permanent authorization system.
