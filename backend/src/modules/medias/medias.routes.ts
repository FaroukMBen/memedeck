import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { supabaseAdmin } from '../../lib/supabase.js';

const mediaSchema = z.object({
  id: z.string().uuid(),
  file_url: z.string(),
  file_type: z.string(),
  original_uploader_id: z.string().uuid().nullable(),
  created_at: z.string(),
});

const userMediaSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  media_id: z.string().uuid(),
  is_public: z.boolean(),
  added_at: z.string(),
});

const errorSchema = z.object({
  error: z.string(),
  message: z.string(),
});

const ALLOWED_MIME_PREFIXES = ['image/', 'video/'];

function sanitizeExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length < 2) return 'bin';
  const ext = parts.pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  return ext || 'bin';
}

export async function mediasRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    '/api/v1/medias',
    {
      schema: {
        tags: ['Medias'],
        summary: 'Discover public media assets',
        querystring: z.object({
          file_type: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(100).default(30),
          offset: z.coerce.number().int().min(0).default(0),
        }),
        response: {
          200: z.object({
            items: z.array(mediaSchema),
          }),
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { file_type, limit, offset } = request.query;

      // Return medias that have at least one public user_media reference
      let query = supabaseAdmin
        .from('medias')
        .select(
          `
          id,
          file_url,
          file_type,
          original_uploader_id,
          created_at,
          user_medias!inner(is_public)
        `
        )
        .eq('user_medias.is_public', true)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (file_type) {
        query = query.ilike('file_type', `${file_type}%`);
      }

      const { data, error } = await query;

      if (error) {
        return reply.status(500).send({
          error: 'DatabaseError',
          message: error.message,
        });
      }

      const items = (data ?? []).map((row: any) => ({
        id: row.id,
        file_url: row.file_url,
        file_type: row.file_type,
        original_uploader_id: row.original_uploader_id,
        created_at: row.created_at,
      }));

      return { items };
    }
  );

  server.post(
    '/api/v1/medias/upload',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Medias'],
        summary: 'Upload a new media asset to Supabase Storage and add it to your library',
        security: [{ bearerAuth: [] }],
        querystring: z.object({
          is_public: z.coerce.boolean().default(true),
        }),
        response: {
          201: z.object({
            media: mediaSchema,
            user_media: userMediaSchema,
          }),
          400: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const file = await request.file();
      if (!file) {
        return reply.status(400).send({
          error: 'BadRequest',
          message: 'A media file must be provided in multipart/form-data',
        });
      }

      const isAllowedType = ALLOWED_MIME_PREFIXES.some((prefix) =>
        file.mimetype.startsWith(prefix)
      );
      if (!isAllowedType) {
        return reply.status(400).send({
          error: 'UnsupportedMediaType',
          message: `Unsupported file type: ${file.mimetype}. Only image/* and video/* are allowed.`,
        });
      }

      const userId = request.user!.id;
      const { is_public } = request.query;
      const ext = sanitizeExtension(file.filename);
      const storagePath = `${userId}/${randomUUID()}.${ext}`;
      const buffer = await file.toBuffer();

      const { error: uploadError } = await supabaseAdmin.storage
        .from(env.SUPABASE_STORAGE_BUCKET)
        .upload(storagePath, buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        return reply.status(500).send({
          error: 'StorageError',
          message: uploadError.message,
        });
      }

      const { data: publicUrlData } = supabaseAdmin.storage
        .from(env.SUPABASE_STORAGE_BUCKET)
        .getPublicUrl(storagePath);

      const { data: media, error: mediaError } = await supabaseAdmin
        .from('medias')
        .insert({
          file_url: publicUrlData.publicUrl,
          file_type: file.mimetype,
          original_uploader_id: userId,
        })
        .select('id, file_url, file_type, original_uploader_id, created_at')
        .single();

      if (mediaError || !media) {
        return reply.status(500).send({
          error: 'DatabaseError',
          message: mediaError?.message ?? 'Failed to insert media record',
        });
      }

      const { data: userMedia, error: userMediaError } = await supabaseAdmin
        .from('user_medias')
        .insert({
          user_id: userId,
          media_id: media.id,
          is_public,
        })
        .select('id, user_id, media_id, is_public, added_at')
        .single();

      if (userMediaError || !userMedia) {
        return reply.status(500).send({
          error: 'DatabaseError',
          message: userMediaError?.message ?? 'Failed to link media to user library',
        });
      }

      return reply.status(201).send({
        media,
        user_media: userMedia,
      });
    }
  );

  server.post(
    '/api/v1/medias/:mediaId/fork',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Medias'],
        summary: 'Smart fork an existing media into your library without duplicating storage',
        security: [{ bearerAuth: [] }],
        params: z.object({
          mediaId: z.string().uuid(),
        }),
        body: z
          .object({
            is_public: z.boolean().default(true),
          })
          .nullish(),
        response: {
          201: userMediaSchema,
          404: errorSchema,
          409: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { mediaId } = request.params;
      const userId = request.user!.id;
      const isPublic = request.body?.is_public ?? true;

      // Verify media exists and is either owned by user or publicly shared
      const { data: media, error: mediaError } = await supabaseAdmin
        .from('medias')
        .select('id, original_uploader_id')
        .eq('id', mediaId)
        .single();

      if (mediaError || !media) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'Media not found',
        });
      }

      if (media.original_uploader_id !== userId) {
        const { data: publicRef } = await supabaseAdmin
          .from('user_medias')
          .select('id')
          .eq('media_id', mediaId)
          .eq('is_public', true)
          .limit(1)
          .maybeSingle();

        if (!publicRef) {
          return reply.status(404).send({
            error: 'NotFound',
            message: 'Media is not publicly available to fork',
          });
        }
      }

      const { data: forked, error: forkError } = await supabaseAdmin
        .from('user_medias')
        .insert({
          user_id: userId,
          media_id: mediaId,
          is_public: isPublic,
        })
        .select('id, user_id, media_id, is_public, added_at')
        .single();

      if (forkError) {
        if (forkError.code === '23505') {
          return reply.status(409).send({
            error: 'Conflict',
            message: 'You already have this media in your library',
          });
        }
        return reply.status(500).send({
          error: 'DatabaseError',
          message: forkError.message,
        });
      }

      return reply.status(201).send(forked);
    }
  );

  server.patch(
    '/api/v1/user-medias/:userMediaId',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Medias'],
        summary: 'Update privacy setting of a media item in your library',
        security: [{ bearerAuth: [] }],
        params: z.object({
          userMediaId: z.string().uuid(),
        }),
        body: z.object({
          is_public: z.boolean(),
        }),
        response: {
          200: userMediaSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { userMediaId } = request.params;
      const { is_public } = request.body;
      const userId = request.user!.id;

      const { data, error } = await supabaseAdmin
        .from('user_medias')
        .update({ is_public })
        .eq('id', userMediaId)
        .eq('user_id', userId)
        .select('id, user_id, media_id, is_public, added_at')
        .single();

      if (error || !data) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'Library item not found',
        });
      }

      return data;
    }
  );

  server.delete(
    '/api/v1/user-medias/:userMediaId',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Medias'],
        summary: 'Remove a media item from your library with automatic garbage collection of unused files',
        security: [{ bearerAuth: [] }],
        params: z.object({
          userMediaId: z.string().uuid(),
        }),
        response: {
          204: z.null(),
          404: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { userMediaId } = request.params;
      const userId = request.user!.id;

      // 1. Find user_media to get the underlying media_id
      const { data: userMedia, error: findError } = await supabaseAdmin
        .from('user_medias')
        .select('id, media_id')
        .eq('id', userMediaId)
        .eq('user_id', userId)
        .single();

      if (findError || !userMedia) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'Library item not found',
        });
      }

      const mediaId = userMedia.media_id;

      // 2. Delete the user_media record
      const { error: deleteError } = await supabaseAdmin
        .from('user_medias')
        .delete()
        .eq('id', userMediaId)
        .eq('user_id', userId);

      if (deleteError) {
        return reply.status(500).send({
          error: 'DatabaseError',
          message: deleteError.message,
        });
      }

      // 3. Garbage Collection: check if other users still have this media in their library
      const { count, error: countError } = await supabaseAdmin
        .from('user_medias')
        .select('id', { count: 'exact', head: true })
        .eq('media_id', mediaId);

      if (!countError && (count === 0 || count === null)) {
        // No one else references this media: retrieve file_url before deleting canonical row
        const { data: media } = await supabaseAdmin
          .from('medias')
          .select('id, file_url')
          .eq('id', mediaId)
          .single();

        if (media) {
          // Delete canonical media record
          await supabaseAdmin
            .from('medias')
            .delete()
            .eq('id', mediaId);

          // Extract storage file path and physically delete from Supabase Storage
          const bucket = env.SUPABASE_STORAGE_BUCKET;
          const urlParts = media.file_url.split(`/${bucket}/`);
          if (urlParts.length > 1) {
            const storagePath = decodeURIComponent(urlParts[1]);
            await supabaseAdmin.storage
              .from(bucket)
              .remove([storagePath]);
          }
        }
      }

      return reply.status(204).send(null);
    }
  );
}

