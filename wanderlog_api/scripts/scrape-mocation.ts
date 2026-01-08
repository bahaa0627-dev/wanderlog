/**
 * Mocation Scraper CLI Script
 * 
 * CLI tool for scraping place data from mocation.cc website.
 * Supports scraping movie_detail and place_detail pages using Puppeteer.
 * 
 * Usage:
 *   npx tsx scripts/scrape-mocation.ts --type movie --start 1 --end 100
 *   npx tsx scripts/scrape-mocation.ts --type place --start 1 --end 200
 * 
 * Options:
 *   --type <type>       Page type: 'movie' or 'place' (required)
 *   --start <id>        Start ID for range scraping (required)
 *   --end <id>          End ID for range scraping (required)
 *   --output <path>     Output JSON file path (default: ./mocation-{type}-{start}-{end}.json)
 *   --delay <ms>        Delay between requests in milliseconds (default: 2000)
 *   --dry-run           Only scrape, don't import to database
 *   --import            Import scraped data to Supabase database
 *   --help              Show help message
 * 
 * Requirements: 1.1, 1.2, 6.1-6.7
 */

import puppeteer, { Browser, Page } from 'puppeteer-core';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Import types from centralized type definitions
import {
  MocationScraperOptions,
  ScrapedMoviePage,
  ScrapedPlaceDetail,
  ScrapedData,
  ScrapeResult,
  MovieInfo,
  MoviePlaceItem,
  MOCATION_BASE_URL,
  DEFAULT_SCRAPER_OPTIONS,
  PLACE_DETAIL_SELECTORS,
  isScrapedMoviePage,
} from '../src/types/mocation';

// Import data storage utilities (Requirements 4.1, 4.2, 4.3, 4.4)
import { saveToJson, MocationImporter } from '../src/services/mocationImporter';

// Extended options for internal use (includes executablePath and retry settings)
interface InternalScraperOptions extends MocationScraperOptions {
  executablePath?: string;
  /** Maximum number of retries for failed pages, default 2 */
  maxRetries?: number;
  /** Delay between retries in milliseconds, default 5000 */
  retryDelay?: number;
}

// ============================================================================
// CLI Configuration
// ============================================================================

interface CLIOptions {
  type?: 'movie' | 'place';
  start?: number;
  end?: number;
  output?: string;
  delay: number;
  maxRetries: number;
  retryDelay: number;
  dryRun: boolean;
  import: boolean;
  processImages: boolean;
  uploadToR2: boolean;
  help: boolean;
}

const DEFAULT_DELAY = DEFAULT_SCRAPER_OPTIONS.delay;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY = 5000;
const BASE_URL = `${MOCATION_BASE_URL}/html`;

// ============================================================================
// Help Message
// ============================================================================

function printHelp(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                     MOCATION SCRAPER CLI                                     ║
╚══════════════════════════════════════════════════════════════════════════════╝

Scrape place data from mocation.cc website (movie_detail and place_detail pages).

USAGE:
  npx tsx scripts/scrape-mocation.ts [OPTIONS]

OPTIONS:
  --type <type>       Page type to scrape: 'movie' or 'place' (required)
                      - movie: Scrapes movie_detail.html pages
                      - place: Scrapes place_detail.html pages

  --start <id>        Start ID for range scraping (required)
                      Example: --start 1

  --end <id>          End ID for range scraping (required)
                      Example: --end 100

  --output <path>     Output JSON file path
                      Default: ./mocation-{type}-{start}-{end}.json

  --delay <ms>        Delay between requests in milliseconds (default: ${DEFAULT_DELAY})
                      Example: --delay 3000

  --retries <n>       Maximum number of retries for failed pages (default: 2)
                      Example: --retries 3

  --retry-delay <ms>  Delay between retries in milliseconds (default: 5000)
                      Example: --retry-delay 10000

  --dry-run           Only scrape data, don't import to database
                      Useful for testing and data validation

  --import            Import scraped data directly to Supabase database
                      Cannot be used with --dry-run

  --process-images    Download images to local temp directory during import
                      Images are downloaded but not uploaded to R2

  --upload-r2         Download images and upload to Cloudflare R2
                      Requires R2_UPLOAD_SECRET environment variable
                      Implies --process-images

  --help              Show this help message

EXAMPLES:
  # Scrape movie pages 1-100
  npx tsx scripts/scrape-mocation.ts --type movie --start 1 --end 100

  # Scrape place pages with custom delay
  npx tsx scripts/scrape-mocation.ts --type place --start 1 --end 200 --delay 3000

  # Scrape with more retries for unreliable connections
  npx tsx scripts/scrape-mocation.ts --type movie --start 1 --end 50 --retries 5 --retry-delay 10000

  # Scrape and save to custom file
  npx tsx scripts/scrape-mocation.ts --type movie --start 1 --end 50 --output ./data/movies.json

  # Scrape and import to database
  npx tsx scripts/scrape-mocation.ts --type place --start 1 --end 100 --import

  # Scrape, import, and upload images to R2
  npx tsx scripts/scrape-mocation.ts --type place --start 1 --end 100 --import --upload-r2

  # Dry run (scrape only, no import)
  npx tsx scripts/scrape-mocation.ts --type movie --start 1 --end 10 --dry-run

NOTES:
  - The scraper uses Puppeteer with system Chrome browser
  - Default delay between requests is 2 seconds to avoid rate limiting
  - Failed pages are retried up to 2 times by default (configurable with --retries)
  - Failed pages are logged and skipped after all retries, scraping continues
  - Results are saved to JSON file for later import if needed
  - Image processing requires --import flag (images are processed during import)
  - R2 upload requires R2_UPLOAD_SECRET environment variable
`);
}

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    delay: DEFAULT_DELAY,
    maxRetries: DEFAULT_MAX_RETRIES,
    retryDelay: DEFAULT_RETRY_DELAY,
    dryRun: false,
    import: false,
    processImages: false,
    uploadToR2: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--type':
        const type = args[++i];
        if (type !== 'movie' && type !== 'place') {
          console.error('❌ Error: --type must be "movie" or "place"');
          process.exit(1);
        }
        options.type = type;
        break;
      case '--start':
        const start = parseInt(args[++i], 10);
        if (isNaN(start) || start < 1) {
          console.error('❌ Error: --start must be a positive integer');
          process.exit(1);
        }
        options.start = start;
        break;
      case '--end':
        const end = parseInt(args[++i], 10);
        if (isNaN(end) || end < 1) {
          console.error('❌ Error: --end must be a positive integer');
          process.exit(1);
        }
        options.end = end;
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--delay':
        const delay = parseInt(args[++i], 10);
        if (isNaN(delay) || delay < 0) {
          console.error('❌ Error: --delay must be a non-negative integer');
          process.exit(1);
        }
        options.delay = delay;
        break;
      case '--retries':
        const retries = parseInt(args[++i], 10);
        if (isNaN(retries) || retries < 0) {
          console.error('❌ Error: --retries must be a non-negative integer');
          process.exit(1);
        }
        options.maxRetries = retries;
        break;
      case '--retry-delay':
        const retryDelay = parseInt(args[++i], 10);
        if (isNaN(retryDelay) || retryDelay < 0) {
          console.error('❌ Error: --retry-delay must be a non-negative integer');
          process.exit(1);
        }
        options.retryDelay = retryDelay;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--import':
        options.import = true;
        break;
      case '--process-images':
        options.processImages = true;
        break;
      case '--upload-r2':
        options.uploadToR2 = true;
        options.processImages = true; // R2 upload implies image processing
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        if (arg.startsWith('--')) {
          console.error(`❌ Error: Unknown option: ${arg}`);
          console.error('   Use --help to see available options');
          process.exit(1);
        }
    }
  }

  return options;
}

// ============================================================================
// Validation
// ============================================================================

function validateOptions(options: CLIOptions): void {
  if (!options.type) {
    console.error('❌ Error: --type is required (movie or place)');
    console.error('   Use --help to see usage examples');
    process.exit(1);
  }

  if (options.start === undefined) {
    console.error('❌ Error: --start is required');
    console.error('   Use --help to see usage examples');
    process.exit(1);
  }

  if (options.end === undefined) {
    console.error('❌ Error: --end is required');
    console.error('   Use --help to see usage examples');
    process.exit(1);
  }

  if (options.start > options.end) {
    console.error('❌ Error: --start must be less than or equal to --end');
    process.exit(1);
  }

  if (options.dryRun && options.import) {
    console.error('❌ Error: Cannot use both --dry-run and --import');
    process.exit(1);
  }
}

// ============================================================================
// MocationScraper Class
// Implements browser initialization, page scraping, and data extraction
// Requirements: 1.1, 1.2, 2.1-2.7
// ============================================================================

class MocationScraper {
  private browser: Browser | null = null;
  private options: Required<InternalScraperOptions>;
  private isInitialized: boolean = false;

  constructor(options: InternalScraperOptions = {}) {
    this.options = {
      headless: options.headless ?? DEFAULT_SCRAPER_OPTIONS.headless,
      timeout: options.timeout ?? DEFAULT_SCRAPER_OPTIONS.timeout,
      delay: options.delay ?? DEFAULT_SCRAPER_OPTIONS.delay,
      executablePath: options.executablePath ?? process.env.CHROME_PATH ?? this.detectChromePath(),
      maxRetries: options.maxRetries ?? 2,
      retryDelay: options.retryDelay ?? 5000,
    };
  }

  /**
   * Detect Chrome executable path based on OS
   * @returns Chrome executable path
   * @throws Error if Chrome is not found
   */
  private detectChromePath(): string {
    // macOS Chrome paths
    const macPaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];

    // Linux Chrome paths
    const linuxPaths = [
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
    ];

    // Windows Chrome paths
    const windowsPaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ];

    const allPaths = [...macPaths, ...linuxPaths, ...windowsPaths];

    for (const chromePath of allPaths) {
      if (fs.existsSync(chromePath)) {
        return chromePath;
      }
    }

    throw new Error(
      'Chrome not found. Please install Google Chrome or set CHROME_PATH environment variable.'
    );
  }

  /**
   * Initialize the Puppeteer browser instance
   * Requirements: 1.1, 1.2
   */
  async init(): Promise<void> {
    if (this.isInitialized && this.browser) {
      console.log('⚠️  Browser already initialized');
      return;
    }

    console.log('🚀 Initializing browser...');
    console.log(`   Headless: ${this.options.headless}`);
    console.log(`   Timeout: ${this.options.timeout}ms`);
    console.log(`   Delay: ${this.options.delay}ms`);
    console.log(`   Max Retries: ${this.options.maxRetries}`);
    console.log(`   Retry Delay: ${this.options.retryDelay}ms`);

    try {
      this.browser = await puppeteer.launch({
        headless: this.options.headless,
        executablePath: this.options.executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080',
        ],
        defaultViewport: {
          width: 1920,
          height: 1080,
        },
      });

      this.isInitialized = true;
      console.log('✅ Browser initialized successfully');
    } catch (error: any) {
      this.isInitialized = false;
      this.browser = null;
      throw new Error(`Failed to initialize browser: ${error.message}`);
    }
  }

  /**
   * Close the browser instance and clean up resources
   */
  async close(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
        console.log('🔒 Browser closed');
      } catch (error: any) {
        console.warn(`⚠️  Error closing browser: ${error.message}`);
      } finally {
        this.browser = null;
        this.isInitialized = false;
      }
    }
  }

  /**
   * Check if browser is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.browser !== null;
  }

  /**
   * Scrape a single page with retry logic
   * Requirements: 1.1, 1.2, 1.3, 1.4
   * 
   * @param url - Page URL to scrape
   * @param type - Page type ('movie' or 'place')
   * @param id - Page ID
   * @param retryCount - Current retry attempt (internal use)
   * @returns Scraped data or null if failed after all retries
   */
  async scrapePage(
    url: string, 
    type: 'movie' | 'place', 
    id: number,
    retryCount: number = 0
  ): Promise<ScrapedData | null> {
    if (!this.browser) {
      throw new Error('Browser not initialized. Call init() first.');
    }

    const page = await this.browser.newPage();
    
    try {
      // Set user agent to avoid detection
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Navigate to page with timeout
      const response = await page.goto(url, { 
        waitUntil: 'networkidle0', 
        timeout: this.options.timeout 
      });

      // Check for HTTP errors (Requirement 1.4)
      if (!response) {
        console.warn(`⚠️  No response from: ${url}`);
        return await this.handleRetry(url, type, id, retryCount, 'No response from server');
      }

      const status = response.status();
      if (status === 404) {
        // 404 errors should not be retried - page doesn't exist
        console.warn(`🔍 Page not found (404): ${url}`);
        return null;
      }

      if (status >= 500) {
        // Server errors should be retried
        console.warn(`❌ Server error ${status}: ${url}`);
        return await this.handleRetry(url, type, id, retryCount, `Server error ${status}`);
      }

      if (status >= 400) {
        // Other client errors should not be retried
        console.warn(`❌ HTTP error ${status}: ${url}`);
        return null;
      }

      // Wait for Vue.js to render content
      // The page uses Vue.js with v-if/v-for directives
      // It also makes an API call to /api/movie/{id} to fetch data
      await page.waitForFunction(() => {
        // Wait for loading indicator to disappear
        const loading = document.getElementById('loading');
        if (loading && loading.style.display !== 'none') {
          return false;
        }
        // Wait for Vue to render content (check for actual text, not template)
        const container = document.querySelector('.container');
        if (container && container.textContent?.includes('{{')) {
          return false; // Vue hasn't rendered yet
        }
        // Wait for plot items to appear (this means API data has loaded)
        const plotItems = document.querySelectorAll('.movie-plot ul li');
        if (plotItems.length === 0) {
          // Check if movie name is rendered (another indicator of data load)
          const movieName = document.querySelector('div.h21.alic');
          if (!movieName || !movieName.textContent?.trim()) {
            return false;
          }
        }
        return true;
      }, { timeout: 15000 }).catch(() => {
        console.warn(`⚠️  Vue render timeout for: ${url}`);
      });

      // Additional wait for dynamic content
      await this.sleep(2000);

      // Wait for content to load
      await page.waitForSelector('body', { timeout: 5000 }).catch(() => {});

      // Extract data based on page type
      if (type === 'movie') {
        return await this.extractMovieData(page, id, url);
      } else {
        return await this.extractPlaceData(page, id, url);
      }
    } catch (error: any) {
      // Handle timeout errors (Requirement 1.3)
      if (error.name === 'TimeoutError') {
        console.warn(`⏱️  Timeout loading page (>${this.options.timeout}ms): ${url}`);
        return await this.handleRetry(url, type, id, retryCount, 'Timeout');
      } else if (error.message?.includes('net::ERR_')) {
        // Network errors should be retried
        console.warn(`🌐 Network error: ${url} - ${error.message}`);
        return await this.handleRetry(url, type, id, retryCount, error.message);
      } else {
        console.warn(`❌ Error loading page ${url}: ${error.message}`);
        return await this.handleRetry(url, type, id, retryCount, error.message);
      }
    } finally {
      await page.close();
    }
  }

  /**
   * Handle retry logic for failed page scrapes
   * Requirements: 1.3, 1.4
   * 
   * @param url - Page URL
   * @param type - Page type
   * @param id - Page ID
   * @param retryCount - Current retry attempt
   * @param errorMessage - Error message from the failure
   * @returns Scraped data or null if all retries exhausted
   */
  private async handleRetry(
    url: string,
    type: 'movie' | 'place',
    id: number,
    retryCount: number,
    errorMessage: string
  ): Promise<ScrapedData | null> {
    if (retryCount < this.options.maxRetries) {
      const nextRetry = retryCount + 1;
      console.log(`🔄 Retry ${nextRetry}/${this.options.maxRetries} for ID ${id} after ${this.options.retryDelay}ms...`);
      await this.sleep(this.options.retryDelay);
      return this.scrapePage(url, type, id, nextRetry);
    }
    
    console.warn(`❌ All retries exhausted for ID ${id}: ${errorMessage}`);
    return null;
  }

  /**
   * Extract data from Movie Detail page
   * Requirements: 2.1-2.6
   * 
   * Based on actual mocation.cc HTML structure (Vue.js rendered):
   * - Movie Chinese name: div.h21.alic
   * - Movie English name: div.h11.alic
   * - Place count: .fs36.mocation-num
   * - Plot items: .movie-plot ul li (each li is a place)
   * - Each place has: placeName, cityCountry, sceneDescription, image
   * 
   * Returns optimized structure: movie info (once) + places array
   * 
   * @param page - Puppeteer page instance
   * @param id - Page ID
   * @param url - Page URL
   * @returns ScrapedMoviePage with movie info and places array
   */
  private async extractMovieData(page: Page, id: number, url: string): Promise<ScrapedMoviePage | null> {
    // Debug: log page state before extraction
    const debugInfo = await page.evaluate(() => {
      const loading = document.getElementById('loading');
      const container = document.querySelector('.container');
      const plotItems = document.querySelectorAll('.movie-plot ul li');
      return {
        loadingDisplay: loading?.style.display || 'no loading element',
        containerText: container?.textContent?.substring(0, 200) || 'no container',
        plotItemCount: plotItems.length,
        hasVuePlaceholders: container?.textContent?.includes('{{') || false,
      };
    });
    console.log(`   Debug info for ID ${id}:`, JSON.stringify(debugInfo));
    
    const data = await page.evaluate(() => {
      // Helper function to safely get text content
      const getText = (selector: string): string | null => {
        const el = document.querySelector(selector);
        const text = el?.textContent?.trim();
        // Filter out Vue template placeholders
        if (text && text.includes('{{')) return null;
        return text || null;
      };

      // Extract movie name (Chinese name from h21, English from h11)
      const movieNameCn = getText('div.h21.alic');
      const movieNameEn = getText('div.h11.alic');

      // Extract place count
      const placeCountText = getText('.fs36.mocation-num');
      const placeCount = placeCountText ? parseInt(placeCountText, 10) : null;

      // Extract all places from plot list
      const places: Array<{
        placeName: string;
        placeNameEn: string | null;
        cityCountry: string | null;
        sceneDescription: string | null;
        image: string | null;
        episode: string | null;
        position: string | null;
      }> = [];

      // Each li in .movie-plot ul is a place
      const plotItems = document.querySelectorAll('.movie-plot ul li');
      
      plotItems.forEach((li) => {
        const plotContent = li.querySelector('.plot-content');
        if (!plotContent) return;

        // Get place name (Chinese)
        const placeNameEl = plotContent.querySelector('div.fs16.pb5, div.fs16[style*="margin-bottom"]');
        const placeName = placeNameEl?.textContent?.trim() || null;

        // Get place name (English)
        const placeNameEnEl = plotContent.querySelector('div.fs10');
        let placeNameEn = placeNameEnEl?.textContent?.trim() || null;
        // Filter out if it's a Vue placeholder
        if (placeNameEn && placeNameEn.includes('{{')) placeNameEn = null;

        // Get city/country
        const cityCountryEl = plotContent.querySelector('div.fs12.pb5[style*="margin-top"], div[style*="margin-top"].fs12.pb5');
        const cityCountry = cityCountryEl?.textContent?.trim() || null;

        // Get scene description
        const sceneEl = plotContent.querySelector('div.fs12.c88');
        const sceneDescription = sceneEl?.textContent?.trim() || null;

        // Get image
        const imgEl = plotContent.querySelector('img[alt="剧照"]');
        let image: string | null = null;
        if (imgEl) {
          const src = imgEl.getAttribute('src') || imgEl.getAttribute('data-src');
          if (src && !src.startsWith('http')) {
            image = `https://prd.mocation.cc${src.startsWith('/') ? '' : '/'}${src}`;
          } else {
            image = src;
          }
        }

        // Get episode and position from plot-time
        const plotTimeEl = li.querySelector('.plot-time');
        const plotTimeText = plotTimeEl?.textContent?.trim() || '';
        const episodeMatch = plotTimeText.match(/E(\d+)/);
        const episode = episodeMatch ? episodeMatch[1] : null;
        // Position is the rest after episode
        const position = plotTimeText.replace(/E\d+\s*/, '').trim() || null;

        // Only add if we have at least a place name
        if (placeName) {
          places.push({
            placeName,
            placeNameEn,
            cityCountry,
            sceneDescription,
            image,
            episode,
            position,
          });
        }
      });

      return {
        movieNameCn,
        movieNameEn,
        placeCount: isNaN(placeCount as number) ? null : placeCount,
        places,
      };
    });

    // Return null if no places found
    if (data.places.length === 0) {
      return null;
    }

    // Return optimized structure
    return {
      sourceType: 'movie' as const,
      movie: {
        movieId: String(id),
        movieNameCn: data.movieNameCn,
        movieNameEn: data.movieNameEn,
        sourceUrl: url,
        placeCount: data.placeCount,
      },
      places: data.places.map(place => ({
        placeName: place.placeName,
        placeNameEn: place.placeNameEn,
        cityCountry: place.cityCountry,
        sceneDescription: place.sceneDescription,
        image: place.image,
        episode: place.episode,
        position: place.position,
      })),
      scrapedAt: new Date().toISOString(),
    };
  }

  /**
   * Extract data from Place Detail page
   * Requirements: 2.1-2.5
   * 
   * Place detail pages show a place with multiple associated movies.
   * Each movie has its own stills (剧照) at this location.
   * 
   * CSS Selectors used:
   * - placeName: div.fs21.mb5
   * - placeNameEn: div.fs11.mb20
   * - coverImage: img.mb20.img100[alt="封面"]
   * - address: div.fs12.mb20 (first one with address text)
   * - phone: div with phone icon
   * - movies: .scenes-item (each contains movie info and stills)
   * 
   * @param page - Puppeteer page instance
   * @param id - Page ID
   * @param url - Page URL
   * @returns Scraped place detail data with movies and stills
   */
  private async extractPlaceData(page: Page, id: number, url: string): Promise<ScrapedPlaceDetail> {
    const data = await page.evaluate(() => {
      // Helper function to safely get text content
      const getText = (selector: string): string | null => {
        const el = document.querySelector(selector);
        const text = el?.textContent?.trim();
        if (text && text.includes('{{')) return null; // Vue template not rendered
        return text || null;
      };

      // Helper function to get image src
      const getImageSrc = (el: Element | null): string | null => {
        if (!el) return null;
        const src = el.getAttribute('src') || el.getAttribute('data-src');
        if (src && !src.startsWith('http')) {
          return `https://prd.mocation.cc${src.startsWith('/') ? '' : '/'}${src}`;
        }
        return src;
      };

      // Extract place name (Chinese)
      const placeName = getText('div.fs21.mb5');
      
      // Extract place name (English)
      const placeNameEn = getText('div.fs11.mb20');

      // Extract cover image
      const coverImg = document.querySelector('img.mb20.img100[alt="封面"]');
      const coverImage = getImageSrc(coverImg);

      // Extract address - look for div with address content
      let address: string | null = null;
      const addressDivs = document.querySelectorAll('div.fs12.mb20');
      for (const div of addressDivs) {
        const text = div.textContent?.trim() || '';
        // Address usually contains location characters or postal code
        if (text && !text.includes('+') && (text.includes('〒') || text.includes('丁目') || text.includes('号') || text.includes('路') || text.includes('街') || text.length > 10)) {
          // Check if it's not a phone number
          if (!text.match(/^\+?\d[\d\s\-]+$/)) {
            address = text;
            break;
          }
        }
      }

      // Extract phone - look for phone icon or phone pattern
      let phone: string | null = null;
      const phoneImg = document.querySelector('img[alt="icon"][src*="phone"]');
      if (phoneImg && phoneImg.parentElement) {
        const phoneText = phoneImg.parentElement.textContent?.trim() || '';
        if (phoneText) {
          phone = phoneText;
        }
      }
      // Fallback: look for phone pattern in divs
      if (!phone) {
        for (const div of addressDivs) {
          const text = div.textContent?.trim() || '';
          if (text.match(/^\+?\d[\d\s\-]{8,}$/)) {
            phone = text;
            break;
          }
        }
      }

      // Extract movies and their stills
      const movies: Array<{
        movieId: string | null;
        movieNameCn: string | null;
        movieNameEn: string | null;
        sceneDescription: string | null;
        stills: string[];
      }> = [];

      const sceneItems = document.querySelectorAll('.scenes-item');
      sceneItems.forEach((item) => {
        const movieNameCn = item.querySelector('.fs21.mb15.alic')?.textContent?.trim() || null;
        const movieNameEn = item.querySelector('.fs11.alic')?.textContent?.trim() || null;
        const sceneDesc = item.querySelector('.scenes-des')?.textContent?.trim() || null;
        
        // Get movie ID from cover image click handler or link
        let movieId: string | null = null;
        const coverLink = item.querySelector('img[alt="电影封面"]');
        if (coverLink) {
          const onclick = coverLink.getAttribute('onclick') || '';
          const match = onclick.match(/gotoMovie\((\d+)\)/);
          if (match) {
            movieId = match[1];
          }
        }
        
        // Get stills for this movie (max 10)
        const stills: string[] = [];
        const stillImages = item.querySelectorAll('.movie-stills img[alt="剧照"]');
        const MAX_STILLS = 10;
        stillImages.forEach((img) => {
          if (stills.length >= MAX_STILLS) return;
          const src = getImageSrc(img);
          if (src) stills.push(src);
        });

        movies.push({
          movieId,
          movieNameCn,
          movieNameEn,
          sceneDescription: sceneDesc,
          stills,
        });
      });

      return {
        placeName,
        placeNameEn,
        coverImage,
        address,
        phone,
        movies,
      };
    });

    return {
      sourceId: String(id),
      sourceType: 'place',
      sourceUrl: url,
      placeName: data.placeName,
      placeNameEn: data.placeNameEn,
      coverImage: data.coverImage,
      address: data.address,
      phone: data.phone,
      movies: data.movies,
      scrapedAt: new Date().toISOString(),
    };
  }

  /**
   * Scrape a range of pages
   * Requirements: 3.1-3.4
   * 
   * @param type - Page type ('movie' or 'place')
   * @param startId - Start ID
   * @param endId - End ID
   * @param onProgress - Progress callback
   * @returns Scrape result with statistics
   */
  async scrapeRange(
    type: 'movie' | 'place',
    startId: number,
    endId: number,
    onProgress?: (current: number, total: number, status?: string) => void
  ): Promise<ScrapeResult> {
    const startTime = new Date().toISOString();
    const result: ScrapeResult = {
      total: endId - startId + 1,
      success: 0,
      failed: 0,
      skipped: 0,
      data: [],
      totalPlaces: 0,
      errors: [],
      startedAt: startTime,
      completedAt: '', // Will be set at the end
    };

    const pageType = type === 'movie' ? 'movie_detail' : 'place_detail';
    const failedIds: number[] = []; // Track failed page IDs for summary

    console.log(`\n📋 Starting batch scrape: ${type} pages ${startId}-${endId}`);
    console.log(`   Total pages to scrape: ${result.total}`);
    console.log(`   Request delay: ${this.options.delay}ms`);
    console.log(`   Max retries per page: ${this.options.maxRetries}\n`);

    for (let id = startId; id <= endId; id++) {
      const url = `${BASE_URL}/${pageType}.html?id=${id}`;
      const currentProgress = id - startId + 1;
      
      if (onProgress) {
        onProgress(currentProgress, result.total, `Scraping ID ${id}`);
      }

      const data = await this.scrapePage(url, type, id);

      if (data) {
        // Check if the page has meaningful content
        let hasContent = false;
        let placeCount = 0;
        
        if (isScrapedMoviePage(data)) {
          hasContent = data.places.length > 0;
          placeCount = data.places.length;
        } else {
          hasContent = !!data.placeName;
          placeCount = hasContent ? 1 : 0;
        }

        if (hasContent) {
          result.success++;
          result.data.push(data);
          result.totalPlaces += placeCount;
          console.log(`   ✅ ID ${id}: Found ${placeCount} place(s)`);
        } else {
          result.skipped++;
          result.errors.push({ 
            id: String(id), 
            type,
            error: 'Page exists but has no content',
            code: 'EMPTY_CONTENT'
          });
        }
      } else {
        result.failed++;
        failedIds.push(id);
        result.errors.push({ 
          id: String(id), 
          type,
          error: 'Failed to scrape page after all retries',
          code: 'SCRAPE_FAILED'
        });
      }

      // Add delay between requests (Requirement 3.2)
      if (id < endId && this.options.delay > 0) {
        await this.sleep(this.options.delay);
      }
    }

    result.completedAt = new Date().toISOString();

    // Log failed IDs for easy reference (Requirement 1.3, 1.4)
    if (failedIds.length > 0) {
      console.log(`\n⚠️  Failed page IDs (${failedIds.length}): ${failedIds.join(', ')}`);
    }

    return result;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Main Scrape Function
// ============================================================================

async function runScrape(options: CLIOptions): Promise<void> {
  const scraper = new MocationScraper({
    delay: options.delay,
    maxRetries: options.maxRetries,
    retryDelay: options.retryDelay,
  });

  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                     MOCATION SCRAPER                                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  console.log('📋 Configuration:');
  console.log(`   Type:        ${options.type}`);
  console.log(`   Range:       ${options.start} - ${options.end}`);
  console.log(`   Delay:       ${options.delay}ms`);
  console.log(`   Max Retries: ${options.maxRetries}`);
  console.log(`   Retry Delay: ${options.retryDelay}ms`);
  console.log(`   Mode:        ${options.dryRun ? 'DRY RUN' : options.import ? 'IMPORT' : 'SCRAPE ONLY'}`);
  if (options.processImages) {
    console.log(`   Images:      ${options.uploadToR2 ? 'Download + R2 Upload' : 'Download Only'}`);
  }
  console.log('');

  try {
    await scraper.init();

    const result = await scraper.scrapeRange(
      options.type!,
      options.start!,
      options.end!,
      (current, total) => {
        process.stdout.write(`\r📥 Progress: ${current}/${total} (${Math.round(current / total * 100)}%)`);
      }
    );

    console.log('\n');

    // Save results to JSON file (Requirement 4.1)
    const outputPath = options.output || `./mocation-${options.type}-${options.start}-${options.end}.json`;
    const saveResult = saveToJson(result.data, { outputPath });
    
    if (saveResult.success) {
      console.log(`💾 Results saved to: ${saveResult.filePath}`);
      console.log(`   Records saved: ${saveResult.recordCount}`);
    } else {
      console.error(`❌ Failed to save results: ${saveResult.error}`);
    }

    // Print scrape summary
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                           SCRAPE COMPLETE                                     ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    console.log('📊 Scrape Summary:');
    console.log(`   Pages:       ${result.total} (success: ${result.success}, failed: ${result.failed}, skipped: ${result.skipped})`);
    console.log(`   Places:      ${result.totalPlaces} total`);

    if (result.errors.length > 0) {
      console.log('\n⚠️  Scrape Errors:');
      result.errors.slice(0, 10).forEach(err => {
        console.log(`   - ID ${err.id}: ${err.error}`);
      });
      if (result.errors.length > 10) {
        console.log(`   ... and ${result.errors.length - 10} more errors`);
      }
    }

    // Import to database if requested (Requirements 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4)
    if (options.import && !options.dryRun && result.data.length > 0) {
      console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
      console.log('║                        DATABASE IMPORT                                        ║');
      console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

      // Show image processing configuration
      if (options.processImages) {
        console.log('📷 Image Processing: ENABLED');
        console.log(`   Upload to R2: ${options.uploadToR2 ? 'YES' : 'NO (local only)'}`);
        console.log('');
      }

      try {
        const importer = new MocationImporter({
          processImages: options.processImages,
          imageHandlerOptions: {
            uploadToR2: options.uploadToR2,
          },
        });
        const importResult = await importer.importAll(result.data, (current, total) => {
          process.stdout.write(`\r📤 Import Progress: ${current}/${total} (${Math.round(current / total * 100)}%)`);
        });

        console.log('\n\n📊 Import Summary:');
        console.log(`   Total:       ${importResult.total} places`);
        console.log(`   Imported:    ${importResult.imported} (new places)`);
        console.log(`   Updated:     ${importResult.updated} (added movie references)`);
        console.log(`   Skipped:     ${importResult.skipped} (duplicates)`);
        console.log(`   Failed:      ${importResult.failed}`);

        if (importResult.errors.length > 0) {
          console.log('\n⚠️  Import Errors:');
          importResult.errors.slice(0, 10).forEach(err => {
            console.log(`   - ID ${err.id}: ${err.error}`);
          });
          if (importResult.errors.length > 10) {
            console.log(`   ... and ${importResult.errors.length - 10} more errors`);
          }
        }
      } catch (importError: any) {
        console.error(`\n❌ Database import failed: ${importError.message}`);
        console.error('   Make sure SUPABASE_URL and SUPABASE_SERVICE_KEY are set.');
        if (options.uploadToR2) {
          console.error('   For R2 upload, also ensure R2_UPLOAD_SECRET is set.');
        }
      }
    } else if (options.import && result.data.length === 0) {
      console.log('\n⚠️  No data to import (all pages failed or were empty)');
    }

    await scraper.close();

  } catch (error: any) {
    console.error('\n❌ Scrape failed:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    await scraper.close();
    process.exit(1);
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  // Show help if requested or no arguments
  if (options.help || args.length === 0) {
    printHelp();
    process.exit(0);
  }

  // Validate options
  validateOptions(options);

  // Run scrape
  await runScrape(options);
}

// Run main function
main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
