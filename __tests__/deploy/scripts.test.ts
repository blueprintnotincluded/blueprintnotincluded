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
// mongosh / rclone. The backup image's one-off commands arrive as the last
// argument (a shell line for `bash -c`); rclone's bucket is a directory under
// BPNI_ROOT/bucket, with the `r2:<bucket>/` prefix stripped. STUB_DUMP_FAIL=1
// makes mongodump fail the way a bad URI does.
const STUB_COMPOSE = `#!/bin/bash
printf '%s\\n' "$(printf '%s' "$*" | tr '\\n' ' ')" >> "$STUB_LOG"
root=\${BPNI_ROOT}
line=\${@: -1}
obj() { echo "$line" | tr '\\n' ' ' | grep -o "rclone $1 [^|;]*" | grep -o 'r2:[^ ;]*' | head -n1 | sed 's|^r2:[^/]*/||'; }
case "$line" in
  *mongodump*"rclone rcat"*)
    if [ "\${STUB_DUMP_FAIL:-}" = 1 ]; then echo "Failed: error connecting" >&2; exit 1; fi
    t="$root/bucket/$(obj rcat)"; mkdir -p "$(dirname "$t")"; echo fake-dump > "$t"
    if m=$(echo "$line" | tr '\\n' ' ' | grep -o 'rclone moveto r2:[^ ]* r2:[^ ;]*'); then
      from="$root/bucket/$(echo "$m" | awk '{print $3}' | sed 's|^r2:[^/]*/||')"
      to="$root/bucket/$(echo "$m" | awk '{print $4}' | sed 's|^r2:[^/]*/||')"
      mkdir -p "$(dirname "$to")"; mv "$from" "$to"
    fi ;;
  *"rclone cat"*mongorestore*)
    [ -f "$root/bucket/$(obj cat)" ] || { echo "object not found" >&2; exit 1; }
    echo "restored" ;;
  *"rclone lsf"*)
    t="$root/bucket/$(obj lsf)"
    if [ -d "$t" ]; then ls "$t"; elif [ -f "$t" ]; then basename "$t"; fi ;;
  *mongodump*)
    if [ "\${STUB_DUMP_FAIL:-}" = 1 ]; then echo "Failed: error connecting" >&2; exit 1; fi
    echo fake-dump ;;
  *mongorestore*) cat >/dev/null; echo "restored" ;;
  *mongosh*) case "$*" in *drop*) echo "dropped blueprints" ;; *) echo "blueprints 5" ;; esac ;;
esac
exit 0
`;

// curl stand-in for the heartbeat pings: logs its arguments, fails on
// STUB_CURL_FAIL=1 the way an unreachable host does.
const STUB_CURL = `#!/bin/bash
printf 'curl %s\\n' "$*" >> "$STUB_LOG"
if [ "\${STUB_CURL_FAIL:-}" = 1 ]; then echo "curl: (6) Could not resolve host" >&2; exit 6; fi
exit 0
`;

interface Sandbox {
  tmp: string;
  root: string;
  bin: string;
  log: string;
}

function makeSandbox(): Sandbox {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bpni-deploy-'));
  const root = path.join(tmp, 'srv');
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
  for (const f of fs.readdirSync(repoBin))
    fs.copyFileSync(path.join(repoBin, f), path.join(bin, f));
  fs.writeFileSync(path.join(bin, 'compose.sh'), STUB_COMPOSE, { mode: 0o755 });
  // cloud-init-render.sh reads the template next to its bin directory
  fs.copyFileSync(path.resolve(repoBin, '../cloud-init.yaml'), path.join(tmp, 'cloud-init.yaml'));
  fs.mkdirSync(path.join(root, 'deploy', 'env'), { recursive: true });
  for (const f of fs.readdirSync(repoEnv))
    fs.copyFileSync(path.join(repoEnv, f), path.join(root, 'deploy', 'env', f));
  return { tmp, root, bin, log: path.join(tmp, 'compose.log') };
}

function run(
  sb: Sandbox,
  script: string,
  args: string[],
  extraEnv: Record<string, string> = {}
): SpawnSyncReturns<string> {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: sb.tmp,
    BPNI_ROOT: sb.root,
    STUB_LOG: sb.log,
    ...extraEnv,
  };
  return spawnSync('bash', [path.join(sb.bin, script), ...args], { encoding: 'utf8', env });
}

const composeLog = (sb: Sandbox) => (fs.existsSync(sb.log) ? fs.readFileSync(sb.log, 'utf8') : '');
const read = (sb: Sandbox, rel: string) => fs.readFileSync(path.join(sb.root, rel), 'utf8');
const mode = (sb: Sandbox, rel: string) => fs.statSync(path.join(sb.root, rel)).mode & 0o777;
const value = (text: string, key: string) =>
  text
    .split('\n')
    .find(l => l.startsWith(`${key}=`))
    ?.slice(key.length + 1);

describe('deploy/bin scripts', () => {
  let sb: Sandbox;
  beforeEach(() => {
    sb = makeSandbox();
  });
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
      expect(value(read(sb, 'production/.env'), 'PUBLIC_HOSTNAME')).to.equal(
        'blueprintnotincluded.org'
      );
      expect(value(read(sb, 'production/app.env'), 'HOST')).to.equal(
        'https://blueprintnotincluded.org'
      );
      expect(value(read(sb, 'production/app.env'), 'SITE_URL')).to.equal(
        'https://blueprintnotincluded.org'
      );
      expect(value(read(sb, 'staging/.env'), 'PUBLIC_HOSTNAME')).to.equal(
        'staging.blueprintnotincluded.org'
      );
      expect(value(read(sb, 'staging/app.env'), 'HOST')).to.equal(
        'https://staging.blueprintnotincluded.org'
      );
      // production keeps the live JWT secret (filled by hand); staging gets its own
      expect(value(read(sb, 'production/app.env'), 'JWT_SECRET')).to.equal('');
      expect(value(read(sb, 'staging/app.env'), 'JWT_SECRET')).to.match(/^[0-9a-f]{64}$/);
      // the hand-filled keys are listed, the generated ones are not
      expect(r.stdout).to.include('TUNNEL_TOKEN=').and.include('MAILJET_API_KEY=');
      expect(r.stdout).not.to.include('MONGO_ROOT_PASSWORD=');
      // the Mongo passwords differ between projects
      expect(value(read(sb, 'production/.env'), 'MONGO_ROOT_PASSWORD')).not.to.equal(
        value(read(sb, 'staging/.env'), 'MONGO_ROOT_PASSWORD')
      );
    });

    it('honours hostname overrides', () => {
      const r = run(sb, 'env-bootstrap.sh', [], { PRODUCTION_HOSTNAME: 'drill.example.org' });
      expect(r.status, r.stderr).to.equal(0);
      expect(value(read(sb, 'production/app.env'), 'SITE_URL')).to.equal(
        'https://drill.example.org'
      );
      expect(value(read(sb, 'production/.env'), 'PUBLIC_HOSTNAME')).to.equal('drill.example.org');
    });

    it('refuses to touch an existing env file', () => {
      expect(run(sb, 'env-bootstrap.sh', []).status).to.equal(0);
      const before = ENV_FILES.map(f => read(sb, f));
      const r = run(sb, 'env-bootstrap.sh', []);
      expect(r.status).to.equal(73);
      expect(r.stderr).to.include('exists, not touching it');
      expect(ENV_FILES.map(f => read(sb, f))).to.deep.equal(before);
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
      const before = ENV_FILES.map(f => read(sb, f));
      const b = run(sb, 'env-backup.sh', ['backup'], pass);
      expect(b.status, b.stderr).to.equal(0);
      const archives = fs
        .readdirSync(path.join(sb.root, 'dumps'))
        .filter(f => /^env-\d{8}T\d{6}Z\.tar\.enc$/.test(f));
      expect(archives).to.have.length(1);
      const archive = path.join(sb.root, 'dumps', archives[0]);
      expect(fs.statSync(archive).mode & 0o777).to.equal(0o600);
      // ciphertext: no secret in the clear
      expect(fs.readFileSync(archive, 'latin1')).not.to.include(
        value(before[0], 'MONGO_ROOT_PASSWORD')
      );

      // restore refuses while the files exist…
      const refused = run(sb, 'env-backup.sh', ['restore', archive], pass);
      expect(refused.status).to.equal(73);
      // …and recreates them byte for byte once they are gone
      for (const f of ENV_FILES) fs.rmSync(path.join(sb.root, f));
      const r = run(sb, 'env-backup.sh', ['restore', archive], pass);
      expect(r.status, r.stderr).to.equal(0);
      expect(ENV_FILES.map(f => read(sb, f))).to.deep.equal(before);
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
      expect(run(sb, 'env-backup.sh', ['backup'], { ENV_BACKUP_PASSPHRASE: '' }).status).to.equal(
        65
      );
      fs.rmSync(path.join(sb.root, 'staging/app.env'));
      expect(run(sb, 'env-backup.sh', ['backup'], pass).status).to.equal(66);
    });
  });

  describe('seed-from-dump.sh', () => {
    beforeEach(() => {
      expect(run(sb, 'env-bootstrap.sh', []).status).to.equal(0);
    });
    const bucket = (rel: string) => path.join(sb.root, 'bucket', rel);
    const seeds = () => (fs.existsSync(bucket('seeds')) ? fs.readdirSync(bucket('seeds')) : []);

    it('dump local streams the archive to seeds/, prints only its name and keeps the URI out of the arguments', () => {
      const r = run(sb, 'seed-from-dump.sh', ['production', 'dump', 'local']);
      expect(r.status, r.stderr).to.equal(0);
      expect(r.stdout.trim()).to.match(/^seed-\d{8}T\d{6}Z\.archive\.gz$/);
      expect(fs.existsSync(bucket(`seeds/${r.stdout.trim()}`))).to.equal(true);
      // nothing on the box
      expect(fs.existsSync(path.join(sb.root, 'dumps'))).to.equal(false);
      const log = composeLog(sb);
      expect(log).to.include('--db=blueprintnotincluded');
      expect(log).to.include('rclone rcat r2:bpni-backups/incoming/');
      expect(log).to.include('rclone moveto r2:bpni-backups/incoming/');
      expect(log).to.include('-e TOOL_URI');
      expect(log).not.to.include('mongodb://');
      expect(log).not.to.include(value(read(sb, 'production/.env'), 'MONGO_ROOT_PASSWORD'));
    });

    it('restore streams a seed by name, or any archive by its bucket path', () => {
      const name = run(sb, 'seed-from-dump.sh', ['production', 'dump', 'local']).stdout.trim();
      const byName = run(sb, 'seed-from-dump.sh', ['staging', 'restore', name]);
      expect(byName.status, byName.stderr).to.equal(0);
      expect(byName.stdout).to.include('== collection counts');
      let log = composeLog(sb);
      expect(log.indexOf('drop()')).to.be.lessThan(log.indexOf('mongorestore'));
      expect(log).to.include(`rclone cat r2:bpni-backups/seeds/${name} | mongorestore`);

      fs.mkdirSync(bucket('bpni-production/daily'), { recursive: true });
      fs.writeFileSync(
        bucket('bpni-production/daily/blueprintnotincluded-20261106T033000Z.archive.gz'),
        'nightly'
      );
      const byPath = run(sb, 'seed-from-dump.sh', [
        'staging',
        'restore',
        'bpni-production/daily/blueprintnotincluded-20261106T033000Z.archive.gz',
      ]);
      expect(byPath.status, byPath.stderr).to.equal(0);
      log = composeLog(sb);
      expect(log).to.include(
        'rclone cat r2:bpni-backups/bpni-production/daily/blueprintnotincluded-20261106T033000Z.archive.gz | mongorestore'
      );
    });

    it('restore latest picks the newest nightly of the project itself', () => {
      fs.mkdirSync(bucket('bpni-production/daily'), { recursive: true });
      for (const d of ['20261105', '20261107', '20261106']) {
        fs.writeFileSync(
          bucket(`bpni-production/daily/blueprintnotincluded-${d}T033000Z.archive.gz`),
          'nightly'
        );
      }
      const r = run(sb, 'seed-from-dump.sh', ['production', 'restore', 'latest']);
      expect(r.status, r.stderr).to.equal(0);
      expect(composeLog(sb)).to.include(
        'rclone cat r2:bpni-backups/bpni-production/daily/blueprintnotincluded-20261107T033000Z.archive.gz | mongorestore'
      );
      // staging has no nightlies of its own
      const none = run(sb, 'seed-from-dump.sh', ['staging', 'restore', 'latest']);
      expect(none.status).to.equal(66);
      expect(none.stderr).to.include('no archive under');
    });

    it('restore rejects an archive that is not a seed, latest, or a bucket path, before dropping anything', () => {
      const r = run(sb, 'seed-from-dump.sh', [
        'production',
        'restore',
        '/srv/bpni/dumps/seed-20261024T234143Z.archive.gz',
      ]);
      expect(r.status).to.equal(64);
      expect(r.stderr).to.include('archive must be');
      expect(composeLog(sb)).not.to.include('drop');
    });

    it('restore refuses shell metacharacters in an archive name, before dropping anything', () => {
      const r = run(sb, 'seed-from-dump.sh', [
        'production',
        'restore',
        'bpni-production/daily/x$(id).archive.gz',
      ]);
      expect(r.status).to.equal(64);
      expect(r.stderr).to.include('letters, digits');
      expect(composeLog(sb)).to.equal('');
    });

    it('restore falls back to the default bucket when R2_BUCKET is absent from .env', () => {
      const file = path.join(sb.root, 'staging/.env');
      fs.writeFileSync(file, read(sb, 'staging/.env').replace(/^R2_BUCKET=.*\n/m, ''));
      const name = run(sb, 'seed-from-dump.sh', ['production', 'dump', 'local']).stdout.trim();
      const r = run(sb, 'seed-from-dump.sh', ['staging', 'restore', name]);
      expect(r.status, r.stderr).to.equal(0);
      expect(composeLog(sb)).to.include(`rclone cat r2:bpni-backups/seeds/${name}`);
    });

    it('restore latest refuses a bucket object whose name carries shell syntax', () => {
      fs.mkdirSync(bucket('bpni-production/daily'), { recursive: true });
      fs.writeFileSync(bucket('bpni-production/daily/zz$(touch pwned).archive.gz'), 'planted');
      const r = run(sb, 'seed-from-dump.sh', ['production', 'restore', 'latest']);
      expect(r.status).to.equal(64);
      expect(r.stderr).to.include('letters, digits');
      expect(composeLog(sb)).not.to.include('drop');
      expect(fs.existsSync(path.join(sb.tmp, 'pwned'))).to.equal(false);
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
      const r = run(sb, 'seed-from-dump.sh', ['production', 'all', 'local'], {
        STUB_DUMP_FAIL: '1',
      });
      expect(r.status).not.to.equal(0);
      // the dump's own error is the last word, not a misleading "archive not found" from the restore
      expect(r.stderr).to.include('error connecting').and.not.include('not found');
      const log = composeLog(sb);
      expect(log).to.include('mongodump');
      // a partial upload is deleted inside the same container run
      expect(log).to.include('rclone deletefile');
      expect(log).not.to.include('drop');
      expect(log).not.to.include('mongorestore');
      expect(seeds()).to.deep.equal([]);
    });

    it('all restores the archive it just dumped', () => {
      const r = run(sb, 'seed-from-dump.sh', ['staging', 'all', 'local']);
      expect(r.status, r.stderr).to.equal(0);
      const log = composeLog(sb);
      expect(log.indexOf('mongodump')).to.be.lessThan(log.indexOf('drop'));
      expect(log.indexOf('drop')).to.be.lessThan(log.indexOf('mongorestore'));
    });

    it('clone pipes one project into the other without touching the bucket', () => {
      const r = run(sb, 'seed-from-dump.sh', ['staging', 'clone', 'production']);
      expect(r.status, r.stderr).to.equal(0);
      expect(r.stdout).to.include('== collection counts');
      const log = composeLog(sb);
      expect(log).not.to.include('rclone');
      // production's mongo is checked first, then staging is emptied, then the pipe runs
      expect(log.indexOf('production exec')).to.be.lessThan(log.indexOf('drop()'));
      expect(log.indexOf('drop()')).to.be.lessThan(log.indexOf('mongodump'));
      expect(log).to.match(/^production .*mongodump/m);
      expect(log).to.match(/^staging .*mongorestore/m);
      expect(log).not.to.include('mongodb://');
      expect(fs.existsSync(path.join(sb.root, 'bucket'))).to.equal(false);
      // the same project twice, or one with no .env, never drops anything
      expect(run(sb, 'seed-from-dump.sh', ['staging', 'clone', 'staging']).status).to.equal(64);
      expect(run(sb, 'seed-from-dump.sh', ['staging', 'clone', 'nowhere']).status).to.equal(66);
    });
  });

  // backup.sh runs inside the sidecar, not through compose: it is exercised
  // here with stub mongodump / rclone / date binaries on PATH. The bucket is a
  // directory; STUB_DATE fixes the day for the Sunday and first-Sunday rules.
  describe('backup/backup.sh', () => {
    const STUB_MONGODUMP = `#!/bin/bash
printf 'mongodump %s\\n' "$*" >> "$STUB_LOG"
if [ "\${STUB_DUMP_FAIL:-}" = 1 ]; then echo "Failed: error connecting" >&2; exit 1; fi
echo fake-dump
`;
    const STUB_RCLONE = `#!/bin/bash
printf 'rclone %s\\n' "$*" >> "$STUB_LOG"
strip() { echo "$1" | sed 's|^r2:[^/]*/||'; }
case "$1" in
  rcat) t="$STUB_BUCKET/$(strip "$2")"; mkdir -p "$(dirname "$t")"; cat > "$t" ;;
  copyto) t="$STUB_BUCKET/$(strip "$3")"; mkdir -p "$(dirname "$t")"; cp "$STUB_BUCKET/$(strip "$2")" "$t" ;;
  moveto) t="$STUB_BUCKET/$(strip "$3")"; mkdir -p "$(dirname "$t")"; mv "$STUB_BUCKET/$(strip "$2")" "$t" ;;
  deletefile) rm -f "$STUB_BUCKET/$(strip "$2")" ;;
  lsf) t="$STUB_BUCKET/$(strip "\${@: -1}")"; [ -f "$t" ] && stat -c %s "$t"; [ -d "$t" ] && ls "$t" ;;
  delete|size) ;;
esac
exit 0
`;
    // date -u +%u / +%d / +%Y%m%dT%H%M%SZ from STUB_DATE ("YYYY-MM-DD HH:MM")
    // and STUB_DOW (1 = Monday … 7 = Sunday); plain /bin/date otherwise. No
    // `date -d`, which is GNU only.
    const STUB_DATE = `#!/bin/bash
if [ -z "\${STUB_DATE:-}" ]; then exec /bin/date "$@"; fi
d=\${STUB_DATE:0:10}; t=\${STUB_DATE:11:5}
case "\${@: -1}" in
  +%u) echo "$STUB_DOW" ;;
  +%d) echo "\${d:8:2}" ;;
  +%Y%m%dT%H%M%SZ) echo "\${d//-/}T\${t//:/}00Z" ;;
  *) exec /bin/date "$@" ;;
esac
`;
    let stubBin: string;
    let bucketDir: string;
    beforeEach(() => {
      stubBin = path.join(sb.tmp, 'stubbin');
      bucketDir = path.join(sb.tmp, 'bucket');
      fs.mkdirSync(stubBin);
      fs.writeFileSync(path.join(stubBin, 'mongodump'), STUB_MONGODUMP, { mode: 0o755 });
      fs.writeFileSync(path.join(stubBin, 'rclone'), STUB_RCLONE, { mode: 0o755 });
      fs.writeFileSync(path.join(stubBin, 'date'), STUB_DATE, { mode: 0o755 });
      fs.writeFileSync(path.join(stubBin, 'curl'), STUB_CURL, { mode: 0o755 });
    });
    const backup = (extraEnv: Record<string, string> = {}) =>
      spawnSync('bash', [path.resolve(__dirname, '../../deploy/backup/backup.sh')], {
        encoding: 'utf8',
        env: {
          PATH: `${stubBin}:${process.env.PATH ?? ''}`,
          STUB_LOG: sb.log,
          STUB_BUCKET: bucketDir,
          BACKUP_MONGO_URI:
            'mongodb://backup:s3cret@mongo:27017/blueprintnotincluded?authSource=admin',
          BACKUP_DB: 'blueprintnotincluded',
          BACKUP_REMOTE: 'r2:bpni-backups/bpni-production',
          BACKUP_EXCLUDE_COLLECTIONS: 'previewimages',
          ...extraEnv,
        },
      });
    const objects = () => {
      const out: string[] = [];
      const walk = (dir: string, rel: string) => {
        if (!fs.existsSync(dir)) return;
        for (const f of fs.readdirSync(dir)) {
          const p = path.join(dir, f);
          if (fs.statSync(p).isDirectory()) walk(p, `${rel}${f}/`);
          else out.push(`${rel}${f}`);
        }
      };
      walk(bucketDir, '');
      return out.sort();
    };

    it('streams a weekday dump to daily/ with the exclusion and prunes every prefix', () => {
      const r = backup({ STUB_DATE: '2026-11-04 03:30', STUB_DOW: '3' }); // a Wednesday
      expect(r.status, r.stderr).to.equal(0);
      expect(objects()).to.deep.equal([
        'bpni-production/daily/blueprintnotincluded-20261104T033000Z.archive.gz',
      ]);
      const log = composeLog(sb);
      expect(log).to.include('--excludeCollection=previewimages');
      expect(log).not.to.include('s3cret');
      for (const p of [
        'bpni-production/daily/',
        'bpni-production/weekly/',
        'bpni-production/monthly/',
        'bpni-backups/seeds/',
      ]) {
        expect(log, p).to.include(`delete --min-age`);
        expect(log, p).to.include(p);
      }
      expect(log).to.match(/delete --min-age 30d r2:bpni-backups\/seeds\//);
    });

    it('copies a Sunday dump to weekly/, and on the first Sunday also dumps everything to monthly/', () => {
      const sunday = backup({ STUB_DATE: '2026-11-15 03:30', STUB_DOW: '7' });
      expect(sunday.status, sunday.stderr).to.equal(0);
      expect(objects()).to.deep.equal([
        'bpni-production/daily/blueprintnotincluded-20261115T033000Z.archive.gz',
        'bpni-production/weekly/blueprintnotincluded-20261115T033000Z.archive.gz',
      ]);
      fs.rmSync(sb.log);
      const first = backup({ STUB_DATE: '2026-11-01 03:30', STUB_DOW: '7' });
      expect(first.status, first.stderr).to.equal(0);
      expect(objects()).to.include(
        'bpni-production/monthly/blueprintnotincluded-20261101T033000Z.archive.gz'
      );
      const dumps = composeLog(sb)
        .split('\n')
        .filter(l => l.startsWith('mongodump'));
      expect(dumps).to.have.length(2);
      expect(dumps[0]).to.include('--excludeCollection=previewimages');
      expect(dumps[1]).not.to.include('--excludeCollection');
    });

    it('deletes the partial upload and fails when the dump breaks mid-stream', () => {
      const r = backup({ STUB_DATE: '2026-11-04 03:30', STUB_DOW: '3', STUB_DUMP_FAIL: '1' });
      expect(r.status).not.to.equal(0);
      expect(r.stderr).to.include('deleting the partial upload');
      expect(composeLog(sb)).to.include('rclone deletefile r2:bpni-backups/incoming/');
      expect(composeLog(sb)).not.to.include('moveto');
      // and no pruning after a failed night: the old archives stay
      expect(composeLog(sb)).not.to.include('delete --min-age');
      expect(objects()).to.deep.equal([]);
    });

    describe('heartbeat', () => {
      const url = 'https://uptime.betterstack.com/api/v1/heartbeat/abc123';
      const day = { STUB_DATE: '2026-11-04 03:30', STUB_DOW: '3' };

      it('pings the URL once, after the archive is in place and the pruning is done', () => {
        const r = backup({ ...day, BACKUP_HEARTBEAT_URL: url });
        expect(r.status, r.stderr).to.equal(0);
        const lines = composeLog(sb).split('\n');
        const pings = lines.filter(l => l.startsWith('curl'));
        expect(pings).to.have.length(1);
        expect(pings[0]).to.include('-fsS -m 10 --retry 3').and.include(url);
        expect(lines.indexOf(pings[0])).to.be.greaterThan(
          lines.findIndex(l => l.startsWith('rclone moveto'))
        );
        expect(lines.indexOf(pings[0])).to.be.greaterThan(
          lines.findIndex(l => l.startsWith('rclone delete --min-age'))
        );
        expect(r.stderr).not.to.include('heartbeat');
      });

      it('does not ping when the dump failed', () => {
        const r = backup({ ...day, BACKUP_HEARTBEAT_URL: url, STUB_DUMP_FAIL: '1' });
        expect(r.status).not.to.equal(0);
        expect(composeLog(sb)).not.to.include('curl');
      });

      it('calls no curl at all when the URL is unset', () => {
        const r = backup(day);
        expect(r.status, r.stderr).to.equal(0);
        expect(composeLog(sb)).not.to.include('curl');
      });

      it('reports a failed ping without failing the backup', () => {
        const r = backup({ ...day, BACKUP_HEARTBEAT_URL: url, STUB_CURL_FAIL: '1' });
        expect(r.status, r.stderr).to.equal(0);
        expect(r.stderr).to.include('backup: heartbeat ping failed');
        expect(objects()).to.deep.equal([
          'bpni-production/daily/blueprintnotincluded-20261104T033000Z.archive.gz',
        ]);
      });
    });
  });

  // restore-drill.sh drives docker directly for the throwaway mongo, so only
  // its first stretch runs here: reading .env and asking the bucket for the
  // newest archive, through the compose stub.
  describe('restore-drill.sh', () => {
    it('reaches the bucket listing when .env leaves a variable at its default', () => {
      expect(run(sb, 'env-bootstrap.sh', []).status).to.equal(0);
      const env = read(sb, 'production/.env');
      expect(env).not.to.match(/^BACKUP_EXCLUDE_COLLECTIONS=/m);
      const r = run(sb, 'restore-drill.sh', ['production']);
      // an empty fake bucket: the script must get as far as saying so, not die silently
      expect(r.status).to.equal(1);
      expect(r.stderr).to.include('no archive found under r2:bpni-backups/bpni-production/daily/');
      expect(composeLog(sb)).to.include('rclone lsf');
    });

    it('stops before the bucket when COMPOSE_PROJECT_NAME is missing', () => {
      expect(run(sb, 'env-bootstrap.sh', []).status).to.equal(0);
      const file = path.join(sb.root, 'production/.env');
      fs.writeFileSync(
        file,
        read(sb, 'production/.env').replace(/^COMPOSE_PROJECT_NAME=.*\n/m, '')
      );
      const r = run(sb, 'restore-drill.sh', ['production']);
      expect(r.status).to.equal(65);
      expect(r.stderr).to.include('COMPOSE_PROJECT_NAME');
      expect(composeLog(sb)).to.equal('');
    });

    it('rejects an unknown archive kind', () => {
      expect(run(sb, 'env-bootstrap.sh', []).status).to.equal(0);
      const r = run(sb, 'restore-drill.sh', ['production', 'hourly']);
      expect(r.status).to.equal(64);
    });
  });

  // drill-weekly.sh is the crontab entry: restore-drill.sh is replaced by a
  // stub that records its arguments and passes or fails on STUB_DRILL_FAIL,
  // df and curl are stubs on PATH, date follows STUB_DATE for the first-Sunday
  // rule.
  describe('drill-weekly.sh', () => {
    const url = 'https://uptime.betterstack.com/api/v1/heartbeat/drill456';
    const STUB_DRILL = `#!/bin/bash
printf 'restore-drill %s tolerance=%s\\n' "$*" "\${DRILL_TOLERANCE_PERCENT:-default}" >> "$STUB_LOG"
echo "== restore drill $([ "\${STUB_DRILL_FAIL:-}" = 1 ] && echo FAILED || echo PASSED) (fake)"
[ "\${STUB_DRILL_FAIL:-}" = 1 ] && exit 1
exit 0
`;
    const STUB_DF = `#!/bin/bash
printf 'Use%%\\n%s%%\\n' "\${STUB_DISK_PERCENT:-42}"
`;
    // STUB_DATE is "YYYY-MM-DD", STUB_DOW its weekday (7 = Sunday)
    const STUB_DATE = `#!/bin/bash
if [ -z "\${STUB_DATE:-}" ]; then exec /bin/date "$@"; fi
case "\${@: -1}" in
  +%d) echo "\${STUB_DATE:8:2}" ;;
  +%u) echo "\${STUB_DOW:-7}" ;;
  *) exec /bin/date "$@" ;;
esac
`;
    let stubBin: string;
    beforeEach(() => {
      expect(run(sb, 'env-bootstrap.sh', []).status).to.equal(0);
      stubBin = path.join(sb.tmp, 'stubbin');
      fs.mkdirSync(stubBin);
      fs.writeFileSync(path.join(stubBin, 'df'), STUB_DF, { mode: 0o755 });
      fs.writeFileSync(path.join(stubBin, 'curl'), STUB_CURL, { mode: 0o755 });
      fs.writeFileSync(path.join(stubBin, 'date'), STUB_DATE, { mode: 0o755 });
      fs.writeFileSync(path.join(sb.bin, 'restore-drill.sh'), STUB_DRILL, { mode: 0o755 });
    });
    const withUrl = () =>
      fs.appendFileSync(path.join(sb.root, 'production/.env'), `DRILL_HEARTBEAT_URL=${url}\n`);
    const drill = (extraEnv: Record<string, string> = {}) =>
      run(sb, 'drill-weekly.sh', [], {
        PATH: `${stubBin}:${process.env.PATH ?? ''}`,
        STUB_DATE: '2026-11-15',
        ...extraEnv,
      });
    const logFile = () => fs.readFileSync(path.join(sb.root, 'drill-weekly.log'), 'utf8');

    it('runs the daily drill, checks the disk and pings when both pass', () => {
      withUrl();
      const r = drill();
      expect(r.status, r.stderr).to.equal(0);
      const log = composeLog(sb).split('\n');
      expect(log.filter(l => l.startsWith('restore-drill'))).to.deep.equal([
        'restore-drill production daily tolerance=default',
      ]);
      const pings = log.filter(l => l.startsWith('curl'));
      expect(pings).to.have.length(1);
      expect(pings[0]).to.include('-fsS -m 10 --retry 3').and.include(url);
      // the run is in the log on the box, not only on a terminal nobody watches
      expect(logFile()).to.include('==== drill-weekly 20').and.include('drill-weekly PASSED');
      expect(logFile()).to.include('root disk 42% used');
      // the URL itself stays out of the log
      expect(logFile()).not.to.include(url);
    });

    it('adds the monthly drill, with the wider tolerance, on the first Sunday', () => {
      withUrl();
      const r = drill({ STUB_DATE: '2026-12-06' });
      expect(r.status, r.stderr).to.equal(0);
      expect(
        composeLog(sb)
          .split('\n')
          .filter(l => l.startsWith('restore-drill'))
      ).to.deep.equal([
        'restore-drill production daily tolerance=default',
        'restore-drill production monthly tolerance=20',
      ]);
      expect(
        composeLog(sb)
          .split('\n')
          .filter(l => l.startsWith('curl'))
      ).to.have.length(1);
    });

    it('runs the monthly drill only on a Sunday that is the 1st to the 7th', () => {
      withUrl();
      const drills = () =>
        composeLog(sb)
          .split('\n')
          .filter(l => l.startsWith('restore-drill'))
          .map(l => l.split(' ')[2]);
      // a hand run on the Wednesday before the first Sunday: no monthly
      expect(drill({ STUB_DATE: '2026-12-03', STUB_DOW: '3' }).status).to.equal(0);
      expect(drills()).to.deep.equal(['daily']);
      fs.rmSync(sb.log);
      // the boundary: Sunday the 7th yes, Sunday the 8th no
      expect(drill({ STUB_DATE: '2027-02-07', STUB_DOW: '7' }).status).to.equal(0);
      expect(drills()).to.deep.equal(['daily', 'monthly']);
      fs.rmSync(sb.log);
      expect(drill({ STUB_DATE: '2026-11-08', STUB_DOW: '7' }).status).to.equal(0);
      expect(drills()).to.deep.equal(['daily']);
    });

    it('does not ping when the drill failed', () => {
      withUrl();
      const r = drill({ STUB_DRILL_FAIL: '1' });
      expect(r.status).to.equal(1);
      expect(composeLog(sb)).not.to.include('curl');
      expect(logFile()).to.include('drill-weekly FAILED (no heartbeat sent)');
    });

    it('does not ping when the root disk is over the threshold', () => {
      withUrl();
      const r = drill({ STUB_DISK_PERCENT: '91' });
      expect(r.status).to.equal(1);
      expect(composeLog(sb)).not.to.include('curl');
      expect(logFile()).to.include('root disk 91% used, over 85%');
      // the threshold is a knob
      fs.rmSync(sb.log);
      expect(drill({ STUB_DISK_PERCENT: '91', DRILL_DISK_MAX_PERCENT: '95' }).status).to.equal(0);
      expect(composeLog(sb)).to.include('curl');
      // a mistyped knob fails the run instead of waving the disk through
      fs.rmSync(sb.log);
      const bad = drill({ STUB_DISK_PERCENT: '91', DRILL_DISK_MAX_PERCENT: '95%' });
      expect(bad.status).to.equal(64);
      expect(composeLog(sb)).not.to.include('curl');
      expect(logFile()).to.include('DRILL_DISK_MAX_PERCENT must be a number');
    });

    it('fails without a ping, and says so in the log, when df gives nothing', () => {
      withUrl();
      fs.writeFileSync(path.join(stubBin, 'df'), '#!/bin/bash\nexit 1\n', { mode: 0o755 });
      const r = drill();
      expect(r.status).to.equal(1);
      expect(composeLog(sb)).not.to.include('curl');
      expect(logFile()).to.include('could not read root disk usage');
    });

    it('logs the verdict when production/.env is unreadable', () => {
      fs.chmodSync(path.join(sb.root, 'production/.env'), 0o000);
      const r = drill();
      fs.chmodSync(path.join(sb.root, 'production/.env'), 0o600);
      if (process.getuid && process.getuid() === 0) return; // root reads anything
      expect(r.status).to.equal(66);
      expect(logFile()).to.include('cannot read').and.include('FAILED');
      expect(composeLog(sb)).to.equal('');
    });

    it('runs the drill but calls no curl when the URL is not in .env', () => {
      const r = drill();
      expect(r.status, r.stderr).to.equal(0);
      expect(composeLog(sb)).to.include('restore-drill production daily');
      expect(composeLog(sb)).not.to.include('curl');
    });

    it('a failed ping is reported and does not change the verdict', () => {
      withUrl();
      const r = drill({ STUB_CURL_FAIL: '1' });
      expect(r.status, r.stderr).to.equal(0);
      expect(logFile()).to.include('drill-weekly: heartbeat ping failed');
    });

    it('trims the log to its last 2000 lines', () => {
      withUrl();
      fs.mkdirSync(sb.root, { recursive: true });
      fs.writeFileSync(
        path.join(sb.root, 'drill-weekly.log'),
        Array.from({ length: 3000 }, (_, i) => `old line ${i}`).join('\n') + '\n'
      );
      expect(drill().status).to.equal(0);
      const lines = logFile().split('\n');
      expect(lines[0]).to.equal('old line 1000');
      expect(lines.length).to.be.lessThan(2020);
    });
  });

  // deploy.sh's crontab line for the drill: a stub crontab keeps the table in a
  // file, stub docker and curl stand in for the prune and the public health check.
  describe('deploy.sh crontab', () => {
    const STUB_CRONTAB = `#!/bin/bash
if [ "\${STUB_CRON_BROKEN:-}" = 1 ]; then echo "crontab: can't open spool" >&2; exit 1; fi
case "$1" in
  -l) [ -f "$STUB_CRONTAB" ] || { echo "no crontab for deploy" >&2; exit 1; }; cat "$STUB_CRONTAB" ;;
  -) cat > "$STUB_CRONTAB.new" && mv "$STUB_CRONTAB.new" "$STUB_CRONTAB" ;;
esac
`;
    const STUB_OK = `#!/bin/bash
exit 0
`;
    let stubBin: string;
    let table: string;
    beforeEach(() => {
      expect(run(sb, 'env-bootstrap.sh', []).status).to.equal(0);
      stubBin = path.join(sb.tmp, 'stubbin');
      table = path.join(sb.tmp, 'crontab');
      fs.mkdirSync(stubBin);
      fs.writeFileSync(path.join(stubBin, 'crontab'), STUB_CRONTAB, { mode: 0o755 });
      fs.writeFileSync(path.join(stubBin, 'docker'), STUB_OK, { mode: 0o755 });
      fs.writeFileSync(path.join(stubBin, 'curl'), STUB_OK, { mode: 0o755 });
    });
    const deploy = (project: string, extraEnv: Record<string, string> = {}) =>
      run(sb, 'deploy.sh', [project], {
        PATH: `${stubBin}:${process.env.PATH ?? ''}`,
        STUB_CRONTAB: table,
        ...extraEnv,
      });
    const cron = () => (fs.existsSync(table) ? fs.readFileSync(table, 'utf8') : '');

    it('installs the Sunday 05:00 UTC drill line once, keeps other lines, and leaves staging alone', () => {
      fs.writeFileSync(table, '15 4 * * * /home/deploy/other.sh\n');
      const r = deploy('production');
      expect(r.status, r.stderr).to.equal(0);
      const expected = `0 5 * * 0 ${sb.bin}/drill-weekly.sh # bpni drill-weekly`;
      expect(cron().split('\n').filter(Boolean)).to.deep.equal([
        '15 4 * * * /home/deploy/other.sh',
        expected,
      ]);
      expect(deploy('production').status).to.equal(0);
      expect(deploy('production').status).to.equal(0);
      expect(
        cron()
          .split('\n')
          .filter(l => l.includes('drill-weekly'))
      ).to.deep.equal([expected]);

      const before = cron();
      expect(deploy('staging').status).to.equal(0);
      expect(cron()).to.equal(before);
    });

    it('leaves the table alone, and the deploy green, when crontab itself fails', () => {
      fs.writeFileSync(table, '15 4 * * * /home/deploy/other.sh\n');
      const r = deploy('production', { STUB_CRON_BROKEN: '1' });
      expect(r.status, r.stderr).to.equal(0);
      expect(r.stderr).to.include('drill line not installed');
      expect(cron()).to.equal('15 4 * * * /home/deploy/other.sh\n');
    });

    it('creates the table when the user had none', () => {
      expect(deploy('production').status).to.equal(0);
      expect(cron().split('\n').filter(Boolean)).to.have.length(1);
      expect(cron()).to.include('drill-weekly.sh # bpni drill-weekly');
    });
  });

  describe('compose.sh log-shipper profile', () => {
    // docker stand-in: prints the profiles compose would see and its arguments.
    const STUB_DOCKER = `#!/bin/bash
printf 'profiles=%s\n' "\${COMPOSE_PROFILES-<unset>}"
printf 'args=%s\n' "$*"
`;
    let stubBin: string;
    beforeEach(() => {
      expect(run(sb, 'env-bootstrap.sh', []).status).to.equal(0);
      fs.copyFileSync(path.join(repoBin, 'compose.sh'), path.join(sb.bin, 'compose.sh'));
      stubBin = path.join(sb.tmp, 'stubbin');
      fs.mkdirSync(stubBin);
      fs.writeFileSync(path.join(stubBin, 'docker'), STUB_DOCKER, { mode: 0o755 });
    });
    const setToken = (project: string, token: string) => {
      const f = path.join(sb.root, project, '.env');
      const lines = fs
        .readFileSync(f, 'utf8')
        .split('\n')
        .filter(l => !l.startsWith('BETTERSTACK_SOURCE_TOKEN='));
      fs.writeFileSync(f, [...lines, `BETTERSTACK_SOURCE_TOKEN=${token}`, ''].join('\n'));
    };
    const compose = (project: string, extraEnv: Record<string, string> = {}) =>
      run(sb, 'compose.sh', [project, 'ps'], {
        PATH: `${stubBin}:${process.env.PATH ?? ''}`,
        ...extraEnv,
      });

    it('leaves the profiles alone while the token is empty, as the example ships it', () => {
      expect(value(read(sb, 'production/.env'), 'BETTERSTACK_SOURCE_TOKEN')).to.equal('');
      const r = compose('production');
      expect(r.status, r.stderr).to.equal(0);
      expect(r.stdout).to.include('profiles=<unset>');
    });

    it('adds logs to the .env profiles in production, and keeps the token off the command line', () => {
      setToken('production', 'secret-token-123');
      const r = compose('production');
      expect(r.status, r.stderr).to.equal(0);
      expect(r.stdout).to.include('profiles=backup,logs\n');
      expect(r.stdout).not.to.include('secret-token-123');
    });

    it('adds logs to profiles the caller set, once', () => {
      setToken('production', 't');
      expect(compose('production', { COMPOSE_PROFILES: '' }).stdout).to.include('profiles=logs\n');
      expect(compose('production', { COMPOSE_PROFILES: 'logs,backup' }).stdout).to.include(
        'profiles=logs,backup\n'
      );
    });

    it('never starts a second shipper from staging', () => {
      setToken('staging', 't');
      expect(compose('staging').stdout).to.include('profiles=<unset>');
    });

    it('fails when production/.env cannot be read', function () {
      if (process.getuid && process.getuid() === 0) this.skip();
      fs.chmodSync(path.join(sb.root, 'production', '.env'), 0o000);
      const r = compose('production');
      expect(r.status).to.equal(66);
      expect(r.stderr).to.include('cannot read');
      expect(r.stdout).not.to.include('args=');
    });
  });

  describe('compose.yml', () => {
    const composeFile = fs.readFileSync(path.resolve(repoBin, '../compose.yml'), 'utf8');
    // Service blocks: two-space-indented keys under `services:`.
    const services = () => {
      const body = composeFile.split(/^services:\n/m)[1].split(/^\S/m)[0];
      const out: Record<string, string> = {};
      let current = '';
      for (const l of body.split('\n')) {
        const m = /^  ([a-z][\w-]*):\s*$/.exec(l);
        if (m) {
          current = m[1];
          out[current] = '';
        } else if (current) out[current] += l + '\n';
      }
      return out;
    };

    it('gives every service a memory limit, the shipper included', () => {
      const all = services();
      expect(Object.keys(all)).to.include.members([
        'app',
        'mongo',
        'cloudflared',
        'backup',
        'vector',
      ]);
      for (const [name, block] of Object.entries(all))
        expect(block, name).to.match(/limits:\n\s+(#.*\n\s+)*memory: \S+/);
    });

    it('starts the shipper only in the logs profile, with a pinned image and the config read-only', () => {
      const vector = services().vector;
      expect(vector).to.include('profiles: ["logs"]');
      expect(vector).to.match(/image: timberio\/vector:\d+\.\d+\.\d+-alpine\n/);
      expect(vector).to.include('/vector/vector.yaml:/etc/vector/vector.yaml:ro');
      expect(vector).to.include('memory: 128m');
    });
  });

  describe('vector config', () => {
    const vectorDir = path.resolve(repoBin, '../vector');
    const config = fs.readFileSync(path.join(vectorDir, 'vector.yaml'), 'utf8');
    const image = /image: (timberio\/vector:\S+)/.exec(
      fs.readFileSync(path.resolve(repoBin, '../compose.yml'), 'utf8')
    )![1];

    it('names no environment variable but the two it is given', () => {
      // Vector substitutes $NAME and ${NAME} in the whole file, comments
      // included; an unset one fails the start. $$ is a literal dollar.
      const names = [...config.replace(/\$\$/g, '').matchAll(/\$\{?([A-Za-z_]\w*)/g)].map(
        m => m[1]
      );
      expect([...new Set(names)].sort()).to.deep.equal([
        'BETTERSTACK_INGEST_HOST',
        'BETTERSTACK_SOURCE_TOKEN',
      ]);
    });

    // The transform's own unit tests (vector/tests.yaml), in the pinned image.
    // Needs docker, so it runs in CI and is skipped where there is none.
    it('passes its unit tests in the pinned image', function () {
      this.timeout(300000);
      if (spawnSync('docker', ['version'], { encoding: 'utf8' }).status !== 0) this.skip();
      const r = spawnSync(
        'docker',
        [
          'run',
          '--rm',
          '-e',
          'BETTERSTACK_INGEST_HOST=ingest.invalid',
          '-e',
          'BETTERSTACK_SOURCE_TOKEN=test',
          '-v',
          `${vectorDir}:/etc/vector:ro`,
          image,
          'test',
          '/etc/vector/vector.yaml',
          '/etc/vector/tests.yaml',
        ],
        { encoding: 'utf8' }
      );
      expect(r.status, `${r.stdout}\n${r.stderr}`).to.equal(0);
    });
  });

  describe('cloud-init-render.sh', () => {
    it('fills both key placeholders and leaves none behind', () => {
      const keys = path.join(sb.tmp, 'keys');
      fs.mkdirSync(keys);
      for (const name of ['me', 'bpni-deploy']) {
        const k = spawnSync(
          'ssh-keygen',
          ['-q', '-t', 'ed25519', '-N', '', '-C', name, '-f', path.join(keys, name)],
          { encoding: 'utf8' }
        );
        expect(k.status, k.stderr).to.equal(0);
      }
      const out = path.join(sb.tmp, 'cloud-init.yaml');
      const r = run(sb, 'cloud-init-render.sh', [out], {
        SSH_PUBLIC_KEY: path.join(keys, 'me.pub'),
        DEPLOY_KEY: path.join(keys, 'bpni-deploy'),
      });
      expect(r.status, r.stderr).to.equal(0);
      const rendered = fs.readFileSync(out, 'utf8');
      expect(rendered).not.to.include('AAAA...');
      expect(rendered).to.include(fs.readFileSync(path.join(keys, 'me.pub'), 'utf8').trim());
      expect(rendered).to.include(
        fs.readFileSync(path.join(keys, 'bpni-deploy.pub'), 'utf8').trim()
      );
      // only the two key lines changed
      const template = fs.readFileSync(
        path.resolve(__dirname, '../../deploy/cloud-init.yaml'),
        'utf8'
      );
      expect(rendered.split('\n').length).to.equal(template.split('\n').length);
    });

    it('generates the deploy key when it is missing and rejects a non-key file', () => {
      const keys = path.join(sb.tmp, 'keys');
      fs.mkdirSync(keys);
      spawnSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', path.join(keys, 'me')]);
      const out = path.join(sb.tmp, 'cloud-init.yaml');
      const r = run(sb, 'cloud-init-render.sh', [out], {
        SSH_PUBLIC_KEY: path.join(keys, 'me.pub'),
        DEPLOY_KEY: path.join(keys, 'fresh'),
      });
      expect(r.status, r.stderr).to.equal(0);
      expect(fs.existsSync(path.join(keys, 'fresh.pub'))).to.equal(true);

      // prefix-looks-right garbage must fail too: an accepted bad key would lock the box
      fs.writeFileSync(path.join(keys, 'junk.pub'), 'ssh-ed25519 AAAAinvalid kevin@laptop\n');
      const bad = run(sb, 'cloud-init-render.sh', [out + '.bad'], {
        SSH_PUBLIC_KEY: path.join(keys, 'junk.pub'),
        DEPLOY_KEY: path.join(keys, 'fresh'),
      });
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
      expect(out).to.include(
        '== production app (last 7d) ==\ncovers: from 2026-10-31T05:17:40Z, 14 lines'
      );
      expect(out).to.include(
        '== production mongo (last 7d) ==\ncovers: from 2026-10-31T05:17:40Z, 4 lines'
      );
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

    it('finds the containers by their compose project label, as the box names them', () => {
      expect(run(sb, 'env-bootstrap.sh', []).status).to.equal(0);
      const stubBin = path.join(sb.tmp, 'stubbin');
      fs.mkdirSync(stubBin);
      // docker stand-in: `ps --filter label=com.docker.compose.project=<p>`
      // lists that project's containers, inspect echoes the name, the rest
      // (stats) prints nothing.
      fs.writeFileSync(
        path.join(stubBin, 'docker'),
        `#!/bin/bash
case "$1" in
  ps) case "$*" in
        *project=bpni-production*) printf 'bpni-production-app-1\nbpni-production-vector-1\n' ;;
        *project=bpni-staging*) printf 'bpni-staging-app-1\n' ;;
      esac ;;
  inspect) echo "/\${@: -1} status=running" ;;
esac
exit 0
`,
        { mode: 0o755 }
      );
      const r = run(sb, 'health-report.sh', ['all'], {
        PATH: `${stubBin}:${process.env.PATH ?? ''}`,
      });
      expect(r.status, r.stderr).to.equal(0);
      const section = r.stdout.split('== containers ==\n')[1].split('\n==')[0];
      expect(section).to.include('bpni-production-app-1 status=running');
      expect(section).to.include('bpni-production-vector-1 status=running');
      expect(section).to.include('bpni-staging-app-1 status=running');
      expect(section).not.to.include('no containers');
    });

    it('rejects an unknown argument and a --since docker would not take', () => {
      expect(run(sb, 'health-report.sh', ['prod']).status).to.equal(64);
      const r = run(sb, 'health-report.sh', ['staging', '--no-host', '--since', '7days']);
      expect(r.status).to.equal(64);
      expect(r.stderr).to.include('--since takes');
    });
  });
});
