-- Add username to public.users if not present
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username);

-- Update handle_new_user trigger function to populate username from signup metadata
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
    ON CONFLICT (id) DO UPDATE SET
        username = COALESCE(public.users.username, EXCLUDED.username);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

