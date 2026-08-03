import { expect } from 'chai';
import dotenv from 'dotenv';

import path from 'path';

// Load test environment first
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';

describe('Blueprint Validation API (Mocha)', function () {
  let authToken: string;

  beforeEach(async function () {
    this.timeout(15000);
    const testData = await TestSetup.beforeEach();
    authToken = testData.users.user1.generateJwt();
  });

  afterEach(async function () {
    this.timeout(5000);
    await TestSetup.afterEach();
  });

  // Character-class coverage lives in the pure policy spec
  // (__tests__/lib/blueprint-name.test.ts); these assert that the endpoint
  // applies that policy and stores the normalized form.
  describe('Blueprint name validation', function () {
    const upload = (name: string, extra: Record<string, unknown> = {}) =>
      TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name,
          blueprint: { test: 'data' },
          thumbnail: 'base64thumbnail',
          overwrite: false,
          ...extra,
        });

    it('should accept non-Latin blueprint names', async function () {
      // The phase-3a fix: each of these was a 400 under the old ASCII regex,
      // which meant a non-English build could not be saved at all.
      for (const name of ['电解制氧系统', 'Ферма для слизи', '산소 발생기', 'Máy lọc nước']) {
        const response = await upload(name);
        expect(response.status, name).to.equal(200);
        expect(response.body.id, name).to.exist;
      }
    });

    it('should accept punctuation the old ASCII regex rejected', async function () {
      const response = await upload('Invalid@Name#123');
      expect(response.status).to.equal(200);
    });

    it('should reject a name with invisible or direction-changing characters', async function () {
      // U+202E right-to-left override, written as an escape so it is visible here.
      const response = await upload('Base\u202eOne');
      expect(response.status).to.equal(400);
      expect(response.body.errors).to.be.an('array');
      expect(response.body.errors[0].status).to.equal('400');
    });

    it('should reject Latin/Cyrillic homoglyph mixing inside one word', async function () {
      // U+043E Cyrillic small o, indistinguishable from ASCII 'o'.
      const response = await upload('R\u043edriguez');
      expect(response.status).to.equal(400);
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

      expect(response.status).to.equal(400);
      expect(response.body.errors).to.be.an('array');
      expect(response.body.errors[0].status).to.equal('400');
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

    it('should treat differently-normalized spellings of one name as the same blueprint', async function () {
      // macOS hands over decomposed text, Windows composed. Without NFC at
      // ingress these are two documents with visually identical titles, and
      // the author cannot overwrite their own blueprint from the other
      // machine — the {owner, name} check is an exact string match.
      const composed = 'M\u00e1y l\u1ecdc';
      const decomposed = 'Ma\u0301y lo\u0323c';

      const first = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: composed,
          blueprint: { test: 'data' },
          thumbnail: 'base64thumbnail',
          overwrite: false,
        });
      expect(first.status).to.equal(200);

      const second = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: decomposed,
          blueprint: { test: 'data' },
          thumbnail: 'base64thumbnail',
          overwrite: false,
        });
      expect(second.body.overwrite).to.be.true;

      const overwritten = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: decomposed,
          blueprint: { test: 'other data' },
          thumbnail: 'base64thumbnail',
          overwrite: true,
        });
      expect(overwritten.status).to.equal(200);
      expect(overwritten.body.id).to.equal(first.body.id);
    });

    it('should store the name in normalized form', async function () {
      const response = await TestSetup.request()
        .post('/api/uploadblueprint')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: '  Padded   Name  ',
          blueprint: { test: 'data' },
          thumbnail: 'base64thumbnail',
          overwrite: false,
        });
      expect(response.status).to.equal(200);

      // Owner token: a fresh upload is a draft, invisible to anonymous readers.
      const details = await TestSetup.request()
        .get(`/api/blueprints/${response.body.id}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(details.status).to.equal(200);
      expect(details.body.name).to.equal('Padded Name');
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
