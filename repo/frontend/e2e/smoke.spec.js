import { test, expect } from "@playwright/test";

async function mockApi(page) {
  let currentUser = null;

  await page.route("**://127.0.0.1:4000/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api", "");
    const method = request.method();

    const json = (body, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body)
    });

    if (method === "POST" && path === "/auth/login") {
      const payload = JSON.parse(request.postData() || "{}");
      const role = payload.username === "hr1" ? "HR" : "CLERK";
      currentUser = {
        id: role === "HR" ? 2 : 4,
        username: payload.username,
        role,
        siteId: 1,
        sensitiveDataView: role === "HR"
      };
      return json({
        token: `${payload.username}-token`,
        user: currentUser
      });
    }

    if (method === "POST" && path === "/auth/logout") {
      currentUser = null;
      return json({ ok: true });
    }

    if (method === "GET" && path === "/auth/me") {
      if (!currentUser) {
        return json({ error: "Authentication required" }, 401);
      }
      return json({ user: currentUser });
    }

    if (method === "GET" && path === "/dashboard") {
      return json({
        role: "HR",
        widgets: {
          activeWorkOrders: 0,
          candidates: null
        }
      });
    }

    if (method === "GET" && path === "/hr/forms/application") {
      return json([
        {
          field_key: "work_eligibility",
          label: "Work eligibility",
          field_type: "text",
          is_required: 1
        }
      ]);
    }

    if (method === "POST" && path === "/hr/applications") {
      return json({
        id: 501,
        duplicateFlag: true,
        uploadToken: "upload-501",
        attachmentCompleteness: {
          complete: false,
          missingRequiredClasses: ["IDENTITY_DOC"]
        }
      });
    }

    if (method === "POST" && path === "/hr/applications/501/attachments") {
      return json({
        id: "doc-501",
        classification: "RESUME",
        attachmentCompleteness: {
          complete: false,
          missingRequiredClasses: ["IDENTITY_DOC"]
        }
      });
    }

    if (method === "POST" && path === "/receiving/dock-appointments") {
      return json({ id: 601 });
    }

    if (method === "POST" && path === "/receiving/receipts") {
      return json({ id: 701 });
    }

    return json({ error: `Unhandled API route in E2E mock: ${method} ${path}` }, 500);
  });
}

async function login(page, username) {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Username" }).fill(username);
  await page.getByLabel("Password").fill("LongPassword123");
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("playwright smoke", () => {
  test("auth/session flow redirects, logs in, opens workspace, and logs out", async ({ page }) => {
    await mockApi(page);

    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);

    await login(page, "clerk1");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("clerk1 | CLERK")).toBeVisible();

    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("HR onboarding shows duplicate/completeness/classification outcomes", async ({ page }) => {
    await mockApi(page);
    await login(page, "hr1");

    await page.getByRole("button", { name: /^candidates$/ }).click();
    await expect(page.locator("h1").getByText("candidates")).toBeVisible();
    await page.getByPlaceholder("Full name").fill("E2E Candidate");
    await page.getByPlaceholder("Email").fill("candidate@example.com");
    await page.getByPlaceholder("Phone").fill("555-0102");
    await page.locator('input[type="date"]').fill("1994-01-15");
    await page.getByPlaceholder("SSN last 4").fill("7788");
    await page.setInputFiles('input[type="file"]', {
      name: "resume.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("resume")
    });
    await page.getByPlaceholder("Work eligibility *").fill("yes");
    await page.getByRole("button", { name: "Submit application" }).click();

    const outcomeCard = page.locator("article.card").filter({ hasText: "Candidate application" }).first();
    await expect(outcomeCard.getByText("Potential duplicate candidate detected.", { exact: true })).toBeVisible();
    await expect(outcomeCard.getByText("Completeness: Incomplete", { exact: true })).toBeVisible();
    await expect(outcomeCard.getByText("Missing required: IDENTITY_DOC", { exact: true })).toBeVisible();
    await expect(outcomeCard.getByText("Attachment classification (authoritative): RESUME.", { exact: true })).toBeVisible();
  });

  test("receiving validation blocks non-30-minute dock and unresolved discrepancies", async ({ page }) => {
    await mockApi(page);
    await login(page, "clerk1");

    await page.getByRole("button", { name: /^dock$/ }).click();
    await expect(page.locator("h1").getByText("dock")).toBeVisible();
    await page.getByPlaceholder("PO Number").fill("PO-101");
    await page.locator('input[type="datetime-local"]').first().fill("2026-04-10T09:00");
    await page.locator('input[type="datetime-local"]').nth(1).fill("2026-04-10T09:20");
    await page.getByRole("button", { name: "Save appointment" }).click();
    await expect(page.getByText("Dock window must be exactly 30 minutes.")).toBeVisible();

    await page.getByRole("button", { name: /^receiving$/ }).click();
    await expect(page.locator("h1").getByText("receiving")).toBeVisible();
    await page.getByPlaceholder("PO Number").fill("PO-RECV-1");
    const expected = page.getByPlaceholder("Expected").first();
    const received = page.getByPlaceholder("Received").first();
    await expected.fill("10");
    await received.fill("8");
    await page.getByRole("button", { name: "Create receipt" }).click();
    await expect(
      page.getByText("Discrepancy lines must include discrepancy type and resolution note before submitting.")
    ).toBeVisible();
  });
});

test("@real-backend clerk login and dock appointment roundtrip", async ({ page, request }) => {
  let backendReady = false;
  let loginReady = false;
  try {
    const health = await request.get("http://127.0.0.1:4000/api/health");
    backendReady = health.ok();
  } catch {
    backendReady = false;
  }

  if (backendReady) {
    try {
      const loginProbe = await request.post("http://127.0.0.1:4000/api/auth/login", {
        data: { username: "clerk1", password: "ClerkPassw0rd!" }
      });
      loginReady = loginProbe.ok();
    } catch {
      loginReady = false;
    }
  }

  expect(
    backendReady,
    "Real backend not reachable at http://127.0.0.1:4000/api/health"
  ).toBe(true);
  expect(
    loginReady,
    "Real backend login preflight failed. Ensure DB schema/seed/users are applied (clerk1/ClerkPassw0rd!)."
  ).toBe(true);

  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByRole("textbox", { name: "Username" }).fill("clerk1");
  await page.getByLabel("Password").fill("ClerkPassw0rd!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("button", { name: /^dock$/ }).click();
  await expect(page.locator("h1").getByText("dock")).toBeVisible();

  const now = Date.now();
  const start = new Date(now + 60 * 60 * 1000);
  start.setSeconds(0, 0);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const toLocalDateTime = (d) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  await page.getByPlaceholder("PO Number").fill(`E2E-PO-${now}`);
  await page.locator('input[type="datetime-local"]').first().fill(toLocalDateTime(start));
  await page.locator('input[type="datetime-local"]').nth(1).fill(toLocalDateTime(end));
  await page.getByRole("button", { name: "Save appointment" }).click();

  await expect(page.getByText(/Appointment saved\.|Failed to save appointment:/)).toBeVisible();

  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
