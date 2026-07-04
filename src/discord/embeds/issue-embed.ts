import { EmbedBuilder } from 'discord.js';

export function formatVotes(votes: number): string {
  const suffix = votes >= 2 ? ' concerné·es' : votes === 1 ? ' concerné·e' : '';
  return `👍 **${votes}**${suffix}`;
}

export interface IssueEmbedData {
  emoji: string;
  title: string;
  issueNumber: number;
  issueUrl: string;
  status: { emoji: string; name: string };
  color: number;
  type?: { emoji: string; name: string };
  assignees: string[];
  priority?: string;
  version?: string;
  votes: number;
  pullRequest?: { number: number; url: string; merged: boolean };
  release?: string;
  spacerUrl?: string;
  createdAt: Date;
}

export function buildIssueEmbed(data: IssueEmbedData): EmbedBuilder {
  const headline = `${data.status.emoji} **${data.status.name}** · ${formatVotes(data.votes)}`;
  const embed = new EmbedBuilder()
    .setColor(data.color)
    .setTitle(`${data.emoji} ${data.title}`)
    .setURL(data.issueUrl)
    .setDescription(headline);

  if (data.type) {
    embed.setAuthor({ name: `${data.type.emoji} ${data.type.name}` });
  }

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
  if (data.spacerUrl) {
    embed.setImage(data.spacerUrl);
  }

  return embed.setFooter({ text: `#${data.issueNumber}` }).setTimestamp(data.createdAt);
}
