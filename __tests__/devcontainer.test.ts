// The dev container image is published to ghcr.io by hand
// (scripts/publish-devcontainer.sh) under a tag that names its Node version,
// and compose pulls that tag. A Node bump that misses one of these four places
// either runs the old toolchain under a new name or publishes a new toolchain
// under an old tag, so they move together.
import { expect } from 'chai';
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('.devcontainer', () => {
  const compose = read('.devcontainer/docker-compose.yml');
  const dockerfile = read('.devcontainer/Dockerfile');
  const nvmrc = read('.nvmrc').trim();

  it('pins the same Node version in the image tag, the build arg, the Dockerfile and .nvmrc', () => {
    const image = compose.match(/^ {2}image: ghcr\.io\/blueprintnotincluded\/blueprintnotincluded-dev:node-(\d+\.\d+\.\d+)(-r\d+)?$/m);
    const arg = compose.match(/^ {6}NODE_VERSION: '(\d+\.\d+\.\d+)'$/m);
    const dockerDefault = dockerfile.match(/^ARG NODE_VERSION=(\d+\.\d+\.\d+)$/m);

    expect(image, 'image: ghcr.io/blueprintnotincluded/blueprintnotincluded-dev:node-<version>[-r<n>]').to.not.equal(null);
    expect(arg, "build arg NODE_VERSION: '<version>'").to.not.equal(null);
    expect(dockerDefault, 'ARG NODE_VERSION=<version>').to.not.equal(null);
    expect(image![1]).to.equal(nvmrc);
    expect(arg![1]).to.equal(nvmrc);
    expect(dockerDefault![1]).to.equal(nvmrc);
  });

  it('names the image once, on the anchor every Node service shares', () => {
    // The publish script reads the tag from this line; a second image line
    // would be a second toolchain.
    expect(compose.match(/^\s*image: .*blueprintnotincluded-dev/gm)).to.have.length(1);
    for (const svc of ['app', 'api', 'web']) {
      expect(compose).to.match(new RegExp(`^ {2}${svc}:\\n(?: {4}#.*\\n)* {4}<<: \\*node$`, 'm'));
    }
  });

  it('labels the image with its source repository so ghcr.io links the package', () => {
    expect(dockerfile).to.match(
      /^LABEL org\.opencontainers\.image\.source=https:\/\/github\.com\/blueprintnotincluded\/blueprintnotincluded$/m,
    );
  });
});
