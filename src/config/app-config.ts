import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';
import { config } from './index.js';

const repositoryConfigSchema = z.object({
  owner: z.string(),
  repo: z.string(),
});

const forumConfigSchema = z.object({
  channelId: z.string(),
  repository: z.string(),
  emoji: z.string().optional(),
  defaultLabels: z.array(z.string()).default([]),
  project: z.string().optional(),
});

const statusConfigSchema = z.object({
  label: z.string(),
  emoji: z.string().optional(),
  projectColumn: z.string().optional(),
});

const assigneeConfigSchema = z.object({
  name: z.string(),
  login: z.string(),
});

const moderationConfigSchema = z
  .object({
    roleId: z.string().optional(),
    assignees: z.array(assigneeConfigSchema).default([]),
    versions: z.array(z.string()).default([]),
  })
  .default({});

const commentsConfigSchema = z
  .object({
    discordToGithub: z.enum(['everyone', 'maintainers', 'disabled']).default('everyone'),
    githubToDiscord: z.enum(['all', 'disabled']).default('all'),
  })
  .default({});

const appConfigSchema = z.object({
  repositories: z.record(z.string(), repositoryConfigSchema),
  forums: z.record(z.string(), forumConfigSchema),
  workflow: z.object({
    statuses: z.record(z.string(), statusConfigSchema),
  }),
  moderation: moderationConfigSchema,
  comments: commentsConfigSchema,
});

export type AppConfig = z.infer<typeof appConfigSchema>;
export type RepositoryConfig = z.infer<typeof repositoryConfigSchema>;
export type ForumConfig = z.infer<typeof forumConfigSchema>;
export type StatusConfig = z.infer<typeof statusConfigSchema>;
export type ModerationConfig = z.infer<typeof moderationConfigSchema>;
export type AssigneeConfig = z.infer<typeof assigneeConfigSchema>;
export type CommentsConfig = z.infer<typeof commentsConfigSchema>;

export function loadAppConfig(path: string = config.configPath): AppConfig {
  const raw = readFileSync(path, 'utf8');
  return appConfigSchema.parse(parse(raw));
}
