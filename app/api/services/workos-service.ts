import { WorkOS } from '@workos-inc/node';

let workosInstance: WorkOS | null = null;

function getWorkOSClient(): WorkOS {
  if (!workosInstance) {
    const apiKey = process.env.WORKOS_API_KEY;
    if (!apiKey) {
      throw new Error('WORKOS_API_KEY environment variable is not set');
    }
    workosInstance = new WorkOS(apiKey);
  }
  return workosInstance;
}

export class WorkOSService {
  /**
   * Get user by WorkOS ID
   */
  static async getUser(userId: string) {
    const workos = getWorkOSClient();
    return await workos.userManagement.getUser(userId);
  }

  /**
   * Create a WorkOS user from existing user data
   */
  static async createUser(email: string, password: string, verified: boolean) {
    const workos = getWorkOSClient();
    return await workos.userManagement.createUser({
      email,
      password,
      ...(verified ? { emailVerified: true } : {}),
    });
  }

  /**
   * Send password reset email via WorkOS
   */
  static async sendPasswordResetEmail(email: string) {
    const workos = getWorkOSClient();
    return await workos.userManagement.createPasswordReset({
      email,
    });
  }

  /**
   * Create magic auth link for seamless migration
   */
  static async createMagicAuth(email: string) {
    const workos = getWorkOSClient();
    const siteUrl = process.env.SITE_URL;
    return await workos.userManagement.createMagicAuth({
      email,
      ...(siteUrl ? { redirectUri: `${siteUrl}/auth/magic` } : {}),
    });
  }

  /**
   * Create a WorkOS account for a legacy user (no password — they must use
   * magic link or "forgot password" to sign in for the first time).
   * If a WorkOS user already exists for this email, returns it rather than
   * throwing, so the script is safe to re-run.
   */
  static async provisionUser(
    email: string,
    externalId: string
  ): Promise<{ user: { id: string; email: string }; created: boolean }> {
    const workos = getWorkOSClient();
    try {
      const user = await workos.userManagement.createUser({
        email,
        emailVerified: true,
        externalId,
      });
      return { user, created: true };
    } catch {
      // createUser failed — the user may already exist in WorkOS under a
      // different ID or error code. Attempt a lookup before giving up.
      const list = await workos.userManagement.listUsers({ email });
      const user = list.data[0];
      if (!user) {
        throw new Error(`Could not create or find WorkOS user for ${email}`);
      }
      return { user, created: false };
    }
  }

  /**
   * Ensure a WorkOS user is a member of the given org. Creates the membership
   * if it doesn't exist; returns the existing one if it does. Safe to call on
   * every provision run (idempotent).
   */
  static async ensureOrgMembership(
    workosUserId: string,
    organizationId: string
  ): Promise<{ membershipId: string; created: boolean }> {
    const workos = getWorkOSClient();
    try {
      const membership = await workos.userManagement.createOrganizationMembership({
        userId: workosUserId,
        organizationId,
      });
      return { membershipId: membership.id, created: true };
    } catch (error: any) {
      // Membership already exists — fetch it rather than erroring
      if (error?.status === 409 || error?.status === 422) {
        const list = await workos.userManagement.listOrganizationMemberships({
          userId: workosUserId,
          organizationId,
        });
        const existing = list.data[0];
        if (!existing) {
          throw new Error(
            `Membership conflict for user ${workosUserId} in org ${organizationId} but could not be retrieved`
          );
        }
        return { membershipId: existing.id, created: false };
      }
      throw error;
    }
  }

  /**
   * Authenticate a user with email and password
   */
  static async authenticateWithPassword(email: string, password: string) {
    const clientId = process.env.WORKOS_CLIENT_ID;
    if (!clientId) throw new Error('WORKOS_CLIENT_ID environment variable is not set');
    const workos = getWorkOSClient();
    const { user, accessToken } = await workos.userManagement.authenticateWithPassword({
      email,
      password,
      clientId,
    });
    return { user, accessToken };
  }

  /**
   * Authenticate a user with a magic auth code
   */
  static async authenticateWithMagicAuth(code: string, email: string) {
    const clientId = process.env.WORKOS_CLIENT_ID;
    if (!clientId) throw new Error('WORKOS_CLIENT_ID environment variable is not set');
    const workos = getWorkOSClient();
    const { user, accessToken } = await workos.userManagement.authenticateWithMagicAuth({
      code,
      email,
      clientId,
    });
    return { user, accessToken };
  }

  /**
   * Reset a user's password using a reset token
   */
  static async resetPassword(token: string, newPassword: string) {
    const workos = getWorkOSClient();
    return await workos.userManagement.resetPassword({ token, newPassword });
  }

  /**
   * Update a WorkOS user record (e.g. to set externalId)
   */
  static async updateUser(userId: string, attrs: { externalId?: string }) {
    const workos = getWorkOSClient();
    return workos.userManagement.updateUser({ userId, ...attrs });
  }

  /**
   * Check if a user is an active member of the platform org and return their role slug.
   * Returns null if WORKOS_PLATFORM_ORG_ID is unset, the user has no membership, or any error occurs.
   */
  static async getPlatformRole(workosUserId: string): Promise<string | null> {
    const workos = getWorkOSClient();
    const orgId = process.env.WORKOS_PLATFORM_ORG_ID;
    if (!orgId) return null;

    try {
      const memberships = await workos.userManagement.listOrganizationMemberships({
        userId: workosUserId,
        organizationId: orgId,
        statuses: ['active'],
      });
      return memberships.data[0]?.role.slug ?? null;
    } catch {
      return null;
    }
  }
}
