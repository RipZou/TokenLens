import type { z } from "zod";

export function errorResponse(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>, message: string): Promise<T | Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, message);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return errorResponse(400, message);
  return parsed.data;
}
