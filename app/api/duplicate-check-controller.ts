import { Request, Response } from 'express';
import { User, UserModel } from './models/user';

export class DuplicateCheckController {
  public async checkUsername(req: Request, res: Response) {
    try {
      // If we can't access mongoose, assume the username is not present
      if (UserModel.model == null) {
        res.json({ usernameExists: false });
        return;
      }

      const users = await UserModel.model.find({ username: req.query.username as string });

      if (users.length) {
        res.json({ usernameExists: true });
      } else {
        res.json({ usernameExists: false });
      }
    } catch (err) {
      console.error('Error checking username:', err);
      res.status(500).json({ error: 'Database error' });
    }
  }
}
