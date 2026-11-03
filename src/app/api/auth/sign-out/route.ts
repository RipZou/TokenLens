import { handleSignOut } from "@/lib/auth/handlers";

export function POST(): Response {
  return handleSignOut();
}
