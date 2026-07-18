import { Request, Response } from 'express';
import { UserModel } from './models/user';
import { WorkOSService } from './services/workos-service';
import { apiError } from './utils/apiError';
import { AvatarService } from './services/avatar-service';

/**
 * Find a unique username by appending incrementing counters.
 * Exported for testing.
 */
export async function generateUniqueUsername(
  baseUsername: string,
  findOne: (username: string) => Promise<unknown>,
  maxAttempts = 1000,
): Promise<string> {
  let username = baseUsername;
  let counter = 1;
  while (await findOne(username)) {
    if (counter > maxAttempts) {
      throw new Error(`Could not generate a unique username for email prefix "${baseUsername}" after ${maxAttempts} attempts`);
    }
    username = `${baseUsername}${counter}`;
    counter++;
  }
  return username;
}

/**
 * Resolve a WorkOS user to a local user record.
 * Handles three cases:
 *   1. Existing WorkOS-linked user → return it
 *   2. Existing legacy user with matching email → migrate and return it
 *   3. No local user → create one
 */
async function resolveLocalUser(workosUser: {
  id: string;
  email: string;
  emailVerified: boolean;
  externalId?: string | null;
}) {
  let localUser = await UserModel.model.findOne({ workosUserId: workosUser.id });

  if (!localUser) {
    localUser = await UserModel.model.findOne({ email: workosUser.email });

    if (localUser) {
      // Migrate existing legacy user
      console.log(`Migrating user ${localUser.id} to WorkOS (workosId: ${workosUser.id})`);
      await WorkOSService.updateUser(workosUser.id, { externalId: (localUser._id as any).toString() });

      localUser.workosUserId = workosUser.id;
      localUser.authProvider = 'workos';
      localUser.migratedToWorkosAt = new Date();
      localUser.hash = undefined;
      localUser.salt = undefined;
      await localUser.save();
    } else {
      // Create new user — derive username from email prefix
      const baseUsername = workosUser.email.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '');
      const username = await generateUniqueUsername(
        baseUsername,
        (u) => UserModel.model.findOne({ username: u }),
      );

      localUser = new UserModel.model({
        email: workosUser.email,
        username,
        workosUserId: workosUser.id,
        authProvider: 'workos',
      });
      await localUser.save();
      // Best-effort: new users get a pool avatar; empty pool or provider
      // trouble must never block login/registration
      AvatarService.instance.tryAssignOnSignup((localUser._id as any).toString());

      try {
        await WorkOSService.updateUser(workosUser.id, { externalId: (localUser._id as any).toString() });
      } catch (err) {
        console.error('Failed to write externalId to WorkOS (non-fatal):', err);
      }

      const platformOrgId = process.env.WORKOS_PLATFORM_ORG_ID;
      if (platformOrgId) {
        try {
          await WorkOSService.ensureOrgMembership(workosUser.id, platformOrgId);
        } catch (err) {
          console.error('Failed to add auto-provisioned user to platform org (non-fatal):', err);
        }
      }
    }
  } else if (!workosUser.externalId) {
    try {
      await WorkOSService.updateUser(workosUser.id, { externalId: (localUser._id as any).toString() });
    } catch (err) {
      console.error('Failed to write externalId to WorkOS (non-fatal):', err);
    }
  }

  return localUser;
}

export class AuthController {
  constructor() {
    this.login = this.login.bind(this);
    this.register = this.register.bind(this);
    this.verifyEmail = this.verifyEmail.bind(this);
    this.sendMagic = this.sendMagic.bind(this);
    this.verifyMagic = this.verifyMagic.bind(this);
    this.forgotPassword = this.forgotPassword.bind(this);
    this.resetPassword = this.resetPassword.bind(this);
  }

  /**
   * POST /api/auth/login
   * Authenticate with email + password via WorkOS.
   * On failure, check whether the email belongs to a legacy account.
   */
  public async login(req: Request, res: Response): Promise<void> {
    const { email, password } = req.body ?? {};

    if (!email || typeof email !== 'string') {
      res.status(400).json(apiError(400, 'email is required'));
      return;
    }
    if (!password || typeof password !== 'string') {
      res.status(400).json(apiError(400, 'password is required'));
      return;
    }

    try {
      const { user: workosUser } = await WorkOSService.authenticateWithPassword(email, password);

      const localUser = await resolveLocalUser(workosUser);
      const role = await WorkOSService.getPlatformRole(workosUser.id);
      const token = localUser.generateJwt(role ?? undefined);

      res.json({ token });
    } catch {
      // WorkOS auth failed — check whether this is a legacy account
      try {
        const existingUser = await UserModel.model.findOne({ email });
        if (existingUser && existingUser.authProvider !== 'workos') {
          res.status(401).json({ error: 'legacy_account' });
          return;
        }
      } catch (dbErr) {
        console.error('DB lookup error during login fallback:', dbErr);
      }
      res.status(401).json({ error: 'invalid_credentials' });
    }
  }

  /**
   * POST /api/auth/register
   * Create a new WorkOS user + local user record.
   */
  public async register(req: Request, res: Response): Promise<void> {
    const { email, password, username } = req.body ?? {};

    if (!email || typeof email !== 'string') {
      res.status(400).json(apiError(400, 'email is required'));
      return;
    }
    if (!password || typeof password !== 'string') {
      res.status(400).json(apiError(400, 'password is required'));
      return;
    }
    if (!username || typeof username !== 'string') {
      res.status(400).json(apiError(400, 'username is required'));
      return;
    }

    // Username format validation (mirrors the model constraint)
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      res.status(400).json(apiError(400, 'Username may only contain letters, numbers, hyphens, and underscores'));
      return;
    }
    if (username.length > 30) {
      res.status(400).json(apiError(400, 'Username must be 30 characters or fewer'));
      return;
    }

    try {
      // Check username uniqueness before calling WorkOS
      const existingUsername = await UserModel.model.findOne({ username });
      if (existingUsername) {
        res.status(409).json(apiError(409, 'Username is already taken'));
        return;
      }

      // Create WorkOS user (unverified — they must click the email link)
      const workosUser = await WorkOSService.createUser(email, password, false);

      // Create local user
      const localUser = new UserModel.model({
        email,
        username,
        workosUserId: workosUser.id,
        authProvider: 'workos',
      });
      await localUser.save();
      AvatarService.instance.tryAssignOnSignup((localUser._id as any).toString());

      // Write externalId back to WorkOS
      try {
        await WorkOSService.updateUser(workosUser.id, { externalId: (localUser._id as any).toString() });
      } catch (err) {
        console.error('Failed to write externalId to WorkOS (non-fatal):', err);
      }

      // Send verification email — the user must verify before they can log in
      await WorkOSService.sendVerificationEmail(workosUser.id);

      res.status(201).json({ message: 'Account created. Please check your email to verify your address before logging in.', userId: workosUser.id });
    } catch (err: any) {
      if (err?.status === 422 || err?.code === 'user_email_taken') {
        res.status(409).json(apiError(409, 'An account with that email already exists'));
        return;
      }
      console.error('Register error:', err);
      res.status(500).json(apiError(500, 'Registration failed'));
    }
  }

  /**
   * POST /api/auth/verify-email
   * Exchange a WorkOS email verification code for a JWT.
   * WorkOS sends the user a link containing ?code=...; the frontend
   * hits this endpoint with that code to complete verification.
   */
  public async verifyEmail(req: Request, res: Response): Promise<void> {
    const { code, userId } = req.body ?? {};

    if (!code || typeof code !== 'string') {
      res.status(400).json(apiError(400, 'code is required'));
      return;
    }
    if (!userId || typeof userId !== 'string') {
      res.status(400).json(apiError(400, 'userId is required'));
      return;
    }

    try {
      const { user: workosUser } = await WorkOSService.verifyEmail(code, userId);

      const localUser = await resolveLocalUser(workosUser);

      // Add to platform org now that the user is verified
      const platformOrgId = process.env.WORKOS_PLATFORM_ORG_ID;
      if (platformOrgId) {
        try {
          await WorkOSService.ensureOrgMembership(workosUser.id, platformOrgId);
        } catch (err) {
          console.error('Failed to add verified user to platform org (non-fatal):', err);
        }
      }

      const role = await WorkOSService.getPlatformRole(workosUser.id);
      const token = localUser.generateJwt(role ?? undefined);

      res.json({ token });
    } catch (err) {
      console.error('verifyEmail error:', err);
      res.status(400).json(apiError(400, 'Invalid or expired verification code'));
    }
  }

  /**
   * POST /api/auth/send-magic
   * Send a magic auth code to the given email. Always returns 200.
   */
  public async sendMagic(req: Request, res: Response): Promise<void> {
    const { email } = req.body ?? {};

    if (!email || typeof email !== 'string') {
      res.status(400).json(apiError(400, 'email is required'));
      return;
    }

    try {
      await WorkOSService.createMagicAuth(email);
    } catch (err) {
      // Log but do not expose — prevents email enumeration
      console.error('sendMagic error (non-fatal):', err);
    }

    res.json({ message: 'If that email has an account, a sign-in code has been sent.' });
  }

  /**
   * POST /api/auth/verify-magic
   * Exchange a magic auth code for a JWT.
   */
  public async verifyMagic(req: Request, res: Response): Promise<void> {
    const { code, email } = req.body ?? {};

    if (!code || typeof code !== 'string') {
      res.status(400).json(apiError(400, 'code is required'));
      return;
    }
    if (!email || typeof email !== 'string') {
      res.status(400).json(apiError(400, 'email is required'));
      return;
    }

    try {
      const { user: workosUser } = await WorkOSService.authenticateWithMagicAuth(code, email);

      const localUser = await resolveLocalUser(workosUser);
      const role = await WorkOSService.getPlatformRole(workosUser.id);
      const token = localUser.generateJwt(role ?? undefined);

      res.json({ token });
    } catch (err) {
      console.error('verifyMagic error:', err);
      res.status(401).json({ error: 'invalid_or_expired_code' });
    }
  }

  /**
   * POST /api/auth/forgot-password
   * Trigger a password reset email via WorkOS. Always returns 200.
   */
  public async forgotPassword(req: Request, res: Response): Promise<void> {
    const { email } = req.body ?? {};

    if (!email || typeof email !== 'string') {
      res.status(400).json(apiError(400, 'email is required'));
      return;
    }

    try {
      // Ensure legacy users exist in WorkOS before attempting a reset
      const localUser = await UserModel.model.findOne({ email });
      if (localUser && localUser.authProvider !== 'workos') {
        await WorkOSService.provisionUser(email, (localUser._id as any).toString());
      }
      await WorkOSService.sendPasswordResetEmail(email);
    } catch (err) {
      // Log but do not expose — prevents email enumeration
      console.error('forgotPassword error (non-fatal):', err);
    }

    res.json({ message: 'If that email has an account, a password reset link has been sent.' });
  }

  /**
   * POST /api/auth/reset-password
   * Reset a user's password using a WorkOS reset token.
   */
  public async resetPassword(req: Request, res: Response): Promise<void> {
    const { token, newPassword } = req.body ?? {};

    if (!token || typeof token !== 'string') {
      res.status(400).json(apiError(400, 'token is required'));
      return;
    }
    if (!newPassword || typeof newPassword !== 'string') {
      res.status(400).json(apiError(400, 'newPassword is required'));
      return;
    }

    try {
      await WorkOSService.resetPassword(token, newPassword);
      res.json({ message: 'Password reset successfully' });
    } catch (err: any) {
      console.error('resetPassword error:', err);

      if (err?.code === 'password_reset_token_not_found') {
        res.status(400).json(apiError(400, 'Reset link is invalid or has expired. Please request a new one.'));
        return;
      }

      if (err?.code === 'password_reset_error') {
        // Password policy violation — surface WorkOS detail if available
        const detail: string =
          err?.errors?.[0]?.message ||
          err?.errors?.[0]?.code ||
          'Password does not meet the requirements. Please try a different password.';
        res.status(422).json(apiError(422, detail));
        return;
      }

      res.status(400).json(apiError(400, 'Could not reset password. Please request a new reset link.'));
    }
  }

  /**
   * GET /api/auth/profile — re-exported from WorkOSAuthController for convenience.
   * (Not duplicated here; the existing WorkOSAuthController.getProfile still handles it.)
   */
}
