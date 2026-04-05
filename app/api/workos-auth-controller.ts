import { Request, Response } from 'express';
import { UserModel, UserJwt } from './models/user';
import { WorkOSService } from './services/workos-service';
import { apiError } from './utils/apiError';

export class WorkOSAuthController {
  constructor() {
    this.login = this.login.bind(this);
    this.callback = this.callback.bind(this);
    this.getProfile = this.getProfile.bind(this);
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
      const { user: workosUser } = await WorkOSService.authenticateWithCode(code);

      // Find or create user in our database
      let localUser = await UserModel.model.findOne({ workosUserId: workosUser.id });

      if (!localUser) {
        // Check if we have a legacy user with this email
        localUser = await UserModel.model.findOne({ email: workosUser.email });

        if (localUser) {
          console.log(`Migrating existing user ${localUser.id} to WorkOS (workosId: ${workosUser.id})`);

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
            authProvider: 'workos',
          });
          await localUser.save();
        }
      }

      // Write externalId back to WorkOS so webhooks and the dashboard can resolve the local user
      if (!workosUser.externalId) {
        await WorkOSService.updateUser(workosUser.id, { externalId: (localUser._id as any).toString() });
      }

      // Check platform org membership to determine admin role
      const role = await WorkOSService.getPlatformRole(workosUser.id);

      // Generate JWT for our API
      const token = localUser.generateJwt(role ?? undefined);

      // Redirect to frontend with token
      const frontendUrl = process.env.FRONTEND_URL || process.env.HOST || 'http://localhost:4200';
      res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
    } catch (error) {
      console.error('WorkOS callback error:', error);
      const frontendUrl = process.env.FRONTEND_URL || process.env.HOST || 'http://localhost:4200';
      res.redirect(`${frontendUrl}/auth/error?message=Authentication failed`);
    }
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
}
