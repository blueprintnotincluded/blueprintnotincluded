// Main entry point for the onboarding system
export * from './types';
export * from './types/link-tracking';
export * from './errors';
export * from './utils/logger';
export * from './managers/documentation-manager';
export * from './engines/template-engine';
export * from './validation/link-tracker';
export * from './orchestrator/onboarding-orchestrator';
export * from './constants';

export const ONBOARDING_VERSION = '1.0.0';