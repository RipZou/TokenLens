import { expect, test } from "@playwright/test";

test("register, create a project, and issue a reporting key", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.test`;

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
    const key = await page.getByTestId("new-key").textContent();
    expect(key).toMatch(/^tl_[A-Za-z0-9_-]{40,}$/);
    await page.getByRole("button", { name: "I've saved it" }).click();
    await expect(page.getByTestId("new-key")).toHaveCount(0);
    await expect(page.getByRole("cell", { name: "Active" })).toBeVisible();

    await page.reload();
    await expect(page.getByText(key ?? "")).toHaveCount(0);
  });
});
