/**
 * Enhanced Mocation Movie Scraper
 * 
 * Scrapes movie detail page and all associated place detail pages
 * Enriches data with coordinates, addresses, phone numbers, and categories
 */

import puppeteer, { Browser, Page } from 'puppeteer-core';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import axios from 'axios';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const MOCATION_BASE_URL = 'https://prd.mocation.cc';
const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

interface MoviePlace {
  placeName: string;
  placeNameEn: string | null;
  placeId: string | null; // Add place ID
  cityCountry: string | null;
  sceneDescription: string | null;
  image: string | null;
  episode: string | null;
  position: string | null;
}

interface PlaceDetail {
  name: string;
  nameEn: string | null;
  nameZh: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  phoneNumber: string | null;
  category: string | null;
  categoryEn: string | null;
  website: string | null;
  coverImage: string | null; // From movie page
  sceneImages: string[]; // All scene images from movie page
  sceneDescription: string | null;
  episode: string | null;
  position: string | null;
}

interface EnhancedMovieData {
  movieId: string;
  movieNameCn: string;
  movieNameEn: string;
  sourceUrl: string;
  placeCount: number;
  places: PlaceDetail[];
  scrapedAt: string;
}

class EnhancedMocationScraper {
  private browser: Browser | null = null;

  async init() {
    console.log('🚀 Initializing browser...');
    this.browser = await puppeteer.launch({
      headless: true,
      executablePath: CHROME_PATH,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
    console.log('✅ Browser initialized\n');
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('🔒 Browser closed');
    }
  }

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Parse city and country from cityCountry string
   * Returns English names
   */
  private parseCityCountry(cityCountry: string | null): { city: string | null; country: string | null } {
    if (!cityCountry) {
      return { city: null, country: null };
    }

    // Common country mappings (Chinese to English)
    const countryMap: Record<string, string> = {
      '意大利': 'Italy',
      '法国': 'France',
      '英国': 'United Kingdom',
      '美国': 'United States',
      '日本': 'Japan',
      '中国': 'China',
      '德国': 'Germany',
      '西班牙': 'Spain',
      '韩国': 'South Korea',
      '泰国': 'Thailand',
    };

    // Try to split by comma or Chinese comma
    const separators = [',', '，', ' '];
    for (const sep of separators) {
      if (cityCountry.includes(sep)) {
        const parts = cityCountry.split(sep).map(s => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
          const city = parts[0];
          const countryRaw = parts[parts.length - 1];
          const country = countryMap[countryRaw] || countryRaw;
          return { city, country };
        }
      }
    }

    return { city: cityCountry.trim(), country: null };
  }

  /**
   * Scrape movie detail page to get list of places
   */
  async scrapeMoviePage(movieId: string): Promise<{ movie: any; places: MoviePlace[] } | null> {
    if (!this.browser) throw new Error('Browser not initialized');

    const url = `${MOCATION_BASE_URL}/html/movie_detail.html?id=${movieId}`;
    console.log(`📥 Scraping movie page: ${url}`);

    const page = await this.browser.newPage();
    
    try {
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      );

      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

      // Wait for Vue to render
      await page.waitForFunction(() => {
        const loading = document.getElementById('loading');
        if (loading && loading.style.display !== 'none') return false;
        const container = document.querySelector('.container');
        if (container && container.textContent?.includes('{{')) return false;
        return true;
      }, { timeout: 15000 }).catch(() => {});

      await this.sleep(2000);

      const data = await page.evaluate(`(function() {
        function getText(selector) {
          var el = document.querySelector(selector);
          var text = el ? el.textContent.trim() : null;
          if (text && text.includes('{{')) return null;
          return text || null;
        }

        var movieNameCn = getText('div.h21.alic');
        var movieNameEn = getText('div.h11.alic');
        var placeCountText = getText('.fs36.mocation-num');
        var placeCount = placeCountText ? parseInt(placeCountText, 10) : 0;

        var places = [];
        var plotItems = document.querySelectorAll('.movie-plot ul li');
        
        plotItems.forEach(function(li) {
          var plotContent = li.querySelector('.plot-content');
          if (!plotContent) return;

          // Try to get place ID from link or data attribute
          var placeId = null;
          var placeLink = li.querySelector('a[href*="place_detail"]');
          if (placeLink) {
            var href = placeLink.getAttribute('href');
            var idMatch = href.match(/[?&]id=(\\d+)/);
            if (idMatch) placeId = idMatch[1];
          }
          
          // Also try data-id attribute
          if (!placeId) {
            placeId = li.getAttribute('data-place-id') || plotContent.getAttribute('data-place-id');
          }

          var placeNameEl = plotContent.querySelector('div.fs16.pb5, div.fs16[style*="margin-bottom"]');
          var placeName = placeNameEl ? placeNameEl.textContent.trim() : null;

          var placeNameEnEl = plotContent.querySelector('div.fs10');
          var placeNameEn = placeNameEnEl ? placeNameEnEl.textContent.trim() : null;
          if (placeNameEn && placeNameEn.includes('{{')) placeNameEn = null;

          var cityCountryEl = plotContent.querySelector('div.fs12.pb5[style*="margin-top"]');
          var cityCountry = cityCountryEl ? cityCountryEl.textContent.trim() : null;

          var sceneEl = plotContent.querySelector('div.fs12.c88');
          var sceneDescription = sceneEl ? sceneEl.textContent.trim() : null;

          var imgEl = plotContent.querySelector('img[alt="剧照"]');
          var image = null;
          if (imgEl) {
            var src = imgEl.getAttribute('src') || imgEl.getAttribute('data-src');
            if (src && !src.startsWith('http')) {
              image = 'https://prd.mocation.cc' + (src.startsWith('/') ? '' : '/') + src;
            } else {
              image = src;
            }
          }

          var plotTimeEl = li.querySelector('.plot-time');
          var plotTimeText = plotTimeEl ? plotTimeEl.textContent.trim() : '';
          var episodeMatch = plotTimeText.match(/E(\\d+)/);
          var episode = episodeMatch ? episodeMatch[1] : null;
          var position = plotTimeText.replace(/E\\d+\\s*/, '').trim() || null;

          if (placeName) {
            places.push({
              placeName: placeName,
              placeNameEn: placeNameEn,
              placeId: placeId,
              cityCountry: cityCountry,
              sceneDescription: sceneDescription,
              image: image,
              episode: episode,
              position: position
            });
          }
        });

        return {
          movieNameCn: movieNameCn,
          movieNameEn: movieNameEn,
          placeCount: placeCount,
          places: places
        };
      })()`);

      console.log(`✅ Found ${data.places.length} places in movie page\n`);

      return {
        movie: {
          movieId,
          movieNameCn: data.movieNameCn,
          movieNameEn: data.movieNameEn,
          placeCount: data.placeCount,
        },
        places: data.places
      };

    } catch (error: any) {
      console.error(`❌ Error scraping movie page: ${error.message}`);
      return null;
    } finally {
      await page.close();
    }
  }

  /**
   * Scrape place detail page to get coordinates, address, phone, category, etc.
   * This page has all the information we need!
   */
  async scrapePlaceDetail(placeId: string): Promise<Partial<PlaceDetail> | null> {
    if (!this.browser) throw new Error('Browser not initialized');

    const url = `${MOCATION_BASE_URL}/html/place_detail.html?id=${placeId}`;
    
    const page = await this.browser.newPage();
    
    try {
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      );

      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

      // Wait for Vue to render
      await page.waitForFunction(() => {
        const loading = document.getElementById('loading');
        if (loading && loading.style.display !== 'none') return false;
        const container = document.querySelector('.container');
        if (container && container.textContent?.includes('{{')) return false;
        return true;
      }, { timeout: 15000 }).catch(() => {});

      await this.sleep(1500);

      const data = await page.evaluate(`(function() {
        function getText(selector) {
          var el = document.querySelector(selector);
          var text = el ? el.textContent.trim() : null;
          if (text && text.includes('{{')) return null;
          return text || null;
        }

        // Get place name (Chinese and English)
        var cname = getText('.place-name .cname');
        var ename = getText('.place-name .ename');

        // Get location info (level0=country, level1=city, area=district)
        var locationText = getText('.place-location');
        var level0Cname = null;
        var level1Cname = null;
        var areaCname = null;
        
        if (locationText) {
          var parts = locationText.split('-').map(function(s) { return s.trim(); });
          if (parts.length >= 1) level0Cname = parts[0];
          if (parts.length >= 2) level1Cname = parts[1];
          if (parts.length >= 3) areaCname = parts[2];
        }

        // Get address
        var address = getText('.place-info .address');

        // Get category
        var categories = getText('.place-info .categories');

        // Get phone
        var phone = getText('.place-info .phone');

        // Get coordinates from map
        var latitude = null;
        var longitude = null;
        
        // Try to get from data attributes or script
        var mapEl = document.querySelector('#map');
        if (mapEl) {
          latitude = mapEl.getAttribute('data-lat');
          longitude = mapEl.getAttribute('data-lng');
        }

        // If not found, try to extract from page scripts
        if (!latitude || !longitude) {
          var scripts = document.querySelectorAll('script');
          for (var i = 0; i < scripts.length; i++) {
            var scriptText = scripts[i].textContent || '';
            var latMatch = scriptText.match(/latitude[:\\s]*([\\d.]+)/i);
            var lngMatch = scriptText.match(/longitude[:\\s]*([\\d.]+)/i);
            if (latMatch) latitude = latMatch[1];
            if (lngMatch) longitude = lngMatch[1];
            if (latitude && longitude) break;
          }
        }

        // Get scene images (实景图)
        var sceneImages = [];
        var realImgs = document.querySelectorAll('.real-list img, .scene-list img');
        realImgs.forEach(function(img) {
          var src = img.getAttribute('src') || img.getAttribute('data-src');
          if (src) {
            if (!src.startsWith('http')) {
              src = 'https://prd.mocation.cc' + (src.startsWith('/') ? '' : '/') + src;
            }
            sceneImages.push(src);
          }
        });

        return {
          cname: cname,
          ename: ename,
          level0Cname: level0Cname,
          level1Cname: level1Cname,
          areaCname: areaCname,
          address: address,
          categories: categories,
          phone: phone,
          latitude: latitude ? parseFloat(latitude) : null,
          longitude: longitude ? parseFloat(longitude) : null,
          sceneImages: sceneImages
        };
      })()`);

      return {
        nameEn: data.ename,
        nameZh: data.cname,
        country: data.level0Cname,
        city: data.level1Cname,
        address: data.address,
        phoneNumber: data.phone,
        category: data.categories,
        categoryEn: data.categories, // Will be translated later if needed
        latitude: data.latitude,
        longitude: data.longitude,
      };

    } catch (error: any) {
      console.warn(`   ⚠️  Error scraping place detail: ${error.message}`);
      return null;
    } finally {
      await page.close();
    }
  }

  /**
   * Scrape movie and all its places with enrichment
   */
  async scrapeMovieWithPlaces(movieId: string): Promise<EnhancedMovieData | null> {
    const movieData = await this.scrapeMoviePage(movieId);
    if (!movieData) return null;

    const { movie, places: moviePlaces } = movieData;
    const enrichedPlaces: PlaceDetail[] = [];

    console.log(`\n📍 Enriching ${moviePlaces.length} places...\n`);

    for (let i = 0; i < moviePlaces.length; i++) {
      const moviePlace = moviePlaces[i];
      
      console.log(`   🔍 ${i + 1}/${moviePlaces.length} ${moviePlace.placeName}`);

      let enrichedData: Partial<PlaceDetail> | null = null;

      // If we have place ID, scrape the place detail page
      if (moviePlace.placeId) {
        enrichedData = await this.scrapePlaceDetail(moviePlace.placeId);
        await this.sleep(1000); // Rate limiting
      }

      // Parse city/country from movie page as fallback
      const { city: movieCity, country: movieCountry } = this.parseCityCountry(moviePlace.cityCountry);

      const placeDetail: PlaceDetail = {
        name: enrichedData?.nameZh || moviePlace.placeName,
        nameEn: enrichedData?.nameEn || moviePlace.placeNameEn,
        nameZh: enrichedData?.nameZh || moviePlace.placeName,
        city: enrichedData?.city || movieCity,
        country: enrichedData?.country || movieCountry,
        latitude: enrichedData?.latitude || null,
        longitude: enrichedData?.longitude || null,
        address: enrichedData?.address || null,
        phoneNumber: enrichedData?.phoneNumber || null,
        category: enrichedData?.category || null,
        categoryEn: enrichedData?.categoryEn || null,
        website: null,
        coverImage: moviePlace.image, // Use movie page image as cover
        sceneImages: moviePlace.image ? [moviePlace.image] : [],
        sceneDescription: moviePlace.sceneDescription,
        episode: moviePlace.episode,
        position: moviePlace.position,
      };

      enrichedPlaces.push(placeDetail);

      console.log(`      ✅ ${enrichedData?.latitude ? '📍' : '⚠️ '} ${placeDetail.name}`);
    }

    return {
      movieId: movie.movieId,
      movieNameCn: movie.movieNameCn,
      movieNameEn: movie.movieNameEn,
      sourceUrl: `${MOCATION_BASE_URL}/html/movie_detail.html?id=${movieId}`,
      placeCount: enrichedPlaces.length,
      places: enrichedPlaces,
      scrapedAt: new Date().toISOString(),
    };
  }
}

// Main execution
async function main() {
  const movieId = process.argv[2] || '5448';
  const outputFile = process.argv[3] || `wanderlog_api/mocation-movie-${movieId}-enhanced.json`;

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         ENHANCED MOCATION MOVIE SCRAPER                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log(`📋 Movie ID: ${movieId}`);
  console.log(`📁 Output: ${outputFile}\n`);

  const scraper = new EnhancedMocationScraper();

  try {
    await scraper.init();
    const data = await scraper.scrapeMovieWithPlaces(movieId);

    if (data) {
      fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
      console.log(`\n✅ Data saved to: ${outputFile}`);
      console.log(`📊 Total places: ${data.places.length}`);
    } else {
      console.error('\n❌ Failed to scrape movie data');
    }

  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
  } finally {
    await scraper.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { EnhancedMocationScraper, EnhancedMovieData, PlaceDetail };
