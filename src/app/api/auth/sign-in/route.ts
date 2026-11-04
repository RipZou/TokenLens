import { handleSignIn } from "@/lib/auth/handlers";
import { authDependencies } from "@/lib/auth/route-deps";

export async function POST(request: Request): Promise<Response> {
  const options = authDependencies();
  if (options instanceof Response) return options;
  return handleSignIn(request, options);
}
