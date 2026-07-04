import express, { type Express } from 'express';
import { createNodeMiddleware } from '@octokit/webhooks';
import type { App } from '@octokit/app';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { normalizeComment, normalizeIssue } from '../github/issue-event.js';
import type { SyncService } from '../sync/sync.service.js';
import type { CommentMirrorService } from '../comments/comment-mirror.service.js';

export function createWebhookServer(
  app: App,
  sync: SyncService,
  comments: CommentMirrorService,
): Express {
  const server = express();

  app.webhooks.on('issues', async ({ payload }) => {
    try {
      await sync.onIssueChanged(
        normalizeIssue(payload.repository.owner.login, payload.repository.name, payload.issue),
      );
    } catch (error) {
      logger.error({ error, issue: payload.issue.number }, 'Failed to sync issue event to Discord');
    }
  });

  app.webhooks.on('issue_comment', async ({ payload }) => {
    if (payload.action !== 'created') {
      return;
    }
    try {
      await comments.onGitHubComment(
        normalizeComment(
          payload.repository.owner.login,
          payload.repository.name,
          payload.issue.number,
          payload.comment,
        ),
      );
    } catch (error) {
      logger.error({ error, issue: payload.issue.number }, 'Failed to mirror GitHub comment');
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
