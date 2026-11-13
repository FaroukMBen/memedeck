import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { supabaseAdmin } from '../../lib/supabase.js';

const collectionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string(),
  is_public: z.boolean(),
});

const collectionMediaItemSchema = z.object({
  user_media_id: z.string().uuid(),
  media_id: z.string().uuid(),
  file_url: z.string(),
  file_type: z.string(),
  added_at: z.string(),
});

const errorSchema = z.object({
  error: z.string(),
  message: z.string(),
});

function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export async function collectionsRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    '/api/v1/collections',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Collections'],
        summary: 'Create a new collection',
        security: [{ bearerAuth: [] }],
        body: z.object({
          title: z.string().min(1).max(120),
          is_public: z.boolean().default(false),
        }),
        response: {
          201: collectionSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { title, is_public } = request.body;
      const userId = request.user!.id;

      const { data, error } = await supabaseAdmin
        .from('collections')
        .insert({
          user_id: userId,
          title,
          is_public,
        })
        .select('id, user_id, title, is_public')
        .single();

      if (error || !data) {
        return reply.status(500).send({
          error: 'DatabaseError',
          message: error?.message ?? 'Failed to create collection',
        });
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
        summary: 'List public collections (or your own collections)',
        querystring: z.object({
          mine: z.coerce.boolean().default(false),
          limit: z.coerce.number().int().min(1).max(100).default(30),
          offset: z.coerce.number().int().min(0).default(0),
        }),
        response: {
          200: z.object({
            items: z.array(collectionSchema),
          }),
          401: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { mine, limit, offset } = request.query;

      if (mine && !request.user) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Authentication required to filter by your collections',
        });
      }

      let query = supabaseAdmin
        .from('collections')
        .select('id, user_id, title, is_public')
        .range(offset, offset + limit - 1);

      if (mine && request.user) {
        query = query.eq('user_id', request.user.id);
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

      return { items: data ?? [] };
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
          }),
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { collectionId } = request.params;

      const { data: collection, error: colError } = await supabaseAdmin
        .from('collections')
        .select('id, user_id, title, is_public')
        .eq('id', collectionId)
        .single();

      if (colError || !collection) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'Collection not found',
        });
      }

      const isOwner = request.user?.id === collection.user_id;
      if (!collection.is_public && !isOwner) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'This collection is private',
        });
      }

      const { data: rawItems, error: itemsError } = await supabaseAdmin
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
              file_type
            )
          )
        `
        )
        .eq('collection_id', collectionId);

      if (itemsError) {
        return reply.status(404).send({
          error: 'DatabaseError',
          message: itemsError.message,
        });
      }

      const items = (rawItems ?? []).map((row: any) => ({
        user_media_id: row.user_media_id,
        media_id: row.user_medias.medias.id,
        file_url: row.user_medias.medias.file_url,
        file_type: row.user_medias.medias.file_type,
        added_at: row.user_medias.added_at,
      }));

      return { collection, items };
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
      const { count } = request.query;

      const { data: collection, error: colError } = await supabaseAdmin
        .from('collections')
        .select('id, user_id, is_public')
        .eq('id', collectionId)
        .single();

      if (colError || !collection) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'Collection not found',
        });
      }

      const isOwner = request.user?.id === collection.user_id;
      if (!collection.is_public && !isOwner) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'This collection is private',
        });
      }

      const { data: rawItems, error: itemsError } = await supabaseAdmin
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
              file_type
            )
          )
        `
        )
        .eq('collection_id', collectionId);

      if (itemsError) {
        return reply.status(404).send({
          error: 'DatabaseError',
          message: itemsError.message,
        });
      }

      const mapped = (rawItems ?? []).map((row: any) => ({
        user_media_id: row.user_media_id,
        media_id: row.user_medias.medias.id,
        file_url: row.user_medias.medias.file_url,
        file_type: row.user_medias.medias.file_type,
        added_at: row.user_medias.added_at,
      }));

      const sampled = shuffleArray(mapped).slice(0, count);

      return {
        collection_id: collectionId,
        items: sampled,
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
        .select('id, user_id, title, is_public')
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
}

