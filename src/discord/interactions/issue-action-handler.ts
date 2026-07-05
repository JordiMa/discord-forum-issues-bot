import {
  ComponentType,
  MessageFlags,
  type ButtonInteraction,
  type Interaction,
  type Message,
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
  MANAGE_APPLY_CUSTOM_ID,
  MANAGE_CUSTOM_ID,
  NONE_VALUE,
  issueActionKey,
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
      await this.openPanel(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId === MANAGE_APPLY_CUSTOM_ID) {
      await this.apply(interaction);
      return;
    }
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId.startsWith(`${ISSUE_ACTION.prefix}:`)
    ) {
      await this.select(interaction);
    }
  }

  private async openPanel(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: UNAVAILABLE, flags: MessageFlags.Ephemeral });
      return;
    }
    if (!isModerator(interaction.member, this.config.moderation)) {
      await interaction.reply({ content: DENIED, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({
      content: '⚙️ Sélectionne les champs à changer, puis clique sur **Valider**.',
      components: buildManagePanelRows(this.config),
      flags: MessageFlags.Ephemeral,
    });
  }

  private async select(interaction: StringSelectMenuInteraction): Promise<void> {
    if (!interaction.inCachedGuild() || !isModerator(interaction.member, this.config.moderation)) {
      await interaction.reply({ content: DENIED, flags: MessageFlags.Ephemeral });
      return;
    }
    const value = interaction.values[0];
    if (!value) {
      await interaction.deferUpdate();
      return;
    }
    const selections = this.readSelections(interaction.message);
    selections[issueActionKey(interaction.customId)] = value;
    await interaction.update({ components: buildManagePanelRows(this.config, selections) });
  }

  private async apply(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.inCachedGuild() || !isModerator(interaction.member, this.config.moderation)) {
      await interaction.reply({ content: DENIED, flags: MessageFlags.Ephemeral });
      return;
    }
    const selections = this.readSelections(interaction.message);
    await interaction.deferUpdate();

    if (Object.keys(selections).length === 0) {
      await interaction.followUp({
        content: 'Sélectionne au moins un champ.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const link = await prisma.issueLink.findUnique({ where: { threadId: interaction.channelId } });
    if (!link) {
      await interaction.followUp({
        content: "Ce fil n'est lié à aucune issue.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const repository = await prisma.repository.findUnique({ where: { id: link.repositoryId } });
    if (!repository) {
      await interaction.followUp({
        content: 'Dépôt introuvable dans la configuration.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      const summary = await this.applyBatch(
        repository.owner,
        repository.repo,
        link.issueNumber,
        selections,
      );
      await interaction.deleteReply();
      await interaction.followUp({ content: summary, flags: MessageFlags.Ephemeral });
    } catch (error) {
      logger.error({ error, issue: link.issueNumber }, 'Failed to apply moderator changes');
      await interaction.followUp({
        content: "⚠️ Échec de l'application sur GitHub.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  private async applyBatch(
    owner: string,
    repo: string,
    issueNumber: number,
    selections: Record<string, string>,
  ): Promise<string> {
    const before = await this.issues.getIssueEvent(owner, repo, issueNumber);
    let labels = before.labels;
    let labelsChanged = false;
    const applied: string[] = [];

    if (selections.type) {
      labels =
        selections.type === NONE_VALUE
          ? labels.filter((label) => !label.startsWith('type:'))
          : swapPrefixedLabel(labels, 'type:', selections.type);
      labelsChanged = true;
      applied.push('type');
    }
    if (selections.status) {
      labels = swapPrefixedLabel(labels, 'status:', selections.status);
      labelsChanged = true;
      applied.push('statut');
    }
    if (selections.priority) {
      labels = swapPrefixedLabel(labels, 'priority:', selections.priority);
      labelsChanged = true;
      applied.push('priorité');
    }

    const fields: { labels?: string[]; assignees?: string[] } = {};
    if (labelsChanged) {
      fields.labels = labels;
    }
    if (selections.assignee) {
      fields.assignees = selections.assignee === NONE_VALUE ? [] : [selections.assignee];
      applied.push('assigné');
    }
    if (fields.labels || fields.assignees) {
      await this.issues.updateIssue(owner, repo, issueNumber, fields);
    }

    if (selections.version) {
      const applied2 = await this.issues.setMilestone(
        owner,
        repo,
        issueNumber,
        selections.version === NONE_VALUE ? null : selections.version,
      );
      if (!applied2) {
        return `⚠️ Champs appliqués, mais le jalon « ${selections.version} » est introuvable sur GitHub.`;
      }
      applied.push('version');
    }

    return applied.length > 0 ? `✅ Mis à jour : ${applied.join(', ')}.` : 'Rien à appliquer.';
  }

  private readSelections(message: Message): Record<string, string> {
    const selections: Record<string, string> = {};
    for (const row of message.components) {
      if (row.type !== ComponentType.ActionRow) {
        continue;
      }
      for (const component of row.components) {
        if (component.type !== ComponentType.StringSelect) {
          continue;
        }
        const chosen = component.options.find((option) => option.default)?.value;
        if (chosen) {
          selections[issueActionKey(component.customId)] = chosen;
        }
      }
    }
    return selections;
  }
}
