import { UserModel } from '../../app/api/models/user';
import { BlueprintModel } from '../../app/api/models/blueprint';
import { BlueprintVersionModel } from '../../app/api/models/blueprint-version';
import { FeedbackModel } from '../../app/api/models/feedback';
import { FollowModel } from '../../app/api/models/follow';
import { CommentModel } from '../../app/api/models/comment';
import { NotificationModel } from '../../app/api/models/notification';
import { PreviewImageModel } from '../../app/api/models/preview-image';
import { BlueprintEventModel } from '../../app/api/models/blueprint-event';
import { BlueprintRatingModel } from '../../app/api/models/blueprint-rating';
import { TestDataFactory, TestUser, TestBlueprint } from '../factories/testData';
import { Types } from 'mongoose';

export class TestDbHelper {
  static async createTestUser(userData?: Partial<TestUser>) {
    const testUser = TestDataFactory.createUser(userData);
    return await UserModel.model.create(testUser);
  }

  static async createTestBlueprint(owner: Types.ObjectId, blueprintData?: Partial<TestBlueprint>) {
    const testBlueprint = TestDataFactory.createBlueprint(owner, blueprintData);
    return await BlueprintModel.model.create(testBlueprint);
  }

  // Insert per-user rating docs and set the matching denormalized aggregate
  // on the blueprint — the same invariant the rate endpoint maintains.
  static async seedRatings(blueprintId: Types.ObjectId, ratings: { userId: string; value: number }[]) {
    if (ratings.length === 0) return;
    await BlueprintRatingModel.model.insertMany(
      ratings.map(rating => ({
        blueprintId,
        userId: rating.userId,
        value: rating.value,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
    );
    const average = ratings.reduce((sum, rating) => sum + rating.value, 0) / ratings.length;
    await BlueprintModel.model.updateOne(
      { _id: blueprintId },
      { $set: { ratingCount: ratings.length, ratingAverage: average } }
    );
  }

  static async seedDatabase() {
    // Create test users with unique identifiers
    const timestamp = Date.now();
    const user1 = await this.createTestUser({
      username: `blueprintmaster_${timestamp}`,
      email: `master_${timestamp}@blueprints.com`,
    });

    const user2 = await this.createTestUser({
      username: `poweruser_${timestamp}`,
      email: `power_${timestamp}@blueprints.com`,
    });

    const user3 = await this.createTestUser({
      username: `newbie_${timestamp}`,
      email: `newbie_${timestamp}@blueprints.com`,
    });

    // Create various blueprints for testing
    const now = Date.now();
    const popularBlueprint = await this.createTestBlueprint(user1._id as Types.ObjectId, {
      name: 'Super Coal Generator Setup',
      createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      data: {
        version: '1.0',
        buildings: [
          { id: 'Generator', x: 0, y: 0, element: 'Coal' },
          { id: 'Battery', x: 1, y: 0 },
          { id: 'Wire', x: 2, y: 0 },
        ],
        info: {
          name: 'Super Coal Generator Setup',
          description: 'Efficient coal power generation with automation',
        },
      },
    });

    const recentBlueprint = await this.createTestBlueprint(user2._id as Types.ObjectId, {
      name: 'Oxygen Production Line',
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      data: {
        version: '1.0',
        buildings: [
          { id: 'Electrolyzer', x: 0, y: 0 },
          { id: 'Pump', x: 1, y: 0 },
        ],
        info: {
          name: 'Oxygen Production Line',
          description: 'Basic oxygen production setup',
        },
      },
    });

    const oldBlueprint = await this.createTestBlueprint(user3._id as Types.ObjectId, {
      name: 'Legacy Food System',
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      data: {
        version: '0.9',
        buildings: [
          { id: 'FarmTile', x: 0, y: 0 },
          { id: 'MealLice', x: 0, y: 1 },
        ],
        info: {
          name: 'Legacy Food System',
          description: 'Old-style farming setup',
        },
      },
    });

    const copiedBlueprint = await this.createTestBlueprint(user3._id as Types.ObjectId, {
      name: 'Modified Coal Generator',
      isCopy: true,
      copyOf: popularBlueprint._id as Types.ObjectId,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      data: {
        version: '1.0',
        buildings: [
          { id: 'Generator', x: 0, y: 0, element: 'Coal' },
          { id: 'Battery', x: 1, y: 0 },
          { id: 'Wire', x: 2, y: 0 },
          { id: 'Transformer', x: 3, y: 0 }, // Added modification
        ],
        info: {
          name: 'Modified Coal Generator',
          description: 'Coal generator with power transformation',
        },
      },
    });

    // popular: two ratings (avg 4.5); recent: one rating (avg 4); old/copied: unrated
    await this.seedRatings(popularBlueprint._id as Types.ObjectId, [
      { userId: (user2._id as Types.ObjectId).toString(), value: 5 },
      { userId: (user3._id as Types.ObjectId).toString(), value: 4 },
    ]);
    await this.seedRatings(recentBlueprint._id as Types.ObjectId, [
      { userId: (user1._id as Types.ObjectId).toString(), value: 4 },
    ]);

    return {
      users: { user1, user2, user3 },
      blueprints: { popularBlueprint, recentBlueprint, oldBlueprint, copiedBlueprint },
    };
  }

  static async cleanDatabase() {
    try {
      await BlueprintModel.model.deleteMany({});
      await BlueprintVersionModel.model.deleteMany({});
      await UserModel.model.deleteMany({});
      await FeedbackModel.model.deleteMany({});
      await FollowModel.model.deleteMany({});
      await CommentModel.model.deleteMany({});
      await NotificationModel.model.deleteMany({});
      await PreviewImageModel.model.deleteMany({});
      await BlueprintEventModel.model.deleteMany({});
      await BlueprintRatingModel.model.deleteMany({});
      TestDataFactory.reset();
    } catch (error) {
      console.error('Error cleaning database:', error);
      throw error;
    }
  }
}
