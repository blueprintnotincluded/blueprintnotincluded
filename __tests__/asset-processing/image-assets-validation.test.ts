import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { Jimp } from 'jimp';

describe('Image Assets Validation', () => {
  const assetsImagePath = path.join(__dirname, '../../assets/images');
  const frontendImagePath = path.join(__dirname, '../../frontend/src/assets/images');

  describe('Frontend Assets (Current State)', () => {
    it('should have frontend images directory', () => {
      expect(fs.existsSync(frontendImagePath), 'Frontend images directory should exist').to.be.true;
      expect(
        fs.statSync(frontendImagePath).isDirectory(),
        'Frontend images path should be directory'
      ).to.be.true;
    });

    it('should have valid PNG files in frontend', async () => {
      expect(fs.existsSync(frontendImagePath), 'Frontend images directory should exist').to.be.true;

      const files = fs.readdirSync(frontendImagePath).filter(f => f.endsWith('.png'));
      expect(files.length, 'Should have PNG files in frontend').to.be.greaterThan(0);

      // Test a few random files to ensure they're valid images
      const testFiles = files.slice(0, Math.min(5, files.length));

      for (const file of testFiles) {
        const filePath = path.join(frontendImagePath, file);
        expect(fs.existsSync(filePath), `File ${file} should exist`).to.be.true;

        // Validate it's a readable PNG
        try {
          const image = await Jimp.read(filePath);
          expect(image.bitmap.width, `${file} should have valid width`).to.be.greaterThan(0);
          expect(image.bitmap.height, `${file} should have valid height`).to.be.greaterThan(0);
        } catch (error) {
          throw new Error(`Failed to read image ${file}: ${error}`);
        }
      }
    });

    it('should have backend assets directory (may not exist if not processed)', () => {
      // This test documents the current state - backend assets may not exist
      if (fs.existsSync(assetsImagePath)) {
        console.log('✓ Backend assets/images directory exists');
        expect(fs.statSync(assetsImagePath).isDirectory()).to.be.true;
      } else {
        console.log('⚠ Backend assets/images directory does not exist (assets not processed)');
      }
    });
  });

  describe('Texture Atlases', () => {
    it('should have repack texture files in frontend', () => {
      const frontendRepackFiles = fs
        .readdirSync(frontendImagePath)
        .filter(f => f.startsWith('repack_') && f.endsWith('.png'));

      expect(
        frontendRepackFiles.length,
        'Frontend should have repack texture atlas files'
      ).to.be.greaterThan(0);
    });

    it('should have valid repack texture dimensions in frontend', async () => {
      const frontendRepackFiles = fs
        .readdirSync(frontendImagePath)
        .filter(f => f.startsWith('repack_') && f.endsWith('.png'));

      expect(frontendRepackFiles.length, 'Should have frontend repack files').to.be.greaterThan(0);

      // Test a subset to avoid long test times
      const testFiles = frontendRepackFiles.slice(0, Math.min(3, frontendRepackFiles.length));

      for (const file of testFiles) {
        const filePath = path.join(frontendImagePath, file);

        try {
          const image = await Jimp.read(filePath);
          const width = image.bitmap.width;
          const height = image.bitmap.height;

          expect(width, `${file} should have valid width`).to.be.greaterThan(0);
          expect(height, `${file} should have valid height`).to.be.greaterThan(0);

          // Texture atlases should typically be reasonably sized
          expect(width, `${file} width should be reasonable`).to.be.lessThanOrEqual(4096);
          expect(height, `${file} height should be reasonable`).to.be.lessThanOrEqual(4096);
        } catch (error) {
          throw new Error(`Failed to read repack texture ${file}: ${error}`);
        }
      }
    });

    it('should have backend repack textures if assets processed', () => {
      if (!fs.existsSync(assetsImagePath)) {
        console.log('⚠ Backend assets not processed yet - skipping backend repack check');
        return;
      }

      const backendRepackFiles = fs
        .readdirSync(assetsImagePath)
        .filter(f => f.startsWith('repack_') && f.endsWith('.png'));

      const frontendRepackFiles = fs
        .readdirSync(frontendImagePath)
        .filter(f => f.startsWith('repack_') && f.endsWith('.png'));

      if (backendRepackFiles.length > 0) {
        expect(
          frontendRepackFiles.length,
          'Frontend should have repack textures'
        ).to.be.greaterThan(0);

        // Check a few files exist in both places
        const checkFiles = backendRepackFiles.slice(0, 3);
        checkFiles.forEach(file => {
          expect(frontendRepackFiles.includes(file), `Frontend should have corresponding ${file}`)
            .to.be.true;
        });
      }
    });
  });

  describe('Group and White Variant Images', () => {
    it('should have group sprite images in frontend if they exist', () => {
      const frontendGroupFiles = fs
        .readdirSync(frontendImagePath)
        .filter(f => f.includes('_group_sprite') && f.endsWith('.png'));

      console.log(`Found ${frontendGroupFiles.length} group sprite images in frontend`);

      if (fs.existsSync(assetsImagePath)) {
        const backendGroupFiles = fs
          .readdirSync(assetsImagePath)
          .filter(f => f.includes('_group_sprite') && f.endsWith('.png'));
        console.log(`Found ${backendGroupFiles.length} group sprite images in backend`);
      }
    });

    it('should have white variant images in frontend', () => {
      const frontendWhiteFiles = fs
        .readdirSync(frontendImagePath)
        .filter(f => f.includes('_white') && f.endsWith('.png'));

      expect(
        frontendWhiteFiles.length,
        'Should have white variant images in frontend'
      ).to.be.greaterThan(0);
      console.log(`Found ${frontendWhiteFiles.length} white variant images in frontend`);
    });
  });

  describe('File Size Validation', () => {
    it('should have reasonable file sizes for frontend texture atlases', () => {
      const frontendRepackFiles = fs
        .readdirSync(frontendImagePath)
        .filter(f => f.startsWith('repack_') && f.endsWith('.png'));

      expect(frontendRepackFiles.length, 'Should have frontend repack files').to.be.greaterThan(0);

      // Test a subset to avoid long test times
      const testFiles = frontendRepackFiles.slice(0, Math.min(3, frontendRepackFiles.length));

      testFiles.forEach(file => {
        const filePath = path.join(frontendImagePath, file);
        const stats = fs.statSync(filePath);

        // Texture atlases shouldn't be extremely large (>50MB) or tiny (<1KB)
        expect(stats.size, `${file} should not be too small`).to.be.greaterThan(1024);
        expect(stats.size, `${file} should not be too large`).to.be.lessThan(50 * 1024 * 1024);
      });
    });

    it('should have reasonable file count in frontend assets', () => {
      const allPngFiles = fs
        .readdirSync(frontendImagePath)
        .filter(f => f.toString().endsWith('.png'));

      expect(
        allPngFiles.length,
        'Should have reasonable number of frontend PNG assets'
      ).to.be.greaterThan(100);
      expect(allPngFiles.length, 'Should not have excessive frontend PNG assets').to.be.lessThan(
        10000
      );

      console.log(`Found ${allPngFiles.length} PNG files in frontend assets`);
    });
  });
});
