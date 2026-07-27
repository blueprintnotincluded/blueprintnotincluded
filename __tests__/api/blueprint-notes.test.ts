import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';
import { Blueprint, BniBlueprint } from '../../lib';

// World notes are now normal blueprint content (spec/element-notes.md §1):
// they live in `data` exactly like planningToolShapes, so save, fork and
// version restore all carry them for free — nothing note-specific in the
// controller. This proves that end to end against the real BPv2 fixture.
const FIXTURE_PATH = path.join(__dirname, '../fixtures/bpv2-example-meta.blueprint');
const FIXTURE: BniBlueprint = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

const notesBlueprintData = () => {
  const blueprint = new Blueprint();
  blueprint.importFromBni(FIXTURE);
  return blueprint.toMdbBlueprint();
};

const EMPTY_DATA = { blueprintItems: [] };

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('World notes save / version-restore API', function () {
  let authToken: string;
  let testData: any;

  const upload = (body: Record<string, unknown>) =>
    TestSetup.request()
      .post('/api/uploadblueprint')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ thumbnail: TINY_PNG, publish: true, ...body });

  // The rendered/current data always resolves through the current
  // BlueprintVersion (blueprint-version-service.ts resolveCurrentData) — the
  // cached Blueprint.data field is not authoritative after a version restore.
  const currentData = async (id: string) =>
    (
      await TestSetup.request()
        .get(`/api/getblueprint/${id}`)
        .set('Authorization', `Bearer ${authToken}`)
    ).body.data;

  beforeEach(async function () {
    this.timeout(15000);
    testData = await TestSetup.beforeEach();
    authToken = testData.users.user1.generateJwt();
  });

  afterEach(async function () {
    this.timeout(5000);
    await TestSetup.afterEach();
  });

  it('stores world notes uploaded as part of the blueprint data', async function () {
    const response = await upload({ name: 'Notes Base', blueprint: notesBlueprintData() });
    expect(response.status).to.equal(200);

    const data = await currentData(response.body.id);
    expect(data.worldNotes).to.have.length(3);
  });

  it('re-derives from the overwritten data, dropping notes when the new save has none', async function () {
    const first = await upload({ name: 'Evolving Notes', blueprint: notesBlueprintData() });
    expect(first.status).to.equal(200);

    const second = await upload({
      name: 'Evolving Notes',
      blueprint: EMPTY_DATA,
      overwrite: true,
    });
    expect(second.status).to.equal(200);

    const data = await currentData(second.body.id);
    expect(data.worldNotes ?? []).to.have.length(0);
  });

  it('keeps world notes through version snapshot + restore', async function () {
    this.timeout(15000);
    const id = (await upload({ name: 'Versioned Notes', blueprint: notesBlueprintData() })).body
      .id;

    // Snapshot the notes-bearing state, then overwrite with notes-free content.
    const snapshot = (
      await TestSetup.request()
        .post(`/api/blueprints/${id}/versions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'notes snapshot' })
    ).body.version;

    await upload({ name: 'Versioned Notes', blueprint: EMPTY_DATA, overwrite: true });
    expect((await currentData(id)).worldNotes ?? []).to.have.length(0);

    // The explicit snapshot becomes (and stays) the current version, so the
    // version left holding the original notes-bearing data is the *other*
    // one — the blueprint's initial auto-created version.
    const versions = (
      await TestSetup.request().get(`/api/blueprints/${id}/versions`)
    ).body.versions;
    const earlier = versions.find((v: any) => v.id !== snapshot.id) ?? snapshot;

    const restore = await TestSetup.request()
      .post(`/api/blueprints/${id}/versions/${earlier.id}/restore`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(restore.status).to.equal(200);

    expect((await currentData(id)).worldNotes).to.have.length(3);
  });

  it('carries world notes onto a fork', async function () {
    const original = await upload({ name: 'Forked Notes', blueprint: notesBlueprintData() });
    expect(original.status).to.equal(200);

    const fork = await TestSetup.request()
      .post(`/api/blueprints/${original.body.id}/fork`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(fork.status).to.equal(200);

    expect((await currentData(fork.body.id)).worldNotes).to.have.length(3);
  });
});
