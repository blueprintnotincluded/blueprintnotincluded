// Main entry point for the onboarding system
export * from './types';
export * from './errors';
export * from './utils/logger';
export * from './managers/documentation-manager';
export * from './engines/template-engine';
export * from './validation/link-tracker';
export * from './validation/content-validation-engine';
export * from './orchestrator/onboarding-orchestrator';
export * from './examples/executable-code-example-engine';
export * from './constants';
export { CiCdIntegration } from './integration/ci-cd-integration-wrapper';
export * from './cli/validation-runner';

export const ONBOARDING_VERSION = '1.0.0';