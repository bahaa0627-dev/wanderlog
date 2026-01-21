export interface OsmTags {
  [key: string]: string | undefined;
}

export interface OsmMatchResult {
  osmId: number;
  osmType: 'node' | 'way' | 'relation';
  latitude: number;
  longitude: number;
  distanceMeters: number;
  nameScore: number;
  matchScore: number;
  tags: OsmTags;
  matchedBy: 'wikidata' | 'name';
}

export interface OsmEnrichmentResult {
  address?: string;
  city?: string;
  country?: string;
  website?: string;
  phoneNumber?: string;
  openingHours?: string;
  rawTags: OsmTags;
  osmId: number;
  osmType: 'node' | 'way' | 'relation';
  matchScore: number;
  matchedBy: 'wikidata' | 'name';
}

interface OsmEnrichmentOptions {
  endpoint?: string;
  maxRequestsPerSecond?: number;
  defaultRadiusMeters?: number;
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: {
    lat: number;
    lon: number;
  };
  tags?: OsmTags;
}

interface OverpassResponse {
  elements?: OverpassElement[];
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

export class OsmEnrichmentService {
  private readonly endpoint: string;
  private readonly rateLimiter: RateLimiter;
  private readonly defaultRadiusMeters: number;
  private readonly maxRetries: number;

  constructor(options: OsmEnrichmentOptions = {}) {
    const envEndpoint = process.env.OVERPASS_ENDPOINT;
    const envRps = process.env.OVERPASS_RPS ? parseFloat(process.env.OVERPASS_RPS) : undefined;
    const envRetries = process.env.OVERPASS_MAX_RETRIES ? parseInt(process.env.OVERPASS_MAX_RETRIES, 10) : undefined;

    this.endpoint = options.endpoint || envEndpoint || 'https://overpass-api.de/api/interpreter';
    const rps = options.maxRequestsPerSecond ?? envRps ?? 0.5;
    this.rateLimiter = new RateLimiter(Math.max(0.1, rps));
    this.defaultRadiusMeters = options.defaultRadiusMeters ?? 1200;
    this.maxRetries = Number.isFinite(envRetries) ? Math.max(0, envRetries!) : 3;
  }

  async enrichPlace(params: {
    qid?: string | null;
    name: string;
    latitude: number;
    longitude: number;
    radiusMeters?: number;
  }): Promise<OsmEnrichmentResult | null> {
    const radius = params.radiusMeters ?? this.defaultRadiusMeters;

    let match: OsmMatchResult | null = null;
    if (params.qid) {
      match = await this.findByWikidata(params.qid);
    }

    if (!match) {
      match = await this.findByName({
        name: params.name,
        latitude: params.latitude,
        longitude: params.longitude,
        radiusMeters: radius,
      });
    }

    if (!match) {
      return null;
    }

    return this.buildEnrichment(match);
  }

  private async findByWikidata(qid: string): Promise<OsmMatchResult | null> {
    const normalized = qid.trim().toUpperCase();
    if (!/^Q\d+$/.test(normalized)) {
      return null;
    }

    const query = `
[out:json][timeout:25];
(
  nwr["wikidata"="${normalized}"];
);
out center tags;
`;

    const elements = await this.runOverpassQuery(query);
    const matches = this.scoreMatches(elements, undefined);
    return matches.length > 0 ? matches[0] : null;
  }

  private async findByName(params: {
    name: string;
    latitude: number;
    longitude: number;
    radiusMeters: number;
  }): Promise<OsmMatchResult | null> {
    const normalizedName = params.name.trim();
    if (!normalizedName) {
      return null;
    }

    const escapedName = this.escapeRegex(normalizedName);
    const nameRegex = `^${escapedName}$`;
    const around = `around:${params.radiusMeters},${params.latitude},${params.longitude}`;

    const query = `
[out:json][timeout:25];
(
  nwr(${around})["name"~"${nameRegex}",i];
  nwr(${around})["name:en"~"${nameRegex}",i];
  nwr(${around})["official_name"~"${nameRegex}",i];
  nwr(${around})["alt_name"~"${nameRegex}",i];
);
out center tags;
`;

    const elements = await this.runOverpassQuery(query);
    const matches = this.scoreMatches(elements, {
      name: normalizedName,
      latitude: params.latitude,
      longitude: params.longitude,
      radiusMeters: params.radiusMeters,
    });

    return matches.length > 0 ? matches[0] : null;
  }

  private async runOverpassQuery(query: string): Promise<OverpassElement[]> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= this.maxRetries) {
      attempt += 1;
      await this.rateLimiter.acquire();

      try {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ data: query }),
        });

        if (!response.ok) {
          if (response.status === 429 || response.status >= 500) {
            const waitMs = this.calculateBackoff(attempt);
            await new Promise(resolve => setTimeout(resolve, waitMs));
            continue;
          }
          throw new Error(`Overpass API error: ${response.status}`);
        }

        const data = await response.json() as OverpassResponse;
        return data.elements || [];
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const waitMs = this.calculateBackoff(attempt);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    }

    throw lastError || new Error('Overpass API error: unknown');
  }

  private calculateBackoff(attempt: number): number {
    const base = 1000;
    const multiplier = 2;
    return base * Math.pow(multiplier, Math.max(0, attempt - 1));
  }

  private scoreMatches(
    elements: OverpassElement[],
    context?: { name: string; latitude: number; longitude: number; radiusMeters: number }
  ): OsmMatchResult[] {
    const matches: OsmMatchResult[] = [];

    for (const element of elements) {
      const tags = element.tags || {};
      const coords = this.getElementCoordinates(element);
      if (!coords) {
        continue;
      }

      const distance = context
        ? this.calculateDistanceMeters(context.latitude, context.longitude, coords.latitude, coords.longitude)
        : 0;
      const nameScore = context ? this.calculateNameScore(context.name, tags.name) : 1;
      const distanceScore = context
        ? Math.max(0, 1 - distance / context.radiusMeters)
        : 1;
      const typeBoost = this.calculateTypeBoost(tags);
      const matchScore = Math.min(1, (nameScore * 0.6) + (distanceScore * 0.4) + typeBoost);

      matches.push({
        osmId: element.id,
        osmType: element.type,
        latitude: coords.latitude,
        longitude: coords.longitude,
        distanceMeters: distance,
        nameScore,
        matchScore,
        tags,
        matchedBy: context ? 'name' : 'wikidata',
      });
    }

    return matches.sort((a, b) => b.matchScore - a.matchScore);
  }

  private buildEnrichment(match: OsmMatchResult): OsmEnrichmentResult {
    const tags = match.tags || {};
    const address = this.buildAddress(tags);
    const city = this.pickFirst(tags, ['addr:city', 'addr:town', 'addr:village', 'addr:municipality']);
    const country = tags['addr:country'];
    const website = this.pickFirst(tags, ['website', 'contact:website', 'url']);
    const phoneNumber = this.pickFirst(tags, ['phone', 'contact:phone']);
    const openingHours = tags.opening_hours;

    return {
      address: address || undefined,
      city: city || undefined,
      country: country || undefined,
      website: website || undefined,
      phoneNumber: phoneNumber || undefined,
      openingHours: openingHours || undefined,
      rawTags: tags,
      osmId: match.osmId,
      osmType: match.osmType,
      matchScore: match.matchScore,
      matchedBy: match.matchedBy,
    };
  }

  private getElementCoordinates(element: OverpassElement): { latitude: number; longitude: number } | null {
    if (element.lat !== undefined && element.lon !== undefined) {
      return { latitude: element.lat, longitude: element.lon };
    }
    if (element.center) {
      return { latitude: element.center.lat, longitude: element.center.lon };
    }
    return null;
  }

  private buildAddress(tags: OsmTags): string | null {
    const full = tags['addr:full'];
    if (full) {
      return full.trim();
    }

    const house = tags['addr:housenumber'];
    const street = tags['addr:street'];
    const city = this.pickFirst(tags, ['addr:city', 'addr:town', 'addr:village', 'addr:municipality']);
    const state = tags['addr:state'];
    const postcode = tags['addr:postcode'];
    const country = tags['addr:country'];

    const streetLine = [house, street].filter(Boolean).join(' ').trim();
    const parts = [streetLine, city, state, postcode, country].filter(Boolean);

    return parts.length > 0 ? parts.join(', ') : null;
  }

  private pickFirst(tags: OsmTags, keys: string[]): string | null {
    for (const key of keys) {
      const value = tags[key];
      if (value && value.trim()) {
        return value.trim();
      }
    }
    return null;
  }

  private calculateNameScore(expected: string, candidate?: string): number {
    if (!candidate) {
      return 0;
    }
    const normalizedExpected = expected.trim().toLowerCase();
    const normalizedCandidate = candidate.trim().toLowerCase();

    if (normalizedExpected === normalizedCandidate) {
      return 1;
    }
    if (normalizedCandidate.includes(normalizedExpected) || normalizedExpected.includes(normalizedCandidate)) {
      return 0.7;
    }
    return 0.3;
  }

  private calculateTypeBoost(tags: OsmTags): number {
    const typeKeys = ['tourism', 'amenity', 'historic', 'leisure', 'building', 'man_made'];
    for (const key of typeKeys) {
      if (tags[key]) {
        return 0.05;
      }
    }
    return 0;
  }

  private calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (value: number) => value * Math.PI / 180;
    const r = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * r * Math.asin(Math.sqrt(a));
  }

  private escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

export default new OsmEnrichmentService();
