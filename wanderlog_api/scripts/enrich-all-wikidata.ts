/**
 * Enrich All Wikidata Places (OSM + Wikipedia + Ratings)
 *
 * Usage:
 *   npx tsx scripts/enrich-all-wikidata.ts [options]
 *
 * Options:
 *   --batch-size <number>        Places per batch (default: 200)
 *   --start-batch <number>       Start from specific batch (default: 0)
 *   --max-batches <number>       Maximum batches to process (default: all)
 *   --dry-run                    Preview without updating
 *   --ratings-provider <list>    Comma-separated: foursquare,yelp or none
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import osmEnrichmentService from '../src/services/osmEnrichmentService';
import reverseGeocodeService from '../src/services/reverseGeocodeService';
import wikidataDescriptionService from '../src/services/wikidataDescriptionService';
import ratingsProviderService, { RatingsProvider } from '../src/services/ratingsProviderService';
import { mergePolicyService, SourceData } from '../src/services/mergePolicyService';
import { normalizeCountryName, isLikelyCountryName } from '../src/utils/countryNormalizer';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const MISSING_FIELDS_FILTER = [
  'address.is.null',
  'opening_hours.is.null',
  'rating.is.null',
  'rating_count.is.null',
  'description.is.null',
  'website.is.null',
  'phone_number.is.null',
].join(',');

interface Options {
  batchSize: number;
  startBatch: number;
  maxBatches?: number;
  dryRun: boolean;
  ratingsProviders: RatingsProvider[];
}

interface WikidataPlaceRow {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  description?: string | null;
  opening_hours?: string | null;
  rating?: number | null;
  rating_count?: number | null;
  website?: string | null;
  phone_number?: string | null;
  cover_image?: string | null;
  images?: string[] | null;
  source_detail?: string | null;
  custom_fields?: Record<string, unknown> | null;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    batchSize: 200,
    startBatch: 0,
    dryRun: false,
    ratingsProviders: [],
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--batch-size':
        options.batchSize = parseInt(args[++i], 10);
        break;
      case '--start-batch':
        options.startBatch = parseInt(args[++i], 10);
        break;
      case '--max-batches':
        options.maxBatches = parseInt(args[++i], 10);
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--ratings-provider':
        options.ratingsProviders = parseRatingsProviders(args[++i]);
        break;
    }
  }

  return options;
}

function parseRatingsProviders(value?: string): RatingsProvider[] {
  if (!value || value.trim().toLowerCase() === 'none') {
    return [];
  }

  const providers = value.split(',')
    .map(provider => provider.trim().toLowerCase())
    .filter(Boolean)
    .filter(provider => provider === 'foursquare' || provider === 'yelp') as RatingsProvider[];

  return providers;
}

async function getTotalCount(): Promise<number> {
  const { count, error } = await supabase
    .from('places')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'wikidata')
    .or(MISSING_FIELDS_FILTER);

  if (error) {
    throw new Error(`Failed to count places: ${error.message}`);
  }

  return count || 0;
}

async function fetchBatch(batchNumber: number, batchSize: number): Promise<WikidataPlaceRow[]> {
  const offset = batchNumber * batchSize;
  const { data, error } = await supabase
    .from('places')
    .select('id,name,latitude,longitude,address,city,country,description,opening_hours,rating,rating_count,website,phone_number,cover_image,images,source_detail,custom_fields')
    .eq('source', 'wikidata')
    .or(MISSING_FIELDS_FILTER)
    .order('id', { ascending: true })
    .range(offset, offset + batchSize - 1);

  if (error) {
    throw new Error(`Failed to fetch batch ${batchNumber}: ${error.message}`);
  }

  return data as WikidataPlaceRow[] || [];
}

function buildSources(
  row: WikidataPlaceRow,
  params: {
    osm?: {
      address?: string;
      openingHours?: string;
      website?: string;
      phoneNumber?: string;
    };
    wikidata?: {
      description?: string;
      website?: string;
    };
    ratings?: {
      provider: RatingsProvider;
      rating?: number;
      ratingCount?: number;
    };
  }
): SourceData {
  const sources: SourceData = {
    wikidata: {
      openingHours: row.opening_hours || undefined,
      address: row.address || undefined,
      rating: row.rating ?? undefined,
      ratingCount: row.rating_count ?? undefined,
      website: row.website || undefined,
      phoneNumber: row.phone_number || undefined,
      description: row.description || undefined,
      coverImage: row.cover_image || undefined,
      images: row.images || undefined,
    },
  };

  if (params.osm) {
    sources.osm = {
      openingHours: params.osm.openingHours,
      opening_hours: params.osm.openingHours,
      address: params.osm.address,
      website: params.osm.website,
      phoneNumber: params.osm.phoneNumber,
    };
  }

  if (params.wikidata) {
    sources.wikidata = {
      ...sources.wikidata,
      description: params.wikidata.description ?? sources.wikidata?.description,
      website: params.wikidata.website ?? sources.wikidata?.website,
    };
  }

  if (params.ratings) {
    sources[params.ratings.provider === 'foursquare' ? 'fsq' : 'yelp'] = {
      rating: params.ratings.rating,
      ratingCount: params.ratings.ratingCount,
    };
  }

  return sources;
}

function setIfChanged(
  updateData: Record<string, unknown>,
  key: string,
  newValue: unknown,
  oldValue: unknown
): void {
  if (newValue === undefined) {
    return;
  }
  if (newValue === null) {
    if (oldValue !== null && oldValue !== undefined) {
      updateData[key] = null;
    }
    return;
  }
  if (newValue !== oldValue) {
    updateData[key] = newValue;
  }
}

function normalizeValue(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function chooseCity(
  existingCity?: string | null,
  existingCountry?: string | null,
  reverseCity?: string | null
): string | null {
  const normalizedExistingCity = normalizeValue(existingCity);
  const normalizedExistingCountry = normalizeValue(existingCountry);
  const normalizedReverseCity = normalizeValue(reverseCity);

  if (!normalizedExistingCity) {
    return normalizedReverseCity;
  }

  if (normalizedExistingCountry &&
      normalizedExistingCity.toLowerCase() === normalizedExistingCountry.toLowerCase()) {
    return normalizedReverseCity || normalizedExistingCity;
  }

  if (isLikelyCountryName(normalizedExistingCity)) {
    return normalizedReverseCity || normalizedExistingCity;
  }

  return normalizedExistingCity;
}

function chooseCountry(
  existingCountry?: string | null,
  reverseCountry?: string | null
): string | null {
  const normalizedExisting = normalizeCountryName(existingCountry || undefined);
  if (normalizedExisting) {
    return normalizedExisting;
  }
  return normalizeCountryName(reverseCountry || undefined);
}

function mergeCustomFields(
  existing: Record<string, unknown> | null | undefined,
  mergedRaw: Record<string, unknown>,
  extra: Record<string, unknown>
): Record<string, unknown> {
  const existingFields = existing && typeof existing === 'object' ? existing : {};
  const existingRaw = (existingFields as any).raw && typeof (existingFields as any).raw === 'object'
    ? (existingFields as any).raw as Record<string, unknown>
    : {};

  return {
    ...existingFields,
    ...extra,
    raw: {
      ...existingRaw,
      ...mergedRaw,
    },
  };
}

async function processPlace(
  row: WikidataPlaceRow,
  ratingsProviders: RatingsProvider[]
): Promise<{ updateData: Record<string, unknown>; customFields: Record<string, unknown> }> {
  const qid = row.source_detail || undefined;
  const updateData: Record<string, unknown> = {};
  const needsReverseGeocode = !row.address || !row.city || !row.country;

  // Run all API calls in parallel
  const [osmResult, wikiResult, ratingsResult, reverseGeocodeResult] = await Promise.all([
    // OSM
    osmEnrichmentService.enrichPlace({
      qid,
      name: row.name,
      latitude: row.latitude,
      longitude: row.longitude,
    }).catch(() => null),
    
    // Wikidata/Wikipedia
    qid
      ? wikidataDescriptionService.fetchDescription(qid).catch(() => null)
      : Promise.resolve(null),
    
    // Ratings
    ratingsProviders.length > 0
      ? ratingsProviderService.fetchBestRating({
          name: row.name,
          latitude: row.latitude,
          longitude: row.longitude,
          city: row.city,
          country: row.country,
          providers: ratingsProviders,
        }).catch(() => null)
      : Promise.resolve(null),
    
    // Reverse Geocode
    needsReverseGeocode
      ? reverseGeocodeService.reverseGeocode(row.latitude, row.longitude).catch(() => null)
      : Promise.resolve(null),
  ]);

  const sources = buildSources(row, {
    osm: osmResult
      ? {
          address: osmResult.address,
          openingHours: osmResult.openingHours,
          website: osmResult.website,
          phoneNumber: osmResult.phoneNumber,
        }
      : undefined,
    wikidata: wikiResult
      ? {
          description: wikiResult.description,
          website: wikiResult.website,
        }
      : undefined,
    ratings: ratingsResult
      ? {
          provider: ratingsResult.provider,
          rating: ratingsResult.rating,
          ratingCount: ratingsResult.ratingCount,
        }
      : undefined,
  });

  const merged = mergePolicyService.mergeMultiSourceData(sources);

  const finalAddress = merged.address ?? reverseGeocodeResult?.address;
  const finalCity = chooseCity(row.city, row.country, reverseGeocodeResult?.city || osmResult?.city || null);
  const finalCountry = chooseCountry(row.country, reverseGeocodeResult?.country || osmResult?.country || null);

  setIfChanged(updateData, 'address', finalAddress, row.address);
  setIfChanged(updateData, 'city', finalCity, row.city);
  setIfChanged(updateData, 'country', finalCountry, row.country);
  setIfChanged(updateData, 'opening_hours', merged.openingHours, row.opening_hours);
  setIfChanged(updateData, 'rating', merged.rating, row.rating);
  setIfChanged(updateData, 'rating_count', merged.ratingCount, row.rating_count);
  setIfChanged(updateData, 'website', merged.website, row.website);
  setIfChanged(updateData, 'phone_number', merged.phoneNumber, row.phone_number);
  setIfChanged(updateData, 'description', merged.description, row.description);

  const extraCustomFields: Record<string, unknown> = {};
  if (osmResult) {
    extraCustomFields.osmMatch = {
      osmId: osmResult.osmId,
      osmType: osmResult.osmType,
      matchScore: osmResult.matchScore,
      matchedBy: osmResult.matchedBy,
    };
  }
  if (wikiResult) {
    extraCustomFields.wikidataSummary = {
      wikipediaTitle: wikiResult.wikipediaTitle,
      wikipediaLang: wikiResult.wikipediaLang,
      description: wikiResult.description,
      website: wikiResult.website,
    };
  }
  if (ratingsResult) {
    extraCustomFields.ratings = {
      provider: ratingsResult.provider,
      rating: ratingsResult.rating,
      ratingCount: ratingsResult.ratingCount,
      sourceUrl: ratingsResult.sourceUrl,
      matchScore: ratingsResult.matchScore,
    };
  }
  if (reverseGeocodeResult) {
    extraCustomFields.reverseGeocode = {
      address: reverseGeocodeResult.address,
      city: reverseGeocodeResult.city,
      country: reverseGeocodeResult.country,
      raw: reverseGeocodeResult.raw,
    };
  }

  const customFields = mergeCustomFields(row.custom_fields, merged.customFields.raw, extraCustomFields);

  return { updateData, customFields };
}

async function main() {
  const options = parseArgs();
  const totalPlaces = await getTotalCount();
  const totalBatches = Math.ceil(totalPlaces / options.batchSize);
  const batchesToProcess = options.maxBatches
    ? Math.min(options.maxBatches, totalBatches - options.startBatch)
    : totalBatches - options.startBatch;

  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                     ENRICH ALL WIKIDATA PLACES                                ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  console.log(`   Total places: ${totalPlaces}`);
  console.log(`   Batch size: ${options.batchSize}`);
  console.log(`   Total batches: ${totalBatches}`);
  console.log(`   Start batch: ${options.startBatch}`);
  console.log(`   Batches to process: ${batchesToProcess}`);
  console.log(`   Dry run: ${options.dryRun ? 'YES' : 'NO'}`);
  console.log(`   Ratings providers: ${options.ratingsProviders.length > 0 ? options.ratingsProviders.join(', ') : 'none'}`);
  console.log('');

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;

  for (let i = 0; i < batchesToProcess; i++) {
    const batchNumber = options.startBatch + i;
    const batchStartTime = Date.now();
    console.log(`\n${'='.repeat(80)}`);
    console.log(`BATCH ${batchNumber + 1}/${totalBatches}`);
    console.log('='.repeat(80));

    const rows = await fetchBatch(batchNumber, options.batchSize);
    if (rows.length === 0) {
      console.log('No rows found for this batch.');
      continue;
    }

    let processedInBatch = 0;
    for (const row of rows) {
      try {
        const { updateData, customFields } = await processPlace(row, options.ratingsProviders);
        const hasUpdates = Object.keys(updateData).length > 0;
        const existingCustomFields = row.custom_fields && typeof row.custom_fields === 'object'
          ? row.custom_fields
          : {};
        const customFieldsChanged = JSON.stringify(customFields) !== JSON.stringify(existingCustomFields);
        const shouldUpdate = hasUpdates || customFieldsChanged;

        if (!shouldUpdate) {
          skipped++;
          processed++;
          processedInBatch++;
          if (processedInBatch % 25 === 0 || processedInBatch === rows.length) {
            console.log(`Progress: batch ${batchNumber + 1}/${totalBatches} - ${processedInBatch}/${rows.length} (overall ${processed}/${totalPlaces})`);
          }
          continue;
        }

        if (!options.dryRun) {
          const { error } = await supabase
            .from('places')
            .update({
              ...updateData,
              custom_fields: customFields,
            })
            .eq('id', row.id);

          if (error) {
            throw new Error(error.message);
          }
        }

        updated++;
        processed++;
        processedInBatch++;
        if (processedInBatch % 25 === 0 || processedInBatch === rows.length) {
          console.log(`Progress: batch ${batchNumber + 1}/${totalBatches} - ${processedInBatch}/${rows.length} (overall ${processed}/${totalPlaces})`);
        }
      } catch (error) {
        failed++;
        processed++;
        processedInBatch++;
        console.error(`❌ Failed to enrich ${row.name}: ${error instanceof Error ? error.message : String(error)}`);
        if (processedInBatch % 25 === 0 || processedInBatch === rows.length) {
          console.log(`Progress: batch ${batchNumber + 1}/${totalBatches} - ${processedInBatch}/${rows.length} (overall ${processed}/${totalPlaces})`);
        }
      }
    }

    const batchDurationSeconds = ((Date.now() - batchStartTime) / 1000).toFixed(1);
    console.log(`Batch ${batchNumber + 1} done in ${batchDurationSeconds}s (updated: ${updated}, skipped: ${skipped}, failed: ${failed})`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('ENRICHMENT COMPLETE');
  console.log('='.repeat(80));
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
