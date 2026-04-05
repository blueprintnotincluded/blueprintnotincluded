#!/usr/bin/env ts-node

/**
 * Database Migration Script: Add WorkOS Support
 *
 * Migrates existing users to support dual-mode authentication.
 *
 * Usage:
 *   npx ts-node scripts/migrate-to-workos.ts           # Run migration
 *   npx ts-node scripts/migrate-to-workos.ts --dry-run # Preview changes
 *   npx ts-node scripts/migrate-to-workos.ts --verbose # Show details
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { UserModel } from '../app/api/models/user';

interface MigrationResult {
  totalProcessed: number;
  successCount: number;
  errorCount: number;
  errors: Array<{ username: string; error: string }>;
  currentState: {
    total: number;
    legacy: number;
    workos: number;
  };
}

export async function migrateUsersToWorkOS(
  options: { dryRun?: boolean; verbose?: boolean } = {}
): Promise<MigrationResult> {
  const { dryRun = false, verbose = false } = options;

  let openedConnection = false;
  try {
    // Connect to database if not already connected
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.DB_URI as string);
      openedConnection = true;
    }
    UserModel.init();

    // Find users that need migration
    const usersToMigrate = await UserModel.model.find({
      $or: [{ authProvider: { $exists: false } }, { authProvider: null }],
    });

    if (usersToMigrate.length === 0) {
      const currentState = {
        total: await UserModel.model.countDocuments(),
        legacy: await UserModel.model.countDocuments({ authProvider: 'legacy' }),
        workos: await UserModel.model.countDocuments({ authProvider: 'workos' }),
      };

      return {
        totalProcessed: 0,
        successCount: 0,
        errorCount: 0,
        errors: [],
        currentState,
      };
    }

    // Migrate users
    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ username: string; error: string }> = [];

    for (const user of usersToMigrate) {
      try {
        if (dryRun) {
          if (verbose) {
            console.log(`[DRY RUN] Would migrate: ${user.username}`);
          }
          successCount++;
        } else {
          user.authProvider = 'legacy';
          await user.save();
          successCount++;
          if (verbose) {
            console.log(`Migrated: ${user.username}`);
          }
        }
      } catch (error: any) {
        errorCount++;
        const errorMsg = error.message || String(error);
        errors.push({ username: user.username || 'unknown', error: errorMsg });
        if (verbose) {
          console.error(`Failed to migrate ${user.username}:`, errorMsg);
        }
      }
    }

    // Get final state
    const currentState = {
      total: await UserModel.model.countDocuments(),
      legacy: await UserModel.model.countDocuments({ authProvider: 'legacy' }),
      workos: await UserModel.model.countDocuments({ authProvider: 'workos' }),
    };

    return {
      totalProcessed: usersToMigrate.length,
      successCount,
      errorCount,
      errors,
      currentState,
    };
  } finally {
    // Only disconnect if we opened the connection in this function
    if (openedConnection) {
      await mongoose.disconnect();
    }
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose') || args.includes('-v');

  migrateUsersToWorkOS({ dryRun, verbose })
    .then((result) => {
      if (result.totalProcessed === 0) {
        console.log('✅ No migration needed - all users already configured');
      } else {
        console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Migration Summary:`);
        console.log(`  Processed: ${result.totalProcessed}`);
        console.log(`  Success: ${result.successCount}`);
        console.log(`  Errors: ${result.errorCount}`);

        if (result.errors.length > 0) {
          console.log(`\nErrors:`);
          result.errors.forEach(({ username, error }) => {
            console.log(`  - ${username}: ${error}`);
          });
        }
      }

      console.log(`\nCurrent State:`);
      console.log(`  Total: ${result.currentState.total}`);
      console.log(`  Legacy: ${result.currentState.legacy}`);
      console.log(`  WorkOS: ${result.currentState.workos}`);

      if (dryRun) {
        console.log(`\n💡 Run without --dry-run to apply changes`);
      }

      process.exit(result.errorCount > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('Migration failed:', error.message);
      process.exit(1);
    });
}
