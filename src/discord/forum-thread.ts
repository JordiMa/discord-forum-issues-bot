import { ChannelType, type AnyThreadChannel, type Message } from 'discord.js';
import { delay } from '../util/delay.js';

export function isForumThread(thread: AnyThreadChannel): boolean {
  return thread.parent?.type === ChannelType.GuildForum;
}

export function buildThreadUrl(thread: AnyThreadChannel): string {
  return `https://discord.com/channels/${thread.guildId}/${thread.id}`;
}

export function resolveAppliedTagNames(thread: AnyThreadChannel): string[] {
  const parent = thread.parent;
  if (!parent || parent.type !== ChannelType.GuildForum) {
    return [];
  }

  const namesById = new Map(parent.availableTags.map((tag) => [tag.id, tag.name]));
  return thread.appliedTags
    .map((tagId) => namesById.get(tagId))
    .filter((name): name is string => name !== undefined);
}

export async function fetchStarterMessageWithRetry(
  thread: AnyThreadChannel,
  attempts = 3,
  delayMs = 1000,
): Promise<Message | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const message = await thread.fetchStarterMessage().catch(() => null);
    if (message) {
      return message;
    }
    if (attempt < attempts - 1) {
      await delay(delayMs);
    }
  }
  return null;
}
