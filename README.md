# Syrax

Multi-Modal Storage Gateway and Ephemeral Transfer Platform.

## Syrax Intake wedding pilot

Wedding guest-upload portal for connecting one approved Google account, selecting or creating a
Drive destination, generating a capability link, and receiving provider-confirmed guest images.

### Requirements

- Node.js 22 LTS
- npm
- PostgreSQL
- Google Cloud project configured per [`docs/google-drive-setup.md`](docs/google-drive-setup.md)

### Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and replace every placeholder. Generate secrets locally:

   ```bash
   openssl rand -base64 48
   openssl rand -base64 32
   ```

   Use first output for `ADMIN_SESSION_SECRET` and second output for
   `TOKEN_ENCRYPTION_KEY`. Never commit `.env.local` or generated values.

3. Create database schema:

   ```bash
   npm run db:migrate
   ```

4. Start app:

   ```bash
   npm run dev
   ```

5. Verify `http://localhost:3000/api/health`, then open `http://localhost:3000/admin`.

6. Connect the configured admin Google account, then select any writable Drive folder or create a
   new destination from the admin page.

### Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Real OAuth, Picker, PostgreSQL health, and device verification require local credentials and
infrastructure. Current status and remaining feasibility work live in
[`docs/feasibility-report.md`](docs/feasibility-report.md).
