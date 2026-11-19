// Lane B round B266 in the browser: Mirror-Shield Hoplite's copy of a backup ability aimed at another creature of yours,
// Defensive Formation letting you choose the creature an attacking Cunning Giant damages, and Power Pack's free cast of
// the instant it exiled, at your next upkeep.
import { expect, test } from "@playwright/test";
import { applyAction, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, clickPlayer, controls, resolveUntil } from "./ui";

test("Mirror-Shield Hoplite: Fearless Skald's backup on your Grizzly Bears is copied, and the copy targets your Hill Giant", async ({ page }) => {
  const s = scene({ hand: ["Fearless Skald"], board: [...LANDS, "Mirror-Shield Hoplite", "Grizzly Bears", "Hill Giant"] });
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Fearless Skald", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "copyTargets" && st.pending.player === 0);
  await page.locator(`[data-obj="${giant}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.counters["+1/+1"] === 1 && st.objects[giant]!.counters["+1/+1"] === 1);
  expect(after.objects[one(s, "Fearless Skald")]!.counters["+1/+1"] ?? 0).toBe(0);
  await expect(page.locator(`[data-obj="${giant}"]`).first()).toContainText("4/4");
  await expect(page.locator(`[data-obj="${bears}"]`).first()).toContainText("3/3");
  expect(pageErrors(page)).toEqual([]);
});

test("Defensive Formation: Ana's Cunning Giant attacks you unblocked; you choose that your Grizzly Bears takes its damage", async ({ page }) => {
  let s: GameState = scene({ board: ["Defensive Formation", "Grizzly Bears"] }, [{ board: ["Cunning Giant"] }]);
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Cunning Giant")];
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 1);
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [{ attacker: giant, defender: 0 }] });
  s = playUntil(s, (st) => st.pending?.kind === "pickPermanents" && st.pending.action === "damageCreature");
  expect(s.pending).toMatchObject({ kind: "pickPermanents", player: 0, options: [bears] });
  const life = s.players[0]!.life;
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Cunning Giant is unblocked");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await bar.getByRole("button", { name: "Damage that creature" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[bears]!.zone === "graveyard");
  expect(after.players[0]!.life).toBe(life);
  expect(pageErrors(page)).toEqual([]);
});

test("Power Pack: the Lightning Bolt it exiled after hitting Ana is cast for free at your next upkeep, then exiled", async ({ page }) => {
  let s: GameState = scene({ board: ["Power Pack"], yard: ["Lightning Bolt"] }, [{}]);
  const [pack, bolt] = [one(s, "Power Pack"), one(s, "Lightning Bolt")];
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: pack, defender: 1 }] });
  s = playUntil(s, (st) => st.objects[bolt]!.zone === "exile" && st.stack.length === 0);
  s = playUntil(s, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  expect(s.step).toBe("upkeep");
  const life = s.players[1]!.life;
  await open(page, s);
  await expect(controls(page)).toContainText("cast Lightning Bolt without paying its mana cost?");
  await controls(page).getByRole("button", { name: "Cast it" }).click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life === life - 3);
  expect(after.objects[bolt]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});
