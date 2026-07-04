export interface IssueBodyInput {
  content: string;
  reporter: string;
  threadUrl: string;
}

export function buildIssueBody(input: IssueBodyInput): string {
  const content = input.content.trim();
  return [
    '> Signalé depuis Discord',
    '',
    `**Fil :** ${input.threadUrl}`,
    `**Signalé par :** ${input.reporter}`,
    '',
    '---',
    '',
    content.length > 0 ? content : '_Aucune description fournie._',
  ].join('\n');
}
