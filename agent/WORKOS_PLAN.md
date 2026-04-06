# WorkOS Integration Plan

## Current State

The `auth-workos` branch introduces WorkOS AuthKit as the primary authentication method. The current integration covers:

- **Login / OAuth flow** — `GET /api/auth/workos` → WorkOS → `GET /api/auth/callback`
- **User migration** — on callback, existing legacy users are linked to their WorkOS ID; new users are created
- **Self-service migration** — `POST /api/migration/migrate` lets a logged-in legacy user trigger a magic-link email
- **Admin status check** — `GET /api/migration/status` is gated behind `adminAuth` in `app/routes.ts`, which checks `req.user.role === 'admin'` on the JWT; no env var needed
- **Role plumbing** — after `authenticateWithCode`, the callback calls `WorkOSService.getPlatformRole(workosUser.id)` to check the user's membership in the platform org; the role slug is embedded in the JWT via `localUser.generateJwt(role)` in `app/api/models/user.ts`; role-bearing JWTs expire in 24 h (vs 7 days for regular users)
- **externalId write-back** — on each login the callback writes `localUser._id` to WorkOS as `externalId`, linking the two systems bidirectionally; for legacy-user migration the write-back happens *before* clearing the local password hash so a failed WorkOS write leaves credentials intact
- **One-time code exchange** — the OAuth callback no longer puts the JWT in the redirect URL; instead it issues a short-lived (60 s) single-use code and redirects to `/auth/callback?code=…`; the frontend calls `GET /api/auth/exchange?code=…` to obtain the JWT
- **Email verification gate** — legacy accounts are only linked/migrated when `workosUser.emailVerified` is true; unverified callbacks are rejected before touching local credentials
- **env vars** — `HOST` is the public-facing site URL; `BACKEND_HOST` is the server origin used for WorkOS redirect URI and switch-account login URL; `WORKOS_CLIENT_ID` and `BACKEND_HOST` are validated at call time in `WorkOSService` with descriptive errors
- **Atomic migration script** — `scripts/migrate-to-workos.ts` uses `updateOne` with a conditional filter instead of `document.save()`, preventing race-condition double-processing
- **Bulk WorkOS provisioning** — `scripts/provision-workos-users.ts` creates WorkOS accounts for all legacy MongoDB users (no password; users sign in via "forgot password" or magic link). Idempotent: re-running re-confirms existing accounts and repairs stale `workosUserId` links. If `WORKOS_PLATFORM_ORG_ID` is set, each user is also added to the platform org (existing memberships, including admin role, are left untouched).

---

## WorkOS Environment Strategy

WorkOS provides two isolated environments — **Staging** and **Production** — each with their own API keys, user databases, and org IDs. Because blueprintnotincluded uses a **single shared MongoDB database for both the staging and production websites**, the environment mapping is not straightforward: using two different WorkOS environments against the same DB would corrupt the `workosUserId` links (a Staging-environment ID and a Production-environment ID are different strings for the same human).

The solution is to split on the DB boundary, not the deployment boundary:

| Deployment | Database | WorkOS Environment |
|---|---|---|
| Local dev | Local dev DB | **Staging** |
| Staging website | Shared prod DB | **Production** |
| Production website | Shared prod DB | **Production** |

### Why this works

Local dev uses an isolated local database, so it is safe to point at WorkOS Staging. You get a full sandbox — auth flow, org membership checks, admin middleware — without creating real WorkOS Production users or polluting the shared DB.

The staging and production websites both use the shared DB, so they must both use WorkOS Production. Any `workosUserId` written to the DB by the staging site is immediately valid on the production site, and vice versa.

### Two platform orgs, one per WorkOS environment

You'll need the "Blueprint Platform" org to exist in **both** WorkOS environments:
- **Staging org** — for local dev testing; add yourself as admin here so `adminAuth` works locally
- **Production org** — the real one; used by both the staging site and the production site

Each org has its own ID. Your local `.env` carries the Staging org ID; the staging and production server configs carry the Production org ID.

### The migration happens on the staging site

Because the staging site uses WorkOS Production against the shared DB, running the migration there is running it for real. This is intentional — it lets you:
1. Verify the auth flow works end-to-end on a real deployment
2. Populate real WorkOS Production users (including linking yourself and assigning your admin role)
3. Confirm `GET /api/migration/status` returns correct counts
4. Fully validate everything before the production site is switched over

Deploying to production is then just enabling the new login path for production traffic — all the WorkOS data is already in place.

---

## Platform Organization

WorkOS User Management scopes roles to **organizations**. The approach is to create one internal organization — call it "Blueprint Platform" — that is never exposed to end users. Admins are members of this org. Everyone else is not.

Dashboard setup (do this in the **Production** environment):

1. **Organizations → Create organization** — name it "Blueprint Platform", slug e.g. `blueprint-platform`
2. **Roles** — the default `admin` and `member` roles are sufficient
3. **Users → Create user** — create yourself using your email address; set the **External ID** field to your MongoDB `_id` (see the `externalId` section below)
4. **Add that user to the org** with the `admin` role
5. Note the organization's ID (e.g. `org_01ABC...`) — this goes into `.env` as `WORKOS_PLATFORM_ORG_ID`

From this point, granting or revoking admin access is done entirely in the WorkOS dashboard under that organization's Members tab. No code changes, no deploys, no env var edits.

---

## How Roles Flow Into the App

When `authenticateWithCode` is called, WorkOS returns:

```
{
  user: { id, email, emailVerified, firstName, lastName, ... },
  accessToken: "<signed JWT>",
  organizationId?: string,   // set if the auth was org-scoped
  role?: string              // set if organizationId was present
}
```

The simplest approach for a platform-internal org (not user-facing) is to **check membership explicitly after authentication** rather than scoping the authorization URL to the org. This avoids surfacing the org concept to regular users at all.

After the `authenticateWithCode` call, add one WorkOS API call:

```typescript
static async getPlatformRole(workosUserId: string): Promise<string | null> {
  const workos = getWorkOSClient();
  const orgId = process.env.WORKOS_PLATFORM_ORG_ID;
  if (!orgId) return null;

  try {
    const memberships = await workos.userManagement.listOrganizationMemberships({
      userId: workosUserId,
      organizationId: orgId,
      statuses: ['active'],
    });
    return memberships.data[0]?.role.slug ?? null; // e.g. "admin" or "member"
  } catch {
    return null;
  }
}
```

This returns `"admin"` if the user is an active member of the platform org with that role, `null` otherwise. It is fast (one indexed lookup) and fails closed — any error returns `null`.

---

## JWT Changes

`UserJwt` grows one optional field:

```typescript
export interface UserJwt {
  _id: string;
  email: string;
  username: string;
  exp: number;
  role?: string;   // 'admin' | undefined — sourced from WorkOS platform org
}
```

`generateJwt()` on the User model needs to accept the role:

```typescript
userSchema.methods.generateJwt = function (role?: string): string {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 7);
  const payload: UserJwt = {
    _id: this._id,
    email: this.email!,
    username: this.username!,
    exp: expiry.getTime() / 1000,
    ...(role ? { role } : {}),
  };
  return jwt.sign(payload, process.env.JWT_SECRET as string);
};
```

In the WorkOS callback controller, the call becomes:

```typescript
const role = await WorkOSService.getPlatformRole(workosUser.id);
const token = localUser.generateJwt(role ?? undefined);
```

Legacy users logging in via `/api/login` never get a `role` field — they are not in WorkOS, so they cannot be admins.

---

## Admin Middleware (Final Form)

Replace the env-var check in `routes.ts` with a role check on the JWT:

```typescript
const adminAuth = (req: Request, res: Response, next: NextFunction) => {
  const user = req.user as UserJwt | undefined;
  if (user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};
```

No env var needed. Admin status follows the user's WorkOS org membership, which is tied to their immutable WorkOS user ID — immune to username or email changes and to squatting attacks.

---

## Other WorkOS Features Worth Using

### Email Verification
WorkOS tracks `emailVerified` on every user. Currently `getProfile` reads this and returns it, but it is not enforced anywhere. Consider rejecting API writes (blueprint uploads, likes) from unverified users. WorkOS can re-send verification emails via the dashboard or API.

### AuthKit Hosted UI
WorkOS provides a hosted, customizable login page (AuthKit) that handles the full auth UX — sign in, sign up, forgot password, MFA prompts, social login — without any frontend code. The current integration already redirects to it. Once legacy auth is fully retired, the custom `/login` frontend page can be deleted.

### Magic Auth / Passwordless
Already integrated in `MigrationController`. After migration is complete and legacy auth is retired, this becomes the fallback for users who forget their password — WorkOS handles the email delivery and link expiry.

### Audit Log (WorkOS Events)
WorkOS records every authentication event (login, logout, failed attempt, email change) in their dashboard under **Events**. You get this for free with no integration work. For admin actions within the app (e.g. viewing migration status, deleting blueprints), you can push custom events:

```typescript
await workos.events.createEvent({
  actor: { id: workosUserId, type: 'user' },
  targets: [{ id: targetId, type: 'user' }],
  action: 'blueprint.deleted',
  occurredAt: new Date(),
});
```

This creates a durable audit trail visible in the WorkOS dashboard.

### Multi-Factor Authentication
WorkOS supports TOTP and hardware keys, enforced at the org level. You can require MFA for platform org members (i.e. admins) in the WorkOS dashboard under the org's Auth Policy — no code change needed.

### Webhooks
WorkOS can POST to your server on events like `user.deleted`, `authentication.succeeded`, `organization_membership.updated`. Useful for keeping local state in sync if a user is removed from WorkOS (e.g. to revoke their local JWT before it expires).

---

## externalId — Bidirectional Link

WorkOS allows each user record to carry an `externalId` — a field you control, intended for your own internal identifier. Setting it to the local MongoDB `_id` creates a bidirectional reference: your DB already stores `workosUserId`, and WorkOS stores your `_id`.

This is not required for auth to work, but it pays off in two places:
- **Webhooks** — WorkOS webhook payloads include `externalId`, so you can resolve the local user without an extra DB query
- **Dashboard legibility** — each WorkOS user entry shows your MongoDB ID, making debugging and support easier

**For yourself (pre-created in the dashboard):** set the External ID field directly when creating your user record. No code needed.

**For everyone else (automated on first login):** update the callback in `workos-auth-controller.ts` to write `externalId` back to WorkOS after linking or creating the local user:

```typescript
// After localUser is resolved (migrated or newly created):
await WorkOSService.updateUser(workosUser.id, { externalId: localUser._id.toString() });
```

Add to `workos-service.ts`:

```typescript
static async updateUser(userId: string, attrs: { externalId?: string }) {
  const workos = getWorkOSClient();
  return workos.userManagement.updateUser({ userId, ...attrs });
}
```

This only needs to run once per user. If you want to avoid the extra write on every login, gate it: only call `updateUser` when the WorkOS user's `externalId` is not already set (check the `workosUser` object returned by `authenticateWithCode`).

---

## Migration Path

### Phase 0 — Dashboard setup (no code)

| Step | Action |
|------|--------|
| 0.1 | Create "Blueprint Platform" org in WorkOS **Staging** environment; note org ID |
| 0.2 | Create yourself as a WorkOS Staging user; set External ID to your local dev MongoDB `_id`; add to Staging org as `admin` |
| 0.3 | Create "Blueprint Platform" org in WorkOS **Production** environment; note org ID |
| 0.4 | Create yourself as a WorkOS Production user; set External ID to your shared-DB MongoDB `_id`; add to Production org as `admin` |
| 0.5 | Add Staging keys + Staging org ID to local `.env` |
| 0.6 | Add Production keys + Production org ID to staging/production server config |

### Phase 1 — Code changes (complete)

| Step | Action | Status |
|------|--------|--------|
| 1.1 | Add `updateUser` to `workos-service.ts` | ✅ done |
| 1.2 | Write `externalId` back to WorkOS in the auth callback | ✅ done |
| 1.3 | Implement `getPlatformRole` in `workos-service.ts` | ✅ done |
| 1.4 | Add `role` field to `UserJwt` | ✅ done |
| 1.5 | Pass role into `generateJwt` in the callback controller | ✅ done |
| 1.6 | Replace env-var `adminAuth` in `routes.ts` with role check | ✅ done |
| 1.7 | `ADMIN_USERNAMES` env var is not used — no `.env.sample` entry exists | ✅ done |

### Phase 2 — Validate locally

Test against WorkOS Staging + local DB. Confirm login, org membership check, admin role on `GET /api/migration/status`, and `externalId` being written back.

Run the provisioning script against your local DB to create WorkOS Staging accounts for all local legacy users:

```bash
npx ts-node scripts/provision-workos-users.ts --dry-run --verbose
npx ts-node scripts/provision-workos-users.ts --verbose
```

### Phase 3 — Migrate on staging site

Deploy to the staging site (WorkOS Production + shared DB). Run the provisioning script on the server to create WorkOS Production accounts for all existing users and add them to the platform org:

```bash
# Dry run first
WORKOS_API_KEY=sk_… WORKOS_CLIENT_ID=client_… WORKOS_PLATFORM_ORG_ID=org_… \
  npx ts-node scripts/provision-workos-users.ts --dry-run --verbose

# Apply
WORKOS_API_KEY=sk_… WORKOS_CLIENT_ID=client_… WORKOS_PLATFORM_ORG_ID=org_… \
  npx ts-node scripts/provision-workos-users.ts --verbose
```

After running: log in via the staging site, confirm `adminAuth` passes on `GET /api/migration/status`, and verify migration status counts.

### Phase 4 — Deploy to production

Merge and deploy. WorkOS Production already has all user accounts (from Phase 3). The shared DB already has `workosUserId` links. Production traffic flows through the new auth path with no further migration work needed.
