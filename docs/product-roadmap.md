# Syrax identity and integration roadmap

## Purpose

Evolve Syrax Intake from Google-coupled pilot authentication into a general-purpose file-request
platform. Authentication identifies a Syrax user. Integrations separately authorize access to
storage providers. A user can have multiple authentication identities and multiple integrations.

The temporary beta administrator allowlist is intentionally excluded from this roadmap. It is a
short-lived access control bridge, not part of the target architecture.

## Product rules

- Email plus one-time password is the primary authentication method.
- Email OTP creates a user with no storage integration.
- Google and Microsoft OAuth may authenticate a user and create the matching storage integration
  when storage consent succeeds.
- A signed-in user may connect additional providers regardless of the method used to sign in.
- Authentication identities and provider credentials remain separate and independently revocable.
- Never merge accounts solely because two providers return the same email address. Require an
  authenticated linking flow or fresh email verification.
- Facebook and LinkedIn are not planned authentication providers because they do not advance the
  storage-integration product.
- AWS S3 is a future integration, not a consumer sign-in method.
- Sign in with Apple may be offered as authentication, but it must not be presented as an iCloud
  Drive integration. Apple's web identity scopes expose identity information rather than general
  iCloud Drive access.

## Target data model

### `users`

Canonical Syrax account with normalized primary email, verification timestamp, lifecycle status,
and UTC creation/update timestamps.

### `auth_identities`

Login methods linked to a user. Store provider type, stable provider subject, provider email, and
last-used timestamp. Enforce a unique constraint on `(provider, provider_subject)`. Do not store
storage refresh tokens here.

### `otp_challenges`

Short-lived email challenges. Store only a keyed hash of the OTP, expiry, attempt count,
consumption timestamp, and safe rate-limit metadata. Codes are one use and consumed transactionally.

### `sessions`

Revocable user sessions backed by opaque, hashed tokens. Store expiry, revocation, and last-used
timestamps. Deliver the raw token only through a secure, HTTP-only, SameSite cookie.

### `integrations`

Provider connections owned by a user. Store provider type, stable provider-account ID, encrypted
versioned credentials, granted scopes, status, credential expiry, and verification timestamps.
Provider secrets never appear in identity records or browser-visible APIs.

### `destinations`

Provider-neutral upload targets belonging to an integration. Store provider resource ID, display
metadata, type, verification state, and explicit selection state. Portals continue referencing an
immutable destination record.

## Milestone 1: Identity foundation

1. Migrate `admins` into provider-neutral `users`.
2. Add `auth_identities`, `sessions`, and account lifecycle states.
3. Move Google subject data from the user record into a Google identity record.
4. Preserve existing administrator IDs during migration so Drive ownership and portal history do
   not change.
5. Add cross-user authorization tests for integrations, destinations, portals, submissions, and
   upload sessions.

## Milestone 2: Email OTP authentication

1. Implement request and verify endpoints with Zod validation and bounded request bodies.
2. Hash OTPs with a dedicated server secret; never store or log plaintext codes.
3. Enforce short expiry, one-time consumption, maximum attempts, and resend cooldowns.
4. Rate limit by normalized email and privacy-preserving network signal.
5. Return generic responses so account existence is not disclosed.
6. Introduce a transactional, revocable session store and logout flow.
7. Configure a production email provider plus SPF, DKIM, and DMARC for the sending domain.

## Milestone 3: Account linking and lifecycle

1. Let authenticated users add Google, Microsoft, or Apple identities.
2. Require an existing authenticated session or fresh OTP before linking an OAuth identity to an
   existing account.
3. Prevent removal of the last usable login method.
4. Add integration disconnect, session revocation, account deletion, and retained-data disclosure.
5. Handle provider revocation and identity-change notifications where supported.

## Milestone 4: Provider-neutral storage adapters

Define a small capability interface for each integration:

```text
authorize
refreshCredentials
pickDestination
createDestination
verifyDestination
createUploadSession
reconcileUpload
disconnect
```

Keep provider APIs behind adapter modules. HTTP routes and portal services depend on generic
integration and destination contracts rather than Google-specific clients.

## Milestone 5: Google migration

1. Move `drive_connections` into the generic integration model without rotating valid encrypted
   refresh tokens.
2. Preserve the narrow `drive.file` scope and Picker-based explicit destination selection.
3. When a new user chooses Google sign-in and grants Drive consent, create the Google identity and
   Drive integration in one recoverable flow.
4. Let email-OTP users connect Google later from an integrations page.

## Milestone 6: Microsoft and OneDrive feasibility

Run a provider gate before product implementation:

1. Support personal Microsoft accounts and evaluate work/school tenant behavior.
2. Prove offline token refresh and reconnection.
3. Evaluate the least-privilege permission that still permits arbitrary folder selection and guest
   uploads; do not silently adopt broad file access.
4. Prove OneDrive picker, folder creation, upload sessions, browser CORS behavior, interruption
   recovery, and provider-confirmed completion.
5. Stop and document the browser/provider response if the direct byte path fails.

## Milestone 7: Production readiness

1. Add a verified custom domain, public privacy policy, terms, and support contact.
2. Publish clear Google/Microsoft data-use, retention, disconnect, and deletion behavior.
3. Add distributed rate limits to authentication, submission creation, and upload-session creation.
4. Add monitoring, provider-health visibility, alerts, and operational runbooks.
5. Add multi-user integration and browser tests, including attempts to cross account boundaries.
6. Use separate development and production provider applications and credentials.
7. Complete applicable OAuth branding and verification before public self-service registration.

## Later integrations

- Apple remains authentication-only unless Apple exposes an appropriate user-selected iCloud Drive
  API for third-party web applications.
- AWS S3 requires a separate credential or role-assumption design, validation of bucket access, and
  a provider-specific direct-upload feasibility and security review.
- Add other storage providers only after they satisfy explicit destination selection, least
  privilege, direct upload, provider acknowledgement, revocation, and observability requirements.
