import { ChecklistStep, StepStatus, DeveloperRole } from '../types';

/**
 * Generates role-specific onboarding steps with appropriate dependencies and timing
 */
export class StepGenerator {
  /**
   * Generate base steps common to all developer roles
   */
  static getCommonSteps(): ChecklistStep[] {
    return [
      {
        id: 'environment-setup',
        title: 'Environment Setup',
        description: 'Set up your development environment with required tools',
        isRequired: true,
        estimatedTime: 15,
        dependencies: [],
        status: StepStatus.AVAILABLE,
        contextualHelp: [],
        validationCriteria: {
          nodeVersion: '^20.18.0',
          npmVersion: '^10.0.0'
        },
        instructions: [
          'Install Node.js version 20 or higher',
          'Install npm version 10 or higher',
          'Verify installation by running node --version and npm --version'
        ],
        codeExamples: [
          {
            language: 'bash',
            code: 'node --version\nnpm --version',
            description: 'Check Node.js and npm versions'
          }
        ],
        requirements: ['Node.js 20+', 'npm 10+'],
        categories: ['setup', 'environment']
      },
      {
        id: 'repository-clone',
        title: 'Clone Repository',
        description: 'Clone the project repository to your local machine',
        isRequired: true,
        estimatedTime: 5,
        dependencies: ['environment-setup'],
        status: StepStatus.LOCKED,
        contextualHelp: [],
        instructions: [
          'Clone the repository using git clone',
          'Navigate to the project directory'
        ],
        codeExamples: [
          {
            language: 'bash',
            code: 'git clone <repository-url>\ncd <project-directory>',
            description: 'Clone repository and enter directory'
          }
        ],
        requirements: ['Git'],
        categories: ['setup', 'git']
      },
      {
        id: 'dependency-install',
        title: 'Install Dependencies',
        description: 'Install all project dependencies and verify setup',
        isRequired: true,
        estimatedTime: 10,
        dependencies: ['repository-clone'],
        status: StepStatus.LOCKED,
        contextualHelp: [],
        instructions: [
          'Run npm install to install dependencies',
          'Verify that node_modules directory is created',
          'Check that package-lock.json is updated'
        ],
        codeExamples: [
          {
            language: 'bash',
            code: 'npm install',
            description: 'Install all project dependencies'
          }
        ],
        requirements: ['Node.js', 'npm'],
        categories: ['setup', 'dependencies']
      }
    ];
  }

  /**
   * Generate role-specific steps based on developer role
   */
  static getRoleSpecificSteps(role: DeveloperRole): ChecklistStep[] {
    const commonSteps = this.getCommonSteps();

    switch (role) {
      case DeveloperRole.FRONTEND:
        return [
          ...commonSteps,
          {
            id: 'dev-server-start',
            title: 'Start Development Server',
            description: 'Launch the development server and verify functionality',
            isRequired: true,
            estimatedTime: 5,
            dependencies: ['dependency-install'],
            status: StepStatus.LOCKED,
            contextualHelp: [],
            categories: ['frontend', 'development'],
            instructions: [
              'Start the development server',
              'Verify the application loads correctly'
            ],
            codeExamples: [
              {
                language: 'bash',
                code: 'npm run dev',
                description: 'Start the development server'
              }
            ]
          },
          {
            id: 'frontend-build-verification',
            title: 'Frontend Build Verification',
            description: 'Verify that the frontend build process works correctly',
            isRequired: true,
            estimatedTime: 10,
            dependencies: ['dev-server-start'],
            status: StepStatus.LOCKED,
            contextualHelp: []
          },
          {
            id: 'completion-verification',
            title: 'Completion Verification',
            description: 'Verify that all onboarding steps are completed successfully',
            isRequired: true,
            estimatedTime: 5,
            dependencies: ['frontend-build-verification'],
            status: StepStatus.LOCKED,
            contextualHelp: []
          }
        ];
      
      case DeveloperRole.BACKEND:
        return [
          ...commonSteps,
          {
            id: 'database-setup',
            title: 'Database Setup',
            description: 'Configure database connection and run migrations',
            isRequired: true,
            estimatedTime: 25,
            dependencies: ['dependency-install'],
            status: StepStatus.LOCKED,
            contextualHelp: [],
            categories: ['backend', 'database'],
            instructions: [
              'Set up database connection',
              'Run database migrations',
              'Verify database connectivity'
            ],
            codeExamples: [
              {
                language: 'bash',
                code: 'npm run db:migrate',
                description: 'Run database migrations'
              }
            ]
          },
          {
            id: 'backend-start',
            title: 'Start Backend Server',
            description: 'Launch the backend server and verify functionality',
            isRequired: true,
            estimatedTime: 10,
            dependencies: ['database-setup'],
            status: StepStatus.LOCKED,
            contextualHelp: []
          },
          {
            id: 'api-test',
            title: 'API Testing',
            description: 'Test API endpoints and verify backend functionality',
            isRequired: true,
            estimatedTime: 15,
            dependencies: ['backend-start'],
            status: StepStatus.LOCKED,
            contextualHelp: []
          }
        ];
      
      case DeveloperRole.DEVOPS:
        return [
          ...commonSteps,
          {
            id: 'infrastructure-setup',
            title: 'Infrastructure Setup',
            description: 'Configure deployment infrastructure and CI/CD pipelines',
            isRequired: true,
            estimatedTime: 45,
            dependencies: ['dependency-install'],
            status: StepStatus.LOCKED,
            contextualHelp: []
          },
          {
            id: 'monitoring-setup',
            title: 'Monitoring Setup',
            description: 'Configure monitoring and alerting systems',
            isRequired: true,
            estimatedTime: 30,
            dependencies: ['infrastructure-setup'],
            status: StepStatus.LOCKED,
            contextualHelp: []
          }
        ];
      
      case DeveloperRole.FULLSTACK:
        return [
          ...commonSteps,
          {
            id: 'frontend-setup',
            title: 'Frontend Development Setup',
            description: 'Configure frontend development tools and build system',
            isRequired: true,
            estimatedTime: 20,
            dependencies: ['dependency-install'],
            status: StepStatus.LOCKED,
            contextualHelp: []
          },
          {
            id: 'database-setup',
            title: 'Database Setup',
            description: 'Configure database connection and run migrations',
            isRequired: true,
            estimatedTime: 25,
            dependencies: ['dependency-install'],
            status: StepStatus.LOCKED,
            contextualHelp: []
          },
          {
            id: 'integration-test',
            title: 'Full Stack Integration Test',
            description: 'Test end-to-end functionality across frontend and backend',
            isRequired: true,
            estimatedTime: 20,
            dependencies: ['frontend-setup', 'database-setup'],
            status: StepStatus.LOCKED,
            contextualHelp: []
          }
        ];
      
      default:
        return commonSteps;
    }
  }
}