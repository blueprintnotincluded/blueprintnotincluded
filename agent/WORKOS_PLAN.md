# WorkOS Auth — Operational Reference

Status: **fully implemented and live.** All auth flows (password, magic link, registration
with email verification, password reset) run through branded in-app pages
(`frontend/src/app/module-blueprint/components/user-auth/`) backed by
`app/api/auth-controller.ts`. The old OAuth redirect flow is gone. Admin access is
role-based via the JWT (`adminAuth` in `app/routes.ts`), sourced from WorkOS platform-org
membership. This file keeps only the operational knowledge that is not derivable from code.

## Environment mapping

WorkOS has two isolated environments (Staging / Production) with separate user databases.
Because the staging and production **websites share one MongoDB database**, the split is on
the DB boundary, not the deployment boundary — otherwise `workosUserId` links written by one
environment would be invalid in the other:

| Deployment | Database | WorkOS Environment |
|---|---|---|
| Local dev | Local dev DB | **Staging** |
| Staging website | Shared prod DB | **Production** |
| Production website | Shared prod DB | **Production** |

## Admin roles

- One internal "Blueprint Platform" org exists in **each** WorkOS environment; its ID is in
  `WORKOS_PLATFORM_ORG_ID` (Staging org ID in local `.env`, Production org ID on servers).
- Granting/revoking admin = adding/removing the user in that org's Members tab in the WorkOS
  dashboard. No code change, no deploy.
- On login, `WorkOSService.getPlatformRole` checks membership; the role slug is embedded in
  the JWT (`generateJwt(role)`); role-bearing JWTs expire in 24 h vs 7 days.
- `adminAuth` middleware in `app/routes.ts` requires `role === 'admin'` — fails closed.

## Linking and migration

- Each WorkOS user carries `externalId` = local MongoDB `_id`; the local user stores
  `workosUserId`. Written back on login/registration.
- Legacy (DB-only) users: password login returns `{ error: 'legacy_account' }` so the
  frontend can steer them through migration; `POST /api/migration/migrate` and the
  find/create/migrate resolution in `auth-controller.ts` handle the actual linking.
- `npm run provision:workos` (`scripts/provision-workos-users.ts`) — idempotent bulk
  creation of WorkOS accounts for all legacy users; repairs stale links.
- `npm run migrate:workos` (`scripts/migrate-to-workos.ts`) — atomic per-user migration.
- `GET /api/migration/status` (admin-only) reports migrated/unmigrated counts.

## Next steps

- Monitor `GET /api/migration/status`; once all active users are migrated, retire the
  legacy path: `MigrationController` + `/api/migration/*` routes, the `legacy_account`
  login hint, and the `migrate:workos` / `provision:workos` scripts.
