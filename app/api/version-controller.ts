import { Request, Response } from 'express';

export class VersionController {
  private versionInfo: any = null;

  constructor() {
    this.loadVersionInfo();
  }

  private loadVersionInfo() {
    // Read version from package.json
    let version: string;
    let packageName: string;
    try {
      const packageJson = require('../../package.json');
      version = packageJson.version;
      packageName = packageJson.name;
    } catch (error) {
      console.warn('Could not read package.json:', error);
      version = '0.0.0';
      packageName = 'blueprintnotincluded';
    }

    // Try to get git commit hash if available (for development)
    let gitCommit = process.env.GIT_COMMIT;
    let gitBranch = process.env.GIT_BRANCH;

    // Fall back to git commands in development (when git is available)
    if (!gitCommit || !gitBranch) {
      try {
        const { execSync } = require('child_process');
        if (!gitCommit) {
          gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
        }
        if (!gitBranch) {
          gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
        }
      } catch (error) {
        // Git not available or not a git repo - this is fine for production
      }
    }

    this.versionInfo = {
      version,
      name: packageName,
      buildTime: process.env.BUILD_DATE || new Date().toISOString(),
      buildCommit: gitCommit,
      buildBranch: gitBranch,
      environment: process.env.ENV_NAME || 'development',
      nodeVersion: process.version,
    };
  }

  public getVersion = (req: Request, res: Response) => {
    try {
      res.json(this.versionInfo);
    } catch (error) {
      console.error('Error in getVersion:', error);
      res.status(500).json({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  };
}
