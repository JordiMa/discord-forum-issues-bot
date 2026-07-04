import { type AnyThreadChannel, Client, Events } from 'discord.js';
import { createDiscordClient } from './client.js';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import type { SyncService } from '../sync/sync.service.js';

export class DiscordModule {
  private readonly client: Client;

  public constructor(private readonly sync: SyncService) {
    this.client = createDiscordClient();
  }

  public async start(): Promise<Client> {
    this.registerEventHandlers();
    await this.client.login(config.discord.token);
    return this.client;
  }

  public async stop(): Promise<void> {
    await this.client.destroy();
  }

  private registerEventHandlers(): void {
    this.client.once(Events.ClientReady, (readyClient) => {
      logger.info({ tag: readyClient.user.tag }, 'Discord client ready');
    });

    this.client.on(Events.ThreadCreate, (thread, newlyCreated) => {
      if (!newlyCreated) {
        return;
      }
      void this.handleThreadCreate(thread);
    });
  }

  private async handleThreadCreate(thread: AnyThreadChannel): Promise<void> {
    try {
      await this.sync.onThreadCreated(thread);
    } catch (error) {
      logger.error({ error, threadId: thread.id }, 'Failed to process thread creation');
    }
  }
}
