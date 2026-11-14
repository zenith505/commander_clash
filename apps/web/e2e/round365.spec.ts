// Round 365: Archnemesis's "you may attach this Aura to that player" when Ana attacks you; Mirkwood Trapper's "that player
// chooses an attacking creature" for your own attack; and New Way Forward's source of your choice against Ana's attacking
// Hill Giant, then its reflexive trigger dealing the damage back.
import { expect, test } from "@playwright/test";
import { applyAction, invalidateCharacteristics, power } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { attack, card, controls, resolveUntil } from "./ui";

test("Archnemesis: Ana attacks you, and you move it from Ben to Ana", async ({ page }) => {
  const s0 = scene({ board: ["Archnemesis"] }, [{ board: ["Hill Giant"] }]);
  const [arch, giant] = [one(s0, "Archnemesis"), one(s0, "Hill Giant")];
  s0.objects[arch]!.attachedToPlayer = 2;
  invalidateCharacteristics(s0);
  let s = playUntil(s0, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 1);
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [{ attacker: giant, defender: 0 }] });
  s = playUntil(s, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Archnemesis");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.objects[arch]!.attachedToPlayer === 1 && st.stack.length === 0);
  expect(after.objects[arch]!.attachedToPlayer).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Mirkwood Trapper: you attack Ana, so you choose which attacker gets +2/+0", async ({ page }) => {
  const s = scene({ board: ["Mirkwood Trapper", "Hill Giant", "Gray Ogre"] });
  const [giant, ogre] = [one(s, "Hill Giant"), one(s, "Gray Ogre")];
  await open(page, playUntil(s, (st) => st.pending?.kind === "declareAttackers"));
  await attack(page, [[giant, 1], [ogre, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await page.locator(`[data-obj="${ogre}"]`).click();
  await controls(page).getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && power(st, st.objects[ogre]!) === 4);
  expect(power(after, after.objects[giant]!)).toBe(3);
  expect(pageErrors(page)).toEqual([]);
});

test("New Way Forward: choose Ana's attacking Hill Giant; its damage is prevented, Ana is dealt 3 and you draw 3", async ({ page }) => {
  const s0 = scene({ hand: ["New Way Forward"], board: LANDS }, [{ board: ["Hill Giant"] }]);
  const [giant, nwf] = [one(s0, "Hill Giant"), one(s0, "New Way Forward")];
  let s = playUntil(s0, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 1);
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [{ attacker: giant, defender: 0 }] });
  s = playUntil(s, (st) => st.pending?.kind === "declareBlockers" && st.pending.player === 0);
  s = applyAction(s, { type: "declareBlockers", player: 0, blocks: [] });
  s = playUntil(s, (st) => st.step === "declareBlockers" && !st.pending && st.priority === 0 && st.stack.length === 0);
  const hand = s.players[0]!.hand.length - 1;
  await open(page, s);
  await card(page, "New Way Forward", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("New Way Forward: choose a source of damage");
  await bar.getByRole("button", { name: "Hill Giant, Ana's" }).click();
  const after = await resolveUntil(page, (st) => st.players[1]!.life === 37 && st.stack.length === 0, 80);
  expect(after.objects[nwf]!.zone).toBe("graveyard");
  expect(after.players[0]!.life).toBe(40);
  expect(after.players[0]!.hand.length).toBe(hand + 3);
  expect(pageErrors(page)).toEqual([]);
});
