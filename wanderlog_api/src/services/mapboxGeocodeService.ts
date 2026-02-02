/**
 * Mapbox Geocoding Service
 * 使用 Mapbox Geocoding API v6 进行地址转坐标
 * 文档: https://docs.mapbox.com/api/search/geocoding
 */

interface MapboxGeocodeResult {
  lat: number;
  lon: number;
  accuracy?: string;
  address?: string;
  city?: string;
  country?: string;
}

interface MapboxGeocodeOptions {
  accessToken?: string;
  maxRetries?: number;
  permanent?: boolean; // 是否存储结果（需要付费账户）
}

// Mapbox API v6 响应类型
interface MapboxV6Feature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  properties: {
    mapbox_id: string;
    feature_type: string;
    name: string;
    coordinates: {
      longitude: number;
      latitude: number;
      accuracy?: string;
    };
    place_formatted?: string;
    full_address?: string;
    context?: {
      place?: { name: string };
      locality?: { name: string };
      region?: { name: string };
      country?: { name: string; country_code: string };
    };
  };
}

interface MapboxV6Response {
  type: 'FeatureCollection';
  features: MapboxV6Feature[];
  attribution: string;
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

export class MapboxGeocodeService {
  private readonly accessToken: string;
  private readonly maxRetries: number;
  private readonly permanent: boolean;
  private readonly rateLimiter: RateLimiter;
  private readonly baseUrl = 'https://api.mapbox.com/search/geocode/v6';

  constructor(options: MapboxGeocodeOptions = {}) {
    this.accessToken = options.accessToken || process.env.MAPBOX_ACCESS_TOKEN || '';
    this.maxRetries = options.maxRetries ?? 2;
    this.permanent = options.permanent ?? false; // 默认使用 Temporary Geocoding
    // Mapbox rate limit: 1000 requests per minute = ~16.7 per second
    // 保守设置为 10 requests per second
    this.rateLimiter = new RateLimiter(10);
  }

  /**
   * 检查服务是否可用（是否配置了 access token）
   */
  isAvailable(): boolean {
    return !!this.accessToken && this.accessToken.length > 0;
  }

  /**
   * Forward geocode: 将地址转换为坐标
   * @param address 完整地址字符串
   * @param options 可选参数
   * @returns 坐标信息或 null
   */
  async forwardGeocode(
    address: string,
    options: {
      country?: string; // ISO 3166 alpha 2 country code
      language?: string; // IETF language tag, e.g., 'zh', 'en'
      proximity?: { lon: number; lat: number }; // 优先返回靠近该坐标的结果
      types?: string[]; // 过滤类型: address, place, street, etc.
    } = {}
  ): Promise<MapboxGeocodeResult | null> {
    if (!this.accessToken) {
      console.warn('[MapboxGeocode] No access token configured');
      return null;
    }

    if (!address || address.trim().length === 0) {
      return null;
    }

    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= this.maxRetries) {
      attempt += 1;
      await this.rateLimiter.acquire();

      try {
        const url = new URL(`${this.baseUrl}/forward`);
        url.searchParams.set('q', address);
        url.searchParams.set('access_token', this.accessToken);
        url.searchParams.set('limit', '1');
        url.searchParams.set('autocomplete', 'false'); // 关闭自动补全以提高准确性
        
        if (this.permanent) {
          url.searchParams.set('permanent', 'true');
        }

        if (options.country) {
          url.searchParams.set('country', options.country);
        }

        if (options.language) {
          url.searchParams.set('language', options.language);
        }

        if (options.proximity) {
          url.searchParams.set('proximity', `${options.proximity.lon},${options.proximity.lat}`);
        }

        if (options.types && options.types.length > 0) {
          url.searchParams.set('types', options.types.join(','));
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

        const response = await fetch(url.toString(), {
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 429) {
            // Rate limit exceeded
            console.warn('[MapboxGeocode] Rate limit exceeded, retrying...');
            await this.sleep(this.calculateBackoff(attempt));
            continue;
          }
          if (response.status >= 500) {
            await this.sleep(this.calculateBackoff(attempt));
            continue;
          }
          const errorText = await response.text();
          throw new Error(`Mapbox Geocoding error: ${response.status} - ${errorText}`);
        }

        const data = await response.json() as MapboxV6Response;

        if (data.features && data.features.length > 0) {
          const feature = data.features[0];
          const coords = feature.properties.coordinates;
          const context = feature.properties.context;

          return {
            lat: coords.latitude,
            lon: coords.longitude,
            accuracy: coords.accuracy,
            address: feature.properties.full_address || feature.properties.name,
            city: context?.place?.name || context?.locality?.name,
            country: context?.country?.name,
          };
        }

        return null;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (lastError.name === 'AbortError') {
          console.warn('[MapboxGeocode] Request timeout');
        }
        
        await this.sleep(this.calculateBackoff(attempt));
      }
    }

    if (lastError) {
      console.warn(`[MapboxGeocode] Forward geocoding failed for "${address}": ${lastError.message}`);
    }
    return null;
  }

  /**
   * Reverse geocode: 将坐标转换为地址
   * @param lat 纬度
   * @param lon 经度
   * @returns 地址信息或 null
   */
  async reverseGeocode(
    lat: number,
    lon: number,
    options: {
      language?: string;
      types?: string[];
    } = {}
  ): Promise<MapboxGeocodeResult | null> {
    if (!this.accessToken) {
      console.warn('[MapboxGeocode] No access token configured');
      return null;
    }

    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= this.maxRetries) {
      attempt += 1;
      await this.rateLimiter.acquire();

      try {
        const url = new URL(`${this.baseUrl}/reverse`);
        url.searchParams.set('longitude', String(lon));
        url.searchParams.set('latitude', String(lat));
        url.searchParams.set('access_token', this.accessToken);
        
        if (this.permanent) {
          url.searchParams.set('permanent', 'true');
        }

        if (options.language) {
          url.searchParams.set('language', options.language);
        }

        if (options.types && options.types.length > 0) {
          url.searchParams.set('types', options.types.join(','));
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(url.toString(), {
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 429 || response.status >= 500) {
            await this.sleep(this.calculateBackoff(attempt));
            continue;
          }
          throw new Error(`Mapbox Geocoding error: ${response.status}`);
        }

        const data = await response.json() as MapboxV6Response;

        if (data.features && data.features.length > 0) {
          const feature = data.features[0];
          const coords = feature.properties.coordinates;
          const context = feature.properties.context;

          return {
            lat: coords.latitude,
            lon: coords.longitude,
            accuracy: coords.accuracy,
            address: feature.properties.full_address || feature.properties.name,
            city: context?.place?.name || context?.locality?.name,
            country: context?.country?.name,
          };
        }

        return null;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        await this.sleep(this.calculateBackoff(attempt));
      }
    }

    if (lastError) {
      console.warn(`[MapboxGeocode] Reverse geocoding failed for (${lat}, ${lon}): ${lastError.message}`);
    }
    return null;
  }

  /**
   * 批量 geocoding（最多 1000 个请求）
   * @param addresses 地址数组
   * @returns 结果数组（与输入顺序对应）
   */
  async batchForwardGeocode(
    addresses: string[],
    options: {
      country?: string;
      language?: string;
    } = {}
  ): Promise<(MapboxGeocodeResult | null)[]> {
    if (!this.accessToken) {
      console.warn('[MapboxGeocode] No access token configured');
      return addresses.map(() => null);
    }

    if (addresses.length === 0) {
      return [];
    }

    // Mapbox 批量 API 限制 1000 个请求
    if (addresses.length > 1000) {
      console.warn('[MapboxGeocode] Batch size exceeds 1000, truncating');
      addresses = addresses.slice(0, 1000);
    }

    try {
      await this.rateLimiter.acquire();

      const url = new URL(`${this.baseUrl}/batch`);
      url.searchParams.set('access_token', this.accessToken);
      
      if (this.permanent) {
        url.searchParams.set('permanent', 'true');
      }

      // 构建批量请求体
      const queries = addresses.map(address => {
        const query: Record<string, unknown> = {
          q: address,
          limit: 1,
          autocomplete: false,
        };
        if (options.country) {
          query.country = options.country;
        }
        if (options.language) {
          query.language = options.language;
        }
        return query;
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for batch

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(queries),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Mapbox Batch Geocoding error: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as { batch: MapboxV6Response[] };

      return data.batch.map(result => {
        if (result.features && result.features.length > 0) {
          const feature = result.features[0];
          const coords = feature.properties.coordinates;
          const context = feature.properties.context;

          return {
            lat: coords.latitude,
            lon: coords.longitude,
            accuracy: coords.accuracy,
            address: feature.properties.full_address || feature.properties.name,
            city: context?.place?.name || context?.locality?.name,
            country: context?.country?.name,
          };
        }
        return null;
      });
    } catch (error) {
      console.warn(`[MapboxGeocode] Batch forward geocoding failed: ${error}`);
      return addresses.map(() => null);
    }
  }

  private calculateBackoff(attempt: number): number {
    const base = 1000;
    return base * Math.pow(2, Math.max(0, attempt - 1));
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 导出默认实例
export default new MapboxGeocodeService();
