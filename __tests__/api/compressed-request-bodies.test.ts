import { expect } from 'chai';
import zlib from 'zlib';

import { TestSetup } from '../setup/testSetup';

// Defense in depth for the bundled Brotli decoder's out-of-bounds write
// (CVE-2026-111497; the runtime is pinned to a fixed Node 24): body-parser 2.x
// decodes compressed request bodies by default. The parsers run with
// inflate: false, so the decoder never sees one.
describe('compressed request bodies', function () {
  const json = Buffer.from(JSON.stringify({ email: 'a@bpni.local', password: 'x' }));

  for (const [encoding, body] of [
    ['br', zlib.brotliCompressSync(json)],
    ['gzip', zlib.gzipSync(json)],
    ['deflate', zlib.deflateSync(json)],
  ] as const) {
    it(`rejects a ${encoding} JSON body with 415 before any route runs`, async function () {
      const response = await TestSetup.request()
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', encoding)
        .send(body);

      expect(response.status).to.equal(415);
    });
  }

  describe('avatar upload (express.raw)', function () {
    let testData: any;

    beforeEach(async function () {
      testData = await TestSetup.beforeEach();
    });

    afterEach(async function () {
      await TestSetup.afterEach();
    });

    it('rejects a br image body with 415 before the controller runs', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post('/api/users/me/avatar/generate')
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'image/png')
        .set('Content-Encoding', 'br')
        .send(zlib.brotliCompressSync(Buffer.from('not really a png')));

      expect(response.status).to.equal(415);
    });
  });
});
