import crypto from 'crypto';
import { Request, Response } from 'express';
import { UserModel, UserJwt } from './models/user';
import { WorkOSService } from './services/workos-service';
import { apiError } from './utils/apiError';

// One-time code store for secure OAuth token delivery.
// Codes are short-lived (60 s) and deleted on first use.
const pendingTokenCodes = new Map<string, { token: string; expiresAt: number }>();

function generateOneTimeCode(token: string): string {
  const code = crypto.randomBytes(32).toString('hex');
  pendingTokenCodes.set(code, { token, expiresAt: Date.now() + 60_000 });
  return code;
}

function redeemCode(code: string): string | null {
  const entry = pendingTokenCodes.get(code);
  if (!entry) return null;
  pendingTokenCodes.delete(code);
  if (Date.now() > entry.expiresAt) return null;
  return entry.token;
}

export class WorkOSAuthController {
  constructor() {
    this.login = this.login.bind(this);
    this.callback = this.callback.bind(this);
    this.exchangeCode = this.exchangeCode.bind(this);
    this.getProfile = this.getProfile.bind(this);
    this.getSwitchAccountUrl = this.getSwitchAccountUrl.bind(this);
  }

  /**
   * Initiate WorkOS login
   */
  public login(_req: Request, res: Response) {
    try {
      const authUrl = WorkOSService.getAuthorizationUrl();
      res.redirect(authUrl);
    } catch (error) {
      console.error('WorkOS login error:', error);
      res.status(500).json(apiError(500, 'Failed to initiate login'));
    }
  }

  /**
   * Handle OAuth callback from WorkOS
   */
  public async callback(req: Request, res: Response): Promise<void> {
    try {
      const { code } = req.query;

      if (!code || typeof code !== 'string') {
        res.status(400).json(apiError(400, 'Missing authorization code'));
        return;
      }

      // Authenticate with WorkOS
      const { user: workosUser, accessToken } = await WorkOSService.authenticateWithCode(code);
      const sessionId = WorkOSService.extractSessionId(accessToken);

      // Find or create user in our database
      let localUser = await UserModel.model.findOne({ workosUserId: workosUser.id });

      if (!localUser) {
        // Check if we have a legacy user with this email
        localUser = await UserModel.model.findOne({ email: workosUser.email });

        if (localUser) {
          // Verify WorkOS email before linking to legacy account
          if (!workosUser.emailVerified) {
            const frontendUrl = process.env.FRONTEND_URL || process.env.HOST || 'http://localhost:4200';
            res.redirect(`${frontendUrl}/auth/error?message=WorkOS email address is not verified`);
            return;
          }

          console.log(`Migrating existing user ${localUser.id} to WorkOS (workosId: ${workosUser.id})`);

          // Write externalId to WorkOS BEFORE making destructive local changes so a
          // failed WorkOS write does not leave the user without valid credentials.
          await WorkOSService.updateUser(workosUser.id, { externalId: (localUser._id as any).toString() });

          localUser.workosUserId = workosUser.id;
          localUser.authProvider = 'workos';
          localUser.migratedToWorkosAt = new Date();
          if (sessionId) localUser.workosSessionId = sessionId;
          // Clear legacy auth fields
          localUser.hash = undefined;
          localUser.salt = undefined;
          await localUser.save();
        } else {
          // Create new user
          console.log(`Creating new user from WorkOS (workosId: ${workosUser.id})`);

          // Generate username from email, ensure uniqueness
          let baseUsername = workosUser.email.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '');
          let username = baseUsername;
          let counter = 1;

          while (await UserModel.model.findOne({ username })) {
            username = `${baseUsername}${counter}`;
            counter++;
          }

          localUser = new UserModel.model({
            email: workosUser.email,
            username: username,
            workosUserId: workosUser.id,
            workosSessionId: sessionId ?? undefined,
            authProvider: 'workos',
          });
          await localUser.save();

          // Write externalId back to WorkOS after the new user record exists
          try {
            await WorkOSService.updateUser(workosUser.id, { externalId: (localUser._id as any).toString() });
          } catch (err) {
            console.error('Failed to write externalId to WorkOS (non-fatal):', err);
          }
        }
      } else if (!workosUser.externalId) {
        // Existing WorkOS user — write externalId if not already set
        try {
          await WorkOSService.updateUser(workosUser.id, { externalId: (localUser._id as any).toString() });
        } catch (err) {
          console.error('Failed to write externalId to WorkOS (non-fatal):', err);
        }
      }

      // Update session ID on every login so we always have the latest one for logout
      if (sessionId && localUser.workosSessionId !== sessionId) {
        localUser.workosSessionId = sessionId;
        await localUser.save();
      }

      // Check platform org membership to determine admin role
      const role = await WorkOSService.getPlatformRole(workosUser.id);

      // Generate JWT for our API
      const token = localUser.generateJwt(role ?? undefined);

      // Issue a one-time code and redirect — never put the JWT in the URL
      const exchangeCode = generateOneTimeCode(token);
      const frontendUrl = process.env.FRONTEND_URL || process.env.HOST || 'http://localhost:4200';
      res.redirect(`${frontendUrl}/auth/callback?code=${exchangeCode}`);
    } catch (error) {
      console.error('WorkOS callback error:', error);
      const frontendUrl = process.env.FRONTEND_URL || process.env.HOST || 'http://localhost:4200';
      res.redirect(`${frontendUrl}/auth/error?message=Authentication failed`);
    }
  }

  /**
   * Exchange a one-time code (issued by the OAuth callback) for a JWT.
   * Codes expire after 60 seconds and are deleted on first use.
   */
  public exchangeCode(req: Request, res: Response) {
    const { code } = req.query;
    if (!code || typeof code !== 'string') {
      return res.status(400).json(apiError(400, 'Missing code'));
    }
    const token = redeemCode(code);
    if (!token) {
      return res.status(400).json(apiError(400, 'Invalid or expired code'));
    }
    return res.json({ token });
  }

  /**
   * Get current user info (protected route)
   */
  public async getProfile(req: Request, res: Response) {
    try {
      const userJwt = req.user as UserJwt;
      const localUser = await UserModel.model.findById(userJwt._id);

      if (!localUser) {
        return res.status(404).json(apiError(404, 'User not found'));
      }

      // If using WorkOS, fetch latest data
      if (localUser.workosUserId) {
        try {
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
        } catch (error) {
          console.error('Error fetching WorkOS user:', error);
          // Fall through to return local user data
        }
      }

      return res.json({
        id: localUser._id,
        username: localUser.username,
        email: localUser.email,
        authProvider: localUser.authProvider || 'legacy',
      });
    } catch (error) {
      console.error('Profile error:', error);
      return res.status(500).json(apiError(500, 'Failed to get profile'));
    }
  }

  /**
   * Return the WorkOS logout URL for the current user's session (protected route).
   * The frontend navigates to this URL to end the WorkOS session before re-logging in.
   */
  public async getSwitchAccountUrl(req: Request, res: Response) {
    try {
      const userJwt = req.user as UserJwt;
      const localUser = await UserModel.model.findById(userJwt._id);

      if (!localUser?.workosSessionId) {
        return res.status(400).json(apiError(400, 'No active WorkOS session found'));
      }

      const backendHost = process.env.BACKEND_HOST || process.env.HOST;
      const loginUrl = `${backendHost}/api/auth/workos`;
      const logoutUrl = WorkOSService.getLogoutUrl(localUser.workosSessionId, loginUrl);
      return res.json({ url: logoutUrl });
    } catch (error) {
      console.error('Switch account error:', error);
      return res.status(500).json(apiError(500, 'Failed to get switch account URL'));
    }
  }
}
