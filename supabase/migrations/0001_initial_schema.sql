-- MemeDeck Initial Schema (PostgreSQL / Supabase)
-- Matches ER diagram: users, medias, user_medias, collections, collection_items

-- Enable UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users table (mirrors Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    username TEXT UNIQUE,
    is_library_public BOOLEAN NOT NULL DEFAULT false
);

-- 2. Medias table (canonical media files stored once in Supabase Storage)
CREATE TABLE IF NOT EXISTS public.medias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_url TEXT NOT NULL,
    file_type TEXT NOT NULL,
    original_uploader_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. User Medias table (smart forking: references a canonical media without duplicating storage)
CREATE TABLE IF NOT EXISTS public.user_medias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    media_id UUID NOT NULL REFERENCES public.medias(id) ON DELETE CASCADE,
    is_public BOOLEAN NOT NULL DEFAULT true,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT user_medias_user_media_unique UNIQUE (user_id, media_id)
);

-- 4. Collections table (modular user decks / packs)
CREATE TABLE IF NOT EXISTS public.collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    is_public BOOLEAN NOT NULL DEFAULT false
);

-- 5. Collection Items table (join table between collections and user_medias)
CREATE TABLE IF NOT EXISTS public.collection_items (
    collection_id UUID NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
    user_media_id UUID NOT NULL REFERENCES public.user_medias(id) ON DELETE CASCADE,
    PRIMARY KEY (collection_id, user_media_id)
);

-- Performance Indexes for high-throughput party game queries
CREATE INDEX IF NOT EXISTS idx_medias_file_type ON public.medias(file_type);
CREATE INDEX IF NOT EXISTS idx_medias_created_at ON public.medias(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_medias_user_id ON public.user_medias(user_id);
CREATE INDEX IF NOT EXISTS idx_user_medias_media_id ON public.user_medias(media_id);
CREATE INDEX IF NOT EXISTS idx_user_medias_public ON public.user_medias(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_collections_user_id ON public.collections(user_id);
CREATE INDEX IF NOT EXISTS idx_collections_public ON public.collections(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_collection_items_user_media_id ON public.collection_items(user_media_id);

-- Automatic user profile creation on Supabase Auth sign-up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, username, is_library_public)
    VALUES (
        NEW.id,
        COALESCE(NEW.email, ''),
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(COALESCE(NEW.email, ''), '@', 1)),
        false
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_medias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_items ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view own profile or public libraries"
    ON public.users FOR SELECT
    USING (auth.uid() = id OR is_library_public = true);

CREATE POLICY "Users can update own profile"
    ON public.users FOR UPDATE
    USING (auth.uid() = id);

-- Medias policies
CREATE POLICY "Anyone can view medias linked to a public user_media or uploaded by self"
    ON public.medias FOR SELECT
    USING (
        original_uploader_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.user_medias um
            WHERE um.media_id = medias.id AND um.is_public = true
        )
    );

CREATE POLICY "Authenticated users can insert medias"
    ON public.medias FOR INSERT
    WITH CHECK (auth.uid() = original_uploader_id);

-- User Medias policies
CREATE POLICY "Users can view own or public user_medias"
    ON public.user_medias FOR SELECT
    USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "Users can insert own user_medias"
    ON public.user_medias FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own user_medias"
    ON public.user_medias FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own user_medias"
    ON public.user_medias FOR DELETE
    USING (auth.uid() = user_id);

-- Collections policies
CREATE POLICY "Users can view own or public collections"
    ON public.collections FOR SELECT
    USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "Users can insert own collections"
    ON public.collections FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own collections"
    ON public.collections FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own collections"
    ON public.collections FOR DELETE
    USING (auth.uid() = user_id);

-- Collection Items policies
CREATE POLICY "Users can view items in own or public collections"
    ON public.collection_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.collections c
            WHERE c.id = collection_items.collection_id
              AND (c.user_id = auth.uid() OR c.is_public = true)
        )
    );

CREATE POLICY "Users can manage items in own collections"
    ON public.collection_items FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.collections c
            WHERE c.id = collection_items.collection_id
              AND c.user_id = auth.uid()
        )
    );

-- Storage bucket for media assets (public read for party game speed)
INSERT INTO storage.buckets (id, name, public)
VALUES ('medias', 'medias', true)
ON CONFLICT (id) DO NOTHING;

