import type { AnyThreadChannel, Message } from 'discord.js';
import type { AppConfig, ForumConfig } from '../config/app-config.js';
import type { IssuesService, CreatedIssue } from '../github/issues.service.js';
import { buildIssueBody } from '../github/issue-body.js';
import { buildIssueEmbed } from '../discord/embeds/issue-embed.js';
import {
  buildThreadUrl,
  fetchStarterMessageWithRetry,
  isForumThread,
  resolveAppliedTagNames,
} from '../discord/forum-thread.js';
import { resolveStatusFromLabels } from './status.js';
import { prisma } from '../db/client.js';
import { logger } from '../logger.js';

const DEFAULT_FORUM_EMOJI = '🐛';
const FALLBACK_STATUS = { emoji: '⚪', name: 'Open' };

export class SyncService {
  public constructor(
    private readonly config: AppConfig,
    private readonly issues: IssuesService,
  ) {}

  public async onThreadCreated(thread: AnyThreadChannel): Promise<void> {
    if (!isForumThread(thread)) {
      return;
    }

    const forum = this.resolveForum(thread.parentId);
    if (!forum) {
      return;
    }

    const alreadyLinked = await prisma.issueLink.findUnique({ where: { threadId: thread.id } });
    if (alreadyLinked) {
      logger.warn({ threadId: thread.id }, 'Thread is already linked to an issue, skipping');
      return;
    }

    const repository = this.config.repositories[forum.repository];
    if (!repository) {
      logger.error({ repository: forum.repository }, 'Forum references an unknown repository');
      return;
    }

    const starterMessage = await fetchStarterMessageWithRetry(thread);
    const labels = this.buildLabels(forum, thread);

    const issue = await this.issues.createIssue({
      owner: repository.owner,
      repo: repository.repo,
      title: thread.name,
      body: buildIssueBody({
        threadUrl: buildThreadUrl(thread),
        reporter: this.resolveReporter(starterMessage),
        content: starterMessage?.content ?? '',
      }),
      labels,
    });

    const savedRepository = await prisma.repository.upsert({
      where: { owner_repo: { owner: repository.owner, repo: repository.repo } },
      create: {
        owner: repository.owner,
        repo: repository.repo,
        installationId: issue.installationId,
      },
      update: { installationId: issue.installationId },
    });

    const embedMessageId = await this.postIssueEmbed(
      thread,
      forum.emoji ?? DEFAULT_FORUM_EMOJI,
      issue,
      labels,
    );

    await prisma.issueLink.create({
      data: {
        threadId: thread.id,
        issueId: BigInt(issue.id),
        issueNumber: issue.number,
        repositoryId: savedRepository.id,
        embedMessageId,
      },
    });

    logger.info(
      {
        threadId: thread.id,
        issue: issue.number,
        repository: `${repository.owner}/${repository.repo}`,
      },
      'Created GitHub issue for forum thread',
    );
  }

  private resolveForum(parentId: string | null): ForumConfig | null {
    if (!parentId) {
      return null;
    }
    for (const forum of Object.values(this.config.forums)) {
      if (forum.channelId === parentId) {
        return forum;
      }
    }
    return null;
  }

  private resolveReporter(message: Message | null): string {
    if (!message) {
      return 'Unknown';
    }
    return `@${message.author.username}`;
  }

  private buildLabels(forum: ForumConfig, thread: AnyThreadChannel): string[] {
    const tagLabels = resolveAppliedTagNames(thread);
    return Array.from(new Set([...forum.defaultLabels, ...tagLabels]));
  }

  private async postIssueEmbed(
    thread: AnyThreadChannel,
    emoji: string,
    issue: CreatedIssue,
    labels: string[],
  ): Promise<string | null> {
    const status = resolveStatusFromLabels(labels, this.config.workflow);
    const embed = buildIssueEmbed({
      emoji,
      title: thread.name,
      issueNumber: issue.number,
      issueUrl: issue.url,
      status: status ?? FALLBACK_STATUS,
      assignees: [],
      labels: labels.filter((label) => !label.startsWith('status:')),
      votes: 0,
      createdAt: new Date(),
    });

    try {
      const message = await thread.send({ embeds: [embed] });
      return message.id;
    } catch (error) {
      logger.error({ error, threadId: thread.id }, 'Failed to post issue status embed');
      return null;
    }
  }
}
