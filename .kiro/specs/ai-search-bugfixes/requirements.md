# Requirements Document

## Introduction

This document specifies the requirements for fixing three bugs in the AI search results feature:
1. Places without valid images are not being filtered properly
2. Wishlist/favorites functionality not updating UI after save
3. Tags displaying in wrong language (German instead of English)

## Glossary

- **Search_V2_Controller**: The backend controller handling AI-powered place search requests
- **Display_Tags**: The tags shown on place cards in the UI, derived from category and AI tags
- **Wishlist_Status_Provider**: The Flutter Riverpod provider managing wishlist state
- **Cover_Image**: The main image URL for a place, used for display in cards
- **AI_Tags**: Structured tag objects containing multilingual labels (en, zh) and priority

## Requirements

### Requirement 1: Filter Places with Invalid Images

**User Story:** As a user, I want to only see places with valid, accessible images, so that the search results look professional and complete.

#### Acceptance Criteria

1. WHEN a place has an empty coverImage field, THE Search_V2_Controller SHALL exclude it from results
2. WHEN a place has a coverImage URL that returns HTTP 404, THE Search_V2_Controller SHALL exclude it from results
3. WHEN a place has a coverImage URL that times out (>5 seconds), THE Search_V2_Controller SHALL exclude it from results
4. WHEN a place has a Wikipedia image URL, THE Search_V2_Controller SHALL validate the URL is accessible before including the place
5. THE Search_V2_Controller SHALL log when places are excluded due to invalid images

### Requirement 2: Fix Wishlist UI Update

**User Story:** As a user, I want the wishlist button to immediately reflect my save action, so that I have confidence my favorites are being saved.

#### Acceptance Criteria

1. WHEN a user saves a place to wishlist, THE Wishlist_Status_Provider SHALL invalidate and refresh the status cache
2. WHEN the wishlist API call succeeds, THE AI_Place_Card SHALL update the heart icon to filled state
3. WHEN the wishlist API call succeeds, THE AI_Place_Card SHALL show a success toast message
4. IF the wishlist API call fails, THEN THE AI_Place_Card SHALL show an error toast and revert the icon state

### Requirement 3: Display Tags in Correct Language

**User Story:** As a user, I want tags to display in the same language as the rest of the content, so that the interface is consistent and readable.

#### Acceptance Criteria

1. WHEN the user's language preference is English, THE Search_V2_Controller SHALL return tags using the `en` field from AI_Tags
2. WHEN the user's language preference is Chinese, THE Search_V2_Controller SHALL return tags using the `zh` field from AI_Tags
3. WHEN an AI_Tag object has no `en` field, THE Search_V2_Controller SHALL fall back to the `id` field
4. THE buildDisplayTags function SHALL accept a language parameter to determine which field to use
5. WHEN tags are string type (legacy format), THE Search_V2_Controller SHALL use them as-is regardless of language
