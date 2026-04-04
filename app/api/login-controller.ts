import { Request, Response } from 'express';
import { User, UserModel } from './models/user';
import passport from 'passport';
import { sendResetEmail } from './utils/emailService';
import { randomBytes } from 'crypto';
import { apiError } from './utils/apiError';

export class LoginController {
  public login(req: Request, res: Response) {
    console.log('login' + req.clientIp);

    passport.authenticate('local', function (err: any, user: User | false, _info: any) {
      var token;
      // If Passport throws/catches an error
      if (err) {
        res.status(500).json(apiError(500, 'Authentication error'));
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
        res.status(401).json(apiError(401, 'Invalid credentials'));
      }
    })(req, res);
  }

  public async requestPasswordReset(req: Request, res: Response) {
    console.log('Password reset request received for email:', req.body.email);

    const { email } = req.body;

    try {
      const user = await UserModel.model.findOne({ email });
      if (!user) {
        console.log('User not found for email:', email);
        return res.status(404).json(apiError(404, 'User not found'));
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
        return res.json({ message: 'Password reset email sent' });
      } catch (emailError) {
        console.error('Error sending reset email:', emailError);
        return res.status(500).json(apiError(500, 'Error sending reset email'));
      }
    } catch (error) {
      console.error('Password reset request error:', error);
      return res.status(500).json(apiError(500, 'Error processing request'));
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
        return res.status(400).json(apiError(400, 'Invalid or expired reset token'));
      }

      user.setPassword(newPassword);
      user.resetToken = undefined;
      user.resetTokenExpiration = undefined;
      await user.save();

      return res.json({ message: 'Password successfully reset' });
    } catch (error) {
      console.error('Password reset error:', error);
      return res.status(500).json(apiError(500, 'Error resetting password'));
    }
  }
}
