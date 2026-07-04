import express, { type Express } from 'express';
import { createNodeMiddleware } from '@octokit/webhooks';
import type { App } from '@octokit/app';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { normalizeComment, normalizeIssue } from '../github/issue-event.js';
import { normalizePullRequest, normalizeRelease } from '../github/pull-request.js';
import { SPACER_PNG } from './spacer.js';
import type { SyncService } from '../sync/sync.service.js';
import type { LinkedRefsService } from '../sync/linked-refs.service.js';
import type { CommentMirrorService } from '../comments/comment-mirror.service.js';

const RELEVANT_PR_ACTIONS = ['opened', 'edited', 'closed', 'reopened'];

export function createWebhookServer(
  app: App,
  sync: SyncService,
  comments: CommentMirrorService,
  linkedRefs: LinkedRefsService,
): Express {
  const server = express();

  app.webhooks.on('issues', async ({ payload }) => {
    if (payload.action === 'opened') {
      return;
    }
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

  app.webhooks.on('pull_request', async ({ payload }) => {
    if (!RELEVANT_PR_ACTIONS.includes(payload.action)) {
      return;
    }
    try {
      await linkedRefs.onPullRequest(
        normalizePullRequest(
          payload.repository.owner.login,
          payload.repository.name,
          payload.pull_request,
        ),
      );
    } catch (error) {
      logger.error({ error, pr: payload.pull_request.number }, 'Failed to link pull request');
    }
  });

  app.webhooks.on('release', async ({ payload }) => {
    if (payload.action !== 'published') {
      return;
    }
    try {
      await linkedRefs.onRelease(
        normalizeRelease(payload.repository.owner.login, payload.repository.name, payload.release),
      );
    } catch (error) {
      logger.error({ error, release: payload.release.tag_name }, 'Failed to process release');
    }
  });

  app.webhooks.onError((error) => {
    logger.error({ error }, 'GitHub webhook processing error');
  });

  server.use(createNodeMiddleware(app.webhooks, { path: config.server.webhookPath }));

  server.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  server.get('/spacer.png', (_req, res) => {
    res.type('image/png').set('Cache-Control', 'public, max-age=604800').send(SPACER_PNG);
  });

  return server;
}
