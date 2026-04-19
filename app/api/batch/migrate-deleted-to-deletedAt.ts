import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const uri = process.env.DB_URI as string;
if (!uri) {
  console.error('DB_URI not set');
  process.exit(1);
}

async function run() {
  await mongoose.connect(uri);
  const col = mongoose.connection.collection('blueprints');

  const total = await col.countDocuments({});
  const alreadyMigrated = await col.countDocuments({ deletedAt: { $exists: true } });
  console.log(`Total blueprints: ${total}`);
  console.log(`Already have deletedAt: ${alreadyMigrated}`);

  if (process.argv.includes('--dry-run')) {
    const toSet = await col.countDocuments({ deleted: true, deletedAt: { $exists: false } });
    const toClear = await col.countDocuments({ deleted: { $ne: true }, deletedAt: { $exists: false } });
    console.log(`[dry-run] Would set deletedAt=modifiedAt on ${toSet} deleted blueprints`);
    console.log(`[dry-run] Would set deletedAt=null on ${toClear} non-deleted blueprints`);
    await mongoose.disconnect();
    return;
  }

  // deleted:true → deletedAt = modifiedAt
  // The deleted field is left in place intentionally — removing it in the same
  // operation would cause the second updateMany to match all docs.
  // It will orphan naturally once the schema no longer references it.
  const setResult = await col.updateMany(
    { deleted: true, deletedAt: { $exists: false } },
    [{ $set: { deletedAt: '$modifiedAt' } }]
  );
  console.log(`Set deletedAt on ${setResult.modifiedCount} deleted blueprints`);

  // deleted:false/null/missing → deletedAt = null
  const clearResult = await col.updateMany(
    { deleted: { $ne: true }, deletedAt: { $exists: false } },
    { $set: { deletedAt: null } }
  );
  console.log(`Set deletedAt=null on ${clearResult.modifiedCount} non-deleted blueprints`);

  await mongoose.disconnect();
  console.log('Migration complete');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
