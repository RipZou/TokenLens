import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

let client: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!client) {
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  }
  return client;
}
