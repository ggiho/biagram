import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export const createTRPCContext = async (opts: {
  headers: Headers;
}) => {
  const sessionId = opts.headers.get('authorization')?.replace('Bearer ', '');

  let session = null;
  let user = null;

  if (sessionId) {
    try {
      const authResult = await auth.validateSession(sessionId);
      session = authResult.session;
      user = authResult.user;
    } catch (error) {
      // Invalid session - continue as unauthenticated
    }
  }

  return {
    db,
    session,
    user,
    headers: opts.headers,
  };
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;

export const publicProcedure = t.procedure;

const enforceUserIsAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.session || !ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: {
      // infers the `session` as non-nullable
      session: { ...ctx.session },
      user: { ...ctx.user },
    },
  });
});

export const protectedProcedure = t.procedure.use(enforceUserIsAuthed);