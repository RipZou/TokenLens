import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import { DuplicateEmailError, type NewUser, type UserRecord, type UserRepository } from "@/lib/auth/user-repository";
import { getPrisma } from "@/lib/db/prisma";

function toRecord(row: {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    createdAt: row.createdAt,
  };
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly db: PrismaClient) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const row = await this.db.user.findUnique({ where: { email } });
    return row ? toRecord(row) : null;
  }

  async create(input: NewUser): Promise<UserRecord> {
    try {
      const row = await this.db.user.create({ data: input });
      return toRecord(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new DuplicateEmailError();
      }
      throw error;
    }
  }
}

export function getUserRepository(): UserRepository {
  return new PrismaUserRepository(getPrisma());
}
