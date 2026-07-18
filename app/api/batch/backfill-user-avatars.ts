// Assign a random unused pool avatar to every user that has none. Does NOT
// generate: it only consumes the existing pool (run avatars:seed-batch first
// with enough headroom). Rerunnable — users with an avatar are skipped.
//
// Usage:
//   npm run avatars:backfill            assign for real
//   npm run avatars:backfill:dry-run    report counts only

import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { AvatarModel } from '../models/avatar';
import { UserModel } from '../models/user';
import { AvatarService } from '../services/avatar-service';

dotenv.config();

async function run(dryRun: boolean) {
  const mongoUri = process.env.DB_URI;
  if (!mongoUri) throw new Error('DB_URI not set in environment');

  await mongoose.connect(mongoUri);
  AvatarModel.init();
  UserModel.init();

  const service = AvatarService.instance;
  const users = await UserModel.model
    .find({ $or: [{ avatarId: null }, { avatarId: { $exists: false } }] })
    .select('username')
    .lean();
  const pool = await service.poolCount();

  console.log(`${users.length} users without avatars, ${pool} unused avatars in pool`);
  if (dryRun) {
    if (pool < users.length) {
      console.log(`DRY RUN: pool is short by ${users.length - pool} — run avatars:seed-batch first`);
    } else {
      console.log('DRY RUN: pool is sufficient');
    }
    await mongoose.disconnect();
    return;
  }

  let assigned = 0;
  let skipped = 0;
  for (const user of users) {
    const avatar = await service.assignRandomFromPool(String(user._id));
    if (avatar) {
      assigned++;
      console.log(`assigned ${avatar.id} → ${user.username}`);
    } else {
      skipped++;
      console.log(`pool empty — skipped ${user.username}`);
    }
  }

  console.log(`Done: ${assigned} assigned, ${skipped} skipped, pool now ${await service.poolCount()}`);
  await mongoose.disconnect();
}

run(process.argv.includes('--dry-run')).catch(err => {
  console.error(err);
  process.exit(1);
});
