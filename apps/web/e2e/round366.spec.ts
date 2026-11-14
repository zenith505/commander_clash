// Round 366: Ria Ivor's beginning-of-combat target and its Mites; Breath of Fury's "attach ~ to a creature you control"
// choice after it sacrifices its creature; Flickerform's ability exiling its creature with its Auras, back at the end
// step; Yurlok of Scorch Thrash's mana for every player and its mana burn; and Panoptic Projektor's reduction for the next
// face-down spell.
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { attack, controls, menu, resolveUntil } from "./ui";

test("Ria Ivor: target your Hill Giant at the beginning of combat; its damage to Ana is prevented and makes Mites", async ({ page }) => {
  const s = scene({ board: ["Ria Ivor, Bane of Bladehold", "Hill Giant"] });
  const [ria, giant] = [one(s, "Ria Ivor, Bane of Bladehold"), one(s, "Hill Giant")];
  await open(page, playUntil(s, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0));
  await page.locator(`[data-obj="${giant}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers");
  await attack(page, [[ria, 1], [giant, 1]]);
  const after = await resolveUntil(page, (st) => st.step === "main2" || idsOf(st, "Phyrexian Mite Token", "battlefield").length === 4);
  expect(idsOf(after, "Phyrexian Mite Token", "battlefield").length).toBe(4);
  expect(after.players[1]!.life).toBe(37);
  expect(pageErrors(page)).toEqual([]);
});

test("Breath of Fury: Gray Ogre connects and is sacrificed; you choose Hill Giant for the Aura, then attack again", async ({ page }) => {
  const s0 = scene({ board: ["Hill Giant", "Gray Ogre", "Grizzly Bears", "Breath of Fury"] });
  const [giant, ogre, breath] = [one(s0, "Hill Giant"), one(s0, "Gray Ogre"), one(s0, "Breath of Fury")];
  s0.objects[breath]!.attachedTo = ogre;
  invalidateCharacteristics(s0);
  await open(page, playUntil(s0, (st) => st.pending?.kind === "declareAttackers"));
  await attack(page, [[ogre, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Breath of Fury");
  await bar.getByRole("button", { name: "Hill Giant", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.objects[breath]!.attachedTo === giant && st.stack.length === 0);
  expect(after.objects[ogre]!.zone).toBe("graveyard");
  // The additional combat: another declare attackers step this turn.
  const again = await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.turn === after.turn);
  expect(again.objects[breath]!.attachedTo).toBe(giant);
  expect(pageErrors(page)).toEqual([]);
});

test("Flickerform: exile Hill Giant with its Auras; at the end step it comes back with them attached", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Hill Giant", "Holy Strength", "Flickerform"] });
  const [giant, flicker, holy] = [one(s, "Hill Giant"), one(s, "Flickerform"), one(s, "Holy Strength")];
  s.objects[flicker]!.attachedTo = giant;
  s.objects[holy]!.attachedTo = giant;
  invalidateCharacteristics(s);
  await open(page, s);
  await page.locator(`[data-obj="${flicker}"]`).first().click({ position: { x: 6, y: 6 } });
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /Exile enchanted creature/ }).click();
  const mid = await resolveUntil(page, (st) => st.objects[giant]!.zone === "exile" && st.stack.length === 0);
  expect(mid.objects[flicker]!.zone).toBe("exile");
  expect(mid.objects[holy]!.zone).toBe("exile");
  const after = await resolveUntil(page, (st) => idsOf(st, "Hill Giant", "battlefield").length === 1 && idsOf(st, "Holy Strength", "battlefield").length === 1 && st.stack.length === 0, 80);
  const back = idsOf(after, "Hill Giant", "battlefield")[0]!;
  expect(after.objects[idsOf(after, "Holy Strength", "battlefield")[0]!]!.attachedTo).toBe(back);
  expect(after.objects[idsOf(after, "Flickerform", "battlefield")[0]!]!.attachedTo).toBe(back);
  expect(pageErrors(page)).toEqual([]);
});

test("Yurlok of Scorch Thrash: tap it for mana, every player adds {B}{R}{G}, and the unspent mana costs each of them 3 life", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Yurlok of Scorch Thrash"] });
  const yurlok = one(s, "Yurlok of Scorch Thrash");
  await open(page, s);
  await page.locator(`[data-obj="${yurlok}"]`).click();
  if (await menu(page).count()) await menu(page).getByRole("button").first().click();
  const mid = await resolveUntil(page, (st) => st.objects[yurlok]!.tapped && st.players.every((p) => p.manaPool.B === 1 && p.manaPool.R === 1 && p.manaPool.G === 1));
  expect(mid.players[0]!.manaPool.B).toBe(1);
  const after = await resolveUntil(page, (st) => st.step !== "main1");
  expect(after.players.map((p) => p.life)).toEqual([37, 37, 37, 37]);
  expect(pageErrors(page)).toEqual([]);
});

test("Panoptic Projektor: tap it, and the next face-down creature spell this turn costs {3} less", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Panoptic Projektor"] });
  const p = one(s, "Panoptic Projektor");
  await open(page, s);
  await page.locator(`[data-obj="${p}"]`).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /face-down/ }).click();
  const after = await resolveUntil(page, (st) => !!st.costModsThisTurn?.length && st.stack.length === 0);
  expect(after.objects[p]!.tapped).toBe(true);
  expect(after.costModsThisTurn![0]!.mod.n).toBe(-3);
  expect(pageErrors(page)).toEqual([]);
});
