import { expect } from 'chai';
import { CiCdIntegration } from '../integration/ci-cd-integration';
import { 
  CiCdValidationResult, 
  BuildProcessConfig,
  ValidationCheckConfig,
  CiCdIntegrationConfig
} from '../types';
import { CiCdError } from '../errors';
import * as fs from 'fs';
import * as path from 'path';

describe('CiCdIntegration', () => {
  let ciCdIntegration: CiCdIntegration;
  let testProjectPath: string;
  let mockConfig: CiCdIntegrationConfig;

  beforeEach(() => {
    testProjectPath = path.resolve(__dirname, '../../test-fixtures');
    mockConfig = {
      projectPath: testProjectPath,
      buildCommands: ['npm run build', 'npm run lint'],
      validationRules: [
        { id: 'documentation-coverage', threshold: 80, required: true },
        { id: 'link-validation', threshold: 95, required: true }
      ],
      onFailureAction: 'fail-build',
      reportPath: './ci-validation-report.json'
    };

    ciCdIntegration = new CiCdIntegration(mockConfig);
  });

  describe('validateDocumentationInBuild', () => {
    it('should validate documentation as part of build process', async () => {
      const result = await ciCdIntegration.validateDocumentationInBuild();
      
      expect(result.isSuccess).to.be.true;
      if (result.isSuccess) {
        expect(result.value).to.have.property('overallScore');
        expect(result.value).to.have.property('validationResults');
        expect(result.value).to.have.property('buildStatus');
        expect(result.value.overallScore).to.be.a('number');
        expect(result.value.validationResults).to.be.an('array');
      }
    });

    it('should fail build when validation threshold not met', async () => {
      const failingConfig = {
        ...mockConfig,
        validationRules: [
          { id: 'documentation-coverage', threshold: 99, required: true }
        ]
      };
      
      const failingIntegration = new CiCdIntegration(failingConfig);
      const result = await failingIntegration.validateDocumentationInBuild();
      
      expect(result.isSuccess).to.be.true;
      if (result.isSuccess) {
        expect(result.value.buildStatus).to.equal('failed');
        expect(result.value.failureReasons).to.include('documentation-coverage threshold not met');
      }
    });
  });

  describe('generateValidationReport', () => {
    it('should generate comprehensive validation report', async () => {
      const result = await ciCdIntegration.generateValidationReport();
      
      expect(result.isSuccess).to.be.true;
      if (result.isSuccess) {
        expect(result.value).to.have.property('reportPath');
        expect(result.value).to.have.property('summary');
        expect(result.value).to.have.property('detailedResults');
        expect(result.value.summary).to.have.property('totalFiles');
        expect(result.value.summary).to.have.property('validFiles');
        expect(result.value.summary).to.have.property('invalidFiles');
      }
    });

    it('should save report to specified path', async () => {
      const result = await ciCdIntegration.generateValidationReport();
      
      expect(result.isSuccess).to.be.true;
      if (result.isSuccess) {
        const reportExists = fs.existsSync(result.value.reportPath);
        expect(reportExists).to.be.true;
      }
    });
  });

  describe('integrateWithBuildProcess', () => {
    it('should integrate validation checks with build commands', async () => {
      const buildResult = await ciCdIntegration.integrateWithBuildProcess();
      
      expect(buildResult.isSuccess).to.be.true;
      if (buildResult.isSuccess) {
        expect(buildResult.value).to.have.property('buildSteps');
        expect(buildResult.value).to.have.property('validationSteps');
        expect(buildResult.value).to.have.property('overallResult');
        expect(buildResult.value.buildSteps).to.be.an('array');
        expect(buildResult.value.validationSteps).to.be.an('array');
      }
    });

    it('should handle build command failures appropriately', async () => {
      const invalidConfig = {
        ...mockConfig,
        buildCommands: ['invalid-command-that-does-not-exist']
      };
      
      const invalidIntegration = new CiCdIntegration(invalidConfig);
      const result = await invalidIntegration.integrateWithBuildProcess();
      
      expect(result.isSuccess).to.be.true;
      if (result.isSuccess) {
        expect(result.value.overallResult).to.equal('failed');
        expect(result.value.failureReasons).to.be.an('array');
      }
    });
  });

  describe('configureGitHubActions', () => {
    it('should generate GitHub Actions workflow configuration', async () => {
      const workflowResult = await ciCdIntegration.configureGitHubActions();
      
      expect(workflowResult.isSuccess).to.be.true;
      if (workflowResult.isSuccess) {
        expect(workflowResult.value).to.have.property('workflowPath');
        expect(workflowResult.value).to.have.property('workflowContent');
        expect(workflowResult.value.workflowContent).to.include('onboarding-validation');
        expect(workflowResult.value.workflowContent).to.include('Documentation Validation');
      }
    });

    it('should create workflow file if it does not exist', async () => {
      const workflowResult = await ciCdIntegration.configureGitHubActions();
      
      expect(workflowResult.isSuccess).to.be.true;
      if (workflowResult.isSuccess) {
        const workflowExists = fs.existsSync(workflowResult.value.workflowPath);
        expect(workflowExists).to.be.true;
      }
    });
  });

  describe('validateDocumentationCoverage', () => {
    it('should calculate documentation coverage metrics', async () => {
      const coverageResult = await ciCdIntegration.validateDocumentationCoverage();
      
      expect(coverageResult.isSuccess).to.be.true;
      if (coverageResult.isSuccess) {
        expect(coverageResult.value).to.have.property('coveragePercentage');
        expect(coverageResult.value).to.have.property('totalFiles');
        expect(coverageResult.value).to.have.property('documentedFiles');
        expect(coverageResult.value).to.have.property('undocumentedFiles');
        expect(coverageResult.value.coveragePercentage).to.be.at.least(0);
        expect(coverageResult.value.coveragePercentage).to.be.at.most(100);
      }
    });
  });

  describe('error handling', () => {
    it('should handle missing project path gracefully', async () => {
      const invalidConfig = {
        ...mockConfig,
        projectPath: '/non/existent/path'
      };
      
      const invalidIntegration = new CiCdIntegration(invalidConfig);
      const result = await invalidIntegration.validateDocumentationInBuild();
      
      expect(result.isSuccess).to.be.false;
      if (!result.isSuccess) {
        expect(result.error).to.be.instanceOf(CiCdError);
        expect(result.error.message).to.include('Project path does not exist');
      }
    });

    it('should handle validation failures without crashing', async () => {
      const result = await ciCdIntegration.validateDocumentationInBuild();
      
      // Should not throw, always return a Result type
      expect(result).to.have.property('isSuccess');
      expect(result.isSuccess).to.be.a('boolean');
    });
  });
});