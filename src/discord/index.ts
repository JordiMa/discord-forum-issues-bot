import { type AnyThreadChannel, Client, Events, type Interaction } from 'discord.js';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import type { SyncService } from '../sync/sync.service.js';
import type { IssueActionHandler } from './interactions/issue-action-handler.js';

export class DiscordModule {
  public constructor(
    private readonly client: Client,
    private readonly sync: SyncService,
    private readonly actions: IssueActionHandler,
  ) {}

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

    this.client.on(Events.InteractionCreate, (interaction) => {
      void this.handleInteraction(interaction);
    });
  }

  private async handleThreadCreate(thread: AnyThreadChannel): Promise<void> {
    try {
      await this.sync.onThreadCreated(thread);
    } catch (error) {
      logger.error({ error, threadId: thread.id }, 'Failed to process thread creation');
    }
  }

  private async handleInteraction(interaction: Interaction): Promise<void> {
    try {
      await this.actions.handle(interaction);
    } catch (error) {
      logger.error({ error }, 'Failed to handle interaction');
    }
  }
}
