// Smoke test for the Gemini avatar integration: one real generation
// (~$0.045), stored in the pool like any other paid asset, plus a PNG written
// next to the repo for eyeballing. Optionally exercises the face-seeded path.
//
// Usage:
//   npm run avatars:smoke                         random avatar
//   npm run avatars:smoke -- --seed path/to.jpg   face-seeded avatar

import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { AvatarModel } from '../models/avatar';
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

  await mongoose.connect(mongoUri);
  AvatarModel.init();
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

  console.log('Generating one avatar...');
  const avatar =
    reference != null
      ? await service.generate({ sourceType: 'user-upload', reference })
      : await service.generate({ sourceType: 'random' });

  const outPath = 'avatar-smoke-test.png';
  fs.writeFileSync(outPath, avatar.originalBytes as Buffer);

  console.log('Smoke test OK:');
  console.log(`  avatar id:     ${avatar.id} (stored in pool, status=${avatar.status})`);
  console.log(`  model:         ${avatar.providerModel}`);
  console.log(`  latency:       ${avatar.latencyMs}ms`);
  console.log(`  original:      ${avatar.originalWidth}x${avatar.originalHeight} (${(avatar.originalBytes as Buffer).length} bytes)`);
  console.log(`  display:       ${avatar.width}x${avatar.height} (${(avatar.bytes as Buffer).length} bytes)`);
  console.log(`  usage:         ${JSON.stringify(avatar.usage ?? null)}`);
  console.log(`  preview file:  ${outPath} (gitignored scratch output — delete freely)`);

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Smoke test FAILED:', err);
  process.exit(1);
});
