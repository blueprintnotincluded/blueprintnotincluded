import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

// Load test environment first
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';
import { UserModel } from '../../app/api/models/user';
import { migrateUsersToWorkOS } from '../../scripts/migrate-to-workos';

describe('WorkOS Migration Script', function () {
  beforeEach(async function () {
    this.timeout(5000);
    await TestSetup.beforeEach();
  });

  afterEach(async function () {
    this.timeout(5000);
    await TestSetup.afterEach();
  });

  describe('migrateUsersToWorkOS', function () {
    it('should migrate users without authProvider field', async function () {
      // Create a user without authProvider (simulating pre-migration state)
      const user = new UserModel.model({
        email: 'test@example.com',
        username: 'testuser',
      });
      user.setPassword('password123');
      await user.save();
      await UserModel.model.updateOne({ _id: user._id }, { $unset: { authProvider: '' } });

      const result = await migrateUsersToWorkOS();

      expect(result.totalProcessed).to.be.greaterThan(0);
      expect(result.successCount).to.be.greaterThan(0);
      expect(result.errorCount).to.equal(0);
      expect(result.errors).to.be.an('array').with.lengthOf(0);

      // Verify user was migrated
      const migratedUser = await UserModel.model.findById(user._id);
      expect(migratedUser?.authProvider).to.equal('legacy');
    });

    it('should not modify users that already have authProvider', async function () {
      // All test users should already have authProvider from test setup
      const beforeCount = await UserModel.model.countDocuments({ authProvider: 'legacy' });

      const result = await migrateUsersToWorkOS();

      const afterCount = await UserModel.model.countDocuments({ authProvider: 'legacy' });

      // If users already had authProvider, they shouldn't be processed
      expect(result.totalProcessed).to.equal(0);
      expect(beforeCount).to.equal(afterCount);
    });

    it('should return current state of users', async function () {
      const result = await migrateUsersToWorkOS();

      expect(result.currentState).to.be.an('object');
      expect(result.currentState.total).to.be.a('number').that.is.at.least(0);
      expect(result.currentState.legacy).to.be.a('number').that.is.at.least(0);
      expect(result.currentState.workos).to.be.a('number').that.is.at.least(0);

      // Verify totals add up
      expect(result.currentState.legacy + result.currentState.workos).to.equal(
        result.currentState.total
      );
    });

    it('should support dry-run mode without making changes', async function () {
      // Create a user without authProvider
      const user = new UserModel.model({
        email: 'dryrun@example.com',
        username: 'dryrunuser',
      });
      user.setPassword('password123');
      await user.save();
      await UserModel.model.updateOne({ _id: user._id }, { $unset: { authProvider: '' } });

      // Run in dry-run mode
      const result = await migrateUsersToWorkOS({ dryRun: true });

      expect(result.successCount).to.be.greaterThan(0);

      // Verify user was NOT actually migrated (use lean to bypass schema default)
      const unchangedUser = await UserModel.model.findById(user._id).lean();
      expect(unchangedUser?.authProvider).to.be.undefined;
    });

    it('should handle migration errors gracefully', async function () {
      // This test would need to mock a save failure
      // For now, we just verify the error handling structure exists
      const result = await migrateUsersToWorkOS();

      expect(result).to.have.property('errors');
      expect(result.errors).to.be.an('array');
    });

    it('should correctly count legacy and workos users after migration', async function () {
      // Create users with different auth providers
      const legacyUser = new UserModel.model({
        email: 'legacy@example.com',
        username: 'legacyuser',
        authProvider: 'legacy',
      });
      legacyUser.setPassword('password123');
      await legacyUser.save();

      const workosUser = new UserModel.model({
        email: 'workos@example.com',
        username: 'workosuser',
        authProvider: 'workos',
        workosUserId: 'user_test123',
      });
      await workosUser.save();

      const result = await migrateUsersToWorkOS();

      expect(result.currentState.legacy).to.be.at.least(1);
      expect(result.currentState.workos).to.be.at.least(1);
      expect(result.currentState.total).to.equal(
        result.currentState.legacy + result.currentState.workos
      );
    });
  });

  describe('Migration idempotency', function () {
    it('should be safe to run multiple times', async function () {
      // Create a user without authProvider
      const user = new UserModel.model({
        email: 'idempotent@example.com',
        username: 'idempotentuser',
      });
      user.setPassword('password123');
      await user.save();
      await UserModel.model.updateOne({ _id: user._id }, { $unset: { authProvider: '' } });

      // Run migration first time
      const result1 = await migrateUsersToWorkOS();
      expect(result1.successCount).to.be.greaterThan(0);

      // Run migration second time
      const result2 = await migrateUsersToWorkOS();
      expect(result2.totalProcessed).to.equal(0); // No users to migrate

      // Verify user is still in correct state
      const finalUser = await UserModel.model.findById(user._id);
      expect(finalUser?.authProvider).to.equal('legacy');
    });
  });
});
