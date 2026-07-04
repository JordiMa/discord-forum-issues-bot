import { EmbedBuilder } from 'discord.js';

export interface IssueEmbedData {
  emoji: string;
  title: string;
  issueNumber: number;
  issueUrl: string;
  status: { emoji: string; name: string };
  assignees: string[];
  labels: string[];
  priority?: string;
  version?: string;
  votes: number;
  createdAt: Date;
}

const STATUS_COLORS: Record<string, number> = {
  triage: 0xf1c40f,
  confirmed: 0x3498db,
  planned: 0x9b59b6,
  'in progress': 0xe67e22,
  review: 0x1abc9c,
  testing: 0xe91e63,
  done: 0x2ecc71,
  wontfix: 0x95a5a6,
  duplicate: 0x95a5a6,
};

const PLACEHOLDER = '—';
const DEFAULT_COLOR = 0x5865f2;

export function buildIssueEmbed(data: IssueEmbedData): EmbedBuilder {
  const assigned = data.assignees.length > 0 ? data.assignees.join(', ') : 'Nobody';
  const labels =
    data.labels.length > 0 ? data.labels.map((label) => `\`${label}\``).join(' ') : PLACEHOLDER;

  return new EmbedBuilder()
    .setColor(STATUS_COLORS[data.status.name.toLowerCase()] ?? DEFAULT_COLOR)
    .setTitle(`${data.emoji} ${data.title}`)
    .setURL(data.issueUrl)
    .addFields(
      { name: 'Status', value: `${data.status.emoji} ${data.status.name}`, inline: true },
      { name: 'Assigned', value: assigned, inline: true },
      { name: 'Priority', value: data.priority ?? PLACEHOLDER, inline: true },
      { name: 'Labels', value: labels, inline: false },
      { name: 'Version', value: data.version ?? PLACEHOLDER, inline: true },
      { name: 'Votes', value: String(data.votes), inline: true },
      { name: 'GitHub', value: `[#${data.issueNumber}](${data.issueUrl})`, inline: true },
    )
    .setFooter({ text: `#${data.issueNumber}` })
    .setTimestamp(data.createdAt);
}
