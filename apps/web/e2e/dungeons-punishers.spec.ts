// The prompts added in the round after splice: venturing into a dungeon you pick and a room where the arrows branch,
// a punisher's "discard a card, or lose 2 life?", and Mad Wizard's Lair's "cast one of the cards you drew".
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Veteran Dungeoneer and Secret Door: pick a dungeon, then a room, then Veils of Fear's discard-or-lose-life", async ({ page }) => {
  const s = scene({ hand: ["Veteran Dungeoneer", "Grizzly Bears"], board: [...LANDS, "Secret Door"] });
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Veteran Dungeoneer", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  const bar = controls(page);
  await expect(bar).toContainText("venture into which dungeon?");
  await expect(bar.getByRole("button", { name: "Undercity" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Tomb of Annihilation" }).click();
  // Trapped Entry: each player loses 1 life.
  let st = await resolveUntil(page, (x) => x.stack.length === 0 && x.players[0]!.dungeon?.room === 0 && x.players[1]!.life === 39);
  expect(st.players[0]!.life).toBe(39);

  await card(page, "Secret Door", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /Venture/ }).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "venture");
  await expect(bar).toContainText("venture into which room?");
  await bar.getByRole("button", { name: "Veils of Fear" }).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "punisher");
  await expect(bar).toContainText("discard a card, or lose 2 life?");
  await expect(bar.getByRole("button", { name: "Discard a card" })).toHaveCount(1);
  await bar.getByRole("button", { name: "Lose 2 life" }).click();
  st = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.players[0]!.life === 37);
  expect(st.objects[bears]!.zone).toBe("hand");
  // The opponents have no cards in hand, so they lose 2 life too.
  expect([1, 2, 3].map((p) => st.players[p]!.life)).toEqual([37, 37, 37]);
  expect(pageErrors(page)).toEqual([]);
});

test("Mad Wizard's Lair: draw three, then cast one of them without paying its mana cost", async ({ page }) => {
  const s = scene({ hand: ["Divination"], board: [...LANDS, "Secret Door"], library: ["Hill Giant", "Shock", "Island"] });
  s.players[0]!.dungeon = { name: "Dungeon of the Mad Mage", room: 7 }; // Deep Mines
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Secret Door", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /Venture/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromHand");
  const bar = controls(page);
  await expect(bar).toContainText("cast one of the cards you drew without paying its mana cost?");
  await expect(bar.getByRole("button", { name: "Divination" })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "Island" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Hill Giant" }).click();
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[giant]!.zone === "battlefield");
  expect(after.players[0]!.completedDungeons).toEqual(["Dungeon of the Mad Mage"]);
  // Only Secret Door's {4}{U} was paid.
  expect(after.battlefield.filter((id) => after.objects[id]!.controller === 0 && after.objects[id]!.tapped)).toHaveLength(5);
  expect(pageErrors(page)).toEqual([]);
});
