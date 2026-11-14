// Round 370: Bre of Clan Stoutarm's free cast at your end step after you gained life; Knight-Errant of Eos's look at
// the top six for creature cards no bigger than the creatures that convoked it; and Chandra, Heart of Fire's −9 search of
// graveyard and library for red instant and sorcery cards.
import { expect, test } from "@playwright/test";
import { applyAction } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, menu, modal, resolveUntil } from "./ui";

test("Bre of Clan Stoutarm: 4 life gained this turn, Hill Giant is found at your end step and cast for free", async ({ page }) => {
  const s0 = scene({ board: ["Bre of Clan Stoutarm"], library: ["Forest", "Hill Giant"] });
  const giant = one(s0, "Hill Giant");
  ((s0.turnLog ??= {}).lifeGained ??= {})[0] = 4;
  const s = playUntil(s0, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Bre of Clan Stoutarm: cast Hill Giant without paying its mana cost?");
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[giant]!.controller).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Knight-Errant of Eos: convoked by three Grizzly Bears, you reveal Gray Ogre from the top six; Hill Giant can't be taken", async ({ page }) => {
  let s = scene({ hand: ["Knight-Errant of Eos"], board: ["Grizzly Bears", "Grizzly Bears", "Grizzly Bears"], library: ["Gray Ogre", "Hill Giant", "Forest", "Forest", "Forest", "Forest"] });
  const [knight, ogre, giant] = [one(s, "Knight-Errant of Eos"), one(s, "Gray Ogre"), one(s, "Hill Giant")];
  s.players[0]!.manaPool.W = 2;
  s = applyAction(s, { type: "castSpell", player: 0, objectId: knight, convoke: idsOf(s, "Grizzly Bears", "battlefield", 0) });
  s = playUntil(s, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  await open(page, s);
  const pick = modal(page);
  // Shown among the six looked at, but too big to take (X is 3).
  await expect(pick.locator(`[data-pick="${giant}"]`)).toHaveClass(/\bdim\b/);
  await pick.locator(`[data-pick="${ogre}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ogre]!.zone === "hand");
  expect(after.objects[giant]!.zone).toBe("library");
  expect(after.objects[knight]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Chandra, Heart of Fire: −9 finds Shock in your graveyard and Lava Axe in your library, exiles them and adds six {R}", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Chandra, Heart of Fire"], yard: ["Shock", "Divination"], library: ["Lava Axe"] });
  const [chandra, shock, axe, div] = [one(s, "Chandra, Heart of Fire"), one(s, "Shock"), one(s, "Lava Axe"), one(s, "Divination")];
  s.objects[chandra]!.counters.loyalty = 9;
  await open(page, s);
  await page.locator(`[data-obj="${chandra}"]`).click();
  await menu(page).locator("button", { hasText: "Search your graveyard and library" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${div}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${shock}"]`).click();
  await pick.locator(`[data-pick="${axe}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[axe]!.zone === "exile");
  expect(after.objects[shock]!.zone).toBe("exile");
  expect(after.objects[axe]!.mayPlay).toMatchObject({ player: 0, until: "thisTurn", castOnly: true });
  expect(after.players[0]!.manaPool.R).toBe(6);
  expect(after.objects[chandra]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
