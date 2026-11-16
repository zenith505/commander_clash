// Round 393 in the browser: Stardew Valley's third ability (you choose the other player, who may take the permanent),
// Daring Thief's two targets for its inspired exchange (Sol Ring and an opponent's artifact land), and Arbiter of the
// Ideal's offer of the revealed card.
import { expect, test } from "@playwright/test";
import { controllerOf } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Stardew Valley: you choose Grizzly Bears, draw a card, choose the next player, and that bot takes the Bears", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Stardew Valley", "Grizzly Bears"] });
  const [valley, bears] = [one(s, "Stardew Valley"), one(s, "Grizzly Bears")];
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await page.locator(`[data-obj="${valley}"]`).first().click();
  await menu(page).locator("button", { hasText: "Choose target permanent you control" }).click();
  await expect(page.locator(".targeting")).toContainText("target permanent you control");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "opponent" && st.pending.player === 0);
  expect(asked.players[0]!.hand.length).toBe(hand + 1);
  const bar = controls(page);
  await expect(bar).toContainText("choose an opponent");
  await bar.getByRole("button", { name: asked.players[1]!.name, exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && controllerOf(st, st.objects[bears]!) !== 0);
  expect(controllerOf(after, after.objects[bears]!)).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Daring Thief: untapped by Burst of Energy, you target Sol Ring and the next player's Darksteel Citadel and exchange them", async ({ page }) => {
  const s = scene({ hand: ["Burst of Energy"], board: [...LANDS, "Daring Thief", "Sol Ring"] }, [{ board: ["Darksteel Citadel", "Grizzly Bears"] }]);
  const [thief, ring, citadel] = [one(s, "Daring Thief"), one(s, "Sol Ring"), one(s, "Darksteel Citadel")];
  s.objects[thief]!.tapped = true;
  await open(page, s);
  await card(page, "Burst of Energy", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  await expect(page.locator(".targeting")).toBeVisible();
  await page.locator(`[data-obj="${thief}"]`).first().click();
  // The inspired trigger's targets.
  const t = await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0 && st.pending.sourceId === thief);
  expect(t.objects[thief]!.tapped).toBe(false);
  await expect(page.locator(".targeting")).toContainText("target nonland permanent you control");
  await page.locator(`[data-obj="${ring}"]`).first().click();
  await page.locator(`[data-obj="${citadel}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && controllerOf(st, st.objects[ring]!) !== 0);
  expect(controllerOf(after, after.objects[ring]!)).toBe(1);
  expect(controllerOf(after, after.objects[citadel]!)).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Arbiter of the Ideal: untapped, it reveals Memnite and you put it onto the battlefield as an enchantment with a manifestation counter", async ({ page }) => {
  const s = scene({ hand: ["Burst of Energy"], board: [...LANDS, "Arbiter of the Ideal"], library: ["Memnite", "Forest"] });
  const [arbiter, memnite] = [one(s, "Arbiter of the Ideal"), one(s, "Memnite")];
  s.objects[arbiter]!.tapped = true;
  await open(page, s);
  await card(page, "Burst of Energy", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  await expect(page.locator(".targeting")).toBeVisible();
  await page.locator(`[data-obj="${arbiter}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0 && st.pending.source === "Arbiter of the Ideal");
  const bar = controls(page);
  await expect(bar).toContainText("Memnite");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[memnite]!.zone === "battlefield");
  expect(after.objects[memnite]!.counters.manifestation).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
