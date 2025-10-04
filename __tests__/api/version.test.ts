import { expect } from 'chai';
import * as dotenv from 'dotenv';

import path from 'path';

// Load test environment first
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';

describe('Version API (Mocha)', function () {
  // Global setup
  before(async function () {
    this.timeout(10000);
    // Give the app time to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  after(async function () {
    // Local cleanup - don't close database connection as other tests might still need it
  });

  // Skip database setup for version tests since they don't need it
  beforeEach(async function () {
    this.timeout(5000);
    // Version endpoint doesn't require database, so skip TestSetup.beforeEach()
  });

  afterEach(async function () {
    this.timeout(5000);
    // Version endpoint doesn't require database, so skip TestSetup.afterEach()
  });

  describe('GET /api/version', function () {
    it('should return version information with all required fields', async function () {
      const response = await TestSetup.request().get('/api/version');

      expect(response.status).to.equal(200);
      expect(response.body).to.be.an('object');

      // Check required fields
      expect(response.body).to.have.property('version');
      expect(response.body).to.have.property('name');
      expect(response.body).to.have.property('buildTime');
      expect(response.body).to.have.property('environment');
      expect(response.body).to.have.property('nodeVersion');

      // Check field types
      expect(response.body.version).to.be.a('string');
      expect(response.body.name).to.be.a('string');
      expect(response.body.buildTime).to.be.a('string');
      expect(response.body.environment).to.be.a('string');
      expect(response.body.nodeVersion).to.be.a('string');
    });

    it('should return valid package version from package.json', async function () {
      const response = await TestSetup.request().get('/api/version');

      expect(response.status).to.equal(200);
      expect(response.body.version).to.match(/^\d+\.\d+\.\d+$/); // Semantic version format
      expect(response.body.name).to.equal('blueprintnotincluded-backend');
    });

    it('should return valid build time in ISO format', async function () {
      const response = await TestSetup.request().get('/api/version');

      expect(response.status).to.equal(200);
      expect(response.body.buildTime).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO format

      // Should be a valid date
      const buildDate = new Date(response.body.buildTime);
      expect(buildDate.getTime()).to.not.be.NaN;
    });

    it('should return test environment in test mode', async function () {
      const response = await TestSetup.request().get('/api/version');

      expect(response.status).to.equal(200);
      // Environment should be 'test' when NODE_ENV=test, or 'development' as fallback
      expect(['test', 'development']).to.include(response.body.environment);
    });

    it('should return valid Node.js version', async function () {
      const response = await TestSetup.request().get('/api/version');

      expect(response.status).to.equal(200);
      expect(response.body.nodeVersion).to.match(/^v\d+\.\d+\.\d+/); // Node version format
    });

    it('should include git information when available', async function () {
      const response = await TestSetup.request().get('/api/version');

      expect(response.status).to.equal(200);

      // Git info is optional, but if present should be valid
      if (response.body.buildCommit) {
        expect(response.body.buildCommit).to.be.a('string');
        expect(response.body.buildCommit).to.match(/^[a-f0-9]{40}$/); // SHA-1 hash format
      }

      if (response.body.buildBranch) {
        expect(response.body.buildBranch).to.be.a('string');
        expect(response.body.buildBranch.length).to.be.greaterThan(0);
      }
    });

    it('should be accessible without authentication', async function () {
      const response = await TestSetup.request().get('/api/version');

      expect(response.status).to.equal(200);
      // No authentication required for version endpoint
    });

    it('should return consistent response structure', async function () {
      const response1 = await TestSetup.request().get('/api/version');

      const response2 = await TestSetup.request().get('/api/version');

      expect(response1.status).to.equal(200);
      expect(response2.status).to.equal(200);

      // Response structure should be consistent
      expect(Object.keys(response1.body)).to.deep.equal(Object.keys(response2.body));

      // Static fields should be the same
      expect(response1.body.version).to.equal(response2.body.version);
      expect(response1.body.name).to.equal(response2.body.name);
      expect(response1.body.environment).to.equal(response2.body.environment);
      expect(response1.body.nodeVersion).to.equal(response2.body.nodeVersion);
    });
  });
});
