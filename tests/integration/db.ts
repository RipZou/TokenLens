import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaOrganizationRepository } from "@/lib/db/organization-repository";
import { PrismaProjectRepository } from "@/lib/db/project-repository";
import { PrismaUserRepository } from "@/lib/db/user-repository";

const connectionString = process.env.INTEGRATION_DATABASE_URL;
if (!connectionString) {
  throw new Error("Set INTEGRATION_DATABASE_URL to an isolated test database");
}

export const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

export const SECRET = "integration-secret-that-is-long-enough";

export function repositories() {
  return {
    users: new PrismaUserRepository(db),
    orgs: new PrismaOrganizationRepository(db),
    projects: new PrismaProjectRepository(db),
  };
}

export async function resetDatabase(): Promise<void> {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "api_keys", "projects", "memberships", "organizations", "users" CASCADE',
  );
}
