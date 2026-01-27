-- Find all places with old format image URLs
-- Old format: /places/{uuid}/cover.jpg
-- New format: /places/cover/v1/{path}/{uuid}.jpg

SELECT 
  id,
  name,
  city,
  cover_image,
  CASE 
    WHEN cover_image LIKE '%/places/%/cover.jpg%' 
      AND cover_image NOT LIKE '%/places/cover/v1/%' THEN 'OLD_FORMAT'
    WHEN cover_image LIKE '%/places/cover/v1/%' THEN 'NEW_FORMAT'
    ELSE 'OTHER'
  END as format_type
FROM places
WHERE cover_image IS NOT NULL
ORDER BY format_type, name;

-- Count by format
SELECT 
  CASE 
    WHEN cover_image LIKE '%/places/%/cover.jpg%' 
      AND cover_image NOT LIKE '%/places/cover/v1/%' THEN 'OLD_FORMAT'
    WHEN cover_image LIKE '%/places/cover/v1/%' THEN 'NEW_FORMAT'
    ELSE 'OTHER'
  END as format_type,
  COUNT(*) as count
FROM places
WHERE cover_image IS NOT NULL
GROUP BY format_type;
