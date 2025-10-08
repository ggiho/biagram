import { z } from 'zod';

import { createTRPCRouter, publicProcedure } from '@/server/api/trpc';

export const userRouter = createTRPCRouter({
  // Get current user profile
  me: publicProcedure
    .query(async ({ ctx }) => {
      // Temporary implementation
      return null;
    }),

  // Get user by ID
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      // Temporary implementation
      return null;
    }),

  // Update user profile
  updateProfile: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Temporary implementation
      return {
        success: true,
        message: 'Profile update functionality coming soon',
      };
    }),
});