import { MessageFlags, SlashCommandBuilder, type Interaction } from 'discord.js';
import type { AppConfig } from '../../config/app-config.js';
import type { DiscordGateway } from '../gateway.js';
import {
  IssueCreationOutcome,
  type IssueCreationResult,
  type SyncService,
} from '../../sync/sync.service.js';
import { isModerator } from '../permissions.js';
import type { InteractionHandler } from './interaction-handler.js';

export const CREATE_ISSUE_COMMAND = new SlashCommandBuilder()
  .setName('create-issue')
  .setDescription("Crée la demande GitHub pour ce fil (s'il n'en a pas encore)");

export class IssueCommandService implements InteractionHandler {
  public constructor(
    private readonly config: AppConfig,
    private readonly sync: SyncService,
    private readonly gateway: DiscordGateway,
  ) {}

  public async handle(interaction: Interaction): Promise<void> {
    if (
      !interaction.isChatInputCommand() ||
      interaction.commandName !== CREATE_ISSUE_COMMAND.name
    ) {
      return;
    }
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: '⛔ Commande indisponible ici.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!isModerator(interaction.member, this.config.moderation)) {
      await interaction.reply({
        content: '⛔ Tu dois être modérateur pour faire ça.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const thread = await this.gateway.fetchThread(interaction.channelId);
    if (!thread) {
      await interaction.editReply({ content: 'Lance cette commande dans un fil de forum.' });
      return;
    }

    const result = await this.sync.ensureIssueForThread(thread);
    await interaction.editReply({ content: this.describe(result) });
  }

  private describe(result: IssueCreationResult): string {
    switch (result.outcome) {
      case IssueCreationOutcome.Created:
        return `✅ Demande **#${result.issueNumber}** créée — ${result.url}`;
      case IssueCreationOutcome.AlreadyLinked:
        return `Ce fil est déjà lié à la demande #${result.issueNumber}.`;
      case IssueCreationOutcome.ForumNotMapped:
        return "Ce forum n'est associé à aucun dépôt dans la configuration.";
      case IssueCreationOutcome.RepositoryUnknown:
        return 'Le dépôt associé est introuvable — vérifie la configuration.';
      case IssueCreationOutcome.NotAForum:
        return 'Ça ne marche que dans un fil de forum.';
      default:
        return 'Rien à faire.';
    }
  }
}
