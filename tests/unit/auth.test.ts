import { describe, expect, it } from "vitest";
import { gateDashboard } from "@/lib/auth/gate";
import { handleRegister, handleSignIn, handleSignOut } from "@/lib/auth/handlers";
import { MemoryUserRepository } from "@/lib/auth/memory-user-repository";
import { signSession } from "@/lib/auth/session";

const SECRET = "test-secret-that-is-long-enough-for-hs256";

function post(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function sessionCookie(response: Response): string {
  return response.headers.get("set-cookie") ?? "";
}

describe("email and password authentication", () => {
  it("registers a user and sets an httpOnly session cookie", async () => {
    const users = new MemoryUserRepository();
    const response = await handleRegister(
      post("/api/auth/register", {
        email: "Dev@Example.com",
        password: "correct-password",
      }),
      { users, secret: SECRET },
    );

    expect(response.status).toBe(201);
    const cookie = sessionCookie(response);
    expect(cookie).toContain("tokenlens_session=");
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");

    const stored = await users.findByEmail("dev@example.com");
    expect(stored).not.toBeNull();
    expect(stored?.passwordHash).not.toBe("correct-password");
    expect(stored?.passwordHash.startsWith("$2")).toBe(true);
  });

  it("signs in with valid credentials and sets an httpOnly cookie", async () => {
    const users = new MemoryUserRepository();
    await handleRegister(
      post("/api/auth/register", { email: "dev@example.com", password: "correct-password" }),
      { users, secret: SECRET },
    );

    const response = await handleSignIn(
      post("/api/auth/sign-in", { email: "dev@example.com", password: "correct-password" }),
      { users, secret: SECRET },
    );

    expect(response.status).toBe(200);
    const cookie = sessionCookie(response);
    expect(cookie).toContain("tokenlens_session=");
    expect(cookie.toLowerCase()).toContain("httponly");
  });

  it("returns 401 for an incorrect password and does not set a session cookie", async () => {
    const users = new MemoryUserRepository();
    await handleRegister(
      post("/api/auth/register", { email: "dev@example.com", password: "correct-password" }),
      { users, secret: SECRET },
    );

    const response = await handleSignIn(
      post("/api/auth/sign-in", { email: "dev@example.com", password: "wrong-password" }),
      { users, secret: SECRET },
    );

    expect(response.status).toBe(401);
    expect(sessionCookie(response)).not.toContain("tokenlens_session=");
  });

  it("redirects an unauthenticated dashboard visit to the sign-in page", async () => {
    const response = await gateDashboard(new Request("http://localhost/dashboard"), {
      secret: SECRET,
    });

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe("http://localhost/sign-in");
  });

  it("redirects a dashboard visit with an invalid session cookie", async () => {
    const response = await gateDashboard(
      new Request("http://localhost/dashboard", {
        headers: { cookie: "tokenlens_session=not-a-jwt" },
      }),
      { secret: SECRET },
    );

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe("http://localhost/sign-in");
  });

  it("allows a dashboard visit that carries a valid session cookie", async () => {
    const token = await signSession({ sub: "user-1", email: "dev@example.com" }, SECRET);
    const response = await gateDashboard(
      new Request("http://localhost/dashboard", {
        headers: { cookie: `tokenlens_session=${token}` },
      }),
      { secret: SECRET },
    );

    expect(response).toBeNull();
  });

  it("clears the session cookie on sign-out", async () => {
    const response = await handleSignOut();
    const cookie = sessionCookie(response).toLowerCase();

    expect(response.status).toBe(200);
    expect(cookie).toContain("tokenlens_session=");
    expect(cookie).toContain("max-age=0");
  });
});
