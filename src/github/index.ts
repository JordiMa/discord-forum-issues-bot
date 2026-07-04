import { App } from '@octokit/app';
import type { Octokit } from '@octokit/rest';
import { config } from '../config/index.js';

export class GitHubModule {
  private readonly app: App;

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

  public async getInstallationClient(installationId: number): Promise<Octokit> {
    return (await this.app.getInstallationOctokit(installationId)) as unknown as Octokit;
  }
}
