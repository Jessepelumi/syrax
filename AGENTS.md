<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# TJWeddingGuestUpload - Agent Build Guide

**Document purpose:** Instruct an implementation agent to scaffold and build the wedding guest-upload pilot safely and incrementally.

**Project:** Syrax Intake wedding pilot  
**Google Drive test destination:** `TJWeddingGuestUpload`  
**Target:** 150-200 expected guests; load-test the control plane for 500 distinct guests  
**Primary client:** Mobile browser  
**Status:** Implementation guide for the first working vertical slice

> **Repository layout override (2026-08-07):** Syrax Intake lives directly in repository root.
> Treat paths shown beneath the `syrax-intake/` tree in this guide as root-relative. Do not recreate
> the wrapper directory unless repository is deliberately converted to a multi-app workspace.

---

## 1. Agent operating instructions

You are implementing the smallest reliable version of a wedding guest-upload portal. Follow this document in order.

### Required behavior

1. Inspect the repository before making changes.
2. Preserve any existing user changes and follow any repository-level `AGENTS.md` instructions.
3. Keep the project runnable after every milestone.
4. Implement one milestone at a time and run its verification commands before continuing.
5. Prefer small, reviewable modules over large route handlers.
6. Never commit credentials, OAuth tokens, upload-session URLs, guest data, or real photographs.
7. Do not add features outside the pilot scope unless required to make a P0 flow work.
8. When an API detail is uncertain, verify it against current official Google documentation before coding.
9. Record material assumptions in `docs/decisions.md` rather than silently choosing.
10. Stop and report a blocker if the browser-to-Drive feasibility test fails. Do not hide the failure behind an unplanned server proxy.

### Product boundary

This project is **Syrax Intake**, not the entire Syrax platform. Do not implement cloud-to-cloud migration, peer-to-peer transfer, encrypted relay, billing, custom domains, galleries, image editing, or multi-provider support.

### Definition of the first success

The first success is not a polished website. It is this verified path:

> An anonymous guest opens a portal on a phone, selects one disposable image, uploads it through a resumable Google Drive session, and sees success only after Google Drive acknowledges the file in the selected `TJWeddingGuestUpload` folder.

---

## 2. Non-negotiable architecture decisions

| Concern | Decision |
| --- | --- |
| Application shape | Next.js App Router modular monolith using TypeScript |
| Package manager | `npm` |
| Runtime | Node.js 22 LTS |
| Durable state | PostgreSQL |
| ORM and migrations | Drizzle ORM and Drizzle Kit |
| Validation | Zod at all external boundaries |
| Google integration | Google OAuth 2.0 web-server flow and Google Drive API v3 |
| Google scope | Start with `https://www.googleapis.com/auth/drive.file`; do not request broad Drive access without an approved decision |
| Destination selection | Google Picker folder selection; persist the immutable folder ID, not only the folder name |
| Upload method | Google Drive resumable upload session |
| Byte path | Guest browser to Google Drive when the feasibility spike proves it works on supported browsers |
| Application storage | No application-server disk persistence for guest files |
| Guest authentication | None; access is through a high-entropy portal capability token |
| Host authentication | Google OAuth account restricted to the configured admin email for the pilot |
| Tests | Vitest for units/integration; Playwright for browser flows |
| Deployment target | Vercel-compatible control plane plus managed PostgreSQL; confirm final choice before production |

### Why the Drive folder ID matters

The folder name `TJWeddingGuestUpload` is human-readable but not a stable identifier. Folder names can be duplicated or renamed. The app must store and use the folder ID returned by Google Picker.

The expected setup flow is:

1. The host connects their Google account.
2. The host opens Google Picker.
3. The host selects the existing `TJWeddingGuestUpload` folder.
4. The server validates that the selected item is a folder and that the connected account can create files in it.
5. The server stores the folder ID and displays the folder name for confirmation.

Do not attempt to discover the folder by name and silently choose the first match.

---

## 3. Pilot scope

### P0 - required before the wedding

- One host/admin Google account.
- One active upload portal.
- One selected Google Drive destination folder: `TJWeddingGuestUpload`.
- Public mobile-first upload page without guest registration.
- Selection of multiple photos or videos.
- Client-side type and size validation.
- Per-file upload state and progress.
- Google Drive resumable upload sessions.
- Bounded client concurrency: two active files at a time.
- Retry or resume within the viable session lifetime.
- Server-side records for submissions and file outcomes.
- Provider-confirmed completion before showing success.
- Guest receipt ID.
- Minimal admin status page.
- Portal close/expiry control.
- Structured logs, health endpoint, and failure visibility.
- Load test for 500 distinct visitors and 150 concurrently active clients at the control-plane level.

### P1 - add only after the vertical slice works

- Custom wedding copy and branding.
- QR code for the portal URL.
- Host notification digest.
- Submission metadata export.
- Optional event passcode.
- Reload-based upload recovery using browser storage.
- Distributed rate limiting.

### Explicitly out of scope

- Guest accounts.
- Showing guests existing Drive contents.
- Deleting or renaming existing Drive files.
- Image compression, transcoding, previews, gallery or slideshow.
- Malware scanning in the provider-direct path.
- Dropbox, S3, R2 or other destinations.
- Payments and subscriptions.
- General-purpose multi-tenant organization administration.
- Moving files between cloud providers.

---

## 4. Milestone plan

Do not scaffold the whole product blindly. Use the following sequence.

### Milestone 0 - repository and Google feasibility spike

**Goal:** Prove the risky path before building product features.

Deliverables:

- Next.js project boots locally.
- `/api/health` returns application and database health.
- Google OAuth start and callback routes work for the configured test user.
- The admin can select `TJWeddingGuestUpload` through Google Picker.
- The server can create a Drive resumable-upload session targeting the selected folder.
- A disposable image uploads from desktop Chrome and reaches the folder.
- The same flow is tested on iOS Safari and Android Chrome.
- Failed or interrupted uploads produce observable, non-secret logs.

**Gate:** Do not proceed if the browser cannot upload to the returned Drive resumable session because of CORS, authorization, mobile-browser, or session constraints. Document the exact browser/network response and escalate the architecture decision.

### Milestone 1 - durable portal and submission model

**Goal:** Replace spike-only constants with durable, validated resources.

Deliverables:

- Database migrations.
- Drive connection, destination, portal, submission and file records.
- High-entropy public portal token stored as a hash.
- Portal expiry and open/closed state.
- File lifecycle transitions and audit events.
- Idempotent session creation.

### Milestone 2 - guest upload experience

**Goal:** Make the vertical slice usable on a phone.

Deliverables:

- Responsive public upload page.
- File picker with `accept` hints for supported image/video types.
- File queue and two-file concurrency.
- Per-file progress, retry, cancel and final state.
- Aggregate submission receipt.
- Accessible keyboard, focus, status and error behavior.

### Milestone 3 - admin operations

**Goal:** Give the host enough visibility to run the event.

Deliverables:

- Portal status and destination health.
- Counts for sessions, completed files, bytes and failures.
- Close/reopen portal.
- Submission metadata list without file preview.
- Link to the destination folder.
- Basic CSV export if time permits.

### Milestone 4 - reliability and event readiness

**Goal:** Rehearse realistic failure and load conditions.

Deliverables:

- Automated unit, integration and browser tests.
- Load-test script and recorded results.
- OAuth revocation/reconnection test.
- Provider throttling and 5xx behavior test.
- Mobile network interruption test.
- Monitoring dashboard and alerts.
- Wedding-day runbook and fallback collection method.

---

## 5. Initial project scaffolding

If the repository is empty, that is, without obvious Next.js project, scaffold it with:

```bash
npm create next-app@latest syrax-intake \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"

cd syrax-intake
```

OR 

```bash
npm create next-app@latest . \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"

cd syrax-intake
```

Choose whichever approach is best for the project at this stage, in line with best engineering practices. The goal here is to keep in mind that the project will eventually grow to have syrax-move and syrax-away, as the current scope is to take care of syrax-intake.

Install the initial dependencies:

```bash
npm add \
  @paralleldrive/cuid2 \
  drizzle-orm \
  googleapis \
  jose \
  pino \
  postgres \
  server-only \
  zod

npm add -D \
  @playwright/test \
  @testing-library/jest-dom \
  @testing-library/react \
  drizzle-kit \
  tsx \
  vitest
```

The generated lockfile is authoritative. Do not mix npm, Yarn and npm lockfiles.

Add scripts equivalent to:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  }
}
```

If the current Next.js version does not expose `next lint`, use the generated ESLint command instead. Preserve the framework-generated configuration.

---

## 6. Required repository structure

Use this as the target structure. Adjust only when the framework requires a different generated location.

```text
syrax-intake/
├── docs/
│   ├── decisions.md
│   ├── google-drive-setup.md
│   ├── load-test.md
│   └── wedding-day-runbook.md
├── drizzle/
├── scripts/
│   ├── seed-pilot.ts
│   └── verify-drive-connection.ts
├── src/
│   ├── app/
│   │   ├── (public)/
│   │   │   └── upload/[portalToken]/
│   │   │       └── page.tsx
│   │   ├── admin/
│   │   │   ├── destination/page.tsx
│   │   │   ├── submissions/page.tsx
│   │   │   └── page.tsx
│   │   ├── api/
│   │   │   ├── auth/google/start/route.ts
│   │   │   ├── auth/google/callback/route.ts
│   │   │   ├── drive/destination/route.ts
│   │   │   ├── health/route.ts
│   │   │   ├── portals/[portalToken]/route.ts
│   │   │   ├── submissions/route.ts
│   │   │   ├── upload-sessions/route.ts
│   │   │   └── upload-sessions/[fileId]/
│   │   │       ├── complete/route.ts
│   │   │       └── status/route.ts
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── admin/
│   │   └── upload/
│   │       ├── file-queue.tsx
│   │       ├── file-row.tsx
│   │       ├── upload-dropzone.tsx
│   │       └── upload-receipt.tsx
│   ├── db/
│   │   ├── client.ts
│   │   ├── migrations.ts
│   │   └── schema.ts
│   ├── lib/
│   │   ├── env.ts
│   │   ├── errors.ts
│   │   ├── ids.ts
│   │   ├── logger.ts
│   │   ├── mime.ts
│   │   └── result.ts
│   └── server/
│       ├── auth/
│       │   ├── admin-session.ts
│       │   └── google-oauth.ts
│       ├── drive/
│       │   ├── client.ts
│       │   ├── destination.ts
│       │   ├── resumable-upload.ts
│       │   └── token-store.ts
│       ├── portals/
│       │   ├── portal-repository.ts
│       │   └── portal-service.ts
│       ├── submissions/
│       │   ├── submission-repository.ts
│       │   └── submission-service.ts
│       └── uploads/
│           ├── upload-repository.ts
│           ├── upload-service.ts
│           └── upload-state.ts
├── tests/
│   ├── integration/
│   └── unit/
├── e2e/
├── .env.example
├── drizzle.config.ts
├── playwright.config.ts
└── vitest.config.ts
```

NOTE: You can set up the project structure with expansible syrax-move & syrax-away as discussed above on line 231.

### Module boundaries

- `app/api/**`: HTTP parsing, authentication, validation and response mapping only.
- `server/**/service.ts`: business rules and state transitions.
- `server/**/repository.ts`: database access only.
- `server/drive/**`: Google-specific behavior only.
- `components/**`: rendering and browser interaction; never access secrets.
- `lib/env.ts`: the only module that reads and validates `process.env`.

Do not place Google refresh tokens, database code or Drive client construction inside React components.

---

## 7. Environment configuration

Create `.env.example` with placeholders only:

```dotenv
NODE_ENV=development
APP_BASE_URL=http://localhost:3000

DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE

ADMIN_EMAIL=your-google-email@example.com
ADMIN_SESSION_SECRET=replace-with-at-least-32-random-bytes
TOKEN_ENCRYPTION_KEY=replace-with-32-byte-base64-key

GOOGLE_CLIENT_ID=replace-me
GOOGLE_CLIENT_SECRET=replace-me
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
GOOGLE_API_KEY=replace-me
GOOGLE_CLOUD_PROJECT_NUMBER=replace-me

PILOT_DESTINATION_NAME=TJWeddingGuestUpload
DEFAULT_PORTAL_EXPIRY=2026-08-31T23:59:59Z
MAX_FILE_SIZE_BYTES=2147483648
MAX_FILES_PER_SUBMISSION=50
MAX_SUBMISSION_BYTES=10737418240
UPLOAD_CHUNK_SIZE_BYTES=8388608
UPLOAD_CLIENT_CONCURRENCY=2

LOG_LEVEL=info
```

Rules:

- Validate all variables at startup with Zod.
- Refuse to boot when required production variables are missing.
- Never make `GOOGLE_CLIENT_SECRET`, refresh tokens, encryption keys or database credentials available through `NEXT_PUBLIC_*` variables.
- `GOOGLE_API_KEY` is used by Google Picker and must be restricted in Google Cloud to the required API and approved web origins.
- `PILOT_DESTINATION_NAME` is display and validation metadata. The actual folder ID belongs in the database after selection.
- The listed expiry and file limits are examples. Confirm them before deployment.

---

## 8. Google Cloud and Drive setup

Create `docs/google-drive-setup.md` while implementing these steps.

### Google Cloud Console

1. Create a dedicated Google Cloud project for the wedding pilot.
2. Enable Google Drive API.
3. Enable Google Picker API.
4. Configure the OAuth consent screen.
5. Keep the application in testing mode during development.
6. Add the developer Google account as a test user.
7. Create a Web application OAuth client.
8. Add the local callback URI:
   `http://localhost:3000/api/auth/google/callback`
9. Add the eventual production callback URI before deployment.
10. Create and restrict the Picker API key by API and web origin.

### OAuth behavior

Use the authorization-code flow on the server. Request:

```text
https://www.googleapis.com/auth/drive.file
openid
email
profile
```

Request offline access so the server can receive and securely store a refresh token. Do not assume Google returns a new refresh token on every authorization. Implement reconnection explicitly.

At callback time:

1. Validate `state` against a short-lived, HTTP-only, SameSite cookie.
2. Exchange the code on the server.
3. Validate the returned identity.
4. Reject access unless the normalized email equals `ADMIN_EMAIL` for the pilot.
5. Encrypt the refresh token before database storage.
6. Store granted scopes and token expiry metadata.
7. Create a short-lived signed admin session cookie.
8. Redirect to `/admin/destination`.

### Selecting `TJWeddingGuestUpload`

Use Google Picker with folder selection enabled. The host must deliberately select the existing folder.

After Picker returns a folder ID:

1. Send the ID to `POST /api/drive/destination`.
2. Server fetches the item with minimal fields such as `id`, `name`, `mimeType`, `trashed` and `capabilities` where available.
3. Require MIME type `application/vnd.google-apps.folder`.
4. Require `trashed !== true`.
5. Verify that the connected account can create a disposable file in the folder or create a resumable session and safely abort it.
6. Require the returned name to equal `TJWeddingGuestUpload` during the pilot unless the admin explicitly confirms a different folder.
7. Persist the immutable folder ID, name, account identity and verification timestamp.

Do not make the folder publicly writable through Google Drive permissions. Guests upload through Syrax-issued sessions, not a public Drive share.

---

## 9. Database schema

Use UUIDs or collision-resistant CUID2 values. Store timestamps in UTC.

### `admins`

| Column | Notes |
| --- | --- |
| `id` | Primary key |
| `email` | Unique, normalized |
| `google_subject` | Stable Google identity ID, unique |
| `created_at` | UTC timestamp |
| `last_login_at` | UTC timestamp |

### `drive_connections`

| Column | Notes |
| --- | --- |
| `id` | Primary key |
| `admin_id` | Foreign key to admin |
| `encrypted_refresh_token` | Never log or return |
| `granted_scopes` | Text array or JSON |
| `token_version` | Supports encryption-key rotation |
| `status` | `ACTIVE`, `REVOKED`, `ERROR` |
| `last_verified_at` | UTC timestamp |
| `created_at`, `updated_at` | UTC timestamps |

### `drive_destinations`

| Column | Notes |
| --- | --- |
| `id` | Primary key |
| `drive_connection_id` | Foreign key |
| `provider_folder_id` | Selected Drive folder ID |
| `display_name` | Expected `TJWeddingGuestUpload` |
| `verified_at` | Last successful permission check |
| `status` | `ACTIVE`, `INVALID`, `DISCONNECTED` |

### `portals`

| Column | Notes |
| --- | --- |
| `id` | Primary key |
| `destination_id` | Foreign key |
| `name` | Wedding portal title |
| `public_token_hash` | SHA-256 or HMAC of public token; never store the raw capability after display |
| `status` | `DRAFT`, `OPEN`, `CLOSED`, `EXPIRED` |
| `expires_at` | UTC timestamp |
| `allowed_mime_types` | JSON/text array |
| `max_file_size_bytes` | Big integer |
| `max_files_per_submission` | Integer |
| `max_submission_bytes` | Big integer |
| `created_at`, `updated_at` | UTC timestamps |

### `submissions`

| Column | Notes |
| --- | --- |
| `id` | Primary key and receipt basis |
| `portal_id` | Foreign key |
| `status` | `CREATED`, `UPLOADING`, `VERIFYING`, `COMPLETED`, `PARTIAL`, `FAILED`, `EXPIRED` |
| `guest_name` | Optional; minimize collected data |
| `file_count` | Planned count |
| `total_declared_bytes` | Planned bytes |
| `completed_files` | Denormalized counter or computed query |
| `created_at`, `completed_at` | UTC timestamps |

### `upload_files`

| Column | Notes |
| --- | --- |
| `id` | Primary key |
| `submission_id` | Foreign key |
| `client_file_id` | Idempotency value generated by browser |
| `original_name` | Sanitized display metadata; never use directly as a path |
| `destination_name` | Collision-safe generated name |
| `declared_mime_type` | Client declaration |
| `declared_size_bytes` | Big integer |
| `state` | See upload state machine |
| `provider_file_id` | Populated after Drive accepts the file |
| `provider_session_ref` | Encrypt or strongly restrict; never log or expose after use |
| `bytes_confirmed` | Last reconciled offset |
| `attempt_count` | Integer |
| `last_error_code` | Safe internal code |
| `created_at`, `updated_at`, `completed_at` | UTC timestamps |

Add a unique constraint on `(submission_id, client_file_id)`.

### `audit_events`

| Column | Notes |
| --- | --- |
| `id` | Primary key |
| `actor_type` | `ADMIN`, `GUEST`, `SYSTEM` |
| `actor_id` | Nullable or opaque |
| `event_type` | Stable event name |
| `resource_type`, `resource_id` | Target resource |
| `metadata` | Redacted JSON only |
| `created_at` | UTC timestamp |

Do not place access tokens, refresh tokens, upload-session URLs, raw cookies, full IP addresses or file contents in audit metadata.

---

## 10. Upload state machine

Use explicit transitions. Do not infer authoritative completion from client progress.

```text
CREATED
  -> SESSION_READY
  -> UPLOADING
  -> VERIFYING
  -> COMPLETED

UPLOADING -> RETRY_WAIT -> UPLOADING
CREATED | SESSION_READY | UPLOADING | RETRY_WAIT -> CANCELLED
Any non-terminal state -> FAILED
Any non-terminal state -> EXPIRED
```

Transition rules:

- `CREATED`: validated metadata and durable file record exist.
- `SESSION_READY`: Drive returned a resumable session reference.
- `UPLOADING`: browser has begun or resumed transferring bytes.
- `RETRY_WAIT`: failure is classified as retryable and includes a bounded retry time.
- `VERIFYING`: browser claims upload completion; server reconciles with Drive.
- `COMPLETED`: Drive returns an accepted file resource or a server-side `files.get` confirms the expected provider file.
- `FAILED`, `CANCELLED`, `EXPIRED`: terminal for the current file session.

Every transition must:

1. Check the current state.
2. Apply a permitted transition only.
3. Use optimistic concurrency or a transaction.
4. Write a redacted audit event.
5. Return a stable state and safe error code.

---

## 11. HTTP API contracts

Use JSON unless transmitting file bytes directly to Google Drive.

### `GET /api/health`

Returns no secrets:

```json
{
  "status": "ok",
  "database": "ok",
  "version": "local-or-commit-sha"
}
```

### `GET /api/portals/:portalToken`

Returns public presentation and policy only:

```json
{
  "name": "Share your wedding photos",
  "status": "OPEN",
  "expiresAt": "2026-08-31T23:59:59.000Z",
  "allowedMimeTypes": ["image/jpeg", "image/heic", "image/png", "video/mp4", "video/quicktime"],
  "maxFileSizeBytes": 2147483648,
  "maxFilesPerSubmission": 50,
  "maxSubmissionBytes": 10737418240
}
```

Never return the Drive folder ID, account email, provider token or destination contents.

### `POST /api/submissions`

Request:

```json
{
  "portalToken": "public-capability",
  "guestName": "optional",
  "files": [
    {
      "clientFileId": "browser-generated-id",
      "name": "IMG_1234.HEIC",
      "mimeType": "image/heic",
      "sizeBytes": 4839201
    }
  ]
}
```

Server responsibilities:

- Hash and resolve the portal capability.
- Verify portal state and expiry.
- Validate file count, each size, MIME policy and aggregate bytes.
- Create the submission and file rows transactionally.
- Return submission ID, receipt ID and file resource IDs.

### `POST /api/upload-sessions`

Request:

```json
{
  "portalToken": "public-capability",
  "submissionId": "submission-id",
  "fileId": "internal-file-id",
  "clientFileId": "browser-generated-id"
}
```

Server responsibilities:

- Revalidate portal, submission and file ownership.
- Use an idempotency key derived from the file record.
- Refresh the Google access token server-side.
- Initiate Drive resumable upload with metadata including:
  - generated collision-safe file name;
  - `parents: [selectedFolderId]`;
  - declared MIME type;
  - optional app properties containing opaque Syrax IDs.
- Store the provider-session reference securely.
- Return the minimum client data required for the proven browser upload path.

The session response must be marked `Cache-Control: no-store`.

### `POST /api/upload-sessions/:fileId/status`

Used for reconciliation. The server queries Drive or the stored session state without exposing provider credentials.

### `POST /api/upload-sessions/:fileId/complete`

Client reports that the byte upload finished. Server verifies with Drive before transitioning to `COMPLETED`.

The endpoint is idempotent: repeated completion requests return the existing terminal result.

### Error envelope

```json
{
  "error": {
    "code": "PORTAL_EXPIRED",
    "message": "This upload link has expired.",
    "retryable": false,
    "requestId": "opaque-request-id"
  }
}
```

Stable error codes should include:

- `PORTAL_NOT_FOUND`
- `PORTAL_CLOSED`
- `PORTAL_EXPIRED`
- `FILE_TYPE_NOT_ALLOWED`
- `FILE_TOO_LARGE`
- `SUBMISSION_TOO_LARGE`
- `DRIVE_NOT_CONNECTED`
- `DESTINATION_UNAVAILABLE`
- `UPLOAD_SESSION_EXPIRED`
- `PROVIDER_RATE_LIMITED`
- `PROVIDER_TRANSIENT_ERROR`
- `UPLOAD_VERIFICATION_FAILED`
- `INTERNAL_ERROR`

Do not return raw Google error bodies to guests.

---

## 12. Browser upload engine

Build the upload engine as a framework-independent TypeScript module consumed by React.

### Responsibilities

- Accept a validated file and upload-session descriptor.
- Upload with a configurable chunk size, initially 8 MiB.
- Keep chunk sizes aligned to Google Drive resumable-upload requirements.
- Send correct `Content-Length` and `Content-Range` headers.
- Track confirmed bytes, not only bytes read from disk.
- Pause dispatch when the browser is offline.
- Query the current provider offset after an ambiguous network failure.
- Retry only classified retryable responses with bounded exponential backoff and jitter.
- Stop after the configured maximum attempt count.
- Support cancellation through `AbortController`.
- Never log the resumable session URL.

### Client queue

- Maximum two active files.
- Remaining files stay `QUEUED`.
- A failed file does not block unrelated queued files unless the error is portal-wide or provider-wide.
- Aggregate completion is:
  - `COMPLETED` when all files complete;
  - `PARTIAL` when at least one completes and another is terminal-failed;
  - `FAILED` when no file completes.

### Browser persistence

Reload-based recovery is P1. Keep the initial engine interfaces serializable so a later IndexedDB implementation can store:

- submission ID;
- internal file ID;
- client file fingerprint metadata;
- confirmed offset;
- provider session identifier only if the security review permits local persistence.

Do not persist raw file bytes in local storage.

---

## 13. File naming and metadata policy

Treat file names as untrusted text.

Generate destination names such as:

```text
20260815_<submission-short-id>_<file-short-id>_<sanitized-original-name>
```

Rules:

- Preserve the original name in metadata for host recognition.
- Remove path separators, control characters and dangerous Unicode directionality characters.
- Limit final name length.
- Keep or derive an extension only when consistent with the allowed type policy.
- Never accept a guest-provided parent folder or path.
- Never use the original name as a unique key.

For the pilot, support only explicitly tested MIME types. Browser-provided MIME type and extension are hints, not proof of content safety. The host UI must treat all uploads as untrusted and should not render them inline.

---

## 14. Security requirements

### Secrets and tokens

- Encrypt Google refresh tokens using AES-256-GCM through a small versioned token-vault interface.
- Use a unique random nonce for every encrypted value.
- Keep encryption keys outside the database.
- Never send refresh or access tokens to the guest browser.
- Treat resumable-session URLs as bearer-like secrets.
- Redact authorization headers, cookies and upload URLs from logs and error reporting.

### Public portal

- Generate at least 128 bits of entropy for the portal token.
- Store only a hash or keyed hash of the public token.
- Use constant-time comparison where applicable.
- Apply request-size limits before JSON parsing where the platform permits.
- Add rate limits to submission and upload-session creation.
- Never expose Drive folder contents or provide download routes.
- Use restrictive content security, frame, referrer and MIME-sniffing headers.

### Database and authorization

- Every guest mutation must prove possession of the portal capability and match the submission/file relationship.
- Every admin route must require the signed admin session.
- Every Drive operation must resolve through the single active verified destination.
- Do not trust IDs supplied by clients without relational checks.

### Privacy

- Guest name is optional for the pilot.
- Do not collect guest email unless the host has a concrete need and privacy copy is updated.
- Do not store full IP addresses in product records.
- Define retention for submission metadata and operational logs.
- Do not use real wedding files in automated tests.

---

## 15. Observability

Every request should have an opaque request ID. Every upload file should have a stable internal file ID.

### Structured log fields

Allowed examples:

```json
{
  "event": "upload.session.created",
  "requestId": "req_x",
  "portalId": "portal_x",
  "submissionId": "sub_x",
  "fileId": "file_x",
  "state": "SESSION_READY",
  "declaredBytes": 4839201,
  "provider": "google_drive"
}
```

Never log:

- OAuth authorization codes;
- access or refresh tokens;
- authorization headers;
- raw portal tokens;
- upload-session URLs;
- guest file contents;
- full guest messages or unbounded file names.

### Minimum metrics

- portal views;
- submission creation success/failure;
- upload-session creation latency and failure;
- files started/completed/failed;
- bytes declared and provider-confirmed;
- retry count by safe error class;
- provider 429 and 5xx rate;
- completion verification latency;
- database and OAuth connection health.

---

## 16. Testing strategy

### Unit tests

- Environment validation.
- Portal-token hashing and lookup.
- Allowed MIME and size policy.
- File-name sanitization.
- State-transition table.
- Retry classification and backoff bounds.
- `Content-Range` calculation.
- Token encryption/decryption and tamper failure.
- Safe Google error mapping.

### Integration tests

- Submission and files are created transactionally.
- Duplicate `clientFileId` does not create a second file record.
- Closed or expired portal rejects new submissions.
- Upload-session creation rejects files from another submission.
- Completion is idempotent.
- State changes and audit events commit together.
- Drive client is mocked at the HTTP boundary; secrets are absent from snapshots and logs.

### End-to-end tests

Use fake Drive adapters for routine CI. Keep a separate manually triggered test for a real Google test account.

Required browser scenarios:

1. Guest opens a valid portal and uploads one allowed image.
2. Unsupported file is rejected before upload-session creation.
3. Oversized file is rejected.
4. Multiple files obey two-file concurrency.
5. One failed file can be retried.
6. Portal expires while the page is open.
7. Duplicate completion does not duplicate output.
8. Admin closes the portal and new submissions stop.

### Real-device matrix

Before event approval, manually verify:

- current iOS Safari;
- current Android Chrome;
- desktop Chrome or Edge;
- Wi-Fi;
- mobile data;
- background and foreground transition;
- interrupted connection;
- JPEG/HEIC/PNG image;
- MP4/MOV video near the practical pilot size limit.

---

## 17. Load-test plan

Do not upload hundreds of large files to the real Drive folder during every load test. Separate control-plane load from a smaller provider-integration test.

### Control-plane test

Use synthetic metadata and a fake Drive adapter:

- 500 distinct portal visitors over 30 minutes.
- Burst of 100 visitors in 60 seconds.
- 150 active clients.
- Each submission declares 1-20 files.
- Exercise portal reads, submission creation, session creation and status polling.
- Inject 429, retryable 5xx and non-retryable provider errors.

Record:

- p50/p95/p99 response latency;
- error rate;
- database connection saturation;
- duplicate-record rate;
- queue or retry amplification;
- memory and CPU;
- number of accepted sessions lost after process restart.

### Provider integration test

Use a small controlled set of disposable files against `TJWeddingGuestUpload`:

- 10-20 simultaneous real uploads;
- representative file sizes;
- one interrupted large file;
- one expired/recreated resumable session;
- Drive quota and 429 observation.

Delete disposable test uploads after confirming the report. Do not automate broad deletion in production code.

---

## 18. Implementation order for agents

Use this exact order unless a verified repository constraint requires adjustment.

1. Scaffold Next.js, linting, type checking and test runners.
2. Add validated environment loading and structured logger.
3. Connect PostgreSQL and implement `/api/health`.
4. Create initial schema and migration.
5. Implement Google OAuth state, callback, token encryption and admin session.
6. Implement Picker-based folder selection and validation for `TJWeddingGuestUpload`.
7. Implement a minimal Drive resumable-session service.
8. Build a one-file spike page and test browser-to-Drive upload.
9. Record the feasibility result in `docs/decisions.md`.
10. Implement durable portal and submission resources.
11. Implement upload-file lifecycle and idempotent API contracts.
12. Extract the browser upload engine with chunking, progress and retry.
13. Build the multi-file mobile UI with two-file concurrency.
14. Add server-side completion verification and receipt.
15. Build the minimal admin dashboard.
16. Add security headers, rate limiting and retention jobs.
17. Add test coverage and load harness.
18. Write and rehearse the wedding-day runbook.

At the end of each step, report:

- files changed;
- tests run and results;
- assumptions made;
- remaining risks;
- the next recommended step.

---

## 19. Milestone acceptance gates

### Gate A - scaffold ready

- `npm install` succeeds.
- `npm lint` succeeds.
- `npm typecheck` succeeds.
- `npm test` succeeds.
- `/api/health` returns success with a live database.
- `.env.example` contains no real secret.

### Gate B - Drive spike ready

- OAuth works for the configured test account.
- `drive.file` is the only Drive content scope unless an exception is documented.
- Picker selects the existing `TJWeddingGuestUpload` folder.
- Folder ID is stored durably and never returned to guests.
- A disposable file arrives in the selected folder.
- Success is based on Drive acknowledgement.
- iOS Safari and Android Chrome results are recorded.
- Logs contain no credential or resumable-session URL.

### Gate C - guest pilot ready

- Guest needs no account.
- Portal policy is visible before selection.
- Allowed files upload with progress.
- Unsupported and oversized files fail safely.
- Two-file concurrency is enforced.
- Retry behavior is understandable.
- Guests cannot list or download Drive content.
- Every completed file has a provider file ID and receipt association.

### Gate D - wedding go/no-go

- 500-visitor control-plane profile passes.
- Real provider integration test passes.
- OAuth quotas, consent configuration and production callback are verified.
- Destination has sufficient storage capacity.
- Admin can close the portal.
- Monitoring and alert ownership are clear.
- Recovery and fallback collection methods are rehearsed.
- No unresolved P0 credential exposure, cross-tenant access, data-loss, duplicate-output or completion-verification defect remains.

---

## 20. Wedding-day runbook requirements

Create `docs/wedding-day-runbook.md` before launch. It must include:

- production URL and QR code;
- portal open and expiry times;
- admin and support owner;
- Google account and destination display name;
- a safe way to confirm destination health without exposing credentials;
- monitoring links and alert thresholds;
- steps for Drive disconnection;
- steps for provider throttling;
- steps for closing the portal;
- guest-facing fallback collection method;
- post-event verification and metadata export;
- test-file cleanup process;
- credential and OAuth review after the event.

Do not include raw secrets or recovery codes in the runbook.

---

## 21. Agent completion checklist

Before declaring the implementation complete, verify all of the following:

- [ ] Only the wedding Intake scope was implemented.
- [ ] The existing `TJWeddingGuestUpload` folder was selected intentionally.
- [ ] The immutable Drive folder ID is stored server-side.
- [ ] OAuth refresh tokens are encrypted at rest.
- [ ] Guest pages receive no Drive or OAuth credentials.
- [ ] No guest file is persisted to application-server disk.
- [ ] Upload progress is not treated as completion evidence.
- [ ] Google Drive acknowledgement is recorded.
- [ ] Upload-session and completion endpoints are idempotent.
- [ ] Portal tokens are high entropy and stored hashed.
- [ ] File names and metadata are treated as untrusted.
- [ ] Logs and error reporting are redacted.
- [ ] Mobile browser tests are recorded.
- [ ] Load tests and results are documented.
- [ ] Wedding-day runbook exists.
- [ ] A fallback collection method is ready.

---

## 22. Official implementation references

Agents must prefer current official documentation over blog posts or remembered API behavior:

- [Google Drive API - Manage uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads)
- [Google Drive API - Choose scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Google OAuth 2.0 for web-server applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google Drive API - Create files in folders](https://developers.google.com/workspace/drive/api/guides/folder)
- [Google Picker - Select a folder](https://developers.google.com/workspace/drive/picker/reference/picker.docsview.setselectfolderenabled)
- [Google Picker for web applications](https://developers.google.com/workspace/drive/picker/guides/web-picker)

Google recommends narrow scopes such as `drive.file` for appropriate applications. Existing files or folders should be deliberately shared with the application through an app or Picker flow. Drive resumable sessions should be treated as temporary, sensitive resources; current limits and session behavior must be revalidated before production.

---

## 23. First task to execute

The first implementation agent should complete only this task:

> Scaffold the Next.js project, add environment validation, PostgreSQL health checking, Google OAuth start/callback routes, secure token storage, and Google Picker folder selection. Prove that the existing `TJWeddingGuestUpload` folder can be selected and validated. Do not build the full guest upload UI yet.

Expected handoff:

1. Working local setup instructions.
2. Database migration.
3. OAuth and Picker flow.
4. Selected folder record with its immutable Drive ID.
5. Automated tests for environment, OAuth state, token encryption and destination validation.
6. A short feasibility report listing what remains before the one-file resumable upload spike.
