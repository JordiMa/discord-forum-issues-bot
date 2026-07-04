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
  .setDescription('Create the GitHub issue for this forum thread (if it has none yet)');

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
        content: '⛔ This command is unavailable here.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!isModerator(interaction.member, this.config.moderation)) {
      await interaction.reply({
        content: '⛔ You need moderator permission to do that.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const thread = await this.gateway.fetchThread(interaction.channelId);
    if (!thread) {
      await interaction.editReply({ content: 'Run this command inside a forum thread.' });
      return;
    }

    const result = await this.sync.ensureIssueForThread(thread);
    await interaction.editReply({ content: this.describe(result) });
  }

  private describe(result: IssueCreationResult): string {
    switch (result.outcome) {
      case IssueCreationOutcome.Created:
        return `✅ Created issue **#${result.issueNumber}** — ${result.url}`;
      case IssueCreationOutcome.AlreadyLinked:
        return `This thread is already linked to issue #${result.issueNumber}.`;
      case IssueCreationOutcome.ForumNotMapped:
        return 'This forum is not mapped to a repository in the config.';
      case IssueCreationOutcome.RepositoryUnknown:
        return 'The mapped repository is unknown — check the config.';
      case IssueCreationOutcome.NotAForum:
        return 'This only works inside a forum thread.';
      default:
        return 'Nothing to do.';
    }
  }
}
