import path from 'path';
import { Application, Request, Response, NextFunction } from 'express';
import express from 'express';
import { expressjwt as expressJwt } from 'express-jwt';

import { StaticController } from './static-controller';
import { BlueprintController } from './api/blueprint-controller';
import { VersionController } from './api/version-controller';
import { WorkOSAuthController } from './api/workos-auth-controller';
import { AuthController } from './api/auth-controller';
import { MigrationController } from './api/migration-controller';
export class Routes {
  public staticController = new StaticController();
  public uploadBlueprintController = new BlueprintController();
  public versionController = new VersionController();
  public workosAuthController = new WorkOSAuthController();
  public authController = new AuthController();
  public migrationController = new MigrationController();

  public routes(app: Application): void {
    // Admin-only middleware: requires role === 'admin' in the JWT (set from WorkOS platform org membership)
    const adminAuth = (req: Request, res: Response, next: NextFunction) => {
      const user = req.user as { role?: string } | undefined;
      if (user?.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      return next();
    };

    // Initialize authentication middleware
    let auth = expressJwt({
      secret: process.env.JWT_SECRET as string,
      algorithms: ['HS256'],
      requestProperty: 'user', // This ensures the token is attached to req.user
    }).unless({
      path: [
        '/api/auth/workos',
        '/api/auth/callback',
        '/api/auth/exchange',
        '/api/auth/login',
        '/api/auth/register',
        '/api/auth/send-magic',
        '/api/auth/verify-magic',
        '/api/auth/forgot-password',
        '/api/auth/reset-password',
      ],
    });

    // WorkOS Authentication Routes (primary auth method)
    app.route('/api/auth/workos').get(this.workosAuthController.login);
    app.route('/api/auth/callback').get(this.workosAuthController.callback);
    app.route('/api/auth/exchange').get(this.workosAuthController.exchangeCode);
    app.route('/api/auth/profile').get(auth, this.workosAuthController.getProfile);
    app.route('/api/auth/switch-account').get(auth, this.workosAuthController.getSwitchAccountUrl);

    // Custom auth routes (password + magic link — no redirects)
    app.route('/api/auth/login').post(this.authController.login);
    app.route('/api/auth/register').post(this.authController.register);
    app.route('/api/auth/send-magic').post(this.authController.sendMagic);
    app.route('/api/auth/verify-magic').post(this.authController.verifyMagic);
    app.route('/api/auth/forgot-password').post(this.authController.forgotPassword);
    app.route('/api/auth/reset-password').post(this.authController.resetPassword);

    // Migration Routes
    app.route('/api/migration/status').get(auth, adminAuth, this.migrationController.getMigrationStatus);
    app.route('/api/migration/migrate').post(auth, this.migrationController.migrateUserToWorkOS);

    // Anonymous access
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
