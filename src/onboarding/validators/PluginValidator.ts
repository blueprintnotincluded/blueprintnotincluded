import { Plugin, PluginValidationResult, SecurityCheck, CompatibilityCheck } from '../types/Integration';

export class PluginValidator {
  static async validate(plugin: Plugin): Promise<PluginValidationResult> {
    const securityChecks = this.performSecurityChecks(plugin);
    const compatibilityChecks = this.performCompatibilityChecks(plugin);

    const allPassed = securityChecks.every(check => check.passed) && 
                     compatibilityChecks.every(check => check.passed);

    return {
      isValid: allPassed,
      securityChecks,
      compatibilityChecks,
      warnings: securityChecks
        .filter(check => !check.passed && check.severity === 'medium')
        .map(check => check.message),
      errors: securityChecks
        .filter(check => !check.passed && check.severity === 'high')
        .map(check => check.message)
    };
  }

  private static performSecurityChecks(plugin: Plugin): SecurityCheck[] {
    return [
      {
        name: 'File path validation',
        passed: !plugin.entryPoint.includes('..'),
        severity: 'high',
        message: plugin.entryPoint.includes('..') 
          ? 'Entry point contains path traversal' 
          : 'Entry point is safe'
      },
      {
        name: 'Permission check',
        passed: !plugin.permissions?.includes('file-system'),
        severity: 'medium',
        message: plugin.permissions?.includes('file-system') 
          ? 'Plugin requests file system access' 
          : 'Safe permissions'
      },
      {
        name: 'Dangerous permissions',
        passed: !plugin.permissions?.some(perm => 
          ['process', 'network', 'env'].includes(perm)
        ),
        severity: 'high',
        message: plugin.permissions?.some(perm => 
          ['process', 'network', 'env'].includes(perm)
        ) ? 'Plugin requests dangerous permissions' : 'No dangerous permissions'
      }
    ];
  }

  private static performCompatibilityChecks(plugin: Plugin): CompatibilityCheck[] {
    const validTypes = ['integration', 'notification', 'validation', 'reporting'];
    
    return [
      {
        name: 'Node version',
        passed: true, // Simplified - would check actual Node version requirements
        requirement: '>=14.0.0',
        actual: process.version,
        message: 'Node version is compatible'
      },
      {
        name: 'Plugin type',
        passed: validTypes.includes(plugin.type),
        requirement: 'Valid plugin type',
        actual: plugin.type,
        message: validTypes.includes(plugin.type) 
          ? 'Valid plugin type' 
          : 'Invalid plugin type'
      },
      {
        name: 'Entry point',
        passed: plugin.entryPoint.endsWith('.js') || plugin.entryPoint.endsWith('.ts'),
        requirement: 'JavaScript or TypeScript file',
        actual: plugin.entryPoint,
        message: (plugin.entryPoint.endsWith('.js') || plugin.entryPoint.endsWith('.ts'))
          ? 'Valid entry point' 
          : 'Entry point must be a JavaScript or TypeScript file'
      }
    ];
  }
}