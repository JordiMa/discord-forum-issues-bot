import {
  MessageFlags,
  PermissionFlagsBits,
  type Interaction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { AppConfig } from '../../config/app-config.js';
import type { IssuesService } from '../../github/issues.service.js';
import type { SyncService } from '../../sync/sync.service.js';
import { prisma } from '../../db/client.js';
import { logger } from '../../logger.js';
import { swapPrefixedLabel } from '../../sync/labels.js';
import { ISSUE_ACTION, NONE_VALUE } from '../components/issue-actions.js';

export class IssueActionHandler {
  public constructor(
    private readonly config: AppConfig,
    private readonly issues: IssuesService,
    private readonly sync: SyncService,
  ) {}

  public async handle(interaction: Interaction): Promise<void> {
    if (!interaction.isStringSelectMenu()) {
      return;
    }
    if (!interaction.customId.startsWith(`${ISSUE_ACTION.prefix}:`)) {
      return;
    }
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: '⛔ This action is unavailable here.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!this.isModerator(interaction)) {
      await interaction.reply({
        content: '⛔ You need moderator permission to do that.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const value = interaction.values[0];
    if (!value) {
      await interaction.deferUpdate();
      return;
    }

    const link = await prisma.issueLink.findUnique({
      where: { threadId: interaction.channelId },
    });
    if (!link) {
      await interaction.reply({
        content: 'This thread is not linked to a GitHub issue.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const repository = await prisma.repository.findUnique({ where: { id: link.repositoryId } });
    if (!repository) {
      await interaction.reply({
        content: 'Repository mapping not found.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferUpdate();

    const action = interaction.customId.slice(`${ISSUE_ACTION.prefix}:`.length);
    try {
      await this.applyAction({
        action,
        value,
        owner: repository.owner,
        repo: repository.repo,
        issueNumber: link.issueNumber,
        interaction,
      });
    } catch (error) {
      logger.error({ error, action, issue: link.issueNumber }, 'Failed to apply moderator action');
      await interaction.followUp({
        content: '⚠️ Could not apply the change on GitHub.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  private async applyAction(input: {
    action: string;
    value: string;
    owner: string;
    repo: string;
    issueNumber: number;
    interaction: StringSelectMenuInteraction<'cached'>;
  }): Promise<void> {
    const { action, value, owner, repo, issueNumber, interaction } = input;
    const before = await this.issues.getIssueEvent(owner, repo, issueNumber);

    switch (action) {
      case 'status': {
        const labels = swapPrefixedLabel(before.labels, 'status:', value);
        await this.issues.setLabels(owner, repo, issueNumber, labels);
        await this.sync.onIssueChanged({ ...before, labels });
        return;
      }
      case 'priority': {
        const labels = swapPrefixedLabel(before.labels, 'priority:', value);
        await this.issues.setLabels(owner, repo, issueNumber, labels);
        await this.sync.onIssueChanged({ ...before, labels });
        return;
      }
      case 'assignee': {
        const assignees = value === NONE_VALUE ? [] : [value];
        await this.issues.setAssignees(owner, repo, issueNumber, assignees);
        await this.sync.onIssueChanged({ ...before, assignees });
        return;
      }
      case 'version': {
        const milestone = value === NONE_VALUE ? null : value;
        const applied = await this.issues.setMilestone(owner, repo, issueNumber, milestone);
        if (!applied) {
          await interaction.followUp({
            content: `⚠️ Milestone "${value}" was not found on GitHub. Create it first.`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        await this.sync.onIssueChanged({ ...before, milestone });
        return;
      }
      default:
        return;
    }
  }

  private isModerator(interaction: StringSelectMenuInteraction<'cached'>): boolean {
    const roleId = this.config.moderation.roleId;
    if (roleId) {
      return interaction.member.roles.cache.has(roleId);
    }
    return interaction.member.permissions.has(PermissionFlagsBits.ManageThreads);
  }
}
