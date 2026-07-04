import type { GitHubModule } from './index.js';

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
}
