import {
  type AnyThreadChannel,
  type Client,
  Events,
  type Interaction,
  type Message,
} from 'discord.js';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import type { SyncService } from '../sync/sync.service.js';
import type { CommentMirrorService } from '../comments/comment-mirror.service.js';
import type { IssueActionHandler } from './interactions/issue-action-handler.js';
import { TOP_BUGS_COMMAND, type VoteService } from './interactions/vote.service.js';

export class DiscordModule {
  public constructor(
    private readonly client: Client,
    private readonly sync: SyncService,
    private readonly actions: IssueActionHandler,
    private readonly comments: CommentMirrorService,
    private readonly votes: VoteService,
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
      void this.registerCommands(readyClient);
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

    this.client.on(Events.MessageCreate, (message) => {
      void this.handleMessageCreate(message);
    });
  }

  private async registerCommands(readyClient: Client<true>): Promise<void> {
    try {
      const commands = [TOP_BUGS_COMMAND.toJSON()];
      if (config.discord.guildId) {
        await readyClient.application.commands.set(commands, config.discord.guildId);
      } else {
        await readyClient.application.commands.set(commands);
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to register slash commands');
    }
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
      await this.votes.handle(interaction);
    } catch (error) {
      logger.error({ error }, 'Failed to handle interaction');
    }
  }

  private async handleMessageCreate(message: Message): Promise<void> {
    try {
      await this.comments.onDiscordMessage(message);
    } catch (error) {
      logger.error({ error, messageId: message.id }, 'Failed to mirror Discord message');
    }
  }
}
