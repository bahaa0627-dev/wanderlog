/**
 * Create a collection from a mocation movie
 * 
 * Usage:
 *   npx tsx scripts/create-movie-collection.ts --movie-id 5448
 *   npx tsx scripts/create-movie-collection.ts --movie-id 5448 --publish
 */

import axios from 'axios';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { MocationImageHandler } from '../src/services/mocationImageHandler';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const API_BASE_URL = 'https://prd.mocation.cc/api';

interface MocationMovieResponse {
  code: number;
  msg: string | null;
  data: {
    movie: {
      id: number;
      cname: string;
      ename: string;
      coverPath: string;  // 电影封面图
      plots?: Array<{ 
        placeId: number; 
        placeCname: string;
        placeEname: string;
        coverPath?: string | null;
      }>;
    } | null;
  };
}

async function fetchMovieInfo(movieId: number): Promise<{
  movieNameCn: string;
  movieNameEn: string;
  coverImage: string;
  placeIds: number[];
} | null> {
  try {
    const response = await axios.get<MocationMovieResponse>(`${API_BASE_URL}/movie/${movieId}`);
    if (response.data.code !== 0 || !response.data.data.movie) {
      console.error(`❌ Movie ${movieId} not found`);
      return null;
    }
    
    const movie = response.data.data.movie;
    const placeIds = movie.plots?.map(p => p.placeId).filter(Boolean) || [];
    
    return {
      movieNameCn: movie.cname,
      movieNameEn: movie.ename,
      coverImage: movie.coverPath,
      placeIds,
    };
  } catch (error: any) {
    console.error(`❌ Error fetching movie: ${error.message}`);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  let movieId: number | null = null;
  let shouldPublish = false;
  let uploadR2 = false;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--movie-id' && args[i + 1]) {
      movieId = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--publish') {
      shouldPublish = true;
    } else if (args[i] === '--upload-r2') {
      uploadR2 = true;
    }
  }
  
  if (!movieId) {
    console.log('Usage: npx tsx scripts/create-movie-collection.ts --movie-id <id> [--publish] [--upload-r2]');
    process.exit(1);
  }
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  const imageHandler = uploadR2 ? new MocationImageHandler({ uploadToR2: true }) : null;
  
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                   CREATE MOVIE COLLECTION                                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  
  // 1. Fetch movie info
  console.log(`📥 Fetching movie ${movieId} info...`);
  const movieInfo = await fetchMovieInfo(movieId);
  
  if (!movieInfo) {
    process.exit(1);
  }
  
  console.log(`   📽️  Movie: ${movieInfo.movieNameEn} (${movieInfo.movieNameCn})`);
  console.log(`   🖼️  Cover: ${movieInfo.coverImage ? 'Yes' : 'No'}`);
  console.log(`   📍 Places: ${movieInfo.placeIds.length}`);
  
  // 2. Process cover image if needed
  let finalCoverImage = movieInfo.coverImage;
  if (imageHandler && movieInfo.coverImage) {
    console.log(`\n📷 Uploading cover image to R2...`);
    const result = await imageHandler.downloadAndUpload(movieInfo.coverImage);
    finalCoverImage = result.finalUrl || movieInfo.coverImage;
    console.log(`   ✅ Cover uploaded`);
  }
  
  // 3. Find existing places by source_detail
  console.log(`\n🔍 Finding places in database...`);
  
  const sourceDetails = movieInfo.placeIds.map(id => `place:${id}`);
  
  const { data: places, error: placesError } = await supabase
    .from('places')
    .select('id, name, city, source_detail')
    .in('source_detail', sourceDetails);
  
  if (placesError) {
    console.error(`❌ Error finding places: ${placesError.message}`);
    process.exit(1);
  }
  
  console.log(`   Found ${places?.length || 0} places in database`);
  
  if (!places || places.length === 0) {
    console.error('❌ No places found. Run import-mocation-api.ts first.');
    process.exit(1);
  }
  
  // 4. Check if collection already exists
  const { data: existingCollection } = await supabase
    .from('collections')
    .select('id, name')
    .eq('name', movieInfo.movieNameEn)
    .single();
  
  let collectionId: string;
  
  if (existingCollection) {
    console.log(`\n⚠️  Collection "${movieInfo.movieNameEn}" already exists, updating...`);
    collectionId = existingCollection.id;
    
    // Update collection
    const { error: updateError } = await supabase
      .from('collections')
      .update({
        cover_image: finalCoverImage,
        description: null, // No description by default
        source: 'mocation',
        is_published: shouldPublish,
        published_at: shouldPublish ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', collectionId);
    
    if (updateError) {
      console.error(`❌ Error updating collection: ${updateError.message}`);
      process.exit(1);
    }
    
    // Delete existing spots
    await supabase
      .from('collection_spots')
      .delete()
      .eq('collection_id', collectionId);
    
  } else {
    // 5. Create collection
    console.log(`\n📦 Creating collection "${movieInfo.movieNameEn}"...`);
    
    const { data: newCollection, error: createError } = await supabase
      .from('collections')
      .insert({
        name: movieInfo.movieNameEn,
        cover_image: finalCoverImage,
        description: null, // No description by default
        source: 'mocation',
        is_published: shouldPublish,
        published_at: shouldPublish ? new Date().toISOString() : null,
      })
      .select('id')
      .single();
    
    if (createError || !newCollection) {
      console.error(`❌ Error creating collection: ${createError?.message}`);
      process.exit(1);
    }
    
    collectionId = newCollection.id;
    console.log(`   ✅ Collection created: ${collectionId}`);
  }
  
  // 6. Add places to collection
  console.log(`\n🔗 Adding ${places.length} places to collection...`);
  
  const collectionSpots = places.map((place, index) => ({
    collection_id: collectionId,
    place_id: place.id,
    city: place.city,
    sort_order: index,
  }));
  
  const { error: spotsError } = await supabase
    .from('collection_spots')
    .insert(collectionSpots);
  
  if (spotsError) {
    console.error(`❌ Error adding spots: ${spotsError.message}`);
    process.exit(1);
  }
  
  console.log(`   ✅ Added ${places.length} places to collection`);
  
  // 7. Summary
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                        COLLECTION CREATED                                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  
  console.log('📊 Summary:');
  console.log(`   Collection: ${movieInfo.movieNameEn}`);
  console.log(`   Cover:      ${finalCoverImage ? '✅' : '❌'}`);
  console.log(`   Places:     ${places.length}`);
  console.log(`   Published:  ${shouldPublish ? '✅' : '❌'}`);
  console.log(`   ID:         ${collectionId}`);
  console.log('');
}

main().catch(console.error);
