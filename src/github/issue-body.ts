export interface IssueBodyInput {
  content: string;
  reporter: string;
  threadUrl: string;
}

export function buildIssueBody(input: IssueBodyInput): string {
  const content = input.content.trim();
  return [
    '> Reported from Discord',
    '',
    `**Thread:** ${input.threadUrl}`,
    `**Reporter:** ${input.reporter}`,
    '',
    '---',
    '',
    content.length > 0 ? content : '_No description provided._',
  ].join('\n');
}
