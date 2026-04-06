import { Request, Response } from 'express';
import { NotFoundException } from '@workos-inc/node';
import { UserModel, UserJwt } from './models/user';
import { WorkOSService } from './services/workos-service';
import { apiError } from './utils/apiError';

export class MigrationController {
  constructor() {
    this.getMigrationStatus = this.getMigrationStatus.bind(this);
    this.migrateUserToWorkOS = this.migrateUserToWorkOS.bind(this);
  }

  /**
   * Get migration status for all users
   */
  public async getMigrationStatus(_req: Request, res: Response) {
    try {
      const total = await UserModel.model.countDocuments();
      const migrated = await UserModel.model.countDocuments({ authProvider: 'workos' });
      const legacy = await UserModel.model.countDocuments({ authProvider: 'legacy' });
      const missingOrUnset = await UserModel.model.countDocuments({ $or: [{ authProvider: { $exists: false } }, { authProvider: null }, { authProvider: '' }] });

      return res.json({
        total,
        migrated,
        legacy,
        missingOrUnset,
        percentComplete: total > 0 ? Math.round((migrated / total) * 100) : 0,
      });
    } catch (error) {
      console.error('Status error:', error);
      return res.status(500).json(apiError(500, 'Failed to get migration status'));
    }
  }

  /**
   * Self-service migration: initiates WorkOS migration for the currently authenticated user (req.user._id)
   * This sends them a magic link to complete migration
   */
  public async migrateUserToWorkOS(req: Request, res: Response) {
    try {
      const user = req.user as UserJwt;

      const localUser = await UserModel.model.findById(user._id);
      if (!localUser) {
        return res.status(404).json(apiError(404, 'User not found'));
      }

      if (localUser.authProvider === 'workos') {
        return res.json({
          message: 'Already migrated to WorkOS',
          status: 'complete'
        });
      }

      // For legacy users, create a magic auth link via WorkOS
      // This allows them to set up their WorkOS account
      if (!localUser.email) {
        return res.json({
          message: 'Account has no email address — use WorkOS login to complete migration',
          status: 'ready',
          loginUrl: '/api/auth/workos'
        });
      }

      try {
        await WorkOSService.createMagicAuth(localUser.email);

        return res.json({
          message: 'Migration initiated - check your email',
          status: 'pending',
          // Note: Don't send the actual magic link URL for security
          // WorkOS will email it to the user
        });
      } catch (error: unknown) {
        if (error instanceof NotFoundException) {
          // User doesn't exist in WorkOS yet — they'll be created on first login
          return res.json({
            message: 'Please use WorkOS login to complete migration',
            status: 'ready',
            loginUrl: '/api/auth/workos'
          });
        }
        console.error('createMagicAuth failed:', error);
        return res.status(500).json(apiError(500, 'Failed to initiate migration'));
      }
    } catch (error) {
      console.error('Migration error:', error);
      return res.status(500).json(apiError(500, 'Migration failed'));
    }
  }
}
