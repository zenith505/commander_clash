// Round 255: Squandered Resources (sacrifice a land, then choose which of the mana types that land could produce to add)
// and Hauntwoods Shrieker (reveal a face-down permanent, then choose whether to turn the creature card face up).
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, scene, state } from "./scene";
import { controls, menu, resolveUntil } from "./ui";

test("Squandered Resources: sacrifice Tundra, then choose Add {U} of the two types it could produce", async ({ page }) => {
  const s = scene({ board: ["Squandered Resources", "Tundra"] });
  const [squandered, tundra] = [one(s, "Squandered Resources"), idsOf(s, "Tundra", "battlefield", 0)[0]!];
  await open(page, s);
  await page.locator(`[data-obj="${squandered}"]`).click();
  await menu(page).getByRole("button", { name: /Sacrifice a land/ }).click();
  const bar = page.locator(".targeting", { hasText: "sacrifice a land" });
  await page.locator(`[data-obj="${tundra}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice and activate" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  const ctl = controls(page);
  await expect(ctl.getByRole("button", { name: "Add {W}" })).toBeVisible();
  await ctl.getByRole("button", { name: "Add {U}" }).click();
  await expect.poll(async () => (await state(page)).players[0]!.manaPool.U).toBe(1);
  const after = await state(page);
  expect([after.objects[tundra]!.zone, after.players[0]!.manaPool.W, after.pending]).toEqual(["graveyard", 0, null]);
  expect(pageErrors(page)).toEqual([]);
});

test("Hauntwoods Shrieker: reveal your face-down Grizzly Bears, then Yes turns it face up", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Hauntwoods Shrieker", "Grizzly Bears"] });
  const [shrieker, bears] = [one(s, "Hauntwoods Shrieker"), one(s, "Grizzly Bears")];
  s.objects[bears]!.faceDown = "manifest";
  invalidateCharacteristics(s);
  await open(page, s);
  await page.locator(`[data-obj="${shrieker}"]`).click();
  await menu(page).getByRole("button", { name: /Reveal target face-down permanent/ }).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await expect(page.locator(".log")).toContainText("it's Grizzly Bears");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[bears]!.faceDown).toBeFalsy();
  await expect(page.locator(`[data-obj="${bears}"]`)).toContainText("Grizzly Bears");
  expect(pageErrors(page)).toEqual([]);
});
