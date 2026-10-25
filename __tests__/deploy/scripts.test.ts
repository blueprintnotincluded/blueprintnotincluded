// The server-side tooling in deploy/bin, run against a temporary BPNI_ROOT with
// a stub compose.sh in place of docker compose. These scripts rebuild and
// re-seed production; the failure modes checked here are the ones that bit on
// the first cut-over (2026-10-24): a dump that failed but was still "restored",
// an archive given as a path, a source URI that was never set.
import { expect } from 'chai';
import { spawnSync, SpawnSyncReturns } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const repoBin = path.resolve(__dirname, '../../deploy/bin');
const repoEnv = path.resolve(__dirname, '../../deploy/env');
const ENV_FILES = ['production/.env', 'production/app.env', 'staging/.env', 'staging/app.env'];

// compose.sh stand-in: records every call, fakes mongodump / mongorestore /
// mongosh. STUB_DUMP_FAIL=1 makes mongodump fail the way a bad URI does.
const STUB_COMPOSE = `#!/bin/bash
printf '%s\\n' "$*" >> "$STUB_LOG"
root=\${BPNI_ROOT}
case "$*" in
  *mongodump*)
    if [ "\${STUB_DUMP_FAIL:-}" = 1 ]; then echo "Failed: error connecting" >&2; exit 1; fi
    name=$(printf '%s\\n' "$@" | sed -n 's|^--archive=/dumps/||p')
    mkdir -p "$root/dumps"; echo fake-dump > "$root/dumps/$name" ;;
  *mongorestore*) echo "restored" ;;
  *mongosh*) case "$*" in *drop*) echo "dropped blueprints" ;; *) echo "blueprints 5" ;; esac ;;
esac
exit 0
`;

interface Sandbox { tmp: string; root: string; bin: string; log: string }

function makeSandbox(): Sandbox {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bpni-deploy-'));
  const root = path.join(tmp, 'srv');
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
  for (const f of fs.readdirSync(repoBin)) fs.copyFileSync(path.join(repoBin, f), path.join(bin, f));
  fs.writeFileSync(path.join(bin, 'compose.sh'), STUB_COMPOSE, { mode: 0o755 });
  // cloud-init-render.sh reads the template next to its bin directory
  fs.copyFileSync(path.resolve(repoBin, '../cloud-init.yaml'), path.join(tmp, 'cloud-init.yaml'));
  fs.mkdirSync(path.join(root, 'deploy', 'env'), { recursive: true });
  for (const f of fs.readdirSync(repoEnv)) fs.copyFileSync(path.join(repoEnv, f), path.join(root, 'deploy', 'env', f));
  return { tmp, root, bin, log: path.join(tmp, 'compose.log') };
}

function run(sb: Sandbox, script: string, args: string[], extraEnv: Record<string, string> = {}): SpawnSyncReturns<string> {
  const env: Record<string, string> = { PATH: process.env.PATH ?? '', HOME: sb.tmp, BPNI_ROOT: sb.root, STUB_LOG: sb.log, ...extraEnv };
  return spawnSync('bash', [path.join(sb.bin, script), ...args], { encoding: 'utf8', env });
}

const composeLog = (sb: Sandbox) => (fs.existsSync(sb.log) ? fs.readFileSync(sb.log, 'utf8') : '');
const read = (sb: Sandbox, rel: string) => fs.readFileSync(path.join(sb.root, rel), 'utf8');
const mode = (sb: Sandbox, rel: string) => fs.statSync(path.join(sb.root, rel)).mode & 0o777;
const value = (text: string, key: string) => text.split('\n').find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1);

describe('deploy/bin scripts', () => {
  let sb: Sandbox;
  beforeEach(() => { sb = makeSandbox(); });
  afterEach(() => fs.rmSync(sb.tmp, { recursive: true, force: true }));

  it('every script parses', () => {
    for (const f of fs.readdirSync(repoBin)) {
      const r = spawnSync('bash', ['-n', path.join(repoBin, f)], { encoding: 'utf8' });
      expect(r.status, `${f}: ${r.stderr}`).to.equal(0);
    }
  });

  describe('env-bootstrap.sh', () => {
    it('creates the four env files with generated secrets and the public hostnames', () => {
      const r = run(sb, 'env-bootstrap.sh', []);
      expect(r.status, r.stderr).to.equal(0);
      for (const f of ENV_FILES) expect(mode(sb, f), f).to.equal(0o600);
      for (const p of ['production', 'staging']) {
        const env = read(sb, `${p}/.env`);
        for (const k of ['MONGO_ROOT_PASSWORD', 'MONGO_APP_PASSWORD', 'MONGO_BACKUP_PASSWORD']) {
          expect(value(env, k), `${p} ${k}`).to.match(/^[0-9a-f]{48}$/);
        }
      }
      expect(value(read(sb, 'production/.env'), 'PUBLIC_HOSTNAME')).to.equal('blueprintnotincluded.org');
      expect(value(read(sb, 'production/app.env'), 'HOST')).to.equal('https://blueprintnotincluded.org');
      expect(value(read(sb, 'production/app.env'), 'SITE_URL')).to.equal('https://blueprintnotincluded.org');
      expect(value(read(sb, 'staging/.env'), 'PUBLIC_HOSTNAME')).to.equal('staging.blueprintnotincluded.org');
      expect(value(read(sb, 'staging/app.env'), 'HOST')).to.equal('https://staging.blueprintnotincluded.org');
      // production keeps the live JWT secret (filled by hand); staging gets its own
      expect(value(read(sb, 'production/app.env'), 'JWT_SECRET')).to.equal('');
      expect(value(read(sb, 'staging/app.env'), 'JWT_SECRET')).to.match(/^[0-9a-f]{64}$/);
      // the hand-filled keys are listed, the generated ones are not
      expect(r.stdout).to.include('TUNNEL_TOKEN=').and.include('MAILJET_API_KEY=');
      expect(r.stdout).not.to.include('MONGO_ROOT_PASSWORD=');
      // the Mongo passwords differ between projects
      expect(value(read(sb, 'production/.env'), 'MONGO_ROOT_PASSWORD')).not.to.equal(value(read(sb, 'staging/.env'), 'MONGO_ROOT_PASSWORD'));
    });

    it('honours hostname overrides', () => {
      const r = run(sb, 'env-bootstrap.sh', [], { PRODUCTION_HOSTNAME: 'drill.example.org' });
      expect(r.status, r.stderr).to.equal(0);
      expect(value(read(sb, 'production/app.env'), 'SITE_URL')).to.equal('https://drill.example.org');
      expect(value(read(sb, 'production/.env'), 'PUBLIC_HOSTNAME')).to.equal('drill.example.org');
    });

    it('refuses to touch an existing env file', () => {
      expect(run(sb, 'env-bootstrap.sh', []).status).to.equal(0);
      const before = ENV_FILES.map((f) => read(sb, f));
      const r = run(sb, 'env-bootstrap.sh', []);
      expect(r.status).to.equal(73);
      expect(r.stderr).to.include('exists, not touching it');
      expect(ENV_FILES.map((f) => read(sb, f))).to.deep.equal(before);
    });

    it('fails when deploy/env has not been synced', () => {
      fs.rmSync(path.join(sb.root, 'deploy'), { recursive: true });
      const r = run(sb, 'env-bootstrap.sh', []);
      expect(r.status).to.equal(66);
      expect(fs.existsSync(path.join(sb.root, 'production'))).to.equal(false);
    });
  });

  describe('env-backup.sh', () => {
    const pass = { ENV_BACKUP_PASSPHRASE: 'correct horse battery staple' };

    it('round-trips the four files through an encrypted archive', () => {
      expect(run(sb, 'env-bootstrap.sh', []).status).to.equal(0);
      const before = ENV_FILES.map((f) => read(sb, f));
      const b = run(sb, 'env-backup.sh', ['backup'], pass);
      expect(b.status, b.stderr).to.equal(0);
      const archives = fs.readdirSync(path.join(sb.root, 'dumps')).filter((f) => /^env-\d{8}T\d{6}Z\.tar\.enc$/.test(f));
      expect(archives).to.have.length(1);
      const archive = path.join(sb.root, 'dumps', archives[0]);
      expect(fs.statSync(archive).mode & 0o777).to.equal(0o600);
      // ciphertext: no secret in the clear
      expect(fs.readFileSync(archive, 'latin1')).not.to.include(value(before[0], 'MONGO_ROOT_PASSWORD'));

      // restore refuses while the files exist…
      const refused = run(sb, 'env-backup.sh', ['restore', archive], pass);
      expect(refused.status).to.equal(73);
      // …and recreates them byte for byte once they are gone
      for (const f of ENV_FILES) fs.rmSync(path.join(sb.root, f));
      const r = run(sb, 'env-backup.sh', ['restore', archive], pass);
      expect(r.status, r.stderr).to.equal(0);
      expect(ENV_FILES.map((f) => read(sb, f))).to.deep.equal(before);
      for (const f of ENV_FILES) expect(mode(sb, f), f).to.equal(0o600);
    });

    it('does not restore with the wrong passphrase', () => {
      expect(run(sb, 'env-bootstrap.sh', []).status).to.equal(0);
      expect(run(sb, 'env-backup.sh', ['backup'], pass).status).to.equal(0);
      const archive = path.join(sb.root, 'dumps', fs.readdirSync(path.join(sb.root, 'dumps'))[0]);
      for (const f of ENV_FILES) fs.rmSync(path.join(sb.root, f));
      const r = run(sb, 'env-backup.sh', ['restore', archive], { ENV_BACKUP_PASSPHRASE: 'wrong' });
      expect(r.status).not.to.equal(0);
      for (const f of ENV_FILES) expect(fs.existsSync(path.join(sb.root, f)), f).to.equal(false);
    });

    it('refuses an empty passphrase and a missing env file', () => {
      expect(run(sb, 'env-bootstrap.sh', []).status).to.equal(0);
      expect(run(sb, 'env-backup.sh', ['backup'], { ENV_BACKUP_PASSPHRASE: '' }).status).to.equal(65);
      fs.rmSync(path.join(sb.root, 'staging/app.env'));
      expect(run(sb, 'env-backup.sh', ['backup'], pass).status).to.equal(66);
    });
  });

  describe('seed-from-dump.sh', () => {
    beforeEach(() => { expect(run(sb, 'env-bootstrap.sh', []).status).to.equal(0); });

    it('dump local prints only the archive name on stdout and keeps the URI out of the arguments', () => {
      const r = run(sb, 'seed-from-dump.sh', ['production', 'dump', 'local']);
      expect(r.status, r.stderr).to.equal(0);
      expect(r.stdout.trim()).to.match(/^seed-\d{8}T\d{6}Z\.archive\.gz$/);
      expect(fs.existsSync(path.join(sb.root, 'dumps', r.stdout.trim()))).to.equal(true);
      const log = composeLog(sb);
      expect(log).to.include('--db=blueprintnotincluded');
      expect(log).to.include('-e TOOL_URI');
      expect(log).not.to.include('mongodb://');
      expect(log).not.to.include(value(read(sb, 'production/.env'), 'MONGO_ROOT_PASSWORD'));
    });

    it('restore accepts the archive as a name or as a path in the dumps directory', () => {
      const name = run(sb, 'seed-from-dump.sh', ['production', 'dump', 'local']).stdout.trim();
      const byPath = run(sb, 'seed-from-dump.sh', ['staging', 'restore', path.join(sb.root, 'dumps', name)]);
      expect(byPath.status, byPath.stderr).to.equal(0);
      expect(byPath.stdout).to.include('== collection counts');
      const byName = run(sb, 'seed-from-dump.sh', ['staging', 'restore', name]);
      expect(byName.status, byName.stderr).to.equal(0);
      const log = composeLog(sb);
      expect(log).to.include('drop()');
      expect(log).to.include(`--archive=/dumps/${name}`);
    });

    it('restore rejects a path outside the dumps directory even when the name matches', () => {
      const name = run(sb, 'seed-from-dump.sh', ['production', 'dump', 'local']).stdout.trim();
      fs.mkdirSync(path.join(sb.tmp, 'elsewhere'));
      fs.writeFileSync(path.join(sb.tmp, 'elsewhere', name), 'other');
      const r = run(sb, 'seed-from-dump.sh', ['production', 'restore', path.join(sb.tmp, 'elsewhere', name)]);
      expect(r.status).to.equal(64);
      expect(r.stderr).to.include('must be a name or a file in');
      expect(composeLog(sb)).not.to.include('drop');
    });

    it('restore of a missing archive exits before dropping anything', () => {
      const r = run(sb, 'seed-from-dump.sh', ['production', 'restore', 'seed-nope.archive.gz']);
      expect(r.status).to.equal(66);
      expect(r.stderr).to.include('not found');
      expect(composeLog(sb)).not.to.include('drop');
    });

    it('all env without SEED_SOURCE_URI touches neither the source nor the database', () => {
      const r = run(sb, 'seed-from-dump.sh', ['production', 'all', 'env']);
      expect(r.status).not.to.equal(0);
      expect(r.stderr).to.include('SEED_SOURCE_URI');
      const log = composeLog(sb);
      expect(log).not.to.include('mongodump');
      expect(log).not.to.include('drop');
    });

    it('all stops after a failed dump instead of restoring a missing archive', () => {
      const r = run(sb, 'seed-from-dump.sh', ['production', 'all', 'local'], { STUB_DUMP_FAIL: '1' });
      expect(r.status).not.to.equal(0);
      // the dump's own error is the last word, not a misleading "archive not found" from the restore
      expect(r.stderr).to.include('error connecting').and.not.include('not found');
      const log = composeLog(sb);
      expect(log).to.include('mongodump');
      expect(log).not.to.include('drop');
      expect(log).not.to.include('mongorestore');
      expect(fs.existsSync(path.join(sb.root, 'dumps')) ? fs.readdirSync(path.join(sb.root, 'dumps')) : []).to.deep.equal([]);
    });

    it('all restores the archive it just dumped', () => {
      const r = run(sb, 'seed-from-dump.sh', ['staging', 'all', 'local']);
      expect(r.status, r.stderr).to.equal(0);
      const log = composeLog(sb);
      expect(log.indexOf('mongodump')).to.be.lessThan(log.indexOf('drop'));
      expect(log.indexOf('drop')).to.be.lessThan(log.indexOf('mongorestore'));
    });
  });

  describe('cloud-init-render.sh', () => {
    it('fills both key placeholders and leaves none behind', () => {
      const keys = path.join(sb.tmp, 'keys');
      fs.mkdirSync(keys);
      for (const name of ['me', 'bpni-deploy']) {
        const k = spawnSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', name, '-f', path.join(keys, name)], { encoding: 'utf8' });
        expect(k.status, k.stderr).to.equal(0);
      }
      const out = path.join(sb.tmp, 'cloud-init.yaml');
      const r = run(sb, 'cloud-init-render.sh', [out], { SSH_PUBLIC_KEY: path.join(keys, 'me.pub'), DEPLOY_KEY: path.join(keys, 'bpni-deploy') });
      expect(r.status, r.stderr).to.equal(0);
      const rendered = fs.readFileSync(out, 'utf8');
      expect(rendered).not.to.include('AAAA...');
      expect(rendered).to.include(fs.readFileSync(path.join(keys, 'me.pub'), 'utf8').trim());
      expect(rendered).to.include(fs.readFileSync(path.join(keys, 'bpni-deploy.pub'), 'utf8').trim());
      // only the two key lines changed
      const template = fs.readFileSync(path.resolve(__dirname, '../../deploy/cloud-init.yaml'), 'utf8');
      expect(rendered.split('\n').length).to.equal(template.split('\n').length);
    });

    it('generates the deploy key when it is missing and rejects a non-key file', () => {
      const keys = path.join(sb.tmp, 'keys');
      fs.mkdirSync(keys);
      spawnSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', path.join(keys, 'me')]);
      const out = path.join(sb.tmp, 'cloud-init.yaml');
      const r = run(sb, 'cloud-init-render.sh', [out], { SSH_PUBLIC_KEY: path.join(keys, 'me.pub'), DEPLOY_KEY: path.join(keys, 'fresh') });
      expect(r.status, r.stderr).to.equal(0);
      expect(fs.existsSync(path.join(keys, 'fresh.pub'))).to.equal(true);

      // prefix-looks-right garbage must fail too: an accepted bad key would lock the box
      fs.writeFileSync(path.join(keys, 'junk.pub'), 'ssh-ed25519 AAAAinvalid kevin@laptop\n');
      const bad = run(sb, 'cloud-init-render.sh', [out + '.bad'], { SSH_PUBLIC_KEY: path.join(keys, 'junk.pub'), DEPLOY_KEY: path.join(keys, 'fresh') });
      expect(bad.status).to.equal(65);
      expect(fs.existsSync(out + '.bad')).to.equal(false);
    });
  });
});
