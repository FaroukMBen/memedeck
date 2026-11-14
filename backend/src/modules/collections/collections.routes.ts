import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { supabaseAdmin } from '../../lib/supabase.js';
import { recordActivity } from '../../lib/activity.js';

/**
 * A dynamic collection has a rule instead of hand-picked items: its content is
 * computed from the owner's library every time it is read.
 */
const ruleSchema = z
  .object({
    tags: z.array(z.string().min(1).max(30)).max(10).optional(),
    type: z.enum(['image', 'video']).optional(),
    min_likes: z.number().int().min(0).optional(),
  })
  .refine(
    (rule) => (rule.tags?.length ?? 0) > 0 || rule.type !== undefined || rule.min_likes !== undefined,
    { message: 'A dynamic rule needs at least one condition' }
  );

type CollectionRule = z.infer<typeof ruleSchema>;

const collectionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string(),
  is_public: z.boolean(),
  rule: ruleSchema.nullable().optional(),
});

const collectionListItemSchema = collectionSchema.extend({
  item_count: z.number().int().default(0),
  previews: z
    .array(z.object({ file_url: z.string(), file_type: z.string() }))
    .default([]),
  owner_username: z.string().nullable().optional(),
});

const MAX_COLLECTION_PREVIEWS = 4;
const COLLECTION_COLUMNS = 'id, user_id, title, is_public, rule';

const collectionMediaItemSchema = z.object({
  user_media_id: z.string().uuid(),
  media_id: z.string().uuid(),
  file_url: z.string(),
  file_type: z.string(),
  source_format: z.string().nullable().optional(),
  added_at: z.string(),
});

type CollectionMediaItem = z.infer<typeof collectionMediaItemSchema>;

const errorSchema = z.object({
  error: z.string(),
  message: z.string(),
});

interface CollectionRow {
  id: string;
  user_id: string;
  title: string;
  is_public: boolean;
  rule: CollectionRule | null;
}

function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalizeRule(rule: CollectionRule): CollectionRule {
  return {
    ...rule,
    tags: rule.tags?.map((t) => t.trim().toLowerCase().replace(/^#/, '')).filter(Boolean),
  };
}

/**
 * The media items of a collection: hand-picked rows for a manual collection,
 * or the owner's library filtered by the rule for a dynamic one. Viewers other
 * than the owner only ever get the owner's public items from a dynamic rule.
 */
async function resolveItems(
  collection: CollectionRow,
  viewerIsOwner: boolean
): Promise<{ items: CollectionMediaItem[]; error?: string }> {
  if (!collection.rule) {
    const { data, error } = await supabaseAdmin
      .from('collection_items')
      .select(
        `
        user_media_id,
        user_medias!inner (
          id,
          added_at,
          medias!inner (
            id,
            file_url,
            file_type,
            source_format
          )
        )
      `
      )
      .eq('collection_id', collection.id);

    if (error) return { items: [], error: error.message };

    return {
      items: (data ?? []).map((row: any) => ({
        user_media_id: row.user_media_id,
        media_id: row.user_medias.medias.id,
        file_url: row.user_medias.medias.file_url,
        file_type: row.user_medias.medias.file_type,
        source_format: row.user_medias.medias.source_format ?? null,
        added_at: row.user_medias.added_at,
      })),
    };
  }

  const rule = collection.rule;
  let query = supabaseAdmin
    .from('user_medias')
    .select(
      `
      id,
      tags,
      is_public,
      added_at,
      medias!inner (
        id,
        file_url,
        file_type,
        source_format,
        likes_count
      )
    `
    )
    .eq('user_id', collection.user_id)
    .order('added_at', { ascending: false });

  if (!viewerIsOwner) {
    query = query.eq('is_public', true);
  }
  if (rule.tags && rule.tags.length > 0) {
    query = query.overlaps('tags', rule.tags);
  }

  const { data, error } = await query;
  if (error) return { items: [], error: error.message };

  const items = (data ?? [])
    .filter((row: any) => {
      const isVideo = String(row.medias.file_type).startsWith('video/');
      if (rule.type === 'video' && !isVideo) return false;
      if (rule.type === 'image' && isVideo) return false;
      if (rule.min_likes !== undefined && (row.medias.likes_count ?? 0) < rule.min_likes) {
        return false;
      }
      return true;
    })
    .map((row: any) => ({
      user_media_id: row.id,
      media_id: row.medias.id,
      file_url: row.medias.file_url,
      file_type: row.medias.file_type,
      source_format: row.medias.source_format ?? null,
      added_at: row.added_at,
    }));

  return { items };
}

export async function collectionsRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  /** Load a collection the caller is allowed to see, or reply with 404/403. */
  async function loadVisibleCollection(collectionId: string, callerId: string | undefined) {
    const { data, error } = await supabaseAdmin
      .from('collections')
      .select(COLLECTION_COLUMNS)
      .eq('id', collectionId)
      .single();

    if (error || !data) {
      return { ok: false as const, status: 404 as const, error: 'NotFound', message: 'Collection not found' };
    }

    const collection = data as CollectionRow;
    const isOwner = callerId === collection.user_id;
    if (!collection.is_public && !isOwner) {
      return { ok: false as const, status: 403 as const, error: 'Forbidden', message: 'This collection is private' };
    }

    return { ok: true as const, collection, isOwner };
  }

  server.post(
    '/api/v1/collections',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Collections'],
        summary: 'Create a new collection (manual, or dynamic when a rule is given)',
        security: [{ bearerAuth: [] }],
        body: z.object({
          title: z.string().min(1).max(120),
          is_public: z.boolean().default(false),
          rule: ruleSchema.optional(),
        }),
        response: {
          201: collectionSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { title, is_public, rule } = request.body;
      const userId = request.user!.id;

      const { data, error } = await supabaseAdmin
        .from('collections')
        .insert({
          user_id: userId,
          title,
          is_public,
          rule: rule ? normalizeRule(rule) : null,
        })
        .select(COLLECTION_COLUMNS)
        .single();

      if (error || !data) {
        return reply.status(500).send({
          error: 'DatabaseError',
          message: error?.message ?? 'Failed to create collection',
        });
      }

      if (is_public) {
        await recordActivity({ actorId: userId, type: 'collection', collectionId: data.id });
      }

      return reply.status(201).send(data);
    }
  );

  server.get(
    '/api/v1/collections',
    {
      preHandler: [app.optionalAuth],
      schema: {
        tags: ['Collections'],
        summary: 'List public collections, your own, or the ones you subscribed to',
        querystring: z.object({
          mine: z.coerce.boolean().default(false),
          subscribed: z.coerce.boolean().default(false),
          limit: z.coerce.number().int().min(1).max(100).default(30),
          offset: z.coerce.number().int().min(0).default(0),
        }),
        response: {
          200: z.object({
            items: z.array(collectionListItemSchema),
          }),
          401: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { mine, subscribed, limit, offset } = request.query;
      const callerId = request.user?.id;

      if ((mine || subscribed) && !callerId) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Authentication required for this list',
        });
      }

      let query = supabaseAdmin
        .from('collections')
        .select(COLLECTION_COLUMNS)
        .range(offset, offset + limit - 1);

      if (subscribed && callerId) {
        const { data: subs } = await supabaseAdmin
          .from('collection_subscriptions')
          .select('collection_id')
          .eq('user_id', callerId);

        const ids = (subs ?? []).map((s) => s.collection_id);
        if (ids.length === 0) return { items: [] };
        // A deck its owner made private again disappears from subscribers
        query = query.in('id', ids).eq('is_public', true);
      } else if (mine && callerId) {
        query = query.eq('user_id', callerId);
      } else {
        query = query.eq('is_public', true);
      }

      const { data, error } = await query;

      if (error) {
        return reply.status(500).send({
          error: 'DatabaseError',
          message: error.message,
        });
      }

      const collections = (data ?? []) as CollectionRow[];
      if (collections.length === 0) return { items: [] };

      const summaries = new Map<
        string,
        { item_count: number; previews: { file_url: string; file_type: string }[] }
      >();

      // Manual collections: one query for all of their items
      const manualIds = collections.filter((c) => !c.rule).map((c) => c.id);
      if (manualIds.length > 0) {
        const { data: itemRows } = await supabaseAdmin
          .from('collection_items')
          .select(
            `
            collection_id,
            user_medias!inner (
              medias!inner (
                file_url,
                file_type
              )
            )
          `
          )
          .in('collection_id', manualIds);

        for (const row of (itemRows ?? []) as any[]) {
          const summary = summaries.get(row.collection_id) ?? { item_count: 0, previews: [] };
          summary.item_count += 1;
          const media = row.user_medias?.medias;
          if (media && summary.previews.length < MAX_COLLECTION_PREVIEWS) {
            summary.previews.push({ file_url: media.file_url, file_type: media.file_type });
          }
          summaries.set(row.collection_id, summary);
        }
      }

      // Dynamic collections: evaluate each rule
      await Promise.all(
        collections
          .filter((c) => c.rule)
          .map(async (c) => {
            const { items } = await resolveItems(c, callerId === c.user_id);
            summaries.set(c.id, {
              item_count: items.length,
              previews: items
                .slice(0, MAX_COLLECTION_PREVIEWS)
                .map((i) => ({ file_url: i.file_url, file_type: i.file_type })),
            });
          })
      );

      const { data: owners } = await supabaseAdmin
        .from('users')
        .select('id, username')
        .in('id', [...new Set(collections.map((c) => c.user_id))]);
      const ownerNames = new Map((owners ?? []).map((o) => [o.id, o.username as string | null]));

      return {
        items: collections.map((c) => ({
          ...c,
          item_count: summaries.get(c.id)?.item_count ?? 0,
          previews: summaries.get(c.id)?.previews ?? [],
          owner_username: ownerNames.get(c.user_id) ?? null,
        })),
      };
    }
  );

  server.get(
    '/api/v1/collections/:collectionId',
    {
      preHandler: [app.optionalAuth],
      schema: {
        tags: ['Collections'],
        summary: 'Get a collection and its media items',
        params: z.object({
          collectionId: z.string().uuid(),
        }),
        response: {
          200: z.object({
            collection: collectionSchema,
            items: z.array(collectionMediaItemSchema),
            owner_username: z.string().nullable(),
            is_subscribed: z.boolean(),
          }),
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const callerId = request.user?.id;
      const loaded = await loadVisibleCollection(request.params.collectionId, callerId);
      if (!loaded.ok) {
        return reply.status(loaded.status).send({ error: loaded.error, message: loaded.message });
      }
      const { collection, isOwner } = loaded;

      const [{ items, error }, ownerRes, subRes] = await Promise.all([
        resolveItems(collection, isOwner),
        supabaseAdmin.from('users').select('username').eq('id', collection.user_id).maybeSingle(),
        callerId && !isOwner
          ? supabaseAdmin
              .from('collection_subscriptions')
              .select('collection_id', { count: 'exact', head: true })
              .eq('user_id', callerId)
              .eq('collection_id', collection.id)
          : Promise.resolve({ count: 0 }),
      ]);

      if (error) {
        return reply.status(404).send({ error: 'DatabaseError', message: error });
      }

      return {
        collection,
        items,
        owner_username: ownerRes.data?.username ?? null,
        is_subscribed: (subRes.count ?? 0) > 0,
      };
    }
  );

  server.get(
    '/api/v1/collections/:collectionId/random',
    {
      preHandler: [app.optionalAuth],
      schema: {
        tags: ['Collections'],
        summary: 'Draw N random media items from a collection',
        params: z.object({
          collectionId: z.string().uuid(),
        }),
        querystring: z.object({
          count: z.coerce.number().int().min(1).max(50).default(10),
        }),
        response: {
          200: z.object({
            collection_id: z.string().uuid(),
            items: z.array(collectionMediaItemSchema),
          }),
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { collectionId } = request.params;
      const loaded = await loadVisibleCollection(collectionId, request.user?.id);
      if (!loaded.ok) {
        return reply.status(loaded.status).send({ error: loaded.error, message: loaded.message });
      }

      const { items, error } = await resolveItems(loaded.collection, loaded.isOwner);
      if (error) {
        return reply.status(404).send({ error: 'DatabaseError', message: error });
      }

      return {
        collection_id: collectionId,
        items: shuffleArray(items).slice(0, request.query.count),
      };
    }
  );

  server.patch(
    '/api/v1/collections/:collectionId',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Collections'],
        summary: 'Update a collection title or privacy',
        security: [{ bearerAuth: [] }],
        params: z.object({
          collectionId: z.string().uuid(),
        }),
        body: z
          .object({
            title: z.string().min(1).max(120).optional(),
            is_public: z.boolean().optional(),
          })
          .refine((val) => val.title !== undefined || val.is_public !== undefined, {
            message: 'At least one field (title or is_public) must be provided',
          }),
        response: {
          200: collectionSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { collectionId } = request.params;
      const userId = request.user!.id;

      const { data, error } = await supabaseAdmin
        .from('collections')
        .update(request.body)
        .eq('id', collectionId)
        .eq('user_id', userId)
        .select(COLLECTION_COLUMNS)
        .single();

      if (error || !data) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'Collection not found',
        });
      }

      return data;
    }
  );

  server.delete(
    '/api/v1/collections/:collectionId',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Collections'],
        summary: 'Delete a collection',
        security: [{ bearerAuth: [] }],
        params: z.object({
          collectionId: z.string().uuid(),
        }),
        response: {
          204: z.null(),
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { collectionId } = request.params;
      const userId = request.user!.id;

      const { data, error } = await supabaseAdmin
        .from('collections')
        .delete()
        .eq('id', collectionId)
        .eq('user_id', userId)
        .select('id')
        .single();

      if (error || !data) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'Collection not found',
        });
      }

      return reply.status(204).send(null);
    }
  );

  server.post(
    '/api/v1/collections/:collectionId/items',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Collections'],
        summary: 'Add a media item from your library to a collection',
        security: [{ bearerAuth: [] }],
        params: z.object({
          collectionId: z.string().uuid(),
        }),
        body: z.object({
          user_media_id: z.string().uuid(),
        }),
        response: {
          201: z.object({
            collection_id: z.string().uuid(),
            user_media_id: z.string().uuid(),
          }),
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { collectionId } = request.params;
      const { user_media_id } = request.body;
      const userId = request.user!.id;

      // Ensure collection belongs to user
      const { data: collection } = await supabaseAdmin
        .from('collections')
        .select('id, rule')
        .eq('id', collectionId)
        .eq('user_id', userId)
        .maybeSingle();

      if (!collection) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'Collection not found',
        });
      }

      if (collection.rule) {
        return reply.status(400).send({
          error: 'BadRequest',
          message: 'This is a dynamic collection: its content comes from its rule',
        });
      }

      // Ensure user_media belongs to user
      const { data: userMedia } = await supabaseAdmin
        .from('user_medias')
        .select('id')
        .eq('id', user_media_id)
        .eq('user_id', userId)
        .maybeSingle();

      if (!userMedia) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'Media item not found in your library',
        });
      }

      const { data, error } = await supabaseAdmin
        .from('collection_items')
        .insert({ collection_id: collectionId, user_media_id })
        .select('collection_id, user_media_id')
        .single();

      if (error) {
        if (error.code === '23505') {
          return reply.status(409).send({
            error: 'Conflict',
            message: 'Item is already in this collection',
          });
        }
        return reply.status(500).send({
          error: 'DatabaseError',
          message: error.message,
        });
      }

      return reply.status(201).send(data);
    }
  );

  server.delete(
    '/api/v1/collections/:collectionId/items/:userMediaId',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Collections'],
        summary: 'Remove a media item from a collection',
        security: [{ bearerAuth: [] }],
        params: z.object({
          collectionId: z.string().uuid(),
          userMediaId: z.string().uuid(),
        }),
        response: {
          204: z.null(),
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { collectionId, userMediaId } = request.params;
      const userId = request.user!.id;

      // Verify ownership of collection
      const { data: collection } = await supabaseAdmin
        .from('collections')
        .select('id')
        .eq('id', collectionId)
        .eq('user_id', userId)
        .maybeSingle();

      if (!collection) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'Collection not found',
        });
      }

      const { data, error } = await supabaseAdmin
        .from('collection_items')
        .delete()
        .eq('collection_id', collectionId)
        .eq('user_media_id', userMediaId)
        .select('collection_id')
        .single();

      if (error || !data) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'Item not found in collection',
        });
      }

      return reply.status(204).send(null);
    }
  );

  // Subscribe to someone else's public deck
  server.post(
    '/api/v1/collections/:collectionId/subscribe',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Collections'],
        summary: 'Subscribe to a public collection',
        security: [{ bearerAuth: [] }],
        params: z.object({ collectionId: z.string().uuid() }),
        response: {
          200: z.object({ subscribed: z.boolean() }),
          400: errorSchema,
          403: errorSchema,
          404: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const callerId = request.user!.id;
      const loaded = await loadVisibleCollection(request.params.collectionId, callerId);
      if (!loaded.ok) {
        return reply.status(loaded.status).send({ error: loaded.error, message: loaded.message });
      }
      if (loaded.isOwner) {
        return reply.status(400).send({
          error: 'BadRequest',
          message: 'You cannot subscribe to your own collection',
        });
      }

      const { error } = await supabaseAdmin
        .from('collection_subscriptions')
        .upsert(
          { user_id: callerId, collection_id: loaded.collection.id },
          { onConflict: 'user_id, collection_id' }
        );

      if (error) {
        return reply.status(500).send({ error: 'DatabaseError', message: error.message });
      }

      return { subscribed: true };
    }
  );

  server.delete(
    '/api/v1/collections/:collectionId/subscribe',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Collections'],
        summary: 'Unsubscribe from a collection',
        security: [{ bearerAuth: [] }],
        params: z.object({ collectionId: z.string().uuid() }),
        response: {
          200: z.object({ subscribed: z.boolean() }),
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { error } = await supabaseAdmin
        .from('collection_subscriptions')
        .delete()
        .eq('user_id', request.user!.id)
        .eq('collection_id', request.params.collectionId);

      if (error) {
        return reply.status(500).send({ error: 'DatabaseError', message: error.message });
      }

      return { subscribed: false };
    }
  );

  // Copy a whole deck into your own collections (a private, manual snapshot)
  server.post(
    '/api/v1/collections/:collectionId/fork',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Collections'],
        summary: 'Copy a collection and its memes into your own library',
        security: [{ bearerAuth: [] }],
        params: z.object({ collectionId: z.string().uuid() }),
        response: {
          201: z.object({
            collection: collectionSchema,
            copied_count: z.number().int(),
          }),
          403: errorSchema,
          404: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const callerId = request.user!.id;
      const loaded = await loadVisibleCollection(request.params.collectionId, callerId);
      if (!loaded.ok) {
        return reply.status(loaded.status).send({ error: loaded.error, message: loaded.message });
      }
      const source = loaded.collection;

      const { items, error: itemsError } = await resolveItems(source, loaded.isOwner);
      if (itemsError) {
        return reply.status(500).send({ error: 'DatabaseError', message: itemsError });
      }

      const { data: created, error: createError } = await supabaseAdmin
        .from('collections')
        .insert({ user_id: callerId, title: source.title, is_public: false, rule: null })
        .select(COLLECTION_COLUMNS)
        .single();

      if (createError || !created) {
        return reply.status(500).send({
          error: 'DatabaseError',
          message: createError?.message ?? 'Failed to create the copy',
        });
      }

      const mediaIds = [...new Set(items.map((i) => i.media_id))];
      let copiedCount = 0;

      if (mediaIds.length > 0) {
        // Reuse library entries the caller already has; fork the rest
        const { data: existing } = await supabaseAdmin
          .from('user_medias')
          .select('id, media_id')
          .eq('user_id', callerId)
          .in('media_id', mediaIds);

        const ownByMedia = new Map((existing ?? []).map((um) => [um.media_id, um.id]));
        const missing = mediaIds.filter((id) => !ownByMedia.has(id));

        if (missing.length > 0) {
          const { data: sourceRows } = await supabaseAdmin
            .from('user_medias')
            .select('media_id, custom_title, tags, is_nsfw')
            .eq('user_id', source.user_id)
            .in('media_id', missing);

          const { data: forked } = await supabaseAdmin
            .from('user_medias')
            .insert(
              (sourceRows ?? []).map((row) => ({
                user_id: callerId,
                media_id: row.media_id,
                custom_title: row.custom_title,
                tags: row.tags ?? [],
                is_nsfw: row.is_nsfw ?? false,
                is_public: false,
              }))
            )
            .select('id, media_id');

          for (const um of forked ?? []) ownByMedia.set(um.media_id, um.id);
        }

        const links = [...ownByMedia.values()].map((userMediaId) => ({
          collection_id: created.id,
          user_media_id: userMediaId,
        }));

        if (links.length > 0) {
          const { data: linked } = await supabaseAdmin
            .from('collection_items')
            .insert(links)
            .select('user_media_id');
          copiedCount = linked?.length ?? 0;
        }
      }

      return reply.status(201).send({ collection: created, copied_count: copiedCount });
    }
  );
}
