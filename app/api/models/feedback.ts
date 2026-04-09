import mongoose, { Schema, Document, Model } from 'mongoose';

export type FeedbackStatus = 'open' | 'resolved' | 'spam';

export interface Feedback extends Document {
  userId: mongoose.Types.ObjectId;
  userEmail: string;
  username: string;
  message: string;
  url: string;
  userAgent: string;
  consoleErrors: string[];
  status: FeedbackStatus;
  createdAt: Date;
}

export class FeedbackModel {
  static model: Model<Feedback>;

  public static init() {
    const feedbackSchema = new mongoose.Schema({
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      userEmail: { type: String, required: true },
      username: { type: String, required: true },
      message: { type: String, required: true, maxlength: 5000 },
      url: { type: String, default: '', maxlength: 2048 },
      userAgent: { type: String, default: '', maxlength: 512 },
      consoleErrors: {
        type: [{ type: String, maxlength: 1000 }],
        default: [],
        validate: {
          validator: (v: string[]) => v.length <= 50,
          message: 'consoleErrors may not exceed 50 entries',
        },
      },
      status: {
        type: String,
        enum: ['open', 'resolved', 'spam'],
        default: 'open',
      },
      createdAt: { type: Date, default: Date.now },
    });

    // Most recent first (default list view)
    feedbackSchema.index({ createdAt: -1 });
    // Filter by status + sort by date
    feedbackSchema.index({ status: 1, createdAt: -1 });

    FeedbackModel.model = (mongoose.models['Feedback'] as Model<Feedback>) ?? mongoose.model<Feedback>('Feedback', feedbackSchema);
  }
}
