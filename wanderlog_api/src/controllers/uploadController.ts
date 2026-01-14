/**
 * Upload Controller
 * 
 * Handles user image uploads for check-in photos
 */

import { Request, Response } from 'express';
import { R2ImageService } from '../services/r2ImageService';
import { logger } from '../utils/logger';

const r2Service = new R2ImageService();

/**
 * Upload a single image to R2
 * 
 * Expects multipart/form-data with 'image' field
 * Returns the public URL of the uploaded image
 */
export const uploadImage = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    const imageBuffer = req.file.buffer;
    
    // Validate file size (max 5MB)
    if (imageBuffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ message: 'Image too large. Maximum size is 5MB' });
    }

    // Validate file type
    const mimeType = req.file.mimetype;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
      return res.status(400).json({ message: 'Invalid image type. Supported: JPEG, PNG, WebP' });
    }

    // Generate R2 key for user uploads (different path from place images)
    const uuid = crypto.randomUUID();
    const p1 = uuid.substring(0, 2);
    const p2 = uuid.substring(2, 4);
    const r2Key = `user-photos/v1/${p1}/${p2}/${uuid}.jpg`;

    // Upload to R2
    const result = await r2Service.uploadToR2(imageBuffer, r2Key);

    if (!result.success) {
      logger.error('R2 upload failed:', result.error);
      return res.status(500).json({ message: 'Failed to upload image', error: result.error });
    }

    logger.info(`Image uploaded successfully: ${result.publicUrl}`);
    
    return res.json({
      success: true,
      url: result.publicUrl,
      r2Key: result.r2Key,
    });
  } catch (error) {
    logger.error('Upload error:', error);
    return res.status(500).json({ message: 'Server error during upload' });
  }
};

/**
 * Upload multiple images to R2
 * 
 * Expects multipart/form-data with 'images' field (array)
 * Returns array of public URLs
 */
export const uploadMultipleImages = async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'No image files provided' });
    }

    if (files.length > 3) {
      return res.status(400).json({ message: 'Maximum 3 images allowed' });
    }

    const uploadResults: { url: string; r2Key: string }[] = [];
    const errors: string[] = [];

    for (const file of files) {
      // Validate file size (max 5MB each)
      if (file.buffer.length > 5 * 1024 * 1024) {
        errors.push(`${file.originalname}: Image too large`);
        continue;
      }

      // Validate file type
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
        errors.push(`${file.originalname}: Invalid image type`);
        continue;
      }

      // Generate R2 key
      const uuid = crypto.randomUUID();
      const p1 = uuid.substring(0, 2);
      const p2 = uuid.substring(2, 4);
      const r2Key = `user-photos/v1/${p1}/${p2}/${uuid}.jpg`;

      // Upload to R2
      const result = await r2Service.uploadToR2(file.buffer, r2Key);

      if (result.success && result.publicUrl) {
        uploadResults.push({
          url: result.publicUrl,
          r2Key: result.r2Key!,
        });
      } else {
        errors.push(`${file.originalname}: Upload failed`);
      }
    }

    logger.info(`Uploaded ${uploadResults.length} images, ${errors.length} errors`);

    return res.json({
      success: uploadResults.length > 0,
      urls: uploadResults.map(r => r.url),
      results: uploadResults,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    logger.error('Multiple upload error:', error);
    return res.status(500).json({ message: 'Server error during upload' });
  }
};

// Need to import crypto
import * as crypto from 'crypto';
