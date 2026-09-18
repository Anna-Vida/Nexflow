import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';

// Ownership is enforced by foreign keys, so integration fixtures need a real
// User row. The stored hash is deliberately unusable for signing in.
export function createTestOwner(prisma: PrismaService, label = 'owner') {
  return prisma.user.create({
    data: {
      email: `${label}-${randomUUID()}@nexflow.test`,
      passwordHash: 'scrypt$test$disabled',
    },
    select: { id: true, email: true },
  });
}

export function removeTestOwner(prisma: PrismaService, ownerId: string) {
  return prisma.user.deleteMany({ where: { id: ownerId } });
}