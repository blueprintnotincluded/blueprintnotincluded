import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';
import { BlueprintModel } from '../../app/api/models/blueprint';

// Byte-exact BlueprintsV2 round-trip (spec/blueprintsv2-import-spec.md §8):
// the verbatim uploaded .blueprint text is stored with the save and served
// back unmodified by GET /api/blueprints/:id/raw. Edited saves clear it.
const FIXTURE_TEXT = fs.readFileSync(
  path.resolve(__dirname, '../fixtures/bpv2-example-meta.blueprint'),
  'utf8'
);

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const SIMPLE_DATA = { blueprintItems: [{ id: 'Tile', position: { x: 0, y: 0 } }] };

describe('Blueprint raw source round-trip API', function () {
  let authToken: string;
  let testData: any;

  const upload = (body: Record<string, unknown>) =>
    TestSetup.request()
      .post('/api/uploadblueprint')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ thumbnail: TINY_PNG, publish: true, blueprint: SIMPLE_DATA, ...body });

  beforeEach(async function () {
    this.timeout(15000);
    testData = await TestSetup.beforeEach();
    authToken = testData.users.user1.generateJwt();
  });

  afterEach(async function () {
    this.timeout(5000);
    await TestSetup.afterEach();
  });

  it('stores the verbatim upload and serves it back byte-exact', async function () {
    const saved = await upload({
      name: 'BPv2 Import',
      rawSource: FIXTURE_TEXT,
      rawSourceFormat: 'bpv2-json',
    });
    expect(saved.status).to.equal(200);

    const raw = await TestSetup.request().get(`/api/blueprints/${saved.body.id}/raw`);
    expect(raw.status).to.equal(200);
    expect(raw.headers['content-type']).to.contain('application/json');
    expect(raw.headers['content-disposition']).to.contain('.blueprint');
    expect(raw.text).to.equal(FIXTURE_TEXT);
  });

  it('serves share-string uploads as text with a .txt filename', async function () {
    const saved = await upload({
      name: 'BPv2 Share String',
      rawSource: 'SGVsbG8gd29ybGQ=',
      rawSourceFormat: 'bpv2-sharestring',
    });
    expect(saved.status).to.equal(200);

    const raw = await TestSetup.request().get(`/api/blueprints/${saved.body.id}/raw`);
    expect(raw.status).to.equal(200);
    expect(raw.headers['content-type']).to.contain('text/plain');
    expect(raw.headers['content-disposition']).to.contain('.txt');
    expect(raw.text).to.equal('SGVsbG8gd29ybGQ=');
  });

  it('404s when the blueprint has no stored raw source', async function () {
    const saved = await upload({ name: 'No Raw' });
    expect(saved.status).to.equal(200);

    const raw = await TestSetup.request().get(`/api/blueprints/${saved.body.id}/raw`);
    expect(raw.status).to.equal(404);
  });

  it('clears the stored raw when an overwrite save omits it (edited content)', async function () {
    const first = await upload({
      name: 'Edited Later',
      rawSource: FIXTURE_TEXT,
      rawSourceFormat: 'bpv2-json',
    });
    expect(first.status).to.equal(200);

    const second = await upload({ name: 'Edited Later', overwrite: true });
    expect(second.status).to.equal(200);
    expect(second.body.id).to.equal(first.body.id);

    const doc = await BlueprintModel.model.findById(first.body.id).select('+rawSource').lean();
    expect(doc!.rawSource).to.equal(null);

    const raw = await TestSetup.request().get(`/api/blueprints/${first.body.id}/raw`);
    expect(raw.status).to.equal(404);
  });

  it('draft raw source is hidden from anonymous viewers', async function () {
    const saved = await upload({
      name: 'Draft Raw',
      publish: false,
      rawSource: FIXTURE_TEXT,
      rawSourceFormat: 'bpv2-json',
    });
    expect(saved.status).to.equal(200);

    const anonymous = await TestSetup.request().get(`/api/blueprints/${saved.body.id}/raw`);
    expect(anonymous.status).to.equal(404);

    const owner = await TestSetup.request()
      .get(`/api/blueprints/${saved.body.id}/raw`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(owner.status).to.equal(200);
    expect(owner.text).to.equal(FIXTURE_TEXT);
  });

  it('rejects an unknown rawSourceFormat', async function () {
    const saved = await upload({
      name: 'Bad Format',
      rawSource: FIXTURE_TEXT,
      rawSourceFormat: 'not-a-format',
    });
    expect(saved.status).to.equal(400);
  });

  it('rejects a rawSource above the size cap', async function () {
    const saved = await upload({
      name: 'Too Big',
      rawSource: 'x'.repeat(2 * 1024 * 1024 + 1),
      rawSourceFormat: 'bpv2-json',
    });
    // 413 when the whole request trips the body-parser limit first, 400 from
    // the controller's own cap otherwise — either way the save is refused
    expect([400, 413]).to.include(saved.status);
  });

  it('getblueprint reports hasRawSource so clients can prefer the raw download', async function () {
    const saved = await upload({
      name: 'Flagged',
      rawSource: FIXTURE_TEXT,
      rawSourceFormat: 'bpv2-json',
    });
    expect(saved.status).to.equal(200);

    const response = await TestSetup.request().get(`/api/getblueprint/${saved.body.id}`);
    expect(response.status).to.equal(200);
    expect(response.body.hasRawSource).to.equal(true);
    expect(response.body.rawSourceFormat).to.equal('bpv2-json');
  });
});
