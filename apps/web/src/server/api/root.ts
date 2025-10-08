import { createTRPCRouter } from '@/server/api/trpc';

import { authRouter } from './routers/auth';
import { diagramRouter } from './routers/diagrams';
import { userRouter } from './routers/users';

export const appRouter = createTRPCRouter({
  auth: authRouter,
  diagrams: diagramRouter,
  users: userRouter,
});

export type AppRouter = typeof appRouter;