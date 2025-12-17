-- 1) 补字段
ALTER TABLE public_places
  ADD COLUMN IF NOT EXISTS "googlePlaceId" TEXT,
  ADD COLUMN IF NOT EXISTS "source" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceDetails" JSONB,
  ADD COLUMN IF NOT EXISTS "ratingCount" INT;

-- 2) 可空唯一索引
CREATE UNIQUE INDEX IF NOT EXISTS public_places_google_place_id_idx
  ON public_places("googlePlaceId")
  WHERE "googlePlaceId" IS NOT NULL;

-- 3) 导入 spots -> public_places（字段同名）
INSERT INTO public_places (
  id, name, latitude, longitude, category, tags, images,
  rating, "ratingCount", "coverImage", "openingHours", website, "phoneNumber",
  "googlePlaceId", source, "createdAt", "updatedAt"
)
SELECT
  id, name, latitude, longitude, category, tags, images,
  rating, "ratingCount", "coverImage", "openingHours", website, "phoneNumber",
  "googlePlaceId", COALESCE(source, 'manual'), "createdAt", "updatedAt"
FROM spots
ON CONFLICT (id) DO NOTHING;

-- 4) 去重检查（如有结果需手工/规则合并）
SELECT "googlePlaceId", count(*)
FROM public_places
WHERE "googlePlaceId" IS NOT NULL
GROUP BY 1 HAVING count(*) > 1;