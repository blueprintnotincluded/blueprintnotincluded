/**
 * Provides platform-specific installation and setup instructions
 */
export class PlatformInstructions {
  private static readonly instructions: { [stepId: string]: { [platform: string]: string } } = {
    'environment-setup': {
      'darwin': `Install Node.js using Homebrew:
1. Install Homebrew: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
2. Install Node.js: brew install node@20
3. Verify installation: node --version && npm --version`,
      
      'linux': `Install Node.js using package manager:
1. Update package lists: sudo apt-get update
2. Install Node.js: sudo apt-get install nodejs npm
3. For latest version: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
4. Verify installation: node --version && npm --version`,
      
      'win32': `Install Node.js on Windows:
1. Download Node.js installer (.exe) from https://nodejs.org/
2. Run the installer and follow the setup wizard
3. Open PowerShell or Command Prompt (cmd)
4. Verify installation: node --version && npm --version`
    },
    
    'dependencies-install': {
      'darwin': `Install project dependencies:
1. Navigate to project directory: cd /path/to/project
2. Install dependencies: npm ci
3. Verify installation: npm list --depth=0`,
      
      'linux': `Install project dependencies:
1. Navigate to project directory: cd /path/to/project
2. Install dependencies: npm ci
3. If permissions error: sudo chown -R $(whoami) ~/.npm
4. Verify installation: npm list --depth=0`,
      
      'win32': `Install project dependencies:
1. Open Command Prompt as Administrator
2. Navigate to project directory: cd C:\\path\\to\\project
3. Install dependencies: npm ci
4. Verify installation: npm list --depth=0`
    },
    
    'frontend-setup': {
      'darwin': `Configure frontend development:
1. Install frontend build tools: npm install
2. Start development server: npm run dev
3. Open browser to http://localhost:3000`,
      
      'linux': `Configure frontend development:
1. Install frontend build tools: npm install
2. Start development server: npm run dev
3. Open browser to http://localhost:3000`,
      
      'win32': `Configure frontend development:
1. Install frontend build tools: npm install
2. Start development server: npm run dev
3. Open browser to http://localhost:3000`
    },
    
    'database-setup': {
      'darwin': `Setup database:
1. Install MongoDB: brew install mongodb-community
2. Start MongoDB: brew services start mongodb-community
3. Run database migrations: npm run db:migrate`,
      
      'linux': `Setup database:
1. Install MongoDB: sudo apt-get install mongodb
2. Start MongoDB: sudo systemctl start mongod
3. Run database migrations: npm run db:migrate`,
      
      'win32': `Setup database:
1. Download MongoDB from https://www.mongodb.com/download-center
2. Install and start MongoDB service
3. Run database migrations: npm run db:migrate`
    }
  };

  /**
   * Get platform-specific instructions for a step
   */
  static getInstructions(stepId: string, platform: string): { [platform: string]: string } {
    const stepInstructions = this.instructions[stepId];
    if (!stepInstructions) {
      return { [platform]: `No specific instructions available for step: ${stepId}` };
    }

    return {
      [platform]: stepInstructions[platform] || stepInstructions['linux'] || 'Generic instructions not available'
    };
  }

  /**
   * Get instructions for all supported platforms for a step
   */
  static getAllPlatformInstructions(stepId: string): { [platform: string]: string } {
    return this.instructions[stepId] || {};
  }
}