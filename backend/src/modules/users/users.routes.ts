import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { supabaseAdmin } from '../../lib/supabase.js';

const userProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  is_library_public: z.boolean(),
});

const errorSchema = z.object({
  error: z.string(),
  message: z.string(),
});

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    '/api/v1/users/me',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Users'],
        summary: 'Get authenticated user profile',
        security: [{ bearerAuth: [] }],
        response: {
          200: userProfileSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('id, email, is_library_public')
        .eq('id', userId)
        .single();

      if (error || !data) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'User profile not found',
        });
      }

      return data;
    }
  );

  server.patch(
    '/api/v1/users/me',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Users'],
        summary: 'Update authenticated user profile settings',
        security: [{ bearerAuth: [] }],
        body: z.object({
          is_library_public: z.boolean(),
        }),
        response: {
          200: userProfileSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { is_library_public } = request.body;

      const { data, error } = await supabaseAdmin
        .from('users')
        .update({ is_library_public })
        .eq('id', userId)
        .select('id, email, is_library_public')
        .single();

      if (error || !data) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'Failed to update user profile',
        });
      }

      return data;
    }
  );

  server.get(
    '/api/v1/users/:userId/library',
    {
      preHandler: [app.optionalAuth],
      schema: {
        tags: ['Users'],
        summary: "Browse a user's media library",
        params: z.object({
          userId: z.string().uuid(),
        }),
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(100).default(30),
          offset: z.coerce.number().int().min(0).default(0),
        }),
        response: {
          200: z.object({
            items: z.array(
              z.object({
                id: z.string().uuid(),
                user_id: z.string().uuid(),
                media_id: z.string().uuid(),
                is_public: z.boolean(),
                added_at: z.string(),
                media: z.object({
                  id: z.string().uuid(),
                  file_url: z.string(),
                  file_type: z.string(),
                  original_uploader_id: z.string().uuid().nullable(),
                  created_at: z.string(),
                }),
              })
            ),
          }),
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.params;
      const { limit, offset } = request.query;
      const isOwner = request.user?.id === userId;

      const { data: targetUser, error: userError } = await supabaseAdmin
        .from('users')
        .select('id, is_library_public')
        .eq('id', userId)
        .single();

      if (userError || !targetUser) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'User not found',
        });
      }

      if (!isOwner && !targetUser.is_library_public) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: "This user's library is private",
        });
      }

      let query = supabaseAdmin
        .from('user_medias')
        .select(
          `
          id,
          user_id,
          media_id,
          is_public,
          added_at,
          media:medias (
            id,
            file_url,
            file_type,
            original_uploader_id,
            created_at
          )
        `
        )
        .eq('user_id', userId)
        .order('added_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (!isOwner) {
        query = query.eq('is_public', true);
      }

      const { data, error } = await query;

      if (error) {
        return reply.status(404).send({
          error: 'QueryError',
          message: error.message,
        });
      }

      return { items: (data ?? []) as any };
    }
  );
}

