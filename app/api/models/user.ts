import mongoose, { Document, Model } from 'mongoose';
import { CustomThemeColors } from '../../../lib/index';
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
  workosSessionId?: string;
  authProvider: 'legacy' | 'workos';
  migratedToWorkosAt?: Date;

  resetToken?: string;
  resetTokenExpiration?: Date;


  bio?: string;
  avatarId?: mongoose.Types.ObjectId | null;

  // Packs the user doesn't want to see in Discover ("?excludeDlc="), raw Klei
  // ids like requiredDlcs. Never set until the user interacts with the DLC
  // filters — [] and "never touched" are the same state, so no separate flag
  // is needed. Private account data: never include in ProfileResponse or any
  // other response reachable by another user.
  dlcPreferences?: {
    excludedDlcs: string[];
  };

  // Chosen site theme (the discover skin's palette id). Absent means "never
  // chosen", which resolves to DEFAULT_THEME_ID rather than being written
  // eagerly, so changing the default later still reaches those accounts.
  // Cosmetic, but still account state: not part of ProfileResponse.
  themePreference?: string;

  // The user's hand-picked palette (token name → #rrggbb), present only after
  // they save a custom theme. Kept even while a prefab is selected, so
  // switching back to "custom" restores their colours. Every value is
  // validated as strict hex before it is written — it reaches a CSS custom
  // property on the client. Same privacy rule as themePreference.
  customThemeColors?: CustomThemeColors;

  // Which language the user reads blueprint CONTENT in (base ISO tag —
  // spec/search-followups.md Part 2). Not the UI locale: the chrome is
  // English for everyone regardless. Absent means "never chosen", which
  // resolves to DEFAULT_CONTENT_LOCALE at read time rather than being written
  // eagerly — same rule as themePreference/dlcPreferences, and for the same
  // reason: a default that writes itself is indistinguishable from a choice,
  // which would make the §2.10 "who actually reads in what language"
  // measurement meaningless. Private account data: never in ProfileResponse
  // or any other payload another user can reach.
  localePreference?: string;

  setPassword(password: string): void;
  validPassword(password: string): boolean;
  generateJwt(role?: string): string;
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
      workosSessionId: String,
      authProvider: {
        type: String,
        enum: ['legacy', 'workos'],
        default: 'legacy',
      },
      migratedToWorkosAt: Date,
      resetToken: String,
      resetTokenExpiration: Date,
      bio: { type: String, maxlength: [500, 'Bio must be 500 characters or fewer'], default: '' },
      avatarId: { type: mongoose.Schema.Types.ObjectId, ref: 'Avatar', default: null },
      dlcPreferences: {
        excludedDlcs: { type: [String], default: [] },
      },
      themePreference: { type: String },
      localePreference: { type: String },
      // Written whole on every save (findByIdAndUpdate $set), validated in the
      // controller via sanitizeCustomThemeColors — Mixed here is just storage.
      customThemeColors: { type: mongoose.Schema.Types.Mixed },
    });

    // Password reset lookup: findOne({ resetToken, resetTokenExpiration: { $gt: ... } })
    userSchema.index({ resetToken: 1 });
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

    userSchema.methods.generateJwt = function (role?: string): string {
      var expiry = new Date();
      if (role) {
        // Role-bearing tokens expire in 24 hours — shorter window limits stale admin access
        expiry.setHours(expiry.getHours() + 24);
      } else {
        expiry.setDate(expiry.getDate() + 7);
      }

      let userJwt: UserJwt = {
        _id: (this as any)._id,
        email: (this as any).email!,
        username: (this as any).username!,
        exp: expiry.getTime() / 1000,
        ...(role ? { role } : {}),
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
  role?: string; // 'admin' | undefined — sourced from WorkOS platform org membership
}
