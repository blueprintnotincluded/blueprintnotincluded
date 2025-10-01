import path from 'path';
import { Application } from "express";
import express from 'express';
import { expressjwt as expressJwt } from 'express-jwt'

import { StaticController } from './static-controller';
import { LoginController } from './api/login-controller';
import { RegisterController } from "./api/register-controller";
import { DuplicateCheckController } from "./api/duplicate-check-controller";
import { BlueprintController } from "./api/blueprint-controller";
var Recaptcha = require('express-recaptcha').RecaptchaV3;
export class Routes {
  public staticController = new StaticController();
  public loginController = new LoginController();
  public registerController = new RegisterController();
  public duplicateCheckController = new DuplicateCheckController();
  public uploadBlueprintController = new BlueprintController();

  public routes(app: Application): void {
    // Initialize authentication middleware
    //let auth = expressJwt({secret: process.env.JWT_SECRET as string, userProperty: 'tokenPayload' });
    let auth = expressJwt({ 
      secret: process.env.JWT_SECRET as string,
      algorithms: ['HS256'],
      requestProperty: 'user'  // This ensures the token is attached to req.user
    }).unless({ path: ['/api/register', '/api/login', '/api/request-reset', '/api/reset-password'] });
    
    let recaptcha = new Recaptcha(process.env.CAPTCHA_SITE as string, process.env.CAPTCHA_SECRET as string);


    if (process.env.ENV_NAME == 'development') {
      console.log('Initializing routes without recaptcha verification');
      app.route("/api/login").post(this.loginController.login);
      app.route("/api/register").post(this.registerController.register);
      app.route("/api/request-reset").post(this.loginController.requestPasswordReset);
      app.route("/api/reset-password").post(this.loginController.resetPassword);
    }
    else {
      if (process.env.NODE_ENV !== 'test') {
        console.log('Initializing routes with recaptcha verification');
      }
      app.route("/api/login").post(recaptcha.middleware.verify, this.loginController.login);
      app.route("/api/register").post(recaptcha.middleware.verify, this.registerController.register);
      app.route("/api/request-reset").post(
        recaptcha.middleware.verify,
        this.loginController.requestPasswordReset
      );
      app.route("/api/reset-password").post(recaptcha.middleware.verify, this.loginController.resetPassword);
    }

    // Anonymous access
    app.route("/api/checkusername").get(this.duplicateCheckController.checkUsername);
    app.route("/api/getblueprint/:id").get(this.uploadBlueprintController.getBlueprint);
    app.route("/api/getblueprintmod/:id").get(this.uploadBlueprintController.getBlueprintMod);
    app.route("/api/getblueprintthumbnail/:id").get(this.uploadBlueprintController.getBlueprintThumbnail);
    app.route("/api/getblueprints").get(this.uploadBlueprintController.getBlueprints);

    // Logged in access
    app.route("/api/getblueprintsSecure").get(auth, this.uploadBlueprintController.getBlueprints);
    app.route("/api/uploadblueprint").post(auth, this.uploadBlueprintController.uploadBlueprint);
    app.route("/api/likeblueprint").post(auth, this.uploadBlueprintController.likeBlueprint);
    app.route("/api/deleteblueprint").post(auth, this.uploadBlueprintController.deleteBlueprint);

    app.get('/', this.staticController.getHome);
    app.get('/b/:blueprintId', this.staticController.getBlueprint);
    app.get('/b/:blueprintId/thumbnail', this.staticController.getBlueprintThumbnail);
    app.use(express.static(path.join(__dirname, "public")));
    app.get('/*path', this.staticController.serveHtml);
  }
}
