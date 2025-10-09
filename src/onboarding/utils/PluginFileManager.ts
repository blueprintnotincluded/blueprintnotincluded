import { promises as fs } from 'fs';
import * as path from 'path';
import { Plugin } from '../types/Integration';

export class PluginFileManager {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  private getPluginsDirectory(): string {
    return path.join(this.projectPath, '.onboarding', 'data', 'plugins');
  }

  private getPluginFilePath(pluginId: string): string {
    return path.join(this.getPluginsDirectory(), `${pluginId}.json`);
  }

  async ensurePluginsDirectory(): Promise<void> {
    const pluginsDir = this.getPluginsDirectory();
    await fs.mkdir(pluginsDir, { recursive: true });
  }

  async savePlugin(pluginId: string, plugin: Plugin, status: string = 'active'): Promise<void> {
    await this.ensurePluginsDirectory();
    
    const pluginFile = this.getPluginFilePath(pluginId);
    const pluginData = {
      id: pluginId,
      ...plugin,
      registeredAt: new Date().toISOString(),
      status
    };

    await fs.writeFile(pluginFile, JSON.stringify(pluginData, null, 2));
  }

  async loadPlugin(pluginId: string): Promise<any> {
    const pluginFile = this.getPluginFilePath(pluginId);
    const content = await fs.readFile(pluginFile, 'utf-8');
    return JSON.parse(content);
  }

  async updatePluginStatus(pluginId: string, status: string, additionalData?: Record<string, any>): Promise<void> {
    const pluginData = await this.loadPlugin(pluginId);
    pluginData.status = status;
    
    if (additionalData) {
      Object.assign(pluginData, additionalData);
    }

    const pluginFile = this.getPluginFilePath(pluginId);
    await fs.writeFile(pluginFile, JSON.stringify(pluginData, null, 2));
  }

  async deletePlugin(pluginId: string): Promise<void> {
    const pluginFile = this.getPluginFilePath(pluginId);
    await fs.unlink(pluginFile);
  }

  async pluginExists(pluginId: string): Promise<boolean> {
    try {
      const pluginFile = this.getPluginFilePath(pluginId);
      await fs.access(pluginFile);
      return true;
    } catch {
      return false;
    }
  }
}