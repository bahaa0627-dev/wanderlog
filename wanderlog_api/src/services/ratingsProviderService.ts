export type RatingsProvider = 'foursquare' | 'yelp';

export interface RatingResult {
  provider: RatingsProvider;
  rating?: number;
  ratingCount?: number;
  sourceUrl?: string;
  matchScore: number;
  raw?: Record<string, unknown>;
}

interface RatingsServiceOptions {
  foursquareApiKey?: string;
  yelpApiKey?: string;
  maxRequestsPerSecond?: number;
  defaultRadiusMeters?: number;
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

export class RatingsProviderService {
  private readonly foursquareApiKey?: string;
  private readonly yelpApiKey?: string;
  private readonly rateLimiter: RateLimiter;
  private readonly defaultRadiusMeters: number;

  constructor(options: RatingsServiceOptions = {}) {
    this.foursquareApiKey = options.foursquareApiKey || process.env.FOURSQUARE_API_KEY;
    this.yelpApiKey = options.yelpApiKey || process.env.YELP_API_KEY;
    this.rateLimiter = new RateLimiter(options.maxRequestsPerSecond ?? 1);
    this.defaultRadiusMeters = options.defaultRadiusMeters ?? 1500;
  }

  async fetchBestRating(params: {
    name: string;
    latitude: number;
    longitude: number;
    city?: string | null;
    country?: string | null;
    providers?: RatingsProvider[];
  }): Promise<RatingResult | null> {
    const providers = params.providers && params.providers.length > 0
      ? params.providers
      : ['foursquare', 'yelp'];

    for (const provider of providers) {
      if (provider === 'foursquare') {
        const result = await this.fetchFromFoursquare(params);
        if (result) {
          return result;
        }
      }

      if (provider === 'yelp') {
        const result = await this.fetchFromYelp(params);
        if (result) {
          return result;
        }
      }
    }

    return null;
  }

  private async fetchFromFoursquare(params: {
    name: string;
    latitude: number;
    longitude: number;
  }): Promise<RatingResult | null> {
    if (!this.foursquareApiKey) {
      return null;
    }

    await this.rateLimiter.acquire();

    const url = new URL('https://api.foursquare.com/v3/places/search');
    url.searchParams.set('ll', `${params.latitude},${params.longitude}`);
    url.searchParams.set('radius', `${this.defaultRadiusMeters}`);
    url.searchParams.set('query', params.name);
    url.searchParams.set('limit', '5');
    url.searchParams.set('fields', 'name,location,distance,rating,stats,link');

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: this.foursquareApiKey,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as {
      results?: Array<{
        name?: string;
        distance?: number;
        rating?: number;
        stats?: { total_ratings?: number };
        link?: string;
      }>;
    };

    const candidates = data.results || [];
    if (candidates.length === 0) {
      return null;
    }

    const best = this.pickBestCandidate(params.name, candidates.map(candidate => ({
      name: candidate.name || '',
      distance: candidate.distance || 0,
      rating: candidate.rating,
      ratingCount: candidate.stats?.total_ratings,
      sourceUrl: candidate.link,
      raw: candidate as unknown as Record<string, unknown>,
    })));

    if (!best) {
      return null;
    }

    return {
      provider: 'foursquare',
      rating: best.rating,
      ratingCount: best.ratingCount,
      sourceUrl: best.sourceUrl,
      matchScore: best.matchScore,
      raw: best.raw,
    };
  }

  private async fetchFromYelp(params: {
    name: string;
    latitude: number;
    longitude: number;
  }): Promise<RatingResult | null> {
    if (!this.yelpApiKey) {
      return null;
    }

    await this.rateLimiter.acquire();

    const url = new URL('https://api.yelp.com/v3/businesses/search');
    url.searchParams.set('term', params.name);
    url.searchParams.set('latitude', `${params.latitude}`);
    url.searchParams.set('longitude', `${params.longitude}`);
    url.searchParams.set('radius', `${this.defaultRadiusMeters}`);
    url.searchParams.set('limit', '5');

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.yelpApiKey}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as {
      businesses?: Array<{
        name?: string;
        distance?: number;
        rating?: number;
        review_count?: number;
        url?: string;
      }>;
    };

    const candidates = data.businesses || [];
    if (candidates.length === 0) {
      return null;
    }

    const best = this.pickBestCandidate(params.name, candidates.map(candidate => ({
      name: candidate.name || '',
      distance: candidate.distance || 0,
      rating: candidate.rating,
      ratingCount: candidate.review_count,
      sourceUrl: candidate.url,
      raw: candidate as unknown as Record<string, unknown>,
    })));

    if (!best) {
      return null;
    }

    return {
      provider: 'yelp',
      rating: best.rating,
      ratingCount: best.ratingCount,
      sourceUrl: best.sourceUrl,
      matchScore: best.matchScore,
      raw: best.raw,
    };
  }

  private pickBestCandidate(
    expectedName: string,
    candidates: Array<{
      name: string;
      distance: number;
      rating?: number;
      ratingCount?: number;
      sourceUrl?: string;
      raw?: Record<string, unknown>;
    }>
  ): {
    rating?: number;
    ratingCount?: number;
    sourceUrl?: string;
    matchScore: number;
    raw?: Record<string, unknown>;
  } | null {
    const scored = candidates.map(candidate => {
      const nameScore = this.calculateNameScore(expectedName, candidate.name);
      const distanceScore = candidate.distance >= 0
        ? Math.max(0, 1 - candidate.distance / this.defaultRadiusMeters)
        : 0;
      const matchScore = Math.min(1, nameScore * 0.7 + distanceScore * 0.3);

      return {
        ...candidate,
        matchScore,
      };
    }).sort((a, b) => b.matchScore - a.matchScore);

    const best = scored[0];
    if (!best || best.matchScore < 0.5) {
      return null;
    }

    return {
      rating: best.rating,
      ratingCount: best.ratingCount,
      sourceUrl: best.sourceUrl,
      matchScore: best.matchScore,
      raw: best.raw,
    };
  }

  private calculateNameScore(expected: string, candidate: string): number {
    const normalizedExpected = expected.trim().toLowerCase();
    const normalizedCandidate = candidate.trim().toLowerCase();

    if (!normalizedExpected || !normalizedCandidate) {
      return 0;
    }

    if (normalizedExpected === normalizedCandidate) {
      return 1;
    }

    if (normalizedCandidate.includes(normalizedExpected) || normalizedExpected.includes(normalizedCandidate)) {
      return 0.7;
    }

    return 0.3;
  }
}

export default new RatingsProviderService();
