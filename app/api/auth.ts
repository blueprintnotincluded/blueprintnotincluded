import passport from 'passport';
import { Strategy } from 'passport-local';
import { UserModel } from './models/user';
import { Router } from 'express';
import crypto from 'crypto';
import { sendResetEmail } from './utils/emailService'; // Assume you have an email service

const router = Router();

export class Auth {
  constructor() {
    let localStrategy = new Strategy(async function (
      username: string,
      password: string,
      done: any
    ) {
      try {
        console.log(`Auth: Looking for username: "${username}" (length: ${username.length})`);
        const user = await UserModel.model.findOne({ username: username });

        // Return if user not found in database
        if (!user) {
          console.log(`Auth: User not found for username: "${username}"`);
          return done(null, false, {
            message: 'User not found',
          });
        }

        console.log(`Auth: User found: ${user.username}, validating password`);
        // Return if password is wrong
        if (!user.validPassword(password)) {
          console.log(`Auth: Invalid password for user: ${user.username}`);
          return done(null, false, {
            message: 'Password is wrong',
          });
        }

        console.log(`Auth: Login successful for user: ${user.username}`);

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
  const user = await UserModel.model.findOne({
    resetToken: token,
    resetTokenExpiration: { $gt: new Date() },
  });

  if (!user) {
    return res.status(400).send('Invalid or expired token');
  }

  user.setPassword(newPassword);
  user.resetToken = undefined;
  user.resetTokenExpiration = undefined;
  await user.save();

  res.send('Password has been reset');
});
