// Seed-batch avatar generation: fills the unused-avatar pool by calling Gemini
// once per avatar. Every run costs real money (~$0.045/image at 512px) — the
// script prints a cost estimate and per-item progress.
//
// Usage:
//   npm run avatars:seed-batch -- --count 20
//   ts-node app/api/batch/generate-avatar-batch.ts --count 20 [--reference path/to/sheet.png]
//
// --reference attaches a style reference sheet (many example duplicant
// avatars) to every generation using the seed-batch prompt template.

import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { AvatarModel } from '../models/avatar';
import { UserModel } from '../models/user';
import { AvatarService } from '../services/avatar-service';

dotenv.config();

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

async function run() {
  const count = parseInt(argValue('--count') ?? '10', 10);
  if (!Number.isInteger(count) || count < 1 || count > 200) {
    throw new Error('--count must be between 1 and 200');
  }

  const referencePath = argValue('--reference');
  const reference = referencePath
    ? { data: fs.readFileSync(referencePath), mimeType: 'image/png' }
    : null;

  const mongoUri = process.env.DB_URI;
  if (!mongoUri) throw new Error('DB_URI not set in environment');

  const service = AvatarService.instance;
  if (!service.isEnabled()) {
    throw new Error('GEMINI_API_KEY not set — cannot generate');
  }

  await mongoose.connect(mongoUri);
  AvatarModel.init();
  UserModel.init();

  console.log(
    `Generating ${count} pool avatars (~$${(count * 0.045).toFixed(2)} at 512px standard pricing)` +
      (reference ? ` with style reference ${referencePath}` : '')
  );

  let ok = 0;
  let failed = 0;
  for (let i = 0; i < count; i++) {
    try {
      const avatar = await service.generate({ sourceType: 'seed-batch', reference });
      ok++;
      console.log(`[${i + 1}/${count}] ok avatar=${avatar.id} latencyMs=${avatar.latencyMs}`);
    } catch (err) {
      failed++;
      console.log(`[${i + 1}/${count}] FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`Done: ${ok} generated, ${failed} failed, pool now ${await service.poolCount()} unused`);
  await mongoose.disconnect();
  if (failed > 0 && ok === 0) process.exit(1);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
