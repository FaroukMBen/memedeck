-- Migration 0006: GIF origin label, dynamic collections, profile showcase,
-- follows, deck subscriptions and the activity feed.
-- All new tables are only accessed through the API (service role), so RLS is
-- enabled without policies: direct client access is denied.

-- 1. Remember what a converted file originally was (e.g. 'gif' for a GIF that
--    was transcoded to MP4), so the UI can still label it as a GIF.
ALTER TABLE public.medias ADD COLUMN IF NOT EXISTS source_format TEXT;

-- 2. Dynamic collections: when "rule" is set, the content is computed from the
--    owner's library at read time instead of from collection_items.
--    Shape: { "tags": ["reaction"], "type": "image" | "video", "min_likes": 10 }
ALTER TABLE public.collections ADD COLUMN IF NOT EXISTS rule JSONB;

-- 3. Profile showcase: up to 6 pinned media ids, in display order.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS showcase_media_ids UUID[] NOT NULL DEFAULT '{}';

-- 4. Follow a user to see their future uploads (one-way, unlike friendships).
CREATE TABLE IF NOT EXISTS public.user_follows (
    follower_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    followed_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (follower_id, followed_id),
    CONSTRAINT user_follows_not_self CHECK (follower_id <> followed_id)
);
CREATE INDEX IF NOT EXISTS idx_user_follows_followed ON public.user_follows(followed_id);

-- 5. Subscribe to someone else's public deck.
CREATE TABLE IF NOT EXISTS public.collection_subscriptions (
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    collection_id UUID NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, collection_id)
);
CREATE INDEX IF NOT EXISTS idx_collection_subscriptions_collection
    ON public.collection_subscriptions(collection_id);

-- 6. Activity log feeding profiles and the friends/following feed.
--    type: 'upload' | 'fork' | 'collection' | 'like'
CREATE TABLE IF NOT EXISTS public.activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('upload', 'fork', 'collection', 'like')),
    media_id UUID REFERENCES public.medias(id) ON DELETE CASCADE,
    collection_id UUID REFERENCES public.collections(id) ON DELETE CASCADE,
    target_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activities_actor ON public.activities(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_target ON public.activities(target_user_id, created_at DESC);

ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
