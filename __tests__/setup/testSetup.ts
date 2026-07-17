import request from 'supertest';
import app from '../../app/app';
import { BlueprintController } from '../../app/api/blueprint-controller';
import { TestDbHelper } from '../helpers/testDb';

export class TestSetup {
  static testData: any;

  static async beforeEach() {
    // Trending rankings are memoized in-process; a stale ranking from a
    // previous test would hide blueprints created in this one
    BlueprintController.clearTrendingCache();
    await TestDbHelper.cleanDatabase();
    this.testData = await TestDbHelper.seedDatabase();
    return this.testData;
  }

  static async afterEach() {
    await TestDbHelper.cleanDatabase();
  }

  static request() {
    return request(app);
  }
}

export { TestDbHelper };
