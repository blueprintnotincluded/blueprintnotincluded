import { Request, Response } from 'express';
import { UserModel, UserJwt } from './models/user';
import { apiError } from './utils/apiError';

export class AlphaController {
  public toggleAlpha = async (req: Request, res: Response): Promise<void> => {
    const userJwt = req.user as UserJwt;
    try {
      const user = await UserModel.model.findById(userJwt._id);
      if (!user) {
        res.status(404).json(apiError(404, 'User not found'));
        return;
      }

      user.isAlpha = !user.isAlpha;
      await user.save();

      const token = user.generateJwt(userJwt.role);
      res.json({ token });
    } catch (err) {
      console.error('toggleAlpha error', err);
      res.status(500).json(apiError(500, 'Failed to toggle alpha'));
    }
  };
}
