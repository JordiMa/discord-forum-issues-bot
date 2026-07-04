import {
  type ActionRowBuilder,
  type AnyThreadChannel,
  type Client,
  EmbedBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { logger } from '../logger.js';

type ActionRows = ActionRowBuilder<MessageActionRowComponentBuilder>[];

export class DiscordGateway {
  public constructor(private readonly client: Client) {}

  public async fetchThread(threadId: string): Promise<AnyThreadChannel | null> {
    const channel = await this.client.channels.fetch(threadId).catch(() => null);
    if (!channel || !channel.isThread()) {
      return null;
    }
    return channel;
  }

  public async sendEmbed(
    thread: AnyThreadChannel,
    embed: EmbedBuilder,
    components: ActionRows,
  ): Promise<string | null> {
    try {
      const message = await thread.send({ embeds: [embed], components });
      return message.id;
    } catch (error) {
      logger.error({ error, threadId: thread.id }, 'Failed to post embed');
      return null;
    }
  }

  public async repostEmbed(
    thread: AnyThreadChannel,
    oldMessageId: string | null,
    embed: EmbedBuilder,
    components: ActionRows,
  ): Promise<string | null> {
    let newMessageId: string;
    try {
      const message = await thread.send({ embeds: [embed], components });
      newMessageId = message.id;
    } catch (error) {
      logger.error({ error, threadId: thread.id }, 'Failed to repost embed');
      return null;
    }

    if (oldMessageId) {
      await thread.messages.delete(oldMessageId).catch(() => undefined);
    }
    return newMessageId;
  }

  public async updateComponents(
    threadId: string,
    messageId: string,
    components: ActionRows,
  ): Promise<void> {
    const thread = await this.fetchThread(threadId);
    if (!thread) {
      return;
    }
    const message = await thread.messages.fetch(messageId).catch(() => null);
    if (!message) {
      return;
    }
    try {
      await message.edit({ components });
    } catch (error) {
      logger.error({ error, threadId, messageId }, 'Failed to update the vote button');
    }
  }

  public async sendThreadMessage(threadId: string, content: string): Promise<void> {
    const thread = await this.fetchThread(threadId);
    if (!thread) {
      logger.warn({ threadId }, 'Cannot mirror comment: thread not found');
      return;
    }
    try {
      await thread.send({ content, allowedMentions: { parse: [] } });
    } catch (error) {
      logger.error({ error, threadId }, 'Failed to mirror comment into Discord');
    }
  }
}
