import express, { type Express } from 'express';
import { createNodeMiddleware } from '@octokit/webhooks';
import type { App } from '@octokit/app';
import { config } from '../config/index.js';
import { logger } from '../logger.js';

export function createWebhookServer(app: App): Express {
  const server = express();

  app.webhooks.on('issues', async ({ payload }) => {
    logger.info(
      { action: payload.action, issue: payload.issue.number },
      'GitHub issue event — TODO: reflect state in Discord',
    );
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
