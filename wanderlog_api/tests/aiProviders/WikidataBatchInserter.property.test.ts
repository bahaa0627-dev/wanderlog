/**
 * Property-Based Tests for Wikidata Batch Inserter
 * 
 * Feature: wikidata-import
 * 
 * Property 14: Batch Processing Size
 * *For any* import operation, database inserts should be performed in batches
 * of at most 50 records.
 * 
 * **Validates: Requirements 9.1**
 */

import * as fc from 'fast-check';
import {
  BatchInserter,
  PlaceImportData,
  PlaceTags,
} from '../../src/services/wikidataImportUtils';

// ============================================
// Mock Prisma Client
// ============================================

/**
 * Create a mock Prisma client that tracks operations
 */
function createMockPrisma() {
  const operations: Array<{ type: 'findFirst' | 'create' | 'update'; data: unknown }> = [];
  let batchCallCounts: number[] = [];
  let currentBatchCount = 0;
  
  return {
    operations,
    batchCallCounts,
    resetBatchTracking: () => {
      batchCallCounts = [];
      currentBatchCount = 0;
    },
    markBatchEnd: () => {
      if (currentBatchCount > 0) {
        batchCallCounts.push(currentBatchCount);
        currentBatchCount = 0;
      }
    },
    place: {
      findFirst: async (args: { where: { source: string; sourceDetail: string }; select: { id: boolean } }) => {
        operations.push({ type: 'findFirst', data: args });
        // Return null to simulate no existing record
        return null;
      },
      create: async (args: { data: Record<string, unknown> }) => {
        operations.push({ type: 'create', data: args });
        currentBatchCount++;
        return { id: 'mock-id' };
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        operations.push({ type: 'update', data: args });
        currentBatchCount++;
        return { id: args.where.id };
      },
    },
  };
}

// ============================================
// Test Data Generators
// ============================================

/**
 * Generator for valid QID numbers
 */
const validQIDArbitrary = fc.integer({ min: 1, max: 999999999 }).map(n => `Q${n}`);

/**
 * Generator for place names
 */
const placeNameArbitrary: fc.Arbitrary<string> = fc.constantFrom(
  'Eiffel Tower',
  'Sagrada Familia',
  'Sydney Opera House',
  'Guggenheim Museum',
  'Fallingwater',
  'Notre-Dame Cathedral',
  'Burj Khalifa',
  'Empire State Building',
  'Colosseum',
  'Taj Mahal'
);

/**
 * Generator for country names
 */
const countryNameArbitrary = fc.constantFrom(
  'France',
  'Germany',
  'United States',
  'Japan',
  'United Kingdom',
  'Italy',
  'Spain',
  'Brazil',
  'Australia',
  'Canada'
);

/**
 * Generator for city names
 */
const cityNameArbitrary = fc.constantFrom(
  'Paris',
  'Berlin',
  'New York',
  'Tokyo',
  'London',
  'Rome',
  'Madrid',
  'São Paulo',
  'Sydney',
  'Toronto'
);

/**
 * Generator for PlaceTags
 */
const placeTagsArbitrary: fc.Arbitrary<PlaceTags> = fc.record({
  style: fc.option(fc.array(fc.constantFrom('Brutalist', 'Art Deco', 'Modern'), { minLength: 1, maxLength: 2 }), { nil: undefined }),
  architect: fc.option(fc.array(fc.constantFrom('Frank Lloyd Wright', 'Zaha Hadid'), { minLength: 1, maxLength: 2 }), { nil: undefined }),
  theme: fc.option(fc.array(fc.constantFrom('artist', 'writer', 'musician'), { minLength: 1, maxLength: 2 }), { nil: undefined }),
});

/**
 * Generator for PlaceImportData
 */
const placeImportDataArbitrary: fc.Arbitrary<PlaceImportData> = fc.record({
  name: placeNameArbitrary,
  city: fc.option(cityNameArbitrary, { nil: undefined }),
  country: fc.option(countryNameArbitrary, { nil: undefined }),
  latitude: fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
  longitude: fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
  categorySlug: fc.constantFrom('architecture', 'cemetery'),
  categoryEn: fc.constantFrom('Architecture', 'Cemetery'),
  categoryZh: fc.option(fc.constantFrom('建筑', '墓地'), { nil: undefined }),
  tags: placeTagsArbitrary,
  coverImage: fc.option(fc.webUrl().map(url => `${url}/image.jpg`), { nil: undefined }),
  images: fc.array(fc.webUrl().map(url => `${url}/image.jpg`), { minLength: 0, maxLength: 3 }),
  source: fc.constant('wikidata'),
  sourceDetail: validQIDArbitrary,
  isVerified: fc.constant(true),
  customFields: fc.record({
    sitelinks: fc.option(fc.integer({ min: 0, max: 500 }), { nil: undefined }),
    dataType: fc.constantFrom('architecture', 'cemetery'),
  }),
});

// ============================================
// Property Tests
// ============================================

describe('Wikidata Batch Inserter - Property Tests', () => {
  
  // ============================================
  // Property 14: Batch Processing Size
  // ============================================
  
  /**
   * Feature: wikidata-import, Property 14: Batch Processing Size
   * 
   * *For any* import operation, database inserts should be performed in batches
   * of at most 50 records.
   * 
   * **Validates: Requirements 9.1**
   */
  describe('Property 14: Batch Processing Size', () => {
    
    /**
     * Default batch size should be 50
     */
    it('should have default batch size of 50', () => {
      fc.assert(
        fc.property(
          fc.constant(null),
          () => {
            const mockPrisma = createMockPrisma();
            const inserter = new BatchInserter(mockPrisma);
            return inserter.getBatchSize() === 50;
          }
        ),
        { numRuns: 10 }
      );
    });

    /**
     * Custom batch size should be respected
     */
    it('should respect custom batch size', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 200 }),
          (batchSize: number) => {
            const mockPrisma = createMockPrisma();
            const inserter = new BatchInserter(mockPrisma, batchSize);
            return inserter.getBatchSize() === batchSize;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * setBatchSize should update the batch size
     */
    it('should allow updating batch size via setBatchSize', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 200 }),
          fc.integer({ min: 1, max: 200 }),
          (initialSize: number, newSize: number) => {
            const mockPrisma = createMockPrisma();
            const inserter = new BatchInserter(mockPrisma, initialSize);
            inserter.setBatchSize(newSize);
            return inserter.getBatchSize() === newSize;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * setBatchSize should ignore non-positive values
     */
    it('should ignore non-positive batch sizes', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 200 }),
          fc.integer({ min: -100, max: 0 }),
          (initialSize: number, invalidSize: number) => {
            const mockPrisma = createMockPrisma();
            const inserter = new BatchInserter(mockPrisma, initialSize);
            inserter.setBatchSize(invalidSize);
            // Should keep the original size
            return inserter.getBatchSize() === initialSize;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * insertBatch should process all records
     */
    it('should process all records in insertBatch', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(placeImportDataArbitrary, { minLength: 1, maxLength: 100 }),
          async (places: PlaceImportData[]) => {
            const mockPrisma = createMockPrisma();
            const inserter = new BatchInserter(mockPrisma, 50);
            
            const result = await inserter.insertBatch(places);
            
            // Total processed should equal input count
            return result.success + result.failed === places.length;
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * insertBatch should return correct success count when no errors
     */
    it('should return correct success count when no errors', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(placeImportDataArbitrary, { minLength: 1, maxLength: 50 }),
          async (places: PlaceImportData[]) => {
            const mockPrisma = createMockPrisma();
            const inserter = new BatchInserter(mockPrisma, 50);
            
            const result = await inserter.insertBatch(places);
            
            // All should succeed with mock that doesn't throw
            return result.success === places.length && result.failed === 0;
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * insertBatch should call database operations for each record
     */
    it('should call database operations for each record', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(placeImportDataArbitrary, { minLength: 1, maxLength: 30 }),
          async (places: PlaceImportData[]) => {
            const mockPrisma = createMockPrisma();
            const inserter = new BatchInserter(mockPrisma, 50);
            
            await inserter.insertBatch(places);
            
            // Should have findFirst + create for each record (since mock returns null for findFirst)
            const findFirstCount = mockPrisma.operations.filter(op => op.type === 'findFirst').length;
            const createCount = mockPrisma.operations.filter(op => op.type === 'create').length;
            
            return findFirstCount === places.length && createCount === places.length;
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * upsertPlace should create new record when not exists
     */
    it('should create new record when not exists', async () => {
      await fc.assert(
        fc.asyncProperty(
          placeImportDataArbitrary,
          async (place: PlaceImportData) => {
            const mockPrisma = createMockPrisma();
            const inserter = new BatchInserter(mockPrisma, 50);
            
            const result = await inserter.upsertPlace(place);
            
            // Should return 'created' since mock findFirst returns null
            return result === 'created';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * upsertPlace should update existing record when exists
     */
    it('should update existing record when exists', async () => {
      await fc.assert(
        fc.asyncProperty(
          placeImportDataArbitrary,
          async (place: PlaceImportData) => {
            // Create mock that returns existing record
            const mockPrisma = {
              place: {
                findFirst: async () => ({ id: 'existing-id' }),
                create: async () => ({ id: 'new-id' }),
                update: async () => ({ id: 'existing-id' }),
              },
            };
            const inserter = new BatchInserter(mockPrisma, 50);
            
            const result = await inserter.upsertPlace(place);
            
            // Should return 'updated' since mock findFirst returns existing record
            return result === 'updated';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * upsertPlace should return error on database failure
     */
    it('should return error on database failure', async () => {
      await fc.assert(
        fc.asyncProperty(
          placeImportDataArbitrary,
          async (place: PlaceImportData) => {
            // Create mock that throws error
            const mockPrisma = {
              place: {
                findFirst: async () => { throw new Error('Database error'); },
                create: async () => ({ id: 'new-id' }),
                update: async () => ({ id: 'existing-id' }),
              },
            };
            const inserter = new BatchInserter(mockPrisma, 50);
            
            const result = await inserter.upsertPlace(place);
            
            // Should return 'error' since mock throws
            return result === 'error';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * InsertResult errors array should contain QIDs of failed records
     */
    it('should track failed QIDs in errors array', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(placeImportDataArbitrary, { minLength: 1, maxLength: 10 }),
          async (places: PlaceImportData[]) => {
            // Create mock that fails on create
            const mockPrisma = {
              place: {
                findFirst: async () => null,
                create: async () => { throw new Error('Insert failed'); },
                update: async () => ({ id: 'existing-id' }),
              },
            };
            const inserter = new BatchInserter(mockPrisma, 50);
            
            const result = await inserter.insertBatch(places);
            
            // All should fail
            if (result.failed !== places.length) return false;
            
            // Errors should contain all QIDs
            const errorQIDs = result.errors.map(e => e.qid);
            for (const place of places) {
              if (!errorQIDs.includes(place.sourceDetail)) {
                return false;
              }
            }
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
