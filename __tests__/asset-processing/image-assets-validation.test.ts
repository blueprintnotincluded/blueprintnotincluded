import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { Jimp } from 'jimp';

describe('Image Assets Validation', () => {
  const backendUiImagePath = path.join(__dirname, '../../assets/ui_image');
  const frontendUiImagePath = path.join(__dirname, '../../frontend/src/assets/ui_image');

  describe('Flat Icon Directories', () => {
    it('should have backend ui_image directory', () => {
      expect(fs.existsSync(backendUiImagePath), 'Backend ui_image directory should exist').to.be.true;
      expect(fs.statSync(backendUiImagePath).isDirectory()).to.be.true;
    });

    it('should have frontend ui_image directory', () => {
      expect(fs.existsSync(frontendUiImagePath), 'Frontend ui_image directory should exist').to.be.true;
      expect(fs.statSync(frontendUiImagePath).isDirectory()).to.be.true;
    });

    it('should have at least 1000 PNG files in backend ui_image', () => {
      const files = fs.readdirSync(backendUiImagePath).filter(f => f.endsWith('.png'));
      expect(files.length, 'Backend ui_image should have 1000+ PNGs').to.be.greaterThan(1000);
    });

    it('should have at least 1000 PNG files in frontend ui_image', () => {
      const files = fs.readdirSync(frontendUiImagePath).filter(f => f.endsWith('.png'));
      expect(files.length, 'Frontend ui_image should have 1000+ PNGs').to.be.greaterThan(1000);
    });

    it('both directories should have the same PNG count', () => {
      const backendCount = fs.readdirSync(backendUiImagePath).filter(f => f.endsWith('.png')).length;
      const frontendCount = fs.readdirSync(frontendUiImagePath).filter(f => f.endsWith('.png')).length;
      expect(backendCount).to.equal(frontendCount);
    });
  });

  describe('PNG File Validity', () => {
    it('should have valid PNG files in backend ui_image', async () => {
      const files = fs.readdirSync(backendUiImagePath).filter(f => f.endsWith('.png'));
      const testFiles = files.slice(0, Math.min(5, files.length));

      for (const file of testFiles) {
        const filePath = path.join(backendUiImagePath, file);
        try {
          const image = await Jimp.read(filePath);
          expect(image.bitmap.width, `${file} should have valid width`).to.be.greaterThan(0);
          expect(image.bitmap.height, `${file} should have valid height`).to.be.greaterThan(0);
        } catch (error) {
          throw new Error(`Failed to read image ${file}: ${error}`);
        }
      }
    });

    it('should have valid PNG files in frontend ui_image', async () => {
      const files = fs.readdirSync(frontendUiImagePath).filter(f => f.endsWith('.png'));
      const testFiles = files.slice(0, Math.min(5, files.length));

      for (const file of testFiles) {
        const filePath = path.join(frontendUiImagePath, file);
        try {
          const image = await Jimp.read(filePath);
          expect(image.bitmap.width, `${file} should have valid width`).to.be.greaterThan(0);
          expect(image.bitmap.height, `${file} should have valid height`).to.be.greaterThan(0);
        } catch (error) {
          throw new Error(`Failed to read image ${file}: ${error}`);
        }
      }
    });
  });

  describe('File Size Validation', () => {
    it('should have reasonable file sizes for flat icon PNGs', () => {
      const files = fs.readdirSync(frontendUiImagePath).filter(f => f.endsWith('.png'));
      const testFiles = files.slice(0, Math.min(10, files.length));

      testFiles.forEach(file => {
        const filePath = path.join(frontendUiImagePath, file);
        const stats = fs.statSync(filePath);
        expect(stats.size, `${file} should not be too small`).to.be.greaterThan(100);
        expect(stats.size, `${file} should not be too large`).to.be.lessThan(5 * 1024 * 1024);
      });
    });

    it('should have reasonable file count in ui_image assets', () => {
      const allPngFiles = fs.readdirSync(frontendUiImagePath).filter(f => f.endsWith('.png'));
      expect(allPngFiles.length, 'Should have reasonable number of flat icon PNGs').to.be.greaterThan(100);
      expect(allPngFiles.length, 'Should not have excessive PNGs').to.be.lessThan(10000);
      console.log(`Found ${allPngFiles.length} PNG files in frontend ui_image`);
    });
  });
});
