import {
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Interaction,
} from 'discord.js';
import type { IssueLink } from '@prisma/client';
import type { AppConfig } from '../../config/app-config.js';
import type { IssuesService } from '../../github/issues.service.js';
import type { SyncService } from '../../sync/sync.service.js';
import type { DiscordGateway } from '../gateway.js';
import { swapPrefixedLabel } from '../../sync/labels.js';
import { isModerator } from '../permissions.js';
import { prisma } from '../../db/client.js';
import { logger } from '../../logger.js';
import type { InteractionHandler } from './interaction-handler.js';

export const CLOSE_COMMAND = new SlashCommandBuilder()
  .setName('close')
  .setDescription("Ferme l'issue liée à ce fil")
  .addStringOption((option) =>
    option
      .setName('raison')
      .setDescription('Motif de fermeture (résolu par défaut)')
      .addChoices({ name: 'Résolu', value: 'completed' }, { name: 'Non retenu', value: 'not_planned' }),
  );

export const REOPEN_COMMAND = new SlashCommandBuilder()
  .setName('reopen')
  .setDescription("Rouvre l'issue liée à ce fil");

export const DUPLICATE_COMMAND = new SlashCommandBuilder()
  .setName('duplicate')
  .setDescription("Marque l'issue de ce fil comme doublon d'une autre")
  .addIntegerOption((option) =>
    option
      .setName('numero')
      .setDescription("Numéro de l'issue d'origine")
      .setRequired(true)
      .setMinValue(1),
  );

export const RENAME_COMMAND = new SlashCommandBuilder()
  .setName('rename')
  .setDescription("Renomme l'issue et le fil")
  .addStringOption((option) =>
    option
      .setName('titre')
      .setDescription('Nouveau titre')
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(200),
  );

export const UNLINK_COMMAND = new SlashCommandBuilder()
  .setName('unlink')
  .setDescription("Retire le lien fil↔issue (ne supprime pas l'issue sur GitHub)");

export const LIFECYCLE_COMMANDS = [
  CLOSE_COMMAND,
  REOPEN_COMMAND,
  DUPLICATE_COMMAND,
  RENAME_COMMAND,
  UNLINK_COMMAND,
];

interface LinkContext {
  link: IssueLink;
  owner: string;
  repo: string;
}

export class IssueLifecycleService implements InteractionHandler {
  public constructor(
    private readonly config: AppConfig,
    private readonly issues: IssuesService,
    private readonly sync: SyncService,
    private readonly gateway: DiscordGateway,
  ) {}

  public async handle(interaction: Interaction): Promise<void> {
    if (!interaction.isChatInputCommand()) {
      return;
    }
    const name = interaction.commandName;
    if (name === CLOSE_COMMAND.name) {
      await this.execute(interaction, (i) => this.close(i));
    } else if (name === REOPEN_COMMAND.name) {
      await this.execute(interaction, (i) => this.reopen(i));
    } else if (name === DUPLICATE_COMMAND.name) {
      await this.execute(interaction, (i) => this.duplicate(i));
    } else if (name === RENAME_COMMAND.name) {
      await this.execute(interaction, (i) => this.rename(i));
    } else if (name === UNLINK_COMMAND.name) {
      await this.execute(interaction, (i) => this.unlink(i));
    }
  }

  private async execute(
    interaction: ChatInputCommandInteraction,
    action: (interaction: ChatInputCommandInteraction) => Promise<void>,
  ): Promise<void> {
    try {
      await action(interaction);
    } catch (error) {
      logger.error({ error, command: interaction.commandName }, 'Lifecycle command failed');
      if (interaction.deferred) {
        await interaction
          .editReply({ content: "⚠️ Échec de l'opération sur GitHub." })
          .catch(() => undefined);
      }
    }
  }

  private async close(interaction: ChatInputCommandInteraction): Promise<void> {
    const context = await this.resolve(interaction);
    if (!context) {
      return;
    }
    const reason: 'completed' | 'not_planned' =
      interaction.options.getString('raison') === 'not_planned' ? 'not_planned' : 'completed';
    const statusKey = reason === 'not_planned' ? 'wontfix' : 'done';
    const labels = await this.swapStatus(context, statusKey);
    await this.issues.closeIssue(context.owner, context.repo, context.link.issueNumber, reason, labels);
    await this.sync.refreshIssue(context.owner, context.repo, context.link.issueNumber);
    await interaction.editReply({
      content: reason === 'not_planned' ? '✅ Issue fermée (non retenu).' : '✅ Issue fermée (résolu).',
    });
  }

  private async reopen(interaction: ChatInputCommandInteraction): Promise<void> {
    const context = await this.resolve(interaction);
    if (!context) {
      return;
    }
    await this.issues.reopenIssue(context.owner, context.repo, context.link.issueNumber);
    await this.sync.refreshIssue(context.owner, context.repo, context.link.issueNumber);
    await interaction.editReply({ content: '✅ Issue rouverte.' });
  }

  private async duplicate(interaction: ChatInputCommandInteraction): Promise<void> {
    const context = await this.resolve(interaction);
    if (!context) {
      return;
    }
    const target = interaction.options.getInteger('numero', true);
    const labels = await this.swapStatus(context, 'duplicate');
    await this.issues.createComment(
      context.owner,
      context.repo,
      context.link.issueNumber,
      `Duplicate of #${target}`,
    );
    await this.issues.closeIssue(context.owner, context.repo, context.link.issueNumber, 'not_planned', labels);
    await this.sync.refreshIssue(context.owner, context.repo, context.link.issueNumber);
    await interaction.editReply({ content: `✅ Marquée comme doublon de #${target} et fermée.` });
  }

  private async rename(interaction: ChatInputCommandInteraction): Promise<void> {
    const context = await this.resolve(interaction);
    if (!context) {
      return;
    }
    const title = interaction.options.getString('titre', true);
    await this.issues.renameIssue(context.owner, context.repo, context.link.issueNumber, title);
    const thread = await this.gateway.fetchThread(context.link.threadId);
    if (thread) {
      await thread.setName(title).catch(() => undefined);
    }
    await this.sync.refreshIssue(context.owner, context.repo, context.link.issueNumber);
    await interaction.editReply({ content: `✅ Renommé en « ${title} ».` });
  }

  private async unlink(interaction: ChatInputCommandInteraction): Promise<void> {
    const context = await this.resolve(interaction);
    if (!context) {
      return;
    }
    await this.gateway.deleteMessage(context.link.threadId, context.link.embedMessageId);
    await prisma.issueLink.delete({ where: { id: context.link.id } });
    await interaction.editReply({
      content: `✅ Lien retiré (l'issue #${context.link.issueNumber} reste sur GitHub).`,
    });
  }

  private async swapStatus(context: LinkContext, statusKey: string): Promise<string[] | undefined> {
    const statusLabel = this.config.workflow.statuses[statusKey]?.label;
    if (!statusLabel) {
      return undefined;
    }
    const before = await this.issues.getIssueEvent(context.owner, context.repo, context.link.issueNumber);
    return swapPrefixedLabel(before.labels, 'status:', statusLabel);
  }

  private async resolve(interaction: ChatInputCommandInteraction): Promise<LinkContext | null> {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: '⛔ Commande indisponible ici.',
        flags: MessageFlags.Ephemeral,
      });
      return null;
    }
    if (!isModerator(interaction.member, this.config.moderation)) {
      await interaction.reply({
        content: '⛔ Tu dois être modérateur pour faire ça.',
        flags: MessageFlags.Ephemeral,
      });
      return null;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const link = await prisma.issueLink.findUnique({ where: { threadId: interaction.channelId } });
    if (!link) {
      await interaction.editReply({ content: "Ce fil n'est lié à aucune issue." });
      return null;
    }
    const repository = await prisma.repository.findUnique({ where: { id: link.repositoryId } });
    if (!repository) {
      await interaction.editReply({ content: 'Dépôt introuvable dans la configuration.' });
      return null;
    }
    return { link, owner: repository.owner, repo: repository.repo };
  }
}
