// Lane B round B259 in the browser: Benthic Explorers' cost (click a tapped land an opponent controls, then Untap and
// activate, then the type of mana), and Hollow Warrior's costs to attack and to block (click another untapped creature of
// yours, then Tap 1). Divine Intervention's draw ends the game with "It's a draw."
import { expect, test } from "@playwright/test";
import { applyAction, type GameState } from "@cc/engine";
import { one, open, pageErrors, playUntil, scene, state } from "./scene";
import { attack, controls, menu, passTo, resolveUntil } from "./ui";

test("Benthic Explorers: click Ana's tapped Underground Sea, untap it, and add {B}", async ({ page }) => {
  const s = scene({ board: ["Benthic Explorers"] }, [{ board: ["Underground Sea"] }]);
  const [ben, sea] = [one(s, "Benthic Explorers"), one(s, "Underground Sea")];
  s.objects[sea]!.tapped = true;
  await open(page, s);
  await page.locator(`[data-obj="${ben}"]`).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /Untap a tapped land an opponent controls/ }).click();
  const pick = page.locator(".targeting", { hasText: "untap a tapped land an opponent controls" });
  await expect(pick).toHaveCount(1);
  await expect(pick.getByRole("button", { name: "Untap and activate" })).toBeDisabled();
  await page.locator(`[data-obj="${sea}"]`).first().click();
  await pick.getByRole("button", { name: "Untap and activate" }).click();
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Add {U}" })).toBeVisible();
  await bar.getByRole("button", { name: "Add {B}" }).click();
  let after: GameState = s;
  await expect.poll(async () => (after = await state(page)).players[0]!.manaPool.B).toBe(1);
  expect(after.objects[sea]!.tapped).toBe(false);
  expect(after.objects[ben]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Hollow Warrior: attack Ana with it, then click Grizzly Bears to tap for its cost", async ({ page }) => {
  const s0 = scene({ board: ["Hollow Warrior", "Grizzly Bears"] });
  const [hw, bears] = [one(s0, "Hollow Warrior"), one(s0, "Grizzly Bears")];
  const life = s0.players[1]!.life;
  await open(page, playUntil(s0, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0));
  await attack(page, [[hw, 1]]);
  const bar = controls(page);
  await expect(bar).toContainText("to attack with it, tap an untapped creature you control not declared as an attacking or blocking creature this combat");
  await expect(bar.getByRole("button", { name: "Tap 1" })).toHaveCount(0);
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await bar.getByRole("button", { name: "Tap 1" }).click();
  await passTo(page, "main2");
  const after = await state(page);
  expect(after.objects[bears]!.tapped).toBe(true);
  expect(after.players[1]!.life).toBe(life - 4);
  expect(pageErrors(page)).toEqual([]);
});

test("Hollow Warrior: block Ana's Hill Giant with it, then click Grizzly Bears to tap for its cost", async ({ page }) => {
  let s = scene({ board: ["Hollow Warrior", "Grizzly Bears"] }, [{ board: ["Hill Giant"] }]);
  const [hw, bears, giant] = [one(s, "Hollow Warrior"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 1);
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [{ attacker: giant, defender: 0 }] });
  s = playUntil(s, (st) => st.pending?.kind === "declareBlockers" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await page.locator(`[data-obj="${hw}"]`).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await bar.getByRole("button", { name: "Block with 1" }).click();
  await expect(bar).toContainText("to block with it, tap an untapped creature you control not declared as an attacking or blocking creature this combat");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await bar.getByRole("button", { name: "Tap 1" }).click();
  let after: GameState = s;
  await expect.poll(async () => (after = await state(page)).objects[hw]!.blocking?.[0]).toBe(giant);
  expect(after.objects[bears]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Divine Intervention: the last intervention counter comes off in your upkeep, and it's a draw", async ({ page }) => {
  const s = scene({ board: ["Divine Intervention"] });
  const di = one(s, "Divine Intervention");
  s.objects[di]!.counters = { intervention: 1 };
  await open(page, s);
  const after = await resolveUntil(page, (st) => st.over, 200);
  expect(after.winner).toBeNull();
  await expect(page.getByRole("heading", { name: "It's a draw." })).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});
