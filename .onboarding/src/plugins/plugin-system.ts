import { Result, SuccessResult, ErrorResult } from '../types';

export type PluginHook = 
  | 'onboarding:start'
  | 'onboarding:step:complete' 
  | 'onboarding:complete'
  | 'onboarding:error'
  | 'documentation:update'
  | 'validation:check'
  | 'test:hook';

export interface PluginConfig {
  enabled: boolean;
  settings?: { [key: string]: any };
}

export interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  hooks: PluginHook[];
  permissions?: string[];
  initialize: (config?: PluginConfig) => Promise<{ initialized: boolean; [key: string]: any }>;
  execute: (hookName?: string, data?: any) => Promise<{ success: boolean; [key: string]: any }>;
  cleanup?: () => Promise<{ cleaned: boolean; [key: string]: any }>;
  extensions?: { [name: string]: (data: any) => Promise<any> };
}

export interface PluginRegistrationResult {
  pluginId: string;
  registered: boolean;
  timestamp: Date;
}

export interface PluginInitializationResult {
  pluginId: string;
  initialized: boolean;
  config?: PluginConfig;
  timestamp: Date;
}

export interface PluginUnloadResult {
  pluginId: string;
  unloaded: boolean;
  timestamp: Date;
}

export interface PluginSecurityResult {
  pluginId: string;
  securityStatus: 'approved' | 'rejected' | 'warning';
  issues?: string[];
  timestamp: Date;
}

export interface HookExecutionResult {
  hookName: string;
  executedPlugins: string[];
  errors: string[];
  results: { [pluginId: string]: any };
  timestamp: Date;
}

export interface PluginListResult {
  plugins: PluginInfo[];
  totalCount: number;
  timestamp: Date;
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  hooks: PluginHook[];
  permissions?: string[];
  status: 'registered' | 'initialized' | 'error';
  initialized: boolean;
}

export interface ExtensionExecutionResult {
  extensionName: string;
  pluginId: string;
  result: any;
  timestamp: Date;
}

export class PluginSystem {
  private plugins: Map<string, Plugin> = new Map();
  private pluginConfigs: Map<string, PluginConfig> = new Map();
  private pluginStatus: Map<string, 'registered' | 'initialized' | 'error'> = new Map();
  private extensions: Map<string, { pluginId: string; handler: (data: any) => Promise<any> }> = new Map();
  
  // Security configuration
  private readonly DANGEROUS_PERMISSIONS = [
    'admin:all',
    'system:write',
    'file:delete',
    'network:unrestricted'
  ];

  private readonly ALLOWED_PERMISSIONS = [
    'read:documentation',
    'write:progress',
    'read:session',
    'write:session',
    'read:metadata',
    'execute:validation'
  ];

  async registerPlugin(plugin: Plugin): Promise<Result<PluginRegistrationResult, string>> {
    try {
      // Validate plugin configuration
      const validationResult = this.validatePluginConfig(plugin);
      if (!validationResult.isValid) {
        return this.createErrorResult(`Invalid plugin configuration: ${validationResult.errors.join(', ')}`);
      }

      // Check for duplicate registration
      if (this.plugins.has(plugin.id)) {
        return this.createErrorResult(`Plugin already registered: ${plugin.id}`);
      }

      // Validate security
      const securityResult = await this.validatePluginSecurity(plugin);
      if (!securityResult.isSuccess) {
        return this.createErrorResult(securityResult.error!);
      }

      // Register the plugin
      this.plugins.set(plugin.id, plugin);
      this.pluginStatus.set(plugin.id, 'registered');

      // Register extensions if any
      if (plugin.extensions) {
        for (const [extensionName, handler] of Object.entries(plugin.extensions)) {
          this.extensions.set(extensionName, { pluginId: plugin.id, handler });
        }
      }

      return this.createSuccessResult<PluginRegistrationResult>({
        pluginId: plugin.id,
        registered: true,
        timestamp: new Date()
      });

    } catch (error) {
      return this.createErrorResult(`Plugin registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async initializePlugin(pluginId: string, config?: PluginConfig): Promise<Result<PluginInitializationResult, string>> {
    try {
      const plugin = this.plugins.get(pluginId);
      if (!plugin) {
        return this.createErrorResult(`Plugin not found: ${pluginId}`);
      }

      // Store configuration
      if (config) {
        this.pluginConfigs.set(pluginId, config);
      }

      // Initialize the plugin
      const initResult = await plugin.initialize(config);
      
      if (initResult.initialized) {
        this.pluginStatus.set(pluginId, 'initialized');
      } else {
        this.pluginStatus.set(pluginId, 'error');
        return this.createErrorResult(`Plugin initialization failed: ${pluginId}`);
      }

      return this.createSuccessResult<PluginInitializationResult>({
        pluginId,
        initialized: true,
        config,
        timestamp: new Date()
      });

    } catch (error) {
      this.pluginStatus.set(pluginId, 'error');
      return this.createErrorResult(`Plugin initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async unloadPlugin(pluginId: string): Promise<Result<PluginUnloadResult, string>> {
    try {
      const plugin = this.plugins.get(pluginId);
      if (!plugin) {
        return this.createErrorResult(`Plugin not found: ${pluginId}`);
      }

      // Call cleanup if available
      if (plugin.cleanup) {
        await plugin.cleanup();
      }

      // Remove from all collections
      this.plugins.delete(pluginId);
      this.pluginConfigs.delete(pluginId);
      this.pluginStatus.delete(pluginId);

      // Remove extensions
      for (const [extensionName, extensionInfo] of this.extensions) {
        if (extensionInfo.pluginId === pluginId) {
          this.extensions.delete(extensionName);
        }
      }

      return this.createSuccessResult<PluginUnloadResult>({
        pluginId,
        unloaded: true,
        timestamp: new Date()
      });

    } catch (error) {
      return this.createErrorResult(`Plugin unload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async validatePluginSecurity(plugin: Plugin): Promise<Result<PluginSecurityResult, string>> {
    try {
      const issues: string[] = [];
      
      // Check for dangerous permissions
      if (plugin.permissions) {
        const dangerousPerms = plugin.permissions.filter(perm => 
          this.DANGEROUS_PERMISSIONS.some(dangerous => perm.includes(dangerous))
        );
        
        if (dangerousPerms.length > 0) {
          return this.createErrorResult(`Dangerous permissions detected: ${dangerousPerms.join(', ')}`);
        }

        // Check for unknown permissions
        const unknownPerms = plugin.permissions.filter(perm => 
          !this.ALLOWED_PERMISSIONS.includes(perm)
        );
        
        if (unknownPerms.length > 0) {
          issues.push(`Unknown permissions: ${unknownPerms.join(', ')}`);
        }
      }

      const securityStatus: 'approved' | 'rejected' | 'warning' = issues.length > 0 ? 'warning' : 'approved';

      return this.createSuccessResult<PluginSecurityResult>({
        pluginId: plugin.id,
        securityStatus,
        issues: issues.length > 0 ? issues : undefined,
        timestamp: new Date()
      });

    } catch (error) {
      return this.createErrorResult(`Security validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async executeHook(hookName: PluginHook, data: any): Promise<Result<HookExecutionResult, string>> {
    try {
      const executedPlugins: string[] = [];
      const errors: string[] = [];
      const results: { [pluginId: string]: any } = {};

      // Find all plugins that register this hook
      for (const [pluginId, plugin] of this.plugins) {
        if (plugin.hooks.includes(hookName) && this.pluginStatus.get(pluginId) === 'initialized') {
          try {
            const result = await plugin.execute(hookName, data);
            results[pluginId] = result;
            executedPlugins.push(pluginId);
          } catch (error) {
            const errorMessage = `Plugin ${pluginId} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
            errors.push(errorMessage);
          }
        }
      }

      return this.createSuccessResult<HookExecutionResult>({
        hookName,
        executedPlugins,
        errors,
        results,
        timestamp: new Date()
      });

    } catch (error) {
      return this.createErrorResult(`Hook execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async executeExtension(extensionName: string, data: any): Promise<Result<ExtensionExecutionResult, string>> {
    try {
      const extension = this.extensions.get(extensionName);
      if (!extension) {
        return this.createErrorResult(`Extension not found: ${extensionName}`);
      }

      const result = await extension.handler(data);

      return this.createSuccessResult<ExtensionExecutionResult>({
        extensionName,
        pluginId: extension.pluginId,
        result,
        timestamp: new Date()
      });

    } catch (error) {
      return this.createErrorResult(`Extension execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async listPlugins(): Promise<Result<PluginListResult, string>> {
    try {
      const plugins: PluginInfo[] = [];

      for (const [pluginId, plugin] of this.plugins) {
        const status = this.pluginStatus.get(pluginId) || 'registered';
        plugins.push({
          id: plugin.id,
          name: plugin.name,
          version: plugin.version,
          description: plugin.description,
          hooks: plugin.hooks,
          permissions: plugin.permissions,
          status,
          initialized: status === 'initialized'
        });
      }

      return this.createSuccessResult<PluginListResult>({
        plugins,
        totalCount: plugins.length,
        timestamp: new Date()
      });

    } catch (error) {
      return this.createErrorResult(`Plugin listing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getPluginInfo(pluginId: string): Promise<Result<PluginInfo, string>> {
    try {
      const plugin = this.plugins.get(pluginId);
      if (!plugin) {
        return this.createErrorResult(`Plugin not found: ${pluginId}`);
      }

      const status = this.pluginStatus.get(pluginId) || 'registered';

      const pluginInfo: PluginInfo = {
        id: plugin.id,
        name: plugin.name,
        version: plugin.version,
        description: plugin.description,
        hooks: plugin.hooks,
        permissions: plugin.permissions,
        status,
        initialized: status === 'initialized'
      };

      return this.createSuccessResult<PluginInfo>(pluginInfo);

    } catch (error) {
      return this.createErrorResult(`Plugin info retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private validatePluginConfig(plugin: Plugin): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!plugin.id || plugin.id.trim() === '') {
      errors.push('Plugin ID is required');
    }

    if (!plugin.name || plugin.name.trim() === '') {
      errors.push('Plugin name is required');
    }

    if (!plugin.version || plugin.version.trim() === '') {
      errors.push('Plugin version is required');
    }

    if (!plugin.description || plugin.description.trim() === '') {
      errors.push('Plugin description is required');
    }

    if (!Array.isArray(plugin.hooks)) {
      errors.push('Plugin hooks must be an array');
    }

    if (typeof plugin.initialize !== 'function') {
      errors.push('Plugin must have an initialize function');
    }

    if (typeof plugin.execute !== 'function') {
      errors.push('Plugin must have an execute function');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private createSuccessResult<T>(value: T): SuccessResult<T> {
    return {
      isSuccess: true,
      value
    };
  }

  private createErrorResult(error: string): ErrorResult<string> {
    return {
      isSuccess: false,
      error
    };
  }
}