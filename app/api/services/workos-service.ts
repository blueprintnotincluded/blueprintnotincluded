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
   * Get authorization URL for user login
   */
  static getAuthorizationUrl(): string {
    const workos = getWorkOSClient();
    return workos.userManagement.getAuthorizationUrl({
      provider: 'authkit',
      clientId: process.env.WORKOS_CLIENT_ID!,
      redirectUri: `${process.env.HOST}/api/auth/callback`,
    });
  }

  /**
   * Authenticate user with authorization code
   */
  static async authenticateWithCode(code: string) {
    const workos = getWorkOSClient();
    const { user, accessToken } = await workos.userManagement.authenticateWithCode({
      code,
      clientId: process.env.WORKOS_CLIENT_ID!,
    });

    return { user, accessToken };
  }

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
  static async createUser(email: string, password: string) {
    const workos = getWorkOSClient();
    return await workos.userManagement.createUser({
      email,
      password,
      emailVerified: true, // Since they were verified in our system
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
    return await workos.userManagement.createMagicAuth({
      email,
    });
  }
}
