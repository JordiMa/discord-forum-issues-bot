import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
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

export const NONE_VALUE = '__none__';

interface SelectOption {
  label: string;
  value: string;
  emoji?: string;
}

const PRIORITIES: SelectOption[] = [
  { label: 'Critical', value: 'priority:critical', emoji: '🔴' },
  { label: 'High', value: 'priority:high', emoji: '🟠' },
  { label: 'Medium', value: 'priority:medium', emoji: '🟡' },
  { label: 'Low', value: 'priority:low', emoji: '🟢' },
];

export function buildIssueActionRows(
  config: AppConfig,
): ActionRowBuilder<StringSelectMenuBuilder>[] {
  const rows: ActionRowBuilder<StringSelectMenuBuilder>[] = [];

  const statusOptions: SelectOption[] = Object.values(config.workflow.statuses).map((status) => ({
    label: labelToStatusName(status.label),
    value: status.label,
    emoji: status.emoji,
  }));
  rows.push(buildSelectRow(ISSUE_ACTION.status, 'Set status', statusOptions));
  rows.push(buildSelectRow(ISSUE_ACTION.priority, 'Set priority', PRIORITIES));

  if (config.moderation.assignees.length > 0) {
    const options: SelectOption[] = [
      { label: 'Unassign', value: NONE_VALUE, emoji: '🚫' },
      ...config.moderation.assignees.map((assignee) => ({
        label: assignee.name,
        value: assignee.login,
        emoji: '👤',
      })),
    ];
    rows.push(buildSelectRow(ISSUE_ACTION.assignee, 'Assign', options));
  }

  if (config.moderation.versions.length > 0) {
    const options: SelectOption[] = [
      { label: 'No version', value: NONE_VALUE, emoji: '🚫' },
      ...config.moderation.versions.map((version) => ({
        label: version,
        value: version,
        emoji: '🔖',
      })),
    ];
    rows.push(buildSelectRow(ISSUE_ACTION.version, 'Set version', options));
  }

  return rows;
}

function buildSelectRow(
  customId: string,
  placeholder: string,
  options: SelectOption[],
): ActionRowBuilder<StringSelectMenuBuilder> {
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
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}
