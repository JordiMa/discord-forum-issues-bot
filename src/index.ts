import { config } from './config/index.js';
import { loadAppConfig } from './config/app-config.js';
import { logger } from './logger.js';
import { prisma } from './db/client.js';
import { DiscordModule } from './discord/index.js';
import { GitHubModule } from './github/index.js';
import { IssuesService } from './github/issues.service.js';
import { SyncService } from './sync/sync.service.js';
import { createWebhookServer } from './webhooks/server.js';

async function bootstrap(): Promise<void> {
  logger.info({ env: config.nodeEnv }, 'Starting Discord <-> GitHub Issues bot');

  const appConfig = loadAppConfig();

  await prisma.$connect();

  const github = new GitHubModule();
  const issues = new IssuesService(github);
  const sync = new SyncService(appConfig, issues);
  const discord = new DiscordModule(sync);

  const server = createWebhookServer(github.getApp());
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
