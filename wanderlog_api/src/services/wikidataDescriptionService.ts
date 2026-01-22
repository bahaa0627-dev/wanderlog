export interface WikidataDescriptionResult {
  description?: string;
  wikipediaTitle?: string;
  wikipediaLang?: string;
  website?: string;
}

interface WikidataEntityResponse {
  entities?: Record<string, {
    descriptions?: Record<string, { value: string }>;
    sitelinks?: Record<string, { title: string }>;
    claims?: Record<string, Array<{
      mainsnak?: {
        datavalue?: {
          value?: string;
        };
      };
    }>>;
  }>;
}

const LANG_PRIORITY = ['en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'sv', 'da', 'no', 'fi', 'zh', 'ja', 'ko'];

export class WikidataDescriptionService {
  private readonly wikidataApiUrl = 'https://www.wikidata.org/w/api.php';

  async fetchDescription(qid: string): Promise<WikidataDescriptionResult | null> {
    const normalized = qid.trim().toUpperCase();
    if (!/^Q\d+$/.test(normalized)) {
      return null;
    }

    const entity = await this.fetchEntity(normalized);
    if (!entity) {
      return null;
    }

    const website = this.extractWebsite(entity);
    const wikiLink = this.pickWikipediaLink(entity);
    if (wikiLink) {
      const summary = await this.fetchWikipediaSummary(wikiLink.lang, wikiLink.title);
      if (summary) {
        return {
          description: summary,
          wikipediaTitle: wikiLink.title,
          wikipediaLang: wikiLink.lang,
          website,
        };
      }
    }

    const fallback = this.pickDescription(entity);
    if (fallback || website) {
      return {
        description: fallback || undefined,
        wikipediaTitle: wikiLink?.title,
        wikipediaLang: wikiLink?.lang,
        website,
      };
    }

    return null;
  }

  private async fetchEntity(qid: string): Promise<WikidataEntityResponse['entities'][string] | null> {
    const params = new URLSearchParams({
      action: 'wbgetentities',
      ids: qid,
      props: 'descriptions|sitelinks|claims',
      format: 'json',
      origin: '*',
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const response = await fetch(`${this.wikidataApiUrl}?${params}`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Wikidata API error: ${response.status}`);
    }

    const data = await response.json() as WikidataEntityResponse;
    return data.entities?.[qid] || null;
  }

  private extractWebsite(entity: WikidataEntityResponse['entities'][string]): string | undefined {
    const claims = entity.claims?.P856;
    if (!claims || claims.length === 0) {
      return undefined;
    }

    for (const claim of claims) {
      const value = claim.mainsnak?.datavalue?.value;
      if (value && typeof value === 'string') {
        return value;
      }
    }

    return undefined;
  }

  private pickWikipediaLink(entity: WikidataEntityResponse['entities'][string]): { lang: string; title: string } | null {
    const sitelinks = entity.sitelinks;
    if (!sitelinks) {
      return null;
    }

    for (const lang of LANG_PRIORITY) {
      const key = `${lang}wiki`;
      if (sitelinks[key]?.title) {
        return { lang, title: sitelinks[key].title };
      }
    }

    const firstKey = Object.keys(sitelinks)[0];
    if (firstKey && sitelinks[firstKey]?.title) {
      return { lang: firstKey.replace(/wiki$/, ''), title: sitelinks[firstKey].title };
    }

    return null;
  }

  private async fetchWikipediaSummary(lang: string, title: string): Promise<string | null> {
    const encodedTitle = encodeURIComponent(title.replace(/ /g, '_'));
    const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodedTitle}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const response = await fetch(url, { signal: controller.signal });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as { extract?: string };
    if (data.extract && data.extract.trim()) {
      return data.extract.trim();
    }

    return null;
  }

  private pickDescription(entity: WikidataEntityResponse['entities'][string]): string | null {
    const descriptions = entity.descriptions;
    if (!descriptions) {
      return null;
    }

    for (const lang of LANG_PRIORITY) {
      const value = descriptions[lang]?.value;
      if (value && value.trim()) {
        return value.trim();
      }
    }

    const firstKey = Object.keys(descriptions)[0];
    return firstKey ? (descriptions[firstKey]?.value || null) : null;
  }
}

export default new WikidataDescriptionService();
