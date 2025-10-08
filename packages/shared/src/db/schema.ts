import { pgTable, text, timestamp, boolean, uuid, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { z } from 'zod';

// Users table
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  hashedPassword: text('hashed_password').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Sessions table for Lucia auth
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
});

// Diagrams table
export const diagrams = pgTable('diagrams', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  content: text('content').notNull(),
  isPublic: boolean('is_public').default(false).notNull(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Collaboration table for real-time editing
export const collaborations = pgTable('collaborations', {
  id: uuid('id').defaultRandom().primaryKey(),
  diagramId: uuid('diagram_id')
    .notNull()
    .references(() => diagrams.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  permission: text('permission', { enum: ['read', 'write', 'admin'] })
    .default('read')
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Activity log for tracking diagram changes
export const activityLogs = pgTable('activity_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  diagramId: uuid('diagram_id')
    .notNull()
    .references(() => diagrams.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  action: text('action').notNull(), // 'create', 'update', 'delete', 'share', etc.
  details: text('details'), // JSON string with action details
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Define relations
export const usersRelations = relations(users, ({ many }) => ({
  diagrams: many(diagrams),
  sessions: many(sessions),
  collaborations: many(collaborations),
  activityLogs: many(activityLogs),
}));

export const diagramsRelations = relations(diagrams, ({ one, many }) => ({
  user: one(users, {
    fields: [diagrams.userId],
    references: [users.id],
  }),
  collaborations: many(collaborations),
  activityLogs: many(activityLogs),
}));

export const collaborationsRelations = relations(collaborations, ({ one }) => ({
  diagram: one(diagrams, {
    fields: [collaborations.diagramId],
    references: [diagrams.id],
  }),
  user: one(users, {
    fields: [collaborations.userId],
    references: [users.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  diagram: one(diagrams, {
    fields: [activityLogs.diagramId],
    references: [diagrams.id],
  }),
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Diagram = typeof diagrams.$inferSelect;
export type NewDiagram = typeof diagrams.$inferInsert;

export type Collaboration = typeof collaborations.$inferSelect;
export type NewCollaboration = typeof collaborations.$inferInsert;

export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;

// Zod schemas for validation
export const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(8),
});

export const CreateDiagramSchema = z.object({
  name: z.string().min(1).max(100),
  content: z.string(),
  isPublic: z.boolean().default(false),
});

export const UpdateDiagramSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  content: z.string().optional(),
  isPublic: z.boolean().optional(),
});

export const CollaborationPermissionSchema = z.enum(['read', 'write', 'admin']);