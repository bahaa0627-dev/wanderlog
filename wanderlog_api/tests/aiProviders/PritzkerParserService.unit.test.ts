/**
 * Unit Tests for Pritzker Parser Service
 * 
 * Tests for deduplication and city selection logic
 */

import {
  selectBestCity,
  deduplicateEntries,
  classifyCategory,
  generateTags,
  generateAiTags,
  convertWikimediaUrl,
  collectUniqueImages,
} from '../../src/services/pritzkerParserService';
import { WikidataArchitectureEntry } from '../../src/types/pritzkerArchitecture';

describe('Pritzker Parser Service - City Selection', () => {
  describe('selectBestCity', () => {
    it('should return empty string for empty array', () => {
      expect(selectBestCity([])).toBe('');
    });

    it('should return the only city when array has one element', () => {
      expect(selectBestCity(['Paris'])).toBe('Paris');
    });

    it('should prefer cities without "arrondissement"', () => {
      const cities = ['Paris', '1st arrondissement of Paris'];
      expect(selectBestCity(cities)).toBe('Paris');
    });

    it('should prefer cities without "District"', () => {
      const cities = ['London', 'Westminster District'];
      expect(selectBestCity(cities)).toBe('London');
    });

    it('should prefer cities without "Subdistrict"', () => {
      const cities = ['Bangkok', 'Pathum Wan Subdistrict'];
      expect(selectBestCity(cities)).toBe('Bangkok');
    });

    it('should select shortest city when all contain administrative terms', () => {
      const cities = ['1st arrondissement of Paris', '2nd arrondissement'];
      expect(selectBestCity(cities)).toBe('2nd arrondissement');
    });

    it('should select shortest city when none contain administrative terms', () => {
      const cities = ['New York City', 'NYC', 'New York'];
      expect(selectBestCity(cities)).toBe('NYC');
    });

    it('should handle multiple cities without administrative terms', () => {
      const cities = ['Paris', 'Lyon', 'Marseille'];
      expect(selectBestCity(cities)).toBe('Lyon'); // Shortest
    });
  });
});

describe('Pritzker Parser Service - Deduplication', () => {
  describe('deduplicateEntries', () => {
    it('should return empty array for empty input', () => {
      expect(deduplicateEntries([])).toEqual([]);
    });

    it('should handle single entry', () => {
      const entries: WikidataArchitectureEntry[] = [
        {
          architect: 'http://www.wikidata.org/entity/Q134165',
          architectLabel: 'Oscar Niemeyer',
          work: 'http://www.wikidata.org/entity/Q281521',
          workLabel: 'Sambadrome',
          coord: 'Point(-43.196851 -22.911384)',
          cityLabel: 'Rio de Janeiro',
          countryLabel: 'Brazil',
          image: 'http://commons.wikimedia.org/image1.jpg',
        },
      ];

      const result = deduplicateEntries(entries);

      expect(result).toHaveLength(1);
      expect(result[0].wikidataQID).toBe('Q281521');
      expect(result[0].architectQID).toBe('Q134165');
      expect(result[0].architectLabel).toBe('Oscar Niemeyer');
      expect(result[0].workLabel).toBe('Sambadrome');
      expect(result[0].latitude).toBeCloseTo(-22.911384, 5);
      expect(result[0].longitude).toBeCloseTo(-43.196851, 5);
      expect(result[0].cities).toEqual(['Rio de Janeiro']);
      expect(result[0].country).toBe('Brazil');
      // Images are converted to HTTPS by collectUniqueImages (Requirements 7.1)
      expect(result[0].images).toEqual(['https://commons.wikimedia.org/image1.jpg']);
    });

    it('should merge duplicate entries with same QID', () => {
      const entries: WikidataArchitectureEntry[] = [
        {
          architect: 'http://www.wikidata.org/entity/Q134165',
          architectLabel: 'Oscar Niemeyer',
          work: 'http://www.wikidata.org/entity/Q281521',
          workLabel: 'Sambadrome',
          coord: 'Point(-43.196851 -22.911384)',
          cityLabel: 'Rio de Janeiro',
          countryLabel: 'Brazil',
          image: 'http://commons.wikimedia.org/image1.jpg',
        },
        {
          architect: 'http://www.wikidata.org/entity/Q134165',
          architectLabel: 'Oscar Niemeyer',
          work: 'http://www.wikidata.org/entity/Q281521',
          workLabel: 'Sambadrome',
          coord: 'Point(-43.196851 -22.911384)',
          cityLabel: '1st arrondissement of Rio',
          countryLabel: 'Brazil',
          image: 'http://commons.wikimedia.org/image2.jpg',
        },
      ];

      const result = deduplicateEntries(entries);

      expect(result).toHaveLength(1);
      expect(result[0].wikidataQID).toBe('Q281521');
      expect(result[0].cities).toHaveLength(2);
      expect(result[0].cities).toContain('Rio de Janeiro');
      expect(result[0].cities).toContain('1st arrondissement of Rio');
      expect(result[0].images).toHaveLength(2);
      // Images are converted to HTTPS by collectUniqueImages (Requirements 7.1)
      expect(result[0].images).toContain('https://commons.wikimedia.org/image1.jpg');
      expect(result[0].images).toContain('https://commons.wikimedia.org/image2.jpg');
    });

    it('should deduplicate images from duplicate entries', () => {
      const entries: WikidataArchitectureEntry[] = [
        {
          architect: 'http://www.wikidata.org/entity/Q134165',
          architectLabel: 'Oscar Niemeyer',
          work: 'http://www.wikidata.org/entity/Q281521',
          workLabel: 'Sambadrome',
          coord: 'Point(-43.196851 -22.911384)',
          cityLabel: 'Rio de Janeiro',
          countryLabel: 'Brazil',
          image: 'http://commons.wikimedia.org/image1.jpg',
        },
        {
          architect: 'http://www.wikidata.org/entity/Q134165',
          architectLabel: 'Oscar Niemeyer',
          work: 'http://www.wikidata.org/entity/Q281521',
          workLabel: 'Sambadrome',
          coord: 'Point(-43.196851 -22.911384)',
          cityLabel: 'Rio de Janeiro',
          countryLabel: 'Brazil',
          image: 'http://commons.wikimedia.org/image1.jpg', // Same image
        },
      ];

      const result = deduplicateEntries(entries);

      expect(result).toHaveLength(1);
      expect(result[0].images).toHaveLength(1);
      // Images are converted to HTTPS by collectUniqueImages (Requirements 7.1)
      expect(result[0].images).toEqual(['https://commons.wikimedia.org/image1.jpg']);
    });

    it('should skip entries without valid work QID', () => {
      const entries: WikidataArchitectureEntry[] = [
        {
          architect: 'http://www.wikidata.org/entity/Q134165',
          architectLabel: 'Oscar Niemeyer',
          work: 'invalid-url',
          workLabel: 'Sambadrome',
          coord: 'Point(-43.196851 -22.911384)',
          cityLabel: 'Rio de Janeiro',
          countryLabel: 'Brazil',
        },
      ];

      const result = deduplicateEntries(entries);

      expect(result).toHaveLength(0);
    });

    it('should skip entries without valid architect QID', () => {
      const entries: WikidataArchitectureEntry[] = [
        {
          architect: 'invalid-url',
          architectLabel: 'Oscar Niemeyer',
          work: 'http://www.wikidata.org/entity/Q281521',
          workLabel: 'Sambadrome',
          coord: 'Point(-43.196851 -22.911384)',
          cityLabel: 'Rio de Janeiro',
          countryLabel: 'Brazil',
        },
      ];

      const result = deduplicateEntries(entries);

      expect(result).toHaveLength(0);
    });

    it('should skip entries without valid coordinates', () => {
      const entries: WikidataArchitectureEntry[] = [
        {
          architect: 'http://www.wikidata.org/entity/Q134165',
          architectLabel: 'Oscar Niemeyer',
          work: 'http://www.wikidata.org/entity/Q281521',
          workLabel: 'Sambadrome',
          coord: 'invalid-coord',
          cityLabel: 'Rio de Janeiro',
          countryLabel: 'Brazil',
        },
      ];

      const result = deduplicateEntries(entries);

      expect(result).toHaveLength(0);
    });

    it('should skip entries without coord field', () => {
      const entries: WikidataArchitectureEntry[] = [
        {
          architect: 'http://www.wikidata.org/entity/Q134165',
          architectLabel: 'Oscar Niemeyer',
          work: 'http://www.wikidata.org/entity/Q281521',
          workLabel: 'Sambadrome',
          cityLabel: 'Rio de Janeiro',
          countryLabel: 'Brazil',
        },
      ];

      const result = deduplicateEntries(entries);

      expect(result).toHaveLength(0);
    });

    it('should handle multiple different buildings', () => {
      const entries: WikidataArchitectureEntry[] = [
        {
          architect: 'http://www.wikidata.org/entity/Q134165',
          architectLabel: 'Oscar Niemeyer',
          work: 'http://www.wikidata.org/entity/Q281521',
          workLabel: 'Sambadrome',
          coord: 'Point(-43.196851 -22.911384)',
          cityLabel: 'Rio de Janeiro',
          countryLabel: 'Brazil',
        },
        {
          architect: 'http://www.wikidata.org/entity/Q134165',
          architectLabel: 'Oscar Niemeyer',
          work: 'http://www.wikidata.org/entity/Q999999',
          workLabel: 'Another Building',
          coord: 'Point(-43.2 -22.9)',
          cityLabel: 'Rio de Janeiro',
          countryLabel: 'Brazil',
        },
      ];

      const result = deduplicateEntries(entries);

      expect(result).toHaveLength(2);
      expect(result[0].wikidataQID).toBe('Q281521');
      expect(result[1].wikidataQID).toBe('Q999999');
    });

    it('should filter out empty city labels', () => {
      const entries: WikidataArchitectureEntry[] = [
        {
          architect: 'http://www.wikidata.org/entity/Q134165',
          architectLabel: 'Oscar Niemeyer',
          work: 'http://www.wikidata.org/entity/Q281521',
          workLabel: 'Sambadrome',
          coord: 'Point(-43.196851 -22.911384)',
          cityLabel: 'Rio de Janeiro',
          countryLabel: 'Brazil',
        },
        {
          architect: 'http://www.wikidata.org/entity/Q134165',
          architectLabel: 'Oscar Niemeyer',
          work: 'http://www.wikidata.org/entity/Q281521',
          workLabel: 'Sambadrome',
          coord: 'Point(-43.196851 -22.911384)',
          cityLabel: '',
          countryLabel: 'Brazil',
        },
      ];

      const result = deduplicateEntries(entries);

      expect(result).toHaveLength(1);
      expect(result[0].cities).toEqual(['Rio de Janeiro']);
    });

    it('should filter out empty image URLs', () => {
      const entries: WikidataArchitectureEntry[] = [
        {
          architect: 'http://www.wikidata.org/entity/Q134165',
          architectLabel: 'Oscar Niemeyer',
          work: 'http://www.wikidata.org/entity/Q281521',
          workLabel: 'Sambadrome',
          coord: 'Point(-43.196851 -22.911384)',
          cityLabel: 'Rio de Janeiro',
          countryLabel: 'Brazil',
          image: 'http://commons.wikimedia.org/image1.jpg',
        },
        {
          architect: 'http://www.wikidata.org/entity/Q134165',
          architectLabel: 'Oscar Niemeyer',
          work: 'http://www.wikidata.org/entity/Q281521',
          workLabel: 'Sambadrome',
          coord: 'Point(-43.196851 -22.911384)',
          cityLabel: 'Rio de Janeiro',
          countryLabel: 'Brazil',
          image: '',
        },
      ];

      const result = deduplicateEntries(entries);

      expect(result).toHaveLength(1);
      // Images are converted to HTTPS by collectUniqueImages (Requirements 7.1)
      expect(result[0].images).toEqual(['https://commons.wikimedia.org/image1.jpg']);
    });
  });
});

describe('Pritzker Parser Service - Category Classification', () => {
  describe('classifyCategory', () => {
    it('should return default category for empty string', () => {
      const result = classifyCategory('');
      expect(result.category).toBe('architecture');
      expect(result.categorySlug).toBe('architecture');
      expect(result.categoryEn).toBe('Architecture');
      expect(result.categoryZh).toBe('建筑');
    });

    it('should classify museum correctly', () => {
      const result = classifyCategory('National Museum of Art');
      expect(result.category).toBe('museum');
      expect(result.categoryEn).toBe('Museum');
    });

    it('should classify gallery correctly', () => {
      const result = classifyCategory('Modern Art Gallery');
      expect(result.category).toBe('museum');
      expect(result.categoryEn).toBe('Museum');
    });

    it('should classify church correctly', () => {
      const result = classifyCategory('Cathedral of Brasília');
      expect(result.category).toBe('church');
      expect(result.categoryEn).toBe('Church');
    });

    it('should classify university correctly', () => {
      const result = classifyCategory('University Campus Building');
      expect(result.category).toBe('university');
      expect(result.categoryEn).toBe('University');
    });

    it('should classify library correctly', () => {
      const result = classifyCategory('Central Library');
      expect(result.category).toBe('library');
      expect(result.categoryEn).toBe('Library');
    });

    it('should classify stadium correctly', () => {
      const result = classifyCategory('Olympic Stadium');
      expect(result.category).toBe('stadium');
      expect(result.categoryEn).toBe('Stadium');
    });

    it('should classify theater correctly', () => {
      const result = classifyCategory('Opera House');
      expect(result.category).toBe('theater');
      expect(result.categoryEn).toBe('Theater');
    });

    it('should classify hospital correctly', () => {
      const result = classifyCategory('Medical Center Hospital');
      expect(result.category).toBe('hospital');
      expect(result.categoryEn).toBe('Hospital');
    });

    it('should classify station correctly', () => {
      const result = classifyCategory('Central Station Terminal');
      expect(result.category).toBe('station');
      expect(result.categoryEn).toBe('Station');
    });

    it('should classify pavilion correctly', () => {
      const result = classifyCategory('Barcelona Pavilion');
      expect(result.category).toBe('pavilion');
      expect(result.categoryEn).toBe('Pavilion');
    });

    it('should classify building correctly', () => {
      const result = classifyCategory('Office Tower Building');
      expect(result.category).toBe('building');
      expect(result.categoryEn).toBe('Building');
    });

    it('should be case-insensitive', () => {
      const result = classifyCategory('MUSEUM OF MODERN ART');
      expect(result.category).toBe('museum');
    });

    it('should return default for unmatched keywords', () => {
      const result = classifyCategory('Some Random Structure');
      expect(result.category).toBe('architecture');
    });

    it('should match first rule when multiple keywords present', () => {
      // "Museum" comes before "Building" in rules
      const result = classifyCategory('Museum Building');
      expect(result.category).toBe('museum');
    });
  });
});

describe('Pritzker Parser Service - Tag Generation', () => {
  describe('generateTags', () => {
    it('should generate tags with Pritzker award', () => {
      const result = generateTags('Oscar Niemeyer');
      expect(result.award).toEqual(['Pritzker']);
    });

    it('should generate tags with Architecture style', () => {
      const result = generateTags('Oscar Niemeyer');
      expect(result.style).toEqual(['Architecture']);
    });

    it('should generate architect tag', () => {
      const result = generateTags('Oscar Niemeyer');
      expect(result.architect).toEqual(['OscarNiemeyer']);
    });

    it('should handle architect names with dots', () => {
      const result = generateTags('I. M. Pei');
      expect(result.architect).toEqual(['IMPei']);
    });

    it('should handle architect names with accents', () => {
      const result = generateTags('Kenzō Tange');
      expect(result.architect).toEqual(['KenzoTange']);
    });

    it('should return empty architect array for empty name', () => {
      const result = generateTags('');
      expect(result.architect).toEqual([]);
    });

    it('should always include all three tag types', () => {
      const result = generateTags('Oscar Niemeyer');
      expect(result).toHaveProperty('award');
      expect(result).toHaveProperty('style');
      expect(result).toHaveProperty('architect');
    });
  });

  describe('generateAiTags', () => {
    it('should generate AI tags with correct priorities', () => {
      const tags = {
        award: ['Pritzker'],
        style: ['Architecture'],
        architect: ['OscarNiemeyer'],
      };
      const result = generateAiTags(tags);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ en: 'Pritzker', priority: 100 });
      expect(result[1]).toEqual({ en: 'OscarNiemeyer', priority: 90 });
      expect(result[2]).toEqual({ en: 'Architecture', priority: 50 });
    });

    it('should sort tags by priority descending', () => {
      const tags = {
        award: ['Pritzker'],
        style: ['Architecture'],
        architect: ['OscarNiemeyer'],
      };
      const result = generateAiTags(tags);

      // Check that priorities are in descending order
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].priority).toBeGreaterThanOrEqual(result[i + 1].priority);
      }
    });

    it('should handle multiple architects', () => {
      const tags = {
        award: ['Pritzker'],
        style: ['Architecture'],
        architect: ['OscarNiemeyer', 'IMPei'],
      };
      const result = generateAiTags(tags);

      expect(result).toHaveLength(4);
      const architectTags = result.filter((t) => t.priority === 90);
      expect(architectTags).toHaveLength(2);
    });

    it('should assign priority 80 to specific style tags', () => {
      const tags = {
        award: ['Pritzker'],
        style: ['Modernism', 'Architecture'],
        architect: ['OscarNiemeyer'],
      };
      const result = generateAiTags(tags);

      const modernismTag = result.find((t) => t.en === 'Modernism');
      expect(modernismTag?.priority).toBe(80);

      const architectureTag = result.find((t) => t.en === 'Architecture');
      expect(architectureTag?.priority).toBe(50);
    });

    it('should handle empty architect array', () => {
      const tags = {
        award: ['Pritzker'],
        style: ['Architecture'],
        architect: [],
      };
      const result = generateAiTags(tags);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ en: 'Pritzker', priority: 100 });
      expect(result[1]).toEqual({ en: 'Architecture', priority: 50 });
    });

    it('should maintain correct order with multiple tags of same priority', () => {
      const tags = {
        award: ['Pritzker', 'AnotherAward'],
        style: ['Architecture'],
        architect: ['OscarNiemeyer'],
      };
      const result = generateAiTags(tags);

      const awardTags = result.filter((t) => t.priority === 100);
      expect(awardTags).toHaveLength(2);
    });
  });
});


describe('Pritzker Parser Service - Image Processing', () => {
  describe('convertWikimediaUrl', () => {
    it('should convert http:// to https://', () => {
      const url = 'http://commons.wikimedia.org/wiki/Special:FilePath/Image.jpg';
      const result = convertWikimediaUrl(url);
      expect(result).toBe('https://commons.wikimedia.org/wiki/Special:FilePath/Image.jpg');
    });

    it('should preserve https:// URLs unchanged', () => {
      const url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Image.jpg';
      const result = convertWikimediaUrl(url);
      expect(result).toBe('https://commons.wikimedia.org/wiki/Special:FilePath/Image.jpg');
    });

    it('should return empty string for empty input', () => {
      expect(convertWikimediaUrl('')).toBe('');
    });

    it('should return empty string for null/undefined input', () => {
      expect(convertWikimediaUrl(null as any)).toBe('');
      expect(convertWikimediaUrl(undefined as any)).toBe('');
    });

    it('should handle URLs with encoded characters', () => {
      const url = 'http://commons.wikimedia.org/wiki/Special:FilePath/Image%20Name.jpg';
      const result = convertWikimediaUrl(url);
      expect(result).toBe('https://commons.wikimedia.org/wiki/Special:FilePath/Image%20Name.jpg');
    });

    it('should be case-insensitive for http protocol', () => {
      const url = 'HTTP://commons.wikimedia.org/wiki/Special:FilePath/Image.jpg';
      const result = convertWikimediaUrl(url);
      expect(result).toBe('https://commons.wikimedia.org/wiki/Special:FilePath/Image.jpg');
    });
  });

  describe('collectUniqueImages', () => {
    it('should return empty array for empty input', () => {
      expect(collectUniqueImages([])).toEqual([]);
    });

    it('should return empty array for null/undefined input', () => {
      expect(collectUniqueImages(null as any)).toEqual([]);
      expect(collectUniqueImages(undefined as any)).toEqual([]);
    });

    it('should return single image unchanged', () => {
      const images = ['https://commons.wikimedia.org/image1.jpg'];
      const result = collectUniqueImages(images);
      expect(result).toEqual(['https://commons.wikimedia.org/image1.jpg']);
    });

    it('should remove duplicate images', () => {
      const images = [
        'https://commons.wikimedia.org/image1.jpg',
        'https://commons.wikimedia.org/image1.jpg',
        'https://commons.wikimedia.org/image2.jpg',
      ];
      const result = collectUniqueImages(images);
      expect(result).toHaveLength(2);
      expect(result).toContain('https://commons.wikimedia.org/image1.jpg');
      expect(result).toContain('https://commons.wikimedia.org/image2.jpg');
    });

    it('should convert http:// to https://', () => {
      const images = ['http://commons.wikimedia.org/image1.jpg'];
      const result = collectUniqueImages(images);
      expect(result).toEqual(['https://commons.wikimedia.org/image1.jpg']);
    });

    it('should deduplicate after converting to https', () => {
      const images = [
        'http://commons.wikimedia.org/image1.jpg',
        'https://commons.wikimedia.org/image1.jpg',
      ];
      const result = collectUniqueImages(images);
      expect(result).toHaveLength(1);
      expect(result).toEqual(['https://commons.wikimedia.org/image1.jpg']);
    });

    it('should filter out empty strings', () => {
      const images = [
        'https://commons.wikimedia.org/image1.jpg',
        '',
        'https://commons.wikimedia.org/image2.jpg',
      ];
      const result = collectUniqueImages(images);
      expect(result).toHaveLength(2);
      expect(result).not.toContain('');
    });

    it('should filter out whitespace-only strings', () => {
      const images = [
        'https://commons.wikimedia.org/image1.jpg',
        '   ',
        'https://commons.wikimedia.org/image2.jpg',
      ];
      const result = collectUniqueImages(images);
      expect(result).toHaveLength(2);
    });

    it('should filter out null/undefined values in array', () => {
      const images = [
        'https://commons.wikimedia.org/image1.jpg',
        null as any,
        undefined as any,
        'https://commons.wikimedia.org/image2.jpg',
      ];
      const result = collectUniqueImages(images);
      expect(result).toHaveLength(2);
    });

    it('should handle multiple unique images', () => {
      const images = [
        'https://commons.wikimedia.org/image1.jpg',
        'https://commons.wikimedia.org/image2.jpg',
        'https://commons.wikimedia.org/image3.jpg',
      ];
      const result = collectUniqueImages(images);
      expect(result).toHaveLength(3);
    });

    it('should preserve order of first occurrence', () => {
      const images = [
        'https://commons.wikimedia.org/image1.jpg',
        'https://commons.wikimedia.org/image2.jpg',
        'https://commons.wikimedia.org/image1.jpg',
      ];
      const result = collectUniqueImages(images);
      expect(result[0]).toBe('https://commons.wikimedia.org/image1.jpg');
      expect(result[1]).toBe('https://commons.wikimedia.org/image2.jpg');
    });
  });
});
