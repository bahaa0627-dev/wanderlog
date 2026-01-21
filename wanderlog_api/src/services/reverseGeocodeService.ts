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

        const response = await fetch(url.toString(), {
          headers: {
            'User-Agent': 'wanderlog-wikidata-enrichment/1.0',
          },
        });

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
}

export default new ReverseGeocodeService();
