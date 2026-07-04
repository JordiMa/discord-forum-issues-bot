import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';
import { config } from './index.js';

const repositoryConfigSchema = z.object({
  owner: z.string(),
  repo: z.string(),
});

const forumConfigSchema = z.object({
  repository: z.string(),
  defaultLabels: z.array(z.string()).default([]),
  project: z.string().optional(),
});

const statusConfigSchema = z.object({
  label: z.string(),
  emoji: z.string().optional(),
  projectColumn: z.string().optional(),
});

const appConfigSchema = z.object({
  repositories: z.record(z.string(), repositoryConfigSchema),
  forums: z.record(z.string(), forumConfigSchema),
  workflow: z.object({
    statuses: z.record(z.string(), statusConfigSchema),
  }),
});

export type AppConfig = z.infer<typeof appConfigSchema>;
export type ForumConfig = z.infer<typeof forumConfigSchema>;
export type StatusConfig = z.infer<typeof statusConfigSchema>;

export function loadAppConfig(path: string = config.configPath): AppConfig {
  const raw = readFileSync(path, 'utf8');
  return appConfigSchema.parse(parse(raw));
}
