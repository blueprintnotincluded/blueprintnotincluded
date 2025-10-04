import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

export class VersionController {
  private versionInfo: any = null;

  constructor() {
    this.loadVersionInfo();
  }

  private loadVersionInfo() {
    try {
      // Load version info from package.json
      const packagePath = path.join(process.cwd(), 'package.json');
      
      if (!fs.existsSync(packagePath)) {
        console.error('package.json not found at:', packagePath);
        throw new Error('package.json not found');
      }
      
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      
      // Try to get git commit hash if available (for development)
      let gitCommit = null;
      try {
        const { execSync } = require('child_process');
        gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
      } catch (error) {
        // Git not available or not a git repo
      }

      // Try to get git branch if available (for development)
      let gitBranch = null;
      try {
        const { execSync } = require('child_process');
        gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
      } catch (error) {
        // Git not available or not a git repo
      }

      this.versionInfo = {
        version: packageJson.version,
        name: packageJson.name,
        buildTime: process.env.BUILD_DATE || new Date().toISOString(),
        buildCommit: process.env.GIT_COMMIT || gitCommit,
        buildBranch: process.env.GIT_BRANCH || gitBranch,
        environment: process.env.ENV_NAME || 'development',
        nodeVersion: process.version,
      };
    } catch (error) {
      console.error('Error loading version info:', error);
      this.versionInfo = {
        version: 'unknown',
        name: 'blueprintnotincluded',
        buildTime: process.env.BUILD_DATE || new Date().toISOString(),
        environment: process.env.ENV_NAME || 'development',
        nodeVersion: process.version,
        error: 'Failed to load version information'
      };
    }
  }

  public getVersion = (req: Request, res: Response) => {
    try {
      res.json(this.versionInfo);
    } catch (error) {
      console.error('Error in getVersion:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
}
