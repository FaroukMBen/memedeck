import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { supabaseAdmin } from '../../lib/supabase.js';

const errorSchema = z.object({
  error: z.string(),
  message: z.string(),
});

const communityUserSchema = z.object({
  id: z.string().uuid(),
  username: z.string().nullable(),
  avatar_url: z.string().nullable(),
  bio: z.string().nullable(),
  created_at: z.string().nullable(),
  friendship_status: z.enum(['none', 'pending_sent', 'pending_received', 'friends', 'self']),
  is_following: z.boolean(),
});

const activitySchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['upload', 'fork', 'collection', 'like']),
  created_at: z.string(),
  actor: z.object({
    id: z.string().uuid(),
    username: z.string().nullable(),
    avatar_url: z.string().nullable(),
  }),
  media: z
    .object({
      id: z.string().uuid(),
      file_url: z.string(),
      file_type: z.string(),
      source_format: z.string().nullable(),
      title: z.string().nullable(),
    })
    .nullable(),
  collection: z
    .object({
      id: z.string().uuid(),
      title: z.string(),
    })
    .nullable(),
});

interface ActivityRow {
  id: string;
  actor_id: string;
  type: 'upload' | 'fork' | 'collection' | 'like';
  media_id: string | null;
  collection_id: string | null;
  created_at: string;
}

const ACTIVITY_COLUMNS = 'id, actor_id, type, media_id, collection_id, created_at';

/**
 * Attach actor, media and collection details to raw activity rows.
 * Entries whose media or collection is no longer public are dropped, so the
 * feed never reveals something its owner has since made private or deleted.
 */
async function hydrateActivities(rows: ActivityRow[]) {
  if (rows.length === 0) return [];

  const actorIds = [...new Set(rows.map((r) => r.actor_id))];
  const mediaIds = [...new Set(rows.map((r) => r.media_id).filter((id): id is string => !!id))];
  const collectionIds = [
    ...new Set(rows.map((r) => r.collection_id).filter((id): id is string => !!id)),
  ];

  const [usersRes, mediasRes, publicRefsRes, collectionsRes] = await Promise.all([
    supabaseAdmin.from('users').select('id, username, avatar_url').in('id', actorIds),
    mediaIds.length
      ? supabaseAdmin
          .from('medias')
          .select('id, file_url, file_type, source_format, original_title')
          .in('id', mediaIds)
      : Promise.resolve({ data: [] as any[] }),
    mediaIds.length
      ? supabaseAdmin
          .from('user_medias')
          .select('media_id')
          .eq('is_public', true)
          .in('media_id', mediaIds)
      : Promise.resolve({ data: [] as any[] }),
    collectionIds.length
      ? supabaseAdmin
          .from('collections')
          .select('id, title')
          .eq('is_public', true)
          .in('id', collectionIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const users = new Map((usersRes.data ?? []).map((u: any) => [u.id, u]));
  const publicMediaIds = new Set((publicRefsRes.data ?? []).map((r: any) => r.media_id));
  const medias = new Map(
    (mediasRes.data ?? []).filter((m: any) => publicMediaIds.has(m.id)).map((m: any) => [m.id, m])
  );
  const collections = new Map((collectionsRes.data ?? []).map((c: any) => [c.id, c]));

  return rows.flatMap((row) => {
    const actor = users.get(row.actor_id);
    if (!actor) return [];

    const media = row.media_id ? medias.get(row.media_id) : null;
    const collection = row.collection_id ? collections.get(row.collection_id) : null;
    if (row.media_id && !media) return [];
    if (row.collection_id && !collection) return [];

    return [
      {
        id: row.id,
        type: row.type,
        created_at: row.created_at,
        actor: {
          id: actor.id,
          username: actor.username ?? null,
          avatar_url: actor.avatar_url ?? null,
        },
        media: media
          ? {
              id: media.id,
              file_url: media.file_url,
              file_type: media.file_type,
              source_format: media.source_format ?? null,
              title: media.original_title ?? null,
            }
          : null,
        collection: collection ? { id: collection.id, title: collection.title } : null,
      },
    ];
  });
}

export async function socialRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  // Follow a user (one-way) to see their uploads in your feed
  server.post(
    '/api/v1/users/:userId/follow',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Social'],
        summary: 'Follow a user',
        security: [{ bearerAuth: [] }],
        params: z.object({ userId: z.string().uuid() }),
        response: {
          200: z.object({ following: z.boolean() }),
          400: errorSchema,
          404: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.params;
      const callerId = request.user!.id;

      if (userId === callerId) {
        return reply.status(400).send({
          error: 'BadRequest',
          message: 'You cannot follow yourself',
        });
      }

      const { data: target } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (!target) {
        return reply.status(404).send({ error: 'NotFound', message: 'User not found' });
      }

      const { error } = await supabaseAdmin
        .from('user_follows')
        .upsert(
          { follower_id: callerId, followed_id: userId },
          { onConflict: 'follower_id, followed_id' }
        );

      if (error) {
        return reply.status(500).send({ error: 'DatabaseError', message: error.message });
      }

      return { following: true };
    }
  );

  server.delete(
    '/api/v1/users/:userId/follow',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Social'],
        summary: 'Unfollow a user',
        security: [{ bearerAuth: [] }],
        params: z.object({ userId: z.string().uuid() }),
        response: {
          200: z.object({ following: z.boolean() }),
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { error } = await supabaseAdmin
        .from('user_follows')
        .delete()
        .eq('follower_id', request.user!.id)
        .eq('followed_id', request.params.userId);

      if (error) {
        return reply.status(500).send({ error: 'DatabaseError', message: error.message });
      }

      return { following: false };
    }
  );

  // What a user has been doing publicly (shown on their profile)
  server.get(
    '/api/v1/users/:userId/activity',
    {
      schema: {
        tags: ['Social'],
        summary: "A user's recent public activity",
        params: z.object({ userId: z.string().uuid() }),
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(50).default(20),
        }),
        response: {
          200: z.object({ items: z.array(activitySchema) }),
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { data, error } = await supabaseAdmin
        .from('activities')
        .select(ACTIVITY_COLUMNS)
        .eq('actor_id', request.params.userId)
        .order('created_at', { ascending: false })
        .limit(request.query.limit);

      if (error) {
        return reply.status(500).send({ error: 'DatabaseError', message: error.message });
      }

      return { items: await hydrateActivities((data ?? []) as ActivityRow[]) };
    }
  );

  // Home feed: what friends and followed users did, plus likes on your memes
  server.get(
    '/api/v1/feed',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Social'],
        summary: 'Activity from friends and followed users, and likes on your memes',
        security: [{ bearerAuth: [] }],
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(50).default(20),
        }),
        response: {
          200: z.object({ items: z.array(activitySchema) }),
        },
      },
    },
    async (request) => {
      const callerId = request.user!.id;
      const { limit } = request.query;

      const [followsRes, friendsRes] = await Promise.all([
        supabaseAdmin.from('user_follows').select('followed_id').eq('follower_id', callerId),
        supabaseAdmin
          .from('friendships')
          .select('requester_id, addressee_id')
          .eq('status', 'accepted')
          .or(`requester_id.eq.${callerId},addressee_id.eq.${callerId}`),
      ]);

      const circle = new Set<string>();
      for (const f of followsRes.data ?? []) circle.add(f.followed_id);
      for (const f of friendsRes.data ?? []) {
        circle.add(f.requester_id === callerId ? f.addressee_id : f.requester_id);
      }
      circle.delete(callerId);

      const [circleRes, likesRes] = await Promise.all([
        circle.size
          ? supabaseAdmin
              .from('activities')
              .select(ACTIVITY_COLUMNS)
              .in('actor_id', [...circle])
              .neq('type', 'like')
              .order('created_at', { ascending: false })
              .limit(limit)
          : Promise.resolve({ data: [] as any[] }),
        supabaseAdmin
          .from('activities')
          .select(ACTIVITY_COLUMNS)
          .eq('target_user_id', callerId)
          .in('type', ['like', 'fork'])
          .order('created_at', { ascending: false })
          .limit(limit),
      ]);

      const merged = new Map<string, ActivityRow>();
      for (const row of [...(circleRes.data ?? []), ...(likesRes.data ?? [])] as ActivityRow[]) {
        merged.set(row.id, row);
      }
      const rows = [...merged.values()]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit);

      return { items: await hydrateActivities(rows) };
    }
  );

  // Search and browse community users
  server.get(
    '/api/v1/users',
    {
      preHandler: [app.optionalAuth],
      schema: {
        tags: ['Social'],
        summary: 'Search and discover community members',
        querystring: z.object({
          q: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(50).default(24),
        }),
        response: {
          200: z.object({ items: z.array(communityUserSchema) }),
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const callerId = request.user?.id;
      const { q, limit } = request.query;

      let query = supabaseAdmin
        .from('users')
        .select('id, username, avatar_url, bio')
        .order('username', { ascending: true })
        .limit(limit);

      const trimmed = q?.trim();
      if (trimmed) {
        query = query.ilike('username', `%${trimmed}%`);
      }

      const { data: usersData, error } = await query;
      if (error) {
        return reply.status(500).send({ error: 'DatabaseError', message: error.message });
      }

      const users = usersData ?? [];
      if (users.length === 0) {
        return { items: [] };
      }

      const friendshipMap = new Map<string, 'pending_sent' | 'pending_received' | 'friends'>();
      const followingSet = new Set<string>();

      if (callerId) {
        const [friendshipsRes, followsRes] = await Promise.all([
          supabaseAdmin
            .from('friendships')
            .select('requester_id, addressee_id, status')
            .or(`requester_id.eq.${callerId},addressee_id.eq.${callerId}`),
          supabaseAdmin
            .from('user_follows')
            .select('followed_id')
            .eq('follower_id', callerId),
        ]);

        for (const f of friendshipsRes.data ?? []) {
          const otherId = f.requester_id === callerId ? f.addressee_id : f.requester_id;
          if (f.status === 'accepted') {
            friendshipMap.set(otherId, 'friends');
          } else if (f.status === 'pending') {
            friendshipMap.set(
              otherId,
              f.requester_id === callerId ? 'pending_sent' : 'pending_received'
            );
          }
        }

        for (const fw of followsRes.data ?? []) {
          followingSet.add(fw.followed_id);
        }
      }

      const items = users.map((u: any) => ({
        id: u.id,
        username: u.username ?? null,
        avatar_url: u.avatar_url ?? null,
        bio: u.bio ?? null,
        created_at: null,
        friendship_status:
          callerId && u.id === callerId
            ? ('self' as const)
            : (friendshipMap.get(u.id) ?? ('none' as const)),
        is_following: followingSet.has(u.id),
      }));

      return { items };
    }
  );

  // Get caller's friends, pending requests, and followed users
  server.get(
    '/api/v1/friends',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Social'],
        summary: 'List friends, incoming/outgoing friend requests, and followed users',
        security: [{ bearerAuth: [] }],
        response: {
          200: z.object({
            friends: z.array(communityUserSchema),
            incoming_requests: z.array(communityUserSchema),
            outgoing_requests: z.array(communityUserSchema),
            following: z.array(communityUserSchema),
          }),
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const callerId = request.user!.id;

      const [friendshipsRes, followsRes] = await Promise.all([
        supabaseAdmin
          .from('friendships')
          .select('requester_id, addressee_id, status')
          .or(`requester_id.eq.${callerId},addressee_id.eq.${callerId}`),
        supabaseAdmin
          .from('user_follows')
          .select('followed_id')
          .eq('follower_id', callerId),
      ]);

      if (friendshipsRes.error) {
        return reply.status(500).send({
          error: 'DatabaseError',
          message: friendshipsRes.error.message,
        });
      }

      const friendshipMap = new Map<string, 'pending_sent' | 'pending_received' | 'friends'>();
      const followingSet = new Set<string>();
      const allTargetIds = new Set<string>();

      for (const f of friendshipsRes.data ?? []) {
        const otherId = f.requester_id === callerId ? f.addressee_id : f.requester_id;
        allTargetIds.add(otherId);
        if (f.status === 'accepted') {
          friendshipMap.set(otherId, 'friends');
        } else if (f.status === 'pending') {
          friendshipMap.set(
            otherId,
            f.requester_id === callerId ? 'pending_sent' : 'pending_received'
          );
        }
      }

      for (const fw of followsRes.data ?? []) {
        if (fw.followed_id !== callerId) {
          followingSet.add(fw.followed_id);
          allTargetIds.add(fw.followed_id);
        }
      }

      if (allTargetIds.size === 0) {
        return {
          friends: [],
          incoming_requests: [],
          outgoing_requests: [],
          following: [],
        };
      }

      const { data: usersData, error: usersErr } = await supabaseAdmin
        .from('users')
        .select('id, username, avatar_url, bio')
        .in('id', [...allTargetIds]);

      if (usersErr) {
        return reply.status(500).send({ error: 'DatabaseError', message: usersErr.message });
      }

      const userById = new Map<string, any>();
      for (const u of usersData ?? []) {
        userById.set(u.id, {
          id: u.id,
          username: u.username ?? null,
          avatar_url: u.avatar_url ?? null,
          bio: u.bio ?? null,
          created_at: null,
          friendship_status: friendshipMap.get(u.id) ?? ('none' as const),
          is_following: followingSet.has(u.id),
        });
      }

      const friends: any[] = [];
      const incoming_requests: any[] = [];
      const outgoing_requests: any[] = [];
      const following: any[] = [];

      for (const [id, status] of friendshipMap.entries()) {
        const profile = userById.get(id);
        if (!profile) continue;
        if (status === 'friends') friends.push(profile);
        else if (status === 'pending_received') incoming_requests.push(profile);
        else if (status === 'pending_sent') outgoing_requests.push(profile);
      }

      for (const id of followingSet) {
        const profile = userById.get(id);
        if (profile) following.push(profile);
      }

      return {
        friends,
        incoming_requests,
        outgoing_requests,
        following,
      };
    }
  );
}
