/**
 * 一键导入电影地点并创建合集
 * 
 * 标准化流程：
 * 1. 从 mocation API 获取电影信息和地点列表
 * 2. 对每个地点调用 place API 获取完整信息（坐标、地址、电话等）
 * 3. 导入所有地点到数据库
 * 4. 自动创建合集并关联所有地点
 * 
 * Usage:
 *   npx tsx scripts/import-movie-full.ts --movie-id 5449
 *   npx tsx scripts/import-movie-full.ts --movie-id 5449 --dry-run
 *   npx tsx scripts/import-movie-full.ts --movie-id 5449 --upload-r2
 */

import axios from 'axios';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { MocationImageHandler } from '../src/services/mocationImageHandler';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const API_BASE_URL = 'https://prd.mocation.cc/api';
const REQUEST_DELAY = 1000;
const MAX_STILLS_PER_MOVIE = 10;

// ============================================================================
// Types
// ============================================================================

interface MocationMovieResponse {
  code: number;
  msg: string | null;
  data: {
    movie: {
      id: number;
      cname: string;
      ename: string;
      coverPath: string;
      year: number;
      plots?: Array<{ 
        placeId: number; 
        placeCname: string;
        placeEname: string;
        coverPath?: string | null;
      }>;
    } | null;
  };
}

interface MocationPlaceResponse {
  code: number;
  msg: string | null;
  data: {
    place: MocationPlace | null;
  };
}

interface MocationPlace {
  id: number;
  cname: string;
  ename: string;
  coverPath: string;
  lat: number;
  lng: number;
  caddress: string;
  eaddress: string;
  phone: string;
  areaCname: string;
  areaEname: string;
  level1Cname: string;
  level1Ename: string;
  categories: number[];
  realGraphics: Array<{ description: string; picPath: string }>;
  scenes: MocationScene[];
}

interface MocationScene {
  movieId: number;
  movieCname: string;
  movieEname: string;
  coverPath: string;
  year: number;
  details: MocationSceneDetail[];
}

interface MocationSceneDetail {
  stills: Array<{ picPath: string; cover: boolean }>;
  description: string;
}

// Category mapping
const MOCATION_CATEGORY_MAP: Record<number, { slug: string; en: string; zh: string }> = {
  0: { slug: 'landmark', en: 'Landmark', zh: '地标' },
  1: { slug: 'restaurant', en: 'Restaurant', zh: '餐厅' },
  2: { slug: 'cafe', en: 'Cafe', zh: '咖啡店' },
  3: { slug: 'bar', en: 'Bar', zh: '酒吧' },
  4: { slug: 'hotel', en: 'Hotel', zh: '酒店' },
  5: { slug: 'shop', en: 'Shop', zh: '商店' },
  6: { slug: 'museum', en: 'Museum', zh: '博物馆' },
  7: { slug: 'landmark', en: 'Landmark', zh: '地标' },
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
// API Functions
// ============================================================================

async function fetchMovieInfo(movieId: number): Promise<{
  movieNameCn: string;
  movieNameEn: string;
  coverImage: string;
  year: number;
  placeIds: number[];
  coverMap: Record<number, string | null>;
} | null> {
  try {
    const response = await axios.get<MocationMovieResponse>(`${API_BASE_URL}/movie/${movieId}`);
    if (response.data.code !== 0 || !response.data.data.movie) {
      return null;
    }
    
    const movie = response.data.data.movie;
    const coverMap: Record<number, string | null> = {};
    const placeIds: number[] = [];
    
    if (movie.plots) {
      for (const plot of movie.plots) {
        if (plot.placeId) {
          placeIds.push(plot.placeId);
          coverMap[plot.placeId] = plot.coverPath || null;
        }
      }
    }
    
    return {
      movieNameCn: movie.cname,
      movieNameEn: movie.ename,
      coverImage: movie.coverPath,
      year: movie.year,
      placeIds,
      coverMap,
    };
  } catch (error: any) {
    console.error(`❌ Error fetching movie: ${error.message}`);
    return null;
  }
}

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

function convertPlaceToDbFormat(place: MocationPlace, coverOverride?: string | null): Record<string, any> {
  // Always prefer ename (English/local name) over cname (Chinese name)
  // Only fall back to cname if ename is empty
  const primaryName = place.ename && place.ename.trim() ? place.ename : place.cname;
  
  const categoryId = place.categories?.[0];
  const category = categoryId !== undefined ? MOCATION_CATEGORY_MAP[categoryId] : null;
  
  // Build stills with movie info
  const stillsWithMovieInfo: Array<{
    url: string;
    movieId: string;
    movieNameCn: string;
    movieNameEn: string;
    year: number;
  }> = [];
  
  const movieRefs = place.scenes.map(scene => {
    const allStills: string[] = [];
    for (const detail of scene.details) {
      for (const still of detail.stills) {
        if (allStills.length >= MAX_STILLS_PER_MOVIE) break;
        allStills.push(still.picPath);
      }
      if (allStills.length >= MAX_STILLS_PER_MOVIE) break;
    }
    
    for (const stillUrl of allStills) {
      stillsWithMovieInfo.push({
        url: stillUrl,
        movieId: String(scene.movieId),
        movieNameCn: scene.movieCname,
        movieNameEn: scene.movieEname,
        year: scene.year,
      });
    }
    
    return {
      movieId: String(scene.movieId),
      movieNameCn: scene.movieCname,
      movieNameEn: scene.movieEname,
      year: scene.year,
      sceneDescription: scene.details[0]?.description || null,
      coverImage: scene.coverPath,
      stillCount: allStills.length,
      sourceUrl: `https://prd.mocation.cc/html/movie_detail.html?id=${scene.movieId}`,
    };
  });
  
  const realImages: string[] = place.realGraphics?.map(g => g.picPath) || [];
  
  // Build i18n object - always store Chinese name, and English name if different
  const i18n: Record<string, any> = { name_zh: place.cname };
  if (place.ename && place.ename !== place.cname) {
    i18n.name_en = place.ename;
  }
  
  return {
    name: primaryName,
    address: place.caddress || place.eaddress || null,
    phone_number: place.phone || null,
    cover_image: coverOverride || place.coverPath || null,
    images: realImages,
    city: place.areaEname || place.areaCname || null,
    country: place.level1Ename || place.level1Cname || null,
    latitude: place.lat || 0,
    longitude: place.lng || 0,
    source: 'mocation',
    source_detail: `place:${place.id}`,
    category_slug: category?.slug || null,
    category_en: category?.en || null,
    category_zh: category?.zh || null,
    tags: { others: ['Pilgrimage'] },
    i18n,
    custom_fields: {
      stills: stillsWithMovieInfo,
      movies: movieRefs,
      sourceUrl: `https://prd.mocation.cc/html/place_detail.html?id=${place.id}`,
      mocationCategories: place.categories,
    },
    is_verified: false,
  };
}

// ============================================================================
// Main Importer Class
// ============================================================================

class MovieFullImporter {
  private supabase: SupabaseClient;
  private imageHandler: MocationImageHandler | null;
  
  constructor(options?: { uploadToR2?: boolean }) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials');
    }
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.imageHandler = options?.uploadToR2 ? new MocationImageHandler({ uploadToR2: true }) : null;
  }
  
  private async processImageUrl(url: string | null): Promise<string | null> {
    if (!url || !this.imageHandler) return url;
    const result = await this.imageHandler.downloadAndUpload(url);
    return result.finalUrl || url;
  }
  
  private async processImageUrls(urls: string[]): Promise<string[]> {
    if (!this.imageHandler || urls.length === 0) return urls;
    const processed: string[] = [];
    for (const url of urls) {
      const finalUrl = await this.processImageUrl(url);
      if (finalUrl) processed.push(finalUrl);
    }
    return processed;
  }
  
  async importPlace(place: MocationPlace, coverOverride?: string | null): Promise<{ status: 'imported' | 'updated' | 'skipped' | 'error'; id?: string }> {
    try {
      const isEnglishName = place.ename && /^[\x00-\x7F\s]+$/.test(place.ename);
      const primaryName = isEnglishName ? place.ename : place.cname;
      const city = place.areaEname || place.areaCname || null;
      
      // Check if exists
      const { data: existing } = await this.supabase
        .from('places')
        .select('id, source')
        .eq('name', primaryName)
        .eq('city', city)
        .single();
      
      const dbData = convertPlaceToDbFormat(place, coverOverride);
      
      // Process images if R2 upload enabled
      if (this.imageHandler) {
        dbData.cover_image = await this.processImageUrl(dbData.cover_image);
        dbData.images = await this.processImageUrls(dbData.images);
        
        if (Array.isArray(dbData.custom_fields?.stills)) {
          for (const still of dbData.custom_fields.stills) {
            if (still.url) still.url = await this.processImageUrl(still.url);
          }
        }
      }
      
      if (existing) {
        // Update existing
        const { error } = await this.supabase
          .from('places')
          .update({
            ...dbData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        
        if (error) return { status: 'error' };
        return { status: 'updated', id: existing.id };
      }
      
      // Insert new
      const { data: newPlace, error } = await this.supabase
        .from('places')
        .insert(dbData)
        .select('id')
        .single();
      
      if (error || !newPlace) return { status: 'error' };
      return { status: 'imported', id: newPlace.id };
      
    } catch (error: any) {
      console.error(`❌ Import error: ${error.message}`);
      return { status: 'error' };
    }
  }
  
  async createCollection(movieInfo: {
    movieNameEn: string;
    movieNameCn: string;
    coverImage: string;
    year: number;
  }, placeIds: string[]): Promise<string | null> {
    try {
      // Process cover image
      let finalCoverImage = movieInfo.coverImage;
      if (this.imageHandler && movieInfo.coverImage) {
        finalCoverImage = await this.processImageUrl(movieInfo.coverImage) || movieInfo.coverImage;
      }
      
      // Check if collection exists
      const { data: existing } = await this.supabase
        .from('collections')
        .select('id')
        .eq('name', movieInfo.movieNameEn)
        .single();
      
      let collectionId: string;
      
      if (existing) {
        collectionId = existing.id;
        
        // Update collection
        await this.supabase
          .from('collections')
          .update({
            cover_image: finalCoverImage,
            description: null,
            source: 'mocation',
            is_published: true,
            published_at: new Date().toISOString(),
          })
          .eq('id', collectionId);
        
        // Delete existing spots
        await this.supabase
          .from('collection_spots')
          .delete()
          .eq('collection_id', collectionId);
        
      } else {
        // Create new collection
        const { data: newCollection, error } = await this.supabase
          .from('collections')
          .insert({
            name: movieInfo.movieNameEn,
            cover_image: finalCoverImage,
            description: null,
            source: 'mocation',
            is_published: true,
            published_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        
        if (error || !newCollection) {
          console.error('❌ Error creating collection');
          return null;
        }
        
        collectionId = newCollection.id;
      }
      
      // Get place cities for collection_spots
      const { data: places } = await this.supabase
        .from('places')
        .select('id, city')
        .in('id', placeIds);
      
      const placeMap = new Map(places?.map(p => [p.id, p.city]) || []);
      
      // Add spots to collection
      const collectionSpots = placeIds.map((placeId, index) => ({
        collection_id: collectionId,
        place_id: placeId,
        city: placeMap.get(placeId) || null,
        sort_order: index,
      }));
      
      await this.supabase
        .from('collection_spots')
        .insert(collectionSpots);
      
      return collectionId;
      
    } catch (error: any) {
      console.error(`❌ Collection error: ${error.message}`);
      return null;
    }
  }
  
  async run(movieId: number, dryRun: boolean = false): Promise<void> {
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    MOVIE FULL IMPORT                                          ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
    
    // Step 1: Fetch movie info
    console.log(`📥 Step 1: Fetching movie ${movieId} info...`);
    const movieInfo = await fetchMovieInfo(movieId);
    
    if (!movieInfo) {
      console.error('❌ Failed to fetch movie info');
      return;
    }
    
    console.log(`   📽️  Movie: ${movieInfo.movieNameEn} (${movieInfo.movieNameCn})`);
    console.log(`   📅 Year: ${movieInfo.year}`);
    console.log(`   🖼️  Cover: ${movieInfo.coverImage ? 'Yes' : 'No'}`);
    console.log(`   📍 Places: ${movieInfo.placeIds.length}`);
    
    if (dryRun) {
      console.log('\n🔍 DRY RUN MODE - Fetching place details...\n');
      
      let hasCoords = 0, hasAddress = 0, hasPhone = 0;
      
      for (let i = 0; i < movieInfo.placeIds.length; i++) {
        const placeId = movieInfo.placeIds[i];
        console.log(`   [${i + 1}/${movieInfo.placeIds.length}] Fetching place ${placeId}...`);
        
        const place = await fetchPlace(placeId);
        if (place) {
          const hasCoord = place.lat && place.lng && place.lat !== 0 && place.lng !== 0;
          const hasAddr = !!place.caddress || !!place.eaddress;
          const hasPh = !!place.phone;
          
          if (hasCoord) hasCoords++;
          if (hasAddr) hasAddress++;
          if (hasPh) hasPhone++;
          
          console.log(`      ✅ ${place.ename || place.cname}`);
          console.log(`         City: ${place.areaEname} | Country: ${place.level1Ename}`);
          console.log(`         Coords: ${hasCoord ? `${place.lat}, ${place.lng}` : '❌ Missing'}`);
          console.log(`         Address: ${hasAddr ? (place.eaddress || place.caddress).substring(0, 50) : '❌ Missing'}`);
          console.log(`         Phone: ${hasPh ? place.phone : '❌ Missing'}`);
        } else {
          console.log(`      ❌ Not found`);
        }
        
        await new Promise(r => setTimeout(r, REQUEST_DELAY));
      }
      
      console.log('\n📊 Data Quality Summary:');
      console.log(`   Places with coordinates: ${hasCoords}/${movieInfo.placeIds.length}`);
      console.log(`   Places with address: ${hasAddress}/${movieInfo.placeIds.length}`);
      console.log(`   Places with phone: ${hasPhone}/${movieInfo.placeIds.length}`);
      
      return;
    }
    
    // Step 2: Import all places
    console.log(`\n📥 Step 2: Importing ${movieInfo.placeIds.length} places...`);
    
    const importedPlaceIds: string[] = [];
    let imported = 0, updated = 0, failed = 0;
    
    for (let i = 0; i < movieInfo.placeIds.length; i++) {
      const placeId = movieInfo.placeIds[i];
      console.log(`   [${i + 1}/${movieInfo.placeIds.length}] Fetching place ${placeId}...`);
      
      const place = await fetchPlace(placeId);
      if (!place) {
        console.log(`      ❌ Not found`);
        failed++;
        continue;
      }
      
      const coverOverride = movieInfo.coverMap[placeId];
      const result = await this.importPlace(place, coverOverride);
      
      if (result.id) importedPlaceIds.push(result.id);
      
      switch (result.status) {
        case 'imported':
          imported++;
          console.log(`      ✅ Imported: ${place.ename || place.cname}`);
          break;
        case 'updated':
          updated++;
          console.log(`      🔄 Updated: ${place.ename || place.cname}`);
          break;
        case 'error':
          failed++;
          console.log(`      ❌ Error: ${place.ename || place.cname}`);
          break;
      }
      
      await new Promise(r => setTimeout(r, REQUEST_DELAY));
    }
    
    console.log(`\n   📊 Import Summary: ${imported} imported, ${updated} updated, ${failed} failed`);
    
    // Step 3: Create collection
    console.log(`\n📦 Step 3: Creating collection...`);
    
    const collectionId = await this.createCollection(movieInfo, importedPlaceIds);
    
    if (collectionId) {
      console.log(`   ✅ Collection created: ${movieInfo.movieNameEn}`);
      console.log(`   📍 Places linked: ${importedPlaceIds.length}`);
      console.log(`   🆔 ID: ${collectionId}`);
    } else {
      console.log(`   ❌ Failed to create collection`);
    }
    
    // Final summary
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                           IMPORT COMPLETE                                     ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
    
    console.log('📊 Final Summary:');
    console.log(`   Movie: ${movieInfo.movieNameEn}`);
    console.log(`   Places: ${imported} imported, ${updated} updated, ${failed} failed`);
    console.log(`   Collection: ${collectionId ? '✅ Created' : '❌ Failed'}`);
    console.log(`   Collection ID: ${collectionId || 'N/A'}`);
    console.log('');
  }
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  let movieId: number | null = null;
  let dryRun = false;
  let uploadR2 = false;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--movie-id' && args[i + 1]) {
      movieId = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--upload-r2') {
      uploadR2 = true;
    }
  }
  
  if (!movieId) {
    console.log(`
Usage: npx tsx scripts/import-movie-full.ts --movie-id <id> [options]

Options:
  --movie-id <id>   Movie ID from mocation.cc (required)
  --dry-run         Only fetch and display data, don't import
  --upload-r2       Upload images to Cloudflare R2

Examples:
  npx tsx scripts/import-movie-full.ts --movie-id 5449 --dry-run
  npx tsx scripts/import-movie-full.ts --movie-id 5449 --upload-r2
`);
    process.exit(1);
  }
  
  const importer = new MovieFullImporter({ uploadToR2: uploadR2 });
  await importer.run(movieId, dryRun);
}

main().catch(console.error);
