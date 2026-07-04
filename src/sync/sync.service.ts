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
import { resolvePriorityFromLabels, resolveStatusFromLabels } from './status.js';
import { findIssueLink } from '../db/issue-link.js';
import { prisma } from '../db/client.js';
import { logger } from '../logger.js';

const DEFAULT_FORUM_EMOJI = '🐛';
const FALLBACK_STATUS = { emoji: '⚪', name: 'Open' };
const CLOSED_STATUS = { emoji: '🔒', name: 'Closed' };

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

  public constructor(
    private readonly config: AppConfig,
    private readonly issues: IssuesService,
    private readonly gateway: DiscordGateway,
  ) {
    this.actionRows = buildIssueActionRows(config);
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
    const embed = this.buildEmbed({
      emoji: forum?.emoji ?? DEFAULT_FORUM_EMOJI,
      title: event.title,
      issue: { number: event.number, url: event.url },
      state: event.state,
      labels: event.labels,
      assignees: event.assignees,
      milestone: event.milestone,
      votes: link.votes,
      createdAt: link.createdAt,
      refs: this.resolveLinkedRefs(link),
    });

    const updated = await this.gateway.editEmbed(
      thread,
      link.embedMessageId,
      embed,
      this.actionRows,
    );
    if (updated) {
      logger.info(
        { threadId: thread.id, issue: event.number },
        'Updated Discord embed from GitHub issue event',
      );
    }
  }

  public async refreshIssue(owner: string, repo: string, issueNumber: number): Promise<void> {
    const event = await this.issues.getIssueEvent(owner, repo, issueNumber);
    await this.onIssueChanged(event);
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
    return buildIssueEmbed({
      emoji: input.emoji,
      title: input.title,
      issueNumber: input.issue.number,
      issueUrl: input.issue.url,
      status: this.resolveEmbedStatus(input.labels, input.state),
      state: input.state,
      assignees: input.assignees,
      labels: this.displayLabels(input.labels),
      priority: resolvePriorityFromLabels(input.labels),
      version: input.milestone ?? undefined,
      votes: input.votes,
      pullRequest: input.refs?.pullRequest,
      release: input.refs?.release,
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

  private resolveEmbedStatus(
    labels: string[],
    state: 'open' | 'closed',
  ): { emoji: string; name: string } {
    const fromLabels = resolveStatusFromLabels(labels, this.config.workflow);
    if (state === 'closed') {
      return fromLabels
        ? { emoji: fromLabels.emoji, name: `${fromLabels.name} · Closed` }
        : CLOSED_STATUS;
    }
    return fromLabels ?? FALLBACK_STATUS;
  }

  private buildLabels(forum: ForumConfig, thread: AnyThreadChannel): string[] {
    const tagLabels = resolveAppliedTagNames(thread);
    return Array.from(new Set([...forum.defaultLabels, ...tagLabels]));
  }

  private displayLabels(labels: string[]): string[] {
    return labels.filter((label) => !label.startsWith('status:') && !label.startsWith('priority:'));
  }
}
