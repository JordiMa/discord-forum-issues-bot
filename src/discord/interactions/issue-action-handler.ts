import {
  MessageFlags,
  type ButtonInteraction,
  type Interaction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { AppConfig } from '../../config/app-config.js';
import type { IssuesService } from '../../github/issues.service.js';
import { prisma } from '../../db/client.js';
import { logger } from '../../logger.js';
import { swapPrefixedLabel } from '../../sync/labels.js';
import { isModerator } from '../permissions.js';
import {
  buildManagePanelRows,
  ISSUE_ACTION,
  MANAGE_CUSTOM_ID,
  NONE_VALUE,
} from '../components/issue-actions.js';
import type { InteractionHandler } from './interaction-handler.js';

const DENIED = '⛔ Tu dois être modérateur pour faire ça.';
const UNAVAILABLE = '⛔ Action indisponible ici.';

export class IssueActionHandler implements InteractionHandler {
  public constructor(
    private readonly config: AppConfig,
    private readonly issues: IssuesService,
  ) {}

  public async handle(interaction: Interaction): Promise<void> {
    if (interaction.isButton() && interaction.customId === MANAGE_CUSTOM_ID) {
      await this.handleManage(interaction);
      return;
    }
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId.startsWith(`${ISSUE_ACTION.prefix}:`)
    ) {
      await this.handleSelect(interaction);
    }
  }

  private async handleManage(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: UNAVAILABLE, flags: MessageFlags.Ephemeral });
      return;
    }
    if (!isModerator(interaction.member, this.config.moderation)) {
      await interaction.reply({ content: DENIED, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({
      content: '⚙️ Actions de modération pour cette demande :',
      components: buildManagePanelRows(this.config),
      flags: MessageFlags.Ephemeral,
    });
  }

  private async handleSelect(interaction: StringSelectMenuInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: UNAVAILABLE, flags: MessageFlags.Ephemeral });
      return;
    }
    if (!isModerator(interaction.member, this.config.moderation)) {
      await interaction.reply({ content: DENIED, flags: MessageFlags.Ephemeral });
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
        content: "Ce fil n'est lié à aucune demande GitHub.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const repository = await prisma.repository.findUnique({ where: { id: link.repositoryId } });
    if (!repository) {
      await interaction.reply({
        content: 'Dépôt introuvable dans la configuration.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const action = interaction.customId.slice(`${ISSUE_ACTION.prefix}:`.length);
    try {
      const summary = await this.applyAction(
        action,
        value,
        repository.owner,
        repository.repo,
        link.issueNumber,
      );
      await interaction.editReply({ content: summary });
    } catch (error) {
      logger.error({ error, action, issue: link.issueNumber }, 'Failed to apply moderator action');
      await interaction.editReply({ content: "⚠️ Impossible d'appliquer le changement sur GitHub." });
    }
  }

  private async applyAction(
    action: string,
    value: string,
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<string> {
    const before = await this.issues.getIssueEvent(owner, repo, issueNumber);

    switch (action) {
      case 'type': {
        const labels =
          value === NONE_VALUE
            ? before.labels.filter((label) => !label.startsWith('type:'))
            : swapPrefixedLabel(before.labels, 'type:', value);
        await this.issues.setLabels(owner, repo, issueNumber, labels);
        return value === NONE_VALUE ? '✅ Type retiré' : `✅ Type → \`${value}\``;
      }
      case 'status': {
        const labels = swapPrefixedLabel(before.labels, 'status:', value);
        await this.issues.setLabels(owner, repo, issueNumber, labels);
        return `✅ Statut → \`${value}\``;
      }
      case 'priority': {
        const labels = swapPrefixedLabel(before.labels, 'priority:', value);
        await this.issues.setLabels(owner, repo, issueNumber, labels);
        return `✅ Priorité → \`${value}\``;
      }
      case 'assignee': {
        const assignees = value === NONE_VALUE ? [] : [value];
        await this.issues.setAssignees(owner, repo, issueNumber, assignees);
        return value === NONE_VALUE ? '✅ Assignation retirée' : `✅ Assigné à \`${value}\``;
      }
      case 'version': {
        const milestone = value === NONE_VALUE ? null : value;
        const applied = await this.issues.setMilestone(owner, repo, issueNumber, milestone);
        if (!applied) {
          return `⚠️ Le jalon « ${value} » n'existe pas sur GitHub. Crée-le d'abord.`;
        }
        return milestone ? `✅ Version → \`${milestone}\`` : '✅ Version retirée';
      }
      default:
        return 'Action inconnue.';
    }
  }
}
