import { Request, Response } from 'express';
import { User, UserModel } from './models/user';
import passport from 'passport';
import { sendResetEmail } from './utils/emailService';
import crypto from 'crypto-js';
import { randomBytes } from 'crypto';

export class LoginController {
  public login(req: Request, res: Response) {
    console.log('login' + req.clientIp);

    let reqAny = req as any;

    if (
      process.env.ENV_NAME != 'development' &&
      process.env.NODE_ENV != 'test' &&
      (reqAny.recaptcha == null ||
        reqAny.recaptcha.error != null ||
        reqAny.recaptcha.data == null ||
        reqAny.recaptcha.data.action != 'login' ||
        !(reqAny.recaptcha.data.score > 0.5))
    ) {
      console.log(reqAny.recaptcha);
      res.status(401).send();
    } else {
      passport.authenticate('local', function (err: any, user: User | false, info: any) {
        var token;
        // If Passport throws/catches an error
        if (err) {
          res.status(404).json(err);
          return;
        }

        // If a user is found
        if (user) {
          token = user.generateJwt();
          res.status(200);
          res.json({
            token: token,
          });
        } else {
          // If user is not found
          res.status(401).json();
        }
      })(req, res);
    }
  }

  public async requestPasswordReset(req: Request, res: Response) {
    console.log('Password reset request received for email:', req.body.email);

    const { email } = req.body;

    try {
      const user = await UserModel.model.findOne({ email });
      if (!user) {
        console.log('User not found for email:', email);
        return res.status(404).json({ message: 'User not found' });
      }

      // Generate reset token
      const resetToken = randomBytes(32).toString('hex');
      user.resetToken = resetToken;
      user.resetTokenExpiration = new Date(Date.now() + 3600000); // 1 hour

      await user.save();
      console.log('Reset token generated for user:', user.username);

      try {
        await sendResetEmail(email, resetToken);
        console.log('Reset email sent successfully to:', email);
        res.json({ message: 'Password reset email sent' });
      } catch (emailError) {
        console.error('Error sending reset email:', emailError);
        res.status(500).json({ message: 'Error sending reset email' });
      }
    } catch (error) {
      console.error('Password reset request error:', error);
      res.status(500).json({ message: 'Error processing request' });
    }
  }

  public async resetPassword(req: Request, res: Response) {
    const { token, newPassword } = req.body;

    try {
      const user = await UserModel.model.findOne({
        resetToken: token,
        resetTokenExpiration: { $gt: new Date(Date.now()) },
      });

      if (!user) {
        return res.status(400).json({ message: 'Invalid or expired reset token' });
      }

      user.setPassword(newPassword);
      user.resetToken = undefined;
      user.resetTokenExpiration = undefined;
      await user.save();

      res.json({ message: 'Password successfully reset' });
    } catch (error) {
      console.error('Password reset error:', error);
      res.status(500).json({ message: 'Error resetting password' });
    }
  }
}
