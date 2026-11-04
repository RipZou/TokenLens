import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { gateDashboard } from "@/lib/auth/gate";

export async function proxy(request: NextRequest): Promise<Response> {
  const blocked = await gateDashboard(request, { secret: process.env.JWT_SECRET ?? "" });
  if (!blocked) return NextResponse.next();
  const location = blocked.headers.get("location");
  return NextResponse.redirect(location ?? new URL("/sign-in", request.url), 307);
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*"],
};
