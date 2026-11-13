-- Migration 0005: Add permanent tags to canonical medias table
-- The tags assigned on meme upload become the canonical, permanent media tags.
-- Other users can choose to keep, add, or remove them when adding to their library.

ALTER TABLE public.medias ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_medias_tags ON public.medias USING GIN (tags);

-- Backfill permanent tags from original uploader's user_medias
UPDATE public.medias m
SET tags = um.tags
FROM public.user_medias um
WHERE um.media_id = m.id
  AND um.user_id = m.original_uploader_id
  AND (m.tags IS NULL OR m.tags = '{}')
  AND um.tags IS NOT NULL
  AND um.tags != '{}';
