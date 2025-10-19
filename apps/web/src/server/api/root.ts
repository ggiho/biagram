import { createTRPCRouter } from '@/server/api/trpc';

import { authRouter } from './routers/auth';
import { diagramRouter } from './routers/diagrams';
import { userRouter } from './routers/users';
import { specificationRouter } from './routers/specifications';

export const appRouter = createTRPCRouter({
  auth: authRouter,
  diagrams: diagramRouter,
  users: userRouter,
  specifications: specificationRouter,
});

export type AppRouter = typeof appRouter;