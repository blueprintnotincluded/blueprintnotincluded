import * as fs from 'fs';
import { AssetLogger } from './asset-logger';
import { AssetPaths } from './asset-paths';

/**
 * Validation utilities for asset processing
 * Provides input validation and error recovery capabilities
 */
export class AssetValidator {
  /**
   * Validate that required input files exist
   */
  static validateInputs(): boolean {
    AssetLogger.info('Validating input files...');

    const requiredFiles = [{ path: AssetPaths.exportZip, name: 'Export zip file' }];

    let allValid = true;

    for (const file of requiredFiles) {
      if (!fs.existsSync(file.path)) {
        AssetLogger.error(`Missing required file: ${file.name} at ${file.path}`);
        allValid = false;
      } else {
        AssetLogger.info(`✓ Found ${file.name}`);
      }
    }

    return allValid;
  }

  /**
   * Validate database file structure
   */
  static validateDatabase(databasePath: string): boolean {
    try {
      AssetLogger.info(`Validating database file: ${databasePath}`);

      if (!fs.existsSync(databasePath)) {
        AssetLogger.error(`Database file not found: ${databasePath}`);
        return false;
      }

      const data = fs.readFileSync(databasePath, 'utf-8');
      const database = JSON.parse(data);

      // Check required properties
      const requiredProps = [
        'elements',
        'buildMenuCategories',
        'buildMenuItems',
        'uiSprites',
        'spriteModifiers',
        'buildings',
      ];
      for (const prop of requiredProps) {
        if (!database[prop] || !Array.isArray(database[prop])) {
          AssetLogger.error(`Database missing or invalid property: ${prop}`);
          return false;
        }
      }

      AssetLogger.info(
        `✓ Database structure valid (${database.elements.length} elements, ${database.buildings.length} buildings)`
      );
      return true;
    } catch (error) {
      AssetLogger.error(
        `Database validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
      return false;
    }
  }

  /**
   * Validate available disk space
   */
  static validateDiskSpace(): boolean {
    try {
      const stats = fs.statSync(AssetPaths.projectRoot);
      // This is a basic check - in production you'd want to check actual free space
      AssetLogger.info('✓ Project directory accessible');
      return true;
    } catch (error) {
      AssetLogger.error(
        `Cannot access project directory: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return false;
    }
  }

  /**
   * Safe file operations with error handling
   */
  static safeWriteFile(filePath: string, data: string | Buffer): boolean {
    try {
      // Ensure directory exists
      const dir = require('path').dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, data);
      AssetLogger.debug(`Successfully wrote file: ${filePath}`);
      return true;
    } catch (error) {
      AssetLogger.error(
        `Failed to write file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
      return false;
    }
  }

  /**
   * Safe file copy with error handling
   */
  static safeCopyFile(source: string, destination: string): boolean {
    try {
      // Ensure destination directory exists
      const dir = require('path').dirname(destination);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (!fs.existsSync(source)) {
        AssetLogger.error(`Source file does not exist: ${source}`);
        return false;
      }

      fs.copyFileSync(source, destination);
      AssetLogger.debug(`Successfully copied: ${source} → ${destination}`);
      return true;
    } catch (error) {
      AssetLogger.error(
        `Failed to copy file ${source} → ${destination}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
      return false;
    }
  }

  /**
   * Safe directory removal with error handling
   */
  static safeRemoveDirectory(dirPath: string): boolean {
    try {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
        AssetLogger.debug(`Successfully removed directory: ${dirPath}`);
      }
      return true;
    } catch (error) {
      AssetLogger.error(
        `Failed to remove directory ${dirPath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
      return false;
    }
  }

  /**
   * Validate image file
   */
  static validateImageFile(filePath: string): boolean {
    try {
      if (!fs.existsSync(filePath)) {
        AssetLogger.warn(`Image file not found: ${filePath}`);
        return false;
      }

      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        AssetLogger.warn(`Image file is empty: ${filePath}`);
        return false;
      }

      // Basic PNG validation - check PNG header
      const fileDescriptor = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(8);
      fs.readSync(fileDescriptor, buffer, 0, 8, 0);
      fs.closeSync(fileDescriptor);

      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

      if (!buffer.equals(pngHeader)) {
        AssetLogger.warn(`File is not a valid PNG: ${filePath}`);
        return false;
      }

      return true;
    } catch (error) {
      AssetLogger.error(
        `Image validation failed for ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
      return false;
    }
  }

  /**
   * Cleanup function for graceful error recovery
   */
  static cleanupOnError(): void {
    AssetLogger.warn('Performing cleanup due to error...');

    // Clean up any temporary files/directories if they exist
    const tempDirs = [AssetPaths.exportDir];

    for (const dir of tempDirs) {
      if (fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
          AssetLogger.info(`Cleaned up: ${dir}`);
        } catch (error) {
          AssetLogger.warn(
            `Could not clean up ${dir}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
    }
  }

  /**
   * Pre-flight checks before starting asset processing
   */
  static preFlightCheck(): boolean {
    AssetLogger.info('Running pre-flight checks...');

    const checks = [() => this.validateInputs(), () => this.validateDiskSpace()];

    for (const check of checks) {
      if (!check()) {
        AssetLogger.error('Pre-flight check failed');
        return false;
      }
    }

    AssetLogger.info('✓ All pre-flight checks passed');
    return true;
  }
}
