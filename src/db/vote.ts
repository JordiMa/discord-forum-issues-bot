import { prisma } from './client.js';

export interface VoteResult {
  added: boolean;
  count: number;
}

export async function toggleVote(issueLinkId: string, userId: string): Promise<VoteResult> {
  const existing = await prisma.vote.findUnique({
    where: { issueLinkId_userId: { issueLinkId, userId } },
  });

  if (existing) {
    const [, updated] = await prisma.$transaction([
      prisma.vote.delete({ where: { id: existing.id } }),
      prisma.issueLink.update({ where: { id: issueLinkId }, data: { votes: { decrement: 1 } } }),
    ]);
    return { added: false, count: updated.votes };
  }

  const [, updated] = await prisma.$transaction([
    prisma.vote.create({ data: { issueLinkId, userId } }),
    prisma.issueLink.update({ where: { id: issueLinkId }, data: { votes: { increment: 1 } } }),
  ]);
  return { added: true, count: updated.votes };
}
