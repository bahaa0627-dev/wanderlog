/**
 * Mocation Image Handler
 * 
 * Handles image download and upload to Cloudflare R2 for mocation scraper.
 * Integrates with existing R2ImageService for upload functionality.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import * as crypto from 'crypto';
import { R2ImageService, r2ImageService } from './r2ImageService';
import { ImageHandlerOptions, ImageProcessResult } from '../types/mocation';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_DOWNLOAD_DIR = './temp/mocation-images';
const DOWNLOAD_TIMEOUT_MS = 30000; // 30 seconds
const MAX_RETRIES = 3;

// ============================================================================
// MocationImageHandler Class
// Requirements: 5.1, 5.2, 5.3, 5.4
// ============================================================================

export class MocationImageHandler {
  private downloadDir: string;
  private uploadToR2Enabled: boolean;
  private r2Service: R2ImageService;

  constructor(options?: ImageHandlerOptions) {
    this.downloadDir = options?.downloadDir || DEFAULT_DOWNLOAD_DIR;
    this.uploadToR2Enabled = options?.uploadToR2 ?? false;
    this.r2Service = r2ImageService;
    
    // Ensure download directory exists
    this.ensureDownloadDir();
  }

  /**
   * Ensure the download directory exists
   */
  private ensureDownloadDir(): void {
    if (!fs.existsSync(this.downloadDir)) {
      fs.mkdirSync(this.downloadDir, { recursive: true });
    }
  }

  /**
   * Generate a unique filename for downloaded image
   * @param originalUrl - Original image URL
   * @param index - Optional index for multiple images
   * @returns Unique filename
   */
  private generateFilename(originalUrl: string, index?: number): string {
    const uuid = crypto.randomUUID();
    const ext = this.getExtensionFromUrl(originalUrl) || 'jpg';
    const prefix = index !== undefined ? `${index}_` : '';
    return `${prefix}${uuid}.${ext}`;
  }

  /**
   * Extract file extension from URL
   * @param url - Image URL
   * @returns File extension or null
   */
  private getExtensionFromUrl(url: string): string | null {
    try {
      const pathname = new URL(url).pathname;
      const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
      if (match) {
        const ext = match[1].toLowerCase();
        // Only return valid image extensions
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
          return ext;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Download a single image to local directory
   * Requirements: 5.1, 5.4
   * 
   * @param imageUrl - URL of the image to download
   * @param filename - Optional custom filename
   * @returns ImageProcessResult with local path or error
   */
  async downloadImage(imageUrl: string, filename?: string): Promise<ImageProcessResult> {
    const targetFilename = filename || this.generateFilename(imageUrl);
    const localPath = path.join(this.downloadDir, targetFilename);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          originalUrl: imageUrl,
          finalUrl: imageUrl, // Keep original URL on failure
          success: false,
          error: `Download timeout (${DOWNLOAD_TIMEOUT_MS / 1000}s)`,
        });
      }, DOWNLOAD_TIMEOUT_MS);

      this.downloadWithRetry(imageUrl, localPath, 0, timeout, resolve);
    });
  }

  /**
   * Download image with retry logic
   * @param imageUrl - Image URL
   * @param localPath - Local file path
   * @param retryCount - Current retry count
   * @param timeout - Timeout handle
   * @param resolve - Promise resolve function
   */
  private downloadWithRetry(
    imageUrl: string,
    localPath: string,
    retryCount: number,
    timeout: NodeJS.Timeout,
    resolve: (result: ImageProcessResult) => void
  ): void {
    this.makeDownloadRequest(imageUrl, localPath, 0)
      .then((result) => {
        clearTimeout(timeout);
        resolve(result);
      })
      .catch((error) => {
        if (retryCount < MAX_RETRIES) {
          console.log(`   🔄 Retry ${retryCount + 1}/${MAX_RETRIES} for: ${imageUrl}`);
          setTimeout(() => {
            this.downloadWithRetry(imageUrl, localPath, retryCount + 1, timeout, resolve);
          }, 1000 * (retryCount + 1)); // Exponential backoff
        } else {
          clearTimeout(timeout);
          resolve({
            originalUrl: imageUrl,
            finalUrl: imageUrl,
            success: false,
            error: error.message || 'Download failed after retries',
          });
        }
      });
  }

  /**
   * Make HTTP request to download image
   * @param imageUrl - Image URL
   * @param localPath - Local file path
   * @param redirectCount - Current redirect count
   * @returns Promise with ImageProcessResult
   */
  private makeDownloadRequest(
    imageUrl: string,
    localPath: string,
    redirectCount: number
  ): Promise<ImageProcessResult> {
    return new Promise((resolve, reject) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }

      try {
        const parsedUrl = new URL(imageUrl);
        const isHttps = parsedUrl.protocol === 'https:';
        const httpModule = isHttps ? https : http;

        const requestOptions = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/*,*/*',
            'Referer': 'https://mocation.cc/',
          },
        };

        const req = httpModule.request(requestOptions, (res) => {
          // Handle redirects
          if ([301, 302, 303, 307, 308].includes(res.statusCode || 0)) {
            const redirectUrl = res.headers.location;
            if (redirectUrl) {
              const absoluteUrl = redirectUrl.startsWith('http')
                ? redirectUrl
                : `${parsedUrl.protocol}//${parsedUrl.host}${redirectUrl}`;
              this.makeDownloadRequest(absoluteUrl, localPath, redirectCount + 1)
                .then(resolve)
                .catch(reject);
              return;
            }
          }

          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }

          // Create write stream
          const fileStream = fs.createWriteStream(localPath);
          res.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close();
            
            // Verify file was written and has content
            const stats = fs.statSync(localPath);
            if (stats.size < 1000) {
              // File too small, likely an error page
              fs.unlinkSync(localPath);
              reject(new Error('Downloaded file too small, might be error page'));
              return;
            }

            resolve({
              originalUrl: imageUrl,
              localPath,
              finalUrl: localPath,
              success: true,
            });
          });

          fileStream.on('error', (err) => {
            fs.unlink(localPath, () => {}); // Clean up partial file
            reject(err);
          });
        });

        req.on('error', (err) => {
          reject(err);
        });

        req.end();
      } catch (err: any) {
        reject(new Error(`Invalid URL: ${err.message}`));
      }
    });
  }


  /**
   * Upload a local image to R2
   * Requirements: 5.2, 5.3
   * 
   * @param localPath - Path to local image file
   * @returns ImageProcessResult with R2 URL or error
   */
  async uploadImageToR2(localPath: string): Promise<ImageProcessResult> {
    try {
      // Read the local file
      if (!fs.existsSync(localPath)) {
        return {
          originalUrl: localPath,
          localPath,
          finalUrl: localPath,
          success: false,
          error: 'Local file not found',
        };
      }

      const imageBuffer = fs.readFileSync(localPath);

      // Generate R2 key using the service's method
      const r2Key = this.r2Service.generateR2Key();

      // Upload to R2
      const uploadResult = await this.r2Service.uploadToR2(imageBuffer, r2Key);

      if (uploadResult.success && uploadResult.publicUrl) {
        return {
          originalUrl: localPath,
          localPath,
          r2Url: uploadResult.publicUrl,
          finalUrl: uploadResult.publicUrl,
          success: true,
        };
      } else {
        return {
          originalUrl: localPath,
          localPath,
          finalUrl: localPath,
          success: false,
          error: uploadResult.error || 'R2 upload failed',
        };
      }
    } catch (error: any) {
      return {
        originalUrl: localPath,
        localPath,
        finalUrl: localPath,
        success: false,
        error: error.message || 'Upload error',
      };
    }
  }

  /**
   * Download image from URL and upload to R2 in one step
   * Requirements: 5.1, 5.2, 5.3, 5.4
   * 
   * @param imageUrl - URL of the image to process
   * @returns ImageProcessResult with R2 URL or original URL on failure
   */
  async downloadAndUpload(imageUrl: string): Promise<ImageProcessResult> {
    // Step 1: Download image
    const downloadResult = await this.downloadImage(imageUrl);
    
    if (!downloadResult.success || !downloadResult.localPath) {
      // Download failed, return original URL (Requirement 5.4)
      console.warn(`⚠️ Download failed for ${imageUrl}: ${downloadResult.error}`);
      return {
        originalUrl: imageUrl,
        finalUrl: imageUrl, // Keep original URL on failure
        success: false,
        error: downloadResult.error,
      };
    }

    // Step 2: Upload to R2 if enabled
    if (this.uploadToR2Enabled) {
      const uploadResult = await this.uploadImageToR2(downloadResult.localPath);
      
      // Clean up local file after upload attempt
      this.cleanupLocalFile(downloadResult.localPath);
      
      if (uploadResult.success && uploadResult.r2Url) {
        return {
          originalUrl: imageUrl,
          localPath: downloadResult.localPath,
          r2Url: uploadResult.r2Url,
          finalUrl: uploadResult.r2Url,
          success: true,
        };
      } else {
        // Upload failed, return original URL (Requirement 5.4)
        console.warn(`⚠️ R2 upload failed for ${imageUrl}: ${uploadResult.error}`);
        return {
          originalUrl: imageUrl,
          localPath: downloadResult.localPath,
          finalUrl: imageUrl, // Keep original URL on failure
          success: false,
          error: uploadResult.error,
        };
      }
    }

    // R2 upload not enabled, return local path
    return {
      originalUrl: imageUrl,
      localPath: downloadResult.localPath,
      finalUrl: downloadResult.localPath,
      success: true,
    };
  }

  /**
   * Process multiple images
   * Requirements: 5.1, 5.2, 5.3, 5.4
   * 
   * @param imageUrls - Array of image URLs to process
   * @param onProgress - Optional progress callback
   * @returns Array of final URLs (R2 URLs or original URLs on failure)
   */
  async processImages(
    imageUrls: string[],
    onProgress?: (current: number, total: number) => void
  ): Promise<string[]> {
    const results: string[] = [];

    for (let i = 0; i < imageUrls.length; i++) {
      const url = imageUrls[i];
      
      if (onProgress) {
        onProgress(i + 1, imageUrls.length);
      }

      const result = await this.downloadAndUpload(url);
      results.push(result.finalUrl);

      // Small delay between downloads to be respectful
      if (i < imageUrls.length - 1) {
        await this.sleep(500);
      }
    }

    return results;
  }

  /**
   * Process images and return detailed results
   * Requirements: 5.1, 5.2, 5.3, 5.4
   * 
   * @param imageUrls - Array of image URLs to process
   * @param onProgress - Optional progress callback
   * @returns Array of ImageProcessResult with detailed info
   */
  async processImagesDetailed(
    imageUrls: string[],
    onProgress?: (current: number, total: number) => void
  ): Promise<ImageProcessResult[]> {
    const results: ImageProcessResult[] = [];

    for (let i = 0; i < imageUrls.length; i++) {
      const url = imageUrls[i];
      
      if (onProgress) {
        onProgress(i + 1, imageUrls.length);
      }

      const result = await this.downloadAndUpload(url);
      results.push(result);

      // Small delay between downloads to be respectful
      if (i < imageUrls.length - 1) {
        await this.sleep(500);
      }
    }

    return results;
  }

  /**
   * Clean up a local file
   * @param filePath - Path to file to delete
   */
  private cleanupLocalFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error: any) {
      console.warn(`⚠️ Failed to cleanup file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Clean up all files in download directory
   */
  cleanupDownloadDir(): void {
    try {
      if (fs.existsSync(this.downloadDir)) {
        const files = fs.readdirSync(this.downloadDir);
        for (const file of files) {
          const filePath = path.join(this.downloadDir, file);
          fs.unlinkSync(filePath);
        }
        console.log(`🧹 Cleaned up ${files.length} files from ${this.downloadDir}`);
      }
    } catch (error: any) {
      console.warn(`⚠️ Failed to cleanup download directory: ${error.message}`);
    }
  }

  /**
   * Get download directory path
   */
  getDownloadDir(): string {
    return this.downloadDir;
  }

  /**
   * Check if R2 upload is enabled
   */
  isR2UploadEnabled(): boolean {
    return this.uploadToR2Enabled;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const mocationImageHandler = new MocationImageHandler();

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a new MocationImageHandler with custom options
 * @param options - Handler options
 * @returns New MocationImageHandler instance
 */
export function createMocationImageHandler(options?: ImageHandlerOptions): MocationImageHandler {
  return new MocationImageHandler(options);
}
