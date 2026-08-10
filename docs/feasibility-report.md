# Milestone 0 feasibility report

**Status:** Milestone 0 feasibility gate passed; Milestone 1 approved on 2026-08-10.

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
- Google Picker selected and server verified the configured test destination on 2026-08-08.
- Admin-only one-file resumable-upload spike with direct browser `PUT`, safe failure reporting, and
  server-side provider metadata verification.
- Desktop in-app browser sent an 89,417-byte JPEG directly to Drive on 2026-08-08. Google accepted
  the full file in the selected folder, but browser `fetch` returned an ambiguous network/CORS
  failure instead of exposing the final provider response. Preflight independently returned HTTP
  200 with the expected origin, method, and header allowances.
- Completion now reconciles ambiguous browser results through opaque Drive app properties and
  server-side metadata verification. Application server still never handles file bytes.
- Three HEIC attempts on 2026-08-10 transferred all 1,186,496 declared bytes each. Drive stored each
  file as `image/heif` after the browser declared `image/heic`, causing strict MIME verification to
  report a false failure. Verification now accepts only that observed registered MIME pair while
  retaining exact checks for all other metadata.
- JPEG, PNG, and HEIC uploads completed through provider reconciliation after the HEIC normalization
  fix.
- Production deployment on Vercel completed successfully, including the production Google OAuth
  callback configuration.
- The deployed provider-direct upload flow completed successfully in iOS Chrome on a mobile device.
- Unit tests for environment, OAuth state, token vault tamper failure, and destination policy.
- Production dependency audit: zero known vulnerabilities on 2026-08-07. Four moderate
  development-only findings remain in Drizzle Kit's deprecated loader; see decision D-007.

## Remaining event-readiness checks

- Live chunked upload using `Content-Range` through the new guest portal.
- Two-file concurrency and provider-confirmed aggregate receipt on a real phone.
- iOS Safari and Android Chrome upload behavior.
- Video upload behavior for MP4 and MOV.
- Interrupted upload logs and CORS response behavior.

## Gate decision

Proceed to Milestone 1 durable portal and submission resources. Keep remaining device and failure
checks in the event-readiness matrix. Direct browser-to-Drive upload remains the byte path; do not add
a server file proxy.
