// Smoke test for the Gemini avatar integration: one real grid generation
// (~$0.045 → 4 avatars), stored in the pool like any other paid asset, plus
// PNGs written next to the repo for eyeballing. Optionally exercises the
// face-seeded path.
//
// Usage:
//   npm run avatars:smoke                         random grid
//   npm run avatars:smoke -- --seed path/to.jpg   face-seeded grid

import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { AvatarModel } from '../models/avatar';
import { AvatarBatchModel } from '../models/avatar-batch';
import { AvatarSeedUploadModel } from '../models/avatar-seed-upload';
import { UserModel } from '../models/user';
import { AvatarService } from '../services/avatar-service';

dotenv.config();

async function run() {
  const mongoUri = process.env.DB_URI;
  if (!mongoUri) throw new Error('DB_URI not set in environment');

  const service = AvatarService.instance;
  if (!service.isEnabled()) {
    throw new Error('GEMINI_API_KEY not set — add it to .env (see agent/AVATARS.md)');
  }
  if (!service.getStyleSheet() || !service.getHatsSheet()) {
    console.log('WARNING: reference sheet missing — generation will fail closed');
  }

  await mongoose.connect(mongoUri);
  AvatarModel.init();
  AvatarBatchModel.init();
  AvatarSeedUploadModel.init();
  UserModel.init();

  const seedIdx = process.argv.indexOf('--seed');
  const seedPath = seedIdx >= 0 ? process.argv[seedIdx + 1] : null;

  let reference = null;
  if (seedPath) {
    reference = { data: fs.readFileSync(seedPath), mimeType: 'image/jpeg' };
    console.log(`Classifying ${seedPath}...`);
    const classification = await service.provider.classifyFace(reference);
    console.log(`  faceLikely=${classification.faceLikely} raw="${classification.rawOutput}"`);
  }

  console.log('Generating one 2x2 grid (4 avatars)...');
  const avatars =
    reference != null
      ? await service.generateBatch({ sourceType: 'user-upload', reference })
      : await service.generateBatch({ sourceType: 'seed-batch' });

  const batch = avatars[0]?.batchId
    ? await AvatarBatchModel.model.findById(avatars[0].batchId)
    : null;
  if (batch) {
    fs.writeFileSync('avatar-smoke-test.png', batch.bytes);
  }
  avatars.forEach((avatar, i) => {
    fs.writeFileSync(`avatar-smoke-test-${i}.png`, avatar.bytes as Buffer);
  });

  console.log('Smoke test OK:');
  console.log(`  avatars:       ${avatars.map(a => String(a.id)).join(', ')}`);
  console.log(`  model:         ${avatars[0]?.providerModel}`);
  console.log(`  grid:          ${batch ? `${batch.width}x${batch.height} (${batch.bytes.length} bytes)` : 'n/a'}`);
  console.log(`  latency:       ${batch?.latencyMs}ms`);
  console.log(`  usage:         ${JSON.stringify(batch?.usage ?? null)}`);
  console.log('  preview files: avatar-smoke-test.png (grid) + avatar-smoke-test-{0..3}.png (tiles)');
  console.log('                 (gitignored scratch output — delete freely)');

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Smoke test FAILED:', err);
  process.exit(1);
});
