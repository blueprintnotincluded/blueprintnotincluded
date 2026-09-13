import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';

import { authMode, isLocalAuthMode } from '../../app/api/auth-mode';

describe('auth-mode', function () {
  const originalAuthMode = process.env.AUTH_MODE;
  const originalEnvName = process.env.ENV_NAME;

  afterEach(function () {
    if (originalAuthMode === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = originalAuthMode;
    if (originalEnvName === undefined) delete process.env.ENV_NAME;
    else process.env.ENV_NAME = originalEnvName;
  });

  it('defaults to workos when AUTH_MODE is unset', function () {
    delete process.env.AUTH_MODE;
    expect(authMode()).to.equal('workos');
    expect(isLocalAuthMode()).to.equal(false);
  });

  it('returns local when AUTH_MODE=local (non-production)', function () {
    process.env.AUTH_MODE = 'local';
    process.env.ENV_NAME = 'development';
    expect(authMode()).to.equal('local');
    expect(isLocalAuthMode()).to.equal(true);
  });

  it('throws when AUTH_MODE is an unknown value', function () {
    process.env.AUTH_MODE = 'bogus';
    expect(() => authMode()).to.throw(/Invalid AUTH_MODE/);
  });

  it('throws when AUTH_MODE=local and ENV_NAME=production', function () {
    process.env.AUTH_MODE = 'local';
    process.env.ENV_NAME = 'production';
    expect(() => authMode()).to.throw(/not allowed when ENV_NAME=production/);
  });

  it('allows AUTH_MODE=workos even when ENV_NAME=production', function () {
    process.env.AUTH_MODE = 'workos';
    process.env.ENV_NAME = 'production';
    expect(authMode()).to.equal('workos');
  });
});
