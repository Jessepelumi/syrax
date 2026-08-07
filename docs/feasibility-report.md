# Milestone 0 feasibility report

**Status:** Implementation ready for local integration; live Drive feasibility not yet proven.

## Implemented

- Next.js App Router control plane with Node.js 22 target.
- Validated environment boundary and redacted structured logger.
- Node-runtime startup validation through Next.js instrumentation.
- PostgreSQL schema/migration source and live health probe.
- Server-side Google authorization-code flow with 256-bit state cookie.
- Admin email and Google subject enforcement.
- AES-256-GCM refresh-token encryption with unique nonce, AAD, and versioned payload.
- Short-lived signed HTTP-only admin session.
- Authenticated, no-store Picker configuration endpoint.
- Folder Picker and server-side validation using immutable selected ID.
- Transactional destination persistence and redacted audit event.
- Unit tests for environment, OAuth state, token vault tamper failure, and destination policy.
- Production dependency audit: zero known vulnerabilities on 2026-08-07. Four moderate
  development-only findings remain in Drizzle Kit's deprecated loader; see decision D-007.

## Not yet proven

- Live database migration and `/api/health` against user-selected PostgreSQL.
- OAuth callback against configured Google test account.
- Picker access to existing `TJWeddingGuestUpload` folder.
- Drive's effective create permission inside selected folder. Current check uses
  `capabilities.canAddChildren`; Gate B still requires actual disposable upload.
- Resumable-session creation and browser-to-Drive byte path.
- Desktop Chrome, iOS Safari, and Android Chrome upload behavior.
- Interrupted upload logs and CORS response behavior.

## Gate decision

Do not proceed to durable portals or guest UI. Next approved task is one-file resumable-upload spike
after live PostgreSQL, Google credentials, and selected folder are available. If direct browser PUT
fails because of CORS, authorization, mobile-browser, or session constraints, record exact sanitized
response and stop for architecture review. Do not add server file proxy.
