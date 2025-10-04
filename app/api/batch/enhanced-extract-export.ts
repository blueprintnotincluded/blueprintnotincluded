import * as fs from 'fs';
import { copySync } from 'fs-extra';
import AdmZip from 'adm-zip';
import { BExport } from '../../../lib/index';
import { FixHtmlLabels } from './fix-html-labels';
import { AddInfoIcons } from './add-info-icons';
import { GenerateIcons } from './generate-icons';
import { GenerateGroups } from './generate-groups';
import { GenerateWhite } from './generate-white';
import { GenerateRepack } from './generate-repack';
import { renameBuildings, updateJsonFile } from './database-massager';
import { AssetPaths } from './asset-paths';
import { AssetLogger } from './asset-logger';
import { AssetValidator } from './asset-validator';
import { ProgressTracker, ProcessingStep } from './progress-tracker';

/**
 * Enhanced extract-export pipeline with improved error recovery and progress tracking
 */
export class EnhancedExtractExport {
  private progressTracker = new ProgressTracker();

  constructor() {
    this.setupProcessingSteps();
  }

  /**
   * Execute the complete asset processing pipeline
   */
  async execute(): Promise<boolean> {
    try {
      AssetLogger.startProcess('EnhancedExtractExport');
      
      // Pre-flight checks
      if (!AssetValidator.preFlightCheck()) {
        AssetLogger.error('Pre-flight checks failed, aborting');
        return false;
      }

      // Execute all steps with progress tracking
      const success = await this.progressTracker.executeAll();
      
      if (success) {
        AssetLogger.completeProcess('EnhancedExtractExport');
        this.logSummary();
      } else {
        AssetLogger.error('Asset processing pipeline failed');
        this.logFailureDetails();
      }

      return success;
    } catch (error) {
      AssetLogger.error('Pipeline execution failed', error instanceof Error ? error : undefined);
      AssetValidator.cleanupOnError();
      return false;
    }
  }

  /**
   * Setup all processing steps with dependencies and retry logic
   */
  private setupProcessingSteps(): void {
    // Step 1: Extract export.zip
    this.progressTracker.registerStep({
      name: 'extract-export',
      description: 'Extract export.zip file',
      retryable: true,
      maxRetries: 2,
      execute: this.extractExportStep.bind(this)
    });

    // Step 2: Replace images (depends on extract)
    this.progressTracker.registerStep({
      name: 'replace-images',
      description: 'Replace and organize image assets',
      retryable: true,
      maxRetries: 2,
      dependencies: ['extract-export'],
      execute: this.replaceImagesStep.bind(this)
    });

    // Step 3: Generate database (depends on extract)
    this.progressTracker.registerStep({
      name: 'generate-database',
      description: 'Process and enhance database',
      retryable: true,
      maxRetries: 2,
      dependencies: ['extract-export'],
      execute: this.generateDatabaseStep.bind(this)
    });

    // Step 4: Generate icons (depends on database and images)
    this.progressTracker.registerStep({
      name: 'generate-icons',
      description: 'Generate UI icons',
      retryable: true,
      maxRetries: 3,
      dependencies: ['generate-database', 'replace-images'],
      execute: this.generateIconsStep.bind(this)
    });

    // Step 5: Generate groups (depends on icons)
    this.progressTracker.registerStep({
      name: 'generate-groups',
      description: 'Generate sprite groups',
      retryable: true,
      maxRetries: 3,
      dependencies: ['generate-icons'],
      execute: this.generateGroupsStep.bind(this)
    });

    // Step 6: Generate white variants (depends on groups)
    this.progressTracker.registerStep({
      name: 'generate-white',
      description: 'Generate white variant sprites',
      retryable: true,
      maxRetries: 3,
      dependencies: ['generate-groups'],
      execute: this.generateWhiteStep.bind(this)
    });

    // Step 7: Generate texture atlases (depends on white)
    this.progressTracker.registerStep({
      name: 'generate-repack',
      description: 'Generate texture atlases',
      retryable: true,
      maxRetries: 3,
      dependencies: ['generate-white'],
      execute: this.generateRepackStep.bind(this)
    });

    // Step 8: Replace database files (depends on repack)
    this.progressTracker.registerStep({
      name: 'replace-database',
      description: 'Deploy processed database files',
      retryable: true,
      maxRetries: 2,
      dependencies: ['generate-repack'],
      execute: this.replaceDatabaseStep.bind(this)
    });
  }

  /**
   * Step implementations
   */
  private async extractExportStep(): Promise<boolean> {
    try {
      AssetLogger.info('Extracting export.zip...');
      AssetValidator.safeRemoveDirectory(AssetPaths.exportDir);

      const zip = new AdmZip(AssetPaths.exportZip);
      zip.extractAllTo(AssetPaths.projectRoot);

      AssetLogger.info('✓ Export extracted successfully');
      return true;
    } catch (error) {
      AssetLogger.error('Failed to extract export.zip', error instanceof Error ? error : undefined);
      return false;
    }
  }

  private async replaceImagesStep(): Promise<boolean> {
    try {
      AssetLogger.info('Replacing images...');
      AssetValidator.safeRemoveDirectory(AssetPaths.assetsImages);
      fs.renameSync(AssetPaths.exportImages, AssetPaths.assetsImages);
      
      // Copy manual assets if they exist
      if (fs.existsSync(AssetPaths.assetsManual)) {
        copySync(AssetPaths.assetsManual, AssetPaths.assetsImages);
      }
      
      AssetLogger.info('✓ Images replaced successfully');
      return true;
    } catch (error) {
      AssetLogger.error('Failed to replace images', error instanceof Error ? error : undefined);
      return false;
    }
  }

  private async generateDatabaseStep(): Promise<boolean> {
    try {
      AssetLogger.info('Generating database...');

      if (!AssetValidator.validateDatabase(AssetPaths.exportDatabase)) {
        return false;
      }

      // Process HTML labels
      new FixHtmlLabels(AssetPaths.exportDatabase);
      
      // Add info icons
      new AddInfoIcons(AssetPaths.exportDatabase);
      
      // Apply building renames if configuration exists
      if (fs.existsSync(AssetPaths.buildMenuRename)) {
        updateJsonFile(AssetPaths.exportDatabase, (database: BExport) => {
          return renameBuildings(database, AssetPaths.buildMenuRename);
        });
      }

      AssetLogger.info('✓ Database generated successfully');
      return true;
    } catch (error) {
      AssetLogger.error('Failed to generate database', error instanceof Error ? error : undefined);
      return false;
    }
  }

  private async generateIconsStep(): Promise<boolean> {
    try {
      AssetLogger.info('Generating icons...');
      new GenerateIcons(AssetPaths.exportDatabase);
      AssetLogger.info('✓ Icons generated successfully');
      return true;
    } catch (error) {
      AssetLogger.error('Failed to generate icons', error instanceof Error ? error : undefined);
      
      // Force garbage collection to free memory after potential memory issues
      if (global.gc) {
        global.gc();
        AssetLogger.info('Forced garbage collection after icon generation failure');
      }
      
      return false;
    }
  }

  private async generateGroupsStep(): Promise<boolean> {
    try {
      AssetLogger.info('Generating groups...');
      new GenerateGroups(AssetPaths.exportDatabase);
      AssetLogger.info('✓ Groups generated successfully');
      return true;
    } catch (error) {
      AssetLogger.error('Failed to generate groups', error instanceof Error ? error : undefined);
      return false;
    }
  }

  private async generateWhiteStep(): Promise<boolean> {
    try {
      AssetLogger.info('Generating white variants...');
      new GenerateWhite(AssetPaths.exportDatabase);
      AssetLogger.info('✓ White variants generated successfully');
      return true;
    } catch (error) {
      AssetLogger.error('Failed to generate white variants', error instanceof Error ? error : undefined);
      
      // Force garbage collection for memory-intensive operations
      if (global.gc) {
        global.gc();
        AssetLogger.info('Forced garbage collection after white generation failure');
      }
      
      return false;
    }
  }

  private async generateRepackStep(): Promise<boolean> {
    try {
      AssetLogger.info('Generating texture atlases...');
      new GenerateRepack(AssetPaths.exportDatabase);
      AssetLogger.info('✓ Texture atlases generated successfully');
      return true;
    } catch (error) {
      AssetLogger.error('Failed to generate texture atlases', error instanceof Error ? error : undefined);
      
      // Force garbage collection for memory-intensive operations
      if (global.gc) {
        global.gc();
        AssetLogger.info('Forced garbage collection after repack generation failure');
      }
      
      return false;
    }
  }

  private async replaceDatabaseStep(): Promise<boolean> {
    try {
      AssetLogger.info('Replacing database files...');

      // Ensure target directories exist
      AssetPaths.ensureDirectories();

      // Create database zip
      var zip = new AdmZip();
      zip.addLocalFile(AssetPaths.exportDatabase);
      zip.writeZip(AssetPaths.databaseZip);

      // Copy to frontend
      if (!AssetValidator.safeCopyFile(AssetPaths.databaseZip, AssetPaths.frontendDatabaseZip)) {
        return false;
      }

      if (!AssetValidator.safeCopyFile(AssetPaths.databaseRepack, AssetPaths.frontendDatabaseJson)) {
        return false;
      }

      AssetLogger.info('✓ Database files replaced successfully');
      return true;
    } catch (error) {
      AssetLogger.error('Failed to replace database files', error instanceof Error ? error : undefined);
      return false;
    }
  }

  /**
   * Log processing summary
   */
  private logSummary(): void {
    const summary = this.progressTracker.getSummary();
    const state = this.progressTracker.getState();
    
    AssetLogger.info(`Processing Summary: ${summary.completed}/${summary.total} steps completed`);
    
    if (summary.failed > 0) {
      AssetLogger.warn(`${summary.failed} steps failed`);
    }

    // Log timing information
    for (const [stepName, stepState] of Object.entries(state)) {
      if (stepState.status === 'completed' && stepState.startTime && stepState.endTime) {
        const duration = stepState.endTime - stepState.startTime;
        AssetLogger.info(`  ${stepName}: ${duration}ms${stepState.retryCount > 0 ? ` (${stepState.retryCount} retries)` : ''}`);
      }
    }
  }

  /**
   * Log detailed failure information
   */
  private logFailureDetails(): void {
    const state = this.progressTracker.getState();
    
    AssetLogger.error('Processing failed. Details:');
    for (const [stepName, stepState] of Object.entries(state)) {
      if (stepState.status === 'failed') {
        AssetLogger.error(`  ${stepName}: ${stepState.errorMessage || 'Unknown error'} (${stepState.retryCount} retries)`);
      }
    }
  }

  /**
   * Get current processing state for monitoring
   */
  getState() {
    return this.progressTracker.getState();
  }

  /**
   * Get processing summary for monitoring
   */
  getSummary() {
    return this.progressTracker.getSummary();
  }

  /**
   * Cancel processing
   */
  cancel(): void {
    this.progressTracker.cancel();
    AssetValidator.cleanupOnError();
  }
}

// Export function for backward compatibility
export const enhancedExtractExport = async (): Promise<boolean> => {
  const processor = new EnhancedExtractExport();
  return await processor.execute();
};

// Only execute this script if loaded directly with node
if (require.main === module) {
  enhancedExtractExport().then(success => {
    console.log(`Enhanced extract-export ${success ? 'completed successfully' : 'failed'}`);
    process.exit(success ? 0 : 1);
  });
}