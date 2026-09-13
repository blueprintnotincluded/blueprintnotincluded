// Local dev has no WorkOS keys by default (see specs/local-auth-mode-plan.md).
// AUTH_MODE picks which auth backend the auth-controller endpoints use.
// Pure/stateless so callers can just call authMode() per-request — nothing
// caches the result at import time, which keeps this cheaply testable by
// toggling process.env directly.
export type AuthMode = 'workos' | 'local';

export function authMode(): AuthMode {
  const raw = process.env.AUTH_MODE ?? 'workos';
  if (raw !== 'workos' && raw !== 'local') {
    throw new Error(`Invalid AUTH_MODE "${raw}" — must be "workos" or "local"`);
  }
  // Fail closed: local auth must never be reachable on a production deploy.
  if (raw === 'local' && process.env.ENV_NAME === 'production') {
    throw new Error('AUTH_MODE=local is not allowed when ENV_NAME=production');
  }
  return raw;
}

export function isLocalAuthMode(): boolean {
  return authMode() === 'local';
}
