import { DeveloperRole } from '../types';

/**
 * Provides contextual help and troubleshooting guidance for onboarding steps
 */
export class ContextualHelp {
  private static readonly helpMap: { [stepId: string]: { [role: string]: string[] } } = {
    'environment-setup': {
      [DeveloperRole.FRONTEND]: [
        'Frontend developers need Node.js for build tools and package management',
        'Ensure you have the correct Node.js version (20.x) for compatibility with modern frontend frameworks',
        'If you encounter permission errors, consider using nvm (Node Version Manager)',
        'Verify your development environment supports modern JavaScript features'
      ],
      [DeveloperRole.BACKEND]: [
        'Backend developers need Node.js runtime for server applications',
        'Check that your environment variables are properly configured',
        'Verify database connectivity requirements before proceeding',
        'Ensure your Node.js version supports the latest async/await patterns'
      ],
      [DeveloperRole.DEVOPS]: [
        'DevOps engineers need Node.js for deployment scripts and automation',
        'Consider containerized environments for consistency across deployments',
        'Verify CI/CD pipeline compatibility with your Node.js version',
        'Ensure monitoring tools are compatible with your runtime version'
      ],
      [DeveloperRole.FULLSTACK]: [
        'Fullstack developers need Node.js for both frontend and backend development',
        'Ensure compatibility across different development contexts',
        'Consider using version managers (nvm) for multiple projects',
        'Verify both client-side and server-side compatibility requirements'
      ]
    },
    
    'dependencies-install': {
      [DeveloperRole.FRONTEND]: [
        'npm ci installs exact dependency versions from package-lock.json for reproducible builds',
        'If you see npm errors, try clearing npm cache: npm cache clean --force',
        'Frontend dependencies include build tools, frameworks, and testing libraries',
        'Watch for peer dependency warnings and resolve them promptly'
      ],
      [DeveloperRole.BACKEND]: [
        'npm ci ensures reproducible builds for server environments',
        'If you see npm errors, try clearing npm cache: npm cache clean --force',
        'Watch for database driver compatibility issues with your Node.js version',
        'Consider npm audit for security vulnerabilities in dependencies',
        'Verify that native modules compile correctly on your platform'
      ],
      [DeveloperRole.DEVOPS]: [
        'Use npm ci in production and CI/CD environments for consistent builds',
        'Monitor dependency vulnerabilities with npm audit and automated scanning',
        'Consider using npm package-lock.json in version control for reproducibility',
        'Verify that build processes work in containerized environments'
      ],
      [DeveloperRole.FULLSTACK]: [
        'Manage both client and server dependencies carefully to avoid conflicts',
        'Use workspace configurations for monorepo setups if applicable',
        'Monitor bundle sizes for frontend dependencies',
        'Ensure server dependencies don\'t leak into client bundles'
      ]
    },
    
    'frontend-setup': {
      [DeveloperRole.FRONTEND]: [
        'Configure build tools (Webpack, Vite, etc.) according to project requirements',
        'Verify hot module replacement (HMR) is working for efficient development',
        'Check that CSS preprocessing and PostCSS plugins are configured correctly',
        'Ensure TypeScript compilation is working if the project uses TypeScript'
      ],
      [DeveloperRole.FULLSTACK]: [
        'Configure frontend build to integrate with backend API endpoints',
        'Set up proxy configuration for API calls during development',
        'Verify that frontend and backend can communicate correctly',
        'Check CORS configuration for cross-origin requests'
      ]
    },
    
    'database-setup': {
      [DeveloperRole.BACKEND]: [
        'Verify database connection strings and credentials are correct',
        'Run database migrations to ensure schema is up to date',
        'Check that database indexes are created for performance',
        'Verify backup and recovery procedures are in place'
      ],
      [DeveloperRole.DEVOPS]: [
        'Configure database monitoring and alerting',
        'Set up database backups and disaster recovery procedures',
        'Verify database performance metrics and optimization',
        'Configure database clustering and replication if needed'
      ],
      [DeveloperRole.FULLSTACK]: [
        'Understand both the database schema and API layer interactions',
        'Verify that frontend data models match backend database models',
        'Test data flow from database through API to frontend',
        'Check data validation at all layers of the application'
      ]
    }
  };

  /**
   * Get contextual help for a specific step and role
   */
  static getHelp(stepId: string, role: DeveloperRole): string[] {
    const stepHelp = this.helpMap[stepId];
    if (!stepHelp) {
      return ['General help: Follow the step instructions and consult documentation if needed'];
    }

    return stepHelp[role] || stepHelp[DeveloperRole.FRONTEND] || ['General help available for this step'];
  }

  /**
   * Get troubleshooting tips for common issues
   */
  static getTroubleshootingTips(stepId: string): string[] {
    const troubleshooting: { [stepId: string]: string[] } = {
      'environment-setup': [
        'If Node.js installation fails, try using the official installer from nodejs.org',
        'Clear npm cache if you encounter permission errors: npm cache clean --force',
        'On macOS, use sudo with npm install -g if you encounter permission issues',
        'On Windows, run Command Prompt as Administrator for global installations'
      ],
      'dependencies-install': [
        'Delete node_modules and package-lock.json, then run npm install if you encounter version conflicts',
        'Check your internet connection if downloads are failing',
        'Use npm install --verbose to see detailed installation logs',
        'Try npm install --force as a last resort for stubborn dependency issues'
      ],
      'frontend-setup': [
        'Clear browser cache if you don\'t see changes in development',
        'Check that all required ports are available (usually 3000, 8080, etc.)',
        'Verify environment variables are set correctly for your development environment',
        'Check browser console for JavaScript errors if the application isn\'t loading'
      ],
      'database-setup': [
        'Verify database service is running: check system services or process manager',
        'Check database connection strings for typos or incorrect credentials',
        'Ensure database user has appropriate permissions for the application',
        'Verify firewall settings aren\'t blocking database connections'
      ]
    };

    return troubleshooting[stepId] || ['Check logs and documentation for specific error messages'];
  }
}