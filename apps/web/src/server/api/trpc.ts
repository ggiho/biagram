import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

// Simple in-memory rate limiter (use Redis in production for multi-instance)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // 100 requests per minute

function getRateLimitKey(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
  return ip;
}

function checkRateLimit(key: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - entry.count };
}

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
  transformer: superjson,
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

// Rate limiting middleware
const enforceRateLimit = t.middleware(({ ctx, next }) => {
  const key = getRateLimitKey(ctx.headers);
  const { allowed, remaining } = checkRateLimit(key);

  if (!allowed) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Rate limit exceeded. Please try again later.',
    });
  }

  return next({ ctx: { ...ctx, rateLimitRemaining: remaining } });
});

export const rateLimitedProcedure = t.procedure.use(enforceRateLimit);

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