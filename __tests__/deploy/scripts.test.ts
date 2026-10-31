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

  describe('health-report.sh', () => {
    // compose.sh stand-in that answers `logs … <service>` with a fixture file
    // ($STUB_LOGS/<project>/<service>.log) and nothing else.
    const LOG_STUB = `#!/bin/bash
project=$1; shift
case "$1" in
  logs) svc=\${@: -1}; f="$STUB_LOGS/$project/$svc.log"; [ -f "$f" ] && cat "$f"; exit 0 ;;
esac
exit 0
`;
    function withLogs(files: Record<string, string>): string {
      const dir = path.join(sb.tmp, 'logs');
      for (const [rel, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), text);
      }
      fs.writeFileSync(path.join(sb.bin, 'compose.sh'), LOG_STUB, { mode: 0o755 });
      return dir;
    }
    const T = '2026-10-31T05:17:40.000000000Z';
    const APP_LOG =
      [
        `${T} Example app listening on port 3000!`,
        `${T} memory-heartbeat: api rss=120MB heapUsed=43MB heapTotal=51MB external=5MB arrayBuffers=1MB`,
        `2026-10-31T06:00:00.000000000Z memory-heartbeat: api rss=180MB heapUsed=70MB heapTotal=90MB external=5MB arrayBuffers=1MB`,
        `2026-10-31T06:05:00.000000000Z memory-heartbeat: api rss=150MB heapUsed=60MB heapTotal=90MB external=5MB arrayBuffers=1MB`,
        `2026-10-31T06:05:00.000000000Z memory-heartbeat: preview-worker rss=211MB heapUsed=60MB heapTotal=90MB external=50MB arrayBuffers=10MB`,
        `2026-10-31T06:01:00.000000000Z access: method=GET route=/api/getblueprints status=200 ms=80 bytes=58106 ray=a-YVR country=CA url=/api/getblueprints?limit=20`,
        `2026-10-31T06:01:01.000000000Z access: method=GET route=/api/getblueprints status=200 ms=120 bytes=58106 ray=b-FRA country=DE url=/api/getblueprints?limit=20`,
        `2026-10-31T06:01:02.000000000Z access: method=GET route=/api/blueprints/:id status=200 ms=12 bytes=23613 ray=c-YVR country=CA url=/api/blueprints/1`,
        `2026-10-31T06:01:03.000000000Z access: method=GET route=/api/blueprints/:id/preview/:variant status=500 ms=2400 bytes=- ray=d-YVR country=US url=/api/blueprints/2/preview/card.webp`,
        `2026-10-31T06:02:00.000000000Z preview render 2 (300 items, 40 prefabs): loadMdb=5ms queueWait=0ms master=900ms (cold) derivatives=100ms mongo=20ms total=1025ms parentRss=150MB`,
        `2026-10-31T06:03:00.000000000Z preview render 3 (10 items, 4 prefabs): loadMdb=5ms queueWait=0ms master=90ms derivatives=10ms mongo=2ms total=107ms parentRss=150MB`,
        `2026-10-31T06:04:00.000000000Z preview render worker exited (code=0, signal=null)`,
        `2026-10-31T06:04:01.000000000Z facets-slow: 400ms`,
        `2026-10-31T06:04:02.000000000Z Error: ECONNRESET while streaming`,
      ].join('\n') + '\n';
    const MONGO_LOG =
      [
        `${T} {"t":{"$date":"2026-10-31T05:17:40.000+00:00"},"s":"I","c":"NETWORK","msg":"Waiting for connections","attr":{"port":27017}}`,
        `2026-10-31T06:01:00.000000000Z {"s":"I","c":"COMMAND","msg":"Slow query","attr":{"type":"command","ns":"blueprintnotincluded.blueprints","durationMillis":350}}`,
        `2026-10-31T06:01:01.000000000Z {"s":"I","c":"COMMAND","msg":"Slow query","attr":{"type":"command","ns":"blueprintnotincluded.blueprintsearch","durationMillis":120}}`,
        `2026-10-31T06:01:02.000000000Z {"s":"W","c":"CONTROL","msg":"Access control is not enabled"}`,
      ].join('\n') + '\n';
    const CF_LOG =
      [1, 2, 3, 4]
        .map(i => `${T} INF Registered tunnel connection connIndex=${i - 1} location=hel01`)
        .concat([`2026-10-31T06:01:00.000000000Z INF Unregistered tunnel connection connIndex=2`])
        .join('\n') + '\n';
    const BACKUP_LOG =
      [
        `2026-10-31T03:30:00.000000000Z backup: dumping blueprintnotincluded (excluding: previewimages)`,
        `2026-10-31T03:31:00.000000000Z backup: done (blueprintnotincluded-20261031T033000Z.archive.gz, 212M). Archives now in R2:`,
        `2026-10-31T03:31:01.000000000Z Total objects: 6`,
        `2026-10-31T03:31:01.000000000Z Total size: 1.2 GiB (1288490188 Byte)`,
      ].join('\n') + '\n';

    it('summarises one project from its container logs', () => {
      const dir = withLogs({
        'production/app.log': APP_LOG,
        'production/mongo.log': MONGO_LOG,
        'production/cloudflared.log': CF_LOG,
        'production/backup.log': BACKUP_LOG,
      });
      const r = run(sb, 'health-report.sh', ['production', '--no-host'], { STUB_LOGS: dir });
      expect(r.status, r.stderr).to.equal(0);
      const out = r.stdout;
      expect(out).to.include('boots: 1\n  2026-10-31T05:17:40Z');
      expect(out).to.include('api: rss 120 → 150 MB, max 180 MB; heapUsed max 70 MB (3 samples)');
      expect(out).to.include(
        'preview-worker: rss 211 → 211 MB, max 211 MB; heapUsed max 60 MB (1 samples)'
      );
      expect(out).to.include('access: 4 logged requests');
      expect(out).to.match(/by status: .*2xx=3/);
      expect(out).to.match(/by status: .*5xx=1/);
      expect(out).to.include('ms: n=4 p50=80 p95=2400 max=2400');
      expect(out).to.include('    2 /api/getblueprints p50=80ms');
      expect(out).to.match(/countries: CA=2 /);
      expect(out).to.include(
        '    2400ms 2026-10-31T06:01:03Z method=GET route=/api/blueprints/:id/preview/:variant status=500 url=/api/blueprints/2/preview/card.webp'
      );
      expect(out).to.include(
        'preview renders: 2 (cold: 1); total ms: n=2 p50=107 p95=1025 max=1025'
      );
      expect(out).to.include('preview queue full: 0; worker exits: 1');
      expect(out).to.include('facets-slow: 1');
      expect(out).to.include(
        'error lines: 1 (last 3):\n  2026-10-31T06:04:02.000000000Z Error: ECONNRESET while streaming'
      );
      expect(out).to.include("slow queries (over mongod's 100 ms default): 2");
      expect(out).to.include('durationMillis: n=2 p50=120 p95=350 max=350');
      expect(out).to.match(/ +1 blueprintnotincluded\.blueprints\n/);
      // every section says where its log actually starts
      expect(out).to.include('== production app (last 7d) ==\ncovers: from 2026-10-31T05:17:40Z, 14 lines');
      expect(out).to.include('== production mongo (last 7d) ==\ncovers: from 2026-10-31T05:17:40Z, 4 lines');
      expect(out).to.include('connection/election/storage warnings: 1');
      expect(out).to.include('tunnel connections registered: 4');
      expect(out).to.include('reconnects/errors: 1');
      expect(out).to.include('runs completed: 1');
      expect(out).to.include('Total size: 1.2 GiB');
      expect(out).not.to.include('== host');
      expect(out).not.to.include('staging');
      // the compose calls read a docker duration, not the human one
      expect(composeLog(sb)).to.equal('');
    });

    it('copes with an empty project and an image that predates the access log', () => {
      const dir = withLogs({ 'staging/app.log': `${T} Example app listening on port 3000!\n` });
      const r = run(sb, 'health-report.sh', ['staging', '--no-host', '--since', '3d'], {
        STUB_LOGS: dir,
      });
      expect(r.status, r.stderr).to.equal(0);
      expect(r.stdout).to.include('window: 3d');
      expect(r.stdout).to.include('access: no lines');
      expect(r.stdout).to.include('== staging mongo (last 3d) ==\nno log lines');
      expect(r.stdout).not.to.include('backup');
    });

    it('rejects an unknown argument and a --since docker would not take', () => {
      expect(run(sb, 'health-report.sh', ['prod']).status).to.equal(64);
      const r = run(sb, 'health-report.sh', ['staging', '--no-host', '--since', '7days']);
      expect(r.status).to.equal(64);
      expect(r.stderr).to.include('--since takes');
    });
  });
});
