-- Migration 0003: Add Titles, Tags, NSFW flag, and Likes/Dislikes system

-- 1. Update medias table
ALTER TABLE public.medias ADD COLUMN IF NOT EXISTS original_title TEXT;
ALTER TABLE public.medias ADD COLUMN IF NOT EXISTS likes_count INT NOT NULL DEFAULT 0;
ALTER TABLE public.medias ADD COLUMN IF NOT EXISTS dislikes_count INT NOT NULL DEFAULT 0;

-- 2. Update user_medias table
ALTER TABLE public.user_medias ADD COLUMN IF NOT EXISTS custom_title TEXT;
ALTER TABLE public.user_medias ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.user_medias ADD COLUMN IF NOT EXISTS is_nsfw BOOLEAN NOT NULL DEFAULT false;

-- Create GIN index for fast tag queries across party games and libraries
CREATE INDEX IF NOT EXISTS idx_user_medias_tags ON public.user_medias USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_user_medias_nsfw ON public.user_medias(is_nsfw) WHERE is_nsfw = true;

-- 3. Media reactions table (Likes and Dislikes)
CREATE TABLE IF NOT EXISTS public.media_reactions (
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    media_id UUID NOT NULL REFERENCES public.medias(id) ON DELETE CASCADE,
    reaction_type SMALLINT NOT NULL CHECK (reaction_type IN (1, -1)), -- 1 = like, -1 = dislike
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, media_id)
);

CREATE INDEX IF NOT EXISTS idx_media_reactions_media_id ON public.media_reactions(media_id);

-- Row Level Security for media_reactions
ALTER TABLE public.media_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view media reactions"
    ON public.media_reactions FOR SELECT
    USING (true);

CREATE POLICY "Authenticated users can manage own reaction"
    ON public.media_reactions FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 4. Trigger to maintain likes_count and dislikes_count on medias
CREATE OR REPLACE FUNCTION public.sync_media_reaction_counts()
RETURNS TRIGGER AS $$
DECLARE
    target_media_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_media_id := OLD.media_id;
    ELSE
        target_media_id := NEW.media_id;
    END IF;

    UPDATE public.medias
    SET 
        likes_count = (SELECT COUNT(*) FROM public.media_reactions WHERE media_id = target_media_id AND reaction_type = 1),
        dislikes_count = (SELECT COUNT(*) FROM public.media_reactions WHERE media_id = target_media_id AND reaction_type = -1)
    WHERE id = target_media_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_media_reaction_counts ON public.media_reactions;
CREATE TRIGGER trg_media_reaction_counts
    AFTER INSERT OR UPDATE OR DELETE ON public.media_reactions
    FOR EACH ROW EXECUTE FUNCTION public.sync_media_reaction_counts();
