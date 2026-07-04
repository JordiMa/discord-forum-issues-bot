import type { AppConfig } from '../config/app-config.js';
import type { IssuesService } from '../github/issues.service.js';
import type { PullRequestEvent, ReleaseEvent } from '../github/pull-request.js';
import type { SyncService } from './sync.service.js';
import { findIssueLink, findIssueLinksByPr } from '../db/issue-link.js';
import { swapPrefixedLabel } from './labels.js';
import { prisma } from '../db/client.js';
import { logger } from '../logger.js';

export class LinkedRefsService {
  public constructor(
    private readonly config: AppConfig,
    private readonly issues: IssuesService,
    private readonly sync: SyncService,
  ) {}

  public async onPullRequest(event: PullRequestEvent): Promise<void> {
    for (const issueNumber of event.closesIssues) {
      const link = await findIssueLink(event.owner, event.repo, issueNumber);
      if (!link) {
        continue;
      }

      await prisma.issueLink.update({
        where: { id: link.id },
        data: {
          linkedPrNumber: event.number,
          linkedPrUrl: event.url,
          linkedPrMerged: event.merged,
        },
      });

      if (event.merged) {
        await this.applyMergedStatus(event.owner, event.repo, issueNumber);
      }

      await this.sync.refreshIssue(event.owner, event.repo, issueNumber);
      logger.info(
        { issue: issueNumber, pr: event.number, merged: event.merged },
        'Linked pull request to issue',
      );
    }
  }

  public async onRelease(event: ReleaseEvent): Promise<void> {
    const refreshed = new Set<number>();
    for (const reference of event.referencedNumbers) {
      const direct = await findIssueLink(event.owner, event.repo, reference);
      const viaPr = await findIssueLinksByPr(event.owner, event.repo, reference);
      const links = direct ? [direct, ...viaPr] : viaPr;

      for (const link of links) {
        if (refreshed.has(link.issueNumber)) {
          continue;
        }
        refreshed.add(link.issueNumber);

        await prisma.issueLink.update({ where: { id: link.id }, data: { releaseTag: event.tag } });
        await this.sync.refreshIssue(event.owner, event.repo, link.issueNumber);
        logger.info({ issue: link.issueNumber, release: event.tag }, 'Marked issue as released');
      }
    }
  }

  private async applyMergedStatus(owner: string, repo: string, issueNumber: number): Promise<void> {
    const statusKey = this.config.workflow.mergedStatus;
    if (!statusKey) {
      return;
    }
    const status = this.config.workflow.statuses[statusKey];
    if (!status) {
      return;
    }
    const before = await this.issues.getIssueEvent(owner, repo, issueNumber);
    const labels = swapPrefixedLabel(before.labels, 'status:', status.label);
    await this.issues.setLabels(owner, repo, issueNumber, labels);
  }
}
