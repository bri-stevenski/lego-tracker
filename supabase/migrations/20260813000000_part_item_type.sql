-- Allow individual elements ("parts") alongside sets and minifigs.
--
-- A Pick-a-Brick export lists LEGO element ids with no set number, so importing
-- one produces catalog rows of a third kind. Two of catalog_cache's original
-- CHECK constraints assumed every row is a set or a minifig:
--
--   1. type IN ('set', 'minifig')  -- no room for an element
--   2. year >= 1932                -- an element has no release year at all
--
-- Both are widened here. Year 0 is the explicit "unknown" value rather than a
-- NULL, because the column is NOT NULL and the domain type models year as a
-- number; keeping the 1932 floor for every non-zero year preserves the original
-- guard against typo'd or garbage years on sets.

ALTER TABLE public.catalog_cache
  DROP CONSTRAINT IF EXISTS catalog_cache_type_check;

ALTER TABLE public.catalog_cache
  ADD CONSTRAINT catalog_cache_type_check
  CHECK (type IN ('set', 'minifig', 'part'));

ALTER TABLE public.catalog_cache
  DROP CONSTRAINT IF EXISTS catalog_cache_year_check;

ALTER TABLE public.catalog_cache
  ADD CONSTRAINT catalog_cache_year_check
  CHECK (year = 0 OR (year >= 1932 AND year <= EXTRACT(YEAR FROM now())::INT));
