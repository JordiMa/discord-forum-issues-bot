import {
  MessageFlags,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
} from 'discord.js';
import type { DiscordGateway } from '../gateway.js';
import { toggleVote } from '../../db/vote.js';
import { VOTE_CUSTOM_ID } from '../components/issue-actions.js';
import { prisma } from '../../db/client.js';

const DEFAULT_LEADERBOARD_LIMIT = 10;

export const TOP_BUGS_COMMAND = new SlashCommandBuilder()
  .setName('topbugs')
  .setDescription('List the most-voted issues')
  .addIntegerOption((option) =>
    option
      .setName('limit')
      .setDescription('How many to show (default 10)')
      .setMinValue(1)
      .setMaxValue(25),
  );

export class VoteService {
  public constructor(private readonly gateway: DiscordGateway) {}

  public async handle(interaction: Interaction): Promise<void> {
    if (interaction.isButton() && interaction.customId === VOTE_CUSTOM_ID) {
      await this.handleVote(interaction);
      return;
    }
    if (interaction.isChatInputCommand() && interaction.commandName === TOP_BUGS_COMMAND.name) {
      await this.handleLeaderboard(interaction);
    }
  }

  private async handleVote(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const link = await prisma.issueLink.findUnique({ where: { threadId: interaction.channelId } });
    if (!link) {
      await interaction.editReply({ content: 'This thread is not linked to an issue.' });
      return;
    }

    const result = await toggleVote(link.id, interaction.user.id);
    if (link.embedMessageId) {
      await this.gateway.updateEmbedVotes(link.threadId, link.embedMessageId, result.count);
    }

    await interaction.editReply({
      content: result.added
        ? `👍 Marked as affected — **${result.count}** affected user(s).`
        : `Removed your vote — **${result.count}** affected user(s).`,
    });
  }

  private async handleLeaderboard(interaction: ChatInputCommandInteraction): Promise<void> {
    const limit = interaction.options.getInteger('limit') ?? DEFAULT_LEADERBOARD_LIMIT;
    const links = await prisma.issueLink.findMany({
      where: { votes: { gt: 0 } },
      orderBy: { votes: 'desc' },
      take: limit,
    });

    if (links.length === 0) {
      await interaction.reply({ content: 'No votes yet.', flags: MessageFlags.Ephemeral });
      return;
    }

    const lines = links.map(
      (link, index) => `**${index + 1}.** <#${link.threadId}> — 👍 ${link.votes} · #${link.issueNumber}`,
    );
    await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
  }
}
