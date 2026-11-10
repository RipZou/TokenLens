import { expect, test } from "@playwright/test";

test("register, create a project, issue a key, and report a call", async ({ page, request }) => {
  const email = `e2e-${Date.now()}@example.test`;
  let key = "";

  await test.step("register", async () => {
    await page.goto("/sign-up");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("e2e-test-password");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(email)).toBeVisible();
  });

  await test.step("create a project", async () => {
    await page.getByRole("link", { name: "Projects" }).click();
    await page.getByLabel("New project name").fill("support-agent");
    await page.getByRole("button", { name: "Create project" }).click();
    await page.getByRole("link", { name: "support-agent" }).click();
    await expect(page.getByRole("heading", { name: "API keys · support-agent" })).toBeVisible();
  });

  await test.step("issue a reporting key and see it only once", async () => {
    await page.getByRole("button", { name: "Create key" }).click();
    key = (await page.getByTestId("new-key").textContent()) ?? "";
    expect(key).toMatch(/^tl_[A-Za-z0-9_-]{40,}$/);
    await page.getByRole("button", { name: "I've saved it" }).click();
    await expect(page.getByTestId("new-key")).toHaveCount(0);
    await expect(page.getByRole("cell", { name: "Active" })).toBeVisible();

    await page.reload();
    await expect(page.getByText(key)).toHaveCount(0);
  });

  await test.step("report a call with the key", async () => {
    const response = await request.post("/api/v1/events", {
      headers: { authorization: `Bearer ${key}` },
      data: {
        id: `evt-${Date.now()}`,
        provider: "anthropic",
        agent: "support-agent",
        model: "claude-sonnet-4-5",
        request: {
          model: "claude-sonnet-4-5",
          system: "You are a support agent",
          messages: [{ role: "user", content: "Where is my order" }],
        },
        usage: { input_tokens: 9, output_tokens: 2 },
      },
    });
    expect(response.status()).toBe(201);
    const body = (await response.json()) as { input: Record<string, number> };
    expect(Object.values(body.input).reduce((sum, tokens) => sum + tokens, 0)).toBe(9);
  });
});
