import { expect, test, type Page } from "@playwright/test";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  verifyEvent,
} from "nostr-tools/pure";

const channelId = "6ba7e589-c295-47d9-a8e2-7aa50be0d49a";

async function installRelay(
  page: Page,
  mode: "owner" | "denied" | "stale" | "missing",
) {
  const browserKey = generateSecretKey();
  const browserPubkey = getPublicKey(browserKey);
  const relayKey = generateSecretKey();
  let visibility = "open";
  let writes = 0;
  let verificationReads = 0;
  await page.addInitScript((key) => {
    // Seed a test identity only once so reload exercises persistent ownership.
    if (!localStorage.getItem("buzz:nip07-fallback-secret-key")) {
      localStorage.setItem("buzz:nip07-fallback-secret-key", key);
    }
    localStorage.setItem(
      "buzz:web-settings",
      JSON.stringify({ language: "en", defaultVisibility: "private" }),
    );
  }, Buffer.from(browserKey).toString("hex"));

  // All WebSockets are intercepted. These tests cannot mutate a live relay.
  await page.routeWebSocket(/.*/, (socket) => {
    socket.send(JSON.stringify(["AUTH", "channel-privacy-test"]));
    socket.onMessage((raw) => {
      const [type, id, filter] = JSON.parse(String(raw));
      if (type === "AUTH" || type === "EVENT") {
        expect(verifyEvent(id)).toBe(true);
        expect(id.pubkey).toBe(browserPubkey);
        if (type === "AUTH") {
          socket.send(JSON.stringify(["OK", id.id, true, ""]));
          return;
        }
        expect(id.kind).toBe(9002);
        expect(id.tags).toContainEqual(["h", channelId]);
        writes += 1;
        if (mode === "owner") {
          visibility = id.tags.find(
            (tag: string[]) => tag[0] === "visibility",
          )[1];
        }
        socket.send(
          JSON.stringify([
            "OK",
            id.id,
            mode !== "denied",
            mode === "denied"
              ? "actor not authorized for name/about/archived/visibility/ttl changes"
              : "",
          ]),
        );
        return;
      }
      if (type !== "REQ") return;
      if (filter.kinds.includes(39000)) {
        const targeted = filter["#d"]?.includes(channelId);
        if (targeted) verificationReads += 1;
        if (!(mode === "missing" && targeted)) {
          const event = finalizeEvent(
            {
              kind: 39000,
              created_at: Math.floor(Date.now() / 1000),
              content: "",
              tags: [
                ["d", channelId],
                ["name", "privacy-smoke"],
                ["about", "privacy smoke"],
                [visibility === "private" ? "private" : "public"],
              ],
            },
            relayKey,
          );
          socket.send(JSON.stringify(["EVENT", id, event]));
        }
      }
      socket.send(JSON.stringify(["EOSE", id]));
    });
  });
  return {
    pubkey: browserPubkey,
    writes: () => writes,
    reads: () => verificationReads,
  };
}

test("account dialog shows the authenticated public identity without publishing", async ({
  page,
}) => {
  const relay = await installRelay(page, "owner");
  await openChannel(page);
  await page
    .getByRole("button", { name: "Current browser account", exact: true })
    .click();
  await expect(page.getByTestId("browser-public-key")).toHaveText(relay.pubkey);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Current browser account", exact: true })
    .click();
  await expect(page.getByTestId("browser-public-key")).toHaveText(relay.pubkey);
  expect(relay.writes()).toBe(0);
});

async function openChannel(page: Page) {
  await page.goto("/channels");
  await page
    .getByRole("button", { name: "privacy-smoke", exact: true })
    .click();
  await expect(page.locator("header")).toContainText("privacy-smoke");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
}

test("owner can change Open to Private, reload, and change back", async ({
  page,
}) => {
  const relay = await installRelay(page, "owner");
  await openChannel(page);
  await page
    .getByRole("button", { name: "Private", exact: true })
    .first()
    .click();
  await expect(page.locator("header")).toContainText("Private");
  await expect(page.getByText("Channel saved.", { exact: true })).toBeVisible();
  expect(relay.reads()).toBeGreaterThan(0);
  await page.reload();
  await page
    .getByRole("button", { name: "privacy-smoke", exact: true })
    .click();
  await expect(page.locator("header")).toContainText("Private");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Open", exact: true }).first().click();
  await expect(page.locator("header")).toContainText("Open");
  expect(relay.writes()).toBe(2);
});

test("different browser identity cannot change visibility and sees a persistent reason", async ({
  page,
}) => {
  const relay = await installRelay(page, "denied");
  await openChannel(page);
  await page
    .getByRole("button", { name: "Private", exact: true })
    .first()
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "not a channel owner or administrator",
  );
  await expect(page.locator("header")).toContainText("Open");
  await expect(page.getByText("Channel saved.", { exact: true })).toHaveCount(
    0,
  );
  expect(relay.writes()).toBe(1);
  expect(relay.reads()).toBe(0);
  await page.screenshot({ path: "test-results/channel-permission-denied.png" });
});

for (const mode of ["stale", "missing"] as const) {
  test(`relay ACK with ${mode} metadata must not report a saved Private channel`, async ({
    page,
  }) => {
    const relay = await installRelay(page, mode);
    await openChannel(page);
    await page
      .getByRole("button", { name: "Private", exact: true })
      .first()
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "save is not confirmed",
    );
    await expect(page.locator("header")).toContainText("Open");
    await expect(page.getByText("Channel saved.", { exact: true })).toHaveCount(
      0,
    );
    expect(relay.reads()).toBe(5);
  });
}
