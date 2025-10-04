import * as path from 'path';

/**
 * Centralized path configuration for asset processing scripts
 * This eliminates hardcoded paths and makes the system more maintainable
 */
export class AssetPaths {
  private static _projectRoot: string;

  /**
   * Get the project root directory (calculated once)
   */
  static get projectRoot(): string {
    if (!this._projectRoot) {
      // From app/api/batch/ to project root
      this._projectRoot = path.join(__dirname, '../../../../');
    }
    return this._projectRoot;
  }

  /**
   * Convert a project-relative path to an absolute path
   */
  static absolute(projectRelativePath: string): string {
    return path.join(this.projectRoot, projectRelativePath);
  }

  // Source paths (input)
  static get exportZip(): string {
    return this.absolute('export.zip');
  }
  static get exportDir(): string {
    return this.absolute('export');
  }
  static get exportDatabase(): string {
    return this.absolute('export/database/database.json');
  }
  static get exportImages(): string {
    return this.absolute('export/images');
  }

  // Asset paths (backend storage)
  static get assetsDir(): string {
    return this.absolute('assets');
  }
  static get assetsImages(): string {
    return this.absolute('assets/images');
  }
  static get assetsDatabase(): string {
    return this.absolute('assets/database');
  }
  static get assetsManual(): string {
    return this.absolute('assets/manual');
  }

  // Database files
  static get databaseJson(): string {
    return this.absolute('assets/database/database.json');
  }
  static get databaseGroups(): string {
    return this.absolute('assets/database/database-groups.json');
  }
  static get databaseWhite(): string {
    return this.absolute('assets/database/database-white.json');
  }
  static get databaseRepack(): string {
    return this.absolute('assets/database/database-repack.json');
  }
  static get databaseZip(): string {
    return this.absolute('assets/database/database.zip');
  }
  static get buildMenuRename(): string {
    return this.absolute('assets/manual-buildMenuRename.json');
  }

  // Frontend paths (deployment targets)
  static get frontendAssets(): string {
    return this.absolute('frontend/src/assets');
  }
  static get frontendImages(): string {
    return this.absolute('frontend/src/assets/images');
  }
  static get frontendDatabase(): string {
    return this.absolute('frontend/src/assets/database');
  }
  static get frontendDatabaseJson(): string {
    return this.absolute('frontend/src/assets/database/database.json');
  }
  static get frontendDatabaseZip(): string {
    return this.absolute('frontend/src/assets/database/database.zip');
  }

  // Image subdirectories
  static get uiImagesDir(): string {
    return this.absolute('assets/images/ui');
  }
  static get frontendUiImagesDir(): string {
    return this.absolute('frontend/src/assets/images/ui');
  }

  // Dynamic paths for generated files
  static uiIcon(iconName: string): string {
    return path.join(this.assetsImages, 'ui', `${iconName}.png`);
  }

  static frontendUiIcon(iconName: string): string {
    return path.join(this.frontendImages, 'ui', `${iconName}.png`);
  }

  static groupSprite(textureName: string): string {
    return path.join(this.assetsImages, `${textureName}.png`);
  }

  static whiteTexture(textureName: string): string {
    return path.join(this.assetsImages, `${textureName}_white.png`);
  }

  static repackTexture(index: number): string {
    return path.join(this.assetsImages, `repack_${index}.png`);
  }

  static frontendRepackTexture(index: number): string {
    return path.join(this.frontendImages, `repack_${index}.png`);
  }

  /**
   * Ensure required directories exist
   */
  static ensureDirectories(): void {
    const fs = require('fs');
    const dirs = [
      this.assetsDir,
      this.assetsImages,
      this.assetsDatabase,
      this.uiImagesDir,
      this.frontendAssets,
      this.frontendImages,
      this.frontendDatabase,
      this.frontendUiImagesDir,
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Get all database file paths for validation
   */
  static get allDatabaseFiles(): string[] {
    return [this.databaseJson, this.databaseGroups, this.databaseWhite, this.databaseRepack];
  }
}
