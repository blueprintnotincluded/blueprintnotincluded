import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { OnboardingSystem } from '../../src/onboarding/OnboardingSystem';

describe('Onboarding System Core Structure', () => {
  const onboardingDir = '.onboarding';
  const configDir = path.join(onboardingDir, 'config');
  const dataDir = path.join(onboardingDir, 'data');
  const contentDir = path.join(onboardingDir, 'content');

  before(async () => {
    const system = new OnboardingSystem(process.cwd());
    await system.initializeStructure();
  });

  describe('Task 1.1: Core TypeScript project structure', () => {
    it('should create .onboarding directory structure', () => {
      expect(fs.existsSync(onboardingDir)).to.be.true;
      expect(fs.existsSync(configDir)).to.be.true;
      expect(fs.existsSync(dataDir)).to.be.true;
      expect(fs.existsSync(contentDir)).to.be.true;
    });

    it('should have required subdirectories', () => {
      const subdirs = [
        path.join(configDir, 'templates'),
        path.join(dataDir, 'sessions'),
        path.join(dataDir, 'progress'),
        path.join(dataDir, 'cache'),
        path.join(contentDir, 'human'),
        path.join(contentDir, 'agents'),
        path.join(contentDir, 'shared')
      ];

      subdirs.forEach(dir => {
        expect(fs.existsSync(dir)).to.be.true;
      });
    });

    it('should have TypeScript configuration for onboarding module', () => {
      const tsconfigPath = path.join(onboardingDir, 'tsconfig.json');
      expect(fs.existsSync(tsconfigPath)).to.be.true;
      
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
      expect(tsconfig.compilerOptions).to.exist;
      expect(tsconfig.compilerOptions.target).to.equal('ES2020');
      expect(tsconfig.compilerOptions.module).to.equal('commonjs');
    });

    it('should have foundational types and interfaces', () => {
      const typesPath = path.join(onboardingDir, 'src', 'types', 'index.ts');
      expect(fs.existsSync(typesPath)).to.be.true;
      
      const typesContent = fs.readFileSync(typesPath, 'utf8');
      expect(typesContent).to.include('export interface OnboardingSession');
      expect(typesContent).to.include('export interface ProjectMetadata');
      expect(typesContent).to.include('export enum UserType');
      expect(typesContent).to.include('export enum DeveloperRole');
    });
  });

  describe('Task 1.2: Configuration and schema management', () => {
    it('should have JSON schema definitions', () => {
      const schemaPath = path.join(configDir, 'schema.json');
      expect(fs.existsSync(schemaPath)).to.be.true;
      
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      expect(schema.definitions).to.exist;
      expect(schema.definitions.ProjectMetadata).to.exist;
      expect(schema.definitions.OnboardingSession).to.exist;
    });

    it('should have validation rules configuration', () => {
      const validationRulesPath = path.join(configDir, 'validation-rules.json');
      expect(fs.existsSync(validationRulesPath)).to.be.true;
      
      const rules = JSON.parse(fs.readFileSync(validationRulesPath, 'utf8'));
      expect(rules.contentValidation).to.exist;
      expect(rules.linkValidation).to.exist;
      expect(rules.schemaValidation).to.exist;
    });

    it('should have error handling infrastructure', () => {
      const errorsPath = path.join(onboardingDir, 'src', 'errors', 'index.ts');
      expect(fs.existsSync(errorsPath)).to.be.true;
      
      const errorsContent = fs.readFileSync(errorsPath, 'utf8');
      expect(errorsContent).to.include('export class OnboardingError');
      expect(errorsContent).to.include('export class ValidationError');
      expect(errorsContent).to.include('export class FileSystemError');
    });

    it('should have logging infrastructure', () => {
      const loggingPath = path.join(onboardingDir, 'src', 'utils', 'logger.ts');
      expect(fs.existsSync(loggingPath)).to.be.true;
      
      const loggingContent = fs.readFileSync(loggingPath, 'utf8');
      expect(loggingContent).to.include('export class Logger');
      expect(loggingContent).to.include('info');
      expect(loggingContent).to.include('error');
      expect(loggingContent).to.include('warn');
    });
  });
});