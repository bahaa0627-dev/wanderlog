# Implementation Plan: Pritzker Architecture Import Fix

## Overview

This plan addresses the critical issue where only 5 out of 794 Pritzker Prize architect works have been persisted to the database. The implementation focuses on re-running the import, verifying success, and ensuring proper tagging for filtering.

## Tasks

- [ ] 1. Verify current database state and backup
  - Check current count of Pritzker buildings in database
  - Document current state for comparison
  - Create database backup before import
  - _Requirements: 5.1, 5.3_

- [ ] 2. Run Pritzker import script
  - [ ] 2.1 Execute import script with source file
    - Run: `npx tsx scripts/import-pritzker-architecture.ts --file "../Architecture from wikidata/Architecture list.json"`
    - Monitor console output for errors
    - Wait for completion and report generation
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ]* 2.2 Write property test for complete import
    - **Property 1: Complete Import**
    - **Validates: Requirements 1.1, 1.4**

  - [ ] 2.3 Verify import report
    - Check report shows 794 unique buildings after deduplication
    - Verify newRecordsCreated + existingRecordsUpdated = 794
    - Check for any skipped records or errors
    - _Requirements: 3.3, 3.4, 5.1, 5.2_

- [ ] 3. Verify database contains all Pritzker buildings
  - [ ] 3.1 Create verification script
    - Write script to count places with Pritzker architect names
    - Check for places with wikidataWorkURL in customFields
    - Verify tags.award contains 'Pritzker'
    - _Requirements: 5.3, 5.4_

  - [ ]* 3.2 Write property test for Pritzker award tagging
    - **Property 2: Pritzker Award Tagging**
    - **Validates: Requirements 2.1, 2.2**

  - [ ] 3.3 Run verification script
    - Execute verification script
    - Confirm count equals 794 (or expected number after deduplication)
    - Document any discrepancies
    - _Requirements: 5.3_

- [ ] 4. Verify tag structure and filtering
  - [ ] 4.1 Check tag structure in database
    - Query sample of imported places
    - Verify tags.award contains ['Pritzker']
    - Verify tags.architect contains formatted architect name
    - Verify customFields contains architect, architectQID, wikidataWorkURL
    - _Requirements: 2.1, 2.2, 4.1, 4.2, 4.3, 4.4_

  - [ ]* 4.2 Write property test for architect attribution
    - **Property 3: Architect Attribution**
    - **Validates: Requirements 4.1, 4.2, 4.3**

  - [ ] 4.3 Test Pritzker filter query
    - Query places with tags.award containing 'Pritzker'
    - Verify count matches expected 794
    - Verify results include various architects
    - _Requirements: 2.3, 2.4_

  - [ ]* 4.4 Write property test for filter count accuracy
    - **Property 5: Filter Count Accuracy**
    - **Validates: Requirements 2.3, 2.4**

- [ ] 5. Checkpoint - Verify import success
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Fix any missing or incorrect data
  - [ ] 6.1 Identify records with issues
    - Check for places missing Pritzker tag
    - Check for places missing architect in customFields
    - Check for duplicate records (same Wikidata QID)
    - _Requirements: 3.1, 3.2_

  - [ ]* 6.2 Write property test for deduplication consistency
    - **Property 4: Deduplication Consistency**
    - **Validates: Requirements 3.2**

  - [ ] 6.3 Create fix script if needed
    - Write script to add missing Pritzker tags
    - Write script to populate missing customFields
    - Write script to merge duplicate records
    - _Requirements: 2.1, 4.1_

  - [ ]* 6.4 Write property test for data integrity
    - **Property 6: Data Integrity After Import**
    - **Validates: Requirements 3.1, 3.3**

  - [ ] 6.5 Run fix script
    - Execute fix script
    - Verify fixes were applied
    - Re-run verification script
    - _Requirements: 3.3_

- [ ] 7. Test filter UI functionality
  - [ ] 7.1 Test backend API filter endpoint
    - Query `/api/places?award=Pritzker`
    - Verify response contains 794 places
    - Verify response includes proper pagination
    - _Requirements: 2.3_

  - [ ] 7.2 Document filter usage
    - Document how to filter by Pritzker award
    - Document how to filter by architect
    - Add examples to API documentation
    - _Requirements: 2.4_

- [ ] 8. Final verification and documentation
  - [ ] 8.1 Run complete verification suite
    - Verify total count: 794 Pritzker buildings
    - Verify all have Pritzker award tag
    - Verify all have architect attribution
    - Verify filter returns correct results
    - _Requirements: 5.3, 5.4_

  - [ ] 8.2 Generate final report
    - Document import statistics
    - Document any issues encountered and resolutions
    - Document verification results
    - _Requirements: 5.1, 5.2_

  - [ ] 8.3 Update user-facing documentation
    - Update README with Pritzker import information
    - Document how users can discover Pritzker buildings
    - Add examples of filtering by award and architect
    - _Requirements: 2.4_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The import script already exists and has been tested
- Focus on verification and fixing any data quality issues
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The main issue is that previous import data was lost, so we need to re-import
