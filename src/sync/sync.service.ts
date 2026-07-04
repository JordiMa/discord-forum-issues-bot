import { logger } from '../logger.js';

/**
 * Central bidirectional sync between Discord threads and GitHub issues.
 * Both modules call into this service so the reconciliation logic lives
 * in one place. Implementations are stubbed for the initial scaffold.
 */
export class SyncService {
  public async onThreadCreated(threadId: string): Promise<void> {
    logger.debug({ threadId }, 'onThreadCreated — not implemented');
  }

  public async onIssueChanged(issueNumber: number): Promise<void> {
    logger.debug({ issueNumber }, 'onIssueChanged — not implemented');
  }
}
