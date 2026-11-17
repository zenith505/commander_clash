// Round 386: Parallel Thoughts' "Put the top card of the exiled pile into your hand instead" button when you'd draw,
// Fabrication Foundry's X and its pick of artifacts with that total mana value, and Memory Vessel's exiled cards played
// instead of the hand.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil, seat } from "./ui";

test("Parallel Thoughts: search seven cards for its pile; Vision Skeins's first draw takes the pile's top card, the second is drawn", async ({ page }) => {
  const s = scene({ hand: ["Parallel Thoughts", "Vision Skeins"], board: LANDS, library: ["Hill Giant", "Grizzly Bears", "Llanowar Elves", "Gray Ogre", "Craw Wurm", "White Knight", "Sol Ring"] });
  const thoughts = one(s, "Parallel Thoughts");
  const picks = ["Hill Giant", "Grizzly Bears", "Llanowar Elves", "Gray Ogre", "Craw Wurm", "White Knight", "Sol Ring"].map((n) => one(s, n));
  await open(page, s);
  await card(page, "Parallel Thoughts", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("Parallel Thoughts: search your library for 7 cards");
  for (const id of picks) await pick.locator(`[data-pick="${id}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const exiled = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[picks[0]!]!.zone === "exile");
  const pile = exiled.linkedExile![`${thoughts}@${exiled.objects[thoughts]!.zoneChanges ?? 0}`]!.map((l) => l.id);
  expect(pile).toHaveLength(7);
  await card(page, "Vision Skeins", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "drawInstead" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Replace this draw");
  await bar.getByRole("button", { name: /Put the top card of the exiled pile into your hand instead \(7 cards left/ }).click();
  const second = await resolveUntil(page, (st) => st.pending?.kind === "drawInstead" && st.pending.player === 0 && st.objects[pile[0]!]!.zone === "hand");
  expect(second.objects[pile[1]!]!.zone).toBe("exile");
  await expect(bar.getByRole("button", { name: /6 cards left/ })).toBeVisible();
  const top = second.players[0]!.library[0]!;
  await bar.getByRole("button", { name: "Draw the card" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[top]!.zone === "hand");
  // The pile's top card and the library's.
  expect(after.players[0]!.hand).toHaveLength(2);
  expect(after.objects[pile[1]!]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

test("Fabrication Foundry: X = 3, return Commander's Sphere (not Solemn Simulacrum), exile Sol Ring and Mind Stone (1 + 2)", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Fabrication Foundry", "Sol Ring", "Mind Stone", "Arcane Signet"], yard: ["Commander's Sphere", "Solemn Simulacrum"] });
  const [foundry, ring, stone, signet, sphere, solemn] = ["Fabrication Foundry", "Sol Ring", "Mind Stone", "Arcane Signet", "Commander's Sphere", "Solemn Simulacrum"].map((n) => one(s, n)) as [string, string, string, string, string, string];
  await open(page, s);
  await page.locator(`[data-obj="${foundry}"]`).first().click();
  await menu(page).locator("button", { hasText: "Return target artifact card" }).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("exile one or more other artifacts you control with total mana value X");
  await x.getByLabel("X", { exact: true }).fill("3");
  await x.getByRole("button", { name: "X = 3" }).click();
  // Solemn Simulacrum's mana value is 4, more than X.
  await expect(page.locator(`[data-pick="${solemn}"]`)).toHaveCount(0);
  await page.locator(`[data-pick="${sphere}"]`).click();
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("exile one or more other artifacts you control with total mana value 3");
  await page.locator(`[data-obj="${ring}"]`).first().click();
  await expect(bar).toContainText("total mana value 1 of 3");
  const done = bar.getByRole("button", { name: "Exile and activate" });
  await expect(done).toBeDisabled();
  await page.locator(`[data-obj="${stone}"]`).first().click();
  await expect(bar).toContainText("total mana value 3 of 3");
  await done.click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[sphere]!.zone === "battlefield");
  expect(after.objects[ring]!.zone).toBe("exile");
  expect(after.objects[stone]!.zone).toBe("exile");
  expect(after.objects[signet]!.zone).toBe("battlefield");
  expect(after.objects[solemn]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Memory Vessel: each player exiles seven cards; your Hill Giant in hand can't be cast, the cards you exiled can be played", async ({ page }) => {
  const s = scene({ hand: ["Hill Giant"], board: [...LANDS, "Memory Vessel"], library: ["Grizzly Bears", "Llanowar Elves", "Gray Ogre", "Craw Wurm", "White Knight", "Sol Ring", "Mind Stone"] });
  const vessel = one(s, "Memory Vessel");
  const giant = one(s, "Hill Giant");
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await expect(page.locator(`[data-obj="${giant}"]`).first()).toHaveClass(/playable/);
  await page.locator(`[data-obj="${vessel}"]`).first().click();
  await menu(page).locator("button", { hasText: "Each player exiles the top seven cards" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "exile");
  expect(after.objects[vessel]!.zone).toBe("exile");
  expect(after.objects[bears]!.mayPlay).toMatchObject({ player: 0, until: "yourNextTurn" });
  expect(after.handPlayBansUntil).toEqual([{ controller: 0, source: "Memory Vessel" }]);
  await expect(page.locator(`[data-obj="${giant}"]`).first()).not.toHaveClass(/playable/);
  // Your exile: the seven cards, some of them playable now (Grizzly Bears, Llanowar Elves, Sol Ring ...).
  await seat(page, 0).locator(".zone", { hasText: "Exile" }).click();
  await expect(modal(page).locator(".card.playable").first()).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});
