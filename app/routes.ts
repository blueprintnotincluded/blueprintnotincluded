import path from 'path';
import fs from 'fs';
import { Application, Request, Response, NextFunction } from 'express';
import express from 'express';
import { expressjwt as expressJwt } from 'express-jwt';

import { StaticController } from './static-controller';
import { BlueprintController } from './api/blueprint-controller';
import { BlueprintVersionController } from './api/blueprint-version-controller';
import { VersionController } from './api/version-controller';
import { AuthController } from './api/auth-controller';
import { MigrationController } from './api/migration-controller';
import { HealthController } from './api/health-controller';
import { FeedbackController } from './api/feedback-controller';
import { UserController } from './api/user-controller';
import { CommentController } from './api/comment-controller';
import { NotificationController } from './api/notification-controller';
import { PreviewController } from './api/preview-controller';
export class Routes {
  public staticController = new StaticController();
  public uploadBlueprintController = new BlueprintController();
  public blueprintVersionController = new BlueprintVersionController();
  public versionController = new VersionController();
  public authController = new AuthController();
  public migrationController = new MigrationController();
  public healthController = new HealthController();
  public feedbackController = new FeedbackController();
  public userController = new UserController();
  public commentController = new CommentController();
  public notificationController = new NotificationController();
  public previewController = new PreviewController();

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
        '/api/auth/login',
        '/api/auth/register',
        '/api/auth/verify-email',
        '/api/auth/send-magic',
        '/api/auth/verify-magic',
        '/api/auth/forgot-password',
        '/api/auth/reset-password',
      ],
    });

    // Auth routes (password + magic link)
    app.route('/api/auth/login').post(this.authController.login);
    app.route('/api/auth/register').post(this.authController.register);
    app.route('/api/auth/verify-email').post(this.authController.verifyEmail);
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
    app.route('/api/health').get(this.healthController.getHealth);
    app.route('/api/users/:username/profile').get(this.userController.getProfile);
    app.route('/api/users/:username/followers').get(this.userController.getFollowers);
    app.route('/api/users/:username/following').get(this.userController.getFollowing);
    app.route('/api/blueprints/:id').get(this.uploadBlueprintController.getBlueprintDetails);
    app.route('/api/blueprints/:id/preview/:variant').get(this.previewController.getPreview);
    app.route('/api/blueprints/:id/comments').get(this.commentController.list);
    app.route('/api/blueprints/:id/versions').get(this.blueprintVersionController.listVersions);
    // Download beacon: anonymous (the editor's file export works logged out);
    // dedupe + draft/owner exclusions happen in the counter service path
    app.route('/api/blueprints/:id/downloads').post(this.uploadBlueprintController.trackDownload);

    // Logged in access
    app.route('/api/getblueprintsSecure').get(auth, this.uploadBlueprintController.getBlueprints);
    app.route('/api/uploadblueprint').post(auth, this.uploadBlueprintController.uploadBlueprint);
    app.route('/api/likeblueprint').post(auth, this.uploadBlueprintController.likeBlueprint);
    app.route('/api/deleteblueprint').post(auth, this.uploadBlueprintController.deleteBlueprint);
    app.route('/api/blueprints/:id/publish').post(auth, this.uploadBlueprintController.publishBlueprint);
    app.route('/api/blueprints/:id/unpublish').post(auth, this.uploadBlueprintController.unpublishBlueprint);
    app.route('/api/feedback').post(auth, this.feedbackController.submit);
    app.route('/api/users/:username/profileSecure').get(auth, this.userController.getProfile);
    app.route('/api/follow').post(auth, this.userController.follow);
    app.route('/api/users/me').patch(auth, this.userController.updateBio);
    app.route('/api/feed').get(auth, this.userController.getFeed);
    app.route('/api/blueprints/:id/comments').post(auth, this.commentController.create);
    app.route('/api/comments/:id').patch(auth, this.commentController.edit);
    app.route('/api/comments/:id').delete(auth, this.commentController.remove);
    app.route('/api/blueprints/:id/fork').post(auth, this.blueprintVersionController.fork);
    app.route('/api/notifications').get(auth, this.notificationController.list);
    app.route('/api/notifications/mark-read').post(auth, this.notificationController.markAllRead);
    app.route('/api/blueprints/:id/versions').post(auth, this.blueprintVersionController.createVersion);
    app
      .route('/api/blueprints/:id/versions/:versionId')
      .delete(auth, this.blueprintVersionController.deleteVersion);
    app
      .route('/api/blueprints/:id/versions/:versionId/restore')
      .post(auth, this.blueprintVersionController.restoreVersion);

    // Admin-only API
    app.route('/api/admin/feedback').get(auth, adminAuth, this.feedbackController.list);
    app.route('/api/admin/feedback/:id').patch(auth, adminAuth, this.feedbackController.updateStatus);

    // Admin app — served at /admin when built; skipped in dev (admin runs on port 4201)
    const adminIndexHtml = path.join(__dirname, 'public', 'admin', 'index.html');
    if (fs.existsSync(adminIndexHtml)) {
      app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));
      app.get('/admin', (_req, res) => res.sendFile(adminIndexHtml));
      app.get('/admin/*path', (_req, res) => res.sendFile(adminIndexHtml));
    }

    app.get('/', this.staticController.getHome);
    app.get('/b/:blueprintId', this.staticController.getBlueprint);
    app.get('/b/:blueprintId/thumbnail', this.staticController.getBlueprintThumbnail);
    app.get('/blueprint/:blueprintId', this.staticController.getBlueprint);
    app.use(express.static(path.join(__dirname, 'public')));
    app.get('/*path', this.staticController.serveHtml);
  }
}
