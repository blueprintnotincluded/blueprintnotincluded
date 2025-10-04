import mongoose, { Schema, Document, Model } from 'mongoose';
import dotenv from 'dotenv';
import crypto from 'crypto-js';
import jwt from 'jsonwebtoken';

export interface User extends Document {
  email?: string;
  username?: string;
  password?: string;
  hash?: string;
  salt: string;
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
      },
      username: {
        type: String,
        unique: true,
        required: true,
      },
      hash: String,
      salt: String,
      resetToken: String,
      resetTokenExpiration: Date,
    });

    userSchema.methods.setPassword = function (password: string): void {
      (this as any).salt = crypto.lib.WordArray.random(16).toString();
      (this as any).hash = crypto
        .PBKDF2(password, (this as any).salt, { keySize: 512 / 32 })
        .toString(crypto.enc.Hex);
    };

    userSchema.methods.validPassword = function (password: string): boolean {
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

    UserModel.model = mongoose.model<User>('User', userSchema);
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
