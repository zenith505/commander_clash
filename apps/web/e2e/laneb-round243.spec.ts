// Lane B round B243's prompts: Monastery Raid cast for its freerunning cost {X}{R} (X chosen), Ecological Appreciation's
// search of your library and graveyard for creature cards with different names (an opponent you choose shuffles two back),
// and Serum Powder's "Exile hand" button in the mulligan prompt.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Monastery Raid: after your commander's combat damage, cast for freerunning with X = 3: the top three cards are exiled", async ({ page }) => {
  const s = scene({ hand: ["Monastery Raid"], board: LANDS, library: ["Grizzly Bears", "Hill Giant", "Llanowar Elves", "Craw Wurm"] });
  // A commander of yours dealt combat damage to a player this turn (CR 702.173a).
  s.freerunningThisTurn = [0];
  const [raid, bears, giant, elves, wurm] = ["Monastery Raid", "Grizzly Bears", "Hill Giant", "Llanowar Elves", "Craw Wurm"].map((n) => one(s, n)) as [string, string, string, string, string];
  await open(page, s);
  await card(page, "Monastery Raid", s).click();
  await menu(page).getByRole("button", { name: /^Freerunning/ }).click();
  const x = page.locator(".x-pick");
  await expect(x).toBeVisible();
  await expect(x).toContainText("choose X");
  await x.getByLabel("X", { exact: true }).fill("3");
  await x.getByRole("button", { name: "X = 3" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[raid]!.zone === "graveyard");
  expect([bears, giant, elves].map((id) => after.objects[id]!.zone)).toEqual(["exile", "exile", "exile"]);
  expect(after.objects[wurm]!.zone).toBe("library");
  expect(after.objects[giant]!.mayPlay?.player).toBe(0);
  // {3}{R}: four lands.
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped)).toHaveLength(4);
  expect(pageErrors(page)).toEqual([]);
});

test("Ecological Appreciation: X = 2, one card of each name from your library and graveyard; Ana shuffles two back, the third enters", async ({ page }) => {
  const s = scene({ hand: ["Ecological Appreciation"], board: LANDS, library: ["Grizzly Bears", "Llanowar Elves", "Craw Wurm"], yard: ["Grizzly Bears", "Elvish Mystic"] });
  const eco = one(s, "Ecological Appreciation");
  const libBears = idsOf(s, "Grizzly Bears", "library", 0)[0]!;
  const yardBears = idsOf(s, "Grizzly Bears", "graveyard", 0)[0]!;
  const [elves, mystic, wurm] = [one(s, "Llanowar Elves"), one(s, "Elvish Mystic"), one(s, "Craw Wurm")];
  await open(page, s);
  await card(page, "Ecological Appreciation", s).click();
  const x = page.locator(".x-pick");
  await expect(x).toBeVisible();
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("Ecological Appreciation: search your library and graveyard for up to 4 creature cards");
  await expect(pick).toContainText("Each must have a different name.");
  // The two Grizzly Bears are apart, each marked with its zone.
  await expect(pick.locator(`[data-pick="${yardBears}"]`)).toContainText("in your graveyard");
  await expect(pick.locator(`[data-pick="${libBears}"]`)).toContainText("in your library");
  // Mana value 2 or less: no Craw Wurm.
  await expect(pick.locator(`[data-pick="${wurm}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${yardBears}"]`).click();
  // The library's Grizzly Bears has the same name: it can't join.
  await expect(pick.locator(`[data-pick="${libBears}"]`)).toHaveClass(/dim/);
  await pick.locator(`[data-pick="${elves}"]`).click();
  await pick.locator(`[data-pick="${mystic}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "opponent" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Ana" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[eco]!.zone === "exile");
  const zones = [yardBears, elves, mystic].map((id) => after.objects[id]!.zone);
  expect(zones.filter((z) => z === "library")).toHaveLength(2);
  expect(zones.filter((z) => z === "battlefield")).toHaveLength(1);
  expect(after.objects[libBears]!.zone).toBe("library");
  expect(pageErrors(page)).toEqual([]);
});

test("Serum Powder: in your opening hand, exile your hand and draw seven, then keep", async ({ page }) => {
  const s = scene({ hand: ["Serum Powder"] }, [], { mulligans: true });
  const powder = one(s, "Serum Powder");
  const hand = [...s.players[0]!.hand];
  await open(page, s);
  const bar = controls(page);
  const button = bar.getByRole("button", { name: "Exile hand (Serum Powder)" });
  await expect(button).toBeVisible();
  await button.click();
  const now = await resolveUntil(page, (st) => st.objects[powder]!.zone === "exile" && st.players[0]!.hand.length === 7);
  expect(hand.every((id) => now.objects[id]!.zone === "exile")).toBe(true);
  expect(now.players[0]!.hand).toHaveLength(7);
  expect(now.pending).toMatchObject({ kind: "mulligan", player: 0, taken: 0 });
  // Then you declare: no second exile, and Keep starts the game.
  await expect(button).toHaveCount(0);
  await bar.getByRole("button", { name: "Keep" }).click();
  await expect.poll(async () => (await state(page)).mulligans ?? null).toBeNull();
  expect(pageErrors(page)).toEqual([]);
});
