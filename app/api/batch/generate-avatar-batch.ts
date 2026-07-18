// Seed-batch avatar generation: fills the unused-avatar pool. Grid mode makes
// each provider call (~$0.045) yield four 256px avatars, and the committed
// duplicant style sheet is attached automatically.
//
// Usage:
//   npm run avatars:seed-batch -- --count 20
//   ts-node app/api/batch/generate-avatar-batch.ts --count 20
//
// --count is in avatars, rounded up to whole grids of 4.

import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { AvatarModel } from '../models/avatar';
import { AvatarBatchModel } from '../models/avatar-batch';
import { UserModel } from '../models/user';
import { AvatarService, GRID_TILES } from '../services/avatar-service';

dotenv.config();

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

async function run() {
  const count = parseInt(argValue('--count') ?? '12', 10);
  if (!Number.isInteger(count) || count < 1 || count > 400) {
    throw new Error('--count must be between 1 and 400');
  }

  const mongoUri = process.env.DB_URI;
  if (!mongoUri) throw new Error('DB_URI not set in environment');

  const service = AvatarService.instance;
  if (!service.isEnabled()) {
    throw new Error('GEMINI_API_KEY not set — cannot generate');
  }

  await mongoose.connect(mongoUri);
  AvatarModel.init();
  AvatarBatchModel.init();
  UserModel.init();

  const calls = Math.ceil(count / GRID_TILES);
  console.log(
    `Generating ~${calls * GRID_TILES} pool avatars in ${calls} grid calls ` +
      `(~$${(calls * 0.045).toFixed(2)} at 512px standard pricing)` +
      (service.getStyleSheet() ? ' with the duplicant style sheet' : ' WITHOUT style sheet (missing!)')
  );

  let ok = 0;
  let failed = 0;
  for (let i = 0; i < calls; i++) {
    try {
      const avatars = await service.generateBatch({ sourceType: 'seed-batch' });
      ok += avatars.length;
      console.log(`[call ${i + 1}/${calls}] ok → ${avatars.length} avatars`);
    } catch (err) {
      failed++;
      console.log(`[call ${i + 1}/${calls}] FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(
    `Done: ${ok} avatars from ${calls - failed}/${calls} calls, pool now ${await service.poolCount()} unused`
  );
  await mongoose.disconnect();
  if (failed > 0 && ok === 0) process.exit(1);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
