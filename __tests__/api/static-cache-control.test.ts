import { expect } from 'chai';
import * as path from 'path';
import { ONE_DAY_SECONDS, ONE_YEAR_SECONDS, staticCacheControl } from '../../app/static-controller';

// The policy express.static applies to app/public (routes.ts). Everything not
// matched here keeps express's default `max-age=0` + ETag revalidation.
describe('staticCacheControl', () => {
  const pub = (rel: string) => path.join('/bpni/build/app/public', ...rel.split('/'));

  it('gives the game art a day', () => {
    for (const file of [
      'assets/ui_image/Tile.png',
      'assets/ui_thumb/Tile.webp',
      'assets/connection_sprites/Wire/15.png',
      'assets/images/ui/manual/logo.png',
      'assets/fonts/GraysonPixel.woff2',
    ])
      expect(staticCacheControl(pub(file)), file).to.equal(`public, max-age=${ONE_DAY_SECONDS}`);
  });

  it('marks hashed bundles immutable', () => {
    for (const file of ['main-K3ZPHQ7B.js', 'chunk-ABCD1234.js', 'styles-5F2C6V7Q.css'])
      expect(staticCacheControl(pub(file)), file).to.equal(
        `public, max-age=${ONE_YEAR_SECONDS}, immutable`
      );
  });

  it('marks the hashed database zip immutable', () => {
    expect(staticCacheControl(pub('assets/database/database-2024-3c455b595fdbd617.zip'))).to.equal(
      `public, max-age=${ONE_YEAR_SECONDS}, immutable`
    );
  });

  it('leaves the loose database, the strings, the HTML and unhashed files on the default', () => {
    for (const file of [
      'assets/database/database-2024.zip',
      'assets/database/database-2024.json',
      'assets/strings/strings.json',
      'index.html',
      'main.js',
      'scripts.js',
      'favicon.ico',
      'site.webmanifest',
      'assets/strings/strings.json',
    ])
      expect(staticCacheControl(pub(file)), file).to.equal(null);
  });
});
