import { EmbedBuilder } from 'discord.js';

export const VOTES_FIELD_NAME = 'Votes';

export function formatVotes(votes: number): string {
  return `👍 ${votes}`;
}

export interface IssueEmbedData {
  emoji: string;
  title: string;
  issueNumber: number;
  issueUrl: string;
  status: { emoji: string; name: string };
  color: number;
  assignees: string[];
  priority?: string;
  version?: string;
  votes: number;
  pullRequest?: { number: number; url: string; merged: boolean };
  release?: string;
  createdAt: Date;
}

export function buildIssueEmbed(data: IssueEmbedData): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(data.color)
    .setTitle(`${data.emoji} ${data.title}`)
    .setURL(data.issueUrl)
    .addFields(
      { name: 'Statut', value: `${data.status.emoji} ${data.status.name}`, inline: true },
      { name: VOTES_FIELD_NAME, value: formatVotes(data.votes), inline: true },
    );

  if (data.priority) {
    embed.addFields({ name: 'Priorité', value: data.priority, inline: true });
  }
  if (data.assignees.length > 0) {
    embed.addFields({ name: 'Assigné à', value: data.assignees.join(', '), inline: true });
  }
  if (data.version) {
    embed.addFields({ name: 'Version', value: data.version, inline: true });
  }
  if (data.pullRequest) {
    const suffix = data.pullRequest.merged ? ' · fusionné' : '';
    embed.addFields({
      name: 'Correctif',
      value: `[#${data.pullRequest.number}](${data.pullRequest.url})${suffix}`,
      inline: true,
    });
  }
  if (data.release) {
    embed.addFields({ name: 'Disponible dans', value: `✅ ${data.release}`, inline: true });
  }

  return embed.setFooter({ text: `#${data.issueNumber}` }).setTimestamp(data.createdAt);
}
