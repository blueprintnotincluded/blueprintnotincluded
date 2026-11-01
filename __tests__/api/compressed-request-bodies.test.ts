import { expect } from 'chai';
import zlib from 'zlib';

import { TestSetup } from '../setup/testSetup';

// Node 20 has no fix for the bundled Brotli decoder's out-of-bounds write
// (CVE-2026-111497), and body-parser 2.x decodes compressed request bodies by
// default. The parsers run with inflate: false, so the decoder never sees one.
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
});
