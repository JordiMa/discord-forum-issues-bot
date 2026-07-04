const CLOSING_KEYWORDS = /(?:close[sd]?|fix(?:es|ed)?|resolve[sd]?)\s*:?\s+#(\d+)/gi;
const ISSUE_REFERENCE = /#(\d+)/g;

export function parseClosingIssueNumbers(text: string | null | undefined): number[] {
  return extractNumbers(text, CLOSING_KEYWORDS);
}

export function extractIssueReferences(text: string | null | undefined): number[] {
  return extractNumbers(text, ISSUE_REFERENCE);
}

function extractNumbers(text: string | null | undefined, pattern: RegExp): number[] {
  if (!text) {
    return [];
  }
  const numbers = new Set<number>();
  for (const match of text.matchAll(pattern)) {
    const value = match[1];
    if (value) {
      numbers.add(Number(value));
    }
  }
  return [...numbers];
}

export interface PullRequestEvent {
  owner: string;
  repo: string;
  number: number;
  url: string;
  merged: boolean;
  closesIssues: number[];
}

export interface RawPullRequest {
  number: number;
  html_url: string;
  merged?: boolean | null;
  title?: string | null;
  body?: string | null;
}

export function normalizePullRequest(
  owner: string,
  repo: string,
  pr: RawPullRequest,
): PullRequestEvent {
  return {
    owner,
    repo,
    number: pr.number,
    url: pr.html_url,
    merged: pr.merged ?? false,
    closesIssues: parseClosingIssueNumbers(`${pr.title ?? ''}\n${pr.body ?? ''}`),
  };
}

export interface ReleaseEvent {
  owner: string;
  repo: string;
  tag: string;
  referencedNumbers: number[];
}

export interface RawRelease {
  tag_name: string;
  name?: string | null;
  body?: string | null;
}

export function normalizeRelease(owner: string, repo: string, release: RawRelease): ReleaseEvent {
  return {
    owner,
    repo,
    tag: release.tag_name,
    referencedNumbers: extractIssueReferences(`${release.name ?? ''}\n${release.body ?? ''}`),
  };
}
