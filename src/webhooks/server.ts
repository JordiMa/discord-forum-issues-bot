import express, { type Express } from 'express';
import { createNodeMiddleware } from '@octokit/webhooks';
import type { App } from '@octokit/app';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import type { SyncService } from '../sync/sync.service.js';

export function createWebhookServer(app: App, sync: SyncService): Express {
  const server = express();

  app.webhooks.on('issues', async ({ payload }) => {
    const { issue, repository } = payload;
    try {
      await sync.onIssueChanged({
        owner: repository.owner.login,
        repo: repository.name,
        number: issue.number,
        title: issue.title,
        url: issue.html_url,
        state: issue.state ?? 'open',
        labels: (issue.labels ?? [])
          .map((label) => (typeof label === 'string' ? label : label?.name))
          .filter((name): name is string => Boolean(name)),
        assignees: (issue.assignees ?? [])
          .map((assignee) => assignee?.login)
          .filter((login): login is string => Boolean(login)),
        milestone: issue.milestone?.title ?? null,
      });
    } catch (error) {
      logger.error({ error, issue: issue.number }, 'Failed to sync issue event to Discord');
    }
  });

  app.webhooks.onError((error) => {
    logger.error({ error }, 'GitHub webhook processing error');
  });

  server.use(createNodeMiddleware(app.webhooks, { path: config.server.webhookPath }));

  server.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return server;
}
