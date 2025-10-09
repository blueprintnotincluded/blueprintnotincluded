/**
 * Constants used throughout the onboarding system
 */

export const ONBOARDING_PATHS = {
  BASE: '.onboarding',
  CONFIG: '.onboarding/config',
  CONFIG_TEMPLATES: '.onboarding/config/templates',
  DATA: '.onboarding/data',
  DATA_SESSIONS: '.onboarding/data/sessions',
  DATA_PROGRESS: '.onboarding/data/progress',
  DATA_CACHE: '.onboarding/data/cache',
  CONTENT: '.onboarding/content',
  CONTENT_HUMAN: '.onboarding/content/human',
  CONTENT_AGENTS: '.onboarding/content/agents',
  CONTENT_SHARED: '.onboarding/content/shared'
} as const;

export const TEMPLATE_NAMES = {
  HUMAN_ONBOARDING: 'human-onboarding',
  AGENT_CONTEXT: 'agent-context',
  PROJECT_OVERVIEW: 'project-overview',
  SETUP_GUIDE: 'setup-guide',
  ROLE_GUIDE: 'role-guide',
  BASE_LAYOUT: 'base-layout'
} as const;

export const REQUIRED_TEMPLATE_FILES = [
  'config/templates/human-onboarding.md',
  'config/templates/agent-context.json',
  'config/templates/project-overview.md',
  'config/templates/setup-guide.md'
] as const;

export const DEVELOPER_ROLES = {
  FRONTEND: 'frontend',
  BACKEND: 'backend',
  DEVOPS: 'devops',
  FULLSTACK: 'fullstack'
} as const;

export const EXPERIENCE_LEVELS = {
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced'
} as const;