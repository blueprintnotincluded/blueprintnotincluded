# Replace WorkOS OAuth redirect with branded in-app auth

Replaces the WorkOS OAuth redirect flow with a fully in-app login experience. Users no longer leave the site to authenticate — all auth flows (password, magic link, registration, password reset) are handled by new branded Angular components backed by a new Express controller.

The old OAuth redirect routes (`/api/auth/workos`, `/api/auth/callback`, `/api/auth/exchange`) have been removed.

---

## What changed

### Backend

New `AuthController` (`app/api/auth-controller.ts`) with 6 POST endpoints, all added to the JWT bypass list:

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/login` | Password auth via WorkOS; returns `{ error: 'legacy_account' }` for DB-only users so the frontend can show a targeted migration hint |
| `POST /api/auth/register` | Creates WorkOS user + local record, writes `externalId` back |
| `POST /api/auth/send-magic` | Sends magic auth email; always 200 (no enumeration) |
| `POST /api/auth/verify-magic` | Exchanges magic code for JWT; runs full find/create/migrate user resolution |
| `POST /api/auth/forgot-password` | Triggers WorkOS password reset email; always 200 |
| `POST /api/auth/reset-password` | Resets password via WorkOS token |

The find/create/migrate logic from the existing OAuth callback is extracted into a shared `resolveLocalUser` helper and reused by `login` and `verify-magic`.

`WorkOSService` gains `authenticateWithPassword`, `authenticateWithMagicAuth`, and `resetPassword` methods.

Removed: `WorkOSAuthController`, OAuth redirect/callback/exchange routes, and the four `WorkOSService` methods that served them (`getAuthorizationUrl`, `extractSessionId`, `getLogoutUrl`, `authenticateWithCode`).

### Frontend

`AuthenticationService` gains a `LoginResult` discriminated union (`success | legacy_account | invalid_credentials`) and 6 new methods mapping to the new endpoints.

Six new components under `user-auth/`:

| Component | Route | Notes |
|---|---|---|
| `LoginPageComponent` | `/login` | Email + password; shows legacy migration hint inline only after a failed attempt |
| `RegisterPageComponent` | `/register` | Username + email + password |
| `ForgotPasswordComponent` | `/login/forgot` | No-enumeration confirmation message |
| `MagicRequestComponent` | `/login/magic` | Passwordless sign-in; pre-fills email from `?email=` (used by the legacy migration hint) |
| `MagicCallbackComponent` | `/auth/magic` | Spinner; exchanges `?code=&email=` params for JWT on load |
| `ResetPasswordComponent` | `/auth/reset-password` | Reads `?token=`; navigates to `/login?reset=1` on success so the login page can show a confirmation toast |

Removed: `AuthCallbackComponent` and the `auth/callback`, `auth/error` routes.

The navbar login button now routes to `/login` instead of redirecting to `/api/auth/workos`.

---

## Before merging — WorkOS dashboard actions required

### 1. Add redirect URIs to the allowlist

In the WorkOS dashboard → **Redirects** (under Authentication → Configuration), add these two URIs to the allowed list:

- `https://blueprintnotincluded.org/auth/magic`
- `https://blueprintnotincluded.org/auth/reset-password`

These are used by magic link emails and password reset emails respectively. WorkOS validates redirect URIs against the allowlist even when they are passed explicitly per-request.

### 2. Remove the old OAuth redirect URI

The old callback URI (`https://blueprintnotincluded.org/api/auth/callback`) is no longer used and can be removed from the allowlist.

### 3. Set SITE_URL in the production environment

The `SITE_URL` env var must be set to `https://blueprintnotincluded.org` so the backend passes the correct `redirectUri` when creating magic auth sessions. Without it, WorkOS falls back to its default redirect URI.

---

## Validate on staging

- [ ] Existing WorkOS user — password login
- [ ] Legacy DB-only user — migration hint + magic link hand-off
- [ ] Forgot password — reset email + token flow
- [ ] New registration (then log out and log back in)
- [ ] Magic link (request + callback)
