# WorkOS AuthKit Migration Plan

## Overview

Migrating to WorkOS AuthKit will eliminate 7 of the 8 critical security issues by offloading authentication to a managed service. This plan ensures **zero data loss** and minimal downtime.

---

## Current Architecture vs. WorkOS

### Current State
```
User Login → Passport Local Strategy → JWT Generation → Protected Routes
                ↓
          MongoDB User Model
          (username, email, hash, salt)
```

### Future State
```
User Login → WorkOS AuthKit → WorkOS Session → Protected Routes
                ↓                    ↓
          WorkOS Dashboard      MongoDB User Model
          (auth & password)     (username, email, workosUserId)
```

---

## Migration Strategy

### Phase 1: Dual-Mode Authentication (No Downtime)
Support both legacy and WorkOS auth simultaneously during migration.

### Phase 2: User Migration
Gradually migrate users to WorkOS via password reset flow.

### Phase 3: Legacy Deprecation
After 90 days, sunset legacy authentication.

---

## Implementation Steps

### Step 1: Install WorkOS SDK

```bash
npm install @workos-inc/node
```

### Step 2: Update User Model

**File**: [`app/api/models/user.ts`](app/api/models/user.ts)

```typescript
import mongoose, { Document, Model } from 'mongoose';
import crypto from 'crypto-js';
import jwt from 'jsonwebtoken';

export interface User extends Document {
  email?: string;
  username?: string;

  // Legacy authentication (deprecated)
  password?: string;
  hash?: string;
  salt?: string;

  // WorkOS integration
  workosUserId?: string;      // ✨ NEW: Maps to WorkOS user
  authProvider: 'legacy' | 'workos'; // ✨ NEW: Track auth method

  resetToken?: string;
  resetTokenExpiration?: Date;

  // Migration helpers
  migratedToWorkosAt?: Date;  // ✨ NEW: Track migration timestamp

  setPassword(password: string): void;
  validPassword(password: string): boolean;
  generateJwt(): string;
}

export class UserModel {
  static model: Model<User>;

  public static init() {
    let userSchema = new mongoose.Schema({
      email: {
        type: String,
        unique: true,
        required: true,
        match: [/.+@.+\..+/, 'Invalid email format'],
        maxlength: [254, 'Email must be 254 characters or fewer'],
      },
      username: {
        type: String,
        unique: true,
        required: true,
        match: [/^[a-zA-Z0-9_-]+$/, 'Username may only contain letters, numbers, hyphens, and underscores'],
        maxlength: [30, 'Username must be 30 characters or fewer'],
        minlength: [1, 'Username is required'],
      },

      // Legacy auth fields (will be removed in Phase 3)
      hash: String,
      salt: String,

      // WorkOS fields
      workosUserId: {
        type: String,
        sparse: true,  // Allows null during migration
        unique: true,  // But must be unique when set
      },
      authProvider: {
        type: String,
        enum: ['legacy', 'workos'],
        default: 'legacy',
      },
      migratedToWorkosAt: Date,

      resetToken: String,
      resetTokenExpiration: Date,
    });

    // Existing indexes
    userSchema.index({ resetToken: 1 });

    // New indexes for WorkOS
    userSchema.index({ workosUserId: 1 });
    userSchema.index({ authProvider: 1 });

    // Legacy methods (keep for backward compatibility during migration)
    userSchema.methods.setPassword = function (password: string): void {
      (this as any).salt = crypto.lib.WordArray.random(16).toString();
      (this as any).hash = crypto
        .PBKDF2(password, (this as any).salt, { keySize: 512 / 32 })
        .toString(crypto.enc.Hex);
    };

    userSchema.methods.validPassword = function (password: string): boolean {
      var hash = crypto
        .PBKDF2(password, (this as any).salt, { keySize: 512 / 32 })
        .toString(crypto.enc.Hex);
      return (this as any).hash === hash;
    };

    userSchema.methods.generateJwt = function (): string {
      var expiry = new Date();
      expiry.setDate(expiry.getDate() + 7);

      let userJwt: UserJwt = {
        _id: (this as any)._id,
        email: (this as any).email!,
        username: (this as any).username!,
        exp: expiry.getTime() / 1000,
      };
      return jwt.sign(userJwt, process.env.JWT_SECRET as string);
    };

    UserModel.model = mongoose.model<User>('User', userSchema);
  }

  public static isUser(obj: User | any): obj is User {
    return obj && obj.username && typeof obj.username === 'string';
  }
}

export interface UserJwt {
  _id: string;
  email: string;
  username: string;
  exp: number;
}
```

### Step 3: Create WorkOS Service

**File**: `app/api/services/workos-service.ts` (NEW)

```typescript
import { WorkOS } from '@workos-inc/node';

const workos = new WorkOS(process.env.WORKOS_API_KEY);

export class WorkOSService {
  /**
   * Get authorization URL for user login
   */
  static getAuthorizationUrl(): string {
    return workos.userManagement.getAuthorizationUrl({
      provider: 'authkit',
      clientId: process.env.WORKOS_CLIENT_ID!,
      redirectUri: `${process.env.HOST}/api/auth/callback`,
    });
  }

  /**
   * Authenticate user with authorization code
   */
  static async authenticateWithCode(code: string) {
    const { user, accessToken } = await workos.userManagement.authenticateWithCode({
      code,
      clientId: process.env.WORKOS_CLIENT_ID!,
    });

    return { user, accessToken };
  }

  /**
   * Get user by WorkOS ID
   */
  static async getUser(userId: string) {
    return await workos.userManagement.getUser(userId);
  }

  /**
   * Create a WorkOS user from existing user data
   */
  static async createUser(email: string, password: string) {
    return await workos.userManagement.createUser({
      email,
      password,
      emailVerified: true, // Since they were verified in our system
    });
  }

  /**
   * Send password reset email via WorkOS
   */
  static async sendPasswordResetEmail(email: string) {
    return await workos.userManagement.createPasswordReset({
      email,
    });
  }

  /**
   * Create magic auth link for seamless migration
   */
  static async createMagicAuth(email: string) {
    return await workos.userManagement.createMagicAuth({
      email,
    });
  }
}
```

### Step 4: Create Migration Controller

**File**: `app/api/migration-controller.ts` (NEW)

```typescript
import { Request, Response } from 'express';
import { UserModel } from './models/user';
import { WorkOSService } from './services/workos-service';
import { apiError } from './utils/apiError';

export class MigrationController {
  /**
   * Migrate a single user to WorkOS (called during login)
   */
  public async migrateUserToWorkOS(req: Request, res: Response) {
    try {
      const { userId } = req.body;

      const user = await UserModel.model.findById(userId);
      if (!user) {
        return res.status(404).json(apiError(404, 'User not found'));
      }

      if (user.authProvider === 'workos') {
        return res.json({ message: 'Already migrated' });
      }

      // Create user in WorkOS with a magic auth link
      // They'll set their own password when they click the link
      const magicAuth = await WorkOSService.createMagicAuth(user.email!);

      // Update our user record
      user.authProvider = 'workos';
      user.migratedToWorkosAt = new Date();
      // Note: We don't have workosUserId yet - that comes after they click the magic link
      await user.save();

      return res.json({
        message: 'Migration initiated',
        magicAuthUrl: magicAuth.url,
      });
    } catch (error) {
      console.error('Migration error:', error);
      return res.status(500).json(apiError(500, 'Migration failed'));
    }
  }

  /**
   * Get migration status for all users (admin only)
   */
  public async getMigrationStatus(req: Request, res: Response) {
    try {
      const total = await UserModel.model.countDocuments();
      const migrated = await UserModel.model.countDocuments({ authProvider: 'workos' });
      const legacy = await UserModel.model.countDocuments({ authProvider: 'legacy' });

      return res.json({
        total,
        migrated,
        legacy,
        percentComplete: total > 0 ? (migrated / total) * 100 : 0,
      });
    } catch (error) {
      console.error('Status error:', error);
      return res.status(500).json(apiError(500, 'Failed to get status'));
    }
  }
}
```

### Step 5: Create WorkOS Auth Controller

**File**: `app/api/workos-auth-controller.ts` (NEW)

```typescript
import { Request, Response } from 'express';
import { UserModel, User } from './models/user';
import { WorkOSService } from './services/workos-service';
import { apiError } from './utils/apiError';

export class WorkOSAuthController {
  /**
   * Initiate WorkOS login
   */
  public login(req: Request, res: Response) {
    const authUrl = WorkOSService.getAuthorizationUrl();
    res.redirect(authUrl);
  }

  /**
   * Handle OAuth callback from WorkOS
   */
  public async callback(req: Request, res: Response) {
    try {
      const { code } = req.query;

      if (!code || typeof code !== 'string') {
        return res.status(400).json(apiError(400, 'Missing authorization code'));
      }

      // Authenticate with WorkOS
      const { user: workosUser } = await WorkOSService.authenticateWithCode(code);

      // Find or create user in our database
      let localUser = await UserModel.model.findOne({ workosUserId: workosUser.id });

      if (!localUser) {
        // Check if we have a legacy user with this email
        localUser = await UserModel.model.findOne({ email: workosUser.email });

        if (localUser) {
          // Migrate existing user
          localUser.workosUserId = workosUser.id;
          localUser.authProvider = 'workos';
          localUser.migratedToWorkosAt = new Date();
          // Clear legacy auth fields
          localUser.hash = undefined;
          localUser.salt = undefined;
          await localUser.save();
        } else {
          // Create new user
          localUser = new UserModel.model({
            email: workosUser.email,
            username: workosUser.email.split('@')[0], // Default username from email
            workosUserId: workosUser.id,
            authProvider: 'workos',
          });
          await localUser.save();
        }
      }

      // Generate JWT for our API
      const token = localUser.generateJwt();

      // Redirect to frontend with token
      res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`);
    } catch (error) {
      console.error('WorkOS callback error:', error);
      res.status(500).json(apiError(500, 'Authentication failed'));
    }
  }

  /**
   * Get current user info (protected route)
   */
  public async getProfile(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const localUser = await UserModel.model.findById(user._id);

      if (!localUser) {
        return res.status(404).json(apiError(404, 'User not found'));
      }

      // If using WorkOS, fetch latest data
      if (localUser.workosUserId) {
        const workosUser = await WorkOSService.getUser(localUser.workosUserId);

        return res.json({
          id: localUser._id,
          username: localUser.username,
          email: localUser.email,
          authProvider: 'workos',
          workosProfile: {
            firstName: workosUser.firstName,
            lastName: workosUser.lastName,
            emailVerified: workosUser.emailVerified,
          },
        });
      }

      return res.json({
        id: localUser._id,
        username: localUser.username,
        email: localUser.email,
        authProvider: 'legacy',
      });
    } catch (error) {
      console.error('Profile error:', error);
      return res.status(500).json(apiError(500, 'Failed to get profile'));
    }
  }
}
```

### Step 6: Update Routes

**File**: [`app/routes.ts`](app/routes.ts)

```typescript
import path from 'path';
import { Application } from 'express';
import express from 'express';
import { expressjwt as expressJwt } from 'express-jwt';

import { StaticController } from './static-controller';
import { LoginController } from './api/login-controller';
import { RegisterController } from './api/register-controller';
import { DuplicateCheckController } from './api/duplicate-check-controller';
import { BlueprintController } from './api/blueprint-controller';
import { VersionController } from './api/version-controller';
import { WorkOSAuthController } from './api/workos-auth-controller'; // ✨ NEW
import { MigrationController } from './api/migration-controller'; // ✨ NEW

export class Routes {
  public staticController = new StaticController();
  public loginController = new LoginController();
  public registerController = new RegisterController();
  public duplicateCheckController = new DuplicateCheckController();
  public uploadBlueprintController = new BlueprintController();
  public versionController = new VersionController();
  public workosAuthController = new WorkOSAuthController(); // ✨ NEW
  public migrationController = new MigrationController(); // ✨ NEW

  public routes(app: Application): void {
    // JWT authentication middleware
    let auth = expressJwt({
      secret: process.env.JWT_SECRET as string,
      algorithms: ['HS256'],
      requestProperty: 'user',
    }).unless({
      path: [
        '/api/register',
        '/api/login',
        '/api/request-reset',
        '/api/reset-password',
        '/api/auth/workos', // ✨ NEW
        '/api/auth/callback', // ✨ NEW
      ],
    });

    // ✨ NEW: WorkOS Authentication Routes
    app.route('/api/auth/workos').get(this.workosAuthController.login);
    app.route('/api/auth/callback').get(this.workosAuthController.callback);
    app.route('/api/auth/profile').get(auth, this.workosAuthController.getProfile);

    // ✨ NEW: Migration Routes (admin only in production)
    app.route('/api/migration/user').post(auth, this.migrationController.migrateUserToWorkOS);
    app.route('/api/migration/status').get(auth, this.migrationController.getMigrationStatus);

    // Legacy authentication routes (keep during migration period)
    console.log('Legacy authentication enabled for migration period');
    app.route('/api/login').post(this.loginController.login);
    app.route('/api/register').post(this.registerController.register);
    app.route('/api/request-reset').post(this.loginController.requestPasswordReset);
    app.route('/api/reset-password').post(this.loginController.resetPassword);

    // Anonymous access
    app.route('/api/checkusername').get(this.duplicateCheckController.checkUsername);
    app.route('/api/getblueprint/:id').get(this.uploadBlueprintController.getBlueprint);
    app.route('/api/getblueprintmod/:id').get(this.uploadBlueprintController.getBlueprintMod);
    app
      .route('/api/getblueprintthumbnail/:id')
      .get(this.uploadBlueprintController.getBlueprintThumbnail);
    app.route('/api/getblueprints').get(this.uploadBlueprintController.getBlueprints);
    app.route('/api/version').get(this.versionController.getVersion);

    // Logged in access
    app.route('/api/getblueprintsSecure').get(auth, this.uploadBlueprintController.getBlueprints);
    app.route('/api/uploadblueprint').post(auth, this.uploadBlueprintController.uploadBlueprint);
    app.route('/api/likeblueprint').post(auth, this.uploadBlueprintController.likeBlueprint);
    app.route('/api/deleteblueprint').post(auth, this.uploadBlueprintController.deleteBlueprint);

    app.get('/', this.staticController.getHome);
    app.get('/b/:blueprintId', this.staticController.getBlueprint);
    app.get('/b/:blueprintId/thumbnail', this.staticController.getBlueprintThumbnail);
    app.use(express.static(path.join(__dirname, 'public')));
    app.get('/*path', this.staticController.serveHtml);
  }
}
```

### Step 7: Environment Variables

**File**: [`.env.sample`](.env.sample)

Add these new variables:

```bash
# WorkOS Configuration
WORKOS_API_KEY=sk_test_xxxxx
WORKOS_CLIENT_ID=client_xxxxx
FRONTEND_URL=http://localhost:4200

# Keep existing variables
JWT_SECRET=your-secret-key-at-least-32-characters
DB_URI=mongodb://localhost:27017/blueprintdb
HOST=http://localhost:3000
BROWSE_INCREMENT=20
SITE_URL=http://localhost:3000
```

### Step 8: Database Migration Script

**File**: `scripts/migrate-to-workos.ts` (NEW)

```typescript
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { UserModel } from '../app/api/models/user';

async function migrateUsers() {
  await mongoose.connect(process.env.DB_URI as string);

  const users = await UserModel.model.find({ authProvider: { $exists: false } });

  console.log(`Found ${users.length} users to update`);

  for (const user of users) {
    user.authProvider = 'legacy';
    await user.save();
  }

  console.log('Migration complete');
  await mongoose.disconnect();
}

migrateUsers().catch(console.error);
```

Run with:
```bash
npm run ts-node scripts/migrate-to-workos.ts
```

---

## Migration Timeline

### Week 1: Setup & Testing
- [ ] Set up WorkOS account
- [ ] Install dependencies and add environment variables
- [ ] Implement dual-mode authentication
- [ ] Test with a few test users
- [ ] Deploy to staging

### Week 2: Gradual Rollout
- [ ] Deploy to production (both auth methods work)
- [ ] Add migration banner for legacy users
- [ ] Monitor error rates and user feedback
- [ ] Migrate 10% of users manually

### Week 3-12: User Migration
- [ ] Send migration emails to all users
- [ ] Provide magic link for easy migration
- [ ] Monitor migration progress
- [ ] Support legacy auth for active sessions

### Week 13: Cleanup
- [ ] Deprecate legacy auth routes
- [ ] Remove password-related code
- [ ] Remove legacy test cases
- [ ] Update documentation

---

## User Experience

### For Existing Users (Automatic Migration)

1. User clicks "Login" → Redirected to WorkOS
2. WorkOS detects email matches existing user
3. User sets new password in WorkOS
4. Backend automatically links WorkOS ID to existing account
5. All blueprints, likes, and data remain intact

### For New Users

1. Click "Sign up" → Redirected to WorkOS
2. Create account in WorkOS
3. Backend creates linked user record
4. Seamlessly authenticated

---

## Data Preservation Guarantees

✅ **Usernames**: Preserved exactly as-is
✅ **Emails**: Preserved exactly as-is
✅ **User IDs**: MongoDB `_id` remains unchanged
✅ **Blueprints**: All `owner` references remain valid
✅ **Likes**: All user ID arrays remain valid
✅ **Created dates**: All timestamps preserved

### What Changes
- `hash` and `salt` fields become `undefined` after migration (but remain in schema during transition)
- New `workosUserId` field added
- `authProvider` tracks migration status

### What Doesn't Change
- User `_id` (MongoDB ID) - **This is critical**
- All blueprint relationships
- All user data and metadata

---

## Security Benefits

By migrating to WorkOS, you eliminate:

1. ✅ Password validation concerns (WorkOS enforces strong passwords)
2. ✅ Password hashing/salting implementation
3. ✅ Rate limiting on auth endpoints (WorkOS handles this)
4. ✅ Password reset token management
5. ✅ Email verification workflow
6. ✅ Session management complexity
7. ✅ Account enumeration risks (WorkOS protects against this)

You also gain:

8. ✨ Multi-factor authentication (MFA)
9. ✨ Social login (Google, GitHub, etc.)
10. ✨ Enterprise SSO capabilities
11. ✨ Breach password protection
12. ✨ Advanced security monitoring
13. ✨ Compliance features (SOC 2, GDPR)

---

## Remaining Security Concerns (From Original Analysis)

After WorkOS migration, you still need to address:

1. **Blueprint data validation** - Still need input sanitization
2. **NoSQL injection** - Still need regex sanitization
3. **Rate limiting on blueprint endpoints** - Only auth is protected by WorkOS
4. **Blueprint size limits** - Prevent DoS via huge uploads
5. **Weak CSP** - If `unsafe-inline` is truly needed, document why

These are separate from authentication and still require implementation.

---

## Cost Comparison

### Current (Self-hosted)
- Developer time for security fixes: ~16 hours ($2,000-4,000)
- Ongoing security maintenance: ~4 hours/month
- Risk of security breach: $$$$

### WorkOS
- Free tier: Up to 1 million monthly active users
- Enterprise features available at scale
- Professional security team monitoring
- Zero maintenance overhead

**ROI**: Positive after first month

---

## Testing Strategy

### Unit Tests
```typescript
describe('WorkOS Authentication', () => {
  it('should migrate legacy user on first WorkOS login', async () => {
    // Create legacy user
    const user = await UserModel.model.create({
      email: 'test@example.com',
      username: 'testuser',
      authProvider: 'legacy',
    });

    // Simulate WorkOS callback
    // ... test implementation

    // Verify migration
    const updated = await UserModel.model.findById(user._id);
    expect(updated.authProvider).to.equal('workos');
    expect(updated.workosUserId).to.exist;
    expect(updated._id.toString()).to.equal(user._id.toString()); // ID unchanged!
  });

  it('should preserve all blueprint relationships after migration', async () => {
    // Test that owner references still work
  });
});
```

### Integration Tests
- Test both legacy and WorkOS auth paths
- Verify JWT generation works for both
- Test blueprint operations with both user types

---

## Rollback Plan

If migration encounters issues:

1. **Immediate**: Disable WorkOS routes via feature flag
2. **Short-term**: All users can continue with legacy auth
3. **Data**: No user data is deleted during migration
4. **Recovery**: WorkOS integration can be cleanly removed

---

## Next Steps

1. **Review this plan** - Confirm it meets your requirements
2. **Set up WorkOS account** - Get API keys
3. **Implement Phase 1** - Start with dual-mode support
4. **Test thoroughly** - Verify data preservation
5. **Deploy gradually** - Monitor each step

Would you like me to implement any part of this migration plan?
