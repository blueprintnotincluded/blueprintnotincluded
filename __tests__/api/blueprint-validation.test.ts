import { expect } from 'chai';
import dotenv from 'dotenv';

import path from 'path';

// Load test environment first
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';

describe('Blueprint Validation API (Mocha)', function () {
  let testData: any;
  let authToken: string;

  // Global setup
  before(async function () {
    this.timeout(10000);
    // Give the app time to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  after(async function () {
    // Local cleanup - don't close database connection as other tests might still need it
  });

  beforeEach(async function () {
    this.timeout(10000); // Increased timeout to 10 seconds for database operations
    testData = await TestSetup.beforeEach();

    // Register a user and get auth token
    const registerResponse = await TestSetup.request().post('/api/register').send({
      username: 'testuser_validation',
      email: 'testuser_validation@test.com',
      password: 'testpassword123',
    });

    expect(registerResponse.status).to.equal(200);
    authToken = registerResponse.body.token;
  });

  afterEach(async function () {
    this.timeout(5000);
    await TestSetup.afterEach();
  });

  describe('Blueprint name validation', function () {
    it('should reject blueprint names with invalid characters', async function () {
      const response = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Invalid@Name#123',
          blueprint: { test: 'data' },
          thumbnail: 'base64thumbnail',
          overwrite: false,
        });

      expect(response.status).to.equal(500);
      expect(response.body.saveBlueprintResult).to.equal('ERROR');
    });

    it('should reject blueprint names longer than 60 characters', async function () {
      const longName = 'a'.repeat(61); // 61 characters
      const response = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: longName,
          blueprint: { test: 'data' },
          thumbnail: 'base64thumbnail',
          overwrite: false,
        });

      expect(response.status).to.equal(500);
      expect(response.body.saveBlueprintResult).to.equal('ERROR');
    });

    it('should accept valid blueprint names', async function () {
      const response = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Valid-Blueprint_Name 123',
          blueprint: { test: 'data' },
          thumbnail: 'base64thumbnail',
          overwrite: false,
        });

      expect(response.status).to.equal(200);
      expect(response.body.id).to.exist;
    });

    it('should accept blueprint names at exactly 60 characters', async function () {
      const validName = 'a'.repeat(60); // Exactly 60 characters
      const response = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: validName,
          blueprint: { test: 'data' },
          thumbnail: 'base64thumbnail',
          overwrite: false,
        });

      expect(response.status).to.equal(200);
      expect(response.body.id).to.exist;
    });
  });

  describe('Blueprint duplicate handling', function () {
    it('should return overwrite flag when blueprint name already exists', async function () {
      // First, create a blueprint
      const blueprintName = 'Duplicate Test Blueprint';
      await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: blueprintName,
          blueprint: { test: 'data' },
          thumbnail: 'base64thumbnail',
          overwrite: false,
        });

      // Try to create another blueprint with the same name
      const response = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: blueprintName,
          blueprint: { test: 'different data' },
          thumbnail: 'base64thumbnail',
          overwrite: false,
        });

      expect(response.status).to.equal(200);
      expect(response.body.overwrite).to.be.true;
    });

    it('should allow overwriting when overwrite flag is true', async function () {
      const blueprintName = 'Overwrite Test Blueprint';

      // Create initial blueprint
      const initialResponse = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: blueprintName,
          blueprint: { test: 'initial data' },
          thumbnail: 'base64thumbnail',
          overwrite: false,
        });

      expect(initialResponse.status).to.equal(200);
      const initialId = initialResponse.body.id;

      // Overwrite the blueprint
      const overwriteResponse = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: blueprintName,
          blueprint: { test: 'overwritten data' },
          thumbnail: 'base64thumbnail',
          overwrite: true,
        });

      expect(overwriteResponse.status).to.equal(200);
      expect(overwriteResponse.body.id).to.equal(initialId);
    });
  });
});
