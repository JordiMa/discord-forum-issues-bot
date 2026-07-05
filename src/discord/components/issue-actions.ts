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
  type: 'issue-action:type',
  status: 'issue-action:status',
  priority: 'issue-action:priority',
  assignee: 'issue-action:assignee',
  version: 'issue-action:version',
} as const;

export const VOTE_CUSTOM_ID = 'issue-vote';
export const MANAGE_CUSTOM_ID = 'issue-manage';
export const MANAGE_APPLY_CUSTOM_ID = 'issue-manage-apply';
export const NONE_VALUE = '__none__';

type IssueActionRow = ActionRowBuilder<MessageActionRowComponentBuilder>;

interface SelectOption {
  label: string;
  value: string;
  emoji?: string;
}

interface SelectSpec {
  customId: string;
  placeholder: string;
  options: SelectOption[];
}

const PRIORITIES: SelectOption[] = [
  { label: 'Critique', value: 'priority:critical', emoji: '🔴' },
  { label: 'Élevée', value: 'priority:high', emoji: '🟠' },
  { label: 'Moyenne', value: 'priority:medium', emoji: '🟡' },
  { label: 'Faible', value: 'priority:low', emoji: '🟢' },
];

// Components on the public embed: a vote button (everyone) and a Manage button
// (opens a moderator-only ephemeral panel).
export function buildIssueActionRows(voteCount: number): IssueActionRow[] {
  const vote = new ButtonBuilder()
    .setCustomId(VOTE_CUSTOM_ID)
    .setLabel(voteCount > 0 ? `Moi aussi · ${voteCount}` : 'Moi aussi')
    .setEmoji('👍')
    .setStyle(ButtonStyle.Secondary);
  const manage = new ButtonBuilder()
    .setCustomId(MANAGE_CUSTOM_ID)
    .setLabel('Gérer')
    .setEmoji('⚙️')
    .setStyle(ButtonStyle.Secondary);
  return [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(vote, manage)];
}

export function issueActionKey(customId: string): string {
  return customId.slice(`${ISSUE_ACTION.prefix}:`.length);
}

// The moderator panel (ephemeral): the selects act as a form — the chosen
// values are kept as defaults and only applied when "Valider" is clicked.
// Up to 4 selects fit alongside the Valider button (Discord caps at 5 rows).
export function buildManagePanelRows(
  config: AppConfig,
  selections: Record<string, string> = {},
): IssueActionRow[] {
  const specs: SelectSpec[] = [];

  const types = Object.values(config.types);
  if (types.length > 0) {
    specs.push({
      customId: ISSUE_ACTION.type,
      placeholder: 'Type',
      options: [
        { label: 'Aucun', value: NONE_VALUE, emoji: '🚫' },
        ...types.map((type) => ({ label: type.name ?? type.label, value: type.label, emoji: type.emoji })),
      ],
    });
  }

  specs.push({
    customId: ISSUE_ACTION.status,
    placeholder: 'Statut',
    options: Object.values(config.workflow.statuses).map((status) => ({
      label: status.name ?? labelToStatusName(status.label),
      value: status.label,
      emoji: status.emoji,
    })),
  });
  specs.push({ customId: ISSUE_ACTION.priority, placeholder: 'Priorité', options: PRIORITIES });

  if (config.moderation.assignees.length > 0) {
    specs.push({
      customId: ISSUE_ACTION.assignee,
      placeholder: 'Assigné à',
      options: [
        { label: "Retirer l'assignation", value: NONE_VALUE, emoji: '🚫' },
        ...config.moderation.assignees.map((assignee) => ({
          label: assignee.name,
          value: assignee.login,
          emoji: '👤',
        })),
      ],
    });
  }
  if (config.moderation.versions.length > 0) {
    specs.push({
      customId: ISSUE_ACTION.version,
      placeholder: 'Version',
      options: [
        { label: 'Aucune version', value: NONE_VALUE, emoji: '🚫' },
        ...config.moderation.versions.map((version) => ({ label: version, value: version, emoji: '🔖' })),
      ],
    });
  }

  const rows: IssueActionRow[] = specs
    .slice(0, 4)
    .map((spec) => buildSelectRow(spec, selections[issueActionKey(spec.customId)]));

  const apply = new ButtonBuilder()
    .setCustomId(MANAGE_APPLY_CUSTOM_ID)
    .setLabel('Valider')
    .setEmoji('✅')
    .setStyle(ButtonStyle.Success);
  rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(apply));

  return rows;
}

function buildSelectRow(spec: SelectSpec, selectedValue?: string): IssueActionRow {
  const menu = new StringSelectMenuBuilder().setCustomId(spec.customId).setPlaceholder(spec.placeholder);
  menu.addOptions(
    spec.options.map((option) => {
      const builder = new StringSelectMenuOptionBuilder()
        .setLabel(option.label)
        .setValue(option.value);
      if (option.emoji) {
        builder.setEmoji(option.emoji);
      }
      if (selectedValue !== undefined && option.value === selectedValue) {
        builder.setDefault(true);
      }
      return builder;
    }),
  );
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu);
}
