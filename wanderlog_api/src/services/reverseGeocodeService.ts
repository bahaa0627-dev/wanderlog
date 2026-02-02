import mapboxGeocodeService from './mapboxGeocodeService';

export interface ReverseGeocodeResult {
  address?: string;
  city?: string;
  country?: string;
  raw?: Record<string, unknown>;
}

interface ReverseGeocodeOptions {
  endpoint?: string;
  maxRequestsPerSecond?: number;
  maxRetries?: number;
}

class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number;
  private lastRefill: number;

  constructor(maxRequestsPerSecond: number) {
    this.maxTokens = maxRequestsPerSecond;
    this.tokens = maxRequestsPerSecond;
    this.refillRate = maxRequestsPerSecond;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const waitTime = Math.ceil((1 - this.tokens) / this.refillRate * 1000);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    this.refill();
    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

export class ReverseGeocodeService {
  private readonly endpoint: string;
  private readonly rateLimiter: RateLimiter;
  private readonly maxRetries: number;

  constructor(options: ReverseGeocodeOptions = {}) {
    const envEndpoint = process.env.NOMINATIM_ENDPOINT;
    const envRps = process.env.NOMINATIM_RPS ? parseFloat(process.env.NOMINATIM_RPS) : undefined;
    const envRetries = process.env.NOMINATIM_MAX_RETRIES ? parseInt(process.env.NOMINATIM_MAX_RETRIES, 10) : undefined;

    this.endpoint = options.endpoint || envEndpoint || 'https://nominatim.openstreetmap.org/reverse';
    const rps = options.maxRequestsPerSecond ?? envRps ?? 0.5;
    this.rateLimiter = new RateLimiter(Math.max(0.1, rps));
    this.maxRetries = Number.isFinite(envRetries) ? Math.max(0, envRetries!) : 2;
  }

  async reverseGeocode(lat: number, lon: number): Promise<ReverseGeocodeResult | null> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= this.maxRetries) {
      attempt += 1;
      await this.rateLimiter.acquire();

      try {
        const url = new URL(this.endpoint);
        url.searchParams.set('format', 'jsonv2');
        url.searchParams.set('lat', String(lat));
        url.searchParams.set('lon', String(lon));
        url.searchParams.set('addressdetails', '1');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

        const response = await fetch(url.toString(), {
          headers: {
            'User-Agent': 'wanderlog-wikidata-enrichment/1.0',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 429 || response.status >= 500) {
            await this.sleep(this.calculateBackoff(attempt));
            continue;
          }
          throw new Error(`Nominatim error: ${response.status}`);
        }

        const data = await response.json() as {
          display_name?: string;
          address?: Record<string, string>;
        };

        const address = data.display_name?.trim();
        const addressParts = data.address || {};
        const city = addressParts.city || addressParts.town || addressParts.village || addressParts.municipality;
        const country = addressParts.country;

        return {
          address: address || undefined,
          city: city || undefined,
          country: country || undefined,
          raw: data as unknown as Record<string, unknown>,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        await this.sleep(this.calculateBackoff(attempt));
      }
    }

    if (lastError) {
      throw lastError;
    }
    return null;
  }

  private calculateBackoff(attempt: number): number {
    const base = 1000;
    return base * Math.pow(2, Math.max(0, attempt - 1));
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Forward geocode: convert address to coordinates
   * 优先使用 Mapbox Geocoding API，失败时回退到 Nominatim
   * @param address Full address string (e.g., "33 Cranbourn St, London WC2H 7AD")
   * @param options 可选参数
   * @returns Coordinates { lat, lon } or null if not found
   */
  async forwardGeocode(
    address: string,
    options: {
      country?: string;
      language?: string;
      proximity?: { lon: number; lat: number };
    } = {}
  ): Promise<{ lat: number; lon: number } | null> {
    if (!address || address.trim().length === 0) {
      return null;
    }

    // 1. 首先尝试使用 Mapbox Geocoding API（命中率更高）
    if (mapboxGeocodeService.isAvailable()) {
      try {
        const mapboxResult = await mapboxGeocodeService.forwardGeocode(address, {
          country: options.country,
          language: options.language || 'zh,en', // 支持中文和英文
          proximity: options.proximity,
        });

        if (mapboxResult) {
          console.log(`[Geocode] Mapbox geocoded "${address}" -> (${mapboxResult.lat}, ${mapboxResult.lon})`);
          return { lat: mapboxResult.lat, lon: mapboxResult.lon };
        }
      } catch (error) {
        console.warn(`[Geocode] Mapbox geocoding failed for "${address}", falling back to Nominatim: ${error}`);
      }
    }

    // 2. 回退到 Nominatim
    return this.forwardGeocodeWithNominatim(address);
  }

  /**
   * 使用 Nominatim 进行 forward geocoding（作为 fallback）
   */
  private async forwardGeocodeWithNominatim(address: string): Promise<{ lat: number; lon: number } | null> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= this.maxRetries) {
      attempt += 1;
      await this.rateLimiter.acquire();

      try {
        // Use search endpoint instead of reverse
        const searchEndpoint = this.endpoint.replace('/reverse', '/search');
        const url = new URL(searchEndpoint);
        url.searchParams.set('format', 'jsonv2');
        url.searchParams.set('q', address);
        url.searchParams.set('limit', '1');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

        const response = await fetch(url.toString(), {
          headers: {
            'User-Agent': 'wanderlog-geocoding/1.0',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 429 || response.status >= 500) {
            await this.sleep(this.calculateBackoff(attempt));
            continue;
          }
          throw new Error(`Nominatim search error: ${response.status}`);
        }

        const data = await response.json() as Array<{
          lat: string;
          lon: string;
          display_name?: string;
        }>;

        if (data && data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);
          if (!isNaN(lat) && !isNaN(lon)) {
            console.log(`[Geocode] Nominatim geocoded "${address}" -> (${lat}, ${lon})`);
            return { lat, lon };
          }
        }

        return null;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        await this.sleep(this.calculateBackoff(attempt));
      }
    }

    if (lastError) {
      console.warn(`[Geocode] Nominatim forward geocoding failed for "${address}": ${lastError.message}`);
    }
    return null;
  }
}

export default new ReverseGeocodeService();
