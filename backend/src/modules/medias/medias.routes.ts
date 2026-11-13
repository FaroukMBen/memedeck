import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import { compressVideoOrGif } from '../../lib/video.js';

const mediaSchema = z.object({
  id: z.string().uuid(),
  file_url: z.string(),
  file_type: z.string(),
  original_title: z.string().nullable().optional(),
  original_uploader_id: z.string().uuid().nullable(),
  likes_count: z.number().int().default(0),
  dislikes_count: z.number().int().default(0),
  user_reaction: z.union([z.literal(1), z.literal(-1)]).nullable().optional(),
  created_at: z.string(),
});

const userMediaSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  media_id: z.string().uuid(),
  custom_title: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  is_nsfw: z.boolean().default(false),
  is_public: z.boolean(),
  added_at: z.string(),
});

const reactionResponseSchema = z.object({
  media_id: z.string().uuid(),
  likes_count: z.number().int(),
  dislikes_count: z.number().int(),
  user_reaction: z.union([z.literal(1), z.literal(-1)]).nullable(),
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

function parseTags(rawTags?: string): string[] {
  if (!rawTags) return [];
  return Array.from(
    new Set(
      rawTags
        .split(',')
        .map((t) => t.trim().toLowerCase().replace(/^#/, ''))
        .filter((t) => t.length > 0 && t.length <= 30)
    )
  );
}

export async function mediasRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  // 1. Discover public medias with reaction counts, user reaction status, and tag filtering
  server.get(
    '/api/v1/medias',
    {
      preHandler: [app.optionalAuth],
      schema: {
        tags: ['Medias'],
        summary: 'Discover public media assets with reaction counts and tags',
        querystring: z.object({
          file_type: z.string().optional(),
          tag: z.string().optional(),
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
      const { file_type, tag, limit, offset } = request.query;
      const currentUserId = request.user?.id;

      // Base query selecting medias that have at least one public user_media
      let query = supabaseAdmin
        .from('medias')
        .select(
          `
          id,
          file_url,
          file_type,
          original_title,
          original_uploader_id,
          likes_count,
          dislikes_count,
          created_at,
          user_medias!inner(is_public, tags, is_nsfw)
        `
        )
        .eq('user_medias.is_public', true)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (file_type) {
        query = query.ilike('file_type', `${file_type}%`);
      }

      if (tag) {
        const cleanTag = tag.trim().toLowerCase().replace(/^#/, '');
        query = query.contains('user_medias.tags', [cleanTag]);
      }

      const { data, error } = await query;

      if (error) {
        return reply.status(500).send({
          error: 'DatabaseError',
          message: error.message,
        });
      }

      // If user is authenticated, query user's existing reactions for these media IDs
      const mediaIds = (data ?? []).map((row: any) => row.id);
      const userReactionsMap = new Map<string, 1 | -1>();

      if (currentUserId && mediaIds.length > 0) {
        const { data: reactions } = await supabaseAdmin
          .from('media_reactions')
          .select('media_id, reaction_type')
          .eq('user_id', currentUserId)
          .in('media_id', mediaIds);

        for (const r of reactions ?? []) {
          userReactionsMap.set(r.media_id, r.reaction_type as 1 | -1);
        }
      }

      const items = (data ?? []).map((row: any) => ({
        id: row.id,
        file_url: row.file_url,
        file_type: row.file_type,
        original_title: row.original_title ?? null,
        original_uploader_id: row.original_uploader_id,
        likes_count: row.likes_count ?? 0,
        dislikes_count: row.dislikes_count ?? 0,
        user_reaction: userReactionsMap.get(row.id) ?? null,
        created_at: row.created_at,
      }));

      return { items };
    }
  );

  // 2. Upload media with title, tags, and NSFW options
  server.post(
    '/api/v1/medias/upload',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Medias'],
        summary: 'Upload a new media asset with title and tags',
        security: [{ bearerAuth: [] }],
        querystring: z.object({
          title: z.string().optional(),
          tags: z.string().optional(),
          is_public: z.coerce.boolean().default(true),
          is_nsfw: z.coerce.boolean().default(false),
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
      const { title, tags, is_public, is_nsfw } = request.query;

      // Default title to filename without extension if empty
      const fallbackTitle = file.filename.replace(/\.[^/.]+$/, '').trim() || 'Untitled Meme';
      const resolvedTitle = title?.trim() || fallbackTitle;
      const resolvedTags = parseTags(tags);

      const rawBuffer = await file.toBuffer();
      const processed = await compressVideoOrGif(rawBuffer, file.mimetype, file.filename);

      const ext = processed.extension;
      const storagePath = `${userId}/${randomUUID()}.${ext}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from(env.SUPABASE_STORAGE_BUCKET)
        .upload(storagePath, processed.buffer, {
          contentType: processed.mimeType,
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
          file_type: processed.mimeType,
          original_title: resolvedTitle,
          original_uploader_id: userId,
          likes_count: 0,
          dislikes_count: 0,
        })
        .select('id, file_url, file_type, original_title, original_uploader_id, likes_count, dislikes_count, created_at')
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
          custom_title: resolvedTitle,
          tags: resolvedTags,
          is_nsfw,
          is_public,
        })
        .select('id, user_id, media_id, custom_title, tags, is_nsfw, is_public, added_at')
        .single();

      if (userMediaError || !userMedia) {
        return reply.status(500).send({
          error: 'DatabaseError',
          message: userMediaError?.message ?? 'Failed to link media to user library',
        });
      }

      return reply.status(201).send({
        media: {
          ...media,
          user_reaction: null,
        },
        user_media: userMedia,
      });
    }
  );

  // 3. Smart fork with title and tags customization
  server.post(
    '/api/v1/medias/:mediaId/fork',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Medias'],
        summary: 'Smart fork an existing media into your library with optional tags import',
        security: [{ bearerAuth: [] }],
        params: z.object({
          mediaId: z.string().uuid(),
        }),
        body: z
          .object({
            custom_title: z.string().optional(),
            tags: z.array(z.string()).optional(),
            import_tags: z.boolean().default(true),
            is_nsfw: z.boolean().optional(),
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

      // Verify media exists and is either owned or publicly shared
      const { data: media, error: mediaError } = await supabaseAdmin
        .from('medias')
        .select('id, original_title, original_uploader_id')
        .eq('id', mediaId)
        .single();

      if (mediaError || !media) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'Media not found',
        });
      }

      // Check access & retrieve source tags if import_tags is true
      let sourceTags: string[] = [];
      let sourceTitle: string | null = media.original_title;
      let sourceNsfw = false;

      const { data: sourceRef } = await supabaseAdmin
        .from('user_medias')
        .select('custom_title, tags, is_nsfw')
        .eq('media_id', mediaId)
        .eq('is_public', true)
        .limit(1)
        .maybeSingle();

      if (media.original_uploader_id !== userId && !sourceRef) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'Media is not publicly available to fork',
        });
      }

      if (sourceRef) {
        sourceTags = sourceRef.tags ?? [];
        if (sourceRef.custom_title) sourceTitle = sourceRef.custom_title;
        sourceNsfw = sourceRef.is_nsfw ?? false;
      }

      const finalTitle = request.body?.custom_title?.trim() || sourceTitle || 'Untitled Meme';
      const finalTags = request.body?.tags ?? (request.body?.import_tags !== false ? sourceTags : []);
      const finalNsfw = request.body?.is_nsfw !== undefined ? request.body.is_nsfw : sourceNsfw;

      const { data: forked, error: forkError } = await supabaseAdmin
        .from('user_medias')
        .insert({
          user_id: userId,
          media_id: mediaId,
          custom_title: finalTitle,
          tags: finalTags,
          is_nsfw: finalNsfw,
          is_public: isPublic,
        })
        .select('id, user_id, media_id, custom_title, tags, is_nsfw, is_public, added_at')
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

  // 4. Update user media item (title, tags, privacy, nsfw)
  server.patch(
    '/api/v1/user-medias/:userMediaId',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Medias'],
        summary: 'Update settings of a media item in your library',
        security: [{ bearerAuth: [] }],
        params: z.object({
          userMediaId: z.string().uuid(),
        }),
        body: z
          .object({
            custom_title: z.string().optional(),
            tags: z.array(z.string()).optional(),
            is_nsfw: z.boolean().optional(),
            is_public: z.boolean().optional(),
          })
          .refine(
            (data) =>
              data.custom_title !== undefined ||
              data.tags !== undefined ||
              data.is_nsfw !== undefined ||
              data.is_public !== undefined,
            { message: 'At least one field must be provided' }
          ),
        response: {
          200: userMediaSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { userMediaId } = request.params;
      const userId = request.user!.id;
      const updatePayload = request.body;

      const { data, error } = await supabaseAdmin
        .from('user_medias')
        .update(updatePayload)
        .eq('id', userMediaId)
        .eq('user_id', userId)
        .select('id, user_id, media_id, custom_title, tags, is_nsfw, is_public, added_at')
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

  // 5. Delete media from user library with automatic garbage collection
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
        const { data: media } = await supabaseAdmin
          .from('medias')
          .select('id, file_url')
          .eq('id', mediaId)
          .single();

        if (media) {
          await supabaseAdmin
            .from('medias')
            .delete()
            .eq('id', mediaId);

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

  // 6. Like or Dislike a media item (toggle reaction)
  server.post(
    '/api/v1/medias/:mediaId/reactions',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Medias'],
        summary: 'React to a media item with like (1), dislike (-1), or remove reaction (0)',
        security: [{ bearerAuth: [] }],
        params: z.object({
          mediaId: z.string().uuid(),
        }),
        body: z.object({
          reaction_type: z.union([z.literal(1), z.literal(-1), z.literal(0)]),
        }),
        response: {
          200: reactionResponseSchema,
          404: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { mediaId } = request.params;
      const { reaction_type } = request.body;
      const userId = request.user!.id;

      // Verify media exists
      const { data: media, error: mediaError } = await supabaseAdmin
        .from('medias')
        .select('id, likes_count, dislikes_count')
        .eq('id', mediaId)
        .single();

      if (mediaError || !media) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'Media not found',
        });
      }

      if (reaction_type === 0) {
        // Remove reaction
        await supabaseAdmin
          .from('media_reactions')
          .delete()
          .eq('user_id', userId)
          .eq('media_id', mediaId);
      } else {
        // Upsert reaction
        const { error: upsertError } = await supabaseAdmin
          .from('media_reactions')
          .upsert(
            {
              user_id: userId,
              media_id: mediaId,
              reaction_type,
            },
            { onConflict: 'user_id, media_id' }
          );

        if (upsertError) {
          return reply.status(500).send({
            error: 'DatabaseError',
            message: upsertError.message,
          });
        }
      }

      // Re-fetch updated counts
      const { data: updatedMedia } = await supabaseAdmin
        .from('medias')
        .select('likes_count, dislikes_count')
        .eq('id', mediaId)
        .single();

      return {
        media_id: mediaId,
        likes_count: updatedMedia?.likes_count ?? 0,
        dislikes_count: updatedMedia?.dislikes_count ?? 0,
        user_reaction: reaction_type === 0 ? null : reaction_type,
      };
    }
  );
}
