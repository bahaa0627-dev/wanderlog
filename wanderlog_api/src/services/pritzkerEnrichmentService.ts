/**
 * Pritzker Architecture Enrichment Service
 * 普利兹克建筑作品数据增强服务
 *
 * Provides AI-powered data enrichment for Pritzker Prize architect works.
 * Fetches additional data from Wikidata API and generates descriptions using OpenAI.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */

import axios from 'axios';
import {
  DeduplicatedBuilding,
  WikidataDetails,
  AIEnrichmentResponse,
} from '../types/pritzkerArchitecture';
import { KouriProvider } from './aiProviders/KouriProvider';
import { AzureOpenAIProvider } from './aiProviders/AzureOpenAIProvider';
import { AIProvider } from './aiProviders/types';

// ============================================================================
// Rate Limiting Configuration
// ============================================================================

/**
 * Rate limiter configuration
 */
interface RateLimiterConfig {
  /** Maximum requests per time window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Delay between requests in milliseconds */
  delayMs: number;
}

/**
 * Default rate limiter settings
 * - Wikidata: 50 requests per minute (conservative)
 * - OpenAI: 20 requests per minute (to avoid quota issues)
 */
const WIKIDATA_RATE_LIMIT: RateLimiterConfig = {
  maxRequests: 50,
  windowMs: 60000, // 1 minute
  delayMs: 1200, // 1.2 seconds between requests
};

const OPENAI_RATE_LIMIT: RateLimiterConfig = {
  maxRequests: 20,
  windowMs: 60000, // 1 minute
  delayMs: 3000, // 3 seconds between requests
};

// ============================================================================
// Rate Limiter Implementation
// ============================================================================

/**
 * Simple rate limiter to control API call frequency
 * Requirements: 9.4
 */
class RateLimiter {
  private timestamps: number[] = [];
  private config: RateLimiterConfig;

  constructor(config: RateLimiterConfig) {
    this.config = config;
  }

  /**
   * Wait until it's safe to make the next request
   */
  async waitForSlot(): Promise<void> {
    const now = Date.now();
    
    // Remove timestamps outside the current window
    this.timestamps = this.timestamps.filter(
      (ts) => now - ts < this.config.windowMs
    );

    // If we've hit the limit, wait until the oldest request expires
    if (this.timestamps.length >= this.config.maxRequests) {
      const oldestTimestamp = this.timestamps[0];
      const waitTime = this.config.windowMs - (now - oldestTimestamp) + 100;
      if (waitTime > 0) {
        console.log(`[RateLimiter] Rate limit reached, waiting ${waitTime}ms`);
        await this.delay(waitTime);
      }
    }

    // Add delay between requests
    if (this.timestamps.length > 0) {
      const lastTimestamp = this.timestamps[this.timestamps.length - 1];
      const timeSinceLastRequest = now - lastTimestamp;
      if (timeSinceLastRequest < this.config.delayMs) {
        await this.delay(this.config.delayMs - timeSinceLastRequest);
      }
    }

    // Record this request
    this.timestamps.push(Date.now());
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Wikidata API Functions
// ============================================================================

/**
 * Wikidata API response structure
 */
interface WikidataEntityResponse {
  entities: {
    [qid: string]: {
      claims?: {
        [property: string]: Array<{
          mainsnak?: {
            datavalue?: {
              value?: any;
              type?: string;
            };
          };
        }>;
      };
      labels?: {
        [lang: string]: {
          value: string;
        };
      };
    };
  };
}

// Rate limiter instance for Wikidata
const wikidataRateLimiter = new RateLimiter(WIKIDATA_RATE_LIMIT);


/**
 * Extract year from Wikidata time value
 * @param claims - P571 (inception) claims array
 * @returns Year as number or undefined
 */
function extractYear(claims: any[] | undefined): number | undefined {
  if (!claims || claims.length === 0) return undefined;

  const claim = claims[0];
  const timeValue = claim?.mainsnak?.datavalue?.value?.time;
  
  if (!timeValue) return undefined;

  // Wikidata time format: "+1960-00-00T00:00:00Z" or "+1960-01-01T00:00:00Z"
  const match = timeValue.match(/^[+-]?(\d{4})/);
  if (match) {
    return parseInt(match[1], 10);
  }

  return undefined;
}

/**
 * Extract URL from Wikidata URL value
 * @param claims - P856 (official website) claims array
 * @returns URL string or undefined
 */
function extractUrl(claims: any[] | undefined): string | undefined {
  if (!claims || claims.length === 0) return undefined;

  const claim = claims[0];
  const url = claim?.mainsnak?.datavalue?.value;
  
  if (typeof url === 'string') {
    return url;
  }

  return undefined;
}

/**
 * Extract address from Wikidata monolingual text value
 * @param claims - P6375 (street address) claims array
 * @returns Address string or undefined
 */
function extractAddress(claims: any[] | undefined): string | undefined {
  if (!claims || claims.length === 0) return undefined;

  const claim = claims[0];
  const value = claim?.mainsnak?.datavalue?.value;
  
  // Monolingual text has { text: string, language: string }
  if (value && typeof value.text === 'string') {
    return value.text;
  }

  // Simple string value
  if (typeof value === 'string') {
    return value;
  }

  return undefined;
}

/**
 * Extract architectural styles from Wikidata item references
 * @param claims - P149 (architectural style) claims array
 * @returns Array of style QIDs
 */
function extractStyleQIDs(claims: any[] | undefined): string[] {
  if (!claims || claims.length === 0) return [];

  const styles: string[] = [];
  
  for (const claim of claims) {
    const value = claim?.mainsnak?.datavalue?.value;
    if (value && value.id) {
      styles.push(value.id);
    }
  }

  return styles;
}

/**
 * Extract Commons category from Wikidata string value
 * @param claims - P373 (Commons category) claims array
 * @returns Category string or undefined
 */
function extractCommonsCategory(claims: any[] | undefined): string | undefined {
  if (!claims || claims.length === 0) return undefined;

  const claim = claims[0];
  const value = claim?.mainsnak?.datavalue?.value;
  
  if (typeof value === 'string') {
    return value;
  }

  return undefined;
}

/**
 * Map of common architectural style QIDs to English names
 */
const STYLE_QID_MAP: Record<string, string> = {
  'Q46970': 'Modernism',
  'Q131681': 'Brutalism',
  'Q188740': 'Postmodernism',
  'Q181902': 'Deconstructivism',
  'Q34636': 'Art Nouveau',
  'Q173417': 'Art Deco',
  'Q186363': 'International Style',
  'Q1473346': 'High-tech Architecture',
  'Q1754286': 'Organic Architecture',
  'Q1640824': 'Minimalism',
  'Q1792644': 'Expressionism',
  'Q2044250': 'Functionalism',
  'Q3039121': 'Metabolism',
  'Q7725634': 'Contemporary Architecture',
  'Q1074552': 'Neoclassical Architecture',
  'Q842256': 'Gothic Revival',
};

/**
 * Fetch additional details from Wikidata API
 *
 * Retrieves:
 * - P571 (inception/year built)
 * - P149 (architectural style)
 * - P856 (official website)
 * - P6375 (street address)
 * - P373 (Commons category)
 *
 * @param qid - Wikidata QID (e.g., "Q281521")
 * @returns WikidataDetails object or null if fetch fails
 *
 * Requirements: 9.2
 */
export async function fetchWikidataDetails(qid: string): Promise<WikidataDetails | null> {
  if (!qid || typeof qid !== 'string' || !qid.startsWith('Q')) {
    console.log(`[WikidataEnrich] Invalid QID: ${qid}`);
    return null;
  }

  // Wait for rate limit slot
  await wikidataRateLimiter.waitForSlot();

  const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;

  try {
    console.log(`[WikidataEnrich] Fetching details for ${qid}`);
    
    const response = await axios.get<WikidataEntityResponse>(url, {
      timeout: 10000, // 10 second timeout
      headers: {
        'User-Agent': 'WanderLog/1.0 (https://wanderlog.app; contact@wanderlog.app)',
        'Accept': 'application/json',
      },
    });

    const entity = response.data.entities[qid];
    if (!entity) {
      console.log(`[WikidataEnrich] Entity not found for ${qid}`);
      return null;
    }

    const claims = entity.claims || {};

    // Extract year built from P571 (inception)
    const yearBuilt = extractYear(claims.P571);

    // Extract architectural styles from P149
    const styleQIDs = extractStyleQIDs(claims.P149);
    const architecturalStyle = styleQIDs
      .map((styleQid) => STYLE_QID_MAP[styleQid])
      .filter((style): style is string => !!style);

    // Extract website from P856
    const website = extractUrl(claims.P856);

    // Extract address from P6375
    const address = extractAddress(claims.P6375);

    // Extract Commons category from P373
    const commonsCategory = extractCommonsCategory(claims.P373);

    const details: WikidataDetails = {
      yearBuilt,
      architecturalStyle: architecturalStyle.length > 0 ? architecturalStyle : undefined,
      website,
      address,
      commonsCategory,
    };

    // Log what we found
    const foundFields = Object.entries(details)
      .filter(([_, v]) => v !== undefined)
      .map(([k, _]) => k);
    
    if (foundFields.length > 0) {
      console.log(`[WikidataEnrich] Found for ${qid}: ${foundFields.join(', ')}`);
    } else {
      console.log(`[WikidataEnrich] No additional data found for ${qid}`);
    }

    return details;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        console.log(`[WikidataEnrich] Entity not found: ${qid}`);
      } else {
        console.error(`[WikidataEnrich] API error for ${qid}:`, error.message);
      }
    } else {
      console.error(`[WikidataEnrich] Error fetching ${qid}:`, error);
    }
    return null;
  }
}


// ============================================================================
// AI Enrichment Functions
// ============================================================================

// Rate limiter instance for OpenAI
const openaiRateLimiter = new RateLimiter(OPENAI_RATE_LIMIT);

/**
 * Get an available AI provider for text generation
 * Tries Kouri first, then Azure OpenAI
 */
function getAIProvider(): AIProvider | null {
  // Try Kouri first (recommended for China users)
  const kouriProvider = new KouriProvider();
  if (kouriProvider.isAvailable()) {
    console.log('[AIEnrich] Using Kouri provider');
    return kouriProvider;
  }

  // Try Azure OpenAI as fallback
  const azureProvider = new AzureOpenAIProvider();
  if (azureProvider.isAvailable()) {
    console.log('[AIEnrich] Using Azure OpenAI provider');
    return azureProvider;
  }

  console.log('[AIEnrich] No AI provider available');
  return null;
}

/**
 * Generate a building description using AI
 *
 * Creates a 100-200 word description highlighting the architectural
 * significance of the building.
 *
 * @param building - Deduplicated building data
 * @returns AI-generated description or null if generation fails
 *
 * Requirements: 9.3
 */
async function generateBuildingDescription(
  building: DeduplicatedBuilding
): Promise<string | null> {
  const provider = getAIProvider();
  if (!provider) {
    return null;
  }

  // Wait for rate limit slot
  await openaiRateLimiter.waitForSlot();

  const city = building.cities.length > 0 ? building.cities[0] : 'Unknown';
  
  const prompt = `Please write a brief description (100-200 words) about the following architectural work:

Building Name: ${building.workLabel}
Architect: ${building.architectLabel}
Location: ${city}, ${building.country}

The description should:
1. Highlight the architectural significance and unique features
2. Mention the architect's design philosophy if relevant
3. Include any notable historical or cultural context
4. Be informative and engaging for travelers interested in architecture

Please write the description in English, in a professional but accessible tone.
Return ONLY the description text, no additional formatting or labels.`;

  try {
    console.log(`[AIEnrich] Generating description for: ${building.workLabel}`);
    
    const response = await provider.generateText(prompt);
    
    if (!response || response.trim().length === 0) {
      console.log(`[AIEnrich] Empty response for: ${building.workLabel}`);
      return null;
    }

    // Clean up the response
    let description = response.trim();
    
    // Remove any markdown formatting if present
    description = description.replace(/^#+\s*/gm, '');
    description = description.replace(/\*\*/g, '');
    
    // Validate length (should be 100-200 words, but allow some flexibility)
    const wordCount = description.split(/\s+/).length;
    if (wordCount < 50) {
      console.log(`[AIEnrich] Description too short (${wordCount} words) for: ${building.workLabel}`);
      return null;
    }

    console.log(`[AIEnrich] Generated ${wordCount}-word description for: ${building.workLabel}`);
    return description;
  } catch (error) {
    console.error(`[AIEnrich] Error generating description for ${building.workLabel}:`, error);
    return null;
  }
}

/**
 * Enrich a building with additional data from AI and Wikidata
 *
 * Combines data from:
 * 1. Wikidata API (year built, architectural style, website, address)
 * 2. OpenAI (building description)
 *
 * @param building - Deduplicated building data
 * @returns AIEnrichmentResponse with additional data, or null if enrichment fails
 *
 * Requirements: 9.2, 9.3, 9.4, 9.5
 */
export async function enrichBuildingWithAI(
  building: DeduplicatedBuilding
): Promise<AIEnrichmentResponse | null> {
  console.log(`[AIEnrich] Starting enrichment for: ${building.workLabel}`);

  const result: AIEnrichmentResponse = {};
  let hasData = false;

  // Step 1: Fetch Wikidata details
  try {
    const wikidataDetails = await fetchWikidataDetails(building.wikidataQID);
    
    if (wikidataDetails) {
      if (wikidataDetails.yearBuilt) {
        result.yearBuilt = wikidataDetails.yearBuilt;
        hasData = true;
      }
      if (wikidataDetails.architecturalStyle && wikidataDetails.architecturalStyle.length > 0) {
        result.architecturalStyle = wikidataDetails.architecturalStyle;
        hasData = true;
      }
      if (wikidataDetails.website) {
        result.website = wikidataDetails.website;
        hasData = true;
      }
      if (wikidataDetails.address) {
        result.address = wikidataDetails.address;
        hasData = true;
      }
    }
  } catch (error) {
    // Log but continue - Wikidata failure shouldn't stop AI enrichment
    console.error(`[AIEnrich] Wikidata fetch failed for ${building.wikidataQID}:`, error);
  }

  // Step 2: Generate AI description
  try {
    const description = await generateBuildingDescription(building);
    
    if (description) {
      result.description = description;
      hasData = true;
    }
  } catch (error) {
    // Log but continue - AI failure shouldn't stop the import
    console.error(`[AIEnrich] AI description failed for ${building.workLabel}:`, error);
  }

  if (hasData) {
    console.log(`[AIEnrich] Enrichment complete for: ${building.workLabel}`);
    return result;
  }

  console.log(`[AIEnrich] No enrichment data found for: ${building.workLabel}`);
  return null;
}

// ============================================================================
// Batch Enrichment Functions
// ============================================================================

/**
 * Enrichment result for a single building
 */
export interface EnrichmentResult {
  wikidataQID: string;
  workLabel: string;
  success: boolean;
  data?: AIEnrichmentResponse;
  error?: string;
}

/**
 * Batch enrichment options
 */
export interface BatchEnrichmentOptions {
  /** Maximum number of buildings to enrich (default: all) */
  limit?: number;
  /** Skip buildings that already have descriptions */
  skipExisting?: boolean;
  /** Callback for progress updates */
  onProgress?: (current: number, total: number, result: EnrichmentResult) => void;
}

/**
 * Enrich multiple buildings with AI data
 *
 * Processes buildings sequentially with rate limiting to avoid
 * overwhelming the APIs.
 *
 * @param buildings - Array of deduplicated buildings to enrich
 * @param options - Batch enrichment options
 * @returns Array of enrichment results
 *
 * Requirements: 9.4, 9.5
 */
export async function enrichBuildingsBatch(
  buildings: DeduplicatedBuilding[],
  options: BatchEnrichmentOptions = {}
): Promise<EnrichmentResult[]> {
  const { limit, onProgress } = options;
  
  // Apply limit if specified
  const buildingsToProcess = limit ? buildings.slice(0, limit) : buildings;
  const total = buildingsToProcess.length;
  
  console.log(`[AIEnrich] Starting batch enrichment for ${total} buildings`);
  
  const results: EnrichmentResult[] = [];
  
  for (let i = 0; i < buildingsToProcess.length; i++) {
    const building = buildingsToProcess[i];
    
    try {
      const enrichmentData = await enrichBuildingWithAI(building);
      
      const result: EnrichmentResult = {
        wikidataQID: building.wikidataQID,
        workLabel: building.workLabel,
        success: enrichmentData !== null,
        data: enrichmentData || undefined,
      };
      
      results.push(result);
      
      // Call progress callback if provided
      if (onProgress) {
        onProgress(i + 1, total, result);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      const result: EnrichmentResult = {
        wikidataQID: building.wikidataQID,
        workLabel: building.workLabel,
        success: false,
        error: errorMessage,
      };
      
      results.push(result);
      
      // Call progress callback if provided
      if (onProgress) {
        onProgress(i + 1, total, result);
      }
      
      // Continue with next building - don't let one failure stop the batch
      console.error(`[AIEnrich] Failed to enrich ${building.workLabel}:`, errorMessage);
    }
  }
  
  // Log summary
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;
  
  console.log(`[AIEnrich] Batch enrichment complete:`);
  console.log(`  - Total: ${total}`);
  console.log(`  - Success: ${successCount}`);
  console.log(`  - Failed: ${failCount}`);
  
  return results;
}

/**
 * Apply enrichment data to PlaceImportData
 *
 * Merges AI enrichment data into the place import data structure.
 *
 * @param placeData - Original place import data
 * @param enrichment - AI enrichment response
 * @returns Updated place import data
 */
export function applyEnrichmentToPlace(
  placeData: any,
  enrichment: AIEnrichmentResponse
): any {
  const enrichedData = { ...placeData };

  // Apply description
  if (enrichment.description) {
    enrichedData.description = enrichment.description;
  }

  // Apply address
  if (enrichment.address) {
    enrichedData.address = enrichment.address;
  }

  // Apply website
  if (enrichment.website) {
    enrichedData.website = enrichment.website;
  }

  // Apply year built to customFields
  if (enrichment.yearBuilt) {
    enrichedData.customFields = {
      ...enrichedData.customFields,
      yearBuilt: enrichment.yearBuilt,
      aiGenerated: true,
    };
  } else if (enrichment.description) {
    // Mark as AI generated if we added a description
    enrichedData.customFields = {
      ...enrichedData.customFields,
      aiGenerated: true,
    };
  }

  // Apply architectural styles to tags
  if (enrichment.architecturalStyle && enrichment.architecturalStyle.length > 0) {
    const currentStyles = enrichedData.tags?.style || ['Architecture'];
    const combinedStyles = [...currentStyles, ...enrichment.architecturalStyle];
    const newStyles = Array.from(new Set(combinedStyles));
    
    enrichedData.tags = {
      ...enrichedData.tags,
      style: newStyles,
    };

    // Also update aiTags with new styles (priority 80)
    const currentAiTags = enrichedData.aiTags || [];
    const existingTagNames = currentAiTags.map((t: any) => t.en);
    const existingTags = new Set(existingTagNames);
    
    for (const style of enrichment.architecturalStyle) {
      if (!existingTags.has(style)) {
        currentAiTags.push({ en: style, priority: 80 });
      }
    }

    // Re-sort by priority
    currentAiTags.sort((a: any, b: any) => b.priority - a.priority);
    enrichedData.aiTags = currentAiTags;
  }

  return enrichedData;
}
