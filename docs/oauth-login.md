# OAuth login setup

NexFlow supports Google and GitHub OAuth 2.0 login in addition to email/password authentication.

OAuth users are linked to the same NexFlow `User` and `Session` models used by password login. Provider access tokens are used only to read the verified identity during sign-in and are **not** persisted.

## Local URLs

Use the frontend at:

```text
http://localhost:5173
```

API:

```text
http://localhost:3000
```

Keep `localhost` consistent while testing OAuth. Do not open the frontend as `127.0.0.1:5173` while the configured OAuth callback uses `localhost`.

## Environment variables

Add these to `apps/api/.env`:

```text
WEB_ORIGIN="http://localhost:5173"
API_ORIGIN="http://localhost:3000"

GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET=""

GITHUB_CLIENT_ID="..."
GITHUB_CLIENT_SECRET=""
```

Never commit the client secrets.

## Google

Create an OAuth 2.0 **Web application** client in Google Cloud.

Use this authorized redirect URI exactly:

```text
http://localhost:3000/api/auth/oauth/google/callback
```

Copy the generated client ID and client secret into:

```text
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

NexFlow requests only the identity scopes required for login:

```text
openid email profile
```

Google login is accepted only when the returned profile includes a verified email address.

## GitHub

Create a GitHub **OAuth App**.

For local development:

```text
Homepage URL:
http://localhost:5173

Authorization callback URL:
http://localhost:3000/api/auth/oauth/github/callback
```

Copy the OAuth App credentials into:

```text
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

NexFlow requests:

```text
user:email
```

The backend uses GitHub's authenticated user and email APIs and accepts only a verified email address.

## Database migration

After pulling the OAuth implementation:

```powershell
cd apps/api
npx prisma migrate deploy
npx prisma generate
```

The migration:

- makes `User.passwordHash` optional for OAuth-only accounts
- adds `OAuthAccount`
- uniquely links provider identities to NexFlow users

If a verified Google or GitHub email matches an existing password account, the OAuth identity is linked to that existing NexFlow user rather than creating a duplicate user.

## Start NexFlow

API:

```powershell
cd apps/api
npm run start:dev
```

Frontend:

```powershell
cd apps/web
npm run dev
```

Then open:

```text
http://localhost:5173/login
```

Use **Continue with Google** or **Continue with GitHub**.

Successful OAuth login redirects to:

```text
http://localhost:5173/dashboard
```

## Production

For production, update both provider configurations to the deployed HTTPS callback URLs and set:

```text
WEB_ORIGIN="https://your-nexflow-domain.example"
API_ORIGIN="https://your-nexflow-domain.example"
NODE_ENV="production"
```

If the API is hosted on a different origin, `API_ORIGIN` must be that public API origin and its OAuth callback URL must exactly match the provider configuration.
