// Show and Tell: you pick a card from your hand without the others seeing it, then everyone's picks enter together.
// Jungle Wayfinder: "each player may search" asks you whether to search. Quicksilver Wall: an opponent's ability any
// player may activate opens a menu when you click it. Argothian Wurm: "any player may sacrifice a land. If a player
// does, ..." asks you, its controller, first.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Show and Tell: pick a card from your hand; it enters with the others' picks", async ({ page }) => {
  const s = scene({ hand: ["Show and Tell", "Hill Giant", "Shock"], board: LANDS }, [{ hand: ["Grizzly Bears"] }]);
  const giant = one(s, "Hill Giant");
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Show and Tell", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  await expect(modal(page)).toContainText("Your hand");
  await expect(modal(page)).toContainText("an artifact, creature, enchantment, or land card");
  await modal(page).locator(`[data-pick="${giant}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.triggerQueue.length === 0);
  expect(after.objects[giant]!.zone).toBe("battlefield");
  // Ana's bot put its Grizzly Bears in too, under its own control.
  expect(after.objects[bears]!).toMatchObject({ zone: "battlefield", controller: 1 });
  expect(pageErrors(page)).toEqual([]);
});

test("Jungle Wayfinder: choose to search, then pick the basic land", async ({ page }) => {
  const s = scene({ hand: ["Jungle Wayfinder"], board: LANDS, library: ["Forest"] });
  const forest = s.players[0]!.library[0]!;
  await open(page, s);
  await card(page, "Jungle Wayfinder", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  await expect(controls(page)).toContainText(/search your library for a basic land card/i);
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await expect(modal(page)).toContainText("a basic land card");
  await modal(page).locator(`[data-pick="${forest}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.triggerQueue.length === 0);
  expect(after.objects[forest]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Quicksilver Wall: activate an opponent's ability any player may activate", async ({ page }) => {
  const s = scene({ board: LANDS }, [{ board: ["Quicksilver Wall"] }]);
  const wall = one(s, "Quicksilver Wall");
  await open(page, s);
  await card(page, "Quicksilver Wall", s).click();
  await expect(menu(page)).toContainText("Quicksilver Wall");
  await menu(page).getByRole("button", { name: /Return Quicksilver Wall to its owner's hand/ }).click();
  const after = await resolveUntil(page, (st) => st.objects[wall]!.zone !== "battlefield");
  expect(after.objects[wall]!.zone).toBe("hand");
  expect(after.players[1]!.hand).toContain(wall);
  expect(pageErrors(page)).toEqual([]);
});

test("Argothian Wurm: any player may sacrifice a land; you decline and it stays", async ({ page }) => {
  const s = scene({ hand: ["Argothian Wurm"], board: LANDS });
  const wurm = one(s, "Argothian Wurm");
  await open(page, s);
  await card(page, "Argothian Wurm", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "punisher");
  const bar = controls(page);
  await expect(bar).toContainText("Sacrifice a land? If anyone does, put Argothian Wurm on top of its owner's library.");
  await expect(bar.getByRole("button", { name: "Sacrifice a land" })).toHaveCount(1);
  await bar.getByRole("button", { name: "Don't" }).click();
  // The bots have no lands: they aren't asked.
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.triggerQueue.length === 0);
  expect(after.objects[wurm]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
