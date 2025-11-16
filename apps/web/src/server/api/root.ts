import { createTRPCRouter } from '@/server/api/trpc';

import { authRouter } from './routers/auth';
import { diagramRouter } from './routers/diagrams';
import { userRouter } from './routers/users';
import { specificationRouter } from './routers/specifications';
import { databaseRouter } from './routers/database';

export const appRouter = createTRPCRouter({
  auth: authRouter,
  diagrams: diagramRouter,
  users: userRouter,
  specifications: specificationRouter,
  database: databaseRouter,
});

export type AppRouter = typeof appRouter;