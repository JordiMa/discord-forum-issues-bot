import type { Message } from 'discord.js';
import type { AppConfig } from '../config/app-config.js';
import { config as env } from '../config/index.js';
import type { IssuesService } from '../github/issues.service.js';
import type { GitHubCommentEvent } from '../github/issue-event.js';
import type { DiscordGateway } from '../discord/gateway.js';
import { isModerator } from '../discord/permissions.js';
import { findIssueLink } from '../db/issue-link.js';
import { prisma } from '../db/client.js';
import { logger } from '../logger.js';

const DISCORD_MESSAGE_LIMIT = 1800;

export function formatDiscordCommentForGitHub(input: {
  author: string;
  content: string;
  attachmentUrls: string[];
}): string | null {
  const content = input.content.trim();
  if (content.length === 0 && input.attachmentUrls.length === 0) {
    return null;
  }

  const lines = [`💬 **${input.author}** _(depuis Discord)_`, ''];
  if (content.length > 0) {
    lines.push(content);
  }
  if (input.attachmentUrls.length > 0) {
    lines.push('', '**Pièces jointes :**', ...input.attachmentUrls);
  }
  return lines.join('\n');
}

export function formatGitHubCommentForDiscord(event: GitHubCommentEvent): string {
  const header = `💬 **${event.author}** _(depuis GitHub)_`;
  const body = event.body.trim();
  const rendered =
    body.length > DISCORD_MESSAGE_LIMIT
      ? `${body.slice(0, DISCORD_MESSAGE_LIMIT)}…\n\n[Voir le commentaire complet sur GitHub](${event.url})`
      : body;
  return `${header}\n\n${rendered}`;
}

export class CommentMirrorService {
  public constructor(
    private readonly config: AppConfig,
    private readonly issues: IssuesService,
    private readonly gateway: DiscordGateway,
  ) {}

  public async onDiscordMessage(message: Message): Promise<void> {
    if (this.config.comments.discordToGithub === 'disabled') {
      return;
    }
    if (message.author.bot || message.system) {
      return;
    }
    if (!message.inGuild()) {
      return;
    }
    if (message.id === message.channelId) {
      return;
    }

    const link = await prisma.issueLink.findUnique({ where: { threadId: message.channelId } });
    if (!link) {
      return;
    }

    if (this.config.comments.discordToGithub === 'maintainers') {
      const member = message.member;
      if (!member || !isModerator(member, this.config.moderation)) {
        return;
      }
    }

    const body = formatDiscordCommentForGitHub({
      author: message.member?.displayName ?? message.author.username,
      content: message.content,
      attachmentUrls: [...message.attachments.values()].map((attachment) => attachment.url),
    });
    if (!body) {
      return;
    }

    const repository = await prisma.repository.findUnique({ where: { id: link.repositoryId } });
    if (!repository) {
      return;
    }

    await this.issues.createComment(repository.owner, repository.repo, link.issueNumber, body);
    logger.info(
      { issue: link.issueNumber, author: message.author.username },
      'Mirrored Discord message to GitHub',
    );
  }

  public async onGitHubComment(event: GitHubCommentEvent): Promise<void> {
    if (this.config.comments.githubToDiscord === 'disabled') {
      return;
    }
    if (event.viaAppId !== null && String(event.viaAppId) === env.github.appId) {
      return;
    }
    if (event.body.trim().length === 0) {
      return;
    }

    const link = await findIssueLink(event.owner, event.repo, event.issueNumber);
    if (!link) {
      return;
    }

    await this.gateway.sendThreadMessage(link.threadId, formatGitHubCommentForDiscord(event));
    logger.info(
      { issue: event.issueNumber, author: event.author },
      'Mirrored GitHub comment to Discord',
    );
  }
}
