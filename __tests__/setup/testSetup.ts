import request from 'supertest';
import app from '../../app/app';
import { TestDbHelper } from '../helpers/testDb';

export class TestSetup {
  static testData: any;

  static async beforeEach() {
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
