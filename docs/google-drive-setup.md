# Google Drive pilot setup

No credentials belong in this document or repository.

## Google Cloud

1. Create dedicated Google Cloud project for wedding pilot.
2. Enable Google Drive API and Google Picker API.
3. Configure OAuth consent screen. Keep app in testing mode during development and add host Google
   account as test user.
4. Declare only these app scopes:
   - `https://www.googleapis.com/auth/drive.file`
   - `openid`
   - `email`
   - `profile`
5. Create OAuth client with application type **Web application**.
6. Add local redirect URI exactly:
   `http://localhost:3000/api/auth/google/callback`.
7. Create API key for Picker. Restrict it to Google Picker API and approved HTTP referrers, including
   local and production origins.
8. Copy numeric project number, not project ID, into `GOOGLE_CLOUD_PROJECT_NUMBER`.
9. Create existing Drive folder named exactly `TJWeddingGuestUpload` in approved host account.

## Local environment

Populate `.env.local` from `.env.example`. `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, Picker API
key, and project number must come from same Google Cloud project. `ADMIN_EMAIL` must match normalized
email returned by Google.

## Verification flow

1. Run migration and app.
2. Confirm `/api/health` returns HTTP 200 with `database: "ok"`.
3. Open `/admin`; connect configured account.
4. Confirm Google consent includes `drive.file`, not broad `drive` scope.
5. On `/admin/destination`, open Picker and deliberately choose existing
   `TJWeddingGuestUpload` folder.
6. Confirm page shows `ACTIVE`, expected name, and verification timestamp.
7. Inspect structured logs. They must not contain authorization code, access token, refresh token,
   cookies, or selected folder ID.
8. Inspect database using trusted admin tooling. `drive_connections.encrypted_refresh_token` must be
   versioned ciphertext. `drive_destinations.provider_folder_id` must contain immutable selected ID.

## Reconnection

Use **Reconnect Google account** on destination page. Existing encrypted refresh token is retained
if Google omits a new token. Revoked/invalid credentials mark connection `ERROR`; reconnect before
retrying Picker.

## Official references checked 2026-08-07

- [OAuth 2.0 for web server applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [OAuth security best practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)
- [Choose Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Google Picker web sample](https://developers.google.com/workspace/drive/picker/guides/web-picker-sample)
- [Select folder with DocsView](https://developers.google.com/workspace/drive/picker/reference/picker.docsview.setselectfolderenabled)
- [Drive file resource and capabilities](https://developers.google.com/workspace/drive/api/reference/rest/v3/files)
- [Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads)
