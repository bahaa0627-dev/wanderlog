/**
 * Tag Extractor Utility
 * 
 * Extracts and flattens tags from Place.tags (JSON object) and Place.aiTags (JSON array)
 * for display in admin backend
 */

/**
 * Extract all tag values from tags JSON object
 * 
 * tags structure: { type: ["Architecture"], style: ["Brutalism", "Modern"], theme: ["Historical"] }
 * 
 * @param tags - Tags JSON object from Place.tags
 * @returns Flat array of tag values
 */
export function extractTagsFromObject(tags: any): string[] {
  if (!tags || typeof tags !== 'object') {
    return [];
  }

  const result: string[] = [];

  // Iterate through all keys (type, style, theme, etc.)
  for (const key of Object.keys(tags)) {
    const value = tags[key];

    if (Array.isArray(value)) {
      // If value is array, add all elements
      result.push(...value.filter(v => typeof v === 'string' && v.trim()));
    } else if (typeof value === 'string' && value.trim()) {
      // If value is string, add it directly
      result.push(value.trim());
    }
  }

  return result;
}

/**
 * Extract tag values from aiTags JSON array
 * 
 * aiTags structure: [{ en: "Brutalist", zh: "粗野主义" }, { en: "Modern", zh: "现代" }]
 * 
 * @param aiTags - AI tags JSON array from Place.aiTags
 * @param language - Language to extract ('en' or 'zh'), defaults to 'en'
 * @returns Flat array of tag values
 */
export function extractAITags(aiTags: any, language: 'en' | 'zh' = 'en'): string[] {
  if (!Array.isArray(aiTags)) {
    return [];
  }

  return aiTags
    .filter(tag => tag && typeof tag === 'object' && tag[language])
    .map(tag => tag[language])
    .filter(v => typeof v === 'string' && v.trim());
}

/**
 * Combine tags from both tags and aiTags fields
 * 
 * @param tags - Tags JSON object from Place.tags
 * @param aiTags - AI tags JSON array from Place.aiTags
 * @param language - Language for AI tags ('en' or 'zh'), defaults to 'en'
 * @returns Combined flat array of unique tag values
 */
export function extractAllTags(
  tags: any,
  aiTags: any,
  language: 'en' | 'zh' = 'en'
): string[] {
  const tagsArray = extractTagsFromObject(tags);
  const aiTagsArray = extractAITags(aiTags, language);

  // Combine and deduplicate
  const combined = [...tagsArray, ...aiTagsArray];
  return Array.from(new Set(combined));
}

/**
 * Format tags for display in admin backend
 * Returns an object with both arrays and a combined display string
 * 
 * @param tags - Tags JSON object from Place.tags
 * @param aiTags - AI tags JSON array from Place.aiTags
 * @param language - Language for AI tags ('en' or 'zh'), defaults to 'en'
 * @returns Formatted tags object
 */
export function formatTagsForDisplay(
  tags: any,
  aiTags: any,
  language: 'en' | 'zh' = 'en'
): {
  tags: string[];
  aiTags: string[];
  allTags: string[];
  displayString: string;
} {
  const tagsArray = extractTagsFromObject(tags);
  const aiTagsArray = extractAITags(aiTags, language);
  const allTags = extractAllTags(tags, aiTags, language);

  return {
    tags: tagsArray,
    aiTags: aiTagsArray,
    allTags,
    displayString: allTags.join(', '),
  };
}
