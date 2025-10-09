import { expect } from 'chai';
import { PluginSystem, Plugin, PluginConfig, PluginHook } from '../plugins/plugin-system';
import { OnboardingSession, UserType, DeveloperRole } from '../types';

describe('PluginSystem', () => {
  let pluginSystem: PluginSystem;
  let mockSession: OnboardingSession;

  beforeEach(() => {
    pluginSystem = new PluginSystem();
    mockSession = {
      sessionId: 'test-session-1',
      userId: 'user-1',
      userType: UserType.HUMAN_DEVELOPER,
      developerRole: DeveloperRole.FRONTEND,
      startTime: new Date(),
      lastActivity: new Date(),
      currentStep: 'setup',
      completedSteps: [],
      isComplete: false
    };
  });

  describe('Plugin Registration', () => {
    it('should register a valid plugin', async () => {
      const mockPlugin: Plugin = {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'A test plugin',
        hooks: ['onboarding:start', 'onboarding:complete'],
        initialize: async () => ({ initialized: true }),
        execute: async () => ({ success: true })
      };

      const result = await pluginSystem.registerPlugin(mockPlugin);
      
      expect(result.isSuccess).to.be.true;
      expect(result.value?.pluginId).to.equal('test-plugin');
    });

    it('should reject plugins with invalid configuration', async () => {
      const invalidPlugin: any = {
        id: '', // Invalid empty ID
        name: 'Test Plugin',
        version: '1.0.0'
      };

      const result = await pluginSystem.registerPlugin(invalidPlugin);
      
      expect(result.isSuccess).to.be.false;
      expect(result.error).to.include('Invalid plugin configuration');
    });

    it('should prevent duplicate plugin registration', async () => {
      const plugin: Plugin = {
        id: 'duplicate-plugin',
        name: 'Duplicate Plugin',
        version: '1.0.0',
        description: 'A duplicate plugin',
        hooks: [],
        initialize: async () => ({ initialized: true }),
        execute: async () => ({ success: true })
      };

      await pluginSystem.registerPlugin(plugin);
      const result = await pluginSystem.registerPlugin(plugin);
      
      expect(result.isSuccess).to.be.false;
      expect(result.error).to.include('Plugin already registered');
    });
  });

  describe('Plugin Lifecycle Management', () => {
    it('should initialize registered plugins', async () => {
      const plugin: Plugin = {
        id: 'lifecycle-plugin',
        name: 'Lifecycle Plugin',
        version: '1.0.0',
        description: 'A lifecycle test plugin',
        hooks: [],
        initialize: async (config?: PluginConfig) => ({ 
          initialized: true, 
          config: config?.settings || {} 
        }),
        execute: async () => ({ success: true })
      };

      await pluginSystem.registerPlugin(plugin);
      const result = await pluginSystem.initializePlugin('lifecycle-plugin', {
        enabled: true,
        settings: { testMode: true }
      });
      
      expect(result.isSuccess).to.be.true;
      expect(result.value?.initialized).to.be.true;
    });

    it('should unload plugins gracefully', async () => {
      const plugin: Plugin = {
        id: 'unload-plugin',
        name: 'Unload Plugin',
        version: '1.0.0',
        description: 'A plugin to test unloading',
        hooks: [],
        initialize: async () => ({ initialized: true }),
        execute: async () => ({ success: true }),
        cleanup: async () => ({ cleaned: true })
      };

      await pluginSystem.registerPlugin(plugin);
      await pluginSystem.initializePlugin('unload-plugin');
      
      const result = await pluginSystem.unloadPlugin('unload-plugin');
      
      expect(result.isSuccess).to.be.true;
      expect(result.value?.unloaded).to.be.true;
    });

    it('should validate plugin security', async () => {
      const securePlugin: Plugin = {
        id: 'secure-plugin',
        name: 'Secure Plugin',
        version: '1.0.0',
        description: 'A secure plugin',
        hooks: [],
        permissions: ['read:documentation', 'write:progress'],
        initialize: async () => ({ initialized: true }),
        execute: async () => ({ success: true })
      };

      const result = await pluginSystem.validatePluginSecurity(securePlugin);
      
      expect(result.isSuccess).to.be.true;
      expect(result.value?.securityStatus).to.equal('approved');
    });

    it('should reject plugins with dangerous permissions', async () => {
      const dangerousPlugin: Plugin = {
        id: 'dangerous-plugin',
        name: 'Dangerous Plugin',
        version: '1.0.0',
        description: 'A dangerous plugin',
        hooks: [],
        permissions: ['admin:all', 'system:write'], // Dangerous permissions
        initialize: async () => ({ initialized: true }),
        execute: async () => ({ success: true })
      };

      const result = await pluginSystem.validatePluginSecurity(dangerousPlugin);
      
      expect(result.isSuccess).to.be.false;
      expect(result.error).to.include('Dangerous permissions detected');
    });
  });

  describe('Hook System', () => {
    it('should execute plugins on registered hooks', async () => {
      let hookExecuted = false;
      
      const hookPlugin: Plugin = {
        id: 'hook-plugin',
        name: 'Hook Plugin',
        version: '1.0.0',
        description: 'A plugin that responds to hooks',
        hooks: ['onboarding:start'],
        initialize: async () => ({ initialized: true }),
        execute: async (hookName: string, data: any) => {
          if (hookName === 'onboarding:start') {
            hookExecuted = true;
          }
          return { success: true, hookName };
        }
      };

      await pluginSystem.registerPlugin(hookPlugin);
      await pluginSystem.initializePlugin('hook-plugin');
      
      const result = await pluginSystem.executeHook('onboarding:start', { session: mockSession });
      
      expect(result.isSuccess).to.be.true;
      expect(hookExecuted).to.be.true;
      expect(result.value?.executedPlugins).to.include('hook-plugin');
    });

    it('should handle hook execution errors gracefully', async () => {
      const errorPlugin: Plugin = {
        id: 'error-plugin',
        name: 'Error Plugin',
        version: '1.0.0',
        description: 'A plugin that throws errors',
        hooks: ['onboarding:error'],
        initialize: async () => ({ initialized: true }),
        execute: async () => {
          throw new Error('Plugin execution failed');
        }
      };

      await pluginSystem.registerPlugin(errorPlugin);
      await pluginSystem.initializePlugin('error-plugin');
      
      const result = await pluginSystem.executeHook('onboarding:error', {});
      
      expect(result.isSuccess).to.be.true; // Should not fail the entire hook execution
      expect(result.value?.errors).to.have.length(1);
      expect(result.value?.errors[0]).to.include('Plugin execution failed');
    });
  });

  describe('Custom Integration APIs', () => {
    it('should provide extension points for custom integrations', async () => {
      const extensionPlugin: Plugin = {
        id: 'extension-plugin',
        name: 'Extension Plugin',
        version: '1.0.0',
        description: 'A plugin that extends functionality',
        hooks: [],
        initialize: async () => ({ initialized: true }),
        execute: async () => ({ success: true }),
        extensions: {
          'custom-validator': async (data: any) => ({ valid: true, data }),
          'custom-formatter': async (content: string) => ({ formatted: content.toUpperCase() })
        }
      };

      await pluginSystem.registerPlugin(extensionPlugin);
      await pluginSystem.initializePlugin('extension-plugin');
      
      const validationResult = await pluginSystem.executeExtension('custom-validator', { test: 'data' });
      const formatResult = await pluginSystem.executeExtension('custom-formatter', 'hello world');
      
      expect(validationResult.isSuccess).to.be.true;
      expect(validationResult.value?.result?.valid).to.be.true;
      expect(formatResult.isSuccess).to.be.true;
      expect(formatResult.value?.result?.formatted).to.equal('HELLO WORLD');
    });

    it('should handle missing extensions gracefully', async () => {
      const result = await pluginSystem.executeExtension('non-existent-extension', {});
      
      expect(result.isSuccess).to.be.false;
      expect(result.error).to.include('Extension not found');
    });
  });

  describe('Plugin Discovery and Management', () => {
    it('should list all registered plugins', async () => {
      const plugin1: Plugin = {
        id: 'plugin-1',
        name: 'Plugin 1',
        version: '1.0.0',
        description: 'First plugin',
        hooks: [],
        initialize: async () => ({ initialized: true }),
        execute: async () => ({ success: true })
      };

      const plugin2: Plugin = {
        id: 'plugin-2',
        name: 'Plugin 2',
        version: '2.0.0',
        description: 'Second plugin',
        hooks: [],
        initialize: async () => ({ initialized: true }),
        execute: async () => ({ success: true })
      };

      await pluginSystem.registerPlugin(plugin1);
      await pluginSystem.registerPlugin(plugin2);
      
      const result = await pluginSystem.listPlugins();
      
      expect(result.isSuccess).to.be.true;
      expect(result.value?.plugins).to.have.length(2);
      expect(result.value?.plugins.map(p => p.id)).to.include.members(['plugin-1', 'plugin-2']);
    });

    it('should get plugin information', async () => {
      const plugin: Plugin = {
        id: 'info-plugin',
        name: 'Info Plugin',
        version: '1.5.0',
        description: 'A plugin for testing info retrieval',
        hooks: ['test:hook'],
        initialize: async () => ({ initialized: true }),
        execute: async () => ({ success: true })
      };

      await pluginSystem.registerPlugin(plugin);
      
      const result = await pluginSystem.getPluginInfo('info-plugin');
      
      expect(result.isSuccess).to.be.true;
      expect(result.value?.id).to.equal('info-plugin');
      expect(result.value?.name).to.equal('Info Plugin');
      expect(result.value?.version).to.equal('1.5.0');
      expect(result.value?.hooks).to.include('test:hook');
    });

    it('should handle requests for non-existent plugins', async () => {
      const result = await pluginSystem.getPluginInfo('non-existent-plugin');
      
      expect(result.isSuccess).to.be.false;
      expect(result.error).to.include('Plugin not found');
    });
  });
});