import { describe, it, after } from 'mocha';
import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

import {
  readCgroupMemoryLimitMb,
  resolveMaxRssMb,
  resolveMaxOldSpaceMb,
  workerHeapExecArgv,
  DEFAULT_MAX_OLD_SPACE_MB,
  PARENT_HEADROOM_MB,
  MIN_RSS_CAP_MB,
  MAX_RSS_CAP_MB,
} from '../../app/api/services/render-memory';

describe('resolveMaxRssMb', () => {
  it('uses a valid PREVIEW_WORKER_MAX_RSS_MB verbatim', () => {
    const { maxRssMb, detail } = resolveMaxRssMb({
      env: '250',
      cgroupLimitMb: 512,
      totalMemMb: 512,
    });
    expect(maxRssMb).to.equal(250);
    expect(detail).to.contain('PREVIEW_WORKER_MAX_RSS_MB');
  });

  it('ignores an invalid env value and derives instead', () => {
    const { maxRssMb, detail } = resolveMaxRssMb({
      env: 'lots',
      cgroupLimitMb: 512,
      totalMemMb: 512,
    });
    expect(maxRssMb).to.equal(512 - PARENT_HEADROOM_MB);
    expect(detail).to.contain('ignored invalid');
  });

  it('derives 192MB on a 512MB container (cgroup signal)', () => {
    const { maxRssMb, detail } = resolveMaxRssMb({ cgroupLimitMb: 512, totalMemMb: 32768 });
    expect(maxRssMb).to.equal(192);
    expect(detail).to.contain('via cgroup');
  });

  it('falls back to os.totalmem when the cgroup reports no limit (DO gVisor)', () => {
    const { maxRssMb, detail } = resolveMaxRssMb({ cgroupLimitMb: null, totalMemMb: 512 });
    expect(maxRssMb).to.equal(192);
    expect(detail).to.contain('via os.totalmem');
  });

  it('takes the smaller of the two signals', () => {
    expect(resolveMaxRssMb({ cgroupLimitMb: 512, totalMemMb: 1024 }).maxRssMb).to.equal(192);
    expect(resolveMaxRssMb({ cgroupLimitMb: 1024, totalMemMb: 512 }).maxRssMb).to.equal(192);
  });

  it('caps at the 384MB ceiling on large hosts', () => {
    const { maxRssMb } = resolveMaxRssMb({ cgroupLimitMb: null, totalMemMb: 32768 });
    expect(maxRssMb).to.equal(MAX_RSS_CAP_MB);
  });

  it('never drops below the floor on tiny containers', () => {
    const { maxRssMb } = resolveMaxRssMb({ cgroupLimitMb: 256, totalMemMb: 256 });
    expect(maxRssMb).to.equal(MIN_RSS_CAP_MB);
  });
});

describe('readCgroupMemoryLimitMb', () => {
  const tempDirs: string[] = [];
  const tempFile = (contents: string): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cgroup-test-'));
    tempDirs.push(dir);
    const file = path.join(dir, 'memory.max');
    fs.writeFileSync(file, contents);
    return file;
  };

  after(() => {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads a real limit in MB', () => {
    expect(readCgroupMemoryLimitMb([tempFile('536870912\n')])).to.equal(512);
  });

  it('returns null for the v2 "max" sentinel', () => {
    expect(readCgroupMemoryLimitMb([tempFile('max\n')])).to.equal(null);
  });

  it('returns null for the unlimited numeric sentinel (gVisor / cgroup v1)', () => {
    expect(readCgroupMemoryLimitMb([tempFile('9223372036854771712\n')])).to.equal(null);
  });

  it('returns null when no candidate file exists', () => {
    expect(readCgroupMemoryLimitMb(['/nonexistent/memory.max'])).to.equal(null);
  });

  it('falls through unreadable candidates to a later one', () => {
    expect(readCgroupMemoryLimitMb(['/nonexistent/memory.max', tempFile('1073741824')])).to.equal(
      1024
    );
  });
});

describe('resolveMaxOldSpaceMb', () => {
  it('defaults to the pinned ceiling rather than whatever V8 derives from os.totalmem()', () => {
    const { maxOldSpaceMb, detail } = resolveMaxOldSpaceMb({ env: undefined });
    expect(maxOldSpaceMb).to.equal(DEFAULT_MAX_OLD_SPACE_MB);
    expect(detail).to.contain('default');
  });

  it('uses a valid PREVIEW_WORKER_MAX_OLD_SPACE_MB verbatim', () => {
    const { maxOldSpaceMb, detail } = resolveMaxOldSpaceMb({ env: '512' });
    expect(maxOldSpaceMb).to.equal(512);
    expect(detail).to.contain('PREVIEW_WORKER_MAX_OLD_SPACE_MB');
  });

  it('accepts exponent notation that resolves to a whole number', () => {
    // Number('1e3') is 1000, which is what gets interpolated into the flag.
    expect(resolveMaxOldSpaceMb({ env: '1e3' }).maxOldSpaceMb).to.equal(1000);
  });

  it('falls back to the default on a garbage override, and says so', () => {
    // --max-old-space-size is parsed as a size_t: a fractional "256.5" is an
    // illegal value and the worker never starts, so every render fails.
    // 1e21 and up stringify in exponent form, which V8 rejects the same way.
    for (const env of ['nonsense', '0', '-64', '256.5', '1e21', 'Infinity']) {
      const { maxOldSpaceMb, detail } = resolveMaxOldSpaceMb({ env });
      expect(maxOldSpaceMb).to.equal(DEFAULT_MAX_OLD_SPACE_MB);
      expect(detail).to.contain('ignored invalid');
    }
  });
});

describe('workerHeapExecArgv', () => {
  it('passes the old-space ceiling and the pinned semi-space', () => {
    expect(workerHeapExecArgv(256)).to.deep.equal([
      '--max-old-space-size=256',
      '--max-semi-space-size=16',
    ]);
  });

  it('gives the worker the 304MB heap limit Node 20 gave it', function () {
    // Runs the real runtime with the real flags. On Node 24 the old-space flag
    // alone yields 448MB; if a Node upgrade moves this again, this is the
    // test that says so.
    this.timeout(10000);
    const out = execFileSync(process.execPath, [
      ...workerHeapExecArgv(DEFAULT_MAX_OLD_SPACE_MB),
      '-p',
      "require('v8').getHeapStatistics().heap_size_limit / 1048576",
    ]);
    expect(Math.round(Number(out.toString().trim()))).to.equal(304);
  });
});
