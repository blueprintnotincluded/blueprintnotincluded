# Agent TODO - Blueprint Not Included

## Current Status
- **Phase**: Phase 2B - Mongoose upgrade (5.7.7 → 6.x → 7.x → 8.x)
- **Date**: 2026-04-01
- **Goal**: Systematically upgrade all dependencies to current stable versions with improved test coverage

## Immediate Priorities

### Test Coverage Improvements Needed
- [ ] **Blueprint API** - Current coverage is basic, needs:
  - [ ] Blueprint upload/validation tests
  - [ ] Image generation pipeline tests
  - [ ] Blueprint sharing/permissions tests
  - [ ] Error handling for malformed blueprints
  - [ ] Asset processing tests (generateIcons, generateGroups, etc.)

- [ ] **User Management** - Currently only has basic auth tests:
  - [ ] Password reset flow tests (email sending, token validation)
  - [ ] User profile management tests
  - [ ] Permission/role tests if applicable

- [ ] **Frontend Tests** - No current Angular tests found:
  - [ ] Component unit tests
  - [ ] Service tests
  - [ ] Integration tests for blueprint viewer
  - [ ] Multi-language support tests

### Bug Fixes Identified
- [x] **Blueprint API Date Casting Error** ✅ Fixed - date validation added before Mongoose query in `blueprint-controller.ts:297`

### Technical Debt & Improvements
- [x] **Testing Framework Decision** - ✅ Mocha + Chai (Mongoose recommendation, do not switch to Jest)
  - Coverage reporting can be added later via `nyc`

- [ ] **API Error Handling** - Standardize error responses
  - Current: Mix of different error formats
  - Improve: Consistent error response structure
  - Add: Error logging and monitoring

- [ ] **Database Validation** - Strengthen schema validation
  - Current: Basic Mongoose schemas
  - Add: Better validation rules
  - Add: Input sanitization

### Documentation Gaps
- [ ] **API Documentation** - No current API docs found
  - Add: OpenAPI/Swagger specification
  - Add: Request/response examples
  - Add: Authentication flow documentation

- [ ] **Developer Onboarding** - Improve setup instructions
  - Current: Basic README information
  - Add: Step-by-step local development setup
  - Add: Database setup and seeding instructions
  - Add: Troubleshooting guide

### Performance & Monitoring
- [ ] **Asset Generation Performance** - Canvas operations may be slow
  - Profile: Image generation pipeline
  - Optimize: Caching strategies
  - Monitor: Memory usage during batch operations

- [ ] **Database Queries** - Review for optimization opportunities
  - Analyze: Blueprint listing queries (pagination, filtering)
  - Add: Database indexes where needed
  - Monitor: Query performance

## Questions for Product Owner

1. **Test Coverage Priority**: Which areas should we focus on first for test coverage?
   - Blueprint upload/validation (core functionality)
   - User authentication (security critical)
   - Frontend components (user experience)

2. **Error Handling Standards**: What's the preferred error response format for the API?
   - Current mix of formats needs standardization
   - Should we follow a specific standard (JSON:API, RFC 7807, custom)?

3. **Asset Generation**: Are there performance requirements for the image generation pipeline?
   - Current Canvas-based system works but may be slow for batch operations
   - Any requirements for concurrent processing?

4. **Frontend Testing Strategy**: What level of frontend test coverage is desired?
   - Unit tests for components
   - Integration tests for user flows
   - E2E tests for critical paths

5. **Multi-language Support**: How thoroughly should we test the internationalization features?
   - Current support for English, Chinese, Russian, Korean
   - Need tests for translation loading and switching

## Upgrade Phases

### ✅ Phase 1A: Node.js 20
### ✅ Phase 1B: lib TypeScript 3.5.3 → 5.9.2, ES2020 target
### ✅ Phase 2A: Backend TypeScript 4.9.5 → 5.9.2, strict mode

### Phase 2B: Mongoose (next)
- Mongoose 5.7.7 → 6.x → 7.x → 8.x (incremental, test at each step)
- Remove `@types/mongoose` (built-in types from 6.x onwards)

### Phase 3: Express Framework
- Express 4.x → 5.x
- Middleware compatibility updates
- API endpoint testing

### Phase 4: Canvas & Asset Processing
- Canvas 2.6.1 → 3.x (Node.js 20 compatible)
- Asset generation pipeline testing
- Performance optimization

### Phase 5: Angular Frontend
- Angular 13 → 20 (incremental: 13→14→15→16→18→20)
- Component modernization
- Build system updates

### Phase 6: Final Optimization
- Security audit
- Performance testing
- Documentation completion

## CI Improvements
See `agent/CI_IMPROVEMENTS.md` for the full prioritized list. High-priority items:
- [ ] Tests never block deployment (publish.yml `if: always()`)
- [ ] Docker tag name mismatch (`vars.IMAGE_NAME` vs hardcoded `bni-deploy`)

## Alternative Security Measures (Post-CAPTCHA Removal)

With CAPTCHA removed as requested, consider implementing these alternative security measures:

### Immediate Security Improvements
- [ ] **Rate Limiting** - Implement request rate limiting for authentication endpoints
  - Tool: `express-rate-limit` package
  - Target: Login, registration, password reset endpoints
  - Configuration: 5 attempts per IP per minute

- [ ] **Account Lockout** - Temporary account lockout after failed login attempts  
  - Implementation: Track failed attempts in user model
  - Policy: Lock account for 15 minutes after 5 failed attempts
  - Reset: Clear attempts counter on successful login

- [ ] **Email Verification** - Require email verification for new accounts
  - Current: Users can register without email verification
  - Add: Email confirmation tokens and verification flow
  - Benefit: Reduces fake account creation

### Enhanced Authentication Security
- [ ] **Password Strength Validation** - Enforce stronger password requirements
  - Current: Basic required validation only
  - Add: Minimum length, complexity requirements
  - Tool: `zxcvbn` for password strength scoring

- [ ] **Session Security** - Improve JWT token management
  - Add: Token expiration and refresh mechanism
  - Add: Token blacklisting for logout
  - Consider: Shorter token lifetimes (1 hour vs current setup)

- [ ] **Login Anomaly Detection** - Monitor suspicious login patterns
  - Track: Login attempts by IP, time patterns
  - Alert: Multiple IPs for same account, unusual locations
  - Log: Authentication events for security monitoring

### Infrastructure Security
- [ ] **HTTPS Enforcement** - Ensure all traffic uses HTTPS in production
  - Current: HTTP allowed in development
  - Add: HTTPS redirect middleware
  - Add: Security headers (HSTS, CSRF protection)

- [ ] **Input Sanitization** - Strengthen input validation beyond current regex
  - Current: Basic username regex validation  
  - Add: Comprehensive input sanitization
  - Add: XSS protection for user-generated content

- [ ] **Monitoring & Logging** - Implement security event logging
  - Log: Failed login attempts, account creation, password changes
  - Monitor: Unusual patterns, potential attacks
  - Tool: Consider structured logging with correlation IDs

### Application-Level Protection
- [ ] **Content Security Policy** - Add CSP headers to prevent XSS
  - Implementation: Express middleware for CSP headers
  - Configuration: Restrict script sources, inline styles
  - Testing: Ensure blueprint viewer functionality works with CSP

- [ ] **API Request Validation** - Strengthen API input validation
  - Current: Basic validation exists but could be enhanced
  - Add: Schema validation for all API endpoints
  - Add: Request size limits to prevent DoS

### Rationale for CAPTCHA Alternative
These measures provide comprehensive protection while maintaining user experience:
- Rate limiting prevents automated attacks without user friction
- Account lockout stops brute force attempts
- Email verification reduces fake accounts
- Enhanced logging provides visibility into threats

## Session Notes
- Currently using Mocha + Chai (switched from Jest as recommended by Mongoose team)
- 16 tests passing, found 1 validation bug in Blueprint API
- Node.js 18.20.8 locally, targeting Node.js 20 for upgrade
- Test database setup working correctly
- **2025-10-13**: Removed CAPTCHA system completely per user request due to reported problems