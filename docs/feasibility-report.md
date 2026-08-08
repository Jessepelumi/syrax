# Milestone 0 feasibility report

**Status:** PostgreSQL, OAuth, and destination-selection gates passed; provider-direct byte path
awaits live browser testing.

## Implemented

- Next.js App Router control plane with Node.js 22 target.
- Validated environment boundary and redacted structured logger.
- Node-runtime startup validation through Next.js instrumentation.
- PostgreSQL schema/migration source and live health probe.
- Initial migration applied to configured PostgreSQL on 2026-08-08. Expected four public tables
  and one Drizzle migration record verified; `/api/health` returned HTTP 200 with database `ok`.
- Server-side Google authorization-code flow with 256-bit state cookie.
- Admin email and Google subject enforcement.
- AES-256-GCM refresh-token encryption with unique nonce, AAD, and versioned payload.
- Short-lived signed HTTP-only admin session.
- Authenticated, no-store Picker configuration endpoint.
- Folder Picker and server-side validation using immutable selected ID.
- Transactional destination persistence and redacted audit event.
- Live OAuth callback completed with the configured test account on 2026-08-08.
- Google Picker selected and server verified the existing `TJWeddingGuestUpload` folder on
  2026-08-08.
- Admin-only one-file resumable-upload spike with direct browser `PUT`, safe failure reporting, and
  server-side provider metadata verification.
- Desktop in-app browser sent an 89,417-byte JPEG directly to Drive on 2026-08-08. Google accepted
  the full file in the selected folder, but browser `fetch` returned an ambiguous network/CORS
  failure instead of exposing the final provider response. Preflight independently returned HTTP
  200 with the expected origin, method, and header allowances.
- Completion now reconciles ambiguous browser results through opaque Drive app properties and
  server-side metadata verification. Application server still never handles file bytes.
- Unit tests for environment, OAuth state, token vault tamper failure, and destination policy.
- Production dependency audit: zero known vulnerabilities on 2026-08-07. Four moderate
  development-only findings remain in Drizzle Kit's deprecated loader; see decision D-007.

## Not yet proven

- Successful desktop UI completion through the new ambiguous-response reconciliation path.
- Desktop Chrome, iOS Safari, and Android Chrome upload behavior.
- Interrupted upload logs and CORS response behavior.

## Gate decision

Do not proceed to durable portals or guest UI. Next approved task is one-file resumable-upload spike
after live PostgreSQL, Google credentials, and selected folder are available. If direct browser PUT
fails because of CORS, authorization, mobile-browser, or session constraints, record exact sanitized
response and stop for architecture review. Do not add server file proxy.
