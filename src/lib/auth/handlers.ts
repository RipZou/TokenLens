import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { clearedSessionCookie, sessionCookie, signSession } from "@/lib/auth/session";
import { credentialsSchema } from "@/lib/schemas/auth";
import { DuplicateEmailError, type UserRepository } from "@/lib/auth/user-repository";
import { errorResponse, readJson } from "@/lib/http";

export type AuthDependencies = {
  users: UserRepository;
  secret: string;
  secure?: boolean;
};

async function signedInResponse(
  user: { id: string; email: string },
  options: AuthDependencies,
  status: number,
): Promise<Response> {
  const token = await signSession({ sub: user.id, email: user.email }, options.secret);
  return Response.json(
    { id: user.id, email: user.email },
    { status, headers: { "set-cookie": sessionCookie(token, options.secure ?? false) } },
  );
}

export async function handleRegister(request: Request, options: AuthDependencies): Promise<Response> {
  if (!options.secret) return errorResponse(500, "Server is missing JWT_SECRET");
  const credentials = await readJson(request, credentialsSchema, "Invalid email or password");
  if (credentials instanceof Response) return credentials;

  const existing = await options.users.findByEmail(credentials.email);
  if (existing) return errorResponse(409, "Email is already registered");

  try {
    const user = await options.users.create({
      email: credentials.email,
      passwordHash: await hashPassword(credentials.password),
    });
    return signedInResponse(user, options, 201);
  } catch (error) {
    if (error instanceof DuplicateEmailError) return errorResponse(409, "Email is already registered");
    throw error;
  }
}

export async function handleSignIn(request: Request, options: AuthDependencies): Promise<Response> {
  if (!options.secret) return errorResponse(500, "Server is missing JWT_SECRET");
  const credentials = await readJson(request, credentialsSchema, "Invalid email or password");
  if (credentials instanceof Response) return credentials;

  const user = await options.users.findByEmail(credentials.email);
  const passwordMatches = user ? await verifyPassword(credentials.password, user.passwordHash) : false;
  if (!user || !passwordMatches) return errorResponse(401, "Invalid email or password");
  return signedInResponse(user, options, 200);
}

export function handleSignOut(): Response {
  return Response.json({ ok: true }, { headers: { "set-cookie": clearedSessionCookie() } });
}
