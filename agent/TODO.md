# Agent TODO - Blueprint Not Included

## Current Status
- **Phase**: Phase 4 - Canvas upgrade (2.x → 3.x)
- **Date**: 2026-04-01
- **Stack**: Node 20.18.0 · TypeScript 5.9.2 strict · Mongoose 8.18.1 · Express 5.1.0 · Canvas 2.11.2 · Angular 13.1.1
- **Tests**: 108 passing (Mocha + Chai — do not switch to Jest)

## Upgrade Phases

### Phase 4: Canvas & Asset Processing (next)
- Canvas 2.11.2 → 3.x (Node.js 20 compatible)
- `package.json` declared version is still `^2.6.1` — bump the declared version too
- Asset generation pipeline testing
- Performance optimization

### Phase 5: Angular Frontend
- Angular 13 → 20 (incremental: 13→14→15→16→18→20; skip 17)
- Component modernization
- Build system updates

### Phase 6: Final Optimization
- Security audit
- Performance testing
- Documentation completion

## Security (Post-CAPTCHA Removal)

CAPTCHA removed 2025-10-13 per user request. Remaining measures to implement:

- [ ] **Rate Limiting** — `express-rate-limit` on login, registration, password reset (5 req/min/IP)
- [ ] **Account Lockout** — track failed attempts in user model; lock 15 min after 5 failures
- [ ] **Email Verification** — require email confirmation for new registrations
- [ ] **Password Strength** — enforce complexity; consider `zxcvbn`
- [ ] **JWT Hardening** — add expiration, refresh mechanism, and logout blacklisting
- [ ] **HTTPS Enforcement** — HTTPS redirect middleware + HSTS header in production
- [ ] **Input Sanitization** — strengthen beyond current username regex; XSS protection for user content
- [ ] **Security Logging** — structured log for auth events (failed logins, registrations, password changes)
- [ ] **Login Anomaly Detection** — alert on multi-IP patterns, unusual frequency

## Test Coverage Gaps

- [ ] **Blueprint API** — upload/validation, image generation pipeline, sharing/permissions, malformed input errors
- [ ] **User Management** — password reset flow, user profile management
- [ ] **Asset Processing** — generateIcons, generateGroups pipeline tests
- [ ] **Frontend** — no Angular tests exist; component units, service tests, blueprint viewer integration

## Technical Debt

- [ ] **API Error Handling** — standardize response format across all endpoints (currently mixed)
- [ ] **Database Validation** — strengthen Mongoose schema validation; add input sanitization layer
- [ ] **Database Query Review** — audit blueprint listing queries for missing indexes and pagination efficiency
- [ ] **API Documentation** — no OpenAPI/Swagger spec exists

## Questions for Product Owner

1. **Test Coverage Priority**: Blueprint upload/validation vs user auth vs frontend components — where first?
2. **Error Handling Standard**: JSON:API, RFC 7807, or custom format for API error responses?
3. **Asset Generation Performance**: Any throughput or concurrency requirements for image generation?
4. **Frontend Testing**: Unit, integration, or E2E — what level is desired?
5. **i18n Testing**: How thoroughly should English/Chinese/Russian/Korean switching be tested?

## CI Notes
All improvements complete — see `agent/CI_IMPROVEMENTS.md`.
MongoDB health check uses legacy `mongo` CLI (fine for current `mongo:4.2` image); upgrade health check to `mongosh` when upgrading the MongoDB image.
