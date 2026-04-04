import passport from 'passport';
import { Strategy } from 'passport-local';
import { UserModel } from './models/user';
import { Router } from 'express';

const router = Router();

export class Auth {
  constructor() {
    let localStrategy = new Strategy(async function (
      username: string,
      password: string,
      done: any
    ) {
      try {
        const user = await UserModel.model.findOne({ username: username });

        // Return if user not found in database
        if (!user) {
          return done(null, false, {
            message: 'User not found',
          });
        }

        // Return if password is wrong
        if (!user.validPassword(password)) {
          return done(null, false, {
            message: 'Password is wrong',
          });
        }

        // If credentials are correct, return the user object
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    });

    passport.use(localStrategy);
  }
}

router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ errors: [{ status: '400', title: 'Token and new password are required' }] });
  }

  const user = await UserModel.model.findOne({
    resetToken: token,
    resetTokenExpiration: { $gt: new Date() },
  });

  if (!user) {
    return res.status(400).json({ errors: [{ status: '400', title: 'Invalid or expired token' }] });
  }

  user.setPassword(newPassword);
  user.resetToken = undefined;
  user.resetTokenExpiration = undefined;
  await user.save();

  return res.json({ message: 'Password has been reset' });
});
