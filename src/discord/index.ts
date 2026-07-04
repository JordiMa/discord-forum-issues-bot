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
import type { InteractionHandler } from './interactions/interaction-handler.js';
import { TOP_BUGS_COMMAND } from './interactions/vote.service.js';
import { CREATE_ISSUE_COMMAND, LINK_ISSUE_COMMAND } from './interactions/issue-command.service.js';
import { LIFECYCLE_COMMANDS } from './interactions/issue-lifecycle.service.js';

export class DiscordModule {
  public constructor(
    private readonly client: Client,
    private readonly sync: SyncService,
    private readonly comments: CommentMirrorService,
    private readonly interactionHandlers: InteractionHandler[],
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
      const commands = [
        TOP_BUGS_COMMAND.toJSON(),
        CREATE_ISSUE_COMMAND.toJSON(),
        LINK_ISSUE_COMMAND.toJSON(),
        ...LIFECYCLE_COMMANDS.map((command) => command.toJSON()),
      ];
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
    for (const handler of this.interactionHandlers) {
      try {
        await handler.handle(interaction);
      } catch (error) {
        logger.error({ error }, 'Failed to handle interaction');
      }
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
