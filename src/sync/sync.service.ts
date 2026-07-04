import type {
  ActionRowBuilder,
  AnyThreadChannel,
  Message,
  MessageActionRowComponentBuilder,
} from 'discord.js';
import type { AppConfig, ForumConfig } from '../config/app-config.js';
import type { IssuesService } from '../github/issues.service.js';
import type { IssueChangedEvent } from '../github/issue-event.js';
import type { DiscordGateway } from '../discord/gateway.js';
import { buildIssueBody } from '../github/issue-body.js';
import { buildIssueEmbed } from '../discord/embeds/issue-embed.js';
import { buildIssueActionRows } from '../discord/components/issue-actions.js';
import {
  buildThreadUrl,
  fetchStarterMessageWithRetry,
  isForumThread,
  resolveAppliedTagNames,
} from '../discord/forum-thread.js';
import {
  CLOSED_STATUS_COLOR,
  DEFAULT_STATUS_COLOR,
  resolvePriorityFromLabels,
  resolveStatusFromLabels,
  statusColor,
} from './status.js';
import { findIssueLink } from '../db/issue-link.js';
import { config as env } from '../config/index.js';
import { prisma } from '../db/client.js';
import { logger } from '../logger.js';

const DEFAULT_FORUM_EMOJI = '🐛';
const SPACER_URL = env.server.publicUrl
  ? `${env.server.publicUrl.replace(/\/$/, '')}/spacer.png`
  : undefined;

export enum IssueCreationOutcome {
  Created = 'created',
  AlreadyLinked = 'already-linked',
  NotAForum = 'not-a-forum',
  ForumNotMapped = 'forum-not-mapped',
  RepositoryUnknown = 'repository-unknown',
}

export interface IssueCreationResult {
  outcome: IssueCreationOutcome;
  issueNumber?: number;
  url?: string;
}

interface LinkedRefs {
  pullRequest?: { number: number; url: string; merged: boolean };
  release?: string;
}

export class SyncService {
  private readonly actionRows: ActionRowBuilder<MessageActionRowComponentBuilder>[];
  private readonly threadLocks = new Map<string, Promise<unknown>>();

  public constructor(
    private readonly config: AppConfig,
    private readonly issues: IssuesService,
    private readonly gateway: DiscordGateway,
  ) {
    this.actionRows = buildIssueActionRows();
  }

  public async onThreadCreated(thread: AnyThreadChannel): Promise<void> {
    const result = await this.ensureIssueForThread(thread);
    if (result.outcome === IssueCreationOutcome.AlreadyLinked) {
      logger.warn(
        { threadId: thread.id, issue: result.issueNumber },
        'Thread is already linked to an issue, skipping',
      );
    } else if (result.outcome === IssueCreationOutcome.RepositoryUnknown) {
      logger.error({ threadId: thread.id }, 'Forum references an unknown repository');
    }
  }

  public async ensureIssueForThread(thread: AnyThreadChannel): Promise<IssueCreationResult> {
    if (!isForumThread(thread)) {
      return { outcome: IssueCreationOutcome.NotAForum };
    }

    const forum = this.resolveForum(thread.parentId);
    if (!forum) {
      return { outcome: IssueCreationOutcome.ForumNotMapped };
    }

    const alreadyLinked = await prisma.issueLink.findUnique({ where: { threadId: thread.id } });
    if (alreadyLinked) {
      return {
        outcome: IssueCreationOutcome.AlreadyLinked,
        issueNumber: alreadyLinked.issueNumber,
      };
    }

    const repository = this.config.repositories[forum.repository];
    if (!repository) {
      return { outcome: IssueCreationOutcome.RepositoryUnknown };
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

    const embedMessageId = await this.gateway.sendEmbed(
      thread,
      this.buildEmbed({
        emoji: forum.emoji ?? DEFAULT_FORUM_EMOJI,
        title: thread.name,
        issue: { number: issue.number, url: issue.url },
        state: 'open',
        labels,
        assignees: [],
        milestone: null,
        votes: 0,
        createdAt: new Date(),
      }),
      this.actionRows,
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
    return { outcome: IssueCreationOutcome.Created, issueNumber: issue.number, url: issue.url };
  }

  public async onIssueChanged(event: IssueChangedEvent): Promise<void> {
    const link = await findIssueLink(event.owner, event.repo, event.number);
    if (!link || !link.embedMessageId) {
      return;
    }

    const thread = await this.gateway.fetchThread(link.threadId);
    if (!thread) {
      logger.warn({ threadId: link.threadId, issue: event.number }, 'Linked thread not found');
      return;
    }

    const forum = this.resolveForum(thread.parentId);

    await this.withThreadLock(link.threadId, async () => {
      const current = await prisma.issueLink.findUnique({ where: { id: link.id } });
      if (!current) {
        return;
      }

      const embed = this.buildEmbed({
        emoji: forum?.emoji ?? DEFAULT_FORUM_EMOJI,
        title: event.title,
        issue: { number: event.number, url: event.url },
        state: event.state,
        labels: event.labels,
        assignees: event.assignees,
        milestone: event.milestone,
        votes: current.votes,
        createdAt: current.createdAt,
        refs: this.resolveLinkedRefs(current),
      });

      const newMessageId = await this.gateway.repostEmbed(
        thread,
        current.embedMessageId,
        embed,
        this.actionRows,
      );
      if (newMessageId) {
        await prisma.issueLink.update({
          where: { id: link.id },
          data: { embedMessageId: newMessageId },
        });
        logger.info(
          { threadId: thread.id, issue: event.number },
          'Reposted Discord embed at the bottom of the thread',
        );
      }
    });
  }

  public async refreshIssue(owner: string, repo: string, issueNumber: number): Promise<void> {
    const event = await this.issues.getIssueEvent(owner, repo, issueNumber);
    await this.onIssueChanged(event);
  }

  private async withThreadLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.threadLocks.get(key) ?? Promise.resolve();
    const run = previous.then(task, task);
    this.threadLocks.set(
      key,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  }

  private buildEmbed(input: {
    emoji: string;
    title: string;
    issue: { number: number; url: string };
    state: 'open' | 'closed';
    labels: string[];
    assignees: string[];
    milestone: string | null;
    votes: number;
    createdAt: Date;
    refs?: LinkedRefs;
  }) {
    const display = this.resolveStatusDisplay(input.labels, input.state);
    return buildIssueEmbed({
      emoji: input.emoji,
      title: input.title,
      issueNumber: input.issue.number,
      issueUrl: input.issue.url,
      status: { emoji: display.emoji, name: display.name },
      color: display.color,
      assignees: input.assignees,
      priority: resolvePriorityFromLabels(input.labels),
      version: input.milestone ?? undefined,
      votes: input.votes,
      pullRequest: input.refs?.pullRequest,
      release: input.refs?.release,
      spacerUrl: SPACER_URL,
      createdAt: input.createdAt,
    });
  }

  private resolveLinkedRefs(link: {
    linkedPrNumber: number | null;
    linkedPrUrl: string | null;
    linkedPrMerged: boolean;
    releaseTag: string | null;
  }): LinkedRefs {
    return {
      pullRequest:
        link.linkedPrNumber !== null
          ? {
              number: link.linkedPrNumber,
              url: link.linkedPrUrl ?? '',
              merged: link.linkedPrMerged,
            }
          : undefined,
      release: link.releaseTag ?? undefined,
    };
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

  private resolveStatusDisplay(
    labels: string[],
    state: 'open' | 'closed',
  ): { emoji: string; name: string; color: number } {
    const fromLabels = resolveStatusFromLabels(labels, this.config.workflow);
    if (state === 'closed') {
      return {
        emoji: fromLabels?.emoji ?? '🔒',
        name: fromLabels ? `${fromLabels.name} · Fermé` : 'Fermé',
        color: CLOSED_STATUS_COLOR,
      };
    }
    if (fromLabels) {
      return { emoji: fromLabels.emoji, name: fromLabels.name, color: statusColor(fromLabels.label) };
    }
    return { emoji: '⚪', name: 'Ouvert', color: DEFAULT_STATUS_COLOR };
  }

  private buildLabels(forum: ForumConfig, thread: AnyThreadChannel): string[] {
    const tagLabels = resolveAppliedTagNames(thread);
    return Array.from(new Set([...forum.defaultLabels, ...tagLabels]));
  }
}
