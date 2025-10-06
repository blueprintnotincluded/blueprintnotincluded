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
        }
      },
      {
        id: 'dependencies-install',
        title: 'Install Dependencies',
        description: 'Install all project dependencies and verify setup',
        isRequired: true,
        estimatedTime: 10,
        dependencies: ['environment-setup'],
        status: StepStatus.LOCKED,
        contextualHelp: []
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
            id: 'frontend-setup',
            title: 'Frontend Development Setup',
            description: 'Configure frontend development tools and build system',
            isRequired: true,
            estimatedTime: 20,
            dependencies: ['dependencies-install'],
            status: StepStatus.LOCKED,
            contextualHelp: []
          },
          {
            id: 'dev-server-start',
            title: 'Start Development Server',
            description: 'Launch the development server and verify functionality',
            isRequired: true,
            estimatedTime: 5,
            dependencies: ['frontend-setup'],
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
            dependencies: ['dependencies-install'],
            status: StepStatus.LOCKED,
            contextualHelp: []
          },
          {
            id: 'api-test',
            title: 'API Testing',
            description: 'Test API endpoints and verify backend functionality',
            isRequired: true,
            estimatedTime: 15,
            dependencies: ['database-setup'],
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
            dependencies: ['dependencies-install'],
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
            dependencies: ['dependencies-install'],
            status: StepStatus.LOCKED,
            contextualHelp: []
          },
          {
            id: 'database-setup',
            title: 'Database Setup',
            description: 'Configure database connection and run migrations',
            isRequired: true,
            estimatedTime: 25,
            dependencies: ['dependencies-install'],
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