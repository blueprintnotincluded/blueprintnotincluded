#!/usr/bin/env ts-node

/**
 * WorkOS User Provisioning Script
 *
 * Creates WorkOS accounts for all legacy MongoDB users that don't have one yet.
 * Users are created without a password (emailVerified: true) so they can sign in
 * via "forgot password" or magic link without knowing about the migration.
 *
 * If WORKOS_PLATFORM_ORG_ID is set, each provisioned user is also added to that
 * organization (as a member). This is idempotent — existing memberships are left
 * as-is (so admin role assignments made in the WorkOS dashboard are preserved).
 *
 * Safe to re-run: already-provisioned users are skipped, and existing WorkOS
 * accounts for the same email are reused rather than causing an error.
 *
 * Usage:
 *   npx ts-node scripts/provision-workos-users.ts           # Run
 *   npx ts-node scripts/provision-workos-users.ts --dry-run # Preview only
 *   npx ts-node scripts/provision-workos-users.ts --verbose # Show per-user detail
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { UserModel } from '../app/api/models/user';
import { WorkOSService } from '../app/api/services/workos-service';

export interface ProvisionResult {
  totalFound: number;
  created: number;
  alreadyExisted: number;
  skipped: number;
  orgMembershipsCreated: number;
  orgMembershipsExisted: number;
  errorCount: number;
  errors: Array<{ email: string; error: string }>;
}

export async function provisionWorkOSUsers(
  options: { dryRun?: boolean; verbose?: boolean } = {}
): Promise<ProvisionResult> {
  const { dryRun = false, verbose = false } = options;
  const platformOrgId = process.env.WORKOS_PLATFORM_ORG_ID;

  let openedConnection = false;
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.DB_URI as string);
      openedConnection = true;
    }
    UserModel.init();

    // Process all legacy users — provisionUser is idempotent (find-or-create),
    // so users already in WorkOS are handled correctly. This also repairs users
    // whose WorkOS account was deleted after workosUserId was written to MongoDB.
    const users = await UserModel.model
      .find({ authProvider: 'legacy' })
      .select('_id email username workosUserId')
      .lean();

    const result: ProvisionResult = {
      totalFound: users.length,
      created: 0,
      alreadyExisted: 0,
      skipped: 0,
      orgMembershipsCreated: 0,
      orgMembershipsExisted: 0,
      errorCount: 0,
      errors: [],
    };

    if (users.length === 0) {
      return result;
    }

    for (const user of users) {
      const email = user.email;
      const mongoId = String(user._id);

      if (!email) {
        result.skipped++;
        if (verbose) console.log(`Skipping ${user.username}: no email address`);
        continue;
      }

      if (dryRun) {
        result.created++;
        if (verbose) {
          const orgNote = platformOrgId ? ' + org membership' : '';
          console.log(`[DRY RUN] Would provision: ${email}${orgNote}`);
        }
        continue;
      }

      try {
        const { user: workosUser, created } = await WorkOSService.provisionUser(email, mongoId);

        await UserModel.model.updateOne(
          { _id: user._id },
          { $set: { workosUserId: workosUser.id } }
        );

        if (created) {
          result.created++;
          if (verbose) console.log(`Created WorkOS user for: ${email}`);
        } else {
          result.alreadyExisted++;
          const relinked = user.workosUserId && user.workosUserId !== workosUser.id;
          if (verbose) {
            console.log(
              relinked
                ? `Re-linked WorkOS user for: ${email} (id changed)`
                : `Already in WorkOS: ${email}`
            );
          }
        }

        if (platformOrgId) {
          const { created: membershipCreated } = await WorkOSService.ensureOrgMembership(
            workosUser.id,
            platformOrgId
          );
          if (membershipCreated) {
            result.orgMembershipsCreated++;
            if (verbose) console.log(`  Added to platform org: ${email}`);
          } else {
            result.orgMembershipsExisted++;
            if (verbose) console.log(`  Already in platform org: ${email}`);
          }
        }
      } catch (error: any) {
        result.errorCount++;
        const msg = error.message || String(error);
        result.errors.push({ email, error: msg });
        if (verbose) console.error(`Failed to provision ${email}:`, msg);
      }
    }

    return result;
  } finally {
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

  provisionWorkOSUsers({ dryRun, verbose })
    .then((result) => {
      const prefix = dryRun ? '[DRY RUN] ' : '';
      if (result.totalFound === 0) {
        console.log('✅ No users to provision — all legacy users already have WorkOS accounts');
        process.exit(0);
      }

      console.log(`\n${prefix}Provisioning Summary:`);
      console.log(`  Found:                   ${result.totalFound}`);
      console.log(`  Created:                 ${result.created}`);
      console.log(`  Already existed:         ${result.alreadyExisted}`);
      console.log(`  Skipped:                 ${result.skipped}`);
      if (process.env.WORKOS_PLATFORM_ORG_ID) {
        console.log(`  Org memberships created: ${result.orgMembershipsCreated}`);
        console.log(`  Org memberships existed: ${result.orgMembershipsExisted}`);
      }
      console.log(`  Errors:                  ${result.errorCount}`);

      if (result.errors.length > 0) {
        console.log(`\nErrors:`);
        result.errors.forEach(({ email, error }) => {
          console.log(`  - ${email}: ${error}`);
        });
      }

      if (dryRun) {
        console.log(`\n💡 Run without --dry-run to apply changes`);
      }

      process.exit(result.errorCount > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('Provisioning failed:', error.message);
      process.exit(1);
    });
}
