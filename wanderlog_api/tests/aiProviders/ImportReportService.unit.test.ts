/**
 * Unit Tests for Import Report Service
 *
 * Tests for ImportReportGenerator class functionality
 * Requirements: 8.1, 8.2
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  ImportReportGenerator,
  createReportGenerator,
} from '../../src/services/importReportService';

describe('ImportReportGenerator', () => {
  let reporter: ImportReportGenerator;

  beforeEach(() => {
    reporter = new ImportReportGenerator();
  });

  describe('initialization', () => {
    it('should initialize with zero counts', () => {
      expect(reporter.getCreatedCount()).toBe(0);
      expect(reporter.getUpdatedCount()).toBe(0);
      expect(reporter.getSkippedCount()).toBe(0);
      expect(reporter.getReviewCount()).toBe(0);
    });
  });

  describe('setTotalEntries', () => {
    it('should set total entries count', () => {
      reporter.setTotalEntries(100);
      const report = reporter.generateReport();
      expect(report.totalEntriesInJson).toBe(100);
    });
  });

  describe('setUniqueBuildingsCount', () => {
    it('should set unique buildings count', () => {
      reporter.setUniqueBuildingsCount(80);
      const report = reporter.generateReport();
      expect(report.uniqueBuildingsAfterDedup).toBe(80);
    });
  });

  describe('recordCreated', () => {
    it('should increment created count', () => {
      reporter.recordCreated();
      expect(reporter.getCreatedCount()).toBe(1);

      reporter.recordCreated();
      expect(reporter.getCreatedCount()).toBe(2);
    });
  });

  describe('recordUpdated', () => {
    it('should increment updated count', () => {
      reporter.recordUpdated();
      expect(reporter.getUpdatedCount()).toBe(1);

      reporter.recordUpdated();
      expect(reporter.getUpdatedCount()).toBe(2);
    });
  });

  describe('recordSkipped', () => {
    it('should add skipped record with reason', () => {
      reporter.recordSkipped('Q123', 'Missing coordinates');
      expect(reporter.getSkippedCount()).toBe(1);

      const report = reporter.generateReport();
      expect(report.recordsSkipped).toHaveLength(1);
      expect(report.recordsSkipped[0]).toEqual({
        wikidataQID: 'Q123',
        reason: 'Missing coordinates',
      });
    });

    it('should accumulate multiple skipped records', () => {
      reporter.recordSkipped('Q123', 'Missing coordinates');
      reporter.recordSkipped('Q456', 'Invalid QID');
      expect(reporter.getSkippedCount()).toBe(2);
    });
  });

  describe('recordNeedsReview', () => {
    it('should add record needing review with issue', () => {
      reporter.recordNeedsReview('Q789', 'Q-number as name');
      expect(reporter.getReviewCount()).toBe(1);

      const report = reporter.generateReport();
      expect(report.recordsNeedingReview).toHaveLength(1);
      expect(report.recordsNeedingReview[0]).toEqual({
        wikidataQID: 'Q789',
        issue: 'Q-number as name',
      });
    });

    it('should accumulate multiple review records', () => {
      reporter.recordNeedsReview('Q789', 'Q-number as name');
      reporter.recordNeedsReview('Q101', 'Missing image');
      expect(reporter.getReviewCount()).toBe(2);
    });
  });

  describe('generateReport', () => {
    it('should generate report with all tracked data', () => {
      reporter.setTotalEntries(100);
      reporter.setUniqueBuildingsCount(80);
      reporter.recordCreated();
      reporter.recordCreated();
      reporter.recordUpdated();
      reporter.recordSkipped('Q123', 'Missing coordinates');
      reporter.recordNeedsReview('Q456', 'Q-number as name');

      const report = reporter.generateReport();

      expect(report.totalEntriesInJson).toBe(100);
      expect(report.uniqueBuildingsAfterDedup).toBe(80);
      expect(report.newRecordsCreated).toBe(2);
      expect(report.existingRecordsUpdated).toBe(1);
      expect(report.recordsSkipped).toHaveLength(1);
      expect(report.recordsNeedingReview).toHaveLength(1);
    });

    it('should include timestamp in ISO format', () => {
      const report = reporter.generateReport();
      expect(report.timestamp).toBeDefined();
      // Check it's a valid ISO date string
      expect(() => new Date(report.timestamp)).not.toThrow();
    });

    it('should return copies of arrays (not references)', () => {
      reporter.recordSkipped('Q123', 'Test');
      const report1 = reporter.generateReport();
      reporter.recordSkipped('Q456', 'Test2');
      const report2 = reporter.generateReport();

      expect(report1.recordsSkipped).toHaveLength(1);
      expect(report2.recordsSkipped).toHaveLength(2);
    });
  });

  describe('reset', () => {
    it('should reset all counters and records', () => {
      reporter.setTotalEntries(100);
      reporter.setUniqueBuildingsCount(80);
      reporter.recordCreated();
      reporter.recordUpdated();
      reporter.recordSkipped('Q123', 'Test');
      reporter.recordNeedsReview('Q456', 'Test');

      reporter.reset();

      expect(reporter.getCreatedCount()).toBe(0);
      expect(reporter.getUpdatedCount()).toBe(0);
      expect(reporter.getSkippedCount()).toBe(0);
      expect(reporter.getReviewCount()).toBe(0);

      const report = reporter.generateReport();
      expect(report.totalEntriesInJson).toBe(0);
      expect(report.uniqueBuildingsAfterDedup).toBe(0);
    });
  });

  describe('getSummary', () => {
    it('should return human-readable summary', () => {
      reporter.setTotalEntries(100);
      reporter.setUniqueBuildingsCount(80);
      reporter.recordCreated();
      reporter.recordCreated();
      reporter.recordUpdated();
      reporter.recordSkipped('Q123', 'Test');
      reporter.recordNeedsReview('Q456', 'Test');

      const summary = reporter.getSummary();

      expect(summary).toContain('Import Report Summary');
      expect(summary).toContain('Total entries in JSON: 100');
      expect(summary).toContain('Unique buildings after dedup: 80');
      expect(summary).toContain('New records created: 2');
      expect(summary).toContain('Existing records updated: 1');
      expect(summary).toContain('Records skipped: 1');
      expect(summary).toContain('Records needing review: 1');
    });
  });

  describe('saveReport', () => {
    const testOutputDir = './test-reports-temp';

    afterEach(() => {
      // Clean up test directory
      if (fs.existsSync(testOutputDir)) {
        const files = fs.readdirSync(testOutputDir);
        for (const file of files) {
          fs.unlinkSync(path.join(testOutputDir, file));
        }
        fs.rmdirSync(testOutputDir);
      }
    });

    it('should create output directory if it does not exist', async () => {
      reporter.setTotalEntries(10);
      await reporter.saveReport(testOutputDir);

      expect(fs.existsSync(testOutputDir)).toBe(true);
    });

    it('should save report as JSON file', async () => {
      reporter.setTotalEntries(10);
      reporter.recordCreated();

      const filepath = await reporter.saveReport(testOutputDir);

      expect(fs.existsSync(filepath)).toBe(true);
      expect(filepath).toContain('pritzker-import-report_');
      expect(filepath.endsWith('.json')).toBe(true);
    });

    it('should save valid JSON content', async () => {
      reporter.setTotalEntries(10);
      reporter.recordCreated();

      const filepath = await reporter.saveReport(testOutputDir);
      const content = fs.readFileSync(filepath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.totalEntriesInJson).toBe(10);
      expect(parsed.newRecordsCreated).toBe(1);
    });

    it('should return the filepath', async () => {
      const filepath = await reporter.saveReport(testOutputDir);

      expect(filepath).toBeDefined();
      expect(typeof filepath).toBe('string');
      expect(filepath).toContain('test-reports-temp');
    });
  });
});

describe('createReportGenerator', () => {
  it('should create a new ImportReportGenerator instance', () => {
    const reporter = createReportGenerator();
    expect(reporter).toBeInstanceOf(ImportReportGenerator);
  });

  it('should create independent instances', () => {
    const reporter1 = createReportGenerator();
    const reporter2 = createReportGenerator();

    reporter1.recordCreated();

    expect(reporter1.getCreatedCount()).toBe(1);
    expect(reporter2.getCreatedCount()).toBe(0);
  });
});
