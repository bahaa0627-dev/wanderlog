/**
 * Mocation API Importer
 * 
 * Imports place data directly from mocation.cc API instead of scraping HTML.
 * The API provides richer data including lat/lng coordinates.
 * 
 * Usage:
 *   npx ts-node --transpile-only scripts/import-mocation-api.ts --type place --start 17103 --end 17103
 *   npx ts-node --transpile-only scripts/import-mocation-api.ts --type place --ids 17103,17104,17105
 */

import axios from 'axios';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const API_BASE_URL = 'https://prd.mocation.cc/api';
const MAX_STILLS_PER_MOVIE = 10;
const REQUEST_DELAY = 1000; // 1 second between requests

// Mocation category ID to our category mapping
const MOCATION_CATEGORY_MAP: Record<number, { slug: string; en: string; zh: string }> = {
  0: { slug: 'landmark', en: 'Landmark', zh: '地标' },
  1: { slug: 'restaurant', en: 'Restaurant', zh: '餐厅' },
  2: { slug: 'cafe', en: 'Cafe', zh: '咖啡店' },
  3: { slug: 'bar', en: 'Bar', zh: '酒吧' },
  4: { slug: 'hotel', en: 'Hotel', zh: '酒店' },
  5: { slug: 'shop', en: 'Shop', zh: '商店' },
  6: { slug: 'museum', en: 'Museum', zh: '博物馆' },
  7: { slug: 'landmark', en: 'Landmark', zh: '地标' }, // 观景台
  8: { slug: 'temple', en: 'Temple', zh: '寺庙' },
  9: { slug: 'church', en: 'Church', zh: '教堂' },
  10: { slug: 'theater', en: 'Theater', zh: '剧院' },
  11: { slug: 'park', en: 'Park', zh: '公园' },
  12: { slug: 'beach', en: 'Beach', zh: '海滩' },
  13: { slug: 'station', en: 'Station', zh: '车站' },
  14: { slug: 'airport', en: 'Airport', zh: '机场' },
  15: { slug: 'school', en: 'School', zh: '学校' },
  16: { slug: 'hospital', en: 'Hospital', zh: '医院' },
  17: { slug: 'other', en: 'Other', zh: '其他' },
};

// ============================================================================
// Types
// ============================================================================

interface MocationPlaceResponse {
  code: number;
  msg: string | null;
  data: {
    place: MocationPlace | null;
    favoriteId: string | null;
    imgInfos: any[];
  };
}

interface MocationPlace {
  id: number;
  cname: string;
  ename: string;
  oname: string | null;
  coverPath: string;
  lat: number;
  lng: number;
  caddress: string;
  eaddress: string;
  phone: string;
  areaCname: string;
  areaEname: string;
  level1Cname: string; // Country Chinese
  level1Ename: string; // Country English
  categories: number[]; // Category IDs
  realGraphics: Array<{ description: string; picPath: string }>;
  scenes: MocationScene[];
}

interface MocationScene {
  movieId: number;
  movieCname: string;
  movieEname: string;
  coverPath: string;
  year: number;
  countryCname: string;
  countryEname: string;
  placeId: number;
  sceneId: number;
  details: MocationSceneDetail[];
}

interface MocationSceneDetail {
  id: number;
  sceneId: number;
  episode: number;
  position: number;
  description: string;
  tips: string;
  lat: number;
  lng: number;
  persons: Array<{ cname: string; ename: string }>;
  stills: Array<{ picPath: string; cover: boolean }>;
}

interface MovieReference {
  movieId: string;
  movieNameCn: string | null;
  movieNameEn: string | null;
  sceneDescription: string | null;
  image: string | null;
  sourceUrl: string;
  stills: string[];
}

interface ImportResult {
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

// ============================================================================
// API Client
// ============================================================================

async function fetchPlace(placeId: number): Promise<MocationPlace | null> {
  try {
    const response = await axios.get<MocationPlaceResponse>(`${API_BASE_URL}/place/${placeId}`);
    if (response.data.code === 0 && response.data.data.place) {
      return response.data.data.place;
    }
    return null;
  } catch (error: any) {
    console.error(`❌ Error fetching place ${placeId}: ${error.message}`);
    return null;
  }
}

// ============================================================================
// Data Conversion
// ============================================================================

function getPilgrimageTag() {
  return {
    kind: 'facet',
    id: 'Pilgrimage',
    en: 'Pilgrimage',
    zh: '圣地巡礼',
    priority: 85,
  };
}

function convertPlaceToDbFormat(place: MocationPlace): Record<string, any> {
  // Determine if ename is actually English (contains only ASCII) or Japanese
  const isEnglishName = place.ename && /^[\x00-\x7F\s]+$/.test(place.ename);
  
  // Use English name if available, otherwise use Chinese name
  // If ename is Japanese (not ASCII), prefer cname as it's more readable
  const primaryName = isEnglishName ? place.ename : place.cname;
  
  // Get category from first category ID
  const categoryId = place.categories?.[0];
  const category = categoryId !== undefined ? MOCATION_CATEGORY_MAP[categoryId] : null;
  
  // Convert scenes to movie references with stills grouped by movie
  const movieRefs = place.scenes.map(scene => {
    // Collect all stills from all details (max 10 per movie)
    const allStills: string[] = [];
    for (const detail of scene.details) {
      for (const still of detail.stills) {
        if (allStills.length >= MAX_STILLS_PER_MOVIE) break;
        allStills.push(still.picPath);
      }
      if (allStills.length >= MAX_STILLS_PER_MOVIE) break;
    }
    
    // Get first scene description
    const firstDetail = scene.details[0];
    
    return {
      movieId: String(scene.movieId),
      movieNameCn: scene.movieCname,
      movieNameEn: scene.movieEname,
      year: scene.year,
      sceneDescription: firstDetail?.description || null,
      coverImage: scene.coverPath, // Movie cover
      stills: allStills, // Stills for this movie at this place
      sourceUrl: `https://prd.mocation.cc/html/movie_detail.html?id=${scene.movieId}`,
    };
  });
  
  // Real graphics (实景图) go into images array
  const realImages: string[] = place.realGraphics?.map(g => g.picPath) || [];
  
  // Build stills array for customFields.stills (flat array with movie info)
  // Format: { url, movieId, movieNameCn, movieNameEn }
  const stillsWithMovieInfo: Array<{
    url: string;
    movieId: string;
    movieNameCn: string;
    movieNameEn: string;
    year: number;
  }> = [];
  
  for (const movie of movieRefs) {
    for (const stillUrl of movie.stills) {
      stillsWithMovieInfo.push({
        url: stillUrl,
        movieId: movie.movieId,
        movieNameCn: movie.movieNameCn,
        movieNameEn: movie.movieNameEn,
        year: movie.year,
      });
    }
  }
  
  // Build i18n object for multilingual support
  const i18n: Record<string, any> = {
    name_zh: place.cname,
  };
  if (isEnglishName && place.ename) {
    i18n.name_en = place.ename;
  }
  // If ename is Japanese, store it separately
  if (!isEnglishName && place.ename && place.ename !== place.cname) {
    i18n.name_ja = place.ename;
  }
  
  return {
    name: primaryName,
    address: place.caddress || place.eaddress || null,
    phone_number: place.phone || null,
    cover_image: place.coverPath || null, // 封面图
    images: realImages, // 实景图 only
    city: place.areaEname || place.areaCname || null, // Use English city name (Tokyo)
    country: place.level1Ename || place.level1Cname || null, // Use English country name (Japan)
    latitude: place.lat || 0,
    longitude: place.lng || 0,
    source: 'mocation',
    source_detail: `place:${place.id}`,
    // Category fields
    category_slug: category?.slug || null,
    category_en: category?.en || null,
    category_zh: category?.zh || null,
    ai_tags: [getPilgrimageTag()],
    i18n: i18n,
    custom_fields: {
      // Stills with movie info for admin panel display (剧照按电影分组)
      stills: stillsWithMovieInfo,
      // Movies metadata
      movies: movieRefs.map(m => ({
        movieId: m.movieId,
        movieNameCn: m.movieNameCn,
        movieNameEn: m.movieNameEn,
        year: m.year,
        sceneDescription: m.sceneDescription,
        coverImage: m.coverImage,
        sourceUrl: m.sourceUrl,
        stillCount: m.stills.length,
      })),
      sourceUrl: `https://prd.mocation.cc/html/place_detail.html?id=${place.id}`,
      mocationCategories: place.categories, // Keep original category IDs
    },
    is_verified: false,
  };
}

// ============================================================================
// Database Operations
// ============================================================================

class MocationApiImporter {
  private supabase: SupabaseClient;
  
  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials');
    }
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }
  
  async findExistingPlace(name: string, nameZh: string | null, city: string | null): Promise<{
    id: string;
    custom_fields: any;
    images: string[];
  } | null> {
    // Search by name (primary) - also check i18n for Chinese name
    let query = this.supabase
      .from('places')
      .select('id, custom_fields, images, i18n')
      .eq('name', name);
    
    if (city) {
      query = query.eq('city', city);
    }
    
    const { data, error } = await query.limit(1);
    
    if (error) {
      console.warn(`⚠️  Error finding place: ${error.message}`);
      return null;
    }
    
    if (data && data.length > 0) {
      return {
        id: data[0].id,
        custom_fields: data[0].custom_fields,
        images: data[0].images || [],
      };
    }
    
    // Also try searching by Chinese name if provided
    if (nameZh && nameZh !== name) {
      const { data: dataZh, error: errorZh } = await this.supabase
        .from('places')
        .select('id, custom_fields, images, i18n')
        .eq('name', nameZh)
        .limit(1);
      
      if (!errorZh && dataZh && dataZh.length > 0) {
        return {
          id: dataZh[0].id,
          custom_fields: dataZh[0].custom_fields,
          images: dataZh[0].images || [],
        };
      }
    }
    
    return null;
  }
  
  async importPlace(place: MocationPlace): Promise<'imported' | 'updated' | 'skipped' | 'error'> {
    try {
      // Determine primary name (same logic as convertPlaceToDbFormat)
      const isEnglishName = place.ename && /^[\x00-\x7F\s]+$/.test(place.ename);
      const primaryName = isEnglishName ? place.ename : place.cname;
      const city = place.areaEname || place.areaCname || null;
      
      // Check if place exists
      const existing = await this.findExistingPlace(primaryName, place.cname, city);
      
      if (existing) {
        // Update existing place with new movie references
        const dbData = convertPlaceToDbFormat(place);
        const existingMovies = existing.custom_fields?.movies || [];
        const existingStills = existing.custom_fields?.stills || [];
        const newMovies = dbData.custom_fields.movies;
        const newStills = dbData.custom_fields.stills;
        
        // Merge movies (avoid duplicates by movieId)
        const existingMovieIds = new Set(existingMovies.map((m: any) => m.movieId));
        const moviesToAdd = newMovies.filter((m: any) => !existingMovieIds.has(m.movieId));
        
        if (moviesToAdd.length === 0) {
          return 'skipped';
        }
        
        const mergedMovies = [...existingMovies, ...moviesToAdd];
        
        // Merge stills (avoid duplicates by url)
        const existingStillUrls = new Set(existingStills.map((s: any) => s.url || s));
        const stillsToAdd = newStills.filter((s: any) => !existingStillUrls.has(s.url));
        const mergedStills = [...existingStills, ...stillsToAdd];
        
        // Merge real images (avoid duplicates)
        const existingImages = existing.images || [];
        const mergedImages = [...new Set([...existingImages, ...dbData.images])];
        
        const { error } = await this.supabase
          .from('places')
          .update({
            custom_fields: {
              ...existing.custom_fields,
              movies: mergedMovies,
              stills: mergedStills,
            },
            images: mergedImages,
            ai_tags: [getPilgrimageTag()],
            // Update category if not set
            category_slug: existing.custom_fields?.category_slug || dbData.category_slug,
            category_en: existing.custom_fields?.category_en || dbData.category_en,
            category_zh: existing.custom_fields?.category_zh || dbData.category_zh,
          })
          .eq('id', existing.id);
        
        if (error) {
          console.error(`❌ Update error: ${error.message}`);
          return 'error';
        }
        
        return 'updated';
      }
      
      // Insert new place
      const dbData = convertPlaceToDbFormat(place);
      
      const { error } = await this.supabase
        .from('places')
        .insert(dbData);
      
      if (error) {
        console.error(`❌ Insert error: ${error.message}`);
        return 'error';
      }
      
      return 'imported';
    } catch (error: any) {
      console.error(`❌ Import error: ${error.message}`);
      return 'error';
    }
  }
  
  async importPlaces(placeIds: number[]): Promise<ImportResult> {
    const result: ImportResult = {
      total: placeIds.length,
      imported: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };
    
    console.log(`\n📥 Importing ${placeIds.length} places from Mocation API...\n`);
    
    for (let i = 0; i < placeIds.length; i++) {
      const placeId = placeIds[i];
      console.log(`   [${i + 1}/${placeIds.length}] Fetching place ${placeId}...`);
      
      const place = await fetchPlace(placeId);
      
      if (!place) {
        result.failed++;
        result.errors.push({ id: String(placeId), error: 'Place not found' });
        console.log(`   ❌ Place ${placeId} not found`);
        continue;
      }
      
      const status = await this.importPlace(place);
      
      switch (status) {
        case 'imported':
          result.imported++;
          console.log(`   ✅ Imported: ${place.ename || place.cname}`);
          break;
        case 'updated':
          result.updated++;
          console.log(`   🔄 Updated: ${place.ename || place.cname}`);
          break;
        case 'skipped':
          result.skipped++;
          console.log(`   ⏭️  Skipped: ${place.ename || place.cname} (already exists)`);
          break;
        case 'error':
          result.failed++;
          result.errors.push({ id: String(placeId), error: 'Import failed' });
          break;
      }
      
      // Delay between requests
      if (i < placeIds.length - 1) {
        await new Promise(r => setTimeout(r, REQUEST_DELAY));
      }
    }
    
    return result;
  }
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs(args: string[]): { ids?: number[]; start?: number; end?: number; dryRun: boolean } {
  const options: { ids?: number[]; start?: number; end?: number; dryRun: boolean } = { dryRun: false };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--ids':
        options.ids = args[++i].split(',').map(id => parseInt(id.trim(), 10));
        break;
      case '--start':
        options.start = parseInt(args[++i], 10);
        break;
      case '--end':
        options.end = parseInt(args[++i], 10);
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
    }
  }
  
  return options;
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);
  
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                     MOCATION API IMPORTER                                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  
  let placeIds: number[] = [];
  
  if (options.ids) {
    placeIds = options.ids;
  } else if (options.start !== undefined && options.end !== undefined) {
    for (let i = options.start; i <= options.end; i++) {
      placeIds.push(i);
    }
  } else {
    console.log('Usage:');
    console.log('  npx ts-node --transpile-only scripts/import-mocation-api.ts --ids 17103,17104,17105');
    console.log('  npx ts-node --transpile-only scripts/import-mocation-api.ts --start 17103 --end 17110');
    console.log('  npx ts-node --transpile-only scripts/import-mocation-api.ts --ids 17103 --dry-run');
    process.exit(1);
  }
  
  console.log(`📋 Configuration:`);
  console.log(`   Place IDs: ${placeIds.length} places`);
  console.log(`   Mode: ${options.dryRun ? 'DRY RUN' : 'IMPORT'}`);
  
  if (options.dryRun) {
    console.log('\n🔍 Dry run - fetching data without importing...\n');
    
    for (const placeId of placeIds) {
      const place = await fetchPlace(placeId);
      if (place) {
        const isEnglishName = place.ename && /^[\x00-\x7F\s]+$/.test(place.ename);
        const primaryName = isEnglishName ? place.ename : place.cname;
        const categoryId = place.categories?.[0];
        const category = categoryId !== undefined ? MOCATION_CATEGORY_MAP[categoryId] : null;
        
        console.log(`\n📍 Place ${placeId}:`);
        console.log(`   Name: ${primaryName}`);
        console.log(`   Name (CN): ${place.cname}`);
        if (place.ename && place.ename !== place.cname) {
          console.log(`   Name (${isEnglishName ? 'EN' : 'JA'}): ${place.ename}`);
        }
        console.log(`   Category: ${category?.en || 'Unknown'} (${category?.zh || '未知'})`);
        console.log(`   Address: ${place.caddress}`);
        console.log(`   Phone: ${place.phone || 'N/A'}`);
        console.log(`   City: ${place.areaEname} (${place.areaCname})`);
        console.log(`   Country: ${place.level1Ename} (${place.level1Cname})`);
        console.log(`   Lat/Lng: ${place.lat}, ${place.lng}`);
        console.log(`   Cover Image: ${place.coverPath ? 'Yes' : 'No'}`);
        console.log(`   Real Images: ${place.realGraphics?.length || 0}`);
        console.log(`   Movies: ${place.scenes.length}`);
        let totalStills = 0;
        for (const scene of place.scenes) {
          const stillCount = Math.min(
            scene.details.reduce((sum, d) => sum + d.stills.length, 0),
            MAX_STILLS_PER_MOVIE
          );
          totalStills += stillCount;
          console.log(`     - ${scene.movieCname} (${scene.movieEname}) [${scene.year}] - ${stillCount} stills`);
        }
        console.log(`   Total Stills: ${totalStills}`);
      } else {
        console.log(`\n❌ Place ${placeId} not found`);
      }
      
      await new Promise(r => setTimeout(r, REQUEST_DELAY));
    }
    
    return;
  }
  
  const importer = new MocationApiImporter();
  const result = await importer.importPlaces(placeIds);
  
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           IMPORT COMPLETE                                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  
  console.log('📊 Import Summary:');
  console.log(`   Total:    ${result.total}`);
  console.log(`   Imported: ${result.imported}`);
  console.log(`   Updated:  ${result.updated}`);
  console.log(`   Skipped:  ${result.skipped}`);
  console.log(`   Failed:   ${result.failed}`);
  
  if (result.errors.length > 0) {
    console.log('\n⚠️  Errors:');
    for (const err of result.errors) {
      console.log(`   - ID ${err.id}: ${err.error}`);
    }
  }
}

main().catch(console.error);
