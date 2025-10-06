import { Request, Response } from 'express';
import { UserModel } from './models/user';
import mongoose from 'mongoose';

export class RegisterController {
  public register(req: Request, res: Response) {
    let reqAny = req as any;
    if (
      process.env.ENV_NAME != 'development' &&
      process.env.NODE_ENV != 'test' &&
      (reqAny.recaptcha == null ||
        reqAny.recaptcha.error != null ||
        reqAny.recaptcha.data == null ||
        reqAny.recaptcha.data.action != 'register' ||
        !(reqAny.recaptcha.data.score > 0.5))
    ) {
      console.log(reqAny.recaptcha);
      res.status(401).send();
    } else {
      console.log('Received registration from ' + req.clientIp);

      if (mongoose.connection.readyState == 0) {
        console.log('MongoDb is not ready');
        res.status(503).json({ registrationResult: 'DB_ERROR' });
      }

      let user = new UserModel.model();

      let username = req.body.username;
      let regexp = /^[a-zA-Z0-9-_]+$/;
      if (username.search(regexp) == -1 || username.lenght > 30) {
        console.log('Username too long or with weird characters');
        res.status(500).json({ registrationResult: 'ERROR' });
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
          else res.status(500).json({ registrationResult: 'ERROR' });
        });
    }
  }
}
