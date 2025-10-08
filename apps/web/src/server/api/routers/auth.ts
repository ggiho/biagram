import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { createTRPCRouter, publicProcedure } from '@/server/api/trpc';

export const authRouter = createTRPCRouter({
  signup: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(8),
        name: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Temporary implementation
      return {
        success: true,
        message: 'Signup functionality coming soon',
      };
    }),

  signin: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Temporary implementation
      return {
        success: true,
        message: 'Signin functionality coming soon',
      };
    }),

  signout: publicProcedure
    .mutation(async ({ ctx }) => {
      // Temporary implementation
      return {
        success: true,
        message: 'Signout functionality coming soon',
      };
    }),

  me: publicProcedure
    .query(async ({ ctx }) => {
      // Temporary implementation
      return null;
    }),
});