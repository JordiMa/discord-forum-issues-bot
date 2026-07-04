import { type AnyThreadChannel, type Client, type EmbedBuilder } from 'discord.js';
import { logger } from '../logger.js';

export class DiscordGateway {
  public constructor(private readonly client: Client) {}

  public async fetchThread(threadId: string): Promise<AnyThreadChannel | null> {
    const channel = await this.client.channels.fetch(threadId).catch(() => null);
    if (!channel || !channel.isThread()) {
      return null;
    }
    return channel;
  }

  public async sendEmbed(thread: AnyThreadChannel, embed: EmbedBuilder): Promise<string | null> {
    try {
      const message = await thread.send({ embeds: [embed] });
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
  ): Promise<boolean> {
    try {
      const message = await thread.messages.fetch(messageId);
      await message.edit({ embeds: [embed] });
      return true;
    } catch (error) {
      logger.error({ error, threadId: thread.id, messageId }, 'Failed to edit embed');
      return false;
    }
  }
}
