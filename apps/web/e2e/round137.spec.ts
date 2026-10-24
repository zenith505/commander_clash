// Round 137's prompts: choosing X as a face-down card with an {X} disguise cost is turned face up (Aurelia's
// Vindicator), Another Round's "exile and return" pick, and Victory Chimes' {C} for another player.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Aurelia's Vindicator: Turn face up asks for X, then up to X targets: X = 1 exiles Ana's Hill Giant only", async ({ page }) => {
  let s: GameState = scene({ hand: ["Aurelia's Vindicator"], board: LANDS }, [{ board: ["Hill Giant", "Goblin Piker"] }]);
  const [v, giant, piker] = [one(s, "Aurelia's Vindicator"), one(s, "Hill Giant"), one(s, "Goblin Piker")];
  // In the engine: cast face down for {3}.
  for (const a of planCast(s, 0, v, undefined, undefined, "auto", undefined, { faceDown: true })!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.objects[v]!.zone === "battlefield" && st.stack.length === 0 && !st.pending && st.priority === 0);
  await open(page, s);
  await page.locator(`[data-obj="${v}"]`).first().click();
  await menu(page).getByRole("button", { name: /Turn face up: disguise/ }).click();
  const x = page.locator(".x-pick");
  // Twelve lands left: {X}{3}{W} with X up to 8.
  await expect(x).toContainText("Turn face up (disguise)");
  await expect(x).toContainText("choose X (up to 8 with your mana)");
  await x.getByLabel("X", { exact: true }).fill("1");
  await x.getByRole("button", { name: "X = 1" }).click();
  // Up to one target: the first click is all of them.
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets");
  await page.locator(`[data-obj="${giant}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "exile");
  expect(after.objects[v]!.faceDown).toBeFalsy();
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped).length).toBe(3 + 5);
  expect(after.objects[piker]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Another Round with X = 1: pick creatures to exile and return, twice", async ({ page }) => {
  const s = scene({ hand: ["Another Round"], board: [...LANDS, "Grizzly Bears", "Hill Giant"] });
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Another Round", s).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("1");
  await x.getByRole("button", { name: "X = 1" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents");
  const bar = controls(page);
  await expect(bar).toContainText("Another Round: click any number of creatures of yours to exile and return.");
  await expect(bar.getByRole("button", { name: "Exile none" })).toBeVisible();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await bar.getByRole("button", { name: "Exile and return 2" }).click();
  // The process again: the Bears only.
  const again = await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents");
  expect(again.log.some((l) => /repeats the process/.test(l.text))).toBe(true);
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await bar.getByRole("button", { name: "Exile and return 1" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect([after.objects[bears]!.zone, after.objects[giant]!.zone]).toEqual(["battlefield", "battlefield"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Victory Chimes: its menu offers {C} to each other player; Ana adds it", async ({ page }) => {
  const s = scene({ board: ["Victory Chimes"] });
  const chimes = one(s, "Victory Chimes");
  await open(page, s);
  await page.locator(`[data-obj="${chimes}"]`).first().click();
  await expect(menu(page).locator("[data-mana-to]")).toHaveCount(3);
  await menu(page).locator('[data-mana-to="1"]').click();
  const after = await state(page);
  expect(after.players[1]!.manaPool.C).toBe(1);
  expect(after.players[0]!.manaPool.C).toBe(0);
  expect(after.objects[chimes]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
