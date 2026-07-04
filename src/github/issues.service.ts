import type { GitHubModule } from './index.js';
import { normalizeIssue, type IssueChangedEvent } from './issue-event.js';

export interface CreateIssueInput {
  owner: string;
  repo: string;
  title: string;
  body: string;
  labels: string[];
}

export interface CreatedIssue {
  id: number;
  number: number;
  url: string;
  installationId: number;
}

export class IssuesService {
  public constructor(private readonly github: GitHubModule) {}

  public async createIssue(input: CreateIssueInput): Promise<CreatedIssue> {
    const { client, installationId } = await this.github.getRepoContext(input.owner, input.repo);
    const { data } = await client.request('POST /repos/{owner}/{repo}/issues', {
      owner: input.owner,
      repo: input.repo,
      title: input.title,
      body: input.body,
      labels: input.labels,
    });

    return {
      id: data.id,
      number: data.number,
      url: data.html_url,
      installationId,
    };
  }

  public async getIssueEvent(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<IssueChangedEvent> {
    const { client } = await this.github.getRepoContext(owner, repo);
    const { data } = await client.request('GET /repos/{owner}/{repo}/issues/{issue_number}', {
      owner,
      repo,
      issue_number: issueNumber,
    });
    return normalizeIssue(owner, repo, data);
  }

  public async setLabels(
    owner: string,
    repo: string,
    issueNumber: number,
    labels: string[],
  ): Promise<void> {
    const { client } = await this.github.getRepoContext(owner, repo);
    await client.request('PUT /repos/{owner}/{repo}/issues/{issue_number}/labels', {
      owner,
      repo,
      issue_number: issueNumber,
      labels,
    });
  }

  public async setAssignees(
    owner: string,
    repo: string,
    issueNumber: number,
    assignees: string[],
  ): Promise<void> {
    const { client } = await this.github.getRepoContext(owner, repo);
    await client.request('PATCH /repos/{owner}/{repo}/issues/{issue_number}', {
      owner,
      repo,
      issue_number: issueNumber,
      assignees,
    });
  }

  public async setMilestone(
    owner: string,
    repo: string,
    issueNumber: number,
    milestoneTitle: string | null,
  ): Promise<boolean> {
    const { client } = await this.github.getRepoContext(owner, repo);
    let milestone: number | null = null;
    if (milestoneTitle) {
      milestone = await this.resolveMilestoneNumber(owner, repo, milestoneTitle);
      if (milestone === null) {
        return false;
      }
    }
    await client.request('PATCH /repos/{owner}/{repo}/issues/{issue_number}', {
      owner,
      repo,
      issue_number: issueNumber,
      milestone,
    });
    return true;
  }

  private async resolveMilestoneNumber(
    owner: string,
    repo: string,
    title: string,
  ): Promise<number | null> {
    const { client } = await this.github.getRepoContext(owner, repo);
    const { data } = await client.request('GET /repos/{owner}/{repo}/milestones', {
      owner,
      repo,
      state: 'all',
      per_page: 100,
    });
    const milestone = data.find((entry) => entry.title === title);
    return milestone ? milestone.number : null;
  }
}
