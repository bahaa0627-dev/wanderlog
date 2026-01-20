/**
 * Mocation Movie Scraper using API
 * 
 * Uses the mocation API directly instead of scraping HTML
 * Much faster and more reliable!
 */

import axios from 'axios';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const MOCATION_API_BASE = 'https://prd.mocation.cc/api';

interface PlaceDetail {
  placeId: number;
  name: string;
  nameEn: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  address: string | null;
  phoneNumber: string | null;
  category: string | null;
  categoryEn: string | null;
  website: string | null;
  coverImage: string;
  sceneImages: string[];
  sceneDescription: string;
  episode: number;
  position: number;
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

async function scrapeMovieAPI(movieId: string): Promise<EnhancedMovieData | null> {
  try {
    console.log(`📥 Fetching movie data from API...`);
    
    const response = await axios.get(`${MOCATION_API_BASE}/movie/${movieId}`);
    const data = response.data.data;
    
    if (!data || !data.movie) {
      console.error('❌ No movie data found');
      return null;
    }

    const movie = data.movie;
    const plots = movie.plots || [];

    console.log(`✅ Found ${plots.length} places\n`);

    // Country name mapping (Chinese to English)
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
      '澳大利亚': 'Australia',
      '加拿大': 'Canada',
      '瑞士': 'Switzerland',
      '奥地利': 'Austria',
      '荷兰': 'Netherlands',
      '比利时': 'Belgium',
      '希腊': 'Greece',
      '土耳其': 'Turkey',
      '印度': 'India',
      '新西兰': 'New Zealand',
    };

    const places: PlaceDetail[] = plots.map((plot: any, index: number) => {
      console.log(`   ${index + 1}/${plots.length} ${plot.placeCname}`);
      
      const countryZh = plot.upLevelAreaCname;
      const countryEn = countryMap[countryZh] || countryZh; // Fallback to original if not in map

      return {
        placeId: plot.placeId,
        name: plot.placeCname,
        nameEn: plot.placeEname,
        city: plot.areaCname,
        country: countryEn, // Use English country name
        latitude: plot.lat,
        longitude: plot.lng,
        address: null, // Not provided in movie API, would need place detail API
        phoneNumber: null,
        category: null,
        categoryEn: null,
        website: null,
        coverImage: plot.coverPath,
        sceneImages: [plot.coverPath],
        sceneDescription: plot.sceneName,
        episode: plot.episode,
        position: plot.position,
      };
    });

    return {
      movieId: movieId,
      movieNameCn: movie.cname,
      movieNameEn: movie.ename,
      sourceUrl: `https://prd.mocation.cc/html/movie_detail.html?id=${movieId}`,
      placeCount: places.length,
      places,
      scrapedAt: new Date().toISOString(),
    };

  } catch (error: any) {
    console.error(`❌ Error fetching movie data: ${error.message}`);
    return null;
  }
}

async function main() {
  const movieId = process.argv[2] || '5448';
  const outputFile = process.argv[3] || `wanderlog_api/mocation-movie-${movieId}-api.json`;

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         MOCATION MOVIE SCRAPER (API)                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log(`📋 Movie ID: ${movieId}`);
  console.log(`📁 Output: ${outputFile}\n`);

  const data = await scrapeMovieAPI(movieId);

  if (data) {
    fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
    console.log(`\n✅ Data saved to: ${outputFile}`);
    console.log(`📊 Total places: ${data.places.length}`);
    console.log(`\n📍 Sample place:`);
    console.log(`   Name: ${data.places[0].name} (${data.places[0].nameEn})`);
    console.log(`   City: ${data.places[0].city}, ${data.places[0].country}`);
    console.log(`   Coordinates: ${data.places[0].latitude}, ${data.places[0].longitude}`);
  } else {
    console.error('\n❌ Failed to scrape movie data');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { scrapeMovieAPI, EnhancedMovieData, PlaceDetail };
