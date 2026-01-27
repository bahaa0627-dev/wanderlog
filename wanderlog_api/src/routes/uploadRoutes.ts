/**
 * Upload Routes
 * 
 * Routes for user image uploads
 */

import { Router } from 'express';
import multer from 'multer';
import { uploadImage, uploadMultipleImages } from '../controllers/uploadController';
import { authenticateTokenIfPresent } from '../middleware/auth';

const router = Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 3, // Max 3 files
  },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type') as any);
    }
  },
});

// Use optional authentication (允许管理后台和已认证用户上传)
router.use(authenticateTokenIfPresent);

// Single image upload
router.post('/image', upload.single('image'), uploadImage);

// Multiple images upload (max 3)
router.post('/images', upload.array('images', 3), uploadMultipleImages);

export default router;
