import {
  MessageFlags,
  SlashCommandBuilder,
  type AnyThreadChannel,
  type ChatInputCommandInteraction,
  type Interaction,
} from 'discord.js';
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

export const LINK_ISSUE_COMMAND = new SlashCommandBuilder()
  .setName('link-issue')
  .setDescription('Lie ce fil à une issue GitHub existante (ou déplace une issue ici)')
  .addIntegerOption((option) =>
    option
      .setName('numero')
      .setDescription("Numéro de l'issue GitHub")
      .setRequired(true)
      .setMinValue(1),
  );

export class IssueCommandService implements InteractionHandler {
  public constructor(
    private readonly config: AppConfig,
    private readonly sync: SyncService,
    private readonly gateway: DiscordGateway,
  ) {}

  public async handle(interaction: Interaction): Promise<void> {
    if (!interaction.isChatInputCommand()) {
      return;
    }
    if (interaction.commandName === CREATE_ISSUE_COMMAND.name) {
      await this.run(interaction, (thread) => this.sync.ensureIssueForThread(thread));
      return;
    }
    if (interaction.commandName === LINK_ISSUE_COMMAND.name) {
      const issueNumber = interaction.options.getInteger('numero', true);
      await this.run(interaction, (thread) => this.sync.linkExistingIssue(thread, issueNumber));
    }
  }

  private async run(
    interaction: ChatInputCommandInteraction,
    action: (thread: AnyThreadChannel) => Promise<IssueCreationResult>,
  ): Promise<void> {
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

    const result = await action(thread);
    await interaction.editReply({ content: this.describe(result) });
  }

  private describe(result: IssueCreationResult): string {
    switch (result.outcome) {
      case IssueCreationOutcome.Created:
        return `✅ Demande **#${result.issueNumber}** créée — ${result.url}`;
      case IssueCreationOutcome.Linked:
        return `✅ Fil lié à l'issue **#${result.issueNumber}** — ${result.url}`;
      case IssueCreationOutcome.AlreadyLinked:
        return `Ce fil est déjà lié à l'issue #${result.issueNumber}.`;
      case IssueCreationOutcome.IssueNotFound:
        return `Issue #${result.issueNumber} introuvable sur GitHub.`;
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
