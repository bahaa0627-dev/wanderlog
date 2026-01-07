/**
 * Import Report Service
 * 导入报告服务
 *
 * Tracks import statistics and generates reports for Pritzker Architecture imports.
 * Provides functionality to track new records, updates, skipped records, and records
 * needing manual review.
 *
 * Requirements: 8.1, 8.2
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  ImportReport,
  SkippedRecord,
  ReviewRecord,
} from '../types/pritzkerArchitecture';

/**
 * ImportReportGenerator class
 *
 * Tracks import statistics during the import process and generates
 * a comprehensive report at the end.
 *
 * Usage:
 * ```typescript
 * const reporter = new ImportReportGenerator();
 * reporter.setTotalEntries(100);
 * reporter.setUniqueBuildingsCount(80);
 * reporter.recordCreated();
 * reporter.recordUpdated();
 * reporter.recordSkipped('Q123', 'Missing coordinates');
 * reporter.recordNeedsReview('Q456', 'Q-number as name');
 * const report = reporter.generateReport();
 * await reporter.saveReport('./reports');
 * ```
 *
 * Requirements: 8.1
 */
export class ImportReportGenerator {
  private totalEntriesInJson: number = 0;
  private uniqueBuildingsAfterDedup: number = 0;
  private newRecordsCreated: number = 0;
  private existingRecordsUpdated: number = 0;
  private recordsSkipped: SkippedRecord[] = [];
  private recordsNeedingReview: ReviewRecord[] = [];

  /**
   * Set the total number of entries in the source JSON file
   *
   * @param count - Total entries count
   */
  setTotalEntries(count: number): void {
    this.totalEntriesInJson = count;
  }

  /**
   * Set the number of unique buildings after deduplication
   *
   * @param count - Unique buildings count
   */
  setUniqueBuildingsCount(count: number): void {
    this.uniqueBuildingsAfterDedup = count;
  }

  /**
   * Record that a new place was created in the database
   */
  recordCreated(): void {
    this.newRecordsCreated++;
  }

  /**
   * Record that an existing place was updated in the database
   */
  recordUpdated(): void {
    this.existingRecordsUpdated++;
  }

  /**
   * Record that an entry was skipped during import
   *
   * @param wikidataQID - Wikidata QID of the skipped record
   * @param reason - Reason for skipping
   */
  recordSkipped(wikidataQID: string, reason: string): void {
    this.recordsSkipped.push({ wikidataQID, reason });
  }

  /**
   * Record that an entry needs manual review
   *
   * @param wikidataQID - Wikidata QID of the record
   * @param issue - Issue description
   */
  recordNeedsReview(wikidataQID: string, issue: string): void {
    this.recordsNeedingReview.push({ wikidataQID, issue });
  }

  /**
   * Get the count of new records created
   */
  getCreatedCount(): number {
    return this.newRecordsCreated;
  }

  /**
   * Get the count of existing records updated
   */
  getUpdatedCount(): number {
    return this.existingRecordsUpdated;
  }

  /**
   * Get the count of records skipped
   */
  getSkippedCount(): number {
    return this.recordsSkipped.length;
  }

  /**
   * Get the count of records needing review
   */
  getReviewCount(): number {
    return this.recordsNeedingReview.length;
  }

  /**
   * Generate the import report
   *
   * Creates an ImportReport object with all tracked statistics
   * and the current timestamp.
   *
   * @returns ImportReport object
   *
   * Requirements: 8.1
   */
  generateReport(): ImportReport {
    return {
      timestamp: new Date().toISOString(),
      totalEntriesInJson: this.totalEntriesInJson,
      uniqueBuildingsAfterDedup: this.uniqueBuildingsAfterDedup,
      newRecordsCreated: this.newRecordsCreated,
      existingRecordsUpdated: this.existingRecordsUpdated,
      recordsSkipped: [...this.recordsSkipped],
      recordsNeedingReview: [...this.recordsNeedingReview],
    };
  }

  /**
   * Save the report to a JSON file with timestamp
   *
   * Creates a JSON file in the specified directory with a filename
   * containing the current timestamp for easy identification.
   *
   * @param outputDir - Directory to save the report (default: './reports')
   * @returns Path to the saved report file
   *
   * Requirements: 8.2
   */
  async saveReport(outputDir: string = './reports'): Promise<string> {
    // Ensure the output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate the report
    const report = this.generateReport();

    // Create filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `pritzker-import-report_${timestamp}.json`;
    const filepath = path.join(outputDir, filename);

    // Write the report to file
    fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf-8');

    return filepath;
  }

  /**
   * Reset all counters and records
   *
   * Useful for running multiple imports in sequence
   */
  reset(): void {
    this.totalEntriesInJson = 0;
    this.uniqueBuildingsAfterDedup = 0;
    this.newRecordsCreated = 0;
    this.existingRecordsUpdated = 0;
    this.recordsSkipped = [];
    this.recordsNeedingReview = [];
  }

  /**
   * Get a summary string for logging
   *
   * @returns Human-readable summary of the import
   */
  getSummary(): string {
    return [
      `Import Report Summary:`,
      `  Total entries in JSON: ${this.totalEntriesInJson}`,
      `  Unique buildings after dedup: ${this.uniqueBuildingsAfterDedup}`,
      `  New records created: ${this.newRecordsCreated}`,
      `  Existing records updated: ${this.existingRecordsUpdated}`,
      `  Records skipped: ${this.recordsSkipped.length}`,
      `  Records needing review: ${this.recordsNeedingReview.length}`,
    ].join('\n');
  }
}

/**
 * Create a new ImportReportGenerator instance
 *
 * Factory function for creating report generators.
 *
 * @returns New ImportReportGenerator instance
 */
export function createReportGenerator(): ImportReportGenerator {
  return new ImportReportGenerator();
}
