import { supabaseAdmin } from './supabase.js';

export type ActivityType = 'upload' | 'fork' | 'collection' | 'like';

interface ActivityInput {
  actorId: string;
  type: ActivityType;
  mediaId?: string;
  collectionId?: string;
  targetUserId?: string | null;
}

/**
 * Append an entry to the activity log. Best effort: the feed is secondary to
 * the action that triggered it, so a failure here must never fail the request.
 */
export async function recordActivity(input: ActivityInput): Promise<void> {
  try {
    await supabaseAdmin.from('activities').insert({
      actor_id: input.actorId,
      type: input.type,
      media_id: input.mediaId ?? null,
      collection_id: input.collectionId ?? null,
      target_user_id: input.targetUserId ?? null,
    });
  } catch {
    /* ignored on purpose */
  }
}
