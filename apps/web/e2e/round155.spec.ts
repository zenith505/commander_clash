// Round 155's prompts: Mechtitan Core's "exile four other artifact creatures and/or Vehicles you control" cost, Summon:
// Valefor's chapter I (each opponent chooses a creature with the greatest mana value among theirs), The Deck of Many
// Things' 20 (a creature card from any graveyard) and Flood of Tears' permanent card put from your hand.
import { expect, test } from "@playwright/test";
import { nextRandom, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playWithBots, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

/** The next d20 rolled comes up `value` (the game's seeded random numbers, CR 706.1b). */
function rig(s: GameState, value: number) {
  for (let st = 1; ; st++) {
    if (1 + Math.floor(nextRandom({ rngState: st }) * 20) === value) {
      s.rngState = st;
      return;
    }
  }
}

test("Mechtitan Core: exile it with three Ornithopters and Smuggler's Copter, and Mechtitan, a 10/10 that's all colors, is created", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Mechtitan Core", "Ornithopter", "Ornithopter", "Ornithopter", "Smuggler's Copter", "Grizzly Bears"] });
  const [core, copter, bears] = [one(s, "Mechtitan Core"), one(s, "Smuggler's Copter"), one(s, "Grizzly Bears")];
  const thopters = idsOf(s, "Ornithopter", "battlefield");
  await open(page, s);
  await card(page, "Mechtitan Core", s).click();
  await menu(page).locator("button", { hasText: "Exile Mechtitan Core and four other" }).click();
  const bar = page.locator(".targeting", { hasText: "Mechtitan Core: exile 4 other artifact creatures and/or Vehicles (click them)" });
  await expect(bar).toBeVisible();
  for (const id of thopters) await page.locator(`[data-obj="${id}"]`).first().click();
  await expect(bar.getByRole("button", { name: "Exile and activate" })).toBeDisabled();
  await page.locator(`[data-obj="${copter}"]`).first().click();
  await bar.getByRole("button", { name: "Exile and activate" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => st.cards[st.objects[id]!.cardId]!.name === "Mechtitan"));
  for (const id of [core, copter, ...thopters]) expect(after.objects[id]!.zone).toBe("exile");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Summon: Valefor cast by Ana: you choose between Gray Ogre and Centaur Courser, tied for your greatest mana value", async ({ page }) => {
  let s: GameState = scene({ board: ["Gray Ogre", "Centaur Courser", "Grizzly Bears"] }, [{ hand: ["Summon: Valefor"], board: LANDS }]);
  const [ogre, courser, bears] = [one(s, "Gray Ogre"), one(s, "Centaur Courser"), one(s, "Grizzly Bears")];
  s = playWithBots(s, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  expect((s.pending as { options: string[] }).options.sort()).toEqual([ogre, courser].sort());
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Summon: Valefor");
  await page.locator(`[data-obj="${courser}"]`).first().click();
  await bar.getByRole("button", { name: /^Return/ }).click();
  const after = await resolveUntil(page, (st) => st.objects[courser]!.zone === "hand");
  expect(after.objects[ogre]!.zone).toBe("battlefield");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("The Deck of Many Things rolls a 20: put Ana's Hill Giant from her graveyard onto the battlefield under your control", async ({ page }) => {
  const s = scene({ board: [...LANDS, "The Deck of Many Things"], yard: ["Grizzly Bears"] }, [{ yard: ["Hill Giant"] }], { step: "main2" });
  const [giant, bears] = [one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  expect(s.players[0]!.hand).toHaveLength(0);
  rig(s, 20);
  await open(page, s);
  await card(page, "The Deck of Many Things", s).click();
  await menu(page).locator("button", { hasText: "Roll a d20" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${bears}"]`)).toBeVisible();
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.objects[giant]!.zone === "battlefield" && !st.pending && st.stack.length === 0);
  expect(after.objects[giant]!.controller).toBe(0);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Flood of Tears: four of your nontoken permanents go back, and you put Mind Stone from your hand onto the battlefield", async ({ page }) => {
  const s = scene({ hand: ["Flood of Tears"], board: [...LANDS, "Grizzly Bears", "Gray Ogre", "Mind Stone", "Ornithopter"] }, [{ board: ["Hill Giant"] }]);
  const [stone, giant] = [one(s, "Mind Stone"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Flood of Tears", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await pick.locator(`[data-pick="${stone}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.objects[stone]!.zone === "battlefield" && !st.pending && st.stack.length === 0);
  expect(after.objects[giant]!.zone).toBe("hand");
  expect(after.objects[one(s, "Grizzly Bears")]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});
