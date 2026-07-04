import { prisma } from './client.js';

export async function findIssueLink(owner: string, repo: string, issueNumber: number) {
  const repository = await prisma.repository.findUnique({ where: { owner_repo: { owner, repo } } });
  if (!repository) {
    return null;
  }
  return prisma.issueLink.findUnique({
    where: { repositoryId_issueNumber: { repositoryId: repository.id, issueNumber } },
  });
}

export async function findIssueLinksByPr(owner: string, repo: string, prNumber: number) {
  const repository = await prisma.repository.findUnique({ where: { owner_repo: { owner, repo } } });
  if (!repository) {
    return [];
  }
  return prisma.issueLink.findMany({
    where: { repositoryId: repository.id, linkedPrNumber: prNumber },
  });
}
