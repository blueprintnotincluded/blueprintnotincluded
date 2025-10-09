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
        validationCriteria: [
          { type: 'nodeVersion', value: '^20.18.0', description: 'Node.js version requirement' },
          { type: 'npmVersion', value: '^10.0.0', description: 'npm version requirement' }
        ],
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
        validationCriteria: [
          { type: 'directoryExists', value: 'project-directory', description: 'Repository directory exists' },
          { type: 'gitStatus', value: 'clean', description: 'Git repository is properly initialized' }
        ],
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
        validationCriteria: [
          { type: 'directoryExists', value: 'node_modules', description: 'Dependencies installed successfully' },
          { type: 'fileExists', value: 'package-lock.json', description: 'Package lock file updated' }
        ],
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
            validationCriteria: [
              { type: 'processRunning', value: 'dev-server', description: 'Development server is running' },
              { type: 'portAccessible', value: '4200', description: 'Server accessible on port 4200' }
            ],
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
            contextualHelp: [],
            validationCriteria: [
              { type: 'buildSuccess', value: 'true', description: 'Frontend build completes successfully' },
              { type: 'fileExists', value: 'dist/index.html', description: 'Build output files exist' }
            ]
          },
          {
            id: 'completion-verification',
            title: 'Completion Verification',
            description: 'Verify that all onboarding steps are completed successfully',
            isRequired: true,
            estimatedTime: 5,
            dependencies: ['frontend-build-verification'],
            status: StepStatus.LOCKED,
            contextualHelp: [],
            validationCriteria: [
              { type: 'allStepsComplete', value: 'true', description: 'All onboarding steps completed' },
              { type: 'systemHealthy', value: 'true', description: 'System is in healthy state' }
            ]
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
            validationCriteria: [
              { type: 'databaseConnection', value: 'success', description: 'Database connection established' },
              { type: 'migrationsComplete', value: 'true', description: 'Database migrations completed' }
            ],
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
            contextualHelp: [],
            validationCriteria: [
              { type: 'serverRunning', value: 'true', description: 'Backend server is running' },
              { type: 'portAccessible', value: '3000', description: 'Server accessible on port 3000' }
            ],
            instructions: [
              'Start the backend development server',
              'Verify the server is running on port 3000',
              'Check that API endpoints are accessible'
            ],
            codeExamples: [
              {
                language: 'bash',
                code: 'npm run dev',
                description: 'Start the backend development server'
              }
            ]
          },
          {
            id: 'api-test',
            title: 'API Testing',
            description: 'Test API endpoints and verify backend functionality',
            isRequired: true,
            estimatedTime: 15,
            dependencies: ['backend-start'],
            status: StepStatus.LOCKED,
            contextualHelp: [],
            validationCriteria: [
              { type: 'apiEndpointsWorking', value: 'true', description: 'API endpoints responding correctly' },
              { type: 'testSuitePassing', value: 'true', description: 'API tests passing' }
            ],
            instructions: [
              'Run API tests to verify endpoints',
              'Check that all endpoints return expected responses',
              'Verify error handling works correctly'
            ],
            codeExamples: [
              {
                language: 'bash',
                code: 'npm run test:api',
                description: 'Run API test suite'
              }
            ]
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
            contextualHelp: [],
            validationCriteria: [
              { type: 'cicdConfigured', value: 'true', description: 'CI/CD pipeline configured' },
              { type: 'deploymentReady', value: 'true', description: 'Deployment infrastructure ready' }
            ],
            instructions: [
              'Set up CI/CD pipeline configuration',
              'Configure deployment environments',
              'Set up infrastructure as code'
            ],
            codeExamples: [
              {
                language: 'bash',
                code: 'docker-compose up -d',
                description: 'Start infrastructure services'
              }
            ]
          },
          {
            id: 'monitoring-setup',
            title: 'Monitoring Setup',
            description: 'Configure monitoring and alerting systems',
            isRequired: true,
            estimatedTime: 30,
            dependencies: ['infrastructure-setup'],
            status: StepStatus.LOCKED,
            contextualHelp: [],
            validationCriteria: [
              { type: 'monitoringActive', value: 'true', description: 'Monitoring systems active' },
              { type: 'alertsConfigured', value: 'true', description: 'Alerting configured' }
            ],
            instructions: [
              'Configure application monitoring',
              'Set up alerting rules',
              'Verify monitoring dashboards'
            ],
            codeExamples: [
              {
                language: 'bash',
                code: 'npm run setup:monitoring',
                description: 'Configure monitoring systems'
              }
            ]
          },
          {
            id: 'security-setup',
            title: 'Security Configuration',
            description: 'Configure security policies and access controls',
            isRequired: true,
            estimatedTime: 25,
            dependencies: ['monitoring-setup'],
            status: StepStatus.LOCKED,
            contextualHelp: [],
            validationCriteria: [
              { type: 'securityPoliciesConfigured', value: 'true', description: 'Security policies configured' },
              { type: 'accessControlsActive', value: 'true', description: 'Access controls active' }
            ],
            instructions: [
              'Configure security policies',
              'Set up access controls',
              'Enable security scanning'
            ],
            codeExamples: [
              {
                language: 'bash',
                code: 'npm run setup:security',
                description: 'Configure security settings'
              }
            ]
          },
          {
            id: 'backup-setup',
            title: 'Backup and Recovery',
            description: 'Configure backup and disaster recovery systems',
            isRequired: true,
            estimatedTime: 20,
            dependencies: ['security-setup'],
            status: StepStatus.LOCKED,
            contextualHelp: [],
            validationCriteria: [
              { type: 'backupSystemActive', value: 'true', description: 'Backup system active' },
              { type: 'recoveryTested', value: 'true', description: 'Recovery process tested' }
            ],
            instructions: [
              'Configure automated backups',
              'Test recovery procedures',
              'Set up disaster recovery plan'
            ],
            codeExamples: [
              {
                language: 'bash',
                code: 'npm run setup:backup',
                description: 'Configure backup systems'
              }
            ]
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
            contextualHelp: [],
            validationCriteria: [
              { type: 'frontendBuildWorking', value: 'true', description: 'Frontend build system working' },
              { type: 'devServerAccessible', value: 'true', description: 'Development server accessible' }
            ]
          },
          {
            id: 'database-setup',
            title: 'Database Setup',
            description: 'Configure database connection and run migrations',
            isRequired: true,
            estimatedTime: 25,
            dependencies: ['dependency-install'],
            status: StepStatus.LOCKED,
            contextualHelp: [],
            validationCriteria: [
              { type: 'databaseConnection', value: 'success', description: 'Database connection established' },
              { type: 'migrationsComplete', value: 'true', description: 'Database migrations completed' }
            ]
          },
          {
            id: 'integration-test',
            title: 'Full Stack Integration Test',
            description: 'Test end-to-end functionality across frontend and backend',
            isRequired: true,
            estimatedTime: 20,
            dependencies: ['frontend-setup', 'database-setup'],
            status: StepStatus.LOCKED,
            contextualHelp: [],
            validationCriteria: [
              { type: 'e2eTestsPassing', value: 'true', description: 'End-to-end tests passing' },
              { type: 'fullStackWorking', value: 'true', description: 'Full stack integration working' }
            ]
          },
          {
            id: 'deployment-setup',
            title: 'Deployment Configuration',
            description: 'Configure deployment pipeline and production environment',
            isRequired: true,
            estimatedTime: 30,
            dependencies: ['integration-test'],
            status: StepStatus.LOCKED,
            contextualHelp: [],
            validationCriteria: [
              { type: 'deploymentReady', value: 'true', description: 'Deployment pipeline configured' },
              { type: 'productionAccessible', value: 'true', description: 'Production environment accessible' }
            ]
          },
          {
            id: 'monitoring-setup',
            title: 'Monitoring and Logging',
            description: 'Set up application monitoring and logging systems',
            isRequired: true,
            estimatedTime: 25,
            dependencies: ['deployment-setup'],
            status: StepStatus.LOCKED,
            contextualHelp: [],
            validationCriteria: [
              { type: 'monitoringActive', value: 'true', description: 'Monitoring systems active' },
              { type: 'logsCollecting', value: 'true', description: 'Log collection working' }
            ]
          }
        ];
      
      default:
        return commonSteps;
    }
  }
}