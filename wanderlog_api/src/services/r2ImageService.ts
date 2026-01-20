/**
 * R2 Image Service
 * 
 * Handles image download, processing, and upload to Cloudflare R2.
 * 
 * Features:
 * - Download images with timeout and retry
 * - Process images (convert to JPEG, resize)
 * - Upload to R2 with proper headers
 * - Generate UUID-based R2 keys (no googlePlaceId exposure)
 * 
 * Requirements: 3.1-3.9
 */

import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import * as crypto from 'crypto';
import { ImageUploadResult } from '../types/apify';

// ============================================================================
// Configuration (defaults only - actual values read from env at runtime)
// ============================================================================

const DEFAULT_R2_PUBLIC_URL = 'https://wanderlog-images.blcubahaa0627.workers.dev';
const DEFAULT_IMAGE_PROXY_URL = 'https://wanderlog-images.blcubahaa0627.workers.dev/proxy/google-photo';
const DEFAULT_IMAGE_CDN_URL = 'https://wanderlog-images.blcubahaa0627.workers.dev';

// Image processing settings
const IMAGE_QUALITY = 85;  // JPEG quality (82-88 range per requirements)
const MAX_DIMENSION = 1600; // Maximum dimension in pixels
const DOWNLOAD_TIMEOUT_MS = 30000; // 30 seconds (increased for Google images)
const UPLOAD_TIMEOUT_MS = 30000; // 30 seconds
const MAX_RETRIES = 3; // Increased retries

// ============================================================================
// Types
// ============================================================================

export interface R2ImageServiceConfig {
  r2PublicUrl?: string;
  r2UploadSecret?: string;
  imageProxyUrl?: string;
  imageCdnUrl?: string;
  imageQuality?: number;
  maxDimension?: number;
  downloadTimeoutMs?: number;
  uploadTimeoutMs?: number;
  maxRetries?: number;
}

export interface DownloadResult {
  success: boolean;
  buffer?: Buffer;
  contentType?: string;
  error?: string;
}

export interface ProcessResult {
  success: boolean;
  buffer?: Buffer;
  error?: string;
}

// ============================================================================
// R2 Image Service Class
// ============================================================================

export class R2ImageService {
  private r2PublicUrl: string;
  private r2UploadSecret: string;
  private imageProxyUrl: string;
  private imageCdnUrl: string;
  private imageQuality: number;
  private maxDimension: number;
  private downloadTimeoutMs: number;
  private uploadTimeoutMs: number;
  private maxRetries: number;

  constructor(config?: R2ImageServiceConfig) {
    // Read env vars at instantiation time (not at module load time)
    // This ensures dotenv.config() has been called before we read them
    this.r2PublicUrl = config?.r2PublicUrl || process.env.R2_PUBLIC_URL || DEFAULT_R2_PUBLIC_URL;
    this.r2UploadSecret = config?.r2UploadSecret || process.env.R2_UPLOAD_SECRET || '';
    this.imageProxyUrl = config?.imageProxyUrl || process.env.IMAGE_PROXY_URL || DEFAULT_IMAGE_PROXY_URL;
    this.imageCdnUrl = config?.imageCdnUrl || process.env.IMAGE_CDN_URL || DEFAULT_IMAGE_CDN_URL;
    this.imageQuality = config?.imageQuality || IMAGE_QUALITY;
    this.maxDimension = config?.maxDimension || MAX_DIMENSION;
    this.downloadTimeoutMs = config?.downloadTimeoutMs || DOWNLOAD_TIMEOUT_MS;
    this.uploadTimeoutMs = config?.uploadTimeoutMs || UPLOAD_TIMEOUT_MS;
    this.maxRetries = config?.maxRetries ?? MAX_RETRIES;
  }

  /**
   * Generate a UUID-based R2 key for image storage
   * 
   * Format: places/cover/v1/{p1}/{p2}/{uuid}.jpg
   * - p1: uuid 前 2 位 (例如 a3)
   * - p2: uuid 第 3-4 位 (例如 f9)
   * Example: places/cover/v1/a3/f9/a3f9c2d9-5e0e-4a8d-9c2f-2bdb2c9f0a11.jpg
   * 
   * Requirements: 3.2, 3.9 (UUID format, no googlePlaceId)
   */
  generateR2Key(): string {
    const uuid = crypto.randomUUID();
    const p1 = uuid.substring(0, 2);  // 前 2 位
    const p2 = uuid.substring(2, 4);  // 第 3-4 位
    return `places/cover/v1/${p1}/${p2}/${uuid}.jpg`;
  }

  /**
   * Build the public URL for an R2 key (使用 CDN URL)
   */
  buildPublicUrl(r2Key: string): string {
    return `${this.imageCdnUrl}/${r2Key}`;
  }

  /**
   * Download an image from a URL with timeout and redirect support
   * Uses Cloudflare Worker proxy for Google images
   * 
   * Requirements: 3.1, 3.8 (download with timeout)
   */
  async downloadImage(imageUrl: string, retryCount = 0): Promise<DownloadResult> {
    // Use proxy for Google images
    const isGoogleImage = imageUrl.includes('googleusercontent.com') || imageUrl.includes('google.com');
    const targetUrl = isGoogleImage 
      ? `${this.imageProxyUrl}?url=${encodeURIComponent(imageUrl)}`
      : imageUrl;
    
    if (isGoogleImage && retryCount === 0) {
      console.log(`   🔄 Using proxy for Google image`);
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (retryCount < this.maxRetries) {
          console.log(`   ⏳ Retry ${retryCount + 1}/${this.maxRetries} for image download...`);
          this.downloadImage(imageUrl, retryCount + 1).then(resolve);
        } else {
          resolve({ success: false, error: `Download timeout (${this.downloadTimeoutMs / 1000}s) after ${this.maxRetries} retries` });
        }
      }, this.downloadTimeoutMs);

      const makeRequest = (reqUrl: string, redirectCount = 0) => {
        if (redirectCount > 5) {
          clearTimeout(timeout);
          resolve({ success: false, error: 'Too many redirects' });
          return;
        }

        try {
          const parsedUrl = new URL(reqUrl);
          const isHttps = parsedUrl.protocol === 'https:';
          const httpModule = isHttps ? https : http;

          const requestOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
              'Accept': 'image/*,*/*',
            },
          };

          const req = httpModule.request(requestOptions, (res) => {
            // Handle redirects
            if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307) {
              const redirectUrl = res.headers.location;
              if (redirectUrl) {
                // Handle relative redirects
                const absoluteUrl = redirectUrl.startsWith('http') 
                  ? redirectUrl 
                  : `${parsedUrl.protocol}//${parsedUrl.host}${redirectUrl}`;
                makeRequest(absoluteUrl, redirectCount + 1);
                return;
              }
            }

            if (res.statusCode !== 200) {
              clearTimeout(timeout);
              resolve({ success: false, error: `HTTP ${res.statusCode}` });
              return;
            }

            const chunks: Buffer[] = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
              clearTimeout(timeout);
              const buffer = Buffer.concat(chunks);
              
              // Validate image size (at least 1KB to avoid error pages)
              if (buffer.length < 1000) {
                resolve({ success: false, error: 'Image too small, might be error page' });
                return;
              }

              resolve({
                success: true,
                buffer,
                contentType: res.headers['content-type'] || 'image/jpeg',
              });
            });
          });

          req.on('error', (e) => {
            clearTimeout(timeout);
            
            // Retry on network errors
            if (retryCount < this.maxRetries) {
              this.downloadImage(imageUrl, retryCount + 1).then(resolve);
            } else {
              resolve({ success: false, error: e.message });
            }
          });

          req.end();
        } catch (e: any) {
          clearTimeout(timeout);
          resolve({ success: false, error: `Invalid URL: ${e.message}` });
        }
      };

      makeRequest(targetUrl);
    });
  }

  /**
   * Process image: convert to JPEG and resize if needed
   * 
   * Requirements: 3.3 (JPEG quality 82-88, max 1600px)
   * 
   * Note: This is a simplified implementation that passes through the buffer.
   * For production, you would use sharp library for actual image processing.
   * The sharp library requires native bindings which may not be available in all environments.
   */
  async processImage(buffer: Buffer): Promise<ProcessResult> {
    try {
      // Check if sharp is available
      let sharp: any;
      try {
        sharp = require('sharp');
      } catch {
        // Sharp not available, return original buffer
        // In production, sharp should be installed for proper image processing
        console.warn('⚠️ sharp library not available, skipping image processing');
        return { success: true, buffer };
      }

      // Process with sharp
      const processed = await sharp(buffer)
        .resize(this.maxDimension, this.maxDimension, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: this.imageQuality })
        .toBuffer();

      return { success: true, buffer: processed };
    } catch (e: any) {
      // If processing fails, return original buffer
      console.warn(`⚠️ Image processing failed: ${e.message}, using original`);
      return { success: true, buffer };
    }
  }

  /**
   * Upload image buffer to R2
   * 
   * Requirements: 3.4 (Content-Type: image/jpeg, Cache-Control headers)
   */
  async uploadToR2(imageBuffer: Buffer, r2Key: string): Promise<ImageUploadResult> {
    if (!this.r2UploadSecret) {
      return { success: false, error: 'R2_UPLOAD_SECRET not configured' };
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Upload timeout (30s)' });
      }, this.uploadTimeoutMs);

      try {
        const url = new URL(`${this.r2PublicUrl}/${r2Key}`);

        const options = {
          hostname: url.hostname,
          port: 443,
          path: url.pathname,
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${this.r2UploadSecret}`,
            'Content-Type': 'image/jpeg',
            'Content-Length': imageBuffer.length,
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        };

        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            clearTimeout(timeout);
            if (res.statusCode === 200 || res.statusCode === 201) {
              resolve({
                success: true,
                r2Key,
                publicUrl: this.buildPublicUrl(r2Key),
              });
            } else {
              resolve({
                success: false,
                error: `R2 upload failed: ${res.statusCode} ${data}`,
              });
            }
          });
        });

        req.on('error', (e) => {
          clearTimeout(timeout);
          resolve({ success: false, error: `R2 upload error: ${e.message}` });
        });

        req.write(imageBuffer);
        req.end();
      } catch (e: any) {
        clearTimeout(timeout);
        resolve({ success: false, error: `R2 upload error: ${e.message}` });
      }
    });
  }

  /**
   * Complete flow: download, process, and upload image to R2
   * 
   * Requirements: 3.1-3.9
   * 
   * @param imageUrl - Source image URL
   * @returns ImageUploadResult with r2Key and publicUrl on success
   */
  async processAndUpload(imageUrl: string): Promise<ImageUploadResult> {
    // Step 1: Download image
    const downloadResult = await this.downloadImage(imageUrl);
    if (!downloadResult.success || !downloadResult.buffer) {
      return { success: false, error: downloadResult.error || 'Download failed' };
    }

    // Step 2: Process image (convert to JPEG, resize)
    const processResult = await this.processImage(downloadResult.buffer);
    if (!processResult.success || !processResult.buffer) {
      return { success: false, error: processResult.error || 'Processing failed' };
    }

    // Step 3: Generate R2 key (UUID-based, no googlePlaceId)
    const r2Key = this.generateR2Key();

    // Step 4: Upload to R2
    const uploadResult = await this.uploadToR2(processResult.buffer, r2Key);
    
    return uploadResult;
  }

  /**
   * Validate that an R2 key follows the correct format and doesn't contain googlePlaceId
   * 
   * Format: places/cover/v1/{p1}/{p2}/{uuid}.jpg
   * - p1: 2 chars (uuid 前 2 位)
   * - p2: 2 chars (uuid 第 3-4 位)
   * 
   * Requirements: 3.2, 3.9
   */
  static validateR2Key(r2Key: string, googlePlaceId?: string): boolean {
    // Check format: places/cover/v1/{2chars}/{2chars}/{uuid}.jpg
    const pattern = /^places\/cover\/v1\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.jpg$/;
    if (!pattern.test(r2Key)) {
      return false;
    }

    // Ensure googlePlaceId is not in the key
    if (googlePlaceId && r2Key.includes(googlePlaceId)) {
      return false;
    }

    // Ensure no ChIJ pattern (Google Place ID format)
    if (/ChIJ/.test(r2Key)) {
      return false;
    }

    return true;
  }

  /**
   * Extract UUID from R2 key
   */
  static extractUuidFromKey(r2Key: string): string | null {
    const match = r2Key.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.jpg$/);
    return match ? match[1] : null;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const r2ImageService = new R2ImageService();

