import { z } from 'zod';
import { DatabaseSchemaSchema, DatabaseTypeSchema } from './schema.js';

// Project settings
export const ThemeSettingsSchema = z.object({
  mode: z.enum(['light', 'dark', 'auto']),
  primary: z.string().optional(),
  background: z.string().optional(),
  surface: z.string().optional(),
});

export const LayoutSettingsSchema = z.object({
  algorithm: z.enum(['auto', 'manual', 'hierarchical', 'force', 'grid']),
  spacing: z.object({
    table: z.number().default(50),
    relationship: z.number().default(20),
  }),
  direction: z.enum(['horizontal', 'vertical']).default('horizontal'),
  grouping: z.boolean().default(true),
});

export const ExportSettingsSchema = z.object({
  format: z.enum(['png', 'svg', 'pdf', 'sql', 'dbml', 'json']),
  quality: z.number().min(0.1).max(1).default(1),
  scale: z.number().min(0.5).max(5).default(1),
  backgroundColor: z.string().default('#ffffff'),
  includeMetadata: z.boolean().default(true),
});

export const ProjectSettingsSchema = z.object({
  databaseType: DatabaseTypeSchema,
  theme: ThemeSettingsSchema,
  layout: LayoutSettingsSchema,
  export: ExportSettingsSchema,
});

export type ThemeSettings = z.infer<typeof ThemeSettingsSchema>;
export type LayoutSettings = z.infer<typeof LayoutSettingsSchema>;
export type ExportSettings = z.infer<typeof ExportSettingsSchema>;
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

// Project version
export const ProjectVersionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  version: z.number(),
  schema: DatabaseSchemaSchema,
  changelog: z.string().optional(),
  createdAt: z.date(),
  author: z.string().optional(),
});

export type ProjectVersion = z.infer<typeof ProjectVersionSchema>;

// Project definition
export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  schema: DatabaseSchemaSchema,
  settings: ProjectSettingsSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
  version: z.number().default(1),
  isPublic: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
});

export type Project = z.infer<typeof ProjectSchema>;

// Project metadata for listings
export const ProjectMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  tableCount: z.number(),
  relationshipCount: z.number(),
  version: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
  isPublic: z.boolean(),
  tags: z.array(z.string()),
});

export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>;