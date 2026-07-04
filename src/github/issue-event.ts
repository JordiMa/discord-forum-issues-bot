export interface IssueChangedEvent {
  owner: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  state: 'open' | 'closed';
  labels: string[];
  assignees: string[];
  milestone: string | null;
}

export interface RawIssue {
  number: number;
  title: string;
  html_url: string;
  state?: string | null;
  labels?: ReadonlyArray<string | { name?: string | null } | null> | null;
  assignees?: ReadonlyArray<{ login?: string | null } | null> | null;
  milestone?: { title?: string | null } | null;
}

export function normalizeIssue(owner: string, repo: string, issue: RawIssue): IssueChangedEvent {
  return {
    owner,
    repo,
    number: issue.number,
    title: issue.title,
    url: issue.html_url,
    state: issue.state === 'closed' ? 'closed' : 'open',
    labels: (issue.labels ?? [])
      .map((label) => (typeof label === 'string' ? label : (label?.name ?? undefined)))
      .filter((name): name is string => Boolean(name)),
    assignees: (issue.assignees ?? [])
      .map((assignee) => assignee?.login ?? undefined)
      .filter((login): login is string => Boolean(login)),
    milestone: issue.milestone?.title ?? null,
  };
}
