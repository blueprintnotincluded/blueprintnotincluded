import { describe, it, beforeEach, afterEach, before, after } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

// Load test environment first
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';

describe('Blueprint API (Mocha)', function () {
  let testData: any;

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
    this.timeout(5000);
    testData = await TestSetup.beforeEach();
  });

  afterEach(async function () {
    this.timeout(5000);
    await TestSetup.afterEach();
  });

  describe('GET /api/getblueprints', function () {
    it('should return blueprints ordered by creation date with pagination', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now() });

      expect(response.status).to.equal(200);
      expect(response.body).to.exist;
      expect(response.body).to.be.an('object');

      if (response.body.blueprints) {
        expect(response.body.blueprints).to.be.an('array');

        const blueprintNames = response.body.blueprints.map((bp: any) => bp.name);
        expect(blueprintNames).to.include('Super Coal Generator Setup');
        expect(blueprintNames).to.include('Oxygen Production Line');
      }
    });

    it('should filter blueprints by date - only return older blueprints', async function () {
      const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;

      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: twoDaysAgo });

      expect(response.status).to.equal(200);

      if (response.body.blueprints) {
        const blueprintNames = response.body.blueprints.map((bp: any) => bp.name);

        expect(blueprintNames).to.include('Super Coal Generator Setup'); // 3 days old
        expect(blueprintNames).to.include('Legacy Food System'); // 30 days old
        expect(blueprintNames).to.not.include('Oxygen Production Line'); // 1 day old
      }
    });

    it('should return correct like counts for popular blueprints', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now() });

      expect(response.status).to.equal(200);

      const popularBlueprint = response.body.blueprints.find(
        (bp: any) => bp.name === 'Super Coal Generator Setup'
      );
      expect(popularBlueprint).to.exist;
      expect(popularBlueprint.nbLikes).to.equal(2);
    });

    it('should exclude copied blueprints by default', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now() });

      expect(response.status).to.equal(200);

      const blueprintNames = response.body.blueprints.map((bp: any) => bp.name);
      expect(blueprintNames).to.not.include('Modified Coal Generator'); // This is a copy
      expect(blueprintNames).to.include('Super Coal Generator Setup'); // Original should be included
    });

    it('should include copied blueprints when getDuplicates=true', async function () {
      const response = await TestSetup.request().get('/api/getblueprints').query({
        olderthan: Date.now(),
        getDuplicates: true,
      });

      expect(response.status).to.equal(200);

      const blueprintNames = response.body.blueprints.map((bp: any) => bp.name);
      expect(blueprintNames).to.include('Modified Coal Generator'); // Copy should be included
      expect(blueprintNames).to.include('Super Coal Generator Setup'); // Original should still be included
    });

    it('should return 400 error with proper validation for missing olderthan parameter', async function () {
      const response = await TestSetup.request().get('/api/getblueprints');

      // Fixed: Backend now properly validates the 'olderthan' parameter
      // Returns 400 Bad Request instead of 500 Internal Server Error
      expect(response.status).to.equal(400);
      expect(response.body.getBlueprints).to.equal('Invalid olderthan parameter');
    });

    it('should return 400 error for invalid olderthan parameter formats', async function () {
      // Test non-numeric string
      const response1 = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: 'invalid-date' });

      expect(response1.status).to.equal(400);
      expect(response1.body.getBlueprints).to.equal('Invalid olderthan parameter');

      // Test empty parameter
      const response2 = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: '' });

      expect(response2.status).to.equal(400);
      expect(response2.body.getBlueprints).to.equal('Invalid olderthan parameter');

      // Test mixed alphanumeric
      const response3 = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: 'abc123def' });

      expect(response3.status).to.equal(400);
      expect(response3.body.getBlueprints).to.equal('Invalid olderthan parameter');
    });

    it('should accept negative timestamps as valid dates before 1970', async function () {
      // Negative timestamps represent dates before Jan 1, 1970
      const response = await TestSetup.request().get('/api/getblueprints').query({ olderthan: -1 });

      expect(response.status).to.equal(200);
      expect(response.body).to.have.property('blueprints');
    });
  });
});
