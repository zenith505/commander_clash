// Lane B round B136 in the browser: Fasting's "you may skip that step instead" as your draw step would begin (CR 614.10),
// Heat Wave's life on the Block button (CR 509.1d), Liquid Fire's number chosen as an additional cost (CR 601.2b),
// Grifter's Blade's creature to enter attached to (CR 614.12), and Stromgald Spy's "you may have defending player play
// with their hand revealed".
import { expect, test } from "@playwright/test";
import { applyAction, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { attack, card, controls, resolveUntil } from "./ui";

test("Fasting: skip your draw step and gain 2 life", async ({ page }) => {
  let s: GameState = scene({ board: ["Fasting"] });
  s = playUntil(s, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0 && !!st.pending.skipDraw);
  const hand = s.players[0]!.hand.length;
  const life = s.players[0]!.life;
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Fasting: Skip your draw step and gain 2 life?");
  await bar.getByRole("button", { name: "Yes", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.step === "main1" && st.activePlayer === 0 && !st.pending);
  expect(after.players[0]!.hand.length).toBe(hand);
  expect(after.players[0]!.life).toBe(life + 2);
  expect(after.objects[one(s, "Fasting")]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Fasting: No draws the card, and drawing destroys Fasting", async ({ page }) => {
  let s: GameState = scene({ board: ["Fasting"] });
  s = playUntil(s, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0 && !!st.pending.skipDraw);
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await controls(page).getByRole("button", { name: "No", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.step === "main1" && st.activePlayer === 0 && !st.pending && st.stack.length === 0 && st.objects[one(s, "Fasting")]!.zone === "graveyard");
  expect(after.players[0]!.hand.length).toBe(hand + 1);
  expect(pageErrors(page)).toEqual([]);
});

test("Heat Wave: blocking Ana's Hill Giant with Grizzly Bears costs 1 life, on the Block button", async ({ page }) => {
  // Ana pays Heat Wave's cumulative upkeep {R} with her Mountain.
  let s: GameState = scene({ board: ["Grizzly Bears"] }, [{ board: ["Heat Wave", "Hill Giant", "Mountain"] }]);
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 1);
  expect(s.objects[one(s, "Heat Wave")]!.zone).toBe("battlefield");
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [{ attacker: giant, defender: 0 }] });
  s = playUntil(s, (st) => st.pending?.kind === "declareBlockers" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await bar.getByRole("button", { name: "Block with 1 (pay 1 life)" }).click();
  const after = await resolveUntil(page, (st) => st.pending?.kind !== "declareBlockers" && st.objects[bears]!.blocking !== undefined);
  expect(after.objects[bears]!.blocking).toEqual([giant]);
  expect(after.players[0]!.life).toBe(39);
  expect(pageErrors(page)).toEqual([]);
});

test("Liquid Fire: choose 3 as you cast it; Ana's Hill Giant dies and Ana loses 2 life", async ({ page }) => {
  const s = scene({ hand: ["Liquid Fire"], board: LANDS }, [{ board: ["Hill Giant"] }]);
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Liquid Fire", s).click();
  await expect(page.locator(".targeting")).toContainText("Liquid Fire: as an additional cost, choose a number");
  await page.locator('.targeting [data-number="3"]').click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Liquid Fire")]!.zone === "graveyard");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.players[1]!.life).toBe(38);
  expect(pageErrors(page)).toEqual([]);
});

test("Grifter's Blade: pick which of your two creatures it enters attached to", async ({ page }) => {
  const s = scene({ hand: ["Grifter's Blade"], board: ["Grizzly Bears", "Hill Giant", ...LANDS] });
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Grifter's Blade", s).click();
  const st = await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "attachHost");
  expect(st.pending?.kind === "chooseOption" && st.pending.options.sort()).toEqual([bears, giant].sort());
  const bar = controls(page);
  await expect(bar).toContainText("choose a creature you control for it to enter attached to");
  await bar.getByRole("button", { name: "Hill Giant" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[one(s, "Grifter's Blade")]!.zone === "battlefield");
  expect(after.objects[one(s, "Grifter's Blade")]!.attachedTo).toBe(giant);
  expect(pageErrors(page)).toEqual([]);
});

test("Stromgald Spy: unblocked, Yes reveals Ana's hand and the Spy deals no combat damage", async ({ page }) => {
  const s = scene({ board: ["Stromgald Spy"] }, [{ hand: ["Shock"] }]);
  const spy = idsOf(s, "Stromgald Spy", "battlefield", 0)[0]!;
  await open(page, s);
  await resolveUntil(page, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === 0);
  await attack(page, [[spy, 1]]);
  await resolveUntil(page, (x) => x.pending?.kind === "chooseMay" && x.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Stromgald Spy:");
  await bar.getByRole("button", { name: "Yes", exact: true }).click();
  const after = await resolveUntil(page, (x) => x.step === "main2" && x.activePlayer === 0 && !x.pending && x.stack.length === 0);
  expect(after.players[1]!.life).toBe(40);
  expect(after.players[1]!.handRevealedWhile?.length).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
