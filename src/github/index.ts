import { App } from '@octokit/app';
import { config } from '../config/index.js';

type InstallationClient = Awaited<ReturnType<App['getInstallationOctokit']>>;

export interface RepoContext {
  client: InstallationClient;
  installationId: number;
}

export class GitHubModule {
  private readonly app: App;
  private readonly repoContexts = new Map<string, RepoContext>();

  public constructor() {
    this.app = new App({
      appId: config.github.appId,
      privateKey: config.github.privateKey,
      webhooks: { secret: config.github.webhookSecret },
    });
  }

  public getApp(): App {
    return this.app;
  }

  public async getRepoContext(owner: string, repo: string): Promise<RepoContext> {
    const key = `${owner}/${repo}`;
    const cached = this.repoContexts.get(key);
    if (cached) {
      return cached;
    }

    const { data: installation } = await this.app.octokit.request(
      'GET /repos/{owner}/{repo}/installation',
      { owner, repo },
    );
    const client = await this.app.getInstallationOctokit(installation.id);
    const context: RepoContext = { client, installationId: installation.id };
    this.repoContexts.set(key, context);
    return context;
  }
}
