import { Client, Events } from 'discord.js';
import { createDiscordClient } from './client.js';
import { config } from '../config/index.js';
import { logger } from '../logger.js';

export class DiscordModule {
  private readonly client: Client;

  public constructor() {
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

    this.client.on(Events.ThreadCreate, (thread) => {
      logger.info(
        { threadId: thread.id, name: thread.name },
        'Forum thread created — TODO: create the matching GitHub issue',
      );
    });
  }
}
