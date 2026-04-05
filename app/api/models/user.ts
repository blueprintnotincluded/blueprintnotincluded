import mongoose, { Document, Model } from 'mongoose';
import crypto from 'crypto-js';
import jwt from 'jsonwebtoken';

export interface User extends Document {
  email?: string;
  username?: string;

  // Legacy authentication (will be deprecated)
  password?: string;
  hash?: string;
  salt?: string;

  // WorkOS integration
  workosUserId?: string;
  authProvider: 'legacy' | 'workos';
  migratedToWorkosAt?: Date;

  resetToken?: string;
  resetTokenExpiration?: Date;

  setPassword(password: string): void;
  validPassword(password: string): boolean;
  generateJwt(): string;
}

export class UserModel {
  static model: Model<User>;
  public static init() {
    let userSchema = new mongoose.Schema({
      email: {
        type: String,
        unique: true,
        required: true,
        match: [/.+@.+\..+/, 'Invalid email format'],
        maxlength: [254, 'Email must be 254 characters or fewer'],
      },
      username: {
        type: String,
        unique: true,
        required: true,
        match: [/^[a-zA-Z0-9_-]+$/, 'Username may only contain letters, numbers, hyphens, and underscores'],
        maxlength: [30, 'Username must be 30 characters or fewer'],
        minlength: [1, 'Username is required'],
      },
      // Legacy auth fields (will be removed after full migration)
      hash: String,
      salt: String,
      // WorkOS fields
      workosUserId: {
        type: String,
        sparse: true,  // Allows null during migration
        unique: true,  // But must be unique when set
      },
      authProvider: {
        type: String,
        enum: ['legacy', 'workos'],
        default: 'legacy',
      },
      migratedToWorkosAt: Date,
      resetToken: String,
      resetTokenExpiration: Date,
    });

    // Password reset lookup: findOne({ resetToken, resetTokenExpiration: { $gt: ... } })
    userSchema.index({ resetToken: 1 });
    // WorkOS user lookup
    userSchema.index({ workosUserId: 1 });
    // Migration tracking
    userSchema.index({ authProvider: 1 });

    userSchema.methods.setPassword = function (password: string): void {
      (this as any).salt = crypto.lib.WordArray.random(16).toString();
      (this as any).hash = crypto
        .PBKDF2(password, (this as any).salt, { keySize: 512 / 32 })
        .toString(crypto.enc.Hex);
    };

    userSchema.methods.validPassword = function (password: string): boolean {
      if (!(this as any).hash || !(this as any).salt) {
        return false;
      }
      var hash = crypto
        .PBKDF2(password, (this as any).salt, { keySize: 512 / 32 })
        .toString(crypto.enc.Hex);
      return (this as any).hash === hash;
    };

    userSchema.methods.generateJwt = function (): string {
      var expiry = new Date();
      expiry.setDate(expiry.getDate() + 7);

      let userJwt: UserJwt = {
        _id: (this as any)._id,
        email: (this as any).email!,
        username: (this as any).username!,
        exp: expiry.getTime() / 1000,
      };
      return jwt.sign(userJwt, process.env.JWT_SECRET as string); // DO NOT KEEP YOUR SECRET IN THE CODE!
    };

    UserModel.model = (mongoose.models['User'] as Model<User>) || mongoose.model<User>('User', userSchema);
  }

  public static isUser(obj: User | any): obj is User {
    return obj && obj.username && typeof obj.username === 'string';
  }
}

export interface UserJwt {
  _id: string;
  email: string;
  username: string;
  exp: number;
}
