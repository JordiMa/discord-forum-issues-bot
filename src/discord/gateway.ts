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

  public async editEmbed(
    thread: AnyThreadChannel,
    messageId: string,
    embed: EmbedBuilder,
    components: ActionRows,
  ): Promise<boolean> {
    try {
      const message = await thread.messages.fetch(messageId);
      await message.edit({ embeds: [embed], components });
      return true;
    } catch (error) {
      logger.error({ error, threadId: thread.id, messageId }, 'Failed to edit embed');
      return false;
    }
  }

  public async updateEmbedVotes(threadId: string, messageId: string, votes: number): Promise<void> {
    const thread = await this.fetchThread(threadId);
    if (!thread) {
      return;
    }
    const message = await thread.messages.fetch(messageId).catch(() => null);
    const existing = message?.embeds[0];
    if (!message || !existing) {
      return;
    }

    const embed = EmbedBuilder.from(existing);
    const fields = (embed.data.fields ?? []).map((field) =>
      field.name === 'Votes' ? { ...field, value: String(votes) } : field,
    );
    embed.setFields(fields);

    try {
      await message.edit({ embeds: [embed] });
    } catch (error) {
      logger.error({ error, threadId, messageId }, 'Failed to update vote count');
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
