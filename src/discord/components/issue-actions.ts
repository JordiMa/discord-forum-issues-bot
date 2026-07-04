import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import type { AppConfig } from '../../config/app-config.js';
import { labelToStatusName } from '../../sync/status.js';

export const ISSUE_ACTION = {
  prefix: 'issue-action',
  status: 'issue-action:status',
  priority: 'issue-action:priority',
  assignee: 'issue-action:assignee',
  version: 'issue-action:version',
} as const;

export const VOTE_CUSTOM_ID = 'issue-vote';
export const MANAGE_CUSTOM_ID = 'issue-manage';
export const NONE_VALUE = '__none__';

type IssueActionRow = ActionRowBuilder<MessageActionRowComponentBuilder>;

interface SelectOption {
  label: string;
  value: string;
  emoji?: string;
}

const PRIORITIES: SelectOption[] = [
  { label: 'Critique', value: 'priority:critical', emoji: '🔴' },
  { label: 'Élevée', value: 'priority:high', emoji: '🟠' },
  { label: 'Moyenne', value: 'priority:medium', emoji: '🟡' },
  { label: 'Faible', value: 'priority:low', emoji: '🟢' },
];

// Components on the public embed: a vote button (everyone) and a Manage button
// (opens a moderator-only ephemeral panel). Everyone sees only these two.
export function buildIssueActionRows(): IssueActionRow[] {
  const vote = new ButtonBuilder()
    .setCustomId(VOTE_CUSTOM_ID)
    .setLabel('Moi aussi')
    .setEmoji('👍')
    .setStyle(ButtonStyle.Secondary);
  const manage = new ButtonBuilder()
    .setCustomId(MANAGE_CUSTOM_ID)
    .setLabel('Gérer')
    .setEmoji('⚙️')
    .setStyle(ButtonStyle.Secondary);
  return [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(vote, manage)];
}

// The moderator control panel, shown ephemerally behind the Manage button.
export function buildManagePanelRows(config: AppConfig): IssueActionRow[] {
  const rows: IssueActionRow[] = [];

  const statusOptions: SelectOption[] = Object.values(config.workflow.statuses).map((status) => ({
    label: labelToStatusName(status.label),
    value: status.label,
    emoji: status.emoji,
  }));
  rows.push(buildSelectRow(ISSUE_ACTION.status, 'Changer le statut', statusOptions));
  rows.push(buildSelectRow(ISSUE_ACTION.priority, 'Définir la priorité', PRIORITIES));

  if (config.moderation.assignees.length > 0) {
    const options: SelectOption[] = [
      { label: "Retirer l'assignation", value: NONE_VALUE, emoji: '🚫' },
      ...config.moderation.assignees.map((assignee) => ({
        label: assignee.name,
        value: assignee.login,
        emoji: '👤',
      })),
    ];
    rows.push(buildSelectRow(ISSUE_ACTION.assignee, 'Assigner', options));
  }

  if (config.moderation.versions.length > 0) {
    const options: SelectOption[] = [
      { label: 'Aucune version', value: NONE_VALUE, emoji: '🚫' },
      ...config.moderation.versions.map((version) => ({
        label: version,
        value: version,
        emoji: '🔖',
      })),
    ];
    rows.push(buildSelectRow(ISSUE_ACTION.version, 'Choisir la version', options));
  }

  return rows;
}

function buildSelectRow(customId: string, placeholder: string, options: SelectOption[]): IssueActionRow {
  const menu = new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder);
  menu.addOptions(
    options.map((option) => {
      const builder = new StringSelectMenuOptionBuilder()
        .setLabel(option.label)
        .setValue(option.value);
      if (option.emoji) {
        builder.setEmoji(option.emoji);
      }
      return builder;
    }),
  );
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu);
}
