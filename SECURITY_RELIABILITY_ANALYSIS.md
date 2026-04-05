# Backend Security and Reliability Analysis

## Executive Summary

The backend API is well-structured and reasonably secure, but several improvements can enhance security and reliability significantly. This analysis prioritizes **security** and **reliability** concerns.

---

## 🔴 Critical Security Issues

### 1. Missing Password Strength Requirements
**Location**: [`app/api/register-controller.ts`](app/api/register-controller.ts:18)

**Issue**: No minimum password length or complexity validation during registration.

**Risk**: Weak passwords make accounts vulnerable to brute force attacks.

**Current Code**:
```typescript
let password = req.body.password;
// No password validation here
user.setPassword(password);
```

**Recommendation**:
```typescript
if (!password || password.length < 8) {
  res.status(400).json(apiError(400, 'Password must be at least 8 characters'));
  return;
}
```

---

### 2. Hardcoded JWT Secret Reliance
**Location**: [`app/api/models/user.ts`](app/api/models/user.ts:71)

**Issue**: No validation that JWT_SECRET exists or is sufficiently strong at startup.

**Risk**: Missing or weak secrets compromise all authentication.

**Recommendation**: Add startup validation in [`app/server.ts`](app/server.ts:1):
```typescript
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be at least 32 characters');
  process.exit(1);
}
```

---

### 3. Username Enumeration Vulnerability
**Location**: [`app/api/duplicate-check-controller.ts`](app/api/duplicate-check-controller.ts:13)

**Issue**: Anonymous endpoint allows checking if usernames exist, enabling account enumeration.

**Risk**: Attackers can build lists of valid usernames for targeted attacks.

**Current Implementation**:
```typescript
public async checkUsername(req: Request, res: Response) {
  const users = await UserModel.model.find({ username: req.query.username as string });
  if (users.length) {
    res.json({ usernameExists: true });
  } else {
    res.json({ usernameExists: false });
  }
}
```

**Recommendation**: Rate limit this endpoint aggressively or move it to authenticated context only.

---

### 4. Missing Rate Limiting
**Location**: [`app/routes.ts`](app/routes.ts:32-35), all authentication endpoints

**Issue**: No rate limiting on login, register, or password reset endpoints.

**Risk**:
- Brute force password attacks
- Account enumeration
- Email flooding via password reset

**Recommendation**: Implement express-rate-limit:
```typescript
import rateLimit from 'express-rate-limit';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: { errors: [{ status: '429', title: 'Too many attempts, please try again later' }] }
});

app.route('/api/login').post(authLimiter, this.loginController.login);
app.route('/api/register').post(authLimiter, this.registerController.register);
app.route('/api/request-reset').post(authLimiter, this.loginController.requestPasswordReset);
```

---

### 5. Weak Content Security Policy
**Location**: [`app/app.ts`](app/app.ts:84-86)

**Issue**: `'unsafe-inline'` and `'unsafe-eval'` in CSP weakens XSS protection.

**Current Code**:
```typescript
'script-src': [
  "'self'",
  "'unsafe-inline'",  // ❌ Allows inline scripts
  "'unsafe-eval'",    // ❌ Allows eval()
  // ...
],
```

**Risk**: Reduces effectiveness of CSP as XSS defense.

**Recommendation**: Use nonces for inline scripts or move scripts external. If absolutely required, document why it's needed.

---

### 6. Potential NoSQL Injection
**Location**: [`app/api/blueprint-controller.ts`](app/api/blueprint-controller.ts:337)

**Issue**: User input directly used in MongoDB query without sanitization.

**Current Code**:
```typescript
filterName = req.query.filterName as string;
// ...
if (filterName != null) filter.$and.push({ name: { $regex: filterName, $options: 'i' } });
```

**Risk**: Malicious regex patterns could cause ReDoS or unintended matches.

**Recommendation**: Sanitize regex special characters:
```typescript
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

if (filterName != null) {
  const sanitized = escapeRegex(filterName);
  filter.$and.push({ name: { $regex: sanitized, $options: 'i' } });
}
```

---

### 7. Missing Password Validation on Reset
**Location**: [`app/api/login-controller.ts`](app/api/login-controller.ts:81)

**Issue**: Password reset doesn't validate new password strength.

**Current Code**:
```typescript
user.setPassword(newPassword);
```

**Risk**: Users can reset to weak passwords.

**Recommendation**: Apply same validation as registration.

---

### 8. Duplicate Password Reset Logic
**Location**: [`app/api/auth.ts`](app/api/auth.ts:43-65)

**Issue**: Password reset endpoint defined in `auth.ts` but not used (route uses `login-controller.ts` version).

**Risk**: Dead code creates confusion and potential security issues if accidentally enabled.

**Recommendation**: Remove unused code from [`auth.ts`](app/api/auth.ts:43-65).

---

## 🟡 High Priority Reliability Issues

### 9. Missing Environment Variable Validation
**Location**: [`app/server.ts`](app/server.ts:1), [`app/app.ts`](app/app.ts:1)

**Issue**: Required environment variables are not validated at startup.

**Risk**: Application starts but fails at runtime with cryptic errors.

**Recommendation**: Add startup validation:
```typescript
const requiredEnvVars = [
  'JWT_SECRET',
  'DB_URI',
  'HOST',
  'BROWSE_INCREMENT',
  'SITE_URL'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Required environment variable ${envVar} is not set`);
    process.exit(1);
  }
}
```

---

### 10. Synchronous File Read Blocks Startup
**Location**: [`app/app.ts`](app/app.ts:31)

**Issue**: `fs.readFileSync` blocks event loop during initialization.

**Current Code**:
```typescript
let rawdata = fs.readFileSync('assets/database/database.json').toString();
```

**Risk**: Large files delay startup; errors crash immediately without graceful handling.

**Recommendation**: Make async with error handling:
```typescript
async init() {
  try {
    const rawdata = await fs.promises.readFile('assets/database/database.json', 'utf8');
    const json = JSON.parse(rawdata);
    // ... rest of initialization
  } catch (error) {
    console.error('Failed to load database.json:', error);
    process.exit(1);
  }
}
```

---

### 11. No Database Connection Retry Logic
**Location**: [`app/api/db.ts`](app/api/db.ts:10)

**Issue**: Single connection attempt, no retry on failure.

**Current Code**:
```typescript
mongoose.connect(process.env.DB_URI as string).catch(reason => {
  if (process.env.NODE_ENV !== 'test') {
    console.log('Mongoose connection error: ' + reason);
  }
});
```

**Risk**: Transient network issues prevent startup.

**Recommendation**: Implement exponential backoff retry:
```typescript
async function connectWithRetry(maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await mongoose.connect(process.env.DB_URI as string);
      console.log('Database connected successfully');
      return;
    } catch (error) {
      const delay = Math.min(1000 * Math.pow(2, i), 10000);
      console.log(`Connection attempt ${i + 1} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  console.error('Failed to connect to database after maximum retries');
  process.exit(1);
}
```

---

### 12. Inconsistent Error Handling
**Location**: Multiple controllers

**Issue**: Empty catch blocks and inconsistent error responses.

**Examples**:
- [`blueprint-controller.ts:125`](app/api/blueprint-controller.ts:125) - catch without error parameter
- [`blueprint-controller.ts:175`](app/api/blueprint-controller.ts:175) - catch without error parameter

**Risk**: Silent failures make debugging difficult.

**Recommendation**: Always log caught errors and provide consistent responses:
```typescript
catch (error) {
  console.error('deleteBlueprint error:', error);
  res.status(500).json(apiError(500, 'Failed to delete blueprint'));
}
```

---

### 13. Missing Input Validation
**Location**: [`app/api/blueprint-controller.ts`](app/api/blueprint-controller.ts:25)

**Issue**: TODO comments indicate missing validation.

**Current Code**:
```typescript
// TODO input checks here
let user = req.user as UserJwt;
let ownerId = user._id;
let name = req.body.name;
let data = req.body.blueprint;
```

**Risk**: Malformed blueprint data could crash the application or corrupt database.

**Recommendation**: Validate blueprint structure:
```typescript
if (!data || typeof data !== 'object') {
  res.status(400).json(apiError(400, 'Invalid blueprint data'));
  return;
}

if (!thumbnail || !thumbnail.startsWith('data:image/png;base64,')) {
  res.status(400).json(apiError(400, 'Invalid thumbnail format'));
  return;
}

// Validate thumbnail size (prevent DoS via huge images)
const base64Data = thumbnail.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
const sizeInBytes = (base64Data.length * 3) / 4;
if (sizeInBytes > 500000) { // 500KB limit
  res.status(400).json(apiError(400, 'Thumbnail too large (max 500KB)'));
  return;
}
```

---

### 14. Hardcoded Port
**Location**: [`app/server.ts`](app/server.ts:9)

**Issue**: Port 3000 is hardcoded.

**Current Code**:
```typescript
const PORT = 3000;
```

**Risk**: Deployment conflicts and inflexibility.

**Recommendation**:
```typescript
const PORT = parseInt(process.env.PORT || '3000', 10);
```

---

### 15. Race Condition in Blueprint Updates
**Location**: [`app/api/blueprint-controller.ts`](app/api/blueprint-controller.ts:46-61)

**Issue**: No optimistic locking or version checking.

**Risk**: Concurrent updates can overwrite each other.

**Recommendation**: Use Mongoose versioning or implement optimistic locking:
```typescript
blueprintSchema.set('versionKey', '__v'); // Enable versioning

// In update logic:
const result = await BlueprintModel.model.findOneAndUpdate(
  { _id: blueprintId, __v: expectedVersion },
  { $set: updates, $inc: { __v: 1 } },
  { new: true }
);

if (!result) {
  res.status(409).json(apiError(409, 'Blueprint was modified by another user'));
  return;
}
```

---

## 🟢 Code Quality Improvements

### 16. Inconsistent Null Checks
**Examples**:
- [`blueprint-controller.ts:95`](app/api/blueprint-controller.ts:95): `blueprintDelete.blueprintId == null`
- [`blueprint-controller.ts:139`](app/api/blueprint-controller.ts:139): `blueprintLike.blueprintId == null`
- [`static-controller.ts:72`](app/static-controller.ts:72): `!locals || typeof locals === 'function'`

**Recommendation**: Use consistent strict equality (`===` and `!==`) throughout:
```typescript
if (blueprintDelete.blueprintId === undefined || user === undefined) {
```

---

### 17. Unused Import and Dead Code
**Location**: [`app/api/blueprint-controller.ts`](app/api/blueprint-controller.ts:6-11)

**Issue**: Many commented-out imports suggest incomplete refactoring.

**Recommendation**: Remove unused imports and commented code to improve clarity.

---

### 18. Missing Query Parameter Validation
**Location**: [`app/api/blueprint-controller.ts`](app/api/blueprint-controller.ts:340)

**Issue**: `BROWSE_INCREMENT` parsed but not validated.

**Current Code**:
```typescript
let browseIncrement = parseInt(process.env.BROWSE_INCREMENT as string);
```

**Risk**: NaN if environment variable is invalid, causing unexpected behavior.

**Recommendation**:
```typescript
const browseIncrement = parseInt(process.env.BROWSE_INCREMENT || '20', 10);
if (isNaN(browseIncrement) || browseIncrement < 1 || browseIncrement > 100) {
  throw new Error('Invalid BROWSE_INCREMENT configuration');
}
```

---

## Test Coverage Analysis

### Strengths
- Good coverage of authentication flows including edge cases
- Blueprint CRUD operations well-tested
- Password reset flow thoroughly tested

### Gaps
1. No tests for rate limiting (because it doesn't exist yet)
2. No tests for malformed blueprint data
3. No tests for concurrent update scenarios
4. No tests for regex injection in filterName
5. No tests for environment variable validation

---

## Priority Implementation Order

### Phase 1: Critical Security (Implement Immediately)
1. ✅ Add password strength validation
2. ✅ Add rate limiting to auth endpoints
3. ✅ Validate JWT_SECRET at startup
4. ✅ Sanitize regex input in filterName

### Phase 2: High Priority Reliability (Implement Soon)
5. ✅ Add environment variable validation
6. ✅ Implement database connection retry logic
7. ✅ Add blueprint data validation
8. ✅ Make file reading async

### Phase 3: Code Quality (Implement When Possible)
9. ✅ Remove duplicate password reset code
10. ✅ Standardize error handling
11. ✅ Fix inconsistent null checks
12. ✅ Add thumbnail size validation

---

## Example: Enhanced Register Controller

Here's a refactored version of [`register-controller.ts`](app/api/register-controller.ts) incorporating security improvements:

```typescript
import { Request, Response } from 'express';
import { UserModel } from './models/user';
import mongoose from 'mongoose';
import { apiError } from './utils/apiError';

export class RegisterController {
  public register(req: Request, res: Response) {
    console.log('Received registration from ' + req.clientIp);

    if (mongoose.connection.readyState === 0) {
      console.log('MongoDb is not ready');
      res.status(503).json(apiError(503, 'Database unavailable'));
      return;
    }

    const { username, email, password } = req.body;

    // Validate required fields
    if (!username || !email || !password) {
      res.status(400).json(apiError(400, 'Username, email, and password are required'));
      return;
    }

    // Validate username format
    const usernameRegexp = /^[a-zA-Z0-9-_]+$/;
    if (!usernameRegexp.test(username) || username.length > 30 || username.length < 1) {
      console.log('Invalid username format');
      res.status(400).json(apiError(400, 'Username must be 1–30 alphanumeric characters (hyphens and underscores allowed)'));
      return;
    }

    // Validate email format
    const emailRegexp = /.+@.+\..+/;
    if (!emailRegexp.test(email) || email.length > 254) {
      res.status(400).json(apiError(400, 'Invalid email address'));
      return;
    }

    // ✨ NEW: Validate password strength
    if (password.length < 8) {
      res.status(400).json(apiError(400, 'Password must be at least 8 characters'));
      return;
    }

    // ✨ NEW: Check password complexity (at least one letter and one number)
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      res.status(400).json(apiError(400, 'Password must contain at least one letter and one number'));
      return;
    }

    const user = new UserModel.model();
    user.email = email;
    user.username = username;
    user.setPassword(password);

    user
      .save()
      .then(() => {
        console.log('Registration successful');
        res.json({ token: user.generateJwt() });
      })
      .catch((error: any) => {
        console.log('Registration error:', error);

        if (error.code === 11000) {
          res.status(409).json(apiError(409, 'Username or email already in use'));
        } else {
          res.status(500).json(apiError(500, 'Registration failed'));
        }
      });
  }
}
```

---

## Conclusion

The API has a solid foundation with good test coverage, but implementing the critical security improvements (rate limiting, password validation, input sanitization) should be prioritized immediately. The reliability improvements will make the application more robust in production environments.

**Estimated Implementation Time**:
- Phase 1 (Critical): 4-6 hours
- Phase 2 (High Priority): 6-8 hours
- Phase 3 (Code Quality): 4-6 hours

**Total**: ~2 days of focused development work.
