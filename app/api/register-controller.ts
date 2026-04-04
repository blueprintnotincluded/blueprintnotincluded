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

    let user = new UserModel.model();

    let username = req.body.username;
    let regexp = /^[a-zA-Z0-9-_]+$/;
    if (username.search(regexp) == -1 || username.length > 30) {
      console.log('Username too long or with weird characters');
      res.status(400).json(apiError(400, 'Username must be 1–30 alphanumeric characters (hyphens and underscores allowed)'));
      return;
    }

    // TODO sanitation and check null here
    user.email = req.body.email;
    user.username = req.body.username;
    user.setPassword(req.body.password);

    user
      .save()
      .then(() => {
        console.log('Registration succesful');

        res.json({ token: user.generateJwt() });
      })
      .catch(error => {
        console.log('Registration error');
        console.log(error);

        if (error.code == 11000) res.json({ duplicateError: true });
        else res.status(500).json(apiError(500, 'Registration failed'));
      });
  }
}
