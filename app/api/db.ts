import mongoose from 'mongoose';
import { UserModel } from './models/user';
import { BlueprintModel } from './models/blueprint';
import { BlueprintVersionModel } from './models/blueprint-version';
import { FeedbackModel } from './models/feedback';
import { FollowModel } from './models/follow';
import { CommentModel } from './models/comment';
import { NotificationModel } from './models/notification';
import { PreviewImageModel } from './models/preview-image';
import { BlueprintEventModel } from './models/blueprint-event';
import { BlueprintRatingModel } from './models/blueprint-rating';
import { AvatarModel } from './models/avatar';
import { AvatarSeedUploadModel } from './models/avatar-seed-upload';
import { AvatarBatchModel } from './models/avatar-batch';
import { TranslationUnitModel } from './models/translation-unit';
import { BlueprintSearchModel } from './models/blueprint-search';
import { TranslationBudgetModel } from './models/translation-budget';
import { SearchQueryModel } from './models/search-query';

export class Database {
  constructor() {
    // Mongoose 7.x: strictQuery is false by default, but being explicit
    mongoose.set('strictQuery', false);

    mongoose.connect(process.env.DB_URI as string).catch(reason => {
      if (process.env.NODE_ENV !== 'test') {
        console.log('Mongoose connection error: ' + reason);
      }
    });
    mongoose.connection.on('connected', () => {
      if (process.env.NODE_ENV !== 'test') {
        console.log('Mongoose connected to database');
      }
      UserModel.init();
      BlueprintModel.init();
      BlueprintVersionModel.init();
      FeedbackModel.init();
      FollowModel.init();
      CommentModel.init();
      NotificationModel.init();
      PreviewImageModel.init();
      BlueprintEventModel.init();
      BlueprintRatingModel.init();
      AvatarModel.init();
      AvatarSeedUploadModel.init();
      AvatarBatchModel.init();
      TranslationUnitModel.init();
      BlueprintSearchModel.init();
      TranslationBudgetModel.init();
      SearchQueryModel.init();
    });
    mongoose.connection.on('error', err => {
      if (process.env.NODE_ENV !== 'test') {
        console.log('Mongoose connection error: ' + err);
      }
    });
    mongoose.connection.on('disconnected', () => {
      if (process.env.NODE_ENV !== 'test') {
        console.log('Mongoose disconnected');
      }
    });
  }
}
