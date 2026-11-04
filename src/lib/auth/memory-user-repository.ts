import { randomUUID } from "node:crypto";
import { DuplicateEmailError, type NewUser, type UserRecord, type UserRepository } from "@/lib/auth/user-repository";

export class MemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, UserRecord>();

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.users.get(email) ?? null;
  }

  async create(input: NewUser): Promise<UserRecord> {
    if (this.users.has(input.email)) {
      throw new DuplicateEmailError();
    }
    const user: UserRecord = {
      id: randomUUID(),
      email: input.email,
      passwordHash: input.passwordHash,
      createdAt: new Date(),
    };
    this.users.set(user.email, user);
    return user;
  }
}
