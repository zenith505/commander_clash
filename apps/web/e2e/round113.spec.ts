// Round 113's prompts: Archangel of Tithes' block tax ("Block with 1 (pay {1})", paid from your lands as you declare,
// CR 509.1d-f); Sepulchral Primordial's "for each opponent, up to one target creature card from that player's
// graveyard" (one slot per opponent, CR 601.2c); Brudiclad's "you may choose a token you control" (each other token
// becomes a copy of it, CR 707.2).
import { expect, test } from "@playwright/test";
import { applyAction, characteristics, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Archangel of Tithes attacks you: blocking with Giant Spider costs {1}, paid as you declare", async ({ page }) => {
  let s: GameState = scene({ board: ["Giant Spider", "Plains"] }, [{ board: ["Archangel of Tithes"] }]);
  const [spider, angel, plains] = [one(s, "Giant Spider"), one(s, "Archangel of Tithes"), idsOf(s, "Plains", "battlefield", 0)[0]!];
  // Ana's turn, in the engine: she attacks you with the Archangel.
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 1);
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [{ attacker: angel, defender: 0 }] });
  s = playUntil(s, (st) => st.pending?.kind === "declareBlockers" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await page.locator(`[data-obj="${spider}"]`).first().click();
  await page.locator(`[data-obj="${angel}"]`).first().click();
  await expect(bar.getByRole("button", { name: "Block with 1 (pay {1})" })).toBeEnabled();
  await bar.getByRole("button", { name: "Block with 1 (pay {1})" }).click();
  const after = await resolveUntil(page, (st) => st.pending?.kind !== "declareBlockers" && st.objects[spider]!.blocking !== undefined);
  expect(after.objects[plains]!.tapped).toBe(true);
  expect(after.log.some((l) => /pays \{1\} to block/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Sepulchral Primordial: Ana's Hill Giant and Cy's Grizzly Bears come back under your control", async ({ page }) => {
  const s = scene({ hand: ["Sepulchral Primordial"], board: LANDS }, [{ yard: ["Hill Giant", "Llanowar Elves"] }, {}, { yard: ["Grizzly Bears"] }]);
  const [primordial, giant, elves, bears] = [one(s, "Sepulchral Primordial"), one(s, "Hill Giant"), one(s, "Llanowar Elves"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Sepulchral Primordial", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await modal(page).locator(`[data-pick="${giant}"]`).click();
  await modal(page).locator(`[data-pick="${bears}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  // Asked about each card (round 114).
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0 && st.pending.card === giant);
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0 && st.pending.card === bears);
  await controls(page).getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[primordial]!.zone).toBe("battlefield");
  expect(after.objects[giant]!.controller).toBe(0);
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(after.objects[bears]!.controller).toBe(0);
  expect(after.objects[elves]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Brudiclad: at the beginning of combat, choose your Treasure and each other token becomes a Treasure", async ({ page }) => {
  const s = scene({ board: ["Brudiclad, Telchor Engineer"], tokens: ["Treasure", "Clue"] });
  const token = (sub: string) => s.battlefield.find((id) => s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]!.subtypes.includes(sub))!;
  const [treasure, clue] = [token("Treasure"), token("Clue")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Brudiclad");
  await bar.getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await page.locator(`[data-obj="${treasure}"]`).first().click();
  await bar.getByRole("button", { name: /^(Choose|Done|OK)/ }).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.step !== "main1");
  const myr = after.battlefield.filter((id) => after.objects[id]!.isToken && after.objects[id]!.controller === 0 && id !== treasure && id !== clue);
  expect(myr).toHaveLength(1);
  for (const id of [clue, ...myr, treasure]) expect(characteristics(after, after.objects[id]!).name).toBe("Treasure Token");
  expect(pageErrors(page)).toEqual([]);
});
