import mongoose, { Schema, Document, Model } from 'mongoose';
import dotenv from 'dotenv';
import crypto from 'crypto-js';
import jwt from 'jsonwebtoken';

export interface Blueprint extends Document {
  owner: string;
  name: string;
  tags: string[];
  likes: string[];
  createdAt: Date;
  modifiedAt: Date;
  thumbnail: string;
  isCopy?: boolean;
  copyOf?: string;
  data: any;
  deleted: boolean;
}

export class BlueprintModel {
  static model: Model<Blueprint>;
  public static init() {
    let blueprintSchema = new mongoose.Schema({
      owner: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      name: {
        type: String,
        required: true,
      },
      tags: { type: [String] },
      likes: { type: [String] },
      createdAt: Date,
      modifiedAt: Date,
      thumbnail: String,
      isCopy: Boolean,
      copyOf: {
        type: Schema.Types.ObjectId,
        ref: 'Blueprint',
      },
      data: Object,
      deleted: Boolean,
    });

    BlueprintModel.model = mongoose.model<Blueprint>('Blueprint', blueprintSchema);
  }
}
