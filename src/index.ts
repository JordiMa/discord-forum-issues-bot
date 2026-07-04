import { config } from './config/index.js';
import { loadAppConfig } from './config/app-config.js';
import { logger } from './logger.js';
import { prisma } from './db/client.js';
import { createDiscordClient } from './discord/client.js';
import { DiscordGateway } from './discord/gateway.js';
import { DiscordModule } from './discord/index.js';
import { IssueActionHandler } from './discord/interactions/issue-action-handler.js';
import { VoteService } from './discord/interactions/vote.service.js';
import { IssueCommandService } from './discord/interactions/issue-command.service.js';
import { IssueLifecycleService } from './discord/interactions/issue-lifecycle.service.js';
import { CommentMirrorService } from './comments/comment-mirror.service.js';
import { GitHubModule } from './github/index.js';
import { IssuesService } from './github/issues.service.js';
import { SyncService } from './sync/sync.service.js';
import { LinkedRefsService } from './sync/linked-refs.service.js';
import { createWebhookServer } from './webhooks/server.js';

async function bootstrap(): Promise<void> {
  logger.info({ env: config.nodeEnv }, 'Starting Discord <-> GitHub Issues bot');

  const appConfig = loadAppConfig();

  logger.info(
    {
      spacer: config.server.publicUrl
        ? `${config.server.publicUrl.replace(/\/$/, '')}/spacer.png`
        : 'disabled — set PUBLIC_URL for full-width embeds',
    },
    'Embed width spacer',
  );

  await prisma.$connect();

  const client = createDiscordClient();
  const gateway = new DiscordGateway(client);
  const github = new GitHubModule();
  const issues = new IssuesService(github);
  const sync = new SyncService(appConfig, issues, gateway);
  const actions = new IssueActionHandler(appConfig, issues);
  const comments = new CommentMirrorService(appConfig, issues, gateway);
  const linkedRefs = new LinkedRefsService(appConfig, issues, sync);
  const votes = new VoteService(gateway);
  const issueCommand = new IssueCommandService(appConfig, sync, gateway);
  const lifecycle = new IssueLifecycleService(appConfig, issues, sync, gateway);
  const discord = new DiscordModule(client, sync, comments, [
    actions,
    votes,
    issueCommand,
    lifecycle,
  ]);

  const server = createWebhookServer(github.getApp(), sync, comments, linkedRefs);
  server.listen(config.server.port, () => {
    logger.info(
      { port: config.server.port, path: config.server.webhookPath },
      'Webhook server listening',
    );
  });

  await discord.start();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down');
    await discord.stop();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((error) => {
  logger.error({ error }, 'Fatal error during bootstrap');
  process.exit(1);
});
