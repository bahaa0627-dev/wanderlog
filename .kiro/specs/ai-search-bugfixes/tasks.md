# Implementation Plan: AI Search Bugfixes

## Overview

This plan addresses three bugs in AI search results: invalid image filtering, wishlist UI updates, and tag language consistency. Tasks are ordered to fix issues sequentially with minimal risk.

## Tasks

- [x] 1. Fix Tags Language Issue (Requirement 3)
  - [x] 1.1 Modify buildDisplayTags to accept language parameter
    - Update function signature to include `language: 'en' | 'zh' = 'en'`
    - When tag is object, use `tag[language]` with fallback to `tag.en` then `tag.id`
    - When tag is string, use as-is (legacy format)
    - _Requirements: 3.1, 3.2, 3.3, 3.5_
  - [x] 1.2 Update all buildDisplayTags call sites to pass language parameter
    - Pass `language` from request body to all buildDisplayTags calls
    - Update matchAIPlacesFromDB to accept and pass language
    - Update generateAISummaryForPlaces to accept and pass language
    - _Requirements: 3.1, 3.2, 3.4_
  - [x] 1.3 Write property test for language-aware tag selection
    - **Property 2: Language-Aware Tag Selection**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.5**

- [x] 2. Checkpoint - Test Tags Fix
  - Restart backend and test with "design museum" query
  - Verify tags display in English (not German)
  - Ensure all tests pass, ask the user if questions arise

- [x] 3. Fix Image Filtering Issue (Requirement 1)
  - [x] 3.1 Create validateImageUrl utility function
    - Implement HTTP HEAD request with 5s timeout
    - Return validation result with reason for failure
    - Handle empty URLs, network errors, HTTP errors
    - _Requirements: 1.1, 1.2, 1.3_
  - [x] 3.2 Add image URL validation to hasImage function
    - Replace simple non-empty check with URL validation
    - Cache validation results to avoid repeated checks
    - Log exclusions for debugging
    - _Requirements: 1.1, 1.2, 1.4, 1.5_
  - [x] 3.3 Update addPlace function to use async validation
    - Make addPlace async to support URL validation
    - Filter out places with invalid images before adding
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [x] 3.4 Write property test for image URL validation
    - **Property 1: Image URL Validation Excludes Invalid URLs**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**

- [x] 4. Checkpoint - Test Image Filtering
  - Restart backend and test search
  - Verify no places with broken images appear
  - Ensure all tests pass, ask the user if questions arise

- [x] 5. Fix Wishlist UI Update Issue (Requirement 2)
  - [x] 5.1 Review and fix provider invalidation in ai_place_card.dart
    - Ensure ref.invalidate is called after successful API call
    - Add await for provider refresh before updating UI
    - Verify onWishlistChanged callback is called
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 5.2 Add error handling and state reversion
    - On API failure, revert _isSaving state
    - Show appropriate error toast
    - _Requirements: 2.4_
  - [x] 5.3 Write unit test for wishlist state management
    - **Property 3: Wishlist State Consistency**
    - **Validates: Requirements 2.1, 2.2**

- [x] 6. Final Checkpoint
  - Restart backend and iOS app
  - Test all three fixes end-to-end
  - Ensure all tests pass, ask the user if questions arise

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Fix order: Tags → Images → Wishlist (least to most complex)
