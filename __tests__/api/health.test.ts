import { expect } from 'chai';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';

describe('Health API', function () {
  before(async function () {
    this.timeout(10000);
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  after(async function () {});

  beforeEach(async function () {
    this.timeout(5000);
    await TestSetup.beforeEach();
  });

  afterEach(async function () {
    this.timeout(5000);
    await TestSetup.afterEach();
  });

  describe('GET /api/health', function () {
    it('should return 200 with ok status when DB is connected', async function () {
      const response = await TestSetup.request().get('/api/health');

      expect(response.status).to.equal(200);
      expect(response.body.status).to.equal('ok');
    });

    it('should report DB as connected', async function () {
      const response = await TestSetup.request().get('/api/health');

      expect(response.body.checks).to.be.an('object');
      expect(response.body.checks.db).to.deep.include({ status: 'connected', ok: true });
    });

    it('should include memory stats', async function () {
      const response = await TestSetup.request().get('/api/health');

      const { memory } = response.body;
      expect(memory).to.be.an('object');
      expect(memory.heapUsedMb).to.be.a('number').and.greaterThan(0);
      expect(memory.heapTotalMb).to.be.a('number').and.greaterThan(0);
      expect(memory.rssMb).to.be.a('number').and.greaterThan(0);
      expect(memory.heapUsedMb).to.be.at.most(memory.heapTotalMb);
    });

    it('should include uptime in seconds', async function () {
      const response = await TestSetup.request().get('/api/health');

      expect(response.body.uptime).to.be.a('number').and.greaterThan(0);
    });

    it('should be accessible without authentication', async function () {
      const response = await TestSetup.request().get('/api/health');

      expect(response.status).to.not.equal(401);
      expect(response.status).to.not.equal(403);
    });
  });
});
