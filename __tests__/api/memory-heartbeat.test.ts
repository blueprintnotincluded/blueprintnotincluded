import { describe, it } from 'mocha';
import { expect } from 'chai';

import {
  formatMemoryLine,
  startMemoryHeartbeat,
} from '../../app/api/services/memory-heartbeat';

describe('memory heartbeat', () => {
  it('formats every memoryUsage field in whole MB', () => {
    const line = formatMemoryLine('api', {
      rss: 293 * 1024 * 1024,
      heapUsed: 120.4 * 1024 * 1024,
      heapTotal: 150 * 1024 * 1024,
      external: 45.6 * 1024 * 1024,
      arrayBuffers: 12 * 1024 * 1024,
    });
    expect(line).to.equal(
      'memory-heartbeat: api rss=293MB heapUsed=120MB heapTotal=150MB external=46MB arrayBuffers=12MB'
    );
  });

  it('does not start under NODE_ENV=test', () => {
    // The suite runs with NODE_ENV=test, so this doubles as a guard that the
    // heartbeat never pollutes test output or holds timers open in CI.
    expect(startMemoryHeartbeat('api')).to.equal(null);
  });
});
