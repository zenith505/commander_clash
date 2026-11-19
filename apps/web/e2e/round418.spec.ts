// Round 418 in the browser: Surge to Victory's copy of the card it exiled, cast for free when a creature you control deals
// combat damage to a player this turn; Gale, Waterdeep Prodigy's target of the other type in your graveyard, cast paying
// for it; Zethi, Arcane Blademaster kicked twice, then attacking with copies of the exiled instants to cast.
import { expect, test } from "@playwright/test";
import { applyAction, planCast } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { attack, card, clickPlayer, controls, modal, passTo, resolveUntil } from "./ui";

test("Surge to Victory: exile Divination; Grizzly Bears hits Ana, and a copy of Divination is cast for free", async ({ page }) => {
  const s0 = scene({ hand: ["Surge to Victory"], board: [...LANDS, "Grizzly Bears"], yard: ["Divination", "Hill Giant"] });
  const [div, bears] = [one(s0, "Divination"), one(s0, "Grizzly Bears")];
  // Cast in the engine on Divination, then the page opens with it resolved.
  let s = s0;
  for (const a of planCast(s, 0, one(s, "Surge to Victory"), [{ kind: "object", id: div }])!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.stack.length === 0 && !st.pending);
  expect(s.objects[div]!.zone).toBe("exile");
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[bears, 1]]);
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  // Bears got +3/+0 for Divination's mana value.
  expect(asked.players[1]!.life).toBe(35);
  const hand = asked.players[0]!.hand.length;
  const bar = controls(page);
  await expect(bar).toContainText("Surge to Victory");
  await expect(bar).toContainText("Divination");
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.hand.length === hand + 2);
  expect(after.objects[div]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

test("Gale, Waterdeep Prodigy: Giant Growth from your hand, then Divination (not Lightning Bolt) cast from your graveyard, exiled after", async ({ page }) => {
  const s = scene({ hand: ["Giant Growth"], board: [...LANDS, "Gale, Waterdeep Prodigy"], yard: ["Divination", "Lightning Bolt"] });
  const [gale, div, bolt] = [one(s, "Gale, Waterdeep Prodigy"), one(s, "Divination"), one(s, "Lightning Bolt")];
  await open(page, s);
  await card(page, "Giant Growth", s).click();
  await page.locator(`[data-obj="${gale}"]`).click();
  // Gale's trigger: the graveyard picker offers the sorcery card only (the other type than an instant).
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${bolt}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${div}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Gale, Waterdeep Prodigy: cast Divination from your graveyard for");
  await expect(bar).toContainText("If it would go to your graveyard, it's exiled instead.");
  await expect(bar).not.toContainText("you can't cast other spells this turn");
  const hand = (await resolveUntil(page, (st) => st.pending?.kind === "castFree")).players[0]!.hand.length;
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[div]!.zone === "exile");
  expect(after.players[0]!.hand.length).toBe(hand + 2);
  expect(after.objects[bolt]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Zethi, Arcane Blademaster: kicked twice, Lightning Bolt and Shock exiled with kick counters", async ({ page }) => {
  const s = scene({ hand: ["Zethi, Arcane Blademaster"], board: LANDS, yard: ["Lightning Bolt", "Shock", "Divination"] });
  const [bolt, shock, div] = [one(s, "Lightning Bolt"), one(s, "Shock"), one(s, "Divination")];
  await open(page, s);
  await card(page, "Zethi, Arcane Blademaster", s).click();
  await page.getByRole("button", { name: "Kick one more time" }).click();
  await page.getByRole("button", { name: "Kick one more time" }).click();
  await page.getByRole("button", { name: "Kick 2 times" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  let pick = modal(page);
  await expect(pick.locator(`[data-pick="${div}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${bolt}"]`).click();
  pick = modal(page);
  await pick.locator(`[data-pick="${shock}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "exile" && st.objects[shock]!.zone === "exile");
  expect([after.objects[bolt]!.counters.kick, after.objects[shock]!.counters.kick]).toEqual([1, 1]);
  expect(after.objects[div]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Zethi, Arcane Blademaster attacks: a copy of the exiled Lightning Bolt cast at Ana, paying {R}", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Zethi, Arcane Blademaster"], exile: ["Lightning Bolt"] });
  const [zethi, bolt] = [one(s, "Zethi, Arcane Blademaster"), one(s, "Lightning Bolt")];
  s.objects[bolt]!.counters.kick = 1;
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[zethi, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && st.pending.player === 0);
  const bar = controls(page);
  await bar.getByRole("button", { name: "Lightning Bolt" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  await expect(bar).toContainText("cast Lightning Bolt from exile for");
  await bar.getByRole("button", { name: "Cast it" }).click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life <= 37);
  expect(after.log.some((e) => /^Lightning Bolt deals 3 damage to Ana/.test(e.text))).toBe(true);
  expect(after.objects[bolt]!.zone).toBe("exile");
  expect(after.objects[bolt]!.counters.kick).toBe(1);
  // Paid for: one land tapped.
  expect(after.battlefield.filter((id) => after.objects[id]!.controller === 0 && after.objects[id]!.tapped && id !== zethi).length).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
