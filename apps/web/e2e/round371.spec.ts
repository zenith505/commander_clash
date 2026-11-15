// Round 371: Kindle the Inner Flame's flashback cost "Behold three Elementals", picked from your battlefield and hand in
// one picker; Fear of Infinity's "you may return this card from your graveyard to your hand" when an enchantment you
// control enters; and Forum Filibuster's reflexive target, an Aura in your graveyard returned attached to the new Inkling.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Kindle the Inner Flame: flashback from the graveyard beholding Air Elemental, Fire Elemental and Water Elemental from your hand, copying Gray Ogre", async ({ page }) => {
  const s = scene({ hand: ["Water Elemental"], board: [...LANDS, "Air Elemental", "Fire Elemental", "Gray Ogre"], yard: ["Kindle the Inner Flame"] });
  const [kindle, air, fire, water, ogre] = [one(s, "Kindle the Inner Flame"), one(s, "Air Elemental"), one(s, "Fire Elemental"), one(s, "Water Elemental"), one(s, "Gray Ogre")];
  await open(page, s);
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Kindle the Inner Flame" }).click();
  await menu(page).getByRole("button", { name: /^Flashback.*behold three Elementals/ }).click();
  // The target first (CR 601.2c), then the cost (601.2h).
  await page.locator(`[data-obj="${ogre}"]`).click();
  const pick = modal(page);
  await expect(pick).toContainText("behold three Elementals (Elementals you control or Elemental cards from your hand)");
  // Elementals on the battlefield and in your hand; not the Ogre.
  await expect(pick.locator(`[data-pick="${ogre}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${air}"]`).click();
  await pick.locator(`[data-pick="${fire}"]`).click();
  await pick.locator(`[data-pick="${water}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[kindle]!.zone === "exile");
  const tokens = Object.values(after.objects).filter((o) => o.isToken && o.zone === "battlefield" && after.cards[o.cardId]?.name === "Gray Ogre");
  expect(tokens).toHaveLength(1);
  // Beheld, not moved.
  expect(after.objects[water]!.zone).toBe("hand");
  expect(after.objects[air]!.zone).toBe("battlefield");
  expect(after.log.some((l) => /beholds Water Elemental from their hand/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Fear of Infinity: Glorious Anthem enters under your control, and you return Fear of Infinity from your graveyard to your hand", async ({ page }) => {
  const s = scene({ hand: ["Glorious Anthem"], board: LANDS, yard: ["Fear of Infinity"] });
  const fear = one(s, "Fear of Infinity");
  await open(page, s);
  await card(page, "Glorious Anthem", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Fear of Infinity");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[fear]!.zone === "hand");
  expect(after.objects[fear]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Forum Filibuster: at your upkeep an Inkling, then Holy Strength from your graveyard returns attached to it", async ({ page }) => {
  const s0 = scene({ board: ["Forum Filibuster"], yard: ["Holy Strength", "Bonesplitter"] });
  const [strength, splitter] = [one(s0, "Holy Strength"), one(s0, "Bonesplitter")];
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  const ink = Object.values(s.objects).find((o) => o.isToken && o.zone === "battlefield" && o.owner === 0)!.id;
  await open(page, s);
  const pick = modal(page);
  // Both are Aura or Equipment cards in your graveyard.
  await expect(pick.locator(`[data-pick="${splitter}"]`)).toHaveCount(1);
  await pick.locator(`[data-pick="${strength}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[strength]!.zone === "battlefield");
  expect(after.objects[strength]!.attachedTo).toBe(ink);
  expect(after.objects[splitter]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
