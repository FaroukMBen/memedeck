import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { supabaseAdmin } from '../../lib/supabase.js';
import { env } from '../../config/env.js';

const userProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  username: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  allow_friends_see_private: z.boolean().default(false),
  allow_profile_comments: z.boolean().default(true),
  is_library_public: z.boolean().default(true),
  created_at: z.string().nullable().optional(),
});

const publicProfileViewSchema = z.object({
  id: z.string().uuid(),
  username: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  allow_friends_see_private: z.boolean(),
  allow_profile_comments: z.boolean(),
  is_library_public: z.boolean(),
  created_at: z.string().nullable().optional(),
  stats: z.object({
    published_count: z.number(),
    library_count: z.number(),
    total_likes: z.number(),
    total_dislikes: z.number(),
  }),
  friendship_status: z.enum(['none', 'pending_sent', 'pending_received', 'friends', 'self']),
  is_own_profile: z.boolean(),
});

const publicationItemSchema = z.object({
  id: z.string().uuid(),
  user_media_id: z.string().uuid().nullable().optional(),
  file_url: z.string(),
  file_type: z.string(),
  original_title: z.string().nullable().optional(),
  custom_title: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  is_nsfw: z.boolean().default(false),
  is_public: z.boolean(),
  likes_count: z.number().default(0),
  dislikes_count: z.number().default(0),
  created_at: z.string(),
});

const profileCommentItemSchema = z.object({
  id: z.string().uuid(),
  profile_user_id: z.string().uuid(),
  author_id: z.string().uuid(),
  author_username: z.string().nullable().optional(),
  author_avatar_url: z.string().nullable().optional(),
  content: z.string(),
  created_at: z.string(),
  can_delete: z.boolean(),
});

const errorSchema = z.object({
  error: z.string(),
  message: z.string(),
});

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  // 1. Get current authenticated user
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
      let { data, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      // If user row is missing in public.users, recover it from auth.users
      if (!data) {
        const { data: authData } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (authData?.user) {
          const email = authData.user.email ?? '';
          const username = authData.user.user_metadata?.username ?? email.split('@')[0] ?? 'User';
          const { data: created } = await supabaseAdmin
            .from('users')
            .upsert({ id: userId, email, username, is_library_public: false })
            .select('*')
            .maybeSingle();
          data = created;
        }
      }

      if (!data) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'User profile not found',
        });
      }

      return {
        id: data.id,
        email: data.email,
        username: data.username ?? null,
        avatar_url: data.avatar_url ?? null,
        bio: data.bio ?? null,
        allow_friends_see_private: data.allow_friends_see_private ?? false,
        allow_profile_comments: data.allow_profile_comments ?? true,
        is_library_public: data.is_library_public ?? false,
        created_at: data.created_at ?? null,
      };
    }
  );

  // 2. Update current authenticated user
  server.patch(
    '/api/v1/users/me',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Users'],
        summary: 'Update authenticated user profile settings',
        security: [{ bearerAuth: [] }],
        body: z
          .object({
            username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/).optional(),
            avatar_url: z.string().nullable().optional(),
            bio: z.string().max(500).nullable().optional(),
            allow_friends_see_private: z.boolean().optional(),
            allow_profile_comments: z.boolean().optional(),
            is_library_public: z.boolean().optional(),
          })
          .refine((data) => Object.keys(data).length > 0, {
            message: 'At least one field must be provided',
          }),
        response: {
          200: userProfileSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const updatePayload = request.body;

      const { data, error } = await supabaseAdmin
        .from('users')
        .update(updatePayload)
        .eq('id', userId)
        .select('id, email, username, avatar_url, bio, allow_friends_see_private, allow_profile_comments, is_library_public, created_at')
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

  // 2b. Upload user avatar (PFP)
  server.post(
    '/api/v1/users/me/avatar',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Users'],
        summary: 'Upload a custom profile picture (avatar)',
        security: [{ bearerAuth: [] }],
        response: {
          200: z.object({
            avatar_url: z.string(),
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
          message: 'An image file must be provided in multipart/form-data',
        });
      }

      if (!file.mimetype.startsWith('image/')) {
        return reply.status(400).send({
          error: 'UnsupportedMediaType',
          message: 'Only image files are allowed for your profile picture',
        });
      }

      const userId = request.user!.id;
      const ext = file.filename.split('.').pop()?.toLowerCase() || 'webp';
      const storagePath = `avatars/${userId}-${Date.now()}.${ext}`;
      const buffer = await file.toBuffer();

      const { error: uploadError } = await supabaseAdmin.storage
        .from(env.SUPABASE_STORAGE_BUCKET)
        .upload(storagePath, buffer, {
          contentType: file.mimetype,
          upsert: true,
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

      const avatarUrl = publicUrlData.publicUrl;

      // Update avatar_url in public.users
      await supabaseAdmin
        .from('users')
        .update({ avatar_url: avatarUrl })
        .eq('id', userId);

      return {
        avatar_url: avatarUrl,
      };
    }
  );

  // 3. Get public profile with stats and friendship relation
  server.get(
    '/api/v1/users/:userId/profile',
    {
      preHandler: [app.optionalAuth],
      schema: {
        tags: ['Users'],
        summary: 'Get public user profile with statistics',
        params: z.object({
          userId: z.string().uuid(),
        }),
        response: {
          200: publicProfileViewSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.params;
      const callerId = request.user?.id;
      const isOwnProfile = callerId === userId;

      let { data: userRecord, error: userErr } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      // If user row is missing in public.users, recover it from auth.users
      if (!userRecord) {
        const { data: authData } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (authData?.user) {
          const email = authData.user.email ?? '';
          const username = authData.user.user_metadata?.username ?? email.split('@')[0] ?? 'User';
          const { data: created } = await supabaseAdmin
            .from('users')
            .upsert({ id: userId, email, username, is_library_public: false })
            .select('*')
            .maybeSingle();
          userRecord = created;
        }
      }

      if (!userRecord) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'User profile not found',
        });
      }

      // Fetch statistics in parallel
      const [publishedRes, libraryRes, reactionsRes] = await Promise.all([
        supabaseAdmin
          .from('medias')
          .select('id', { count: 'exact', head: true })
          .eq('original_uploader_id', userId),
        supabaseAdmin
          .from('user_medias')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
        supabaseAdmin
          .from('medias')
          .select('likes_count, dislikes_count')
          .eq('original_uploader_id', userId),
      ]);

      const publishedCount = publishedRes.count ?? 0;
      const libraryCount = libraryRes.count ?? 0;
      let totalLikes = 0;
      let totalDislikes = 0;
      if (reactionsRes.data) {
        for (const row of reactionsRes.data) {
          totalLikes += row.likes_count || 0;
          totalDislikes += row.dislikes_count || 0;
        }
      }

      // Determine friendship status
      let friendshipStatus: 'none' | 'pending_sent' | 'pending_received' | 'friends' | 'self' = 'none';
      if (isOwnProfile) {
        friendshipStatus = 'self';
      } else if (callerId) {
        const { data: friendship } = await supabaseAdmin
          .from('friendships')
          .select('id, requester_id, addressee_id, status')
          .or(
            `and(requester_id.eq.${callerId},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${callerId})`
          )
          .maybeSingle();

        if (friendship) {
          if (friendship.status === 'accepted') {
            friendshipStatus = 'friends';
          } else if (friendship.status === 'pending') {
            friendshipStatus = friendship.requester_id === callerId ? 'pending_sent' : 'pending_received';
          }
        }
      }

      return {
        id: userRecord.id,
        username: userRecord.username ?? null,
        avatar_url: userRecord.avatar_url ?? null,
        bio: userRecord.bio ?? null,
        allow_friends_see_private: userRecord.allow_friends_see_private ?? false,
        allow_profile_comments: userRecord.allow_profile_comments ?? true,
        is_library_public: userRecord.is_library_public ?? false,
        created_at: userRecord.created_at ?? null,
        stats: {
          published_count: publishedCount,
          library_count: libraryCount,
          total_likes: totalLikes,
          total_dislikes: totalDislikes,
        },
        friendship_status: friendshipStatus,
        is_own_profile: isOwnProfile,
      };
    }
  );

  // 4. Get publications (medias originally created by this user)
  server.get(
    '/api/v1/users/:userId/publications',
    {
      preHandler: [app.optionalAuth],
      schema: {
        tags: ['Users'],
        summary: 'Get publications created by this user',
        params: z.object({
          userId: z.string().uuid(),
        }),
        response: {
          200: z.object({
            items: z.array(publicationItemSchema),
          }),
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.params;
      const callerId = request.user?.id;
      const isOwnProfile = callerId === userId;

      const { data: targetUser, error: userErr } = await supabaseAdmin
        .from('users')
        .select('id, allow_friends_see_private')
        .eq('id', userId)
        .single();

      if (userErr || !targetUser) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'User not found',
        });
      }

      // Check if caller can view private publications
      let canSeePrivate = isOwnProfile;
      if (!canSeePrivate && callerId && targetUser.allow_friends_see_private) {
        const { data: friendship } = await supabaseAdmin
          .from('friendships')
          .select('status')
          .or(
            `and(requester_id.eq.${callerId},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${callerId})`
          )
          .eq('status', 'accepted')
          .maybeSingle();

        if (friendship) {
          canSeePrivate = true;
        }
      }

      let query = supabaseAdmin
        .from('user_medias')
        .select(`
          id,
          custom_title,
          tags,
          is_nsfw,
          is_public,
          added_at,
          media:medias!inner (
            id,
            file_url,
            file_type,
            original_title,
            original_uploader_id,
            likes_count,
            dislikes_count,
            created_at
          )
        `)
        .eq('user_id', userId)
        .eq('media.original_uploader_id', userId)
        .order('added_at', { ascending: false });

      if (!canSeePrivate) {
        query = query.eq('is_public', true);
      }

      const { data, error } = await query;

      if (error) {
        return reply.status(404).send({
          error: 'QueryError',
          message: error.message,
        });
      }

      const items = (data ?? []).map((row: any) => ({
        id: row.media.id,
        user_media_id: row.id,
        file_url: row.media.file_url,
        file_type: row.media.file_type,
        original_title: row.media.original_title,
        custom_title: row.custom_title,
        tags: row.tags ?? [],
        is_nsfw: row.is_nsfw ?? false,
        is_public: row.is_public ?? true,
        likes_count: row.media.likes_count ?? 0,
        dislikes_count: row.media.dislikes_count ?? 0,
        created_at: row.media.created_at,
      }));

      return { items };
    }
  );

  // 5. Get profile comments (paginated)
  server.get(
    '/api/v1/users/:userId/comments',
    {
      preHandler: [app.optionalAuth],
      schema: {
        tags: ['Users'],
        summary: 'Get paginated profile comments',
        params: z.object({
          userId: z.string().uuid(),
        }),
        querystring: z.object({
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(50).default(10),
        }),
        response: {
          200: z.object({
            comments: z.array(profileCommentItemSchema),
            total: z.number(),
            page: z.number(),
            total_pages: z.number(),
          }),
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.params;
      const { page, limit } = request.query;
      const callerId = request.user?.id;

      const offset = (page - 1) * limit;

      const { data, count, error } = await supabaseAdmin
        .from('profile_comments')
        .select(
          `
          id,
          profile_user_id,
          author_id,
          content,
          created_at,
          author:users!author_id (
            username,
            avatar_url
          )
        `,
          { count: 'exact' }
        )
        .eq('profile_user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        return reply.status(404).send({
          error: 'QueryError',
          message: error.message,
        });
      }

      const total = count ?? 0;
      const totalPages = Math.ceil(total / limit) || 1;

      const comments = (data ?? []).map((row: any) => ({
        id: row.id,
        profile_user_id: row.profile_user_id,
        author_id: row.author_id,
        author_username: row.author?.username ?? null,
        author_avatar_url: row.author?.avatar_url ?? null,
        content: row.content,
        created_at: row.created_at,
        can_delete: callerId === row.author_id || callerId === userId,
      }));

      return {
        comments,
        total,
        page,
        total_pages: totalPages,
      };
    }
  );

  // 6. Post a comment on a user's profile
  server.post(
    '/api/v1/users/:userId/comments',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Users'],
        summary: 'Post a comment on a profile',
        security: [{ bearerAuth: [] }],
        params: z.object({
          userId: z.string().uuid(),
        }),
        body: z.object({
          content: z.string().min(1).max(1000),
        }),
        response: {
          201: profileCommentItemSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.params;
      const callerId = request.user!.id;
      const { content } = request.body;

      // Check if profile exists and allows comments
      const { data: profileUser, error: pErr } = await supabaseAdmin
        .from('users')
        .select('id, allow_profile_comments')
        .eq('id', userId)
        .single();

      if (pErr || !profileUser) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'User profile not found',
        });
      }

      if (!profileUser.allow_profile_comments) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Comments are disabled on this profile',
        });
      }

      const { data: inserted, error: insErr } = await supabaseAdmin
        .from('profile_comments')
        .insert({
          profile_user_id: userId,
          author_id: callerId,
          content,
        })
        .select(`
          id,
          profile_user_id,
          author_id,
          content,
          created_at,
          author:users!author_id (
            username,
            avatar_url
          )
        `)
        .single();

      if (insErr || !inserted) {
        return reply.status(404).send({
          error: 'InsertError',
          message: insErr?.message ?? 'Failed to post comment',
        });
      }

      const row: any = inserted;
      return reply.status(201).send({
        id: row.id,
        profile_user_id: row.profile_user_id,
        author_id: row.author_id,
        author_username: row.author?.username ?? null,
        author_avatar_url: row.author?.avatar_url ?? null,
        content: row.content,
        created_at: row.created_at,
        can_delete: true,
      });
    }
  );

  // 7. Delete a comment
  server.delete(
    '/api/v1/users/:userId/comments/:commentId',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Users'],
        summary: 'Delete a comment from a profile',
        security: [{ bearerAuth: [] }],
        params: z.object({
          userId: z.string().uuid(),
          commentId: z.string().uuid(),
        }),
        response: {
          204: z.null(),
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { userId, commentId } = request.params;
      const callerId = request.user!.id;

      const { data: comment, error: fetchErr } = await supabaseAdmin
        .from('profile_comments')
        .select('id, profile_user_id, author_id')
        .eq('id', commentId)
        .eq('profile_user_id', userId)
        .single();

      if (fetchErr || !comment) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'Comment not found',
        });
      }

      // Can delete if author OR profile owner
      if (callerId !== comment.author_id && callerId !== comment.profile_user_id) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'You are not authorized to delete this comment',
        });
      }

      await supabaseAdmin.from('profile_comments').delete().eq('id', commentId);
      return reply.status(204).send(null);
    }
  );

  // 8. Friend Request
  server.post(
    '/api/v1/users/:userId/friend-request',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Users'],
        summary: 'Send or toggle friend request',
        security: [{ bearerAuth: [] }],
        params: z.object({
          userId: z.string().uuid(),
        }),
        response: {
          200: z.object({
            status: z.enum(['pending_sent', 'friends']),
            message: z.string(),
          }),
          400: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.params;
      const callerId = request.user!.id;

      if (callerId === userId) {
        return reply.status(400).send({
          error: 'BadRequest',
          message: 'Cannot send a friend request to yourself',
        });
      }

      // Check existing friendship
      const { data: existing } = await supabaseAdmin
        .from('friendships')
        .select('id, requester_id, addressee_id, status')
        .or(
          `and(requester_id.eq.${callerId},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${callerId})`
        )
        .maybeSingle();

      if (existing) {
        if (existing.status === 'accepted') {
          return reply.status(200).send({
            status: 'friends' as const,
            message: 'You are already friends',
          });
        }
        if (existing.status === 'pending' && existing.requester_id === userId) {
          // The other user had already requested friendship -> Auto accept!
          await supabaseAdmin
            .from('friendships')
            .update({ status: 'accepted', updated_at: new Date().toISOString() })
            .eq('id', existing.id);

          return reply.status(200).send({
            status: 'friends' as const,
            message: 'Friend request accepted',
          });
        }
        return reply.status(200).send({
          status: 'pending_sent' as const,
          message: 'Friend request already sent',
        });
      }

      // Create new pending friendship
      const { error: insErr } = await supabaseAdmin.from('friendships').insert({
        requester_id: callerId,
        addressee_id: userId,
        status: 'pending',
      });

      if (insErr) {
        return reply.status(400).send({
          error: 'InsertError',
          message: insErr.message,
        });
      }

      return reply.status(200).send({
        status: 'pending_sent' as const,
        message: 'Friend request sent',
      });
    }
  );

  // 9. Accept Friend Request
  server.post(
    '/api/v1/users/:userId/friend-accept',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Users'],
        summary: 'Accept an incoming friend request',
        security: [{ bearerAuth: [] }],
        params: z.object({
          userId: z.string().uuid(),
        }),
        response: {
          200: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.params;
      const callerId = request.user!.id;

      const { data: existing, error } = await supabaseAdmin
        .from('friendships')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('requester_id', userId)
        .eq('addressee_id', callerId)
        .eq('status', 'pending')
        .select()
        .single();

      if (error || !existing) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'No pending friend request found from this user',
        });
      }

      return {
        success: true,
        message: 'Friend request accepted',
      };
    }
  );

  // 10. Remove Friendship / Cancel request
  server.delete(
    '/api/v1/users/:userId/friendship',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Users'],
        summary: 'Remove friend or cancel request',
        security: [{ bearerAuth: [] }],
        params: z.object({
          userId: z.string().uuid(),
        }),
        response: {
          204: z.null(),
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.params;
      const callerId = request.user!.id;

      const { error } = await supabaseAdmin
        .from('friendships')
        .delete()
        .or(
          `and(requester_id.eq.${callerId},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${callerId})`
        );

      if (error) {
        return reply.status(404).send({
          error: 'DeleteError',
          message: error.message,
        });
      }

      return reply.status(204).send(null);
    }
  );

  // 11. User Library
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
                custom_title: z.string().nullable().optional(),
                tags: z.array(z.string()).default([]),
                is_nsfw: z.boolean().default(false),
                is_public: z.boolean(),
                added_at: z.string(),
                media: z.object({
                  id: z.string().uuid(),
                  file_url: z.string(),
                  file_type: z.string(),
                  original_title: z.string().nullable().optional(),
                  tags: z.array(z.string()).default([]),
                  original_uploader_id: z.string().uuid().nullable(),
                  likes_count: z.number().default(0),
                  dislikes_count: z.number().default(0),
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
          custom_title,
          tags,
          is_nsfw,
          is_public,
          added_at,
          media:medias (
            id,
            file_url,
            file_type,
            original_title,
            original_uploader_id,
            likes_count,
            dislikes_count,
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
