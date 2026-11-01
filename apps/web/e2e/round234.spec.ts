// Round 234: Battle for Bretagard's "Choose any number of artifact tokens and/or creature tokens you control with
// different names" picker, The Capitoline Triad's cost ("Exile any number of historic cards from your graveyard with
// total mana value 30 or greater"), and The Horus Heresy's "Starting with you, each player chooses a creature".
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, scene } from "./scene";
import { controls, menu, modal, resolveUntil } from "./ui";

test("Battle for Bretagard III: pick tokens with different names, then a copy of each", async ({ page }) => {
  const s = scene({ board: ["Battle for Bretagard"], tokens: ["Treasure", "Clue", "Food"] }, [], { step: "upkeep" });
  const saga = one(s, "Battle for Bretagard");
  s.objects[saga]!.counters.lore = 2;
  const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken);
  const name = (id: string) => s.cards[s.objects[id]!.cardId]!.name;
  const treasure = tokens.find((id) => name(id).startsWith("Treasure"))!, clue = tokens.find((id) => name(id).startsWith("Clue"))!;
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("click any number of artifact and/or creature tokens you control with different names, then choose them.");
  await page.locator(`[data-obj="${treasure}"]`).first().click();
  await page.locator(`[data-obj="${clue}"]`).first().click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[saga]!.zone === "graveyard");
  const count = (n: string) => after.battlefield.filter((id) => after.objects[id]!.isToken && after.cards[after.objects[id]!.cardId]!.name.startsWith(n)).length;
  expect([count("Treasure"), count("Clue"), count("Food")]).toEqual([2, 2, 1]);
  expect(pageErrors(page)).toEqual([]);
});

test("The Capitoline Triad: exile historic cards with total mana value 30 or more for its emblem", async ({ page }) => {
  const s = scene({ board: ["The Capitoline Triad"], yard: ["Blightsteel Colossus", "Darksteel Colossus", "Myr Battlesphere", "Craw Wurm"] });
  const triad = one(s, "The Capitoline Triad"), blight = one(s, "Blightsteel Colossus"), dark = one(s, "Darksteel Colossus"), sphere = one(s, "Myr Battlesphere"), wurm = one(s, "Craw Wurm");
  await open(page, s);
  await page.locator(`[data-obj="${triad}"]`).click();
  await menu(page).getByRole("button", { name: /historic cards/ }).click();
  const pick = modal(page);
  await expect(pick).toContainText("The Capitoline Triad: exile historic cards from your graveyard with total mana value 30 or more");
  // Craw Wurm isn't historic: not offered.
  await expect(pick.locator(`[data-pick="${wurm}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${blight}"]`).click();
  await pick.locator(`[data-pick="${dark}"]`).click();
  await expect(pick.getByRole("button", { name: "Done" })).toBeDisabled();
  await pick.locator(`[data-pick="${sphere}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.emblems ?? []).length > 0);
  expect([blight, dark, sphere, wurm].map((id) => after.objects[id]!.zone)).toEqual(["exile", "exile", "exile", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});

test("The Horus Heresy III: you choose a creature first (anyone's), then each opponent; each chosen creature is destroyed", async ({ page }) => {
  const s = scene({ board: ["The Horus Heresy", "Grizzly Bears"] }, [{ board: ["Hill Giant"] }, { board: ["Craw Wurm"] }, { board: ["Grizzly Bears"] }], { step: "upkeep" });
  const saga = one(s, "The Horus Heresy"), giant = one(s, "Hill Giant");
  s.objects[saga]!.counters.lore = 2;
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("click a creature (anyone's). The Horus Heresy destroys each creature chosen this way.");
  await page.locator(`[data-obj="${giant}"]`).click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[saga]!.zone === "graveyard");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
