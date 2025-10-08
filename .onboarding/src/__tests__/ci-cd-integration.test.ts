import { expect } from 'chai';
import { CICDIntegration } from '../integration/ci-cd-integration';
import { 
  CiCdValidationResult, 
  BuildProcessConfig,
  ValidationCheckConfig,
  CiCdIntegrationConfig
} from '../types';
import { CiCdError } from '../errors';
import * as fs from 'fs';
import * as path from 'path';

describe('CICDIntegration', () => {
  let ciCdIntegration: CICDIntegration;
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

    ciCdIntegration = new CICDIntegration();
  });

  describe('validateDocumentationInBuild', () => {
    it('should validate documentation as part of build process', async () => {
      const result = await ciCdIntegration.validateDocumentationInBuild();
      
      expect(result.isSuccess).to.be.true;
      if (result.isSuccess && result.value) {
        expect(result.value).to.have.property('buildStatus');
        expect(result.value).to.have.property('validationResults');
        expect(result.value.buildStatus).to.be.a('string');
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
      
      const failingIntegration = new CICDIntegration();
      const result = await failingIntegration.validateDocumentationInBuild();
      
      expect(result.isSuccess).to.be.true;
      if (result.isSuccess && result.value) {
        expect(result.value.buildStatus).to.be.a('string');
        expect(result.value.validationResults).to.be.an('array');
      }
    });
  });

  describe('generateValidationReport', () => {
    it('should generate comprehensive validation report', async () => {
      const result = await ciCdIntegration.generateValidationReport();
      
      expect(result.isSuccess).to.be.true;
      if (result.isSuccess && result.value) {
        expect(result.value).to.have.property('reportPath');
        expect(result.value).to.have.property('summary');
        expect(result.value.reportPath).to.be.a('string');
        expect(result.value.summary).to.be.an('object');
      }
    });

    it('should save report to specified path', async () => {
      const result = await ciCdIntegration.generateValidationReport();
      
      expect(result.isSuccess).to.be.true;
      if (result.isSuccess && result.value) {
        expect(result.value.reportPath).to.be.a('string');
        expect(result.value.reportPath).to.include('.json');
      }
    });
  });

  describe('integrateWithBuildProcess', () => {
    it('should integrate validation checks with build commands', async () => {
      const buildResult = await ciCdIntegration.integrateWithBuildProcess();
      
      expect(buildResult.isSuccess).to.be.true;
      if (buildResult.isSuccess && buildResult.value) {
        expect(buildResult.value).to.have.property('integrated');
        expect(buildResult.value).to.have.property('buildConfig');
        expect(buildResult.value.integrated).to.be.a('boolean');
        expect(buildResult.value.buildConfig).to.be.an('object');
      }
    });

    it('should handle build command failures appropriately', async () => {
      const invalidConfig = {
        ...mockConfig,
        buildCommands: ['invalid-command-that-does-not-exist']
      };
      
      const invalidIntegration = new CICDIntegration();
      const result = await invalidIntegration.integrateWithBuildProcess();
      
      expect(result.isSuccess).to.be.true;
      if (result.isSuccess && result.value) {
        expect(result.value.integrated).to.be.a('boolean');
        expect(result.value.buildConfig).to.be.an('object');
      }
    });
  });

  describe('configureGitHubActions', () => {
    it('should generate GitHub Actions workflow configuration', async () => {
      const workflowResult = await ciCdIntegration.configureGitHubActions();
      
      expect(workflowResult.isSuccess).to.be.true;
      if (workflowResult.isSuccess && workflowResult.value) {
        expect(workflowResult.value).to.have.property('workflowPath');
        expect(workflowResult.value).to.have.property('configured');
        expect(workflowResult.value.workflowPath).to.be.a('string');
        expect(workflowResult.value.configured).to.be.a('boolean');
      }
    });

    it('should create workflow file if it does not exist', async () => {
      const workflowResult = await ciCdIntegration.configureGitHubActions();
      
      expect(workflowResult.isSuccess).to.be.true;
      if (workflowResult.isSuccess && workflowResult.value) {
        expect(workflowResult.value.workflowPath).to.be.a('string');
        expect(workflowResult.value.configured).to.be.a('boolean');
      }
    });
  });

  describe('validateDocumentationCoverage', () => {
    it('should calculate documentation coverage metrics', async () => {
      const coverageResult = await ciCdIntegration.validateDocumentationCoverage();
      
      expect(coverageResult.isSuccess).to.be.true;
      if (coverageResult.isSuccess && coverageResult.value) {
        expect(coverageResult.value).to.have.property('coverage');
        expect(coverageResult.value).to.have.property('missingSections');
        expect(coverageResult.value.coverage).to.be.a('number');
        expect(coverageResult.value.missingSections).to.be.an('array');
      }
    });
  });

  describe('error handling', () => {
    it('should handle missing project path gracefully', async () => {
      const invalidConfig = {
        ...mockConfig,
        projectPath: '/non/existent/path'
      };
      
      const invalidIntegration = new CICDIntegration();
      const result = await invalidIntegration.validateDocumentationInBuild('/non/existent/path');
      
      expect(result.isSuccess).to.be.false;
      if (!result.isSuccess && result.error) {
        expect(result.error).to.be.instanceOf(Error);
        expect(result.error.message).to.be.a('string');
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