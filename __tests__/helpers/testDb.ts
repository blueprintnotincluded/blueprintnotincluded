import { UserModel } from '../../app/api/models/user';
import { BlueprintModel } from '../../app/api/models/blueprint';
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
      tags: ['power', 'coal', 'automation'],
      likes: [(user2._id as Types.ObjectId).toString(), (user3._id as Types.ObjectId).toString()],
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
      tags: ['oxygen', 'life-support'],
      likes: [(user1._id as Types.ObjectId).toString()],
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
      tags: ['food', 'farming', 'legacy'],
      likes: [],
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
      tags: ['power', 'coal', 'modified'],
      likes: [],
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

    return {
      users: { user1, user2, user3 },
      blueprints: { popularBlueprint, recentBlueprint, oldBlueprint, copiedBlueprint },
    };
  }

  static async cleanDatabase() {
    try {
      await BlueprintModel.model.deleteMany({});
      await UserModel.model.deleteMany({});
      TestDataFactory.reset();
    } catch (error) {
      console.error('Error cleaning database:', error);
      throw error;
    }
  }
}
