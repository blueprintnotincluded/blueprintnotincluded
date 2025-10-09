import { Jimp } from 'jimp';
import * as fs from 'fs';
import * as crypto from 'crypto';

/**
 * Utility for comparing image contents to avoid regenerating identical images
 */
export class ImageComparator {
  /**
   * Check if two images are functionally identical by comparing their content
   * @param imagePath1 Path to first image
   * @param imagePath2 Path to second image (can be non-existent)
   * @returns Promise<boolean> true if images are identical, false otherwise
   */
  static async areImagesIdentical(imagePath1: string, imagePath2: string): Promise<boolean> {
    try {
      // If the second image doesn't exist, they're not identical
      if (!fs.existsSync(imagePath2)) {
        return false;
      }

      // Quick file size check first
      const stats1 = fs.statSync(imagePath1);
      const stats2 = fs.statSync(imagePath2);
      
      if (stats1.size !== stats2.size) {
        return false;
      }

      // Load both images
      const [image1, image2] = await Promise.all([
        Jimp.read(imagePath1),
        Jimp.read(imagePath2)
      ]);

      // Check dimensions
      if (image1.bitmap.width !== image2.bitmap.width || image1.bitmap.height !== image2.bitmap.height) {
        return false;
      }

      // Compare pixel data using pixelmatch algorithm (more efficient than Jimp.diff)
      // If the bitmaps are identical, the pixel data should be identical
      if (image1.bitmap.data.length !== image2.bitmap.data.length) {
        return false;
      }

      // Compare bitmap data directly
      for (let i = 0; i < image1.bitmap.data.length; i++) {
        if (image1.bitmap.data[i] !== image2.bitmap.data[i]) {
          return false;
        }
      }

      return true;
    } catch (error) {
      // If there's any error reading or comparing, assume not identical
      return false;
    }
  }

  /**
   * Check if a generated image would be identical to an existing file by comparing
   * the image buffer to the existing file
   * @param imageBuffer Buffer containing the new image data
   * @param existingFilePath Path to existing file to compare against
   * @returns Promise<boolean> true if the buffer content matches the existing file
   */
  static async isBufferIdenticalToFile(imageBuffer: Buffer, existingFilePath: string): Promise<boolean> {
    try {
      // If the existing file doesn't exist, they're not identical
      if (!fs.existsSync(existingFilePath)) {
        return false;
      }

      // Load both images
      const [newImage, existingImage] = await Promise.all([
        Jimp.read(imageBuffer),
        Jimp.read(existingFilePath)
      ]);

      // Check dimensions
      if (newImage.bitmap.width !== existingImage.bitmap.width || 
          newImage.bitmap.height !== existingImage.bitmap.height) {
        return false;
      }

      // Compare bitmap data directly
      if (newImage.bitmap.data.length !== existingImage.bitmap.data.length) {
        return false;
      }

      // Compare pixel data
      for (let i = 0; i < newImage.bitmap.data.length; i++) {
        if (newImage.bitmap.data[i] !== existingImage.bitmap.data[i]) {
          return false;
        }
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Calculate a hash of an image's pixel data for quick comparison
   * @param imagePath Path to the image file
   * @returns Promise<string> SHA256 hash of the image pixel data
   */
  static async getImageHash(imagePath: string): Promise<string> {
    try {
      if (!fs.existsSync(imagePath)) {
        return '';
      }

      const image = await Jimp.read(imagePath);
      
      // Get raw image data (RGBA pixel values)
      const bitmap = image.bitmap;
      
      // Create hash of the pixel data
      const hash = crypto.createHash('sha256');
      hash.update(bitmap.data);
      
      return hash.digest('hex');
    } catch (error) {
      return '';
    }
  }

  /**
   * Calculate a hash of image buffer pixel data
   * @param imageBuffer Buffer containing the image data
   * @returns Promise<string> SHA256 hash of the image pixel data
   */
  static async getBufferHash(imageBuffer: Buffer): Promise<string> {
    try {
      const image = await Jimp.read(imageBuffer);
      
      // Get raw image data (RGBA pixel values)
      const bitmap = image.bitmap;
      
      // Create hash of the pixel data
      const hash = crypto.createHash('sha256');
      hash.update(bitmap.data);
      
      return hash.digest('hex');
    } catch (error) {
      return '';
    }
  }

  /**
   * Compare image hashes for quick identical check
   * @param hash1 First image hash
   * @param hash2 Second image hash
   * @returns boolean true if hashes match (images are identical)
   */
  static areHashesIdentical(hash1: string, hash2: string): boolean {
    return hash1 !== '' && hash2 !== '' && hash1 === hash2;
  }
}