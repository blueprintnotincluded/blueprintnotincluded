import * as fs from 'fs';
import {
  copySync // fs.cpSync available in Node v16.7.0
} from 'fs-extra';
import AdmZip from 'adm-zip';
import { BExport } from "../../../lib/index";
import { FixHtmlLabels } from "./fix-html-labels";
import { AddInfoIcons } from './add-info-icons';
import { GenerateIcons } from './generate-icons';
import { GenerateGroups } from './generate-groups';
import { GenerateWhite } from './generate-white';
import { GenerateRepack } from './generate-repack';
import { renameBuildings, updateJsonFile } from './database-massager';
import { AssetPaths } from './asset-paths';
import { AssetLogger } from './asset-logger';
import { AssetValidator } from './asset-validator';
// Clean working export dir and unzip extract export.zip
const freshExport = (): boolean => {
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

// Move newly extracted images to the backend images directory
const replaceImages = (): boolean => {
  try {
    AssetLogger.info('Replacing images...');
    AssetValidator.safeRemoveDirectory(AssetPaths.assetsImages);
    fs.renameSync(AssetPaths.exportImages, AssetPaths.assetsImages);
    copySync(AssetPaths.assetsManual, AssetPaths.assetsImages);
    AssetLogger.info('✓ Images replaced successfully');
    return true;
  } catch (error) {
    AssetLogger.error('Failed to replace images', error instanceof Error ? error : undefined);
    return false;
  }
}

const generateDatabase = (): boolean => {
  try {
    AssetLogger.info('Generating database...');
    
    if (!AssetValidator.validateDatabase(AssetPaths.exportDatabase)) {
      return false;
    }
    
    new FixHtmlLabels(AssetPaths.exportDatabase);
    new AddInfoIcons(AssetPaths.exportDatabase);
    updateJsonFile(AssetPaths.exportDatabase, (database: BExport) => {
      return renameBuildings(database, AssetPaths.buildMenuRename);
    });
    
    AssetLogger.info('✓ Database generated successfully');
    return true;
  } catch (error) {
    AssetLogger.error('Failed to generate database', error instanceof Error ? error : undefined);
    return false;
  }
}

const processImages = (): boolean => {
  try {
    AssetLogger.info('Processing images...');
    new GenerateIcons(AssetPaths.exportDatabase);
    new GenerateGroups(AssetPaths.exportDatabase);
    new GenerateWhite(AssetPaths.exportDatabase);
    new GenerateRepack(AssetPaths.exportDatabase);
    AssetLogger.info('✓ Images processed successfully');
    return true;
  } catch (error) {
    AssetLogger.error('Failed to process images', error instanceof Error ? error : undefined);
    return false;
  }
}

const replaceDatabase = (): boolean => {
  try {
    AssetLogger.info('Replacing database files...');
    
    // Ensure target directories exist
    AssetPaths.ensureDirectories();
    
    var zip = new AdmZip();
    zip.addLocalFile(AssetPaths.exportDatabase);
    zip.writeZip(AssetPaths.databaseZip);
    
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

export const extractExport = (): boolean => {
  try {
    AssetLogger.startProcess('ExtractExport');
    
    // Pre-flight checks
    if (!AssetValidator.preFlightCheck()) {
      AssetLogger.error('Pre-flight checks failed, aborting');
      return false;
    }
    
    // Execute processing steps with error handling
    const steps = [
      { name: 'Extract Export', fn: freshExport },
      { name: 'Replace Images', fn: replaceImages },
      { name: 'Generate Database', fn: generateDatabase },
      { name: 'Process Images', fn: processImages },
      { name: 'Replace Database', fn: replaceDatabase }
    ];
    
    for (const step of steps) {
      AssetLogger.info(`Starting step: ${step.name}`);
      AssetLogger.time(step.name);
      
      try {
        const result = step.fn();
        if (result === false) {
          AssetLogger.error(`Step failed: ${step.name}`);
          AssetValidator.cleanupOnError();
          return false;
        }
        AssetLogger.timeEnd(step.name);
        AssetLogger.info(`✓ Completed step: ${step.name}`);
      } catch (error) {
        AssetLogger.error(`Step crashed: ${step.name}`, error instanceof Error ? error : undefined);
        AssetValidator.cleanupOnError();
        return false;
      }
    }
    
    AssetLogger.completeProcess('ExtractExport');
    return true;
    
  } catch (error) {
    AssetLogger.error('Asset processing failed', error instanceof Error ? error : undefined);
    AssetValidator.cleanupOnError();
    return false;
  }
}

// Only execute this script if loaded directly with node
if (require.main === module) {
  extractExport();
  console.log('extractExport complete')
}
