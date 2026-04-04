import { Request, Response } from 'express';
import { UserModel } from './models/user';
import mongoose from 'mongoose';
import { apiError } from './utils/apiError';

export class RegisterController {
  public register(req: Request, res: Response) {
    console.log('Received registration from ' + req.clientIp);

    if (mongoose.connection.readyState == 0) {
      console.log('MongoDb is not ready');
      res.status(503).json(apiError(503, 'Database unavailable'));
    }

    let username = req.body.username;
    let email = req.body.email;
    let password = req.body.password;

    if (!username || !email || !password) {
      res.status(400).json(apiError(400, 'Username, email, and password are required'));
      return;
    }

    let usernameRegexp = /^[a-zA-Z0-9-_]+$/;
    if (usernameRegexp.test(username) === false || username.length > 30) {
      console.log('Username too long or with weird characters');
      res.status(400).json(apiError(400, 'Username must be 1–30 alphanumeric characters (hyphens and underscores allowed)'));
      return;
    }

    let emailRegexp = /.+@.+\..+/;
    if (!emailRegexp.test(email) || email.length > 254) {
      res.status(400).json(apiError(400, 'Invalid email address'));
      return;
    }

    let user = new UserModel.model();
    user.email = email;
    user.username = username;
    user.setPassword(password);

    user
      .save()
      .then(() => {
        console.log('Registration succesful');

        res.json({ token: user.generateJwt() });
      })
      .catch(error => {
        console.log('Registration error');
        console.log(error);

        if (error.code == 11000) res.status(409).json(apiError(409, 'Username or email already in use'));
        else res.status(500).json(apiError(500, 'Registration failed'));
      });
  }
}
